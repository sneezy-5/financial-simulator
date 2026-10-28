// ═══════════════════════════════════════════════════════════════════════════
// DÉCLARATIONS DGI (ITS, FDFP) ET ÉTATS ANNUELS (DISA, livre, récap) — LOGIQUE PURE
//
// Même principe que declarationsService.js (CNPS) : on part de l'historique de
// paie figé (PayslipRecord) et on produit une structure « document » neutre que
// declarationsRendu.js met en page en PDF / Excel / CSV :
//
//   { type, titre, reference, periode, entreprise,
//     blocs: [ { titre, colonnes: [{ libelle, format, align }], lignes: [[…]], total: […] }
//            | { titre, paires: [[libellé, valeur, format]] } ],
//     aPayer: { libelle, montant }, partielle, avertissements, notes, paysage }
//
// Règle des données manquantes inchangée : un `null` n'est jamais un zéro — il
// est exclu, compté, signalé, et le document est marqué `partielle`.
//
// Référence de cohérence : classeur LOGIPAIE (feuilles 24, 25, 29, 30, 33, 34).
// ═══════════════════════════════════════════════════════════════════════════

const { baremeCI } = require('../moteur/paieCI.cjs');
const { MOIS } = require('./declarationsService');

// Les formulaires DGI présentent les contributions sur le « revenu net
// imposable » = 80 % du brut imposable (abattement de 20 %). Le moteur applique
// directement le taux équivalent sur 100 % : CN 1,5 % × 80 % = 1,2 %,
// CE expatrié 11,5 % × 80 % = 9,2 %. Mêmes montants, présentation officielle.
const ABATTEMENT_NET_IMPOSABLE = 0.8;
// Taxe additionnelle à la formation continue : 0,6 % versé chaque mois, 1,2 %
// dû sur l'année — l'écart se régularise une fois par an (LOGIPAIE feuille 33).
const TAUX_FPC_ANNUEL = 0.012;

const estNul = (v) => v === null || v === undefined;
const n = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
const arrondi = (v) => Math.round(v);

const F = { fcfa: 'fcfa', pct: 'pct', txt: 'txt', nb: 'nb' };
const col = (libelle, format = F.fcfa, align) => ({ libelle, format, align: align || (format === F.txt ? 'left' : 'right') });

function enteteEntreprise(e = {}) {
    return {
        raisonSociale: e.raisonSociale || '',
        numeroContribuable: e.numeroContribuable || '',
        numeroEmployeur: e.numeroEmployeur || e.numeroCnps || '',
        serviceAssiette: e.serviceAssiette || '',
        adresse: e.adresse || '',
        telephone: e.telephone || '',
        ville: e.ville || '',
        signataireNom: e.signataireNom || ''
    };
}

function estExpatrie(l) {
    if (l.statutSalarie) return l.statutSalarie === 'expatrie';
    return n(l.ceEmployeur) > 0;
}

/** Brut imposable connu, sinon `null` (jamais 0 par défaut). */
const brutImposableDe = (l) => estNul(l.brutImposable) ? null : n(l.brutImposable);

// ─────────────────────────────────────────────────────────────────────────
// ITS — Déclaration des impôts sur traitements et salaires (LOGIPAIE 24)
// ─────────────────────────────────────────────────────────────────────────
function declarationIts({ entreprise, periode, lignes = [] }) {
    const B = baremeCI(periode.annee, periode.mois);
    const avertissements = [];
    const connues = lignes.filter(l => brutImposableDe(l) !== null);
    const inconnues = lignes.length - connues.length;

    const brutVerse = arrondi(connues.reduce((s, l) => s + n(l.brutTotal), 0));
    const brutImposable = arrondi(connues.reduce((s, l) => s + n(l.brutImposable), 0));
    const nonImposable = brutVerse - brutImposable;
    const netImposable = arrondi(brutImposable * ABATTEMENT_NET_IMPOSABLE);
    const itsRetenu = arrondi(lignes.reduce((s, l) => s + n(l.its), 0));

    const locaux = connues.filter(l => !estExpatrie(l));
    const expats = connues.filter(estExpatrie);
    const netDe = (ls) => arrondi(ls.reduce((s, l) => s + n(l.brutImposable), 0) * ABATTEMENT_NET_IMPOSABLE);
    const fe = B.fiscalEmployeur;
    const tauxForm = (t) => t / ABATTEMENT_NET_IMPOSABLE;

    const contributions = [
        ['Contribution Employeur (CE)', 'Personnel local', locaux.length, netDe(locaux), tauxForm(fe.tauxCELocal)],
        ['', 'Personnel expatrié', expats.length, netDe(expats), tauxForm(fe.tauxCEExpat)],
        ['Contribution Nationale (CN)', 'Personnel local', locaux.length, netDe(locaux), tauxForm(fe.tauxCN)],
        ['', 'Personnel expatrié', expats.length, netDe(expats), tauxForm(fe.tauxCN)]
    ].map(([nature, cat, eff, base, taux]) => [nature, cat, eff, base, taux, arrondi(base * taux)]);
    const totalContributions = contributions.reduce((s, c) => s + c[5], 0);

    if (inconnues) avertissements.push(`${inconnues} bulletin(s) sans brut imposable enregistré (antérieurs au suivi des déclarations) : exclus des bases ; leur ITS retenu reste compté.`);
    const sansStatut = connues.filter(l => !l.statutSalarie && estNul(l.ceEmployeur)).length;
    if (sansStatut) avertissements.push(`${sansStatut} salarié(s) sans statut local / expatrié connu : comptés comme personnel local.`);

    return {
        type: 'its',
        titre: 'Déclaration des impôts sur les traitements et salaires',
        reference: 'Articles 115 et suivants du CGI — DGI',
        periode, entreprise: enteteEntreprise(entreprise),
        blocs: [
            {
                titre: '02 — Détermination de l’assiette',
                colonnes: [col('Traitements et salaires', F.txt), col('Effectif', F.nb), col('Montant')],
                lignes: [
                    ['Rémunérations versées (brut total)', connues.length, brutVerse],
                    ['Indemnités non imposables (transport, logement…)', '', nonImposable],
                    ['Montant total brut imposable', connues.length, brutImposable],
                    ['Revenu net imposable (brut imposable × 80 %)', connues.length, netImposable]
                ]
            },
            {
                titre: '03-1 — Impôts retenus aux salariés',
                colonnes: [col('Nature', F.txt), col('Base (net imposable)'), col('Montant retenu')],
                lignes: [['ITS — Impôt sur traitements et salaires', netImposable, itsRetenu]]
            },
            {
                titre: '03-2 — Contributions à la charge de l’employeur',
                colonnes: [col('Nature', F.txt), col('Catégorie', F.txt), col('Effectif', F.nb), col('Revenu net imposable'), col('Taux', F.pct), col('Montant')],
                lignes: contributions,
                total: ['TOTAL CONTRIBUTIONS EMPLOYEUR', '', '', '', '', totalContributions]
            }
        ],
        aPayer: { libelle: 'MONTANT TOTAL À PAYER (ITS + contributions employeur)', montant: itsRetenu + totalContributions },
        notes: ['Les taux CE / CN s’appliquent au revenu net imposable (80 % du brut) : 1,5 % × 80 % = 1,2 % du brut, 11,5 % × 80 % = 9,2 %.'],
        partielle: inconnues > 0,
        avertissements
    };
}

// ─────────────────────────────────────────────────────────────────────────
// FDFP — Taxe d’apprentissage + taxe additionnelle formation continue (LOGIPAIE 25)
// ─────────────────────────────────────────────────────────────────────────
function declarationFdfp({ entreprise, periode, lignes = [] }) {
    const B = baremeCI(periode.annee, periode.mois);
    const connues = lignes.filter(l => brutImposableDe(l) !== null);
    const inconnues = lignes.length - connues.length;
    const base = arrondi(connues.reduce((s, l) => s + n(l.brutImposable), 0));
    const ta = arrondi(base * B.fiscalEmployeur.tauxFdfpTA);
    const fpc = arrondi(base * B.fiscalEmployeur.tauxFdfpFPC);

    return {
        type: 'fdfp',
        titre: 'Taxe d’apprentissage et taxe additionnelle à la formation continue',
        reference: 'Articles 143 et suivants du CGI — versement FDFP',
        periode, entreprise: enteteEntreprise(entreprise),
        blocs: [
            { titre: '2.1 — Effectif', paires: [['Effectif des salariés', connues.length, F.nb]] },
            {
                titre: '2.2 — Détermination des taxes',
                colonnes: [col('Nature des taxes', F.txt), col('Rémunérations brutes'), col('Taux', F.pct), col('Montant')],
                lignes: [
                    ['Taxe d’apprentissage (TA)', base, B.fiscalEmployeur.tauxFdfpTA, ta],
                    ['Taxe additionnelle à la formation continue (TFC)', base, B.fiscalEmployeur.tauxFdfpFPC, fpc]
                ],
                total: ['TOTAL FDFP', '', '', ta + fpc]
            }
        ],
        aPayer: { libelle: 'MONTANT À PAYER (FDFP)', montant: ta + fpc },
        notes: ['TA et TFC font l’objet de deux règlements distincts.'],
        partielle: inconnues > 0,
        avertissements: inconnues ? [`${inconnues} bulletin(s) sans brut imposable enregistré : exclus de la base.`] : []
    };
}

// ─────────────────────────────────────────────────────────────────────────
// Annuel : regroupement par salarié
// ─────────────────────────────────────────────────────────────────────────
function cleSalarie(l) {
    return (l.numeroCnps && `cnps:${l.numeroCnps}`)
        || (l.matricule && `mat:${l.matricule}`)
        || `nom:${(l.nom || '').trim().toUpperCase()}|${(l.prenom || '').trim().toUpperCase()}`;
}

function parSalarie(lignes) {
    const map = new Map();
    for (const l of lignes) {
        const k = cleSalarie(l);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(l);
    }
    return [...map.values()]
        .map(ls => ls.sort((a, b) => (a.mois || 0) - (b.mois || 0)))
        .sort((a, b) => `${a[0].nom} ${a[0].prenom}`.localeCompare(`${b[0].nom} ${b[0].prenom}`));
}

/** Somme d'un champ sur les lignes d'un salarié ; `null` si TOUTES sont inconnues. */
function somme(ls, champ) {
    let total = 0, connu = false;
    for (const l of ls) if (!estNul(l[champ])) { total += n(l[champ]); connu = true; }
    return connu ? arrondi(total) : null;
}

const dernier = (ls, champ) => { for (let i = ls.length - 1; i >= 0; i--) if (!estNul(ls[i][champ]) && ls[i][champ] !== '') return ls[i][champ]; return ''; };

// ─────────────────────────────────────────────────────────────────────────
// DISA — Déclaration individuelle des salaires annuels, CNPS (LOGIPAIE 34)
// ─────────────────────────────────────────────────────────────────────────
function disa({ entreprise, periode, lignes = [] }) {
    const avertissements = [];
    let incomplets = 0, sansCnps = 0;
    const salaries = parSalarie(lignes).map((ls, i) => {
        const l = ls[ls.length - 1];
        const retraite = somme(ls, 'baseCnpsRetraite');
        const pfAt = somme(ls, 'baseCnpsPfAt');
        const brut = somme(ls, 'brutImposable') ?? somme(ls, 'brutTotal');
        if (retraite === null || pfAt === null || ls.some(x => estNul(x.baseCnpsRetraite))) incomplets++;
        if (!l.numeroCnps) sansCnps++;
        return [
            i + 1, l.nom || '', l.prenom || '', l.numeroCnps || '', dernier(ls, 'anneeNaissance'),
            dernier(ls, 'dateEmbauche'), dernier(ls, 'dateDepart'), l.typeSalarie || 'M',
            brut ?? 0, ls.length, pfAt ?? 0, retraite ?? 0, '123'
        ];
    });
    const total = (idx) => salaries.reduce((s, x) => s + n(x[idx]), 0);

    if (incomplets) avertissements.push(`${incomplets} salarié(s) avec des mois sans assiettes CNPS enregistrées (bulletins antérieurs au suivi des déclarations) : assiettes sous-estimées.`);
    if (sansCnps) avertissements.push(`${sansCnps} salarié(s) sans numéro CNPS.`);

    return {
        type: 'disa',
        titre: 'DISA — Déclaration individuelle des salaires annuels',
        reference: `CNPS — exercice ${periode.annee}`,
        periode, entreprise: enteteEntreprise(entreprise), paysage: true,
        blocs: [{
            titre: `Salariés de l’exercice ${periode.annee}`,
            colonnes: [col('N°', F.nb), col('Nom', F.txt), col('Prénoms', F.txt), col('N° CNPS', F.txt), col('Né(e)', F.txt), col('Embauche', F.txt),
                col('Départ', F.txt), col('Type', F.txt), col('Salaire brut'), col('Durée (mois)', F.nb), col('Assiette PF/AT'), col('Assiette retraite'), col('Régime', F.txt)],
            lignes: salaries,
            total: [`TOTAL — ${salaries.length} salarié(s)`, '', '', '', '', '', '', '', total(8), '', total(10), total(11), '']
        }],
        notes: ['Régime 123 : 1 = Retraite · 2 = Accidents du travail · 3 = Prestations familiales + Assurance maternité.', 'Aide à la saisie de la DISA sur e-CNPS.'],
        partielle: incomplets > 0 || sansCnps > 0,
        avertissements
    };
}

// ─────────────────────────────────────────────────────────────────────────
// Ventilation d'un bulletin enregistré (colonnes du livre de paie / récap)
// ─────────────────────────────────────────────────────────────────────────
function ventiler(l) {
    const brutTotal = n(l.brutTotal);
    const brutImp = estNul(l.brutImposable) ? null : n(l.brutImposable);
    const salaire = n(l.salaireBase);
    const hs = n(l.montantHeuresSup);
    const its = n(l.its), cnps = n(l.cnpsSal), cmu = n(l.cmuSal);
    const net = n(l.netAPayer);
    const cnpsPat = n(l.cnpsPF) + n(l.cnpsAM) + n(l.cnpsAT) + n(l.cnpsRetraitePat);
    const fiscalPat = estNul(l.cnEmployeur) ? null : n(l.cnEmployeur) + n(l.ceEmployeur) + n(l.fdfpTA) + n(l.fdfpFPC);
    return {
        salaire, hs,
        autresImposables: brutImp === null ? null : brutImp - salaire - hs,
        brutImposable: brutImp,
        nonImposables: brutImp === null ? null : brutTotal - brutImp,
        brutTotal, its, cnps, cmu,
        // Tout ce qui sépare le brut du net hors ITS/CNPS/CMU : acomptes, avances, prêts…
        autresRetenues: brutTotal - net - its - cnps - cmu,
        net,
        cnpsPat, cmuPat: n(l.cmuPat), fiscalPat,
        coutEmployeur: fiscalPat === null ? null : brutTotal + cnpsPat + n(l.cmuPat) + fiscalPat
    };
}

// [clé, libellé long (lignes du récap), libellé court (colonnes du livre)]
const CHAMPS_VENTILATION = [
    ['salaire', 'Salaire de base', 'Salaire'], ['hs', 'Heures supplémentaires', 'H. sup.'],
    ['autresImposables', 'Primes, congés et autres éléments imposables', 'Primes impos.'],
    ['brutImposable', 'BRUT IMPOSABLE', 'Brut imposable'], ['nonImposables', 'Éléments non imposables (transport, logement…)', 'Non impos.'],
    ['brutTotal', 'TOTAL GAINS', 'Total gains'], ['its', 'ITS', 'ITS'], ['cnps', 'CNPS retraite (salarié)', 'CNPS sal.'],
    ['cmu', 'CMU (salarié)', 'CMU sal.'], ['autresRetenues', 'Acomptes, avances et autres retenues', 'Acomptes et autres'],
    ['net', 'NET À PAYER', 'Net à payer'], ['cnpsPat', 'CNPS patronale', 'CNPS pat.'], ['cmuPat', 'CMU patronale', 'CMU pat.'],
    ['fiscalPat', 'CN / CE / FDFP employeur', 'CN/CE/FDFP'], ['coutEmployeur', 'COÛT TOTAL EMPLOYEUR', 'Coût employeur']
];

// ─────────────────────────────────────────────────────────────────────────
// Livre de paie annuel — une ligne par salarié (LOGIPAIE 29)
// ─────────────────────────────────────────────────────────────────────────
function livrePaieAnnuel({ entreprise, periode, lignes = [] }) {
    let partiel = false;
    const champs = CHAMPS_VENTILATION.filter(([k]) => !['cmuPat'].includes(k));
    const lignesLivre = parSalarie(lignes).map(ls => {
        const v = ls.map(ventiler);
        const tot = champs.map(([k]) => {
            if (v.some(x => x[k] === null)) partiel = true;
            return arrondi(v.reduce((s, x) => s + n(x[k]), 0));
        });
        const l = ls[ls.length - 1];
        return [l.matricule || '', `${l.nom || ''} ${l.prenom || ''}`.trim(), ls.length, ...tot];
    });
    const total = champs.map((_, i) => lignesLivre.reduce((s, r) => s + n(r[3 + i]), 0));

    return {
        type: 'livre-annuel',
        titre: 'Livre de paie annuel',
        reference: `Exercice ${periode.annee}`,
        periode, entreprise: enteteEntreprise(entreprise), paysage: true,
        blocs: [{
            titre: `Cumuls par salarié — ${lignesLivre.length} salarié(s)`,
            colonnes: [col('Mat.', F.txt), col('Nom et prénoms', F.txt), col('Mois', F.nb), ...champs.map(([, , court]) => col(court))],
            lignes: lignesLivre,
            total: ['', 'TOTAL', '', ...total]
        }],
        notes: [],
        partielle: partiel,
        avertissements: partiel ? ['Certains bulletins antérieurs au suivi des déclarations n’ont pas de brut imposable ou de charges fiscales enregistrés : colonnes concernées sous-estimées.'] : []
    };
}

// ─────────────────────────────────────────────────────────────────────────
// Récapitulatif de la masse salariale — mois en colonnes (LOGIPAIE 30)
// ─────────────────────────────────────────────────────────────────────────
function recapMasseSalariale({ entreprise, periode, lignes = [] }) {
    let partiel = false;
    const parMois = Array.from({ length: 13 }, () => []);
    for (const l of lignes) parMois[l.mois || 0].push(ventiler(l));

    const rang = (k) => {
        const mois = [];
        for (let m = 1; m <= 12; m++) {
            if (parMois[m].some(x => x[k] === null)) partiel = true;
            mois.push(arrondi(parMois[m].reduce((s, x) => s + n(x[k]), 0)));
        }
        return [...mois, mois.reduce((a, b) => a + b, 0)];
    };
    const effectifs = [];
    for (let m = 1; m <= 12; m++) effectifs.push(parMois[m].length);

    return {
        type: 'recap-masse',
        titre: 'Récapitulatif de la masse salariale',
        reference: `Exercice ${periode.annee}`,
        periode, entreprise: enteteEntreprise(entreprise), paysage: true,
        blocs: [{
            titre: 'Mois par mois',
            colonnes: [col('Libellés', F.txt), ...MOIS.slice(1).map(m => col(m.slice(0, 4) + '.')), col('TOTAL')],
            lignes: [
                ['Effectif', ...effectifs, Math.max(0, ...effectifs)],
                ...CHAMPS_VENTILATION.map(([k, lib]) => [lib, ...rang(k)])
            ]
        }],
        notes: ['Effectif total = effectif du mois le plus élevé.'],
        partielle: partiel,
        avertissements: partiel ? ['Des bulletins antérieurs au suivi des déclarations n’ont pas de brut imposable ou de charges fiscales enregistrés : lignes concernées sous-estimées.'] : []
    };
}

// ─────────────────────────────────────────────────────────────────────────
// Régularisation annuelle FDFP (LOGIPAIE 33)
// ─────────────────────────────────────────────────────────────────────────
function regulFdfp({ entreprise, periode, lignes = [], engagementsPlansAgrees = 0 }) {
    const B = baremeCI(periode.annee, 12);
    const connues = lignes.filter(l => brutImposableDe(l) !== null);
    const inconnues = lignes.length - connues.length;
    const masse = arrondi(connues.reduce((s, l) => s + n(l.brutImposable), 0));
    const ta = arrondi(masse * B.fiscalEmployeur.tauxFdfpTA);
    const tfcVersee = arrondi(masse * B.fiscalEmployeur.tauxFdfpFPC);
    const tfcAnnuelle = arrondi(masse * TAUX_FPC_ANNUEL);
    const engagements = arrondi(n(engagementsPlansAgrees));
    const solde = tfcAnnuelle - (tfcVersee + engagements);
    const effectif = parSalarie(connues).length;

    return {
        type: 'regul-fdfp',
        titre: 'État récapitulatif annuel TA / TFC — régularisation FDFP',
        reference: `Articles 143 et suivants du CGI — exercice ${periode.annee}`,
        periode, entreprise: enteteEntreprise(entreprise),
        blocs: [
            { titre: '2.1 — Effectif', paires: [['Effectif des salariés sur l’année', effectif, F.nb]] },
            {
                titre: '2.2 — Taxes versées au cours de l’année',
                colonnes: [col('Nature des taxes', F.txt), col('Rémunérations brutes'), col('Taux', F.pct), col('Montant')],
                lignes: [
                    ['Taxe d’apprentissage (TA)', masse, B.fiscalEmployeur.tauxFdfpTA, ta],
                    ['Taxe à la formation continue (TFC)', masse, B.fiscalEmployeur.tauxFdfpFPC, tfcVersee]
                ]
            },
            {
                titre: '3 — Régularisation annuelle de la TFC',
                paires: [
                    ['3.1 Masse salariale annuelle', masse, F.fcfa],
                    ['3.2 Montant annuel de la TFC (3.1 × 1,2 %)', tfcAnnuelle, F.fcfa],
                    ['3.3 TFC versée au cours de l’année', tfcVersee, F.fcfa],
                    ['3.4 Engagements sur plans agréés par le FDFP', engagements, F.fcfa],
                    ['3.6 Versement à effectuer (3.2 - 3.3 - 3.4)', Math.max(0, solde), F.fcfa]
                ]
            }
        ],
        aPayer: { libelle: 'RÉGULARISATION TFC À VERSER', montant: Math.max(0, solde) },
        notes: [
            'La TFC versée est recalculée sur la masse salariale enregistrée (0,6 %) : vérifier qu’elle correspond aux versements mensuels effectifs.',
            solde < 0 ? `Excédent de ${(-solde).toLocaleString('fr-FR')} FCFA (engagements supérieurs au dû).` : ''
        ].filter(Boolean),
        partielle: inconnues > 0,
        avertissements: inconnues ? [`${inconnues} bulletin(s) sans brut imposable enregistré : exclus de la masse salariale.`] : []
    };
}

/** Période annuelle à partir des périodes de paie d'une année. */
function periodeAnnuelle(annee, periodes = []) {
    const mois = periodes.map(p => p.mois).sort((a, b) => a - b);
    return {
        type: 'annuel',
        libelle: `Exercice ${annee}`,
        code: String(annee),
        annee, mois: 12, nbPeriodes: periodes.length,
        moisCouverts: mois
    };
}

module.exports = {
    declarationIts, declarationFdfp,
    disa, livrePaieAnnuel, recapMasseSalariale, regulFdfp,
    periodeAnnuelle, ventiler
};
