// ═══════════════════════════════════════════════════════════════
// SERVICE DE CALCUL FISCAL - Côte d'Ivoire 2024
// Source: Code Général des Impôts CI / DGI / pme.gouv.ci
// ═══════════════════════════════════════════════════════════════

// ─── Définition des régimes fiscaux ───────────────────────────
export const REGIMES = {
  entreprenant_tce: {
    id: 'entreprenant_tce',
    label: 'Entreprenant (TCE)',
    description: 'Très petite activité locale',
    caMin: 0,
    caMax: 5_000_000,
    tva: false,
    liberatoire: true,
    couleur: '#10b981',
    taux: { commerce: 0.02, negoce: 0.02, autres: 0.025 },
  },
  entreprenant_tee: {
    id: 'entreprenant_tee',
    label: 'Entreprenant (TEE)',
    description: 'Petite entreprise',
    caMin: 5_000_001,
    caMax: 50_000_000,
    tva: false,
    liberatoire: true,
    couleur: '#3b82f6',
    taux: { commerce: 0.04, negoce: 0.04, autres: 0.05 },
    tauxCGA: { commerce: 0.02, negoce: 0.02, autres: 0.025 },
  },
  rme: {
    id: 'rme',
    label: 'Microentreprises (RME)',
    description: 'PME de taille moyenne',
    caMin: 50_000_001,
    caMax: 200_000_000,
    tva: false,
    liberatoire: true,
    couleur: '#f59e0b',
    taux: 0.06,
  },
  rsi: {
    id: 'rsi',
    label: 'Réel Simplifié (RSI)',
    description: 'PME avec comptabilité complète',
    caMin: 200_000_001,
    caMax: 500_000_000,
    tva: true,
    liberatoire: false,
    couleur: '#8b5cf6',
    imf: { taux: 0.005, minimum: 3_000_000 },
    bic: [
      { plafond: 150_000_000, taux: 0.25 },
      { plafond: Infinity, taux: 0.30 },
    ],
  },
  rni: {
    id: 'rni',
    label: 'Réel Normal (RNI)',
    description: 'Grande entreprise',
    caMin: 500_000_001,
    caMax: Infinity,
    tva: true,
    liberatoire: false,
    couleur: '#ef4444',
  },
}

// ─── Détection automatique du régime ──────────────────────────
export function detecterRegime(ca) {
  if (ca <= 5_000_000) return REGIMES.entreprenant_tce
  if (ca <= 50_000_000) return REGIMES.entreprenant_tee
  if (ca <= 200_000_000) return REGIMES.rme
  if (ca <= 500_000_000) return REGIMES.rsi
  return REGIMES.rni
}

// ─── Calcul de l'impôt annuel ──────────────────────────────────
export function calculerImpot({ regime, ca, benefice, secteur, cga }) {
  const r = typeof regime === 'string' ? REGIMES[regime] : regime

  switch (r.id) {
    case 'entreprenant_tce': {
      const taux = (secteur === 'commerce' || secteur === 'negoce') ? r.taux.commerce : r.taux.autres
      return { impot: Math.round(ca * taux), detail: `${(taux * 100).toFixed(1)}% du CA` }
    }
    case 'entreprenant_tee': {
      const tauxNormal = (secteur === 'commerce' || secteur === 'negoce') ? r.taux.commerce : r.taux.autres
      const tauxApplique = cga ? r.tauxCGA[secteur] || r.tauxCGA.autres : tauxNormal
      const economiesCGA = cga ? Math.round(ca * tauxNormal) - Math.round(ca * tauxApplique) : 0
      return {
        impot: Math.round(ca * tauxApplique),
        detail: `${(tauxApplique * 100).toFixed(1)}% du CA${cga ? ' (taux CGA réduit)' : ''}`,
        economiesCGA
      }
    }
    case 'rme': {
      return { impot: Math.round(ca * r.taux), detail: `6% du CA (RME)` }
    }
    case 'rsi': {
      // Calcul du BIC (Bénéfice Industriel et Commercial)
      const bic = benefice <= 150_000_000
        ? Math.round(benefice * 0.25)
        : Math.round(benefice * 0.30)
      // IMF (Impôt Minimum Forfaitaire)
      const imf = Math.max(Math.round(ca * r.imf.taux), r.imf.minimum)
      const impot = Math.max(bic, imf)
      return {
        impot,
        bic,
        imf,
        detail: impot === imf ? `IMF appliqué (0,5% du CA, min 3M)` : `IS ${benefice <= 150_000_000 ? '25' : '30'}% du bénéfice`,
        imfApplique: impot === imf
      }
    }
    default:
      return { impot: 0, detail: 'Régime non calculable (RNI - consultez un expert)' }
  }
}

// ─── Calcul complet de la situation actuelle ───────────────────
export function calculerSituationActuelle(params) {
  const { ca, chargesFixes, chargesVariables, secteur, cga, beneficeManuel } = params

  const regime = detecterRegime(ca)
  const totalCharges = chargesFixes + chargesVariables
  const benefice = beneficeManuel !== undefined ? beneficeManuel : (ca - totalCharges)

  const { impot, detail, bic, imf, imfApplique, economiesCGA } = calculerImpot({
    regime, ca, benefice, secteur, cga
  })

  const beneficeNet = benefice - impot
  const margeNette = ca > 0 ? (beneficeNet / ca) * 100 : 0
  const margeBrute = ca > 0 ? ((ca - chargesVariables) / ca) * 100 : 0

  // Seuil de rentabilité
  const txMargeCv = ca > 0 ? (ca - chargesVariables) / ca : 1
  const seuilRentabilite = txMargeCv > 0 ? Math.round(chargesFixes / txMargeCv) : 0

  // Paiements
  const paiementMensuel = Math.round(impot / 12)
  const acompteTrimestriel = Math.round(impot / 3)

  // Santé financière (feux tricolores)
  let sante = 'vert'
  let santeMessage = ''
  if (beneficeNet < 0) {
    sante = 'rouge'
    santeMessage = 'Attention : votre activité est en déficit !'
  } else if (margeNette < 10) {
    sante = 'orange'
    santeMessage = 'Marge faible : surveillez vos charges de près.'
  } else if (margeNette >= 20) {
    sante = 'vert'
    santeMessage = 'Bonne rentabilité ! Continuez sur cette lancée.'
  } else {
    sante = 'vert'
    santeMessage = 'Situation correcte, des améliorations sont possibles.'
  }

  // Alerte changement de régime
  const prochainSeuil = regime.caMax
  const distanceSeuil = prochainSeuil - ca
  const alerteRegime = distanceSeuil > 0 && distanceSeuil < ca * 0.3
    ? `Attention : vous approchez du seuil ${formatFCFA(prochainSeuil)} FCFA (passage au régime supérieur dans ~1-2 ans si croissance continue).`
    : null

  return {
    regime, impot, detail, bic, imf, imfApplique, economiesCGA,
    benefice, beneficeNet, margeNette, margeBrute,
    totalCharges, seuilRentabilite,
    paiementMensuel, acompteTrimestriel,
    sante, santeMessage, alerteRegime,
    auDessusDuSeuil: ca > seuilRentabilite
  }
}

// ─── Projection sur N années ────────────────────────────────────
export function projeterSurNAns(params, nAns, scenariosConfig) {
  const { ca, chargesFixes, chargesVariables, secteur, cga } = params

  return Object.entries(scenariosConfig).map(([key, config]) => {
    const annees = Array.from({ length: nAns }, (_, i) => {
      const annee = new Date().getFullYear() + i
      const caProj = Math.round(ca * Math.pow(1 + config.croissanceCA, i))
      const cfProj = Math.round(chargesFixes * Math.pow(1 + (config.croissanceCharges || 0.03), i))
      const cvProj = Math.round(chargesVariables * (caProj / ca))
      const totalChargesProj = cfProj + cvProj
      const beneficeProj = caProj - totalChargesProj
      const regimeProj = detecterRegime(caProj)
      const { impot } = calculerImpot({ regime: regimeProj, ca: caProj, benefice: beneficeProj, secteur, cga })
      const beneficeNetProj = beneficeProj - impot
      const margeNetteProj = caProj > 0 ? (beneficeNetProj / caProj) * 100 : 0

      return {
        annee, ca: caProj, chargesFixes: cfProj, chargesVariables: cvProj,
        totalCharges: totalChargesProj, benefice: beneficeProj,
        regime: regimeProj.label, regimeId: regimeProj.id,
        impot, beneficeNet: beneficeNetProj, margeNette: margeNetteProj,
        paiementMensuel: Math.round(impot / 12),
        changementRegime: regimeProj.id !== detecterRegime(i === 0 ? ca : Math.round(ca * Math.pow(1 + config.croissanceCA, i - 1))).id
      }
    })

    return { scenario: key, label: config.label, couleur: config.couleur, annees }
  })
}

// ─── Scénarios prédéfinis ───────────────────────────────────────
export const SCENARIOS_DEFAUT = {
  pessimiste: {
    label: 'Pessimiste', couleur: '#dc2626',
    croissanceCA: 0.03, croissanceCharges: 0.05
  },
  realiste: {
    label: 'Réaliste', couleur: '#2563eb',
    croissanceCA: 0.10, croissanceCharges: 0.04
  },
  optimiste: {
    label: 'Optimiste', couleur: '#15803d',
    croissanceCA: 0.20, croissanceCharges: 0.06
  },
}

// ─── Suggestions d'optimisation ────────────────────────────────
export function genererSuggestions(resultats, params) {
  const suggestions = []

  if (!params.cga && ['entreprenant_tee'].includes(resultats.regime.id)) {
    const economie = resultats.impot * 0.5 - 150_000
    if (economie > 0) {
      suggestions.push({
        titre: 'Adhérez à un Centre de Gestion Agréé (CGA)',
        description: 'Vous pouvez réduire votre impôt de 50% en adhérant à un CGA.',
        economie,
        action: `Économie nette estimée : ${formatFCFA(economie)} FCFA/an (après cotisation ~150 000 FCFA)`
      })
    }
  }

  suggestions.push({
    titre: 'Planifiez vos paiements d\'impôt',
    description: 'Évitez les mauvaises surprises en provisionnant chaque mois.',
    action: `Mettez de côté ${formatFCFA(resultats.paiementMensuel)} FCFA chaque mois pour votre impôt annuel`
  })

  if (resultats.margeNette < 15) {
    suggestions.push({
      titre: 'Améliorez votre marge',
      description: 'Votre marge nette est inférieure à 15%, ce qui laisse peu de marge de manœuvre.',
      action: 'Analysez vos charges variables : où pouvez-vous négocier ou réduire les coûts ?'
    })
  }

  if (resultats.alerteRegime) {
    suggestions.push({
      titre: 'Anticipez le changement de régime',
      description: 'Votre croissance vous amène vers un régime fiscal différent avec plus d\'obligations.',
      action: 'Consultez un comptable pour préparer votre comptabilité au nouveau régime RSI'
    })
  }

  return suggestions
}

// ─── Utilitaire formatage ───────────────────────────────────────
export function formatFCFA(val) {
  if (val === null || val === undefined || isNaN(val)) return '0'
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export const SECTEURS = [
  {
    id: 'commerce',
    label: 'Commerce / Négoce',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/></svg>`
  },
  {
    id: 'services',
    label: 'Services / Conseil',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z"/></svg>`
  },
  {
    id: 'artisanat',
    label: 'Artisanat / Métiers',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l5.654-4.654m5.896-2.613.617-.923a2.25 2.25 0 0 0-.933-3.26 2.25 2.25 0 0 1-2.206-2.22V5.25A2.25 2.25 0 0 0 9 3H5.25A2.25 2.25 0 0 0 3 5.25v3.75A2.25 2.25 0 0 0 5.25 11.25h2.206c.98 0 1.815.7 2.004 1.66l.047.234c.11.55.421 1.04.869 1.38Z"/></svg>`
  },
  {
    id: 'industrie',
    label: 'Industrie / Production',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z"/></svg>`
  },
  {
    id: 'btp',
    label: 'BTP / Construction',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z"/></svg>`
  },
  {
    id: 'restauration',
    label: 'Restauration / Hôtellerie',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.379a48.474 48.474 0 0 0-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12M12.265 3.11a.375.375 0 1 1-.53 0L12 2.845l.265.265Zm-3 0a.375.375 0 1 1-.53 0L9 2.845l.265.265Zm6 0a.375.375 0 1 1-.53 0L15 2.845l.265.265Z"/></svg>`
  },
  {
    id: 'transport',
    label: 'Transport / Logistique',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"/></svg>`
  },
  {
    id: 'agriculture',
    label: 'Agriculture / Agro',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"/></svg>`
  },
]

// ─── Modèles préconfigurés par type de commerce ────────────────
// Valeurs typiques pour les commerces en Côte d'Ivoire (2024)
export const MODELES_COMMERCE = [
  {
    id: 'boulangerie',
    label: 'Boulangerie',
    secteur: 'artisanat',
    caExempleAnnuel: 7_200_000,     // 600 000 FCFA/mois
    chargesFixesMois: 550_000,       // Loyer 250k + 1 boulanger 200k + électricité four 100k
    chargesVariablesPct: 0.45,       // Farine, levure, beurre, emballages
    descChargesFixes: 'Loyer du local, salaire boulanger, électricité (four)',
    descChargesVar: 'Farine, levure, beurre, emballages (~45% du CA)',
    emoji: '🍞',
    couleur: '#b45309',
    bg: '#fffbeb',
    border: '#fde68a',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.379a48.474 48.474 0 0 0-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12M12.265 3.11a.375.375 0 1 1-.53 0L12 2.845l.265.265Zm-3 0a.375.375 0 1 1-.53 0L9 2.845l.265.265Zm6 0a.375.375 0 1 1-.53 0L15 2.845l.265.265Z"/></svg>`,
  },
  {
    id: 'boutique',
    label: 'Boutique / Vêtements',
    secteur: 'commerce',
    caExempleAnnuel: 18_000_000,
    chargesFixesMois: 480_000,       // Loyer 300k + 1 vendeur 180k
    chargesVariablesPct: 0.60,       // Achats de stock
    descChargesFixes: 'Loyer, salaire vendeur, eau & électricité',
    descChargesVar: 'Achat de marchandises, emballages (~60% du CA)',
    couleur: '#7c3aed',
    bg: '#faf5ff',
    border: '#e9d5ff',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/></svg>`,
  },
  {
    id: 'restaurant',
    label: 'Restaurant / Maquis',
    secteur: 'restauration',
    caExempleAnnuel: 12_000_000,
    chargesFixesMois: 750_000,       // Loyer 400k + 2 employés 250k + gaz 100k
    chargesVariablesPct: 0.42,       // Ingrédients, épices, condiments
    descChargesFixes: 'Loyer, personnel, gaz, électricité',
    descChargesVar: 'Ingrédients, boissons, condiments (~42% du CA)',
    couleur: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.379a48.474 48.474 0 0 0-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12M12.265 3.11a.375.375 0 1 1-.53 0L12 2.845l.265.265Zm-3 0a.375.375 0 1 1-.53 0L9 2.845l.265.265Zm6 0a.375.375 0 1 1-.53 0L15 2.845l.265.265Z"/></svg>`,
  },
  {
    id: 'salon',
    label: 'Salon de coiffure',
    secteur: 'services',
    caExempleAnnuel: 5_400_000,
    chargesFixesMois: 320_000,       // Loyer 200k + 1 coiffeur 120k
    chargesVariablesPct: 0.20,       // Produits capillaires
    descChargesFixes: 'Loyer, salaire coiffeur/coiffeuse, électricité',
    descChargesVar: 'Produits capillaires, accessoires (~20% du CA)',
    couleur: '#0891b2',
    bg: '#ecfeff',
    border: '#a5f3fc',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"/></svg>`,
  },
  {
    id: 'epicerie',
    label: 'Épicerie / Alimentaire',
    secteur: 'commerce',
    caExempleAnnuel: 24_000_000,
    chargesFixesMois: 520_000,       // Loyer 350k + 1 vendeur 170k
    chargesVariablesPct: 0.68,       // Achats de vivres
    descChargesFixes: 'Loyer, salaire vendeur, eau & électricité',
    descChargesVar: 'Achats de vivres, produits alimentaires (~68% du CA)',
    couleur: '#15803d',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"/></svg>`,
  },
  {
    id: 'taxi',
    label: 'Transport / Taxi',
    secteur: 'transport',
    caExempleAnnuel: 8_400_000,
    chargesFixesMois: 180_000,       // Assurance 60k + entretien moyen 80k + téléphone 40k
    chargesVariablesPct: 0.35,       // Carburant
    descChargesFixes: 'Assurance, entretien véhicule, téléphone',
    descChargesVar: 'Carburant, lavage, petits entretiens (~35% du CA)',
    couleur: '#1d4ed8',
    bg: '#eff6ff',
    border: '#bfdbfe',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"/></svg>`,
  },
  {
    id: 'pharmacie',
    label: 'Pharmacie',
    secteur: 'services',
    caExempleAnnuel: 36_000_000,
    chargesFixesMois: 1_050_000,     // Loyer 500k + pharmacien 400k + aide 150k
    chargesVariablesPct: 0.55,       // Achats médicaments
    descChargesFixes: 'Loyer, salaires (pharmacien + aide), eau & électricité',
    descChargesVar: 'Achats médicaments et produits parapharmaceutiques (~55% du CA)',
    couleur: '#0f766e',
    bg: '#f0fdfa',
    border: '#99f6e4',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"/></svg>`,
  },
  {
    id: 'informatique',
    label: 'Informatique / Téléphonie',
    secteur: 'commerce',
    caExempleAnnuel: 14_400_000,
    chargesFixesMois: 430_000,       // Loyer 250k + 1 technicien 180k
    chargesVariablesPct: 0.55,       // Achats matériel, accessoires
    descChargesFixes: 'Loyer, salaire technicien, connexion internet',
    descChargesVar: 'Achats matériel, téléphones, accessoires (~55% du CA)',
    couleur: '#64748b',
    bg: '#f8fafc',
    border: '#e2e8f0',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>`,
  },
]


// ─── 1. Simulateur CNPS (Estimation simplifiée CI 2024) ────────
export function calculerCNPS(salaireNet) {
  // Estimation inverse : du net vers le brut (approximatif)
  // En CI, le brut est environ 1.15x le net (hors IGR complexe)
  const salaireBrut = Math.round(salaireNet * 1.18)
  
  // Cotisations Travailleur (Retraite 6.3%)
  const partSalariale = Math.round(salaireBrut * 0.063)
  
  // Cotisations Patronales (Retraite 7.7% + Famille 5% + AT 2%) = 14.7%
  // Plafond CNPS : 3 000 000 FCFA
  const assiette = Math.min(salaireBrut, 3_000_000)
  const partPatronale = Math.round(assiette * 0.147)
  
  return {
    salaireBrut,
    partSalariale,
    partPatronale,
    coutTotal: salaireBrut + partPatronale,
    chargesTotales: partSalariale + partPatronale
  }
}

// ─── 2. Calculateur Prix de Vente (Net d'Impôts) ──────────────
export function calculerPrixVenteIdeal(prixAchat, margeSouhaiteePct, regimeId, secteur) {
  const r = REGIMES[regimeId] || REGIMES.entreprenant_tee
  const tauxImpot = (secteur === 'commerce' || secteur === 'negoce') ? (r.taux?.commerce || 0.04) : (r.taux?.autres || 0.05)
  
  // Formule pour que le prix de vente couvre l'impôt sur le CA et la marge nette
  // PV = (PrixAchat / (1 - Marge% - TauxImpot))
  const diviseur = (1 - (margeSouhaiteePct / 100) - tauxImpot)
  const pvIdeal = diviseur > 0 ? Math.round(prixAchat / diviseur) : prixAchat * 2
  
  const impotSurVente = Math.round(pvIdeal * tauxImpot)
  const margeReelle = pvIdeal - prixAchat - impotSurVente
  
  return {
    pvIdeal,
    impotSurVente,
    margeReelle,
    tauxImpotApplique: tauxImpot * 100
  }
}

// ─── 3. Score de Santé Financière ONDA ─────────────────────────
export function calculerScoreOnda(resultats) {
  let score = 0
  const criteres = []
  
  // 1. Rentabilité (40 pts)
  if (resultats.margeNette > 20) { score += 40; criteres.push('Excellente rentabilité') }
  else if (resultats.margeNette > 10) { score += 25; criteres.push('Rentabilité correcte') }
  else if (resultats.margeNette > 0) { score += 10; criteres.push('Faible rentabilité') }
  
  // 2. Sécurité (Seuil de rentabilité) (30 pts)
  const margeSecurite = ((resultats.regime.caMax || resultats.benefice + resultats.totalCharges) - resultats.seuilRentabilite) 
  if (resultats.auDessusDuSeuil) { score += 30; criteres.push('Point mort atteint') }
  
  // 3. Optimisation Fiscale (15 pts)
  if (resultats.economiesCGA > 0) { score += 15; criteres.push('Fiscalité optimisée (CGA)') }
  
  // 4. Structure de charges (15 pts)
  const ratioCharges = (resultats.totalCharges / (resultats.benefice + resultats.totalCharges)) * 100
  if (ratioCharges < 50) { score += 15; criteres.push('Charges maîtrisées') }
  
  let grade = 'C'
  if (score > 80) grade = 'A'
  else if (score > 50) grade = 'B'
  
  return { score, grade, criteres }
}

// ─── 4. Recommandation Statut Juridique ────────────────────────
export function recommanderStatut(caAnnuel, nbAssocies) {
  if (caAnnuel > 500_000_000) {
    return { statut: 'SA (Société Anonyme)', raison: 'Chiffre d\'affaires important, structure de capitaux nécessaire.' }
  }
  if (caAnnuel > 50_000_000 || nbAssocies > 1) {
    return { statut: 'SARL (Société à Responsabilité Limitée)', raison: 'Protection du patrimoine personnel et gestion multi-associés.' }
  }
  if (caAnnuel > 5_000_000) {
    return { statut: 'Entreprise Individuelle (Établissement)', raison: 'Gestion simple, idéal pour les PME en croissance.' }
  }
  return { statut: 'Entreprenant', raison: 'Régime ultra-simplifié pour débuter sans contraintes.' }
}

// ─── 5. Capacité d'Emprunt ─────────────────────────────────────
export function calculerCapaciteEmprunt(beneficeNetAnnuel, dureeAns = 3) {
  // Règle de prudence : 30% du bénéfice net mensuel consacré au remboursement
  const mensualiteMax = Math.round((beneficeNetAnnuel / 12) * 0.30)
  
  // Estimation du capital empruntable (taux ~12% en CI)
  const tauxMensuel = 0.12 / 12
  const nbMois = dureeAns * 12
  
  // Formule mensualité : M = P * [r(1+r)^n] / [(1+r)^n - 1]
  // => P = M * [(1+r)^n - 1] / [r(1+r)^n]
  const denom = (tauxMensuel * Math.pow(1 + tauxMensuel, nbMois))
  const capital = mensualiteMax * (Math.pow(1 + tauxMensuel, nbMois) - 1) / denom
  
  return {
    mensualiteMax,
    capitalEstimé: Math.round(capital),
    duree: dureeAns,
    taux: 12
  }
}

/**
 * Calcule le seuil de rentabilité (Point Mort)
 */
export function calculerSeuilRentabilite(caAnnuel, chargesFixesAnnuel, chargesVariablesAnnuel) {
  const margeBrute = caAnnuel - chargesVariablesAnnuel
  const tauxMargeBrute = caAnnuel > 0 ? (margeBrute / caAnnuel) : 0
  
  // Point mort en CA = Charges Fixes / Taux de Marge Brute
  const seuilCA = tauxMargeBrute > 0 ? (chargesFixesAnnuel / tauxMargeBrute) : 0
  
  return {
    seuilCA: Math.round(seuilCA),
    seuilJournalier: Math.round(seuilCA / 360),
    joursPourRentabilite: seuilCA > 0 ? Math.round((seuilCA / caAnnuel) * 360) : 0,
    estRentable: caAnnuel >= seuilCA
  }
}

/**
 * Analyse l'impact du passage à la TVA (RSI/RNI)
 * @param {number} caHT - Chiffre d'affaires Hors Taxe
 * @param {number} achatsHT - Achats Hors Taxe (soumis à TVA)
 */
export function analyserImpactTVA(caHT, achatsHT) {
  const tauxTVA = 0.18 // Norme CI
  const tvaCollectee = caHT * tauxTVA
  const tvaDeductible = achatsHT * tauxTVA
  const tvaAPayer = Math.max(0, tvaCollectee - tvaDeductible)
  
  return {
    tvaCollectee,
    tvaDeductible,
    tvaAPayer,
    prixPublicTTC: caHT * (1 + tauxTVA),
    impactPrix: 18 // % d'augmentation si on veut garder la même marge HT
  }
}
