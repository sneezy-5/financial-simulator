// Moteur de paie Bénin — extrait tel quel de payrollService.js (phase 6).
// La Côte d'Ivoire a son moteur partagé avec le simulateur (paieCI.mjs).

/**
 * Calcul des règles pour un employé unique (simulation manuelle)
 */
function calculateBeninSalaryRules(employee) {
    // 1. Calcul des éléments de base (identique à calculateSalaryRules)
    const salaireBaseMensuel = parseFloat(employee['salaire_base'] || 0);
    // Jours ouvrables d'un mois complet : dénominateur de TOUTE proratisation
    // liée au temps de travail (salaire de base, sursalaire, primes).
    const JOURS_BASE_STANDARD = 26;
    const joursAbsences = parseFloat(employee['absences_jours'] || 0);
    const joursTravailleExplicite = (employee['jours_travailles'] !== undefined && employee['jours_travailles'] !== null && employee['jours_travailles'] !== '')
        ? parseFloat(employee['jours_travailles'])
        : null;
    const autoConges = !!employee['auto_conges'];
    let joursConges = parseFloat(employee['jours_conges_pris'] || 0);

    if (autoConges) {
        const dateRefStr = employee['date_dernier_conge'] || employee['date_embauche'];
        if (dateRefStr) {
            const dRef = new Date(dateRefStr);
            const paieMois = parseInt(employee['mois'] || new Date().getMonth() + 1);
            const paieAnnee = parseInt(employee['annee'] || new Date().getFullYear());
            const dNow = new Date(paieAnnee, paieMois - 1, 1);
            const diffMois = (dNow.getFullYear() - dRef.getFullYear()) * 12 + (dNow.getMonth() - dRef.getMonth());
            if (diffMois > 0) {
                joursConges = Math.min(30, Math.floor(diffMois * 2.2));
            }
        }
    }

    // Même correction que calculateSalaryRules (CI) : jours_travailles est la
    // base du mois, pas le net après absences. On déduit toujours absences_jours.
    const joursNetExterneBJ = (employee['jours_travailles_net'] !== undefined && employee['jours_travailles_net'] !== null && employee['jours_travailles_net'] !== '')
        ? parseFloat(employee['jours_travailles_net']) : null;
    const joursBaseMoisBJ = (joursTravailleExplicite !== null) ? joursTravailleExplicite : JOURS_BASE_STANDARD;
    const joursTrav = Math.max(0, (joursNetExterneBJ !== null ? joursNetExterneBJ : (joursBaseMoisBJ - joursAbsences)) - joursConges);
    const joursBasePaie = JOURS_BASE_STANDARD;
    const joursCP = joursConges;

    // Diviseur : joursBasePaie (26), la MÊME échelle que joursTrav.
    // joursTrav vaut 26 pour un mois complet ; diviser par 30 amputait donc
    // le salaire de 13,3 % alors même que le salarié n'avait pas été absent.
    // Les primes divisaient déjà correctement par 26 : le bulletin était
    // incohérent avec lui-même.
    const salaireBase = Math.round((salaireBaseMensuel / joursBasePaie) * joursTrav);
    const sursalaireTotal = parseFloat(employee['sursalaire'] || 0);
    const sursalaire = Math.round((sursalaireTotal / joursBasePaie) * joursTrav);

    const primeTransportMensuel = parseFloat(employee['prime_transport'] || 0);
    const primeTransport = (employee['bulletin_type'] === 'conges') ? 0 : Math.round((primeTransportMensuel / joursBasePaie) * joursTrav);
    const primeLogement = parseFloat(employee['prime_logement'] || 0);

    const nbHeuresSup = parseFloat(employee['heures_sup_nb'] || 0);
    const coefHS = parseFloat(employee['heures_sup_coef'] || 1.15);
    const tauxHoraire = salaireBaseMensuel > 0 ? Math.round(salaireBaseMensuel / 173.33) : 0;
    const montantHeuresSup = Math.round(nbHeuresSup * tauxHoraire * coefHS);

    // Primes et autres éléments
    const primesList = Array.isArray(employee['primes']) ? employee['primes'] : [];
    const primesImposables = primesList.filter(p => p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);
    const primesNonImposablesRub = primesList.filter(p => !p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);
    const gratification = parseFloat(employee['gratification'] || 0);

    const salaireBrut = salaireBase + sursalaire + montantHeuresSup + primesImposables + gratification;
    const brutImposable = salaireBrut;
    const gainsTotaux = salaireBrut + primeTransport + primeLogement + primesNonImposablesRub;

    // Calculs spécifiques Bénin
    const baseFiscale = brutImposable;
    const impotEmployeur = Math.round(baseFiscale * 0.04); // VPS = 4%
    const totalFiscalEmployeur = impotEmployeur;

    const plafondCNSS = 1200000;
    const baseCNSS = Math.min(brutImposable, plafondCNSS);

    const cnssPF = Math.round(baseCNSS * 0.09);
    const cnssRetraitePat = Math.round(baseCNSS * 0.064);
    const tauxATPat = parseFloat(employee['taux_at'] || 0.01);
    const cnssAT = Math.round(baseCNSS * tauxATPat);

    const totalSocialEmployeur = cnssPF + cnssRetraitePat + cnssAT;
    const totalPatronal = totalFiscalEmployeur + totalSocialEmployeur;

    // Charges salariales
    const cnssSal = Math.round(baseCNSS * 0.036);
    const salImposable = brutImposable - cnssSal; // La particularité du Bénin

    const tranches = [
        { plafond: 60000, taux: 0.00 },
        { plafond: 150000, taux: 0.10 },
        { plafond: 250000, taux: 0.15 },
        { plafond: 500000, taux: 0.19 },
        { plafond: Infinity, taux: 0.30 }
    ];
    let itsFinal = 0;
    let prec = 0;
    for (const { plafond, taux } of tranches) {
        if (salImposable <= prec) break;
        itsFinal += (Math.min(salImposable, plafond) - prec) * taux;
        prec = plafond;
    }
    itsFinal = Math.round(itsFinal);

    let redevanceSpeciale = 0;
    if (salImposable > 60000) {
        const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
        if (moisNum === 3) redevanceSpeciale = 1000;
        else if (moisNum === 6) redevanceSpeciale = 3000;
    }

    const acompte = parseFloat(employee['acompte'] || 0);
    const avance = parseFloat(employee['avance'] || 0);
    const opposition = parseFloat(employee['opposition'] || 0);
    const autres = parseFloat(employee['autres_retenues'] || 0);

    const impots = itsFinal + redevanceSpeciale;
    const totalRetenuesDiverses = acompte + avance + opposition + autres;
    const totalRetenues = impots + cnssSal + totalRetenuesDiverses;

    const netAPayerRaw = gainsTotaux - totalRetenues;
    const netAPayer = Math.max(0, netAPayerRaw);

    const autresTaxesSalariales = [];
    if (redevanceSpeciale > 0) {
        autresTaxesSalariales.push({ code: '411', label: 'REDEVANCE SPECIALE ORTB/SRTB', base: null, montant: redevanceSpeciale });
    }

    return {
        brut: salaireBrut, salaireBase, salaireBaseMensuel, sursalaire,
        primeAnciennete: 0, ansAnciennete: 0, ancienneteTxt: '____', allocationConges: 0, joursCP,
        gratification, preavisVal: 0, indemLicenciement: 0, indemTransac: 0, fraisFuneraires: 0,
        primesImposables, primesNonImposablesRub, montantHeuresSup, nbHeuresSup, coefHS, tauxHoraire,
        primeTransport, primeLogement,
        brutImposable, gainsTotaux, baseCNPS: baseCNSS, baseCNPS_PfAtAm: baseCNSS, parts: 0, totalPersonnesCMU: 0, joursTrav,
        patronal: {
            impotEmployeur, fdfpTA: 0, fdfpFPC: 0, totalFiscal: totalFiscalEmployeur,
            cnpsPF: cnssPF, cnpsAM: 0, cnpsAT: cnssAT, cnpsRetraite: cnssRetraitePat, cmu: 0,
            totalSocial: totalSocialEmployeur, grandTotal: totalPatronal
        },
        salarial: {
            its: itsFinal, ricf: 0, baseITS: salImposable, cnps: cnssSal, cmu: 0,
            acompte, avance, opposition, autres, total: totalRetenues, regime: '2024',
            autresTaxes: autresTaxesSalariales
        },
        netAPayer
    };
}

Object.assign(exports, { calculateBeninSalaryRules });
