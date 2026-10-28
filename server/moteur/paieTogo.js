// Moteur de paie Togo — extrait tel quel de payrollService.js (phase 6).
// La Côte d'Ivoire a son moteur partagé avec le simulateur (paieCI.mjs).

function calculateTogoSalaryRules(employee) {
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

    // Cf. calculateSalaryRules : jours_travailles explicite prime sur base - absences (évite le double comptage)
    const joursTrav = Math.max(0, (joursTravailleExplicite !== null ? joursTravailleExplicite : (JOURS_BASE_STANDARD - joursAbsences)) - joursConges);
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

    let ansAnciennete = 0;
    let tauxAnciennete = 0;
    let primeAnciennete = 0;
    if (employee.date_embauche) {
        const emb = new Date(employee.date_embauche);
        const paieMois = parseInt(employee.mois || new Date().getMonth() + 1);
        const paieAnnee = parseInt(employee.annee || new Date().getFullYear());
        const paieDate = new Date(paieAnnee, paieMois - 1, 30);
        ansAnciennete = Math.floor(Math.abs(paieDate - emb) / (1000 * 60 * 60 * 24 * 365.25));
        if (ansAnciennete >= 2) {
            tauxAnciennete = Math.min(5 + Math.floor((ansAnciennete - 2) / 3) * 2, 35);
            primeAnciennete = Math.round(salaireBaseMensuel * (tauxAnciennete / 100));
        }
    }

    const primeTransportMensuel = parseFloat(employee['prime_transport'] || 0);
    const primeTransport = (employee['bulletin_type'] === 'conges') ? 0 : Math.round((primeTransportMensuel / joursBasePaie) * joursTrav);
    const primeLogement = parseFloat(employee['prime_logement'] || 0);

    const nbHeuresSup = parseFloat(employee['heures_sup_nb'] || 0);
    const coefHS = parseFloat(employee['heures_sup_coef'] || 1.15);
    const tauxHoraire = salaireBaseMensuel > 0 ? Math.round(salaireBaseMensuel / 173.33) : 0;
    const montantHeuresSup = Math.round(nbHeuresSup * tauxHoraire * coefHS);

    const primesList = Array.isArray(employee['primes']) ? employee['primes'] : [];
    const primesImposables = primesList.filter(p => p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);
    const primesNonImposablesRub = primesList.filter(p => !p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);
    const gratification = parseFloat(employee['gratification'] || 0);

    const salaireBrut = salaireBase + sursalaire + primeAnciennete + montantHeuresSup + primesImposables + gratification;
    const brutImposable = salaireBrut + primeTransport + primeLogement;
    const gainsTotaux = brutImposable + primesNonImposablesRub;

    const plafondCNSS = 1500000;
    const baseCNSS = Math.min(brutImposable, plafondCNSS);

    const cnssSal = Math.round(baseCNSS * 0.04);
    const inamSal = Math.round(baseCNSS * 0.05);
    const totalSocialSalarial = cnssSal + inamSal;

    const revenuApresCotisations = Math.max(0, brutImposable - totalSocialSalarial);
    const revenuAnnuel = revenuApresCotisations * 12;
    const abattementAnnuel = Math.min(revenuAnnuel, 10000000) * 0.28;
    const abattementMensuel = Math.round(abattementAnnuel / 12);

    const revenuNetImposableAnnuel = Math.max(0, revenuAnnuel - abattementAnnuel);
    const revenuNetImposableMensuel = Math.round(revenuNetImposableAnnuel / 12);

    const tranches = [
        { plafond: 900000, taux: 0.00 },
        { plafond: 3000000, taux: 0.03 },
        { plafond: 6000000, taux: 0.10 },
        { plafond: 9000000, taux: 0.15 },
        { plafond: 12000000, taux: 0.20 },
        { plafond: 15000000, taux: 0.25 },
        { plafond: 20000000, taux: 0.30 },
        { plafond: Infinity, taux: 0.35 }
    ];

    let irppAnnuel = 0;
    let prec = 0;
    for (const { plafond, taux } of tranches) {
        if (revenuNetImposableAnnuel <= prec) break;
        irppAnnuel += (Math.min(revenuNetImposableAnnuel, plafond) - prec) * taux;
        prec = plafond;
    }
    const irppMensuel = Math.round(irppAnnuel / 12);

    const cnssPat = Math.round(baseCNSS * 0.175);
    const inamPat = Math.round(baseCNSS * 0.05);
    const impotEmployeur = Math.round(brutImposable * 0.01);
    const totalSocialEmployeur = cnssPat + inamPat;
    const totalPatronal = totalSocialEmployeur + impotEmployeur;

    const acompte = parseFloat(employee['acompte'] || 0);
    const avance = parseFloat(employee['avance'] || 0);
    const opposition = parseFloat(employee['opposition'] || 0);
    const autres = parseFloat(employee['autres_retenues'] || 0);
    const totalRetenuesDiverses = acompte + avance + opposition + autres;

    const totalRetenues = totalSocialSalarial + irppMensuel + totalRetenuesDiverses;
    const netAPayer = Math.max(0, gainsTotaux - totalRetenues);

    return {
        brut: salaireBrut, salaireBase, salaireBaseMensuel, sursalaire,
        primeAnciennete, ansAnciennete, tauxAnciennete, ancienneteTxt: ansAnciennete + ' an(s)', allocationConges: 0, joursCP,
        gratification, preavisVal: 0, indemLicenciement: 0, indemTransac: 0, fraisFuneraires: 0,
        primesImposables, primesNonImposablesRub, montantHeuresSup, nbHeuresSup, coefHS, tauxHoraire,
        primeTransport, primeLogement,
        brutImposable, gainsTotaux, baseCNPS: baseCNSS, baseCNPS_PfAtAm: baseCNSS, parts: 0, totalPersonnesCMU: 0, joursTrav,
        revenuApresCotisations, abattementMensuel, revenuNetImposableMensuel, totalRetenuesDiverses,
        patronal: {
            impotEmployeur, fdfpTA: 0, fdfpFPC: 0, totalFiscal: impotEmployeur,
            cnpsPF: 0, cnpsAM: inamPat, cnpsAT: 0, cnpsRetraite: cnssPat, cmu: inamPat,
            totalSocial: totalSocialEmployeur, grandTotal: totalPatronal
        },
        salarial: {
            its: irppMensuel, irpp: irppMensuel, ricf: 0, baseITS: revenuNetImposableMensuel, baseIRPP: revenuNetImposableMensuel,
            cnps: cnssSal, inam: inamSal, cmu: inamSal,
            acompte, avance, opposition, autres, total: totalRetenues, regime: '2026',
            autresTaxes: []
        },
        netAPayer
    };
}

Object.assign(exports, { calculateTogoSalaryRules });
