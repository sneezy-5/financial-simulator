// ═══════════════════════════════════════════════════════════════════════════
// ÉTATS COMPTABLES DE PAIE — journal de paie, journal des OD, provision pour
// congés payés, ordre de virement. Logique pure, même format « document » que
// server/declarations/declarationsEtats.js (rendu PDF / Excel / CSV commun).
//
// Le détail par rubrique vient de PayslipRecord.detailPaie (bulletins générés
// depuis la phase 4). Les bulletins plus anciens n'ont que des totaux : ils
// sont passés sur des comptes regroupés et le document est marqué partiel.
// ═══════════════════════════════════════════════════════════════════════════

const { baremeCI } = require('../moteur/paieCI.cjs');
const { planEffectif } = require('./planComptable');
const { ventiler } = require('../declarations/declarationsEtats');

const n = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
const arrondi = (v) => Math.round(v);
const estNul = (v) => v === null || v === undefined;
const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function detailDe(r) {
    if (!r.detailPaie) return null;
    try { return typeof r.detailPaie === 'string' ? JSON.parse(r.detailPaie) : r.detailPaie; } catch { return null; }
}

function entete(e = {}) {
    return {
        raisonSociale: e.raisonSociale || '', numeroContribuable: e.numeroContribuable || '',
        numeroEmployeur: e.numeroEmployeur || '', adresse: e.adresse || '', ville: e.ville || '',
        telephone: e.telephone || '', signataireNom: e.signataireNom || ''
    };
}

const dernierJour = (p) => new Date(p.annee, p.mois, 0);
const dateFr = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const reference = (prefixe, p) => `${prefixe} ${String(p.mois).padStart(2, '0')}/${p.annee}`;

// ─────────────────────────────────────────────────────────────────────────
// Écritures de paie
// ─────────────────────────────────────────────────────────────────────────
/** Montants agrégés de la période, par rubrique comptable. */
function totauxPeriode(lignes) {
    const t = {
        salaires: 0, primes: 0, gratifications: 0, conges: 0, indemnitesRupture: 0, transport: 0, indemnitesNonImposables: 0,
        its: 0, cnpsSalarie: 0, avances: 0, cmuSalarie: 0, autresRetenues: 0, netAPayer: 0,
        contributionsEmployeur: 0, fdfpTA: 0, fdfpTFC: 0, cnpsPatronal: 0, cmuPatronal: 0
    };
    let sansDetail = 0, sansFiscal = 0;
    for (const r of lignes) {
        const d = detailDe(r);
        if (d) {
            const g = d.gains, s = d.retenues;
            t.salaires += g.salaireBase + g.sursalaire + g.heuresSup;
            t.primes += g.primeAnciennete + g.primesImposables;
            t.gratifications += g.gratification;
            t.conges += g.allocationConges;
            t.indemnitesRupture += g.preavis + g.indemLicenciement + g.indemTransac;
            // Le transport entier (exonéré + excédent) est une charge de transport ;
            // son traitement fiscal ne change pas le compte de charge.
            t.transport += g.primeTransport + g.primeTransportImposable;
            t.indemnitesNonImposables += g.primeLogement + g.primesNonImposables + g.fraisFuneraires;
            t.avances += s.acompte + s.avance;
            t.autresRetenues += s.opposition + s.autres;
        } else {
            // Bulletin antérieur : seuls les totaux existent.
            sansDetail++;
            const v = ventiler(r);
            t.salaires += v.salaire + v.hs;
            t.primes += n(v.autresImposables);
            t.indemnitesNonImposables += n(v.nonImposables);
            t.autresRetenues += v.autresRetenues;
        }
        t.its += n(r.its); t.cnpsSalarie += n(r.cnpsSal); t.cmuSalarie += n(r.cmuSal); t.netAPayer += n(r.netAPayer);
        if (estNul(r.cnEmployeur)) sansFiscal++;
        t.contributionsEmployeur += n(r.cnEmployeur) + n(r.ceEmployeur);
        t.fdfpTA += n(r.fdfpTA); t.fdfpTFC += n(r.fdfpFPC);
        t.cnpsPatronal += n(r.cnpsPF) + n(r.cnpsAM) + n(r.cnpsAT) + n(r.cnpsRetraitePat);
        t.cmuPatronal += n(r.cmuPat);
    }
    for (const k of Object.keys(t)) t[k] = arrondi(t[k]);
    return { t, sansDetail, sansFiscal };
}

/**
 * Écritures du journal de paie et du journal des OD (schéma LOGIPAIE feuille 28).
 * @returns {{ ecritures: object[], sansDetail:number, sansFiscal:number }}
 */
function ecrituresPaie({ periode, lignes, comptesPaie }) {
    const { plan, journaux } = planEffectif(comptesPaie);
    const { t, sansDetail, sansFiscal } = totauxPeriode(lignes);
    const date = dateFr(dernierJour(periode));
    const ecritures = [];
    const ajouter = (journal, ref, cle, debit, credit, libelle) => {
        if (!debit && !credit) return;
        ecritures.push({ journal, date, reference: ref, compte: plan[cle].compte, libelle: libelle || plan[cle].libelle, debit: debit || 0, credit: credit || 0 });
    };

    const refPaie = reference('PAIE', periode);
    for (const cle of ['salaires', 'primes', 'gratifications', 'conges', 'indemnitesRupture', 'transport', 'indemnitesNonImposables']) {
        ajouter(journaux.paie, refPaie, cle, t[cle], 0);
    }
    ajouter(journaux.paie, refPaie, 'its', 0, t.its);
    ajouter(journaux.paie, refPaie, 'cnpsSalarie', 0, t.cnpsSalarie);
    ajouter(journaux.paie, refPaie, 'avances', 0, t.avances);
    ajouter(journaux.paie, refPaie, 'cmuSalarie', 0, t.cmuSalarie);
    ajouter(journaux.paie, refPaie, 'autresRetenues', 0, t.autresRetenues);
    ajouter(journaux.paie, refPaie, 'netAPayer', 0, t.netAPayer);

    // OD — ITS et contributions employeur, regroupés au compte de l'État.
    const refIts = reference('ITS', periode);
    ajouter(journaux.od, refIts, 'its', t.its, 0, 'Impôts sur salaires (ITS)');
    ajouter(journaux.od, refIts, 'taxesSalaires', t.contributionsEmployeur, 0);
    ajouter(journaux.od, refIts, 'etatIts', 0, t.its + t.contributionsEmployeur);
    // OD — FDFP.
    const refFdfp = reference('FDFP', periode);
    ajouter(journaux.od, refFdfp, 'fdfpTA', t.fdfpTA, 0);
    ajouter(journaux.od, refFdfp, 'fdfpTFC', t.fdfpTFC, 0);
    ajouter(journaux.od, refFdfp, 'etatFdfp', 0, t.fdfpTA + t.fdfpTFC);
    // OD — CNPS : part patronale + part salariale déjà retenue.
    const refCnps = reference('CNPS', periode);
    ajouter(journaux.od, refCnps, 'chargesCnps', t.cnpsPatronal, 0);
    ajouter(journaux.od, refCnps, 'cnpsSalarie', t.cnpsSalarie, 0);
    ajouter(journaux.od, refCnps, 'cnps', 0, t.cnpsPatronal + t.cnpsSalarie);
    // OD — CMU patronale.
    const refCmu = reference('CMU', periode);
    ajouter(journaux.od, refCmu, 'chargesCmu', t.cmuPatronal, 0);
    ajouter(journaux.od, refCmu, 'cmuSalarie', 0, t.cmuPatronal, 'CMU (part patronale)');

    return { ecritures, journaux, sansDetail, sansFiscal };
}

function blocJournal(titre, ecritures) {
    const debit = ecritures.reduce((s, e) => s + e.debit, 0);
    const credit = ecritures.reduce((s, e) => s + e.credit, 0);
    return {
        titre: `${titre} — ${debit === credit ? 'équilibré' : 'DÉSÉQUILIBRÉ de ' + (debit - credit).toLocaleString('fr-FR') + ' FCFA'}`,
        colonnes: [
            { libelle: 'Date', format: 'txt', align: 'left' }, { libelle: 'Référence', format: 'txt', align: 'left' },
            { libelle: 'Compte', format: 'txt', align: 'left' }, { libelle: 'Libellé', format: 'txt', align: 'left' },
            { libelle: 'Débit', format: 'fcfa', align: 'right' }, { libelle: 'Crédit', format: 'fcfa', align: 'right' }
        ],
        lignes: ecritures.map(e => [e.date, e.reference, e.compte, e.libelle, e.debit || '', e.credit || '']),
        total: ['', '', '', 'TOTAUX', debit, credit],
        equilibre: debit === credit
    };
}

function journalPaie({ entreprise = {}, periode, lignes = [] }) {
    const { ecritures, journaux, sansDetail, sansFiscal } = ecrituresPaie({ periode, lignes, comptesPaie: entreprise.comptesPaie });
    const avertissements = [];
    if (sansDetail) avertissements.push(`${sansDetail} bulletin(s) antérieur(s) au détail de paie : primes, congés et indemnités regroupés (comptes ${planEffectif(entreprise.comptesPaie).plan.primes.compte} et ${planEffectif(entreprise.comptesPaie).plan.indemnitesNonImposables.compte}), acomptes passés en autres retenues. Régénérez la période pour un détail complet.`);
    if (sansFiscal) avertissements.push(`${sansFiscal} bulletin(s) sans contributions employeur / FDFP enregistrées : écritures OD correspondantes sous-estimées.`);
    const blocs = [
        blocJournal(`Journal de paie (${journaux.paie})`, ecritures.filter(e => e.journal === journaux.paie)),
        blocJournal(`Journal des opérations diverses (${journaux.od})`, ecritures.filter(e => e.journal === journaux.od))
    ];
    return {
        type: 'journal-paie',
        titre: 'Journal de paie — écritures comptables',
        reference: 'SYSCOHADA révisé — plan de comptes modifiable dans Paramètres',
        periode, entreprise: entete(entreprise),
        blocs, ecritures,
        notes: [
            'Débits du journal de paie = total des gains ; crédits = retenues + net à payer.',
            'Le journal des OD constate les charges patronales et regroupe les dettes envers l’État et la CNPS.'
        ],
        partielle: sansDetail > 0 || sansFiscal > 0,
        avertissements
    };
}

/** Export CSV pour l'assistant d'import de Sage (format paramétrable). */
function sageCsv(doc) {
    const date = (d) => { const [j, m, a] = d.split('/'); return `${j}${m}${a.slice(2)}`; };
    const lignes = [['Code journal', 'Date', 'N° compte', 'Libellé écriture', 'Débit', 'Crédit', 'Référence pièce']];
    for (const e of doc.ecritures) lignes.push([e.journal, date(e.date), e.compte, e.libelle, e.debit || '', e.credit || '', e.reference]);
    return lignes.map(l => l.map(v => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(';')).join('\r\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Provision pour congés payés (méthode simplifiée, LOGIPAIE feuille 37)
// ─────────────────────────────────────────────────────────────────────────
function provisionConges({ entreprise = {}, periode, lignes = [] }) {
    const B = baremeCI(periode.annee, periode.mois);
    const { plan, journaux } = planEffectif(entreprise.comptesPaie);
    const C = B.cnps, F = B.fiscalEmployeur;
    let sansDetail = 0;
    const alertes = [];
    const salaries = [];
    for (const r of lignes) {
        const d = detailDe(r);
        if (!d) { sansDetail++; continue; }
        const jours = Math.max(0, n(d.conges.acquis) - n(d.conges.pris));
        const allocation = arrondi(n(d.conges.salaireReference) / 30 * jours);
        const tauxAt = n(r.tauxAtMp) || C.tauxATDefaut;
        const social = arrondi(Math.min(allocation, C.plafondRetraite) * C.tauxRetraitePat
            + Math.min(allocation, C.plafondPfAtAm) * (C.tauxPF + C.tauxAM + tauxAt));
        const expat = r.statutSalarie === 'expatrie' || n(r.ceEmployeur) > 0;
        const fiscal = arrondi(allocation * (F.tauxCN + (expat ? F.tauxCEExpat : F.tauxCELocal) + F.tauxFdfpTA + F.tauxFdfpFPC));
        if (jours > 60) alertes.push(`${r.prenom || ''} ${r.nom || ''} : ${jours} jours acquis — vérifier la date du dernier retour de congés.`.trim());
        salaries.push([`${r.nom || ''} ${r.prenom || ''}`.trim(), jours, d.conges.salaireReference, allocation, social, fiscal, allocation + social + fiscal]);
    }
    salaries.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const somme = (i) => salaries.reduce((s, x) => s + x[i], 0);
    const [alloc, social, fiscal] = [somme(3), somme(4), somme(5)];
    const date = dateFr(dernierJour(periode));
    const ref = reference('PROV CP', periode);
    const ecritures = [
        { journal: journaux.od, date, reference: ref, compte: plan.conges.compte, libelle: 'Dotation provision congés payés', debit: alloc, credit: 0 },
        { journal: journaux.od, date, reference: ref, compte: plan.provisionConges.compte, libelle: plan.provisionConges.libelle, debit: 0, credit: alloc },
        { journal: journaux.od, date, reference: ref, compte: plan.chargesCnps.compte, libelle: 'Charges sociales sur congés provisionnés', debit: social, credit: 0 },
        { journal: journaux.od, date, reference: ref, compte: plan.provisionChargesSociales.compte, libelle: plan.provisionChargesSociales.libelle, debit: 0, credit: social },
        { journal: journaux.od, date, reference: ref, compte: plan.taxesSalaires.compte, libelle: 'Charges fiscales sur congés provisionnés', debit: fiscal, credit: 0 },
        { journal: journaux.od, date, reference: ref, compte: plan.provisionChargesFiscales.compte, libelle: plan.provisionChargesFiscales.libelle, debit: 0, credit: fiscal }
    ].filter(e => e.debit || e.credit);

    return {
        type: 'provision-conges',
        titre: 'Provision pour congés payés',
        reference: 'Méthode simplifiée : jours acquis non pris × salaire de référence / 30, plus charges patronales',
        periode, entreprise: entete(entreprise), paysage: true,
        blocs: [
            {
                titre: `Droits acquis non pris au ${date}`,
                colonnes: [
                    { libelle: 'Salarié', format: 'txt', align: 'left' }, { libelle: 'Jours acquis', format: 'nb', align: 'right' },
                    { libelle: 'Salaire de référence', format: 'fcfa', align: 'right' }, { libelle: 'Indemnité de congés', format: 'fcfa', align: 'right' },
                    { libelle: 'Charges sociales', format: 'fcfa', align: 'right' }, { libelle: 'Charges fiscales', format: 'fcfa', align: 'right' },
                    { libelle: 'Provision', format: 'fcfa', align: 'right' }
                ],
                lignes: salaries,
                total: ['TOTAL', somme(1), '', alloc, social, fiscal, alloc + social + fiscal]
            },
            blocJournal(`Écriture de provision (${journaux.od})`, ecritures)
        ],
        ecritures,
        aPayer: { libelle: 'PROVISION TOTALE (stock en fin de période)', montant: alloc + social + fiscal },
        notes: [
            'Montant = stock de la provision à la date de clôture : extourner la provision du mois précédent avant de passer celle-ci.',
            'Charges sociales : retraite 7,7 % (plafonnée), PF + AM + AT (plafond 75 000) ; charges fiscales : CN, CE expatrié, FDFP.'
        ],
        partielle: sansDetail > 0,
        avertissements: [
            ...(sansDetail ? [`${sansDetail} bulletin(s) antérieur(s) au détail de paie : droits à congés inconnus, salariés non provisionnés. Régénérez la période.`] : []),
            ...alertes
        ]
    };
}

// ─────────────────────────────────────────────────────────────────────────
// Ordre de virement des salaires (LOGIPAIE feuilles 22 et 23)
// ─────────────────────────────────────────────────────────────────────────
function ordreVirement({ entreprise = {}, periode, lignes = [] }) {
    const virements = [], autres = [];
    let sansDetail = 0, sansRib = 0;
    for (const r of lignes) {
        const d = detailDe(r);
        const nom = `${r.nom || ''} ${r.prenom || ''}`.trim();
        const net = arrondi(n(r.netAPayer));
        if (!d) { sansDetail++; autres.push([nom, 'Inconnu', net]); continue; }
        if (d.paiement.mode !== 'virement') { autres.push([nom, d.paiement.mode === 'cheque' ? 'Chèque' : 'Espèces', net]); continue; }
        if (!d.paiement.rib) sansRib++;
        virements.push([d.paiement.banque || '—', nom, r.matricule || '', d.paiement.rib || 'RIB MANQUANT', net]);
    }
    virements.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
    const parBanque = {};
    for (const v of virements) parBanque[v[0]] = (parBanque[v[0]] || 0) + v[4];
    const totalVirements = virements.reduce((s, v) => s + v[4], 0);
    const totalAutres = autres.reduce((s, v) => s + v[2], 0);
    const libelleMois = `${MOIS[periode.mois]} ${periode.annee}`;

    const blocs = [
        { titre: 'Objet', paires: [[`Virement des salaires de ${libelleMois} — par le débit de notre compte n° ……………………… (à compléter)`, totalVirements, 'fcfa']] },
        {
            titre: `Liste des salaires à virer — ${virements.length} salarié(s)`,
            colonnes: [
                { libelle: 'Banque', format: 'txt', align: 'left' }, { libelle: 'Salarié', format: 'txt', align: 'left' },
                { libelle: 'Matricule', format: 'txt', align: 'left' }, { libelle: 'RIB', format: 'txt', align: 'left' },
                { libelle: 'Net à virer', format: 'fcfa', align: 'right' }
            ],
            lignes: virements,
            total: ['TOTAL', '', '', '', totalVirements]
        },
        { titre: 'Récapitulatif par banque', paires: Object.entries(parBanque).map(([b, m]) => [b, m, 'fcfa']) }
    ];
    if (autres.length) {
        blocs.push({
            titre: 'Payés hors virement (espèces / chèque)',
            colonnes: [{ libelle: 'Salarié', format: 'txt', align: 'left' }, { libelle: 'Mode', format: 'txt', align: 'left' }, { libelle: 'Net', format: 'fcfa', align: 'right' }],
            lignes: autres, total: ['TOTAL', '', totalAutres]
        });
    }
    return {
        type: 'ordre-virement',
        titre: 'Ordre de virement des salaires',
        reference: `Salaires de ${libelleMois}`,
        periode, entreprise: entete(entreprise),
        blocs,
        aPayer: { libelle: 'TOTAL À VIRER', montant: totalVirements },
        notes: ['À transmettre à la banque, signé, avec la liste des salaires à virer.'],
        partielle: sansDetail > 0 || sansRib > 0,
        avertissements: [
            ...(sansRib ? [`${sansRib} salarié(s) payé(s) par virement sans RIB : complétez la fiche salarié (Annuaire) puis régénérez la période.`] : []),
            ...(sansDetail ? [`${sansDetail} bulletin(s) antérieur(s) au détail de paie : mode de paiement inconnu.`] : [])
        ]
    };
}

module.exports = { ecrituresPaie, totauxPeriode, journalPaie, sageCsv, provisionConges, ordreVirement };
