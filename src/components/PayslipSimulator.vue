<script setup>
import { ref, computed } from 'vue'

// Prop optionnel pour pré-sélectionner le type depuis le composant parent
const props = defineProps({
  initialType: {
    type: String,
    default: 'habituel' // 'habituel' | 'conges'
  }
})

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
  jours_travailles: 30,   // Jours réellement travaillés ce mois (Standard 30j en CI)
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
  auto_conges: props.initialType === 'conges',
  date_dernier_conge: '',
  taux_at: 0.02,
  ayants_droit_cmu: 0,
  // Régime fiscal
  regime: '2024',
  // Période
  annee: new Date().getFullYear(),
  mois: new Date().getMonth() + 1,
  // Paiement
  virement: true,
  rib: '',
  // Type de bulletin
  bulletin_type: props.initialType // 'habituel' | 'conges'
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

const goToTab = (tabId) => {
  activeTab.value = tabId
  // Petit délai pour laisser le DOM se mettre à jour
  setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, 50)
}

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
  const joursDansLeMois = 30 
  
  // -- CALCUL AUTO CONGÉS --
  let joursConges = +emp.value.jours_conges_pris || 0
  let diffMoisConge = 0
  if (emp.value.bulletin_type === 'conges' || emp.value.auto_conges) {
    const dateRef = emp.value.date_dernier_conge || emp.value.date_embauche
    if (dateRef) {
      const dRef = new Date(dateRef)
      const dNow = new Date(emp.value.annee, emp.value.mois - 1, 1)
      diffMoisConge = (dNow.getFullYear() - dRef.getFullYear()) * 12 + (dNow.getMonth() - dRef.getMonth())
      if (diffMoisConge > 0 && emp.value.auto_conges) {
        joursConges = Math.min(30, Math.floor(diffMoisConge * 2.2))
      }
    }
  } else {
    joursConges = 0 // Pas de congés en bulletin habituel sauf si forcé
  }
  const joursAbsences = +emp.value.absences_jours || 0
  const joursBasePaie = +emp.value.jours_travailles || 26
  
  // Les jours travaillés "réellement" sont ceux qui restent après congés et absences
  const joursTrav = Math.max(0, joursBasePaie - joursAbsences - joursConges)
  
  const salaireBase = Math.round((salaireBaseMensuel / joursDansLeMois) * joursTrav)
  const sursalaire = Math.round((+emp.value.sursalaire || 0) / joursDansLeMois * joursTrav)
  
  const primeTransportMensuel = +emp.value.prime_transport || 0
  const primeLogement = +emp.value.prime_logement || 0
  
  // La prime de transport est liée à la présence effective (jours travaillés)
  // En mode Bulletin de Congés, elle est strictement à 0.
  const primeTransport = emp.value.bulletin_type === 'conges' 
    ? 0 
    : Math.round((primeTransportMensuel / joursBasePaie) * joursTrav)
  
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
  let tauxAnciennete = 0
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
    if (ansAnciennete >= 2) {
      tauxAnciennete = Math.min(25, 2 + (ansAnciennete - 2))
    }
    primeAnciennete = Math.round(salaireBaseMensuel * (tauxAnciennete / 100))
  }

  // -- CALCUL ALLOOCATION CONGÉS PAYÉS --
  let allocationConges = 0;
  if (joursConges > 0) {
     const baseCP = salaireBaseMensuel + (+emp.value.sursalaire || 0) + primeAnciennete
     allocationConges = Math.round((baseCP / joursDansLeMois) * joursConges);
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
  const sitCmu = String(emp.value.situation_matrimoniale || '').toLowerCase()
  const conjointCmu = sitCmu.includes('mari') ? 1 : 0
  const enfantsCmu = Number(emp.value.nombre_enfants) || 0
  const nbPersonnesCMUAuto = 1 + conjointCmu + enfantsCmu
  // Permettre une saisie manuelle si elle existe, sinon utiliser le calcul automatique
  const nbAyantsDroitCMU = Math.max(0, +emp.value.ayants_droit_cmu > 0 ? +emp.value.ayants_droit_cmu : (nbPersonnesCMUAuto - 1))
  const totalPersonnesCMU = 1 + nbAyantsDroitCMU
  const cmuPat = 500 * totalPersonnesCMU
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

  // CMU salariale avec ayants droit (500 FCFA par personne)
  const cmuSal = 500 * totalPersonnesCMU
  const acompte = +emp.value.acompte || 0
  const avance = +emp.value.avance || 0
  const opposition = +emp.value.opposition || 0
  const autresRetenues = +emp.value.autres_retenues || 0
  ricf = Math.max(0, (parts - 1) * 11000)
  const impots = emp.value.regime !== 'ancien' ? itsFinal : (is + cn + igr)
  const totalRetenues = impots + cnpsSal + cmuSal + acompte + avance + opposition + autresRetenues
  const netAPayerRaw = gainsTotaux - totalRetenues
  const netAPayer = Math.max(0, netAPayerRaw)

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
    primeAnciennete, ansAnciennete, ancienneteTxt, tauxAnciennete, allocationConges, joursCP: joursConges, moisConge: diffMoisConge,
    primesImposables, primesNonImposablesRub,
    montantHeuresSup, nbHeuresSup, coefHS, tauxHoraire,
    salaireBrut, brutImposable, baseFiscale, baseCNPS, baseCNPS_PfAtAm, tauxAT, nbAyantsDroitCMU, totalPersonnesCMU,
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
    netAPayer,
    netAPayerRaw
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
    const cmuSal = calc.value.salarial.cmu // Utilisation de la vraie CMU calculée globalement
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

const activeTabIndex = computed(() => tabs.findIndex(t => t.id === activeTab.value))

const tabs = [
  { id: 'entreprise', label: 'Entr.', title: 'Informations Entreprise', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'employe', label: 'Emp.', title: 'Fiche du Salarié', icon: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { id: 'remuneration', label: 'Paie', title: 'Calcul de la Rémunération', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { id: 'reglement', label: 'Règl.', title: 'Mode de Paiement', icon: 'M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M1 10h22' },
]
</script>

<template>
  <div class="paysim-wrapper" id="paysim-top">

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
        
        <!-- Progress Stepper (Mobile View) -->
        <div class="mobile-stepper-header">
          <div class="stepper-progress">
            <div v-for="(t, idx) in tabs" :key="t.id" class="step-progress-item" :class="{ active: idx === activeTabIndex, completed: idx < activeTabIndex }">
              <div class="step-circle">{{ idx + 1 }}</div>
              <span class="step-dot-label">{{ t.label }}</span>
            </div>
            <div class="progress-line">
              <div class="progress-line-fill" :style="{ width: (activeTabIndex / (tabs.length - 1)) * 100 + '%' }"></div>
            </div>
          </div>
          <div class="active-step-info">
            <h2>{{ tabs[activeTabIndex].title }}</h2>
          </div>
        </div>

        <!-- Onglets (Desktop View) -->
        <div class="form-tabs">
          <button
            v-for="t in tabs"
            :key="t.id"
            class="form-tab"
            :class="{ active: activeTab === t.id }"
            @click="goToTab(t.id)"
          >
            <span class="tab-icon-wrapper">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path :d="t.icon" />
              </svg>
            </span>
            <span class="tab-label-text">{{ t.label }}</span>
          </button>
        </div>

        <!-- ONGLET ENTREPRISE -->
        <div v-show="activeTab === 'entreprise'" class="tab-content">
          <div class="form-bloc">
            <div class="bloc-title"><span class="bloc-num">1</span> Coordonnées Société</div>
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
          </div>

          <div class="form-bloc">
            <div class="bloc-title"><span class="bloc-num">2</span> Période de paie</div>
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
        </div>

        <!-- ONGLET EMPLOYÉ -->
        <div v-show="activeTab === 'employe'" class="tab-content">
          <div class="form-bloc">
            <div class="bloc-title"><span class="bloc-num">1</span> Identité & Poste</div>
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
                <label>Poste / Fonction</label>
                <input v-model="emp.poste" type="text" placeholder="Ex: Responsable Comptable" />
              </div>
              <div class="field-group">
                <label>Qualification</label>
                <input v-model="emp.qualification" type="text" placeholder="Ex: Ingénieur, Technicien..." />
              </div>
            </div>
          </div>

          <div class="form-bloc">
            <div class="bloc-title"><span class="bloc-num">2</span> Situation Personnelle</div>
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
        </div>

        <!-- ONGLET RÉMUNÉRATION -->
        <div v-show="activeTab === 'remuneration'" class="tab-content">
          <div class="form-bloc">
            <div class="bloc-title"><span class="bloc-num">1</span> Salaire de Base & Fiscalité</div>
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
                  <span class="field-hint">Rémunération pour 173.33 h/mois.</span>
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
          </div>

          <div class="form-bloc">
            <div class="bloc-title"><span class="bloc-num">2</span> Temps de Travail & Absences</div>
            <div class="field-row">
              <div class="field-group">
                <label>
                  Jours payés (Base)
                  <span class="field-hint">Standard mensuel = 30 jours</span>
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
              📅 Période payée : 
              <strong v-if="calc.joursCP > 0">{{ calc.joursTrav }}j trav. + {{ calc.joursCP }}j congés</strong>
              <strong v-else>{{ calc.joursTrav }} jours</strong>
              &rarr; Base imposable : <strong>{{ fcfa(calc.salaireBase + (calc.allocationConges || 0)) }} FCFA</strong>
            </div>

            <div class="field-row mt-4">
              <div class="field-group">
                <label>H. Supplémentaires (nombre)</label>
                <input v-model.number="emp.heures_sup_nb" type="number" min="0" placeholder="0" />
              </div>
              <div class="field-group">
                <label>
                  Coefficient de majoration
                  <span class="field-hint">Fixé par le Code du Travail</span>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {{ emp.heures_sup_nb }}h × {{ fcfa(calc.tauxHoraire) }} FCFA/h × {{ emp.heures_sup_coef }} = <strong>{{ fcfa(calc.montantHeuresSup) }} FCFA</strong>
            </div>

            <div class="field-row mt-4" v-if="emp.bulletin_type === 'conges'">
              <div class="field-group">
                <label style="display: flex; align-items: center; justify-content: space-between;">
                  Calcul automatique des jours
                  <div class="toggle-container active disabled" title="Obligatoire en mode Bulletin de Congés">
                    <div class="toggle-handle"></div>
                  </div>
                </label>
                
                <div style="margin-top: 10px;">
                   <label class="text-xs">Date du dernier retour de congés</label>
                   <input v-model="emp.date_dernier_conge" type="date" class="inp" />
                   
                   <div class="field-hint" v-if="calc.joursCP > 0">
                      Droit acquis : <strong>{{ calc.joursCP }} jours</strong> ({{ calc.moisConge }} mois de service).
                   </div>
                </div>
              </div>
            </div>
          </div>

          <div class="form-bloc">
            <div class="bloc-title">
              <span class="bloc-num">3</span> 
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Primes &amp; Indemnités
            </div>

            <div class="field-row" v-if="emp.bulletin_type !== 'conges'">
              <div class="field-group">
                <label>Prime de Transport</label>
                <input v-model.number="emp.prime_transport" type="number" min="0" placeholder="30 000" />
              </div>
              <div class="field-group">
                <label>Prime de Logement</label>
                <input v-model.number="emp.prime_logement" type="number" min="0" placeholder="0" />
              </div>
            </div>

            <div v-for="(prime, index) in emp.primes" :key="prime.id" class="prime-item-grid">
              <input v-model="prime.label" type="text" placeholder="Nom de la prime" class="prime-label-input" />
              <input v-model.number="prime.montant" type="number" placeholder="Montant FCFA" class="prime-amount-input" />
              
              <div class="prime-status-actions">
                <label class="prime-checkbox-label">
                  <input v-model="prime.imposable" type="checkbox" />
                  <span>Impos.</span>
                </label>
                
                <button class="btn-remove-prime" @click="emp.primes.splice(index, 1)" title="Supprimer">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
            <button class="btn-add-prime" @click="emp.primes.push({ id: Date.now(), label: '', montant: 0, imposable: true })" style="width: 100%; padding: 8px; background: #f8fafc; border: 2px dashed #94a3b8; color: #475569; font-weight: 600; border-radius: 8px; cursor: pointer; margin-top: 5px; transition: all 0.2s;">
              + Ajouter une prime
            </button>
          </div>

          <div class="form-bloc">
            <div class="bloc-title"><span class="bloc-num">4</span> Retenues Salariales</div>
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
        </div>

        <!-- ONGLET RÈGLEMENT -->
        <div v-show="activeTab === 'reglement'" class="tab-content">
          <div class="form-bloc">
            <div class="bloc-title"><span class="bloc-num">1</span> Mode de Paiement</div>
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
              <span class="field-hint">Le RIB apparaîtra sur le bulletin.</span>
            </div>
          </div>
        </div>

        <div class="tab-nav">
          <button v-if="activeTab !== tabs[0].id" class="tab-prev" @click="goToTab(tabs[tabs.findIndex(t => t.id === activeTab) - 1].id)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Précédent
          </button>
          <button v-if="activeTab !== tabs[tabs.length - 1].id" class="tab-next" @click="goToTab(tabs[tabs.findIndex(t => t.id === activeTab) + 1].id)">
            Suivant
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>

        <div class="action-bar-bottom" style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0; text-align: center;">
          <button class="btn-generate" @click="generatePDF" :disabled="generating">
            <svg v-if="generating" class="spin-icon" viewBox="0 0 24 24" fill="none" width="16" height="16">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="31 31"></circle>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {{ generating ? 'Génération...' : 'Générer PDF' }}
          </button>

          <div v-if="errorMsg" class="error-alert mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ errorMsg }}
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
                  <td class="val">{{ fcfa(calc.salaireBaseMensuel) }}</td>
                  <td class="val">{{ calc.tauxAnciennete }}%</td>
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
                  <td class="label">CMU (ASSURANCE MALADIE) [{{ calc.totalPersonnesCMU }} pers.]</td>
                  <td class="val">{{ fcfa(calc.totalPersonnesCMU * 1000) }}</td>
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

    <!-- Section Explications (Centrée et épurée) -->
    <div class="education-section">
      <div class="edu-container">
        <h3 class="edu-title">
          Comprendre le Bulletin Ivoirien
          <div class="edu-flag">
            <svg width="24" height="16" viewBox="0 0 3 2"><rect width="3" height="2" fill="#009A44"/><rect width="2" height="2" fill="#FFF"/><rect width="1" height="2" fill="#FF8200"/></svg>
          </div>
        </h3>
        <p class="edu-intro">Quelques clés pour mieux décrypter vos rubriques de paie</p>
        
        <div class="edu-grid">
          <div v-for="(edu, key) in explanations" :key="key" class="edu-card">
            <div class="edu-card-icon">💡</div>
            <h4>{{ edu.title }}</h4>
            <p>{{ edu.text }}</p>
          </div>
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
  display: block;
}

@media (min-width: 1024px) {
  .paysim-body {
    display: grid;
    grid-template-columns: 500px 1fr;
    min-height: 580px;
    padding-bottom: 0;
  }
}

/* BOUTONS D'ACTION */
.btn-remove-prime {
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
  display: none;
  border-bottom: 1px solid #e2e8f0;
  background: white;
}

@media (min-width: 1024px) {
  .form-tabs {
    display: flex;
  }
}
.form-tab {
  flex: 1;
  padding: 0.85rem 0.25rem;
  font-size: 0.7rem;
  font-weight: 700;
  border: none;
  background: none;
  cursor: pointer;
  color: #64748b;
  border-bottom: 3px solid transparent;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.form-tab.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  background: #f0f7ff;
}

@media (min-width: 400px) {
  .form-tab {
    flex-direction: row;
    justify-content: center;
    font-size: 0.75rem;
    gap: 8px;
  }
}

.tab-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
}

.form-tab.active .tab-icon-wrapper {
  opacity: 1;
}

/* Mobile Stepper Header */
.mobile-stepper-header {
  background: white;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e2e8f0;
}

@media (min-width: 1024px) {
  .mobile-stepper-header {
    display: none;
  }
}

.stepper-progress {
  display: flex;
  justify-content: space-between;
  position: relative;
  margin-bottom: 1.25rem;
  padding: 0 5px;
}

.progress-line {
  position: absolute;
  top: 15px;
  left: 20px;
  right: 20px;
  height: 2px;
  background: #e2e8f0;
  z-index: 1;
}

.progress-line-fill {
  height: 100%;
  background: #2563eb;
  transition: width 0.3s ease;
}

.step-progress-item {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.step-circle {
  width: 32px;
  height: 32px;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 800;
  color: #64748b;
  transition: all 0.3s;
}

.step-progress-item.active .step-circle {
  background: #2563eb;
  border-color: #2563eb;
  color: white;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.15);
}

.step-progress-item.completed .step-circle {
  background: #22c55e;
  border-color: #22c55e;
  color: white;
}

.step-dot-label {
  font-size: 0.65rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
}

.step-progress-item.active .step-dot-label {
  color: #2563eb;
}

.active-step-info h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #1e293b;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.tab-content {
  padding: 1.25rem;
  flex: 1;
  overflow-y: auto;
}

/* Floating Summary Bar Premium */
.mobile-floating-summary {
  position: sticky;
  bottom: 0px;
  margin: 1rem -1.25rem -1.25rem -1.25rem; /* Offset parent padding */
  background: #1e293b;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 12px 18px env(safe-area-inset-bottom);
  z-index: 999999;
  box-shadow: 0 -10px 25px rgba(0, 0, 0, 0.2);
}

.warning-negative {
  background: #450a0a;
  border-top-color: #ef4444;
}

.mfs-warning-text {
  font-size: 0.65rem;
  color: #fecaca;
  text-align: center;
  margin-top: 8px;
  font-weight: 500;
}

@media (min-width: 480px) {
  .mobile-floating-summary {
    position: fixed;
    bottom: 15px;
    left: 15px;
    right: 15px;
    margin: 0;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
}

@media (min-width: 1024px) {
  .mobile-floating-summary {
    display: none;
  }
}

.mfs-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mfs-info {
  display: flex;
  flex-direction: column;
}

.mfs-label {
  font-size: 0.6rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.mfs-value {
  font-size: 1.35rem;
  font-weight: 900;
  color: #f8fafc;
  line-height: 1;
}

.mfs-value small {
  font-size: 0.75rem;
  font-weight: 600;
  color: #94a3b8;
  margin-left: 2px;
}

.mfs-btn {
  background: #2563eb;
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.mfs-btn:active {
  transform: scale(0.95);
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
  grid-template-columns: 1fr; /* Stack mobile */
  gap: 0.75rem;
  margin-bottom: 0;
}

@media (min-width: 480px) {
  .field-row {
    grid-template-columns: 1fr 1fr;
  }
}
/* Bulletin Type Nav Mobile Optimization */
.bulletin-type-nav {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.bt-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px;
  background: white;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.bt-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  color: #475569;
}

.bt-btn.active {
  border-color: #2563eb;
  background: #2563eb;
  color: white;
  box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);
}

.bt-btn.active .bt-content {
  color: white;
}

@media (min-width: 1024px) {
  .bulletin-type-nav {
    display: block;
    padding: 1.5rem;
    background: none;
    border-bottom: none;
  }
  .bt-btn {
    justify-content: flex-start;
    padding: 1rem;
    margin-bottom: 0.75rem;
  }
}

.separator-label {
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0.75rem 0 1rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid #e2e8f0;
}

/* Form Blocs */
.form-bloc {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  transition: transform 0.2s, box-shadow 0.2s;
}

.form-bloc:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08);
}

.bloc-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.95rem;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 1.5rem;
  letter-spacing: -0.01em;
}

.bloc-num {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: white;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 900;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
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



/* Primes & Indemnités Layout */
.prime-item-grid {
  display: grid;
  grid-template-columns: 2fr 100px;
  gap: 12px;
  margin-bottom: 12px;
  padding: 15px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.prime-label-input, 
.prime-amount-input {
  padding: 12px 15px !important;
  border: 1px solid #d1d5db !important;
  border-radius: 8px !important;
  font-size: 1rem !important;
  font-weight: 600 !important;
  background: #f8fafc !important;
  width: 100% !important;
  box-sizing: border-box !important;
  color: #0f172a !important;
}

.prime-label-input:focus, 
.prime-amount-input:focus {
  border-color: #2563eb !important;
  background: white !important;
  outline: none !important;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1) !important;
}

@media (max-width: 500px) {
  .prime-item-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
}

.prime-status-actions {
  grid-column: span 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #f1f5f9;
  padding-top: 10px;
  margin-top: 2px;
  width: 100%;
}

.prime-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  user-select: none;
}

.prime-checkbox-label input[type="checkbox"] {
  width: 16px !important;
  height: 16px !important;
  margin: 0;
}

@media (min-width: 640px) {
  .prime-item-grid {
    grid-template-columns: 3.5fr 120px auto;
    gap: 15px;
    padding: 0;
    background: none;
    border: none;
    margin-bottom: 12px;
  }
  .prime-status-actions {
    grid-column: auto;
    border-top: none;
    padding-top: 0;
    margin-top: 0;
    gap: 15px;
  }
}

.tax-badge {
  display: inline-block;
  font-weight: 800;
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  margin-right: 0.4rem;
}

/* Toggle Switch Styles */
.toggle-container {
  width: 40px;
  height: 20px;
  background: #cbd5e1;
  border-radius: 10px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
}
.toggle-container.active { background: #2563eb; }
.toggle-container.disabled { cursor: not-allowed; opacity: 0.7; }
.toggle-handle {
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.toggle-container.active .toggle-handle { left: 22px; }
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
  padding: 0.5rem; /* Mobile padding */
  overflow-y: auto;
  background: #f1f5f9;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

@media (min-width: 640px) {
  .paysim-preview {
    padding: 1.5rem;
  }
}

.preview-container {
  background: white;
  width: 100%;
  max-width: 1050px;
  padding: 15px; /* Mobile padding */
  border-radius: 4px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  font-family: 'Inter', system-ui, sans-serif;
  color: #1e293b;
  border-top: 6px solid #1e3a8a;
  box-sizing: border-box;
}

@media (min-width: 768px) {
  .preview-container {
    padding: 30px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
    border-top-width: 10px;
  }
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
  grid-template-columns: 1fr; /* Mobile stack */
  gap: 15px;
  margin-bottom: 20px;
}

@media (min-width: 768px) {
  .logipaie-header-grid {
    grid-template-columns: 1.4fr 1fr;
    gap: 20px;
  }
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
  grid-template-columns: 1fr; /* Mobile stack */
  gap: 15px;
  align-items: stretch;
}

@media (min-width: 800px) {
  .logipaie-footer-grid {
    grid-template-columns: 1.4fr 1fr 1fr;
  }
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

.net-pay-box {
  display: flex;
  flex-direction: column; /* Mobile stack */
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: white;
  border: 4px solid #000;
  text-align: center;
}

@media (min-width: 640px) {
  .net-pay-box {
    flex-direction: row;
    justify-content: space-between;
    text-align: right;
  }
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

/* --- Responsive adjustments (Desktop specific) --- */
@media (min-width: 1024px) {
  .paysim-form { 
    border-right: 1px solid #e2e8f0;
    max-height: 800px;
    overflow-y: auto;
  }
  .preview-container {
    position: sticky;
    top: 20px;
  }
}

@media (max-width: 640px) {
  .paysim-header {
    flex-direction: column;
    text-align: center;
    padding: 1rem;
  }
  .preview-container {
    padding: 10px;
  }
  .logipaie-table {
    font-size: 0.65rem;
  }
}



/* ══════════════════════════════════════════
   SECTION EDUCATION (CENTRÉE)
══════════════════════════════════════════ */
.education-section {
  padding: 3rem 1.25rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.edu-container {
  max-width: 1000px;
  margin: 0 auto;
}

.edu-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 1.35rem;
  font-weight: 850;
  color: #0f172a;
  margin-bottom: 0.5rem;
  letter-spacing: -0.02em;
  text-align: center;
}

.edu-intro {
  color: #64748b;
  font-size: 0.9rem;
  margin-bottom: 2.5rem;
  text-align: center;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.5;
}

.edu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.edu-card {
  background: white;
  padding: 1.75rem 1.25rem;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  transition: all 0.3s ease;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.edu-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.08);
  border-color: #3b82f6;
}

.edu-card-icon {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  background: #f0f9ff;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
}

.edu-card h4 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: #1e293b;
}

.edu-card p {
  margin: 0;
  font-size: 0.88rem;
  color: #475569;
  line-height: 1.6;
}

.edu-flag {
  display: flex;
  align-items: center;
  border-radius: 3px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

@media (max-width: 640px) {
  .education-section {
    padding: 2.5rem 1rem;
  }
  .edu-title {
    font-size: 1.25rem;
    flex-wrap: wrap;
  }
  .edu-intro {
    font-size: 0.85rem;
    margin-bottom: 2rem;
  }
  .edu-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  .edu-card {
    padding: 1.5rem 1.15rem;
  }
}
</style>
