// Outils partagés par les modèles de bulletin : formatage, compteurs de
// congés, cumuls, identité employeur, codes et ventilation des rubriques.
// Extraits tels quels de payrollService.js (phase 6 de la roadmap).

/**
     * Formateur FCFA
     */
const fcfa = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '';
    return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    if (dateStr.includes('-')) {
        const [y, m, d] = dateStr.split('-');
        if (y.length === 4) return `${d}/${m}/${y}`;
    }
    return dateStr;
};

/**
 * Calcul harmonisé des compteurs de congés (Acquis, Pris, Reste à prendre)
 * applicable à tous les modèles de bulletins.
 *
 * Source de vérité pour congesPris (par ordre de priorité) :
 *  1. employee.absences_prises_total  → somme des absences 'annuel' en BDD
 *                                        depuis date_dernier_conge (injecté par
 *                                        /api/rh/generate-single-payslip)
 *  2. calc.joursCP / bulletin_type === 'conges' → jours calculés au moment du bulletin
 *  3. employee.jours_conges_pris      → saisie explicite / rétrocompat
 */
function calculateCongesCounters(employee, calc = {}, annee, moisNum) {
    let congesAcquis = '';
    let congesReste = '';

    // Détermination de la date de référence
    let dRef;
    if (employee.date_dernier_conge) {
        dRef = new Date(employee.date_dernier_conge);
    } else {
        const debutAnnee = new Date(annee, 0, 1);
        const dateEmb = employee.date_embauche ? new Date(employee.date_embauche) : null;
        dRef = (dateEmb && dateEmb > debutAnnee) ? dateEmb : debutAnnee;
    }
    const dNow = new Date(annee, moisNum - 1, 1);
    const diffMoisConges = (dNow.getFullYear() - dRef.getFullYear()) * 12 + (dNow.getMonth() - dRef.getMonth());
    if (diffMoisConges > 0) {
        const acquis = Math.round(Math.floor(diffMoisConges * 2.2) * 10) / 10;
        congesAcquis = acquis;
    }

    // Congés pris en BDD antérieurement
    const prisEnBdd = (employee.absences_prises_total !== undefined && employee.absences_prises_total !== null)
        ? (parseFloat(employee.absences_prises_total) || 0)
        : null;

    // Congés pris sur ce bulletin courant
    let prisCeMois = 0;
    if (calc && calc.joursCP !== undefined && calc.joursCP > 0) {
        prisCeMois = parseFloat(calc.joursCP) || 0;
    } else if (employee.prise_conges_mode === 'partiel' && parseFloat(employee.jours_conges_partiels) > 0) {
        prisCeMois = parseFloat(employee.jours_conges_partiels) || 0;
    } else if (employee.prise_conges_mode === 'total' || employee.bulletin_type === 'conges' || employee.auto_conges || employee.isLeavePayslip) {
        prisCeMois = typeof congesAcquis === 'number' ? congesAcquis : 0;
    } else if (parseFloat(employee.jours_conges_pris) > 0) {
        prisCeMois = parseFloat(employee.jours_conges_pris) || 0;
    }

    // Calcul du total des congés pris (BDD + mois courant)
    let congesPris = 0;
    if (prisEnBdd !== null && prisEnBdd > 0) {
        congesPris = prisEnBdd;
        if (prisCeMois > 0 && prisEnBdd < prisCeMois) {
            congesPris = prisCeMois;
        } else if (prisCeMois > 0 && prisEnBdd !== prisCeMois) {
            congesPris = Math.round((prisEnBdd + prisCeMois) * 10) / 10;
        }
    } else {
        congesPris = prisCeMois;
    }

    if (congesAcquis !== '') {
        // Reste à prendre = Acquis - Pris (cas partiel : l'employé peut avoir pris une partie)
        congesReste = Math.max(0, Math.round((congesAcquis - congesPris) * 10) / 10);
    }

    // congesPris affiché = 0 si aucun pris (pas de chaîne vide)
    const congesPrisAff = congesPris > 0 ? congesPris : (congesAcquis !== '' ? 0 : '');
    return { congesAcquis, congesReste, congesPris: congesPrisAff, jCP: congesPris };
}

/**
 * Calcule les cumuls annuels de paie (Exercice en cours).
 * Prend en compte les cumuls initiaux saisis dans les paramètres / fiche employé,
 * et le mois courant généré.
 */
function calculateCumuls(employee, calc, annee) {
    const anneeKey = String(annee || new Date().getFullYear());
    const cHist = (employee.cumulsPaie && employee.cumulsPaie[anneeKey]) || (employee.cumuls_paie && employee.cumuls_paie[anneeKey]) || {};

    const brutInit = parseFloat(employee.cumul_brut_initial ?? employee.cumulBrutInitial ?? cHist.cumul_brut_initial ?? cHist.cumul_brut ?? 0) || 0;
    const netImpInit = parseFloat(employee.cumul_net_imposable_initial ?? employee.cumulNetImposableInitial ?? cHist.cumul_net_imposable_initial ?? cHist.cumul_net_imposable ?? 0) || 0;
    const netInit = parseFloat(employee.cumul_net_initial ?? employee.cumulNetInitial ?? cHist.cumul_net_initial ?? cHist.cumul_net ?? 0) || 0;
    const cnpsInit = parseFloat(employee.cumul_cnps_sal_initial ?? employee.cumulCnpsSalInitial ?? cHist.cumul_cnps_sal_initial ?? cHist.cumul_cnps ?? 0) || 0;
    const itsInit = parseFloat(employee.cumul_its_initial ?? employee.cumulItsInitial ?? cHist.cumul_its_initial ?? cHist.cumul_its ?? 0) || 0;
    const cmuInit = parseFloat(employee.cumul_cmu_initial ?? employee.cumulCmuInitial ?? cHist.cumul_cmu_initial ?? cHist.cumul_cmu ?? 0) || 0;
    const patInit = parseFloat(employee.cumul_charges_pat_initial ?? employee.cumulChargesPatInitial ?? cHist.cumul_charges_pat_initial ?? cHist.cumul_charges_pat ?? 0) || 0;
    const jrsInit = parseFloat(employee.cumul_jours_initial ?? employee.cumulJoursInitial ?? cHist.cumul_jours_initial ?? cHist.cumul_jours ?? 0) || 0;
    const hsInit = parseFloat(employee.cumul_heures_sup_initial ?? employee.cumulHeuresSupInitial ?? cHist.cumul_heures_sup_initial ?? cHist.cumul_heures_sup ?? 0) || 0;

    const cumulBrut = Math.round((brutInit + (calc?.gainsTotaux || 0)) * 100) / 100;
    const cumulBrutImposable = Math.round(((netImpInit || brutInit) + (calc?.brutImposable || 0)) * 100) / 100;
    const cumulNetImposable = Math.round((netImpInit + (calc?.brutImposable || 0)) * 100) / 100;
    const cumulNetAPayer = Math.round((netInit + (calc?.netAPayer || 0)) * 100) / 100;
    const cumulCNPS = Math.round((cnpsInit + (calc?.salarial?.cnps || 0)) * 100) / 100;
    const cumulITS = Math.round((itsInit + (calc?.salarial?.its || 0)) * 100) / 100;
    const cumulCMU = Math.round((cmuInit + (calc?.salarial?.cmu || 0)) * 100) / 100;
    const cumulRICF = Math.round((calc?.salarial?.ricf || 0) * 100) / 100;
    const cumulChargesSal = Math.round((cnpsInit + itsInit + cmuInit + (calc?.salarial?.total || 0)) * 100) / 100;
    const cumulChargesPat = Math.round((patInit + (calc?.patronal?.grandTotal || calc?.patronal?.totalSocial || 0)) * 100) / 100;
    const cumulJours = Math.round((jrsInit + (calc?.joursTrav || 0)) * 10) / 10;
    const cumulHeuresSup = Math.round((hsInit + (calc?.nbHeuresSup || 0)) * 10) / 10;

    return {
        cumulBrut,
        cumulBrutImposable,
        cumulNetImposable,
        cumulNetAPayer,
        cumulCNPS,
        cumulITS,
        cumulCMU,
        cumulRICF,
        cumulChargesSal,
        cumulChargesPat,
        cumulJours,
        cumulHeuresSup
    };
}

/** Identité employeur commune aux modèles ci-dessous — un seul endroit à corriger. */
function resolveCompanyInfo(employee, companyInfo = {}) {
    return {
        nom: companyInfo.nom_entreprise || employee.nom_entreprise || 'VOTRE ENTREPRISE',
        adresse: companyInfo.adresse || employee.adresse || '',
        siege: companyInfo.siege_social || employee.siege_social || companyInfo.adresse || '',
        ville: companyInfo.ville || employee.ville || '',
        cnps: companyInfo.numero_cnps || employee.numero_cnps || '____',
        contribuable: companyInfo.numero_contribuable || employee.numero_contribuable || '____',
        email: companyInfo.email || employee.email_entreprise || '',
        telephone: companyInfo.telephone || employee.tel_entreprise || '',
        logo: companyInfo.logo || null
    };
}

/** Rubriques de gains/retenues communes, sous une forme neutre exploitable par
 * n'importe quelle mise en page ci-dessous (une ligne = un libellé + un montant,
 * classé gain/retenue salariale/charge patronale). Construit une seule fois,
 * pour ne pas retrouver un calcul différent d'un modèle à l'autre. */
// Numérotation de rubrique commune à tous les modèles ONDA, alignée sur un
// bulletin réel (LA LAVANDIERE) : 10/11/60/655 et 450/452/502/503/520/530 y
// sont directement visibles. L'impôt sur salaire principal y garde le
// numéro 430 : c'est celui de l'ITS (impôt unique, réforme fiscale 2024),
// seul régime que ce moteur calcule désormais.
const CODE_RUBRIQUE = {
    salaireBase: '10', sursalaire: '11', primeAnciennete: '12', prime: '13',
    allocationConges: '14', heuresSup: '15', gratification: '60',
    primeTransport: '655', primeLogement: '656', primeTransportImposable: '16',
    its: '430', cnpsSalariale: '502', cmuSalariale: '504', ricf: '432', acompte: '460',
    cnpsPatronale: '503', cnpsPF: '450', cnpsAT: '452', cnpsAM: '451', cmuPatronale: '505',
    impotEmployeur: '431', ceEmployeur: '433', fdfpTA: '520', fdfpFPC: '530'
};

/**
 * Fusionne les codes de rubrique du compte (Paramètres) avec les valeurs par
 * défaut ONDA : un compte qui n'a jamais rien configuré obtient les codes par
 * défaut ; un compte qui n'a redéfini que « its » garde le reste tel quel.
 */
function resolveCodesRubrique(codesCompte) {
    if (!codesCompte) return CODE_RUBRIQUE;
    return { ...CODE_RUBRIQUE, ...codesCompte };
}

function construireRubriques(employee, calc, codesCompte) {
    const c = resolveCodesRubrique(codesCompte);
    const gains = [];
    gains.push({ code: c.salaireBase, label: 'Salaire de base', base: calc.salaireBaseMensuel, taux: '100%', montant: calc.salaireBase });
    if (calc.sursalaire > 0) gains.push({ code: c.sursalaire, label: 'Sursalaire', base: employee.sursalaire, taux: '100%', montant: calc.sursalaire });
    if (calc.primeAnciennete > 0) gains.push({ code: c.primeAnciennete, label: `Prime d'ancienneté (${calc.ansAnciennete} ans)`, montant: calc.primeAnciennete });
    (employee.primes || []).forEach(p => { if (p.montant > 0) gains.push({ code: c.prime, label: p.libelle || p.label || 'Prime', montant: p.montant }); });
    if (calc.allocationConges > 0) gains.push({ code: c.allocationConges, label: `Allocation congés (${calc.joursCP} j)`, montant: calc.allocationConges });
    (calc.heuresSupTranches || []).forEach(t => gains.push({ code: c.heuresSup, label: `Heures sup. — ${t.label} (${t.heures}h)`, base: calc.tauxHoraire, taux: `×${t.coef}`, montant: t.montant }));
    if (calc.primeTransport > 0) gains.push({ code: c.primeTransport, label: 'Indemnité de transport', montant: calc.primeTransport, exonere: true });
    if (calc.primeTransportImposable > 0) gains.push({ code: c.primeTransportImposable, label: 'Indemnité de transport (excédent imposable)', montant: calc.primeTransportImposable });
    if (calc.primeLogement > 0) gains.push({ code: c.primeLogement, label: 'Prime de logement', montant: calc.primeLogement, exonere: true });

    const retenues = [];
    retenues.push({ code: c.its, label: 'Impôt sur les Traitements et Salaires (ITS)', base: calc.brutImposable, montant: calc.salarial.its });
    retenues.push({ code: c.cnpsSalariale, label: 'CNPS — Retraite (part salariale)', base: calc.baseCNPS, taux: '6.3%', montant: calc.salarial.cnps });
    retenues.push({ code: c.cmuSalariale, label: 'CMU — Assurance maladie', base: calc.totalPersonnesCMU * 1000, montant: calc.salarial.cmu });
    // Toujours en grandeur positive comme les autres lignes : c'est une
    // information (déjà déduite de l'ITS ci-dessus), pas une retenue
    // supplémentaire — chaque modèle décide comment la présenter via `info`.
    if (calc.salarial.ricf > 0) retenues.push({ code: c.ricf, label: 'dont Réduction Impôt Charge de Famille (RICF)', montant: calc.salarial.ricf, info: true });
    if (calc.salarial.acompte > 0) retenues.push({ code: c.acompte, label: 'Acompte / avance', montant: calc.salarial.acompte });

    const patronal = [];
    patronal.push({ code: c.cnpsPatronale, label: 'CNPS — Retraite (part patronale)', base: calc.baseCNPS, taux: '7.7%', montant: calc.patronal.cnpsRetraite });
    patronal.push({ code: c.cnpsPF, label: 'CNPS — Prestations familiales', base: calc.baseCNPS_PfAtAm, taux: '5.0%', montant: calc.patronal.cnpsPF });
    patronal.push({ code: c.cnpsAT, label: 'CNPS — Accident du travail', base: calc.baseCNPS_PfAtAm, taux: `${employee.taux_at_mp || employee.taux_at || 2}%`, montant: calc.patronal.cnpsAT });
    patronal.push({ code: c.cmuPatronale, label: 'CMU — part patronale', montant: calc.patronal.cmu });
    patronal.push({ code: c.impotEmployeur, label: 'CN — Contribution Nationale (employeur)', base: calc.brutImposable, taux: '1.2%', montant: calc.patronal.cnEmployeur ?? calc.patronal.impotEmployeur });
    if ((calc.patronal.ceEmployeur || 0) > 0) {
        patronal.push({ code: c.ceEmployeur, label: 'CE — Contribution Employeur (expatrié)', base: calc.brutImposable, taux: '9.2%', montant: calc.patronal.ceEmployeur });
    }
    patronal.push({ code: c.fdfpTA, label: 'FDFP — Taxe apprentissage', base: calc.brutImposable, taux: '0.4%', montant: calc.patronal.fdfpTA });
    patronal.push({ code: c.fdfpFPC, label: 'FDFP — Formation continue', base: calc.brutImposable, taux: '0.6%', montant: calc.patronal.fdfpFPC });

    return { gains, retenues, patronal };
}

Object.assign(exports, { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques });
