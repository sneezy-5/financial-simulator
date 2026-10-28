// ═══════════════════════════════════════════════════════════════════════════
// PLAN COMPTABLE DE PAIE — SYSCOHADA révisé
//
// Comptes par défaut repris du classeur LOGIPAIE (feuille 28 « Imputations
// comptables »). Chaque entreprise peut remplacer n'importe quel numéro dans
// Paramètres ; le libellé, lui, reste celui du plan.
// ═══════════════════════════════════════════════════════════════════════════

const PLAN_DEFAUT = {
    // ── Journal de paie : charges (débit)
    salaires: { compte: '661100', libelle: 'Appointements, salaires', groupe: 'Charges de personnel' },
    primes: { compte: '661210', libelle: 'Primes', groupe: 'Charges de personnel' },
    gratifications: { compte: '661220', libelle: 'Gratifications', groupe: 'Charges de personnel' },
    conges: { compte: '661300', libelle: 'Congés payés', groupe: 'Charges de personnel' },
    indemnitesRupture: { compte: '661400', libelle: 'Indemnités de préavis, licenciement', groupe: 'Charges de personnel' },
    transport: { compte: '663400', libelle: 'Indemnités de transport', groupe: 'Charges de personnel' },
    indemnitesNonImposables: { compte: '663830', libelle: 'Indemnités non soumises (logement, autres)', groupe: 'Charges de personnel' },
    // ── Journal de paie : dettes (crédit)
    its: { compte: '447200', libelle: 'Impôts sur salaires (ITS) retenus', groupe: 'Retenues' },
    cnpsSalarie: { compte: '431310', libelle: 'Caisse de retraite, part salariale', groupe: 'Retenues' },
    avances: { compte: '421000', libelle: 'Personnel, avances et acomptes', groupe: 'Retenues' },
    cmuSalarie: { compte: '471220', libelle: 'CMU', groupe: 'Retenues' },
    autresRetenues: { compte: '471800', libelle: 'Autres retenues', groupe: 'Retenues' },
    netAPayer: { compte: '422000', libelle: 'Personnel, rémunérations dues', groupe: 'Retenues' },
    // ── Journal des OD : charges patronales et dettes fiscales / sociales
    taxesSalaires: { compte: '641300', libelle: 'Taxes sur appointements et salaires (CN / CE)', groupe: 'Charges patronales' },
    etatIts: { compte: '442130', libelle: 'État, impôts et taxes — ITS', groupe: 'Charges patronales' },
    fdfpTA: { compte: '641400', libelle: 'FDFP — taxe d’apprentissage', groupe: 'Charges patronales' },
    fdfpTFC: { compte: '641500', libelle: 'FDFP — taxe formation continue', groupe: 'Charges patronales' },
    etatFdfp: { compte: '442810', libelle: 'État, autres impôts et taxes — FDFP', groupe: 'Charges patronales' },
    chargesCnps: { compte: '664100', libelle: 'Charges sociales CNPS', groupe: 'Charges patronales' },
    cnps: { compte: '431000', libelle: 'Sécurité sociale — CNPS', groupe: 'Charges patronales' },
    chargesCmu: { compte: '664800', libelle: 'Charges sociales CMU (part patronale)', groupe: 'Charges patronales' },
    // ── Provision pour congés payés
    provisionConges: { compte: '428200', libelle: 'Dettes provisionnées pour congés à payer', groupe: 'Provision congés' },
    provisionChargesSociales: { compte: '438200', libelle: 'Charges sociales sur congés à payer', groupe: 'Provision congés' },
    provisionChargesFiscales: { compte: '448600', libelle: 'État, charges à payer sur congés', groupe: 'Provision congés' }
};

const JOURNAUX_DEFAUT = { paie: 'PAIE', od: 'OD' };

/**
 * Plan effectif : défaut + numéros personnalisés de l'entreprise.
 * @param {object|string|null} personnalise  { cle: '661100', journalPaie: 'SAL', … }
 */
function planEffectif(personnalise) {
    let p = personnalise;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
    p = p || {};
    const plan = {};
    for (const [cle, def] of Object.entries(PLAN_DEFAUT)) {
        const compte = String(p[cle] || '').trim();
        plan[cle] = { ...def, compte: /^\d{3,12}$/.test(compte) ? compte : def.compte };
    }
    const journaux = {
        paie: String(p.journalPaie || '').trim() || JOURNAUX_DEFAUT.paie,
        od: String(p.journalOd || '').trim() || JOURNAUX_DEFAUT.od
    };
    return { plan, journaux };
}

module.exports = { PLAN_DEFAUT, JOURNAUX_DEFAUT, planEffectif };
