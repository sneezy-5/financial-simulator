export function calculateCIPayslip(baseData, emp, rules) {
  const brutImposable = baseData.salaireBrut
  const gainsTotaux = brutImposable + baseData.primeTransport + baseData.primeLogement + baseData.primesNonImposablesRub

  // Charges fiscales employeur
  const baseFiscale = brutImposable
  const impotEmployeur = Math.round(baseFiscale * rules.tauxImpotEmployeurLocal)
  const fdfpTA = Math.round(baseFiscale * 0.004)
  const fdfpFPC = Math.round(baseFiscale * 0.006)
  const totalFiscalEmployeur = impotEmployeur + fdfpTA + fdfpFPC

  // Charges sociales employeur
  const plafondCNPS = rules.plafondRetraite
  const baseCNPS = Math.min(brutImposable, plafondCNPS)
  const baseCNPS_PfAtAm = Math.min(brutImposable, rules.plafondPF)
  const cnpsPF = Math.round(baseCNPS_PfAtAm * rules.tauxPFPat)
  const cnpsAM = Math.round(baseCNPS_PfAtAm * 0.0075)
  const cnpsAT = Math.round(baseCNPS_PfAtAm * rules.tauxATPat)
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

  let itsFinal = 0, ricf = 0
  let is = 0, cn = 0, igr = 0

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

  if (emp.regime !== 'ancien') {
    // RÉFORME 2024 (ITS UNIQUE)
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
    ricf = Math.max(0, (parts - 1) * 11000)
    itsFinal = Math.max(0, itsBrut - ricf)
  } else {
    // ANCIENNE LOI (IS, CN, IGR)
    is = Math.round(brutImposable * 0.012)
    if (brutImposable > 50000) {
      if (brutImposable <= 130000) cn = Math.round((brutImposable - 50000) * 0.015)
      else if (brutImposable <= 200000) cn = 1200 + Math.round((brutImposable - 130000) * 0.05)
      else cn = 4700 + Math.round((brutImposable - 200000) * 0.10)
    }

    const baseIGR = (brutImposable - is - cn - cnpsSal) * 0.85
    const quotientFamilial = baseIGR / parts

    let igrParPart = 0
    if (quotientFamilial > 25000) {
      if (quotientFamilial <= 45583) igrParPart = (quotientFamilial - 25000) * 0.10
      else if (quotientFamilial <= 81666) igrParPart = (quotientFamilial * 0.15) - 2292
      else if (quotientFamilial <= 126666) igrParPart = (quotientFamilial * 0.20) - 6375
      else if (quotientFamilial <= 220833) igrParPart = (quotientFamilial * 0.25) - 12708
      else if (quotientFamilial <= 389166) igrParPart = (quotientFamilial * 0.35) - 34792
      else igrParPart = (quotientFamilial * 0.45) - 73708
    }
    igr = Math.max(0, Math.round(igrParPart * parts))
  }

  const impots = emp.regime !== 'ancien' ? itsFinal : (is + cn + igr)
  const totalRetenues = impots + cnpsSal + cmuSal + baseData.totalRetenuesDiverses
  const netAPayerRaw = gainsTotaux - totalRetenues
  const netAPayer = Math.max(0, netAPayerRaw)

  return {
    ...baseData,
    brutImposable, baseFiscale, baseCNPS, baseCNPS_PfAtAm, tauxAT: rules.tauxATPat, nbAyantsDroitCMU, totalPersonnesCMU,
    parts, ricf,
    gainsTotaux,
    salarial: {
      its: itsFinal, ricf,
      is, cn, igr,
      cnps: cnpsSal,
      cmu: cmuSal,
      regime: emp.regime,
      total: totalRetenues,
      autresTaxes: [] // Pas de taxes additionnelles en CI
    },
    patronal: {
      impotEmployeur, fdfpTA, fdfpFPC,
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
