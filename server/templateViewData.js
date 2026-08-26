// ═══════════════════════════════════════════════════════
// CORRESPONDANCE CALCUL → VARIABLES DE GABARIT
//
// Le moteur de calcul produit ses résultats en camelCase (`salaireBase`,
// `brutImposable`), les gabarits reconstruits depuis les modèles clients
// emploient le snake_case du lexique métier (`salaire_base`, `net_imposable`).
// Sans cette couche, deux défauts se produisaient :
//
//  1. Les rubriques du gabarit restaient VIDES, faute de trouver leur variable.
//  2. Pire : `{salaire_base}` retombait sur la valeur du CONTRAT tandis que le
//     brut, lui, venait du calcul proratisé. Le bulletin affichait alors
//     200 000 + 30 000 avec un brut de 299 333 — il ne s'additionnait pas.
//
// Règle : une ligne de bulletin affiche ce qui est RÉELLEMENT PAYÉ. Les valeurs
// calculées ont donc toujours priorité sur les valeurs contractuelles.
// ═══════════════════════════════════════════════════════

const lexicon = require('./docengine/detect/lexicon');

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** Retire accents et ponctuation, comme le lexique du moteur de documents. */
function normalize(s) {
    return (s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Mots de liaison, retirés pour obtenir un nom de variable court et lisible. */
const LIAISONS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'd', 'l', 'a', 'au', 'aux', 'sur', 'pour']);

/**
 * Noms de variable possibles pour une prime libre du contrat.
 *
 * Un gabarit peut la désigner de deux façons selon ce que le lexique en a fait :
 * `{prime_fonction}` quand la rubrique est connue, `{champ_prime_de_fonction}`
 * quand elle ne l'était pas et qu'un emplacement provisoire a été créé. On
 * renseigne les deux, l'utilisateur n'a pas à savoir laquelle a été retenue.
 */
function primeFieldNames(libelle) {
    const words = normalize(libelle).split(' ').filter(Boolean);
    if (!words.length) return [];
    const full = words.join('_');
    const short = words.filter(w => !LIAISONS.has(w)).join('_');
    const names = new Set([`champ_${full}`]);
    if (short) names.add(short);
    return [...names];
}

const n = (v) => (Number.isFinite(+v) ? +v : 0);

/**
 * Construit les données de substitution d'un bulletin.
 *
 * @param {object} employee    enregistrement normalisé envoyé au moteur
 * @param {object} calculs     sortie de calculateSinglePayroll
 * @param {object} companyInfo informations de l'entreprise émettrice
 */
function buildViewData(employee = {}, calculs = {}, companyInfo = {}) {
    const salarial = calculs.salarial || {};
    const patronal = calculs.patronal || {};
    const moisNum = parseInt(employee.mois, 10);
    const annee = employee.annee || new Date().getFullYear();

    const view = {
        // Le contrat et la fiche employé d'abord : identité, matricule, poste…
        ...employee,
        // Puis les résultats bruts du calcul, pour les gabarits qui les adressent
        // en camelCase.
        ...calculs,

        // ── Période ──
        mois: employee.mois,
        annee,
        periode: moisNum >= 1 && moisNum <= 12 ? `${MOIS[moisNum - 1]} ${annee}` : (employee.periode || ''),
        date_jour: new Date().toLocaleDateString('fr-FR'),

        // ── Employeur ──
        nom_entreprise: (companyInfo.nom_entreprise || employee.nom_entreprise || 'ENTREPRISE').toUpperCase(),
        adresse: companyInfo.adresse || employee.adresse || '',
        // Un gabarit capturé depuis un PDF ne connaît que l'EMPLACEMENT de son
        // logo (voir templateEngine.injectLogoSlot) : c'est cette valeur qui y
        // est placée au rendu, jamais l'image d'origine du modèle importé.
        logo: companyInfo.logo || null,

        // ── Gains : ce qui est réellement payé, pas le montant contractuel ──
        salaire_base: n(calculs.salaireBase),
        salaire_base_base: n(calculs.salaireBaseMensuel || employee.salaire_base),
        sursalaire: n(calculs.sursalaire),
        prime_anciennete: n(calculs.primeAnciennete),
        prime_transport: n(calculs.primeTransport),
        indemnite_logement: n(calculs.primeLogement),
        prime_logement: n(calculs.primeLogement),
        gratification: n(calculs.gratification),
        heures_sup: n(calculs.montantHeuresSup),
        heures_sup_nb: n(calculs.nbHeuresSup),
        allocation_conges: n(calculs.allocationConges),
        jours_travailles: n(calculs.joursTrav),
        // Le nombre de parts IGR est un quotient familial, pas un montant :
        // il s'affiche avec une décimale (« 2.0 »), jamais formaté en milliers.
        parts_igr: calculs.parts !== undefined ? Number(calculs.parts).toFixed(1) : '',
        parts: calculs.parts !== undefined ? Number(calculs.parts).toFixed(1) : '',
        anciennete: calculs.ancienneteTxt || '',
        type_contrat: employee.type_contrat || '',
        // « Total Salaire Brut (A) » d'un bulletin est le total des gains VERSÉS,
        // primes non imposables comprises. Le moteur distingue les deux : `brut`
        // est l'assiette imposable, `gainsTotaux` la somme réellement perçue.
        // C'est la formule imprimée sur le document qui tranche : « NET À PAYER
        // (D = A – C) ». Seul gainsTotaux la vérifie — 329 333 − 42 102 = 287 231,
        // le net calculé. Avec l'assiette imposable, le bulletin ne s'additionnait
        // pas, à hauteur exacte de la prime de transport.
        brut: n(calculs.gainsTotaux !== undefined ? calculs.gainsTotaux : calculs.brut),
        gains_totaux: n(calculs.gainsTotaux),
        brut_imposable: n(calculs.brutImposable),
        net_imposable: n(calculs.brutImposable),

        // ── Retenues salariales ──
        // Les assiettes vivent DANS l'objet, jamais dans une clé plate contenant
        // un point : {salarial.cnps_base} est résolu par chemin pointé, donc une
        // clé littérale « salarial.cnps_base » n'est jamais trouvée et la colonne
        // « Base » restait vide.
        salarial: {
            ...salarial,
            its: n(salarial.its),
            cn: n(salarial.cn),
            cnps: n(salarial.cnps),
            cmu: n(salarial.cmu),
            ricf: n(salarial.ricf),
            total: n(salarial.total),
            // Chaque cotisation a sa propre assiette.
            cnps_base: n(calculs.baseCNPS),
            its_base: n(salarial.baseITS || calculs.brutImposable),
            cmu_base: n(calculs.totalPersonnesCMU ? calculs.totalPersonnesCMU * 500 : 0),
            total_base: n(calculs.brutImposable)
        },
        sursalaire_base: n(employee.sursalaire),

        // ── Charges patronales ──
        // Le calcul les nomme en camelCase (cnpsRetraite, fdfpTA…) ; les gabarits
        // les désignent par le libellé de leur rubrique. Sans cette table, les
        // lignes T.A.S.P et FDFP restaient vides sur le bulletin.
        patronal: {
            ...patronal,
            cnps: n(patronal.cnpsRetraite),
            retraite: n(patronal.cnpsRetraite),
            prestations_familiales: n(patronal.cnpsPF),
            accident_travail: n(patronal.cnpsAT),
            maternite: n(patronal.cnpsAM),
            cmu: n(patronal.cmu),
            impot: n(patronal.impotEmployeur),
            fdfp_ta: n(patronal.fdfpTA),
            fdfp_fpc: n(patronal.fdfpFPC),
            total: n(patronal.grandTotal),
            // Le plafond des prestations familiales n'est pas l'assiette de la
            // retraite : chaque ligne porte la sienne.
            cnps_base: n(calculs.baseCNPS),
            retraite_base: n(calculs.baseCNPS),
            prestations_familiales_base: n(calculs.baseCNPS_PfAtAm),
            accident_travail_base: n(calculs.baseCNPS_PfAtAm),
            maternite_base: n(calculs.baseCNPS_PfAtAm),
            impot_base: n(calculs.brutImposable),
            fdfp_ta_base: n(calculs.brutImposable),
            fdfp_fpc_base: n(calculs.brutImposable)
        },
        ricf: n(salarial.ricf),

        // ── Résultat ──
        netAPayer: n(calculs.netAPayer),
        net_a_payer: n(calculs.netAPayer)
    };

    // ── Noms canoniques du référentiel ivoirien ──
    // Le moteur de calcul est antérieur à ce référentiel : on expose ses
    // résultats sous les deux nomenclatures plutôt que de renommer partout, ce
    // qui invaliderait tous les gabarits déjà enregistrés.
    Object.assign(view, {
        // Identité
        salarie_nom: view.nom || '',
        salarie_prenoms: view.prenom || '',
        salarie_matricule: view.matricule || '',
        salarie_numero_cnps: view.numero_cnps || view.num_secu || view.num_cnps || '',
        salarie_emploi: view.poste || '',
        salarie_categorie: view.categorie || '',
        salarie_qualification: view.qualification || '',
        salarie_date_embauche: view.date_embauche || '',
        salarie_type_contrat: view.type_contrat || '',
        employeur_raison_sociale: view.nom_entreprise,
        employeur_nom: view.nom_entreprise,
        employeur_adresse: view.adresse || '',
        employeur_numero_cnps: companyInfo.numero_cnps || companyInfo.employeur_numero_cnps || '',
        employeur_numero_contribuable: companyInfo.numero_contribuable || companyInfo.ncc || '',
        employeur_numero_cnam: companyInfo.numero_cnam || '',
        cmu_salariale_base: n(calculs.totalPersonnesCMU ? calculs.totalPersonnesCMU * 500 : 0),
        mois_paie: view.periode,
        date_paiement: view.date_jour,
        devise: 'FCFA',
        nombre_enfants_charge: n(employee.nombre_enfants),
        nombre_parts_fiscales: view.parts_igr,
        anciennete_mois: view.anciennete,

        // Temps de travail
        jours_travailles: n(calculs.joursTrav),
        jours_conges_payes: n(calculs.joursCP),
        jours_absence: n(employee.absences_jours),
        heures_supplementaires: n(calculs.nbHeuresSup),
        taux_horaire: n(calculs.tauxHoraire),

        // Gains
        salaire_base_mensuel: n(calculs.salaireBase),
        salaire_base_mensuel_base: n(calculs.salaireBaseMensuel),
        conges_payes: n(calculs.allocationConges),
        prime_anciennete: n(calculs.primeAnciennete),
        prime_transport: n(calculs.primeTransport),
        // Sur un bulletin réel, la colonne « Base » d'une prime forfaitaire
        // répète simplement son montant (il n'y a pas de taux à lui appliquer).
        prime_transport_base: n(calculs.primeTransport),
        prime_anciennete_base: n(calculs.primeAnciennete),
        indemnite_transport_non_imposable: n(calculs.primeTransport),
        indemnite_logement: n(calculs.primeLogement),
        indemnite_logement_base: n(calculs.primeLogement),
        prime_treizieme_mois: n(calculs.gratification),
        indemnite_depart: n(calculs.indemLicenciement),
        indemnite_depart_negocie: n(calculs.indemTransac),
        indemnite_deces: n(calculs.fraisFuneraires),

        // Retenues salariales
        cnps_salariale: n(salarial.cnps),
        cnps_salariale_montant: n(salarial.cnps),
        cnps_salariale_base: n(calculs.baseCNPS),
        cmu_salariale: n(salarial.cmu),
        cmu_salariale_montant: n(salarial.cmu),
        its_net: n(salarial.its),
        its_net_montant: n(salarial.its),
        its_net_base: n(salarial.baseITS || calculs.brutImposable),
        its_base_imposable: n(salarial.baseITS || calculs.brutImposable),
        reduction_charges_famille: n(salarial.ricf),
        avance_salaire: n(salarial.avance || employee.avance),
        opposition: n(salarial.opposition || employee.opposition),
        retenue_autre: n(salarial.autres || employee.autres_retenues),

        // Charges patronales
        cnps_retraite_patronale: n(patronal.cnpsRetraite),
        cnps_retraite_patronale_montant: n(patronal.cnpsRetraite),
        cnps_retraite_patronale_base: n(calculs.baseCNPS),
        cnps_prestations_familiales_patronale: n(patronal.cnpsPF),
        cnps_prestations_familiales_patronale_base: n(calculs.baseCNPS_PfAtAm),
        cnps_accident_travail_patronale: n(patronal.cnpsAT),
        cnps_accident_travail_patronale_base: n(calculs.baseCNPS_PfAtAm),
        cnps_maternite_patronale: n(patronal.cnpsAM),
        cnps_maternite_patronale_base: n(calculs.baseCNPS_PfAtAm),
        cmu_patronale: n(patronal.cmu),
        cmu_patronale_montant: n(patronal.cmu),
        impot_employeur_patronale: n(patronal.impotEmployeur),
        impot_employeur_patronale_base: n(calculs.brutImposable),
        taxe_apprentissage_patronale: n(patronal.fdfpTA),
        taxe_apprentissage_patronale_base: n(calculs.brutImposable),
        formation_professionnelle_patronale: n(patronal.fdfpFPC),
        formation_professionnelle_patronale_base: n(calculs.brutImposable),

        // Totaux
        total_gains_bruts: n(calculs.gainsTotaux),
        brut_social: n(calculs.baseCNPS),
        brut_imposable_its: n(calculs.brutImposable),
        total_retenues_salariales: n(salarial.total),
        net_a_payer: n(calculs.netAPayer),
        total_charges_patronales: n(patronal.grandTotal),
        cout_total_employeur: n(calculs.gainsTotaux) + n(patronal.grandTotal)
    });

    // Chaque prime libre du contrat devient adressable par son propre libellé :
    // c'est ce qui permet à un gabarit reconstruit depuis un modèle client de
    // remplir une rubrique que le lexique ne connaissait pas. On tente d'abord
    // le lexique du moteur de documents (le même qui nomme les rubriques d'un
    // gabarit importé) : c'est lui qui fait foi, sinon « Prime de Fonction »
    // se retrouverait sous un nom (prime_fonction) différent de celui que le
    // gabarit importé attend (indemnite_fonction), et la ligne resterait vide.
    for (const prime of employee.primes || []) {
        const entry = lexicon.lookup(prime.libelle, 'grid');
        if (entry) {
            if (view[entry.variable] === undefined) view[entry.variable] = n(prime.montant);
            // Même remarque que pour prime_transport_base ci-dessus : une prime
            // libre est forfaitaire, sa colonne « Base » vaut son montant.
            if (view[entry.variable + '_base'] === undefined) view[entry.variable + '_base'] = n(prime.montant);
        }
        for (const name of primeFieldNames(prime.libelle)) {
            if (view[name] === undefined) view[name] = n(prime.montant);
        }
    }

    return view;
}

module.exports = { buildViewData, primeFieldNames, MOIS };
