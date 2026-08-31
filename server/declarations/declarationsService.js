// ═══════════════════════════════════════════════════════════════════════════
// DÉCLARATIONS SOCIALES / FISCALES — LOGIQUE PURE (Côte d'Ivoire)
//
// Ces fonctions ne rendent RIEN (ni PDF ni Excel) : elles prennent l'historique
// de paie déjà figé (PayslipRecord d'une ou plusieurs périodes) et en tirent une
// structure de déclaration prête à mettre en page.
//
// Règle cardinale sur les données manquantes : un champ `null` (bulletin
// antérieur à l'introduction des colonnes « déclarations ») N'EST PAS un zéro.
// On l'exclut de la somme, on le COMPTE, on émet un avertissement, et la
// déclaration est marquée `partielle`. Jamais de 0 forcé qui fausserait un total.
// ═══════════════════════════════════════════════════════════════════════════

// Taux et plafonds CNPS — Côte d'Ivoire. Alignés sur countryConfig CI et
// payrollService (seul pays où le référentiel LOGIPAIE a été vérifié).
const CI = {
    plafondRetraite: 3375000,
    plafondPfAt: 75000,
    tauxRetraiteTotal: 0.14,   // 7,7 % employeur + 6,3 % salarié — la CNPS déclare le cumul
    tauxPF: 0.05,
    tauxAM: 0.0075,
    tauxAtDefaut: 0.02,        // 2 à 5 % selon le secteur (paramètre entreprise)
};

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const estNul = (v) => v === null || v === undefined;
const nombre = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;

/** Somme d'un champ en ignorant les `null` ; renvoie aussi le nb de trous. */
function sommeConnue(lignes, champ) {
    let total = 0, manquants = 0;
    for (const l of lignes) {
        if (estNul(l[champ])) manquants++;
        else total += nombre(l[champ]);
    }
    return { total: Math.round(total), manquants };
}

/**
 * Agrège 1..n périodes en une entête de déclaration.
 * @param {{mois:number, annee:number}[]} periodes
 */
function agregerPeriodes(periodes) {
    const tri = [...periodes].sort((a, b) => a.annee - b.annee || a.mois - b.mois);
    const p0 = tri[0], pN = tri[tri.length - 1];
    if (tri.length === 1) {
        return {
            type: 'mensuel',
            libelle: `${MOIS[p0.mois]} ${p0.annee}`,
            code: `${p0.annee}/${String(p0.mois).padStart(2, '0')}`,
            mois: p0.mois, annee: p0.annee, nbPeriodes: 1
        };
    }
    return {
        type: 'trimestriel',
        libelle: `${MOIS[p0.mois]} à ${MOIS[pN.mois]} ${pN.annee}`,
        code: `${p0.annee}/${String(p0.mois).padStart(2, '0')}-${String(pN.mois).padStart(2, '0')}`,
        mois: pN.mois, annee: pN.annee, nbPeriodes: tri.length
    };
}

/** Rang de catégorie CNPS d'un salarié mensuel selon son brut. */
function categorieMensuelle(base) {
    if (base <= CI.plafondPfAt) return 'mensuelInf75k';
    if (base <= CI.plafondRetraite) return 'mensuel75kA3375k';
    return 'mensuelSup3375k';
}

const LIBELLE_CATEGORIE = {
    journalierInf3462: 'Horaires / journaliers ≤ 3 462 F par jour',
    journalierSup3462: 'Horaires / journaliers > 3 462 F par jour',
    mensuelInf75k: 'Mensuels ≤ 75 000 F par mois',
    mensuel75kA3375k: 'Mensuels > 75 000 F et ≤ 3 375 000 F par mois',
    mensuelSup3375k: 'Mensuels > 3 375 000 F par mois'
};

/**
 * BORDEREAU CNPS — « Appel de cotisation » (LOGIPAIE feuille 27).
 *
 * @param {object}   opts
 * @param {object}   opts.entreprise  { raisonSociale, numeroCnps, numeroEmployeur, adresse, telephone, codeEtablissement, codeActivite, tauxAtMp, signataireNom, ville }
 * @param {object}   opts.periode     sortie d'agregerPeriodes()
 * @param {object[]} opts.lignes      PayslipRecord[] (toutes périodes confondues)
 */
function bordereauCnps({ entreprise = {}, periode, lignes = [] }) {
    const avertissements = [];
    const tauxAtEntreprise = nombre(entreprise.tauxAtMp) || CI.tauxAtDefaut;

    // Ventilation par catégorie (effectif, base retraite, base PF/AT)
    const cats = {};
    let lignesIncompletes = 0;

    for (const l of lignes) {
        const baseRet = l.baseCnpsRetraite;
        const basePfAt = l.baseCnpsPfAt;
        if (estNul(baseRet) || estNul(basePfAt)) {
            lignesIncompletes++;
            continue; // sans base plafonnée fiable, la ligne ne peut pas être cotisée
        }
        const cat = (l.typeSalarie && l.typeSalarie !== 'M')
            ? (nombre(l.brutImposable) <= CI.plafondPfAt ? 'journalierInf3462' : 'journalierSup3462')
            : categorieMensuelle(nombre(basePfAt) >= CI.plafondPfAt ? nombre(l.brutImposable || baseRet) : nombre(baseRet));
        const c = cats[cat] || (cats[cat] = { categorie: cat, libelle: LIBELLE_CATEGORIE[cat], effectif: 0, baseRetraite: 0, basePfAt: 0 });
        c.effectif++;
        c.baseRetraite += nombre(baseRet);
        c.basePfAt += nombre(basePfAt);
    }

    const categories = Object.values(cats).map(c => ({
        ...c, baseRetraite: Math.round(c.baseRetraite), basePfAt: Math.round(c.basePfAt)
    }));

    const totalBaseRetraite = categories.reduce((s, c) => s + c.baseRetraite, 0);
    const totalBasePfAt = categories.reduce((s, c) => s + c.basePfAt, 0);
    const effectifCotisant = categories.reduce((s, c) => s + c.effectif, 0);

    // AT calculé ligne à ligne (le taux peut varier), fallback taux entreprise.
    let cotisationAT = 0;
    for (const l of lignes) {
        if (estNul(l.baseCnpsPfAt)) continue;
        const t = nombre(l.tauxAtMp) || tauxAtEntreprise;
        cotisationAT += nombre(l.baseCnpsPfAt) * t;
    }

    const totalBrutPaye = sommeConnue(lignes, 'brutTotal');

    const decompte = {
        assuranceMaternite: { base: totalBasePfAt, taux: CI.tauxAM, montant: Math.round(totalBasePfAt * CI.tauxAM) },
        prestationsFamiliales: { base: totalBasePfAt, taux: CI.tauxPF, montant: Math.round(totalBasePfAt * CI.tauxPF) },
        accidentsTravail: { base: totalBasePfAt, taux: tauxAtEntreprise, montant: Math.round(cotisationAT) },
        regimeRetraite: { base: totalBaseRetraite, taux: CI.tauxRetraiteTotal, montant: Math.round(totalBaseRetraite * CI.tauxRetraiteTotal) }
    };
    decompte.total = decompte.assuranceMaternite.montant + decompte.prestationsFamiliales.montant
        + decompte.accidentsTravail.montant + decompte.regimeRetraite.montant;

    if (lignesIncompletes > 0) {
        avertissements.push(
            `${lignesIncompletes} bulletin(s) sans bases CNPS enregistrées (période antérieure au suivi des déclarations) : exclus du calcul des cotisations.`
        );
    }
    if (totalBrutPaye.manquants > 0) {
        avertissements.push(`${totalBrutPaye.manquants} bulletin(s) sans brut enregistré.`);
    }

    return {
        type: 'cnps',
        titre: 'Appel de cotisation CNPS',
        periode,
        entreprise: {
            raisonSociale: entreprise.raisonSociale || '',
            numeroEmployeur: entreprise.numeroEmployeur || entreprise.numeroCnps || '',
            numeroCnps: entreprise.numeroCnps || '',
            codeEtablissement: entreprise.codeEtablissement || '',
            codeActivite: entreprise.codeActivite || '',
            adresse: entreprise.adresse || '',
            telephone: entreprise.telephone || '',
            ville: entreprise.ville || '',
            signataireNom: entreprise.signataireNom || ''
        },
        effectifTotal: lignes.length,
        effectifCotisant,
        totalBrutPaye: totalBrutPaye.total,
        categories,
        totaux: { baseRetraite: totalBaseRetraite, basePfAt: totalBasePfAt },
        decompte,
        partielle: lignesIncompletes > 0,
        lignesIncompletes,
        avertissements
    };
}

/**
 * LISTE NOMINATIVE CNPS (LOGIPAIE feuille 26) — annexe du bordereau.
 * Une ligne par salarié : identité, dates, type, durée, brut, branches cotisées.
 */
function listeNominativeCnps({ entreprise = {}, periode, lignes = [] }) {
    const avertissements = [];
    let sansAnneeNaiss = 0, sansEmbauche = 0, sansNumeroCnps = 0;

    const salaries = lignes.map((l, i) => {
        if (estNul(l.anneeNaissance)) sansAnneeNaiss++;
        if (!l.dateEmbauche) sansEmbauche++;
        if (!l.numeroCnps) sansNumeroCnps++;
        return {
            ordre: i + 1,
            numeroCnps: l.numeroCnps || '',
            nom: l.nom || '',
            prenoms: l.prenom || '',
            anneeNaissance: estNul(l.anneeNaissance) ? '' : l.anneeNaissance,
            dateEmbauche: l.dateEmbauche || '',
            dateDepart: l.dateDepart || '',
            typeSalarie: l.typeSalarie || 'M',
            dureeTravaillee: periode.nbPeriodes || 1,          // en mois
            salaireBrut: estNul(l.brutImposable) ? nombre(l.brutTotal) : nombre(l.brutImposable),
            branchesCotisees: '123'                             // 1 Retraite, 2 AT/MP, 3 PF+AM
        };
    });

    if (sansNumeroCnps) avertissements.push(`${sansNumeroCnps} salarié(s) sans numéro CNPS.`);
    if (sansAnneeNaiss) avertissements.push(`${sansAnneeNaiss} salarié(s) sans année de naissance enregistrée.`);
    if (sansEmbauche) avertissements.push(`${sansEmbauche} salarié(s) sans date d'embauche enregistrée.`);

    return {
        type: 'cnps-liste',
        titre: 'Liste nominative des cotisations CNPS',
        periode,
        entreprise: {
            raisonSociale: entreprise.raisonSociale || '',
            numeroEmployeur: entreprise.numeroEmployeur || entreprise.numeroCnps || ''
        },
        salaries,
        total: {
            effectif: salaries.length,
            salaireBrut: salaries.reduce((s, x) => s + x.salaireBrut, 0)
        },
        partielle: sansAnneeNaiss > 0 || sansEmbauche > 0 || sansNumeroCnps > 0,
        avertissements
    };
}

module.exports = {
    CI, MOIS,
    agregerPeriodes,
    bordereauCnps,
    listeNominativeCnps
};
