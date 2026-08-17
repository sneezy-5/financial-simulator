export function calculateBJPayslip(baseData, emp, rules) {
  const brutImposable = baseData.salaireBrut
  const gainsTotaux = brutImposable + baseData.primeTransport + baseData.primeLogement + baseData.primesNonImposablesRub

  // Charges fiscales employeur
  const baseFiscale = brutImposable
  // VPS (Versement Patronal sur Salaires) - 4%
  const impotEmployeur = Math.round(baseFiscale * rules.tauxImpotEmployeurLocal)
  const totalFiscalEmployeur = impotEmployeur

  // Charges sociales employeur
  // Au Bénin : PF = 9%, Retraite = 6.4%, AT = 1% à 4% (défaut: 1% pour arriver à 16.4%)
  const plafondCNSS = rules.plafondRetraite // 1 200 000 FCFA
  const baseCNSS = Math.min(brutImposable, plafondCNSS)
  
  const cnssPF = Math.round(baseCNSS * rules.tauxPFPat) // 9%
  const cnssRetraitePat = Math.round(baseCNSS * rules.tauxRetraitePat) // 6.4%
  const cnssAT = Math.round(baseCNSS * rules.tauxATPat) // 1% (configuré)
  const cnpsPF = cnssPF // Alias pour compatibilité template
  const cnpsAT = cnssAT
  const cnpsAM = 0 // Pas d'assurance maternité séparée à charge patronale comme en CI
  
  const totalSocialEmployeur = cnssPF + cnssRetraitePat + cnssAT
  const totalPatronal = totalFiscalEmployeur + totalSocialEmployeur

  // Charges Salariales
  // Retraite salariale = 3.6%
  const cnssSal = Math.round(baseCNSS * rules.tauxRetraiteSal)
  const cnpsSal = cnssSal // Alias compatibilité

  // Calcul ITS Bénin (Barème progressif mensuel)
  // Base = Salaire Brut - CNSS Salariale
  const salImposable = brutImposable - cnssSal
  const baseITS = salImposable
  const tranches = [
    { plafond: 60000, taux: 0.00 },
    { plafond: 150000, taux: 0.10 },
    { plafond: 250000, taux: 0.15 },
    { plafond: 500000, taux: 0.19 },
    { plafond: Infinity, taux: 0.30 }
  ]
  
  let itsFinal = 0
  let prec = 0
  for (const { plafond, taux } of tranches) {
    if (salImposable <= prec) break
    itsFinal += (Math.min(salImposable, plafond) - prec) * taux
    prec = plafond
  }
  itsFinal = Math.round(itsFinal)

  // Redevance spéciale (ORTB/SRTB) en Mars et Juin
  let redevanceSpeciale = 0
  if (salImposable > 60000) {
    if (emp.mois === 3) {
      redevanceSpeciale = 1000
    } else if (emp.mois === 6) {
      redevanceSpeciale = 3000
    }
  }

  const autresTaxesSalariales = []
  if (redevanceSpeciale > 0) {
    autresTaxesSalariales.push({
      code: '411',
      label: 'REDEVANCE SPECIALE ORTB/SRTB',
      taux: null,
      base: null,
      montant: redevanceSpeciale
    })
  }

  const impots = itsFinal + redevanceSpeciale
  const totalRetenues = impots + cnssSal + baseData.totalRetenuesDiverses
  const netAPayerRaw = gainsTotaux - totalRetenues
  const netAPayer = Math.max(0, netAPayerRaw)

  return {
    ...baseData,
    brutImposable, baseFiscale, baseCNPS: baseCNSS, baseCNPS_PfAtAm: baseCNSS, tauxAT: rules.tauxATPat, 
    nbAyantsDroitCMU: 0, totalPersonnesCMU: 0,
    parts: 0, ricf: 0, // Pas de quotient familial/RICF au Bénin
    gainsTotaux,
    salarial: {
      its: itsFinal, ricf: 0,
      baseITS,
      is: 0, cn: 0, igr: 0,
      cnps: cnssSal,
      cmu: 0,
      regime: '2024',
      total: totalRetenues,
      autresTaxes: autresTaxesSalariales
    },
    patronal: {
      impotEmployeur, fdfpTA: 0, fdfpFPC: 0,
      totalFiscal: totalFiscalEmployeur,
      cnpsPF, cnpsAM, cnpsAT,
      cnpsRetraite: cnssRetraitePat,
      cmu: 0,
      totalSocial: totalSocialEmployeur,
      grandTotal: totalPatronal,
      autresTaxes: []
    },
    netAPayer,
    netAPayerRaw
  }
}
