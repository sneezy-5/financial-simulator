export function calculateTGPayslip(baseData, emp, rules) {
  const brutImposable = baseData.salaireBrut + baseData.primeTransport + baseData.primeLogement;
  const gainsTotaux = brutImposable + baseData.primesNonImposablesRub;

  // Charges sociales employeur (Togo : CNSS 17.5% + INAM 5%)
  const plafondCNSS = rules.plafondRetraite || 1500000;
  const baseCNSS = Math.min(brutImposable, plafondCNSS);

  const cnssPat = Math.round(baseCNSS * (rules.tauxRetraitePat || 0.175));
  const inamPat = Math.round(baseCNSS * (rules.tauxSantePat || 0.05));

  const totalSocialEmployeur = cnssPat + inamPat;
  const impotEmployeur = Math.round(brutImposable * (rules.tauxImpotEmployeurLocal || 0.01));
  const totalPatronal = totalSocialEmployeur + impotEmployeur;

  // Charges sociales salariales (CNSS 4% + INAM 5%)
  const cnssSal = Math.round(baseCNSS * (rules.tauxRetraiteSal || 0.04));
  const inamSal = Math.round(baseCNSS * (rules.tauxSanteSal || 0.05));
  const totalSocialSalarial = cnssSal + inamSal;

  // Revenu après cotisations sociales (Base pour abattement)
  const revenuApresCotisations = Math.max(0, brutImposable - totalSocialSalarial);

  // Abattement professionnel 28% (plafonné à 2 800 000 FCFA/an sur la tranche <= 10 000 000 FCFA)
  const revenuAnnuel = revenuApresCotisations * 12;
  const abattementAnnuel = Math.min(revenuAnnuel, 10000000) * 0.28;
  const abattementMensuel = Math.round(abattementAnnuel / 12);

  const revenuNetImposableAnnuel = Math.max(0, revenuAnnuel - abattementAnnuel);
  const revenuNetImposableMensuel = Math.round(revenuNetImposableAnnuel / 12);

  // Barème IRPP Togo (Annuel)
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

  const totalRetenues = totalSocialSalarial + irppMensuel + baseData.totalRetenuesDiverses;
  const netAPayer = Math.max(0, gainsTotaux - totalRetenues);

  return {
    ...baseData,
    brutImposable,
    gainsTotaux,
    baseCNPS: baseCNSS,
    baseCNPS_PfAtAm: baseCNSS,
    revenuApresCotisations,
    abattementMensuel,
    revenuNetImposableMensuel,
    parts: 0,
    ricf: 0,
    salarial: {
      its: irppMensuel, // Alias compatibilité IRPP
      irpp: irppMensuel,
      ricf: 0,
      baseITS: revenuNetImposableMensuel,
      baseIRPP: revenuNetImposableMensuel,
      cnps: cnssSal,
      inam: inamSal,
      cmu: inamSal,
      acompte: baseData.acompte,
      avance: baseData.avance,
      opposition: baseData.opposition,
      autres: baseData.autresRetenues,
      total: totalRetenues,
      regime: '2026',
      autresTaxes: []
    },
    patronal: {
      impotEmployeur,
      fdfpTA: 0,
      fdfpFPC: 0,
      totalFiscal: impotEmployeur,
      cnpsPF: 0,
      cnpsAM: inamPat,
      cnpsAT: 0,
      cnpsRetraite: cnssPat,
      cmu: inamPat,
      totalSocial: totalSocialEmployeur,
      grandTotal: totalPatronal
    },
    netAPayer
  };
}
