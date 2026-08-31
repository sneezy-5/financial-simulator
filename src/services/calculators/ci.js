export function calculateCIPayslip(baseData, emp, rules) {
  const brutImposable = baseData.salaireBrut
  const gainsTotaux = brutImposable + baseData.primeTransport + baseData.primeLogement + baseData.primesNonImposablesRub

  // Charges fiscales employeur — rubriques dissociées (cf. countryConfig CI)
  const baseFiscale = brutImposable
  const estExpatrie = String(emp.statut_salarie || '').toLowerCase().includes('expat')
  const cnEmployeur = Math.round(baseFiscale * (rules.tauxCnEmployeur ?? 0.012))
  const ceEmployeur = Math.round(baseFiscale * (estExpatrie
    ? (rules.tauxCeEmployeurExpat ?? 0.092)
    : (rules.tauxCeEmployeurLocal ?? 0)))
  // Agrégat conservé pour les consommateurs qui affichent une seule ligne « impôt employeur ».
  const impotEmployeur = cnEmployeur + ceEmployeur
  const fdfpTA = Math.round(baseFiscale * 0.004)
  const fdfpFPC = Math.round(baseFiscale * 0.006)
  const totalFiscalEmployeur = impotEmployeur + fdfpTA + fdfpFPC

  // Charges sociales employeur
  const plafondCNPS = rules.plafondRetraite
  const baseCNPS = Math.min(brutImposable, plafondCNPS)
  const baseCNPS_PfAtAm = Math.min(brutImposable, rules.plafondPF)
  // AT/MP : 2 à 5 % selon le secteur. Priorité au paramètre entreprise
  // (taux_at_mp), fallback historique sur taux_at, puis défaut config (2 %).
  const tauxAtMp = Number(emp.taux_at_mp) || Number(emp.taux_at) || rules.tauxATPat || 0.02
  const cnpsPF = Math.round(baseCNPS_PfAtAm * rules.tauxPFPat)
  const cnpsAM = Math.round(baseCNPS_PfAtAm * 0.0075)
  const cnpsAT = Math.round(baseCNPS_PfAtAm * tauxAtMp)
  const cnpsRetraitePat = Math.round(baseCNPS * rules.tauxRetraitePat)
  
  const sitCmu = String(emp.situation_matrimoniale || '').toLowerCase()
  const conjointCmu = sitCmu.includes('mari') ? 1 : 0
  const enfantsCmu = Number(emp.nombre_enfants) || 0
  const nbAyantsDroitCMU = Math.max(0, +emp.ayants_droit_cmu > 0 ? +emp.ayants_droit_cmu : (conjointCmu + enfantsCmu))
  const totalPersonnesCMU = 1 + nbAyantsDroitCMU
  const cmuPat = rules.hasCMU ? (500 * totalPersonnesCMU) : 0
  const totalSocialEmployeur = cnpsPF + cnpsAM + cnpsAT + cnpsRetraitePat + cmuPat
  const totalPatronal = totalFiscalEmployeur + totalSocialEmployeur

  // Charges Salariales
  const cnpsSal = Math.round(baseCNPS * rules.tauxRetraiteSal)
  const cmuSal = rules.hasCMU ? (500 * totalPersonnesCMU) : 0

  let n = Math.min(Number(emp.nombre_enfants) || 0, 4)
  let parts = 1
  const sit = String(emp.situation_matrimoniale || '').toLowerCase()

  if (sit.includes('mari')) {
    parts = 2 + (n * 0.5)
  } else if (sit.includes('veuf') || sit.includes('veuv')) {
    parts = (n > 0) ? (2 + (n * 0.5)) : 1
  } else {
    parts = (n > 0) ? (1.5 + (n * 0.5)) : 1
  }
  parts = Math.min(parts, 5.0)

  // ITS (impôt unique sur salaires, réforme fiscale 2024) — seul régime calculé.
  const salImposable = brutImposable
  const tranches = [
    { plafond: 75000, taux: 0.00 },
    { plafond: 240000, taux: 0.16 },
    { plafond: 800000, taux: 0.21 },
    { plafond: 2400000, taux: 0.24 },
    { plafond: 8000000, taux: 0.28 },
    { plafond: Infinity, taux: 0.32 }
  ]

  let impotBrut = 0
  let prec = 0
  for (const { plafond, taux } of tranches) {
    if (salImposable <= prec) break
    impotBrut += (Math.min(salImposable, plafond) - prec) * taux
    prec = plafond
  }

  const itsBrut = Math.round(impotBrut)
  const ricf = Math.max(0, (parts - 1) * 11000)
  const itsFinal = Math.max(0, itsBrut - ricf)

  const totalRetenues = itsFinal + cnpsSal + cmuSal + baseData.totalRetenuesDiverses
  const netAPayerRaw = gainsTotaux - totalRetenues
  const netAPayer = Math.max(0, netAPayerRaw)

  return {
    ...baseData,
    brutImposable, baseFiscale, baseCNPS, baseCNPS_PfAtAm, tauxAT: tauxAtMp, estExpatrie, nbAyantsDroitCMU, totalPersonnesCMU,
    parts, ricf,
    gainsTotaux,
    salarial: {
      its: itsFinal, ricf,
      cnps: cnpsSal,
      cmu: cmuSal,
      total: totalRetenues,
      autresTaxes: [] // Pas de taxes additionnelles en CI
    },
    patronal: {
      cnEmployeur, ceEmployeur, impotEmployeur, fdfpTA, fdfpFPC,
      totalFiscal: totalFiscalEmployeur,
      cnpsPF, cnpsAM, cnpsAT,
      cnpsRetraite: cnpsRetraitePat,
      cmu: cmuPat,
      totalSocial: totalSocialEmployeur,
      grandTotal: totalPatronal,
      autresTaxes: [
        { code: '610', label: 'FDFP - APPRENTISSAGE', taux: 0.004, base: baseFiscale, montant: fdfpTA },
        { code: '612', label: 'FDFP - FORMATION CONTINUE', taux: 0.006, base: baseFiscale, montant: fdfpFPC }
      ]
    },
    netAPayer,
    netAPayerRaw
  }
}
