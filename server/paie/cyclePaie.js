// ═══════════════════════════════════════════════════════════════════════════
// CYCLE DE PAIE — statuts d'une période et contrôles avant validation / clôture
//
//   draft (Brouillon)  ──valider──▶  validated (Validée)  ──clôturer──▶  closed (Clôturée)
//        ▲                                 │                                   │
//        └──────── régénération ───────────┘◀──────── rouvrir (motif) ─────────┘
//
// Une période clôturée est figée : plus de régénération par lot ni de bulletin
// individuel sur ce mois. Une erreur se corrige par une régularisation sur le
// mois suivant, ou en rouvrant la période avec un motif (tracé dans l'audit).
// Logique pure : aucune dépendance base de données.
// ═══════════════════════════════════════════════════════════════════════════

const { baremeCI } = require('../moteur/paieCI.cjs');

const STATUTS = { BROUILLON: 'draft', VALIDEE: 'validated', CLOTUREE: 'closed' };
const LIBELLES_STATUT = { draft: 'Brouillon', validated: 'Validée', closed: 'Clôturée' };

// Écart de net d'un mois sur l'autre au-delà duquel on alerte.
const SEUIL_ECART_NET = 0.2;

const TRANSITIONS = {
    valider: { depuis: ['draft'], vers: 'validated' },
    cloturer: { depuis: ['draft', 'validated'], vers: 'closed' },
    rouvrir: { depuis: ['closed', 'validated'], vers: 'draft' }
};

/**
 * Vérifie qu'une action est permise depuis le statut courant.
 * @returns {{ok:true, vers:string} | {ok:false, erreur:string}}
 */
function transition(statutActuel, action, { motif } = {}) {
    const t = TRANSITIONS[action];
    if (!t) return { ok: false, erreur: `Action inconnue : ${action}` };
    const actuel = statutActuel || STATUTS.BROUILLON;
    if (!t.depuis.includes(actuel)) {
        return { ok: false, erreur: `Impossible de « ${action} » une période ${LIBELLES_STATUT[actuel] || actuel}.` };
    }
    if (action === 'rouvrir' && !(motif && String(motif).trim().length >= 5)) {
        return { ok: false, erreur: 'Un motif (5 caractères minimum) est obligatoire pour rouvrir une période.' };
    }
    return { ok: true, vers: t.vers };
}

const cle = (r) => r.numeroCnps || r.matricule || `${(r.nom || '').trim().toUpperCase()}|${(r.prenom || '').trim().toUpperCase()}`;
const nomDe = (r) => `${r.prenom || ''} ${r.nom || ''}`.trim() || r.matricule || '?';
const fcfa = (v) => Math.round(v).toLocaleString('fr-FR');

/**
 * Contrôles d'une période à partir de ses bulletins enregistrés (PayslipRecord).
 *
 * niveau 'bloquant' : empêche la clôture (erreur certaine).
 * niveau 'alerte'   : à vérifier, n'empêche rien.
 * niveau 'info'     : mouvements du mois (entrées / sorties).
 *
 * @param {object} o
 * @param {object[]} o.records     bulletins de la période
 * @param {object[]} [o.precedents] bulletins du mois précédent (comparaison)
 * @param {{mois:number, annee:number}} o.periode
 */
function controlesPeriode({ records = [], precedents = [], periode }) {
    const B = baremeCI(periode.annee, periode.mois);
    const SMIG = B.smig || 75000;
    const anomalies = [];
    const ajouter = (niveau, code, salarie, message) => anomalies.push({ niveau, code, salarie, message });

    if (!records.length) ajouter('bloquant', 'periode_vide', null, 'Aucun bulletin enregistré pour cette période.');

    const vus = new Map();
    for (const r of records) {
        const k = cle(r);
        if (vus.has(k)) ajouter('bloquant', 'doublon', nomDe(r), `${nomDe(r)} apparaît deux fois dans la période.`);
        vus.set(k, r);

        if ((r.netAPayer ?? 0) < 0) ajouter('bloquant', 'net_negatif', nomDe(r), `Net à payer négatif (${fcfa(r.netAPayer)} FCFA) : les retenues dépassent les gains.`);
        else if ((r.netAPayer ?? 0) === 0 && (r.salaireBase ?? 0) > 0) ajouter('alerte', 'net_nul', nomDe(r), 'Net à payer nul malgré un salaire de base.');

        if (!r.numeroCnps) ajouter('alerte', 'sans_cnps', nomDe(r), 'Numéro CNPS manquant (obligatoire pour les déclarations).');

        const moisComplet = (r.joursTravailles ?? 0) >= 26 && !(r.absencesJours > 0);
        if (moisComplet && (r.salaireBase ?? 0) > 0 && r.salaireBase < SMIG) {
            ajouter('alerte', 'sous_smig', nomDe(r), `Salaire de base ${fcfa(r.salaireBase)} FCFA inférieur au SMIG (${fcfa(SMIG)} FCFA) sur un mois complet.`);
        }
    }

    const avant = new Map(precedents.map(r => [cle(r), r]));
    for (const [k, r] of vus) {
        const p = avant.get(k);
        if (!p) { if (precedents.length) ajouter('info', 'entree', nomDe(r), 'Nouveau salarié par rapport au mois précédent.'); continue; }
        const netAvant = p.netAPayer || 0;
        if (netAvant > 0) {
            const ecart = (r.netAPayer - netAvant) / netAvant;
            if (Math.abs(ecart) > SEUIL_ECART_NET) {
                ajouter('alerte', 'ecart_net', nomDe(r), `Net ${ecart > 0 ? 'en hausse' : 'en baisse'} de ${Math.round(Math.abs(ecart) * 100)} % par rapport au mois précédent (${fcfa(netAvant)} → ${fcfa(r.netAPayer)} FCFA).`);
            }
        }
    }
    for (const [k, p] of avant) {
        if (!vus.has(k)) ajouter('info', 'sortie', nomDe(p), 'Présent le mois précédent, absent de cette période (départ ?).');
    }

    const compte = (n) => anomalies.filter(a => a.niveau === n).length;
    return {
        anomalies,
        resume: { bloquants: compte('bloquant'), alertes: compte('alerte'), infos: compte('info'), bulletins: records.length },
        cloturable: compte('bloquant') === 0
    };
}

module.exports = { STATUTS, LIBELLES_STATUT, TRANSITIONS, transition, controlesPeriode, SEUIL_ECART_NET };
