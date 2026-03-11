<script setup>
import { ref, computed } from 'vue'

// ══════════════════════════════════════════════
// DONNÉES DE L'EMPLOYÉ
// ══════════════════════════════════════════════
const emp = ref({
  // Entreprise
  nom_entreprise: '',
  adresse: "Abidjan, Côte d'Ivoire",
  siege_social: '',
  email_entreprise: '',
  tel_entreprise: '',
  numero_cnps: '',
  numero_contribuable: '',
  numero_rc: '',
  // Employé
  matricule: '',
  nom: '',
  prenom: '',
  poste: '',
  date_naissance: '',
  num_secu: '',
  ville: 'ABIDJAN',
  categorie: '',
  qualification: '',
  type_contrat: 'CDI',
  situation_matrimoniale: 'celibataire',
  nombre_enfants: 0,
  date_embauche: '',
  // Temps de travail (basé sur le modèle Excel)
  jours_travailles: 26,   // Jours réellement travaillés ce mois
  absences_jours: 0,      // Jours d'absence (déduits automatiquement)
  heures_sup_nb: 0,       // Nombre d'heures supplémentaires
  heures_sup_coef: 1.15,  // Coefficient de majoration (1.15 = +15%, 1.50 = +50%...)
  jours_conges_pris: 0,   // Jours de congés payés pris ce mois
  // Rémunération de base
  salaire_base: 0,
  sursalaire: 0,
  prime_transport: 30000,
  prime_logement: 0,
  // Primes libres (imposables ou non)
  primes: [
    { id: 1, label: 'Prime de fonction', montant: 0, imposable: true },
    { id: 2, label: 'Prime de responsabilité', montant: 0, imposable: true },
    { id: 3, label: 'Autres indemnités', montant: 0, imposable: false }
  ],
  // Retenues salariales
  acompte: 0,
  avance: 0,
  opposition: 0,
  autres_retenues: 0,
  // Cotisations
  auto_anciennete: true,
  taux_at: 0.02,
  ayants_droit_cmu: 0,
  // Régime fiscal
  regime: '2024',
  // Période
  mois: new Date().getMonth() + 1,
  annee: new Date().getFullYear(),
  // Paiement
  virement: true,
  rib: ''
})

const moisLabels = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

const generating = ref(false)
const generated = ref(false)
const downloadUrl = ref(null)
const errorMsg = ref(null)
const activeTab = ref('employe') // 'entreprise' | 'employe' | 'remuneration'
const showHelp = ref(false)

const explanations = {
  salaire_base: {
    title: "Salaire de Base",
    text: "C'est la rémunération convenue au contrat pour 173.33 heures le mois. Si vous travaillez moins d'heures, il est réduit au prorata. C'est la base de calcul pour la plupart des primes et indemnités."
  },
  heures_sup: {
    title: "Heures Supplémentaires",
    text: "Toute heure travaillée au-delà de 40h/semaine. En Côte d'Ivoire, elles sont majorées (15%, 50%, 75% ou 100% selon le moment). Elles augmentent votre brut imposable et donc votre net, mais aussi vos impôts."
  },
  its_2024: {
    title: "ITS Unique (Réforme 2024)",
    text: "Depuis janvier 2024, l'IS, la CN et l'IGR sont fusionnés en un Impôt Unique (ITS). Le calcul est progressif par tranches. Plus votre salaire est élevé, plus le taux appliqué sur la tranche supérieure augmente."
  },
  cnps: {
    title: "CNPS (Retraite)",
    text: "Une part de 6.3% est retenue sur votre salaire brut (plafonné à 3.375.000 FCFA) pour financer votre future retraite. L'employeur paie aussi 7.7% de son côté."
  },
  cmu: {
    title: "CMU (Assurance Maladie)",
    text: "Cotisation de 1000 FCFA par personne (vous et vos ayants droit). Elle permet d'accéder aux soins à prix réduit dans les centres conventionnés."
  },
  ricf: {
    title: "Réduction RICF",
    text: "C'est un cadeau fiscal ! Plus vous avez de parts (marié, enfants), plus votre impôt ITS est réduit. Chaque part supplémentaire après la première réduit l'impôt de 11.000 FCFA par mois."
  },
  transport: {
    title: "Prime de Transport",
    text: "C'est une indemnité pour vos frais de déplacement. Contrairement au salaire, elle n'est pas imposable (jusqu'à 30.000 FCFA généralement) : vous recevez 100% du montant sans retenue."
  },
  anciennete: {
    title: "Prime d'Ancienneté",
    text: "Générée automatiquement si vous avez plus de 2 ans de service (basé sur la date d'embauche). Le taux commence à 2% après 2 ans et gagne +1% par an, plafonné à 25%."
  },
  conges: {
    title: "Allocation Congés Payés",
    text: "Si vous prenez des jours de repos, cette indemnité remplace le salaire des jours correspondants. Elle est imposable et soumise à cotisations car elle remplace un revenu."
  }
}

// ══════════════════════════════════════════════
// CALCULS EN TEMPS RÉEL
// ══════════════════════════════════════════════
const calc = computed(() => {
  const salaireBaseMensuel = +emp.value.salaire_base || 0
  const joursDansLeMois = 30 // Standard paie ivoirienne
  // Jours effectivement payés = jours travaillés - absences
  const joursTrav = Math.max(0, (+emp.value.jours_travailles || 26) - (+emp.value.absences_jours || 0))
  
  const salaireBase = Math.round((salaireBaseMensuel / joursDansLeMois) * joursTrav)
  const sursalaire = Math.round((+emp.value.sursalaire || 0) / joursDansLeMois * joursTrav)
  const primeTransport = +emp.value.prime_transport || 0
  const primeLogement = +emp.value.prime_logement || 0
  
  // Heures supplémentaires : taux horaire = salaire mensuel / 173.33h
  // Montant HS = nb heures × taux horaire × coefficient majoration
  const nbHeuresSup = +emp.value.heures_sup_nb || 0
  const coefHS = +emp.value.heures_sup_coef || 1.15
  const tauxHoraire = salaireBaseMensuel > 0 ? Math.round(salaireBaseMensuel / 173.33) : 0
  const montantHeuresSup = Math.round(nbHeuresSup * tauxHoraire * coefHS)

  const primesImposables = emp.value.primes.filter(p => p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0)
  const primesNonImposablesRub = emp.value.primes.filter(p => !p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0)
  const gratification = 0
  const preavisVal = 0
  const indemLicenciement = 0
  const indemTransac = 0
  const fraisFuneraires = 0

  // -- CALCUL AUTO ANCIENNETÉ --
  let primeAnciennete = 0
  let ansAnciennete = 0
  let ancienneteTxt = "0 ans 00 mois"
  if (emp.value.auto_anciennete && emp.value.date_embauche) {
    const embauche = new Date(emp.value.date_embauche)
    const datePaie = new Date(emp.value.annee, emp.value.mois - 1, 1)
    
    let diffAns = datePaie.getFullYear() - embauche.getFullYear()
    let diffMois = datePaie.getMonth() - embauche.getMonth()
    if (diffMois < 0) {
      diffAns--
      diffMois += 12
    }
    ansAnciennete = Math.max(0, diffAns)
    ancienneteTxt = `${ansAnciennete} ans ${String(Math.max(0, diffMois)).padStart(2, '0')} mois`
    
    // Taux: 2% après 2 ans, +1% par an, avec un plafond max de 25%
    let tauxAnciennete = 0
    if (ansAnciennete >= 2) {
      tauxAnciennete = Math.min(25, 2 + (ansAnciennete - 2))
    }
    primeAnciennete = Math.round(salaireBaseMensuel * (tauxAnciennete / 100))
  }

  // -- CALCUL ALLOOCATION CONGÉS PAYÉS --
  let allocationConges = 0;
  const joursCP = +(emp.value.jours_conges_pris) || 0;
  if (joursCP > 0) {
     const baseCP = salaireBaseMensuel + (+emp.value.sursalaire || 0) + primeAnciennete
     allocationConges = Math.round((baseCP / joursDansLeMois) * joursCP);
  }

  // Le brut imposable (Ordre LOGIPAIE)
  // Inclut : Salaire base + Sursalaire + HS + Ancienneté + Congés + Primes Imposables + Gratif + Préavis
  const salaireBrut = salaireBase + sursalaire + primeAnciennete + allocationConges + montantHeuresSup + primesImposables
  const brutImposable = salaireBrut
  // Total Gains (inclut le brut + éléments non imposables)
  const gainsTotaux = salaireBrut + primeTransport + primeLogement + primesNonImposablesRub

  // Charges fiscales employeur (sur brut imposable)
  const baseFiscale = brutImposable
  const impotEmployeur = Math.round(baseFiscale * 0.012)
  const fdfpTA = Math.round(baseFiscale * 0.004)
  const fdfpFPC = Math.round(baseFiscale * 0.006)
  const totalFiscalEmployeur = impotEmployeur + fdfpTA + fdfpFPC

  // Charges sociales employeur - Normes 2024
  const plafondCNPS = 3375000
  const baseCNPS = Math.min(brutImposable, plafondCNPS)
  const baseCNPS_PfAtAm = Math.min(brutImposable, 75000) // Plafond SMIG 2023 = 75 000
  const tauxAT = +emp.value.taux_at || 0.02
  const cnpsPF = Math.round(baseCNPS_PfAtAm * 0.05)       // 5% Prestations Familiales
  const cnpsAM = Math.round(baseCNPS_PfAtAm * 0.0075)     // 0.75% Assurance Maternité
  const cnpsAT = Math.round(baseCNPS_PfAtAm * tauxAT)     // 2-5% Accident Travail
  const cnpsRetraitePat = Math.round(baseCNPS * 0.077)     // 7.7% Retraite Patronale
  
  // CMU avec ayants droit
  const nbAyantsDroitCMU = Math.max(0, +emp.value.ayants_droit_cmu || 0)
  const cmuPat = 500 * (1 + nbAyantsDroitCMU)
  const totalSocialEmployeur = cnpsPF + cnpsAM + cnpsAT + cnpsRetraitePat + cmuPat
  const totalPatronal = totalFiscalEmployeur + totalSocialEmployeur

  // 4. Calculs Charges Salariales
  const cnpsSal = Math.round(baseCNPS * 0.063)
  
  let itsFinal = 0, ricf = 0
  let is = 0, cn = 0, igr = 0

  let n = Math.min(Number(emp.value.nombre_enfants) || 0, 4)
  let parts = 1
  const sit = String(emp.value.situation_matrimoniale || '').toLowerCase()

  if (sit.includes('mari')) {
    // Marié : Base 2 + 0.5 par enfant
    parts = 2 + (n * 0.5)
  } else if (sit.includes('veuf') || sit.includes('veuv')) {
    // Veuf : 1 part si sans enfant, sinon Base 2 + 0.5 par enfant (comme marié)
    parts = (n > 0) ? (2 + (n * 0.5)) : 1
  } else {
    // Célibataire, Divorcé : 1 part si sans enfant, sinon Base 1.5 + 0.5 par enfant
    parts = (n > 0) ? (1.5 + (n * 0.5)) : 1
  }
  parts = Math.min(parts, 5.0)

    if (emp.value.regime !== 'ancien') {
      // ---- RÉFORME 2024 (ITS UNIQUE) ----
      // L'utilisateur précise : "L’ITS est calculé sur le salaire brut imposable"
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
    // ---- ANCIENNE LOI (IS, CN, IGR) ----
    // On utilise l'abattement de 20% sur (Brut - CNPS - 80%) sur certaines versions, 
    // ou la formule standard classique.
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

  // CMU salariale avec ayants droit
  const cmuSal = 500 * (1 + nbAyantsDroitCMU)
  const acompte = +emp.value.acompte || 0
  const avance = +emp.value.avance || 0
  const opposition = +emp.value.opposition || 0
  const autresRetenues = +emp.value.autres_retenues || 0
  ricf = Math.max(0, (parts - 1) * 11000)
  const impots = emp.value.regime !== 'ancien' ? itsFinal : (is + cn + igr)
  const totalRetenues = impots + cnpsSal + cmuSal + acompte + avance + opposition + autresRetenues
  const netAPayer = gainsTotaux - totalRetenues

  // Détail des tranches pour l'affichage
  const detailTranches = []
  if (emp.value.regime !== 'ancien') {
    const salImposable = brutImposable
    const tranches = [
      { plafond: 75000, taux: 0.00 },
      { plafond: 240000, taux: 0.16 },
      { plafond: 800000, taux: 0.21 },
      { plafond: 2400000, taux: 0.24 },
      { plafond: 8000000, taux: 0.28 },
      { plafond: Infinity, taux: 0.32 }
    ]
    let prec = 0
    for (const { plafond, taux } of tranches) {
      if (salImposable <= prec) break
      const baseTranche = Math.min(salImposable, plafond) - prec
      const montantTranche = Math.round(baseTranche * taux)
      if (montantTranche > 0 || (taux === 0 && baseTranche > 0)) {
          detailTranches.push({ label: `Tranche ${taux * 100}%`, base: baseTranche, taux, montant: montantTranche })
      }
      prec = plafond
    }
  }

  return {
    salaireBase, salaireBaseMensuel, joursDansLeMois, joursTrav,
    sursalaire, primeTransport, primeLogement,
    primeAnciennete, ansAnciennete, ancienneteTxt, allocationConges, joysCP: joursCP,
    primesImposables, primesNonImposablesRub,
    montantHeuresSup, nbHeuresSup, coefHS, tauxHoraire,
    salaireBrut, brutImposable, baseFiscale, baseCNPS, baseCNPS_PfAtAm, tauxAT, nbAyantsDroitCMU,
    parts, ricf,
    gainsTotaux,
    salarial: {
      its: itsFinal, ricf,
      is, cn, igr,
      cnps: cnpsSal,
      cmu: cmuSal,
      regime: emp.value.regime,
      total: totalRetenues,
      acompte, avance, opposition, autresRetenues
    },
    patronal: {
      impot: impotEmployeur, fdfpTA, fdfpFPC,
      totalFiscal: totalFiscalEmployeur,
      cnpsPF, cnpsAM, cnpsAT,
      cnpsRetraite: cnpsRetraitePat,
      cmu: cmuPat,
      totalSocial: totalSocialEmployeur,
      grandTotal: totalPatronal
    },
    netAPayer
  }
})

// Calcul Inversé (Net à Brut) - Magie Mathématique
const calculerBrutDepuisNet = () => {
  const targetNet = prompt("Quel est le NET À PAYER que vous souhaitez atteindre ? (ex: 350000)")
  if (!targetNet || isNaN(targetNet)) return

  const objectif = parseFloat(targetNet)
  let brutTest = objectif
  let ecart = 100000
  let iterations = 0

  // Recherche par dichotomie/approche progressive
  while (Math.abs(ecart) > 1 && iterations < 100) {
    // Simuler un calcul rapide pour ce brutTest
    const baseCNPS = Math.min(brutTest, 3375000)
    const cnpsSal = Math.round(baseCNPS * 0.063)
    const cmuSal = 1000
    let impots = 0

    let n = Math.min(Number(emp.value.nombre_enfants) || 0, 4)
    let parts = 1
    const sit = String(emp.value.situation_matrimoniale || '').toLowerCase()

    if (sit.includes('mari')) {
      parts = 2 + (n * 0.5)
    } else if (sit.includes('veuf') || sit.includes('veuv')) {
      parts = (n > 0) ? (2 + (n * 0.5)) : 1
    } else {
      parts = (n > 0) ? (1.5 + (n * 0.5)) : 1
    }
    parts = Math.min(parts, 5.0)

    if (emp.value.regime !== 'ancien') {
      const salImposable = Math.max(0, brutTest - cnpsSal - cmuSal)
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
      let ricf = Math.max(0, (parts - 1) * 11000)
      impots = Math.max(0, itsBrut - ricf)
    } else {
      const isTest = Math.round(brutTest * 0.012)
      let cnTest = 0
      if (brutTest > 50000) {
        if (brutTest <= 130000) cnTest = Math.round((brutTest - 50000) * 0.015)
        else if (brutTest <= 200000) cnTest = 1200 + Math.round((brutTest - 130000) * 0.05)
        else cnTest = 4700 + Math.round((brutTest - 200000) * 0.10)
      }
      const baseIGR = (brutTest - isTest - cnTest - cnpsSal) * 0.85
      const qf = baseIGR / parts
      let igrParPart = 0
      if (qf > 25000) {
        if (qf <= 45583) igrParPart = (qf - 25000) * 0.10
        else if (qf <= 81666) igrParPart = (qf * 0.15) - 2292
        else if (qf <= 126666) igrParPart = (qf * 0.20) - 6375
        else if (qf <= 220833) igrParPart = (qf * 0.25) - 12708
        else if (qf <= 389166) igrParPart = (qf * 0.35) - 34792
        else igrParPart = (qf * 0.45) - 73708
      }
      impots = isTest + cnTest + Math.max(0, Math.round(igrParPart * parts))
    }

    const netTest = brutTest - (cnpsSal + impots + cmuSal) + emp.value.prime_transport + emp.value.primes_non_imposables - emp.value.autres_retenues

    ecart = objectif - netTest
    brutTest += ecart // Ajustement auto
    iterations++
  }

  if (emp.value.sursalaire > 0 || String(emp.value.salaire_base) !== "0") {
      const brutActuelHorsSursalaire = (+emp.value.salaire_base || 0) + (+emp.value.autres_primes || 0) + (+emp.value.montant_heures_sup || 0)
      if (Math.round(brutTest) > brutActuelHorsSursalaire) {
          emp.value.sursalaire = Math.round(brutTest) - brutActuelHorsSursalaire
      } else {
          emp.value.salaire_base = Math.round(brutTest)
          emp.value.sursalaire = 0
          emp.value.autres_primes = 0
      }
  } else {
      emp.value.salaire_base = Math.round(brutTest)
  }
}

// Formatter
const fcfa = (v) => {
  if (!v && v !== 0) return '0'
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

// ══════════════════════════════════════════════
// GÉNÉRATION PDF
// ══════════════════════════════════════════════
const generatePDF = async () => {
  if (!emp.value.nom || !emp.value.salaire_base) {
    errorMsg.value = 'Veuillez renseigner au moins le nom et le salaire de base.'
    return
  }
  generating.value = true
  errorMsg.value = null
  generated.value = false
  downloadUrl.value = null

  try {
    const response = await fetch('/api/rh/generate-single-payslip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee: emp.value })
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Erreur serveur')
    }

    const blob = await response.blob()
    downloadUrl.value = URL.createObjectURL(blob)
    generated.value = true
  } catch (e) {
    errorMsg.value = e.message
  } finally {
    generating.value = false
  }
}

const reset = () => {
  generated.value = false
  downloadUrl.value = null
  errorMsg.value = null
}

const computedFileName = computed(() => {
  const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const moisNom = moisNoms[emp.value.mois - 1] || 'Mois';
  const ent = (emp.value.nom_entreprise || 'ENTREPRISE').toUpperCase();
  const nomStr = (emp.value.nom || 'SALARIE').toUpperCase();
  return `BULLETIN DE PAIE - ${ent} - ${nomStr} - ${moisNom} ${emp.value.annee}.pdf`;
});

const tabs = [
  { id: 'entreprise', label: 'Entreprise', icon: '🏢' },
  { id: 'employe', label: 'Employé', icon: '👤' },
  { id: 'remuneration', label: 'Rémunération', icon: '💰' },
  { id: 'reglement', label: 'Règlement', icon: '💳' },
]
</script>

<template>
  <div class="paysim-wrapper">

    <!-- HEADER -->
    <div class="paysim-header">
      <div class="paysim-header-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      </div>
      <div>
        <h3>Simulation de Bulletin de Paie</h3>
        <p>Saisissez les données et visualisez le résultat en temps réel (Loi ivoirienne)</p>
      </div>
    </div>

    <div class="paysim-body">

      <!-- COLONNE GAUCHE: Formulaire -->
      <div class="paysim-form">

        <!-- Onglets -->
        <div class="form-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="form-tab"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            {{ tab.icon }} {{ tab.label }}
          </button>
        </div>

        <!-- ONGLET ENTREPRISE -->
        <div v-show="activeTab === 'entreprise'" class="tab-content">
          <div class="field-group">
            <label>Nom de l'entreprise</label>
            <input v-model="emp.nom_entreprise" type="text" placeholder="Ex: Côte d'Ivoire PAIE" />
          </div>
          <div class="field-group">
            <label>Adresse</label>
            <input v-model="emp.adresse" type="text" placeholder="Ex: Abidjan, Plateau" />
          </div>
          <div class="field-group">
            <label>Siège Social</label>
            <input v-model="emp.siege_social" type="text" placeholder="Ex: BINGERVILLE-CITEE FDFP-VILLA 67" />
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>E-mail Entreprise</label>
              <input v-model="emp.email_entreprise" type="email" placeholder="infos@entreprise.ci" />
            </div>
            <div class="field-group">
              <label>Téléphone Employeur</label>
              <input v-model="emp.tel_entreprise" type="text" placeholder="+225 ..." />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>N° CNPS</label>
              <input v-model="emp.numero_cnps" type="text" placeholder="Numéro CNPS" />
            </div>
            <div class="field-group">
              <label>N° Contribuable (RCCM)</label>
              <input v-model="emp.numero_contribuable" type="text" placeholder="N° Contribuable" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Mois de paie</label>
              <select v-model.number="emp.mois">
                <option v-for="m in 12" :key="m" :value="m">{{ moisLabels[m] }}</option>
              </select>
            </div>
            <div class="field-group">
              <label>Année</label>
              <input v-model.number="emp.annee" type="number" :min="2020" :max="2030" />
            </div>
          </div>
        </div>

        <!-- ONGLET EMPLOYÉ -->
        <div v-show="activeTab === 'employe'" class="tab-content">
          <div class="field-row">
            <div class="field-group">
              <label>Matricule</label>
              <input v-model="emp.matricule" type="text" placeholder="00001" />
            </div>
            <div class="field-group">
              <label>Catégorie</label>
              <input v-model="emp.categorie" type="text" placeholder="Ex: I1, M2" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Nom <span class="required">*</span></label>
              <input v-model="emp.nom" type="text" placeholder="NOM" />
            </div>
            <div class="field-group">
              <label>Prénom(s)</label>
              <input v-model="emp.prenom" type="text" placeholder="Prénoms" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Poste / Fonction</label>
              <input v-model="emp.poste" type="text" placeholder="Ex: Responsable Comptable" />
            </div>
            <div class="field-group">
              <label>Qualification</label>
              <input v-model="emp.qualification" type="text" placeholder="Ex: Ingénieur, Technicien..." />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Situation familiale</label>
              <select v-model="emp.situation_matrimoniale">
                <option value="celibataire">Célibataire</option>
                <option value="marie">Marié(e)</option>
                <option value="divorce">Divorcé(e)</option>
                <option value="veuf">Veuf/Veuve</option>
              </select>
            </div>
            <div class="field-group">
              <label>Nombre d'enfants</label>
              <input v-model.number="emp.nombre_enfants" type="number" min="0" max="20" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Date d'embauche</label>
              <input v-model="emp.date_embauche" type="date" />
            </div>
            <div class="field-group">
              <label>N° SECU (Sociale)</label>
              <input v-model="emp.num_secu" type="text" placeholder="N° Sécurité Sociale" />
            </div>
          </div>
          <div class="parts-badge">
            <span class="parts-label">Parts fiscales calculées :</span>
            <span class="parts-value">{{ calc.parts.toFixed(2) }}</span>
          </div>
        </div>

        <!-- ONGLET RÉMUNÉRATION -->
        <div v-show="activeTab === 'remuneration'" class="tab-content">
          <div class="field-row">
            <div class="field-group">
              <label>Régime Fiscal</label>
              <select v-model="emp.regime">
                <option value="2024">Nouvelle Réforme 2024 (ITS UNIQUE)</option>
                <option value="ancien">Ancienne Loi (IS, CN, IGR)</option>
              </select>
            </div>
          </div>

          <div class="field-row">
            <div class="field-group">
              <label>
                Salaire Catégoriel (FCFA) <span class="required">*</span>
                <span class="field-hint">Rémunération pour 173.33 h/mois. Sert de base de calcul.</span>
              </label>
              <input v-model.number="emp.salaire_base" type="number" min="0" step="1" placeholder="Ex: 200 000" />
            </div>
            <div class="field-group">
              <label>
                Sursalaire (FCFA)
                <span class="field-hint">Montant négocié au-delà du catégoriel.</span>
              </label>
              <input v-model.number="emp.sursalaire" type="number" min="0" step="1" placeholder="0" />
            </div>
          </div>

          <div class="separator-label">⏱ Temps de Travail</div>

          <div class="field-row">
            <div class="field-group">
              <label>
                Jours travaillés ce mois
                <span class="field-hint">Standard = 26 jours (5j/sem)</span>
              </label>
              <input v-model.number="emp.jours_travailles" type="number" min="0" max="31" />
            </div>
            <div class="field-group">
              <label>
                Jours d'absence
                <span class="field-hint">Déduits automatiquement</span>
              </label>
              <input v-model.number="emp.absences_jours" type="number" min="0" max="31" />
            </div>
          </div>

          <div class="info-calc" v-if="calc.joursTrav >= 0">
            📅 Jours payés effectifs : <strong>{{ calc.joursTrav }} j</strong> &rarr; Salaire de base : <strong>{{ fcfa(calc.salaireBase) }} FCFA</strong>
          </div>

          <div class="field-row">
            <div class="field-group">
              <label>H. Supplémentaires (nombre)</label>
              <input v-model.number="emp.heures_sup_nb" type="number" min="0" placeholder="0" />
            </div>
            <div class="field-group">
              <label>
                Coefficient de majoration
                <span class="field-hint">Fixé par le Code du Travail (15%, 50%, 75% ou 100%)</span>
              </label>
              <select v-model.number="emp.heures_sup_coef">
                <option :value="1.15">+15% (Heures de jour 41h-48h)</option>
                <option :value="1.50">+50% (Heures de nuit / Dimanche)</option>
                <option :value="1.75">+75% (De nuit un jour au-delà de 48h)</option>
                <option :value="2.0">+100% (De jour un Férié)</option>
              </select>
            </div>
          </div>
          <div class="info-calc" v-if="emp.heures_sup_nb > 0">
            ⏳ {{ emp.heures_sup_nb }}h × {{ fcfa(calc.tauxHoraire) }} FCFA/h × {{ emp.heures_sup_coef }} = <strong>{{ fcfa(calc.montantHeuresSup) }} FCFA</strong>
          </div>

          <div class="field-row">
            <div class="field-group">
              <label>Jours de Congés payés pris</label>
              <input v-model.number="emp.jours_conges_pris" type="number" min="0" max="30" />
            </div>
          </div>

          <div class="separator-label">💰 Primes &amp; Indemnités</div>

          <div class="field-row">
            <div class="field-group">
              <label>Prime de Transport (Non imposable)</label>
              <input v-model.number="emp.prime_transport" type="number" min="0" placeholder="30 000" />
            </div>
            <div class="field-group">
              <label>Prime de Logement (Non imposable)</label>
              <input v-model.number="emp.prime_logement" type="number" min="0" placeholder="0" />
            </div>
          </div>

          <div v-for="(prime, index) in emp.primes" :key="prime.id" class="field-row prime-row" style="align-items: flex-end;">
            <div class="field-group" style="flex: 2;">
              <input v-model="prime.label" type="text" placeholder="Nom de la prime" />
            </div>
            <div class="field-group" style="flex: 1;">
              <input v-model.number="prime.montant" type="number" placeholder="Montant FCFA" />
            </div>
            <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 8px;">
              <input v-model="prime.imposable" type="checkbox" :id="'imp-' + prime.id" />
              <label :for="'imp-' + prime.id" style="margin: 0; font-size: 11px;">Impos.</label>
            </div>
            <button class="btn-remove-prime" @click="emp.primes.splice(index, 1)" title="Supprimer">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
          <button class="btn-add-prime" @click="emp.primes.push({ id: Date.now(), label: '', montant: 0, imposable: true })" style="width: 100%; padding: 8px; background: #f8fafc; border: 2px dashed #94a3b8; color: #475569; font-weight: 600; border-radius: 8px; cursor: pointer; margin-top: 5px; transition: all 0.2s;">
            + Ajouter une prime / indemnité
          </button>

          <div class="separator-label">✂️ Retenues Salariales</div>

          <div class="field-row">
            <div class="field-group">
              <label>Acompte sur salaire</label>
              <input v-model.number="emp.acompte" type="number" min="0" />
            </div>
            <div class="field-group">
              <label>Avance / Prêt</label>
              <input v-model.number="emp.avance" type="number" min="0" />
            </div>
          </div>
        </div>

        <!-- ONGLET RÈGLEMENT -->
        <div v-show="activeTab === 'reglement'" class="tab-content">
          <div class="field-row">
            <div class="field-group">
              <label>Mode de règlement</label>
              <select v-model="emp.virement">
                <option :value="true">VIREMENT BANCAIRE</option>
                <option :value="false">ESPÈCES / CHÈQUE</option>
              </select>
            </div>
          </div>
          <div v-if="emp.virement" class="field-group animate-slide-down">
            <label>RIB (Coordonnées Bancaires)</label>
            <input v-model="emp.rib" type="text" placeholder="Ex: CI000 0000 0000000000 00" />
            <span class="field-hint">Le RIB apparaîtra sur le bulletin en bas à gauche du mode de règlement.</span>
          </div>
        </div>

        <div class="tab-nav">
          <button v-if="activeTab !== tabs[0].id" class="tab-prev" @click="activeTab = tabs[tabs.findIndex(t => t.id === activeTab) - 1].id">
            ← Précédent
          </button>
          <button v-if="activeTab !== tabs[tabs.length - 1].id" class="tab-next" @click="activeTab = tabs[tabs.findIndex(t => t.id === activeTab) + 1].id">
            Suivant →
          </button>
        </div>

        <div class="action-bar-bottom" style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0; text-align: center;">
          <button class="btn-generate" @click="generatePDF" :disabled="generating">
            <svg v-if="generating" class="spin-icon" viewBox="0 0 24 24" fill="none" width="16" height="16">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="31 31"></circle>
            </svg>
            {{ generating ? 'Génération...' : '⬇️ Générer PDF' }}
          </button>

          <div v-if="errorMsg" class="error-alert mt-4 text-sm text-red-600 bg-red-50 p-2 rounded">
            🚨 {{ errorMsg }}
          </div>
          
          <div v-if="downloadUrl" class="success-alert mt-4">
            ✅ Génération réussie !
            <a :href="downloadUrl" :download="computedFileName" class="dl-link" title="Télécharger">⬇️ Télécharger PDF</a>
            <button @click="reset" class="btn-reset-small ml-4 text-xs text-gray-500 underline">Faire un autre</button>
          </div>
        </div>

      </div>

      <!-- COLONNE DROITE: Prévisualisation Premium LOGIPAIE -->
      <div class="paysim-preview">
        <div class="preview-container">
          
          <!-- Header Bulletin Neutre -->
          <div class="preview-header">
            <div class="header-left">
              <div class="company-name-main">{{ (emp.nom_entreprise || 'MON ENTREPRISE').toUpperCase() }}</div>
              <div class="company-sub">
                <p>{{ emp.adresse || 'Abidjan, Côte d\'Ivoire' }}</p>
                <div class="fiscal-ids">
                  <span v-if="emp.numero_contribuable">N° CC: {{ emp.numero_contribuable }}</span>
                  <span v-if="emp.numero_rc">RCCM: {{ emp.numero_rc }}</span>
                  <span v-if="emp.numero_cnps">CNPS: {{ emp.numero_cnps }}</span>
                </div>
              </div>
            </div>
            <div class="header-right">
              <div class="bulletin-label">BULLETIN DE PAIE</div>
              <div class="bulletin-period-badge">{{ moisLabels[emp.mois] || '' }} {{ emp.annee }}</div>
            </div>
          </div>

          <!-- Section Employé & Période (Header Logipaie) -->
          <div class="logipaie-header-grid">
            <div class="lph-left lph-box">
              <div class="lph-title text-white bg-slate-700 p-1 text-center font-bold text-xs mb-2">SALARIE</div>
              <div class="lph-content">
                <div class="lph-row"><span>Nom :</span> <strong>{{ (emp.nom || '').toUpperCase() }}</strong></div>
                <div class="lph-row"><span>Prénom(s) :</span> <strong>{{ emp.prenom || '' }}</strong></div>
                <div class="lph-row"><span>Emploi :</span> <span>{{ emp.poste || '____' }}</span></div>
                <div class="lph-row"><span>Qualification :</span> <span>{{ emp.qualification || '____' }}</span></div>
                <div class="lph-row"><span>Catégorie :</span> <span>{{ emp.categorie || '____' }}</span></div>
              </div>
            </div>
            <div class="lph-right lph-box border border-slate-200">
               <div class="lph-content p-2">
                <div class="lph-row"><span>N° Matricule :</span> <strong>{{ emp.matricule || '____' }}</strong></div>
                <div class="lph-row"><span>N° CNPS :</span> <strong>{{ emp.num_secu || '____' }}</strong></div>
                <div class="lph-row"><span>Parts IGR :</span> <strong>{{ calc.parts?.toFixed(2) }}</strong></div>
                <div class="lph-row"><span>Type Contrat :</span> <span>{{ emp.type_contrat || 'CDI' }}</span></div>
                <div class="lph-row"><span>Ancienneté :</span> <span>{{ calc.ancienneteTxt || '____' }}</span></div>
              </div>
            </div>
          </div>

          <!-- Tableau de Paie 7 Colonnes Style Papier -->
          <div class="table-wrapper">
            <table class="logipaie-table">
              <thead>
                <tr>
                  <th colspan="2" class="header-group">RUBRIQUES / DESIGNATIONS</th>
                  <th rowspan="2" class="col-base">BASE</th>
                  <th colspan="3" class="header-group" style="background: #166534;">PART SALARIALE</th>
                  <th colspan="2" class="header-group" style="background: #b91c1c;">PART PATRONALE</th>
                </tr>
                <tr>
                  <th class="col-n">N°</th>
                  <th class="col-lib">LIBELLÉS</th>
                  <th class="col-taux-s">Taux</th>
                  <th class="col-gain">Gains</th>
                  <th class="col-ret-s">Retenues</th>
                  <th class="col-taux-p">Taux</th>
                  <th class="col-ret-p">Retenues</th>
                </tr>
              </thead>
              <tbody>
                <!-- Salaire & Primes -->
                <tr>
                  <td class="code">380</td>
                  <td class="label">SALAIRE CATEGORIEL</td>
                  <td class="val">{{ fcfa(calc.salaireBaseMensuel) }}</td>
                  <td class="val">{{ calc.joursTrav }}/30</td>
                  <td class="gain">{{ fcfa(calc.salaireBase) }}</td>
                  <td></td><td></td><td></td>
                </tr>
                <tr v-if="calc.sursalaire > 0">
                  <td class="code">385</td>
                  <td class="label">SURSALAIRE</td>
                  <td class="val">{{ fcfa(+emp.sursalaire || 0) }}</td>
                  <td class="val">{{ calc.joursTrav }}/30</td>
                  <td class="gain">{{ fcfa(calc.sursalaire) }}</td>
                  <td></td><td></td><td></td>
                </tr>
                <tr v-if="calc.primeAnciennete > 0">
                  <td class="code">390</td>
                  <td class="label">PRIME D'ANCIENNETE ({{ calc.ansAnciennete }} ans)</td>
                  <td class="val">{{ fcfa(calc.salaireBase + (calc.sursalaire || 0)) }}</td>
                  <td></td>
                  <td class="gain">{{ fcfa(calc.primeAnciennete) }}</td>
                  <td></td><td></td><td></td>
                </tr>
                <tr v-if="calc.allocationConges > 0">
                  <td class="code">392</td>
                  <td class="label">ALLOCATION CONGES PAYES ({{ calc.joursCP }} j)</td>
                  <td></td><td></td>
                  <td class="gain">{{ fcfa(calc.allocationConges) }}</td>
                  <td></td><td></td><td></td>
                </tr>
                
                <tr v-for="prime in emp.primes" :key="prime.id">
                   <td class="code">{{ prime.imposable ? '395' : '700' }}</td>
                   <td class="label">{{ (prime.label || 'PRIME').toUpperCase() }}</td>
                   <td></td><td></td>
                   <td class="gain">{{ fcfa(prime.montant) }}</td>
                   <td></td><td></td><td></td>
                </tr>

                <tr v-if="calc.montantHeuresSup > 0">
                  <td class="code">315</td>
                  <td class="label">HEURES SUPPLEMENTAIRES (x{{ emp.heures_sup_coef }})</td>
                  <td class="val">{{ fcfa(calc.tauxHoraire) }}</td>
                  <td class="val">{{ calc.nbHeuresSup }} h</td>
                  <td class="gain">{{ fcfa(calc.montantHeuresSup) }}</td>
                  <td></td><td></td><td></td>
                </tr>

                <tr v-if="calc.primeTransport > 0">
                  <td class="code">701</td>
                  <td class="label">PRIME DE TRANSPORT (EXO)</td>
                  <td></td><td></td>
                  <td class="gain">{{ fcfa(calc.primeTransport) }}</td>
                  <td></td><td></td><td></td>
                </tr>

                <tr v-if="calc.primeLogement > 0">
                  <td class="code">702</td>
                  <td class="label">PRIME DE LOGEMENT (EXO)</td>
                  <td></td><td></td>
                  <td class="gain">{{ fcfa(calc.primeLogement) }}</td>
                  <td></td><td></td><td></td>
                </tr>

                <tr class="brut-fiscal-row">
                  <td colspan="4" class="label-total">BRUT IMPOSABLE / FISCAL</td>
                  <td class="total-val">{{ fcfa(calc.salaireBrut) }}</td>
                  <td></td><td></td><td></td>
                </tr>

                <!-- Charges Sociales -->
                <!-- CNPS SALARIALE & PATRONALE -->
                <tr>
                  <td class="code">454</td>
                  <td class="label">CNPS - RETRAITE</td>
                  <td class="val">{{ fcfa(calc.baseCNPS) }}</td>
                  <td class="val">6.3%</td>
                  <td></td>
                  <td class="retenue">{{ fcfa(calc.salarial.cnps) }}</td>
                  <td class="val">7.7%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.cnpsRetraite) }}</td>
                </tr>
                <tr>
                  <td class="code">470</td>
                  <td class="label">CNPS - PRESTATIONS FAMILIALES</td>
                  <td class="val">{{ fcfa(calc.baseCNPS_PfAtAm) }}</td>
                  <td></td><td></td><td></td>
                  <td class="val">5.0%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.cnpsPF) }}</td>
                </tr>
                <tr>
                  <td class="code">472</td>
                  <td class="label">CNPS - ACCIDENT DU TRAVAIL</td>
                  <td class="val">{{ fcfa(calc.baseCNPS_PfAtAm) }}</td>
                  <td></td><td></td><td></td>
                  <td class="val">{{ emp.taux_at || 2 }}%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.cnpsAT) }}</td>
                </tr>
                <tr>
                  <td class="code">475</td>
                  <td class="label">CNPS - ASSURANCE MATERNITE</td>
                  <td class="val">{{ fcfa(calc.baseCNPS_PfAtAm) }}</td>
                  <td></td><td></td><td></td>
                  <td class="val">0.75%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.cnpsAM) }}</td>
                </tr>

                <!-- Fiscalité -->
                <template v-if="emp.regime !== 'ancien'">
                  <tr>
                    <td class="code">405</td>
                    <td class="label">ITS (IMPOT UNIQUE 2024)</td>
                    <td class="val">{{ fcfa(calc.brutImposable) }}</td>
                    <td></td><td></td>
                    <td class="retenue">{{ fcfa((calc.salarial.its || 0) + (calc.salarial.ricf || 0)) }}</td>
                    <td></td><td></td>
                  </tr>
                  <tr v-if="calc.salarial.ricf > 0" class="sub-row">
                    <td class="code">406</td>
                    <td class="label">&nbsp;&nbsp;dont RED. FAMILIALE (RICF)</td>
                    <td></td><td></td>
                    <td class="sub-gain">( -{{ fcfa(calc.salarial.ricf) }} )</td>
                    <td></td><td></td><td></td>
                  </tr>
                </template>
                <template v-else>
                  <tr><td class="code">405</td><td class="label">IMPOT SUR SALAIRE (I.S.)</td><td class="val">{{ fcfa(calc.brutImposable) }}</td><td class="val">1.2%</td><td></td><td class="retenue">{{ fcfa(calc.salarial.is) }}</td><td></td><td></td></tr>
                  <tr><td class="code">410</td><td class="label">CONTRIBUTION NAT. (C.N.)</td><td class="val">{{ fcfa(calc.brutImposable) }}</td><td></td><td></td><td class="retenue">{{ fcfa(calc.salarial.cn) }}</td><td></td><td></td></tr>
                  <tr><td class="code">415</td><td class="label">I.G.R.</td><td></td><td></td><td></td><td class="retenue">{{ fcfa(calc.salarial.igr) }}</td><td></td><td></td></tr>
                </template>

                <!-- Fiscalité Patronale -->
                <tr>
                  <td class="code">600</td>
                  <td class="label">T.A.S.P (IMPOT EMPLOYEUR)</td>
                  <td class="val">{{ fcfa(calc.brutImposable) }}</td>
                  <td></td><td></td><td></td>
                  <td class="val">1.2%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.impotEmployeur) }}</td>
                </tr>
                <tr>
                  <td class="code">610</td>
                  <td class="label">FDFP - APPRENTISSAGE</td>
                  <td class="val">{{ fcfa(calc.brutImposable) }}</td>
                  <td></td><td></td><td></td>
                  <td class="val">0.4%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.fdfpTA) }}</td>
                </tr>
                <tr>
                  <td class="code">612</td>
                  <td class="label">FDFP - FORMATION CONTINUE</td>
                  <td class="val">{{ fcfa(calc.brutImposable) }}</td>
                  <td></td><td></td><td></td>
                  <td class="val">0.6%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.fdfpFPC) }}</td>
                </tr>

                <!-- CMU -->
                <tr>
                  <td class="code">430</td>
                  <td class="label">CMU (ASSURANCE MALADIE)</td>
                  <td class="val">1000</td>
                  <td></td><td></td>
                  <td class="retenue">{{ fcfa(calc.salarial.cmu) }}</td>
                  <td></td>
                  <td class="retenue">{{ fcfa(calc.patronal.cmu) }}</td>
                </tr>
                
                <tr v-if="calc.salarial.acompte > 0">
                   <td class="code">900</td>
                   <td class="label">ACOMPTE / AVANCES</td>
                   <td></td><td></td><td></td>
                   <td class="retenue">{{ fcfa(calc.salarial.acompte) }}</td>
                   <td></td><td></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Zone Totaux et Net (Style Logipaie) -->
          <div class="logipaie-footer-grid mt-6">
            <div class="lp-cumuls-container">
              <div class="lp-cumuls-label">CUMULS</div>
              <div class="lp-cumuls-data">
                <div class="cumul-row"><span>Brut imposable</span> <span>{{ fcfa(calc.brutImposable) }}</span></div>
                <div class="cumul-row"><span>Nombre de jours</span> <span>{{ calc.joursTrav }}</span></div>
                <div class="cumul-row"><span>ITS</span> <span>{{ fcfa(calc.salarial.its) }}</span></div>
                <div class="cumul-row"><span>RICF</span> <span>{{ fcfa(calc.salarial.ricf) }}</span></div>
                <div class="cumul-row"><span>Cnps</span> <span>{{ fcfa(calc.salarial.cnps) }}</span></div>
              </div>
            </div>
            
            <div class="lp-reglement-box">
              <div class="lp-reglement-title">Mode de règlement</div>
              <div class="lp-reglement-value">{{ (emp.virement ? 'VIREMENT' : 'ESPECES') }}</div>
              <div v-if="emp.virement && emp.rib" class="lp-rib-text mt-2 text-[10px] text-slate-500 font-mono">
                RIB: {{ emp.rib }}
              </div>
            </div>

            <div class="lp-net-final">
              <div class="lp-net-title">NET À PAYER</div>
              <div class="lp-net-value">{{ fcfa(calc.netAPayer) }} F</div>
            </div>
          </div>

          <!-- Zone Signature -->
          <div class="footer-signatures">
            <div class="sig-card">
              <p class="sig-header">L'EMPLOYEUR</p>
              <div class="sig-space"></div>
              <p class="sig-meta">Signature & Cachet</p>
            </div>
            <div class="sig-card">
              <p class="sig-header">LE SALARIÉ</p>
              <div class="sig-space"></div>
              <p class="sig-meta">Lu et approuvé</p>
            </div>
          </div>

        </div>
      </div>

    </div>
    
    <!-- Section Explications (Hors du composant form pour la clarté) -->
    <div class="education-section">
      <h3 class="edu-title">Comprendre les rubriques du bulletin de paie 🇨🇮</h3>
      <div class="edu-grid">
        <div v-for="(edu, key) in explanations" :key="key" class="edu-card">
          <h4>{{ edu.title }}</h4>
          <p>{{ edu.text }}</p>
        </div>
      </div>
    </div>
  </div>

</template>

<style scoped>
.paysim-wrapper {
  background: white;
  border-radius: 16px;
  overflow: hidden;
}

.paysim-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
  color: white;
}
.paysim-header-icon {
  width: 48px; height: 48px;
  background: rgba(255,255,255,0.15);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.paysim-header h3 { margin: 0; font-size: 1.1rem; font-weight: 700; }
.paysim-header p { margin: 0.2rem 0 0; font-size: 0.8rem; opacity: 0.8; }

.paysim-body {
  display: grid;
  grid-template-columns: minmax(300px, 360px) 1fr;
  min-height: 580px;
}

/* BOUTONS D'ACTION */
.btn-remove-prime {
  margin-bottom: 8px;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid #ffccd5;
  background: #fff1f2;
  color: #e11d48;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  height: 32px;
  width: 32px;
}

.btn-remove-prime:hover {
  background: #ffe4e6;
  border-color: #fb7185;
  color: #be123c;
  transform: scale(1.05);
  box-shadow: 0 2px 5px rgba(225, 29, 72, 0.1);
}

/* FORMULAIRE */
.paysim-form {
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
}

.form-tabs {
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  background: white;
}
.form-tab {
  flex: 1;
  padding: 0.75rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  border: none;
  background: none;
  cursor: pointer;
  color: #64748b;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.form-tab.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  background: #f0f7ff;
}

.tab-content {
  padding: 1.25rem;
  flex: 1;
  overflow-y: auto;
  max-height: 440px;
}

.field-group { margin-bottom: 0.9rem; }
.field-group label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.3rem;
}
.required { color: #ef4444; }
.field-group input,
.field-group select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.875rem;
  background: white;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.field-group input:focus,
.field-group select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
.field-hint {
  display: block;
  font-size: 0.7rem;
  color: #6b7280;
  margin-top: 0.2rem;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0;
}
.field-row .field-group { margin-bottom: 0.9rem; }

.separator-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0.75rem 0 0.5rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid #e2e8f0;
}

.hs-result {
  padding: 0.5rem 0.75rem;
  background: #eff6ff;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #1d4ed8;
  margin-top: -0.5rem;
}

.tax-info-box {
  margin-top: 0.5rem;
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 0.75rem;
  line-height: 1.4;
}
.tax-info-box.imposable { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.tax-info-box.non-imposable { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }

.tax-badge {
  display: inline-block;
  font-weight: 800;
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  margin-right: 0.4rem;
}
.tax-badge.imposable { background: #ef4444; color: white; }
.tax-badge.non-imposable { background: #22c55e; color: white; }

.badge-imposable, .badge-non-imposable {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  margin-left: 0.5rem;
  vertical-align: middle;
}
.badge-imposable { background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; }
.badge-non-imposable { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }

.parts-badge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.75rem;
  background: linear-gradient(135deg, #fef3c7, #fffbeb);
  border: 1px solid #fcd34d;
  border-radius: 8px;
  margin-top: 0.5rem;
}
.parts-label { font-size: 0.8rem; color: #92400e; font-weight: 600; }
.parts-value { font-size: 1.1rem; font-weight: 800; color: #d97706; }

.tab-nav {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid #e2e8f0;
  background: white;
  gap: 0.5rem;
}
.tab-prev, .tab-next {
  padding: 0.5rem 1rem;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1.5px solid #2563eb;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  flex: 1;
}
.tab-prev { background: white; color: #2563eb; }
.tab-prev:hover { background: #eff6ff; }
.tab-next { background: #2563eb; color: white; margin-left: auto; }
.tab-next:hover { background: #1d4ed8; }

/* PRÉVISUALISATION PREMIUM LOGIPAIE */
.paysim-preview {
  padding: 1.5rem;
  overflow-y: auto;
  background: #f1f5f9;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.preview-container {
  background: white;
  width: 100%;
  max-width: 1050px; /* Plus grand pour accommoder 7 colonnes sans déborder */
  padding: 30px;
  border-radius: 4px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
  font-family: 'Inter', system-ui, sans-serif;
  color: #1e293b;
  border-top: 10px solid #1e3a8a;
  box-sizing: border-box;
}

/* --- Header --- */
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 25px;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 20px;
}

.company-name-main {
  font-size: 1.5rem;
  font-weight: 900;
  color: #1e3a8a;
  margin-bottom: 5px;
  letter-spacing: -0.02em;
}

.company-sub p {
  margin: 2px 0;
  font-size: 0.82rem;
  color: #64748b;
}

.fiscal-ids {
  margin-top: 6px;
  display: flex;
  gap: 12px;
  font-size: 0.7rem;
  color: #94a3b8;
  font-weight: 600;
}

.header-right {
  text-align: right;
}

.logipaie-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #1e3a8a;
  color: white;
  padding: 7px 14px;
  border-radius: 8px;
  margin-bottom: 10px;
}

.lp-symbol {
  font-weight: 900;
  font-size: 1.1rem;
  border-right: 1px solid rgba(255,255,255,0.3);
  padding-right: 8px;
}

.lp-text {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.bulletin-label {
  font-size: 1.1rem;
  font-weight: 800;
  color: #1e3a8a;
  letter-spacing: 0.12em;
}

/* --- Header Logipaie Grid --- */
.logipaie-header-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.lph-box {
  border: 1px solid #cbd5e1;
  overflow: hidden;
  background: white;
}

.lph-content {
  padding: 10px 15px;
}

.lph-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  margin-bottom: 4px;
  color: #334155;
}

.lph-row span:first-child {
  color: #64748b;
}

/* --- Footer Logipaie Grid --- */
.logipaie-footer-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 15px;
  align-items: stretch;
}

.lp-cumuls-container {
  display: flex;
  border: 1.5px solid #cbd5e1;
  background: #f8fafc;
  min-height: 100px;
}

.lp-cumuls-label {
  background: #cbd5e1;
  color: #475569;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  padding: 10px 5px;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
}

.lp-cumuls-data {
  flex: 1;
  padding: 10px;
}

.lp-reglement-box {
  border: 1.5px solid #cbd5e1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: white;
}

.lp-reglement-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 8px;
}

.lp-reglement-value {
  font-size: 1.3rem;
  font-weight: 900;
  color: #1e3a8a;
  letter-spacing: 0.05em;
}

.lp-net-final {
  background: #ffff00;
  border: 2px solid #000;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 10px;
}

.lp-net-title {
  font-size: 0.8rem;
  font-weight: 900;
  color: #000;
}

.lp-net-value {
  font-size: 1.4rem;
  font-weight: 900;
  color: #000;
}

.data-row strong {
  color: #64748b;
  min-width: 120px;
  display: inline-block;
  font-weight: 600;
}

.highlight-emp {
  font-weight: 800;
  color: #1e3a8a;
  font-size: 0.95rem;
}

/* --- Tableau 7 Colonnes --- */
.table-wrapper {
  margin-bottom: 25px;
  overflow-x: auto;
}

.logipaie-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
  min-width: 600px;
}

.logipaie-table th {
  background: #1e3a8a;
  color: white;
  padding: 10px 8px;
  text-align: center;
  font-weight: 700;
  font-size: 0.72rem;
  letter-spacing: 0.03em;
  border: 1px solid #1e3a8a;
}

.logipaie-table td {
  padding: 7px 8px;
  border: 1px solid #e2e8f0;
  vertical-align: middle;
}

.logipaie-table tbody tr:hover td {
  background: #f8fafc;
}

.col-n { width: 30px; text-align: center; }
.col-lib { width: auto; text-align: left; }
.col-base { width: 85px; text-align: right; }
.col-taux-s { width: 60px; text-align: center; background: #f0fdf4; }
.col-gain { width: 85px; text-align: right; background: #f0fdf4; }
.col-ret-s { width: 85px; text-align: right; background: #fff1f2; }
.col-taux-p { width: 60px; text-align: center; background: #f8fafc; }
.col-ret-p { width: 95px; text-align: right; background: #f8fafc; }

.logipaie-table th.header-group {
    background: #475569;
    font-size: 0.65rem;
    padding: 4px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
}

.logipaie-table td.code {
  color: #64748b;
  font-family: 'Courier New', monospace;
  text-align: center;
  font-size: 0.72rem;
}

.logipaie-table td.label { font-weight: 500; }
.logipaie-table td.val { text-align: right; color: #475569; }

.logipaie-table td.gain {
  text-align: right;
  font-weight: 700;
  color: #059669;
}

.logipaie-table td.retenue {
  text-align: right;
  font-weight: 700;
  color: #dc2626;
}

.brut-fiscal-row td {
  background: #eff6ff !important;
  border-top: 2px solid #1e3a8a;
  font-weight: 800;
  color: #1e3a8a;
}

.label-total {
  text-align: right;
  padding-right: 20px !important;
}

.total-val {
  text-align: right;
  font-weight: 800;
  font-size: 0.85rem;
  color: #059669;
}

.sub-row td {
  font-style: italic;
  font-size: 0.73rem;
  background: #fefce8 !important;
}

.sub-gain {
  color: #92400e;
  text-align: right;
  font-weight: 600;
}

/* --- Zone Totaux --- */
.summary-section {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 30px;
  margin-top: 30px;
}

.cumul-box {
  background: #f8fafc;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.cumul-title {
  font-size: 0.68rem;
  font-weight: 800;
  color: #64748b;
  margin-bottom: 10px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.cumul-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  margin-bottom: 5px;
  color: #475569;
}

.totals-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.total-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 15px;
  background: #f1f5f9;
  border-radius: 6px;
}

.total-item .label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.total-item .value {
  font-size: 1rem;
  font-weight: 800;
  color: #1e293b;
}

.total-item .value.ret-val { color: #dc2626; }

.net-pay-box {
  background: #ffff00;
  border: 3px solid #000;
  padding: 15px 20px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 5px;
}

.net-label {
  font-size: 0.95rem;
  font-weight: 900;
  color: #000;
  letter-spacing: 0.03em;
}

.net-value {
  font-size: 1.8rem;
  font-weight: 900;
  color: #000;
  font-variant-numeric: tabular-nums;
}

/* --- Signatures --- */
.footer-signatures {
  display: flex;
  justify-content: space-between;
  margin-top: 50px;
  padding-top: 25px;
  border-top: 1px dashed #cbd5e1;
}

.sig-card {
  width: 220px;
  text-align: center;
}

.sig-header {
  font-weight: 800;
  font-size: 0.85rem;
  color: #1e3a8a;
  margin: 0 0 50px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sig-space {
  height: 60px;
  border-bottom: 1.5px solid #1e293b;
  margin-bottom: 8px;
}

.sig-meta {
  font-size: 0.7rem;
  color: #94a3b8;
  font-style: italic;
  margin: 0;
}

/* --- Bouton PDF (dans colonne gauche) --- */
.btn-generate {
  width: calc(100% - 2.5rem);
  padding: 0.875rem;
  background: linear-gradient(135deg, #1e3a5f, #2563eb);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
  margin: 1rem auto;
}

.btn-generate:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
}

.btn-generate:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

/* --- Alertes --- */
.error-alert {
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  border-radius: 8px;
  font-size: 0.85rem;
  margin: 0 1.25rem 0.75rem;
}

.success-alert {
  padding: 0.75rem 1rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  border-radius: 8px;
  font-size: 0.85rem;
  margin: 0 1.25rem 0.75rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.dl-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  background: #16a34a;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.8rem;
}

.dl-link:hover { background: #15803d; }

.btn-reset-small {
  background: none;
  border: none;
  text-decoration: underline;
  color: #166534;
  cursor: pointer;
  font-size: 0.8rem;
}

/* --- Section éducative --- */
.education-section {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-radius: 12px;
  padding: 30px;
  margin: 30px;
  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.1);
}

.edu-title {
  color: #1e3a8a;
  font-size: 1.25rem;
  margin-bottom: 20px;
  text-align: center;
}

.edu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.edu-card {
  background: white;
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid #3b82f6;
}

.edu-card h4 {
  margin: 0 0 10px 0;
  color: #1e293b;
  font-size: 0.95rem;
}

.edu-card p {
  margin: 0;
  color: #64748b;
  font-size: 0.85rem;
  line-height: 1.5;
}

/* --- Animations --- */
.spin-icon { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* --- Nouveaux éléments --- */
.field-hint {
  display: block;
  font-size: 0.65rem;
  color: #64748b;
  font-weight: 400;
  margin-top: 2px;
}
.field-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #475569;
  font-size: 10px;
  margin-left: 5px;
  cursor: help;
}
.field-info:hover {
  background: #3b82f6;
  color: white;
}
.info-calc {
  background: #f0fdf4;
  border: 1px dashed #bbf7d0;
  color: #166534;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
  margin-bottom: 15px;
}
.gains-non-imp {
  padding: 10px 15px;
  background: #f8fafc;
  border: 1px dashed #e2e8f0;
  border-top: none;
  font-size: 0.75rem;
}
.gni-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  color: #475569;
}
.gni-val {
  font-weight: 700;
  color: #059669;
}
.bulletin-period-badge {
  display: inline-block;
  background: #eff6ff;
  color: #1e3a8a;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-top: 5px;
}

/* --- Responsive --- */
@media (max-width: 900px) {
  .paysim-body { grid-template-columns: 1fr; }
  .paysim-form { border-right: none; border-bottom: 1px solid #e2e8f0; }
  .tab-content { max-height: 300px; }
  .paysim-preview { padding: 1rem; }
  .preview-container { padding: 20px; }
  .emp-period-box { grid-template-columns: 1fr; gap: 15px; }
  .summary-section { grid-template-columns: 1fr; }
  .net-value { font-size: 1.4rem; }
}

</style>
