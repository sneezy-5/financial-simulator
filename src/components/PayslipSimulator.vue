<script setup>
import { ref, computed, watch } from 'vue'
import { getCountryRules } from '../services/countryConfig.js'
import { calculatePayslip } from '../services/calculators/index.js'
import { user, fetchMe } from '../services/auth.js'

const emit = defineEmits(['require-auth', 'require-billing'])

// Prop optionnel pour pré-sélectionner le type depuis le composant parent
const props = defineProps({
  initialType: {
    type: String,
    default: 'habituel' // 'habituel' | 'conges'
  },
  country: {
    type: String,
    default: 'CI'
  }
})

// ══════════════════════════════════════════════
// DONNÉES DE L'EMPLOYÉ
// ══════════════════════════════════════════════
const emp = ref({
  pays: props.country || 'CI',
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
  statut_salarie: 'local', // 'local' ou 'expatrie'
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

const countryRules = computed(() => {
  const p = emp.value.pays || props.country || 'CI'
  return getCountryRules(p)
})

watch(countryRules, (newRules) => {
  if (newRules && newRules.villeParDefaut) {
    emp.value.adresse = newRules.villeParDefaut
  }
}, { immediate: true })

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

// ═══ PARTAGE DE SIMULATION (Deeplink avec données) ═══
const shareToast = ref(false)

function shareSimulation() {
  try {
    // Sérialiser les champs clés de la simulation
    const shareData = {
      sb: emp.value.salaire_base,
      ss: emp.value.sursalaire,
      pt: emp.value.prime_transport,
      pl: emp.value.prime_logement,
      ne: emp.value.nombre_enfants,
      sm: emp.value.situation_matrimoniale,
      st: emp.value.statut_salarie,
      tc: emp.value.type_contrat,
      jt: emp.value.jours_travailles,
      aj: emp.value.absences_jours,
      hs: emp.value.heures_sup_nb,
      hc: emp.value.heures_sup_coef,
      ac: emp.value.acompte,
      av: emp.value.avance,
      op: emp.value.opposition,
      ar: emp.value.autres_retenues,
      ad: emp.value.ayants_droit_cmu,
      nm: emp.value.nom,
      pr: emp.value.prenom,
      po: emp.value.poste,
      ne2: emp.value.nom_entreprise,
      bt: emp.value.bulletin_type || props.initialType || 'habituel',
      py: emp.value.pays || props.country || 'CI',
      pm: emp.value.primes?.filter(p => p.montant > 0).map(p => ({ l: p.label, m: p.montant, i: p.imposable }))
    }
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))))
    const type = shareData.bt
    const country = shareData.py
    const url = `${window.location.origin}${window.location.pathname}?module=hr&type=${type}&country=${country}&d=${encoded}`
    
    navigator.clipboard.writeText(url).then(() => {
      shareToast.value = true
      setTimeout(() => { shareToast.value = false }, 3000)
    }).catch(() => {
      // Fallback pour navigateurs anciens
      prompt('Copiez ce lien :', url)
    })
  } catch (e) {
    console.error('Erreur partage:', e)
  }
}

// Charger les données depuis l'URL si présentes
function loadFromUrlData() {
  try {
    const params = new URLSearchParams(window.location.search)
    const dataStr = params.get('d')
    if (!dataStr) return
    
    const d = JSON.parse(decodeURIComponent(escape(atob(dataStr))))
    if (d.sb !== undefined) emp.value.salaire_base = Number(d.sb)
    if (d.ss !== undefined) emp.value.sursalaire = Number(d.ss)
    if (d.pt !== undefined) emp.value.prime_transport = Number(d.pt)
    if (d.pl !== undefined) emp.value.prime_logement = Number(d.pl)
    if (d.ne !== undefined) emp.value.nombre_enfants = Number(d.ne)
    if (d.sm) emp.value.situation_matrimoniale = d.sm
    if (d.st) emp.value.statut_salarie = d.st
    if (d.tc) emp.value.type_contrat = d.tc
    if (d.jt !== undefined) emp.value.jours_travailles = Number(d.jt)
    if (d.aj !== undefined) emp.value.absences_jours = Number(d.aj)
    if (d.hs !== undefined) emp.value.heures_sup_nb = Number(d.hs)
    if (d.hc !== undefined) emp.value.heures_sup_coef = Number(d.hc)
    if (d.ac !== undefined) emp.value.acompte = Number(d.ac)
    if (d.av !== undefined) emp.value.avance = Number(d.av)
    if (d.op !== undefined) emp.value.opposition = Number(d.op)
    if (d.ar !== undefined) emp.value.autres_retenues = Number(d.ar)
    if (d.ad !== undefined) emp.value.ayants_droit_cmu = Number(d.ad)
    if (d.nm) emp.value.nom = d.nm
    if (d.pr) emp.value.prenom = d.pr
    if (d.po) emp.value.poste = d.po
    if (d.ne2) emp.value.nom_entreprise = d.ne2
    if (d.pm && Array.isArray(d.pm)) {
      emp.value.primes = d.pm.map((p, i) => ({
        id: i + 1,
        label: p.l || `Prime ${i + 1}`,
        montant: Number(p.m) || 0,
        imposable: p.i !== false
      }))
    }
  } catch (e) {
    console.warn('Deeplink data invalide:', e)
  }
}

const defaultTemplateHtml = ref(null)

// Charger au montage
import { onMounted } from 'vue'
import { localDb } from '../services/localDatabase.js'

onMounted(async () => {
  loadFromUrlData()
  try {
    const templates = await localDb.getTemplates()
    const defTpl = templates.find(t => t.isDefault && (!t.type || t.type === 'payslip'))
    if (defTpl && defTpl.htmlTemplate) {
      defaultTemplateHtml.value = defTpl.htmlTemplate
    }
  } catch (e) {
    console.warn("Erreur chargement template", e)
  }
})

const livePreviewHtml = computed(() => {
  if (!defaultTemplateHtml.value) return ''
  
  const c = calc.value || {}
  const viewData = {
    ...emp.value,
    ...c,
    date_jour: new Date().toLocaleDateString(),
    nom_entreprise: (emp.value.nom_entreprise || 'ENTREPRISE').toUpperCase()
  }

  let html = defaultTemplateHtml.value
  const formatFCFA = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

  for (const key of Object.keys(viewData)) {
    const val = viewData[key]
    // Flatten nested objects (like salarial, patronal) if necessary, but string replace is flat
    // In payrollService we just do a flat replace of the top level keys
    // Wait, calc.salarial.cnps exists. The backend does a flat Object.keys(viewData), so it doesn't handle nested tags unless they are flattened!
    // Actually the backend just does ...calculs, which has nested objects. We need to flatten them here for the frontend live preview!
    if (typeof val === 'object' && val !== null) {
        for (const subKey of Object.keys(val)) {
            const subVal = val[subKey]
            const strVal = typeof subVal === 'number' ? formatFCFA(subVal) : (subVal || '')
            const regex = new RegExp(`{${key}.${subKey}}`, 'g')
            html = html.replace(regex, strVal)
        }
    }
    const strVal = typeof val === 'number' ? formatFCFA(val) : (val || '')
    const regex = new RegExp(`{${key}}`, 'g')
    html = html.replace(regex, strVal)
  }
  html = html.replace(/{[^}]+}/g, '0')

  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <script src="https://cdn.tailwindcss.com"><\/script>
        <style>
            html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 11px; line-height: 1.4; background: white; }
            body { padding: 12px; box-sizing: border-box; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            table { font-size: 11px; border-collapse: collapse; width: 100%; }
            td, th { padding: 3px 6px; }
        </style>
    </head>
    <body>${html}
    <script>
      function notifyHeight() {
        const h = document.body.scrollHeight;
        window.parent.postMessage({ iframeHeight: h }, '*');
      }
      window.addEventListener('load', notifyHeight);
      const obs = new MutationObserver(notifyHeight);
      obs.observe(document.body, { childList: true, subtree: true });
    <\/script>
    </body>
    </html>
  `
  return fullHtml
})

const templateIframeRef = ref(null)
const templateIframeHeight = ref(900)

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.data && event.data.iframeHeight) {
      templateIframeHeight.value = Math.max(600, event.data.iframeHeight + 40)
    }
  })
}

const showHelp = ref(false)

const explanations = computed(() => {
  const r = countryRules.value
  return {
    salaire_base: {
      title: "Salaire de Base",
      text: `C'est la rémunération convenue au contrat pour 173.33 heures le mois. ${r.preposition.charAt(0).toUpperCase() + r.preposition.slice(1)} ${r.name}, c'est la base de calcul pour la plupart des primes et cotisations.`
    },
    heures_sup: {
      title: "Heures Supplémentaires",
      text: `Toute heure travaillée au-delà de 40h/semaine. ${r.preposition.charAt(0).toUpperCase() + r.preposition.slice(1)} ${r.name}, elles sont majorées (15%, 50%, 75% ou 100% selon le moment). Elles augmentent votre brut imposable.`
    },
    impot_salarial: {
      title: r.libelleImpotSalarial,
      text: `C'est l'impôt retenu chaque mois sur votre salaire ${r.preposition} ${r.name}. Le calcul est progressif par tranches. Plus votre salaire est élevé, plus le taux marginal augmente.`
    },
    retraite: {
      title: `${r.organismeRetraite} (Retraite)`,
      text: `Une part de ${(r.tauxRetraiteSal * 100).toFixed(1)}% est retenue sur votre salaire brut (plafonné à ${Math.round(r.plafondRetraite).toLocaleString('fr-FR')} FCFA) pour financer votre future retraite. L'employeur paie ${(r.tauxRetraitePat * 100).toFixed(1)}% de son côté.`
    },
    sante: {
      title: `${r.organismeSante} (Santé)`,
      text: r.hasCMU
        ? `Cotisation de 1 000 FCFA par personne (vous et vos ayants droit). Elle permet d'accéder aux soins à prix réduit dans les centres conventionnés.`
        : `Le régime de santé ${r.preposition} ${r.name} est géré par ${r.organismeSante}. Les modalités de cotisation varient selon le régime applicable.`
    },
    impot_employeur: {
      title: r.libelleImpotEmployeur,
      text: `C'est une taxe payée par l'employeur sur la masse salariale. ${r.preposition.charAt(0).toUpperCase() + r.preposition.slice(1)} ${r.name}, le taux est de ${(r.tauxImpotEmployeurLocal * 100).toFixed(1)}% pour les salariés locaux${r.tauxImpotEmployeurExpat !== r.tauxImpotEmployeurLocal ? ` et ${(r.tauxImpotEmployeurExpat * 100).toFixed(1)}% pour les expatriés` : ''}.`
    },
    transport: {
      title: "Prime de Transport",
      text: `C'est une indemnité pour vos frais de déplacement. Elle n'est généralement pas imposable jusqu'à un certain seuil : vous recevez 100% du montant sans retenue.`
    },
    anciennete: {
      title: "Prime d'Ancienneté",
      text: "Générée automatiquement si vous avez plus de 2 ans de service (basé sur la date d'embauche). Le taux commence à 2% après 2 ans et progresse de +1% par an, plafonné à 25%."
    },
    conges: {
      title: "Allocation Congés Payés",
      text: "Si vous prenez des jours de repos, cette indemnité remplace le salaire des jours correspondants. Elle est imposable et soumise à cotisations car elle remplace un revenu."
    }
  }
})

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
  return calculatePayslip(emp.value, countryRules.value)
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

  const token = localStorage.getItem('auth_token')
  if (!token) {
    errorMsg.value = "Vous devez être connecté pour générer un bulletin de paie. (Coût : 5 crédits)"
    emit('require-auth')
    return
  }

  if (user.value && user.value.credits < 5) {
    errorMsg.value = `Crédits insuffisants. Il vous faut 5 crédits pour générer ce bulletin. Votre solde : ${user.value.credits} crédits.`
    emit('require-billing')
    return
  }

  generating.value = true
  errorMsg.value = null
  generated.value = false
  downloadUrl.value = null

  try {
    let htmlTemplate = null
    try {
      const { localDb } = await import('../services/localDatabase.js')
      const templates = await localDb.getTemplates()
      const defTpl = templates.find(t => t.isDefault && (!t.type || t.type === 'payslip'))
      if (defTpl && defTpl.htmlTemplate) {
        htmlTemplate = defTpl.htmlTemplate
      }
    } catch(e) {
      console.warn('Erreur lecture modèle par défaut', e)
    }

    const response = await fetch('/api/rh/generate-single-payslip', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ employee: emp.value, htmlTemplate })
    })

    if (!response.ok) {
      if (response.status === 402) {
        emit('require-billing')
      }
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Erreur serveur')
    }

    const blob = await response.blob()
    downloadUrl.value = URL.createObjectURL(blob)
    generated.value = true

    // Rafraîchir les crédits de l'utilisateur
    try {
      await fetchMe()
    } catch (fetchErr) {
      console.warn("Erreur rafraîchissement utilisateur:", fetchErr)
    }
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
      <div style="flex: 1;">
        <h3>Simulation de Bulletin de Paie</h3>
        <p>Saisissez les données et visualisez le résultat en temps réel</p>
      </div>
      <button class="share-sim-btn" @click="shareSimulation" title="Copier le lien de partage avec vos données de simulation">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        <span>Partager</span>
      </button>
    </div>

    <!-- Toast de confirmation de partage -->
    <div v-if="shareToast" class="share-toast" style="display: flex; align-items: center; gap: 8px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Lien de simulation copié dans le presse-papiers !
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
              <input v-model="emp.nom_entreprise" type="text" :placeholder="`Ex: ${countryRules.name} PAIE`" />
            </div>
            <div class="field-group">
              <label>Zone Fiscale & Réglementation</label>
              <select v-model="emp.pays">
                <option value="CI">🇨🇮 Côte d'Ivoire (UEMOA)</option>
                <option value="BJ">🇧🇯 Bénin (UEMOA)</option>
                <option value="TG">🇹🇬 Togo (UEMOA)</option>
              </select>
            </div>
            <div class="field-group">
              <label>Adresse</label>
              <input v-model="emp.adresse" type="text" :placeholder="`Ex: ${countryRules.villeParDefaut || 'Capitale'}`" />
            </div>
            <div class="field-group">
              <label>Siège Social</label>
              <input v-model="emp.siege_social" type="text" placeholder="Ex: BINGERVILLE-CITEE FDFP-VILLA 67" />
            </div>
            <div class="field-row">
              <div class="field-group">
                <label>E-mail Entreprise</label>
                <input v-model="emp.email_entreprise" type="email" :placeholder="`infos@entreprise.${countryRules.code.toLowerCase()}`" />
              </div>
              <div class="field-group">
                <label>Téléphone Employeur</label>
                <input v-model="emp.tel_entreprise" type="text" placeholder="+225 ..." />
              </div>
            </div>
            <div class="field-row">
              <div class="field-group">
                <label>N° {{ countryRules.organismeRetraite.split(' ')[0] }}</label>
                <input v-model="emp.numero_cnps" type="text" :placeholder="`Numéro ${countryRules.organismeRetraite.split(' ')[0]}`" />
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
            <div class="field-row">
              <div class="field-group">
                <label>Statut du salarié</label>
                <select v-model="emp.statut_salarie">
                  <option value="local">Local</option>
                  <option value="expatrie">Expatrié</option>
                </select>
              </div>
            </div>
            <div class="parts-badge" v-if="countryRules.hasPartsFiscales">
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
                  <option value="2024">Nouveau Régime ({{ countryRules.libelleImpotSalarial.split(' ')[0] }})</option>
                  <option value="ancien">Ancien Régime</option>
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
            {{ generating ? 'Génération...' : 'Générer PDF (5 crédits)' }}
          </button>

          <div v-if="errorMsg" class="error-alert mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ errorMsg }}
          </div>
          
          <div v-if="downloadUrl" class="success-alert mt-4" style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Génération réussie !
            </div>
            <div style="display: flex; align-items: center;">
              <a :href="downloadUrl" :download="computedFileName" class="dl-link" title="Télécharger" style="display: inline-flex; align-items: center; gap: 4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Télécharger PDF
              </a>
              <button @click="reset" class="btn-reset-small ml-4 text-xs text-gray-500 underline">Faire un autre</button>
            </div>
          </div>
        </div>

      </div>

      <!-- COLONNE DROITE: Prévisualisation Premium LOGIPAIE -->
      <div class="paysim-preview">
        <div v-if="defaultTemplateHtml" class="preview-container" style="padding: 0; background: transparent; border: none;">
          <iframe
            ref="templateIframeRef"
            :srcdoc="livePreviewHtml"
            :style="{ width: '100%', height: templateIframeHeight + 'px', border: 'none', borderRadius: '8px', boxShadow: '0 1px 8px rgba(0,0,0,0.08)', background: 'white', display: 'block' }"
            scrolling="no"
          ></iframe>
        </div>
        <div v-else class="preview-container">
          
          <!-- Header Bulletin Neutre -->
          <div class="preview-header">
            <div class="header-left">
              <div class="company-name-main">{{ (emp.nom_entreprise || 'MON ENTREPRISE').toUpperCase() }}</div>
              <div class="company-sub">
                <p>{{ emp.adresse || countryRules.villeParDefaut || 'Capitale' }}</p>
                <div class="fiscal-ids">
                  <span v-if="emp.numero_contribuable">N° CC: {{ emp.numero_contribuable }}</span>
                  <span v-if="emp.numero_rc">RCCM: {{ emp.numero_rc }}</span>
                  <span v-if="emp.numero_cnps">{{ countryRules.organismeRetraite.split(' ')[0] }}: {{ emp.numero_cnps }}</span>
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
                <div class="lph-row"><span>N° {{ countryRules.organismeRetraite.split(' ')[0] }} :</span> <strong>{{ emp.num_secu || '____' }}</strong></div>
                <div class="lph-row" v-if="countryRules.hasPartsFiscales"><span>Parts fiscales :</span> <strong>{{ calc.parts?.toFixed(2) }}</strong></div>
                <div class="lph-row"><span>Type Contrat :</span> <span>{{ emp.type_contrat || 'CDI' }}</span></div>
                <div class="lph-row"><span>Ancienneté :</span> <span>{{ calc.ancienneteTxt || '____' }}</span></div>
              </div>
            </div>
          </div>

          <!-- Tableau de Paie Modèle Bénin -->
          <div v-if="countryRules.code === 'BJ'" class="table-wrapper payslip-benin">
            <div class="benin-section-title">DÉTAIL DE LA RÉMUNÉRATION</div>
            <table class="benin-table">
              <thead>
                <tr>
                  <th class="benin-col-label">RUBRIQUES DE GAINS (ÉLÉMENTS DE RÉMUNÉRATION)</th>
                  <th class="benin-col-base">Base</th>
                  <th class="benin-col-taux">Taux</th>
                  <th class="benin-col-montant">Montant (FCFA)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="label">1. Salaire de base</td>
                  <td class="val"></td><td class="val"></td>
                  <td class="montant">{{ fcfa(calc.salaireBase) }}</td>
                </tr>
                <tr v-if="calc.montantHeuresSup > 0">
                  <td class="label">2. Heures supplémentaires</td>
                  <td class="val"></td><td class="val"></td>
                  <td class="montant">{{ fcfa(calc.montantHeuresSup) }}</td>
                </tr>
                <tr v-if="calc.primeAnciennete > 0 || calc.sursalaire > 0 || calc.primesImposables > 0 || calc.primesNonImposablesRub > 0">
                  <td class="label">3. Primes (rendement, fonction, etc.)</td>
                  <td class="val"></td><td class="val"></td>
                  <td class="montant">{{ fcfa(calc.primeAnciennete + calc.sursalaire + calc.primesImposables + calc.primesNonImposablesRub) }}</td>
                </tr>
                <tr v-if="calc.primeTransport > 0 || calc.primeLogement > 0">
                  <td class="label">4. Indemnités (transport, logement, représentation, etc.)</td>
                  <td class="val"></td><td class="val"></td>
                  <td class="montant">{{ fcfa(calc.primeTransport + calc.primeLogement) }}</td>
                </tr>
                <tr v-if="calc.allocationConges > 0">
                  <td class="label">5. Gratifications / Congés Payés</td>
                  <td class="val"></td><td class="val"></td>
                  <td class="montant">{{ fcfa(calc.allocationConges) }}</td>
                </tr>
                <!-- Brut -->
                <tr class="benin-total-row">
                  <td colspan="3">TOTAL SALAIRE BRUT (A)</td>
                  <td class="montant">{{ fcfa(calc.gainsTotaux) }} FCFA</td>
                </tr>
              </tbody>
            </table>

            <table class="benin-table mt-4">
              <thead>
                <tr>
                  <th class="benin-col-label">RETENUES LÉGALES ET AUTRES RETENUES</th>
                  <th class="benin-col-base">Base</th>
                  <th class="benin-col-taux">Taux</th>
                  <th class="benin-col-montant">Montant (FCFA)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="label">1. CNSS – part salariale</td>
                  <td class="val">(A)</td>
                  <td class="val">3,6%</td>
                  <td class="montant">{{ fcfa(calc.salarial.cnps) }}</td>
                </tr>
                <tr>
                  <td class="label">2. Salaire imposable (B)</td>
                  <td class="val">(A) – CNSS</td>
                  <td class="val"></td>
                  <td class="montant">{{ fcfa(calc.salarial.baseITS) }}</td>
                </tr>
                <tr>
                  <td class="label">3. ITS (Impôt sur les traitements et salaires)</td>
                  <td class="val">(B)</td>
                  <td class="val">barème</td>
                  <td class="montant">{{ fcfa(calc.salarial.its) }}</td>
                </tr>
                <tr v-for="taxe in calc.salarial.autresTaxes" :key="taxe.code">
                  <td class="label">4. {{ taxe.label }}</td>
                  <td class="val"></td><td class="val"></td>
                  <td class="montant">{{ fcfa(taxe.montant) }}</td>
                </tr>
                <tr v-if="(calc.salarial.total - calc.salarial.its - calc.salarial.cnps - (calc.salarial.autresTaxes[0]?.montant || 0)) > 0">
                  <td class="label">5. Autres retenues autorisées</td>
                  <td class="val"></td><td class="val"></td>
                  <td class="montant">{{ fcfa(calc.salarial.total - calc.salarial.its - calc.salarial.cnps - (calc.salarial.autresTaxes[0]?.montant || 0)) }}</td>
                </tr>
                <!-- Total Retenues -->
                <tr class="benin-total-row">
                  <td colspan="3">TOTAL DES RETENUES (C)</td>
                  <td class="montant">{{ fcfa(calc.salarial.total) }} FCFA</td>
                </tr>
              </tbody>
            </table>

            <table class="benin-table mt-4" style="border-top: 2px solid #1e293b;">
              <tbody>
                <tr>
                  <td class="label" colspan="3" style="font-weight: 500;">Salaire brut (A)</td>
                  <td class="montant">{{ fcfa(calc.gainsTotaux) }} FCFA</td>
                </tr>
                <tr>
                  <td class="label" colspan="3" style="font-weight: 500;">Moins : Total des retenues (C)</td>
                  <td class="montant">{{ fcfa(calc.salarial.total) }} FCFA</td>
                </tr>
                <tr class="benin-net-row">
                  <td colspan="3">NET À PAYER (D = A – C)</td>
                  <td class="montant">{{ fcfa(calc.netAPayer) }} FCFA</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Tableau de Paie Modèle Togo -->
          <div v-else-if="countryRules.code === 'TG'" class="table-wrapper payslip-benin">
            <div class="benin-section-title">DÉTAIL DE LA RÉMUNÉRATION (TOGO)</div>
            
            <!-- 1. GAINS -->
            <table class="benin-table">
              <thead>
                <tr>
                  <th class="benin-col-label">RUBRIQUES DE GAINS (RÉMUNÉRATION)</th>
                  <th class="benin-col-base">Base</th>
                  <th class="benin-col-taux">Taux</th>
                  <th class="benin-col-montant">Montant (FCFA)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="label">1. Salaire de base</td>
                  <td class="val"></td><td class="val"></td>
                  <td class="montant">{{ fcfa(calc.salaireBase) }}</td>
                </tr>
                <tr v-if="calc.primeAnciennete > 0">
                  <td class="label">2. Prime d'ancienneté ({{ calc.ansAnciennete }} ans)</td>
                  <td class="val">catégorie</td><td class="val">{{ calc.tauxAnciennete }}%</td>
                  <td class="montant">{{ fcfa(calc.primeAnciennete) }}</td>
                </tr>
                <tr v-if="calc.montantHeuresSup > 0">
                  <td class="label">3. Heures supplémentaires</td>
                  <td class="val">{{ fcfa(calc.tauxHoraire) }}</td><td class="val">{{ calc.nbHeuresSup }}h</td>
                  <td class="montant">{{ fcfa(calc.montantHeuresSup) }}</td>
                </tr>
                <tr v-if="calc.sursalaire > 0 || calc.primesImposables > 0 || calc.primesNonImposablesRub > 0">
                  <td class="label">4. Primes (rendement, assiduité, etc.)</td>
                  <td class="val"></td><td class="val"></td>
                  <td class="montant">{{ fcfa(calc.sursalaire + calc.primesImposables + calc.primesNonImposablesRub) }}</td>
                </tr>
                <tr v-if="calc.primeTransport > 0 || calc.primeLogement > 0">
                  <td class="label">5. Indemnités (transport, logement)</td>
                  <td class="val"></td><td class="val"></td>
                  <td class="montant">{{ fcfa(calc.primeTransport + calc.primeLogement) }}</td>
                </tr>
                <tr v-if="calc.allocationConges > 0">
                  <td class="label">6. Gratifications / Congés Payés</td>
                  <td class="val"></td><td class="val"></td>
                  <td class="montant">{{ fcfa(calc.allocationConges) }}</td>
                </tr>
                <tr class="benin-total-row">
                  <td colspan="3">TOTAL SALAIRE BRUT (A)</td>
                  <td class="montant">{{ fcfa(calc.gainsTotaux) }} FCFA</td>
                </tr>
              </tbody>
            </table>

            <!-- 2. RETENUES SOCIALES -->
            <table class="benin-table mt-4">
              <thead>
                <tr>
                  <th class="benin-col-label">RETENUES SOCIALES SALARIALES</th>
                  <th class="benin-col-base">Base</th>
                  <th class="benin-col-taux">Taux</th>
                  <th class="benin-col-montant">Montant (FCFA)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="label">1. CNSS – part salariale (Vieillesse, Invalidité)</td>
                  <td class="val">(A)</td><td class="val">4,0%</td>
                  <td class="montant">{{ fcfa(calc.salarial.cnps) }}</td>
                </tr>
                <tr>
                  <td class="label">2. Assurance Maladie (INAM / AMU)</td>
                  <td class="val">(A)</td><td class="val">5,0%</td>
                  <td class="montant">{{ fcfa(calc.salarial.inam || calc.salarial.cmu) }}</td>
                </tr>
                <tr class="benin-total-row">
                  <td colspan="3">TOTAL COTISATIONS SOCIALES SALARIALES (B)</td>
                  <td class="montant">{{ fcfa(calc.salarial.cnps + (calc.salarial.inam || calc.salarial.cmu)) }} FCFA</td>
                </tr>
                <tr style="background: #f8fafc; font-weight: bold;">
                  <td colspan="3">REVENU APRÈS COTISATIONS SOCIALES (C = A – B)</td>
                  <td class="montant" style="color: #1e293b;">{{ fcfa(calc.revenuApresCotisations) }} FCFA</td>
                </tr>
              </tbody>
            </table>

            <!-- 3. IMPÔT SUR LE REVENU (IRPP) -->
            <table class="benin-table mt-4">
              <thead>
                <tr>
                  <th class="benin-col-label" colspan="3">IMPÔT SUR LE REVENU DES PERSONNES PHYSIQUES (IRPP)</th>
                  <th class="benin-col-montant">Montant (FCFA)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="label" colspan="3">Revenu après cotisations sociales (C)</td>
                  <td class="montant">{{ fcfa(calc.revenuApresCotisations) }}</td>
                </tr>
                <tr>
                  <td class="label" colspan="3">Moins : Abattement professionnel 28 % (plafonné)</td>
                  <td class="montant" style="color: #dc2626;">- {{ fcfa(calc.abattementMensuel) }}</td>
                </tr>
                <tr style="font-weight: 500; background: #f1f5f9;">
                  <td class="label" colspan="3">REVENU NET IMPOSABLE MENSUEL (D)</td>
                  <td class="montant">{{ fcfa(calc.revenuNetImposableMensuel) }} FCFA</td>
                </tr>
                <tr class="benin-total-row">
                  <td colspan="3">IRPP MENSUEL RETENU À LA SOURCE (E)</td>
                  <td class="montant">{{ fcfa(calc.salarial.irpp || calc.salarial.its) }} FCFA</td>
                </tr>
              </tbody>
            </table>

            <!-- 4. SYNTHÈSE DU NET -->
            <table class="benin-table mt-4" style="border-top: 2px solid #1e293b;">
              <tbody>
                <tr>
                  <td class="label" colspan="3" style="font-weight: 500;">Salaire brut (A)</td>
                  <td class="montant">{{ fcfa(calc.gainsTotaux) }} FCFA</td>
                </tr>
                <tr>
                  <td class="label" colspan="3" style="font-weight: 500;">Moins : Cotisations sociales salariales (B)</td>
                  <td class="montant">{{ fcfa(calc.salarial.cnps + (calc.salarial.inam || calc.salarial.cmu)) }} FCFA</td>
                </tr>
                <tr>
                  <td class="label" colspan="3" style="font-weight: 500;">Moins : IRPP mensuel (E)</td>
                  <td class="montant">{{ fcfa(calc.salarial.irpp || calc.salarial.its) }} FCFA</td>
                </tr>
                <tr v-if="calc.totalRetenuesDiverses > 0">
                  <td class="label" colspan="3" style="font-weight: 500;">Moins : Autres retenues (avances, prêts...) (F)</td>
                  <td class="montant">{{ fcfa(calc.totalRetenuesDiverses) }} FCFA</td>
                </tr>
                <tr class="benin-net-row">
                  <td colspan="3">NET À PAYER (A – B – E – F)</td>
                  <td class="montant">{{ fcfa(calc.netAPayer) }} FCFA</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Tableau de Paie Modèle Standard (CI, etc.) -->
          <div v-else class="table-wrapper">
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
                <tr>
                  <td class="code">454</td>
                  <td class="label">{{ countryRules.organismeRetraite }} - RETRAITE</td>
                  <td class="val">{{ fcfa(calc.baseCNPS) }}</td>
                  <td class="val">{{ (countryRules.tauxRetraiteSal * 100).toFixed(1) }}%</td>
                  <td></td>
                  <td class="retenue">{{ fcfa(calc.salarial.cnps) }}</td>
                  <td class="val">{{ (countryRules.tauxRetraitePat * 100).toFixed(1) }}%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.cnpsRetraite) }}</td>
                </tr>
                <tr>
                  <td class="code">470</td>
                  <td class="label">{{ countryRules.organismeSante }} - PRESTATIONS FAMILIALES</td>
                  <td class="val">{{ fcfa(calc.baseCNPS_PfAtAm) }}</td>
                  <td></td><td></td><td></td>
                  <td class="val">{{ (countryRules.tauxPFPat * 100).toFixed(1) }}%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.cnpsPF) }}</td>
                </tr>
                <tr>
                  <td class="code">472</td>
                  <td class="label">{{ countryRules.organismeRetraite.split(' ')[0] }} - ACCIDENT DU TRAVAIL</td>
                  <td class="val">{{ fcfa(calc.baseCNPS_PfAtAm) }}</td>
                  <td></td><td></td><td></td>
                  <td class="val">{{ emp.taux_at || 2 }}%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.cnpsAT) }}</td>
                </tr>
                <tr v-if="countryRules.code === 'CI'">
                  <td class="code">475</td>
                  <td class="label">{{ countryRules.organismeRetraite.split(' ')[0] }} - ASSURANCE MATERNITE</td>
                  <td class="val">{{ fcfa(calc.baseCNPS_PfAtAm) }}</td>
                  <td></td><td></td><td></td>
                  <td class="val">0.75%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.cnpsAM) }}</td>
                </tr>

                <!-- Fiscalité -->
                <template v-if="emp.regime !== 'ancien'">
                  <tr>
                    <td class="code">405</td>
                    <td class="label">{{ countryRules.libelleImpotSalarial }}</td>
                    <td class="val">{{ fcfa(calc.brutImposable) }}</td>
                    <td></td><td></td>
                    <td class="retenue">{{ fcfa((calc.salarial.its || 0) + (calc.salarial.ricf || 0)) }}</td>
                    <td></td><td></td>
                  </tr>
                  <tr v-if="calc.salarial.ricf > 0" class="sub-row">
                    <td class="code">406</td>
                    <td class="label">&nbsp;&nbsp;dont RED. FAMILIALE (RICF) [{{ calc.parts?.toFixed(2) }} parts]</td>
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
                
                <!-- Autres Taxes Salariales (ex: ORTB Bénin) -->
                <tr v-for="taxe in calc.salarial.autresTaxes" :key="taxe.code">
                  <td class="code">{{ taxe.code }}</td>
                  <td class="label">{{ taxe.label }}</td>
                  <td class="val">{{ taxe.base ? fcfa(taxe.base) : '' }}</td>
                  <td></td><td></td>
                  <td class="retenue">{{ fcfa(taxe.montant) }}</td>
                  <td></td><td></td>
                </tr>

                <!-- Fiscalité Patronale -->
                <tr>
                  <td class="code">600</td>
                  <td class="label">{{ countryRules.libelleImpotEmployeur }}</td>
                  <td class="val">{{ fcfa(calc.brutImposable) }}</td>
                  <td></td><td></td><td></td>
                  <td class="val">{{ (countryRules.tauxImpotEmployeurLocal * 100).toFixed(1) }}%</td>
                  <td class="retenue">{{ fcfa(calc.patronal.impotEmployeur) }}</td>
                </tr>
                <!-- Autres Taxes Patronales (ex: FDFP) -->
                <tr v-for="taxe in calc.patronal.autresTaxes" :key="taxe.code">
                  <td class="code">{{ taxe.code }}</td>
                  <td class="label">{{ taxe.label }}</td>
                  <td class="val">{{ taxe.base ? fcfa(taxe.base) : '' }}</td>
                  <td></td><td></td><td></td>
                  <td class="val">{{ taxe.taux ? (taxe.taux * 100).toFixed(1) + '%' : '' }}</td>
                  <td class="retenue">{{ fcfa(taxe.montant) }}</td>
                </tr>

                <!-- CMU -->
                <tr v-if="countryRules.hasCMU">
                  <td class="code">430</td>
                  <td class="label">{{ countryRules.organismeSante }} (ASSURANCE MALADIE) [{{ calc.totalPersonnesCMU }} pers.]</td>
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

          <!-- Zone Totaux et Net (Style Logipaie - Réservé aux autres pays) -->
          <div v-if="countryRules.code !== 'BJ'" class="logipaie-footer-grid mt-6">
            <div class="lp-cumuls-container">
              <div class="lp-cumuls-label">CUMULS</div>
              <div class="lp-cumuls-data">
                <div class="cumul-row"><span>Brut imposable</span> <span>{{ fcfa(calc.brutImposable) }}</span></div>
                <div class="cumul-row"><span>Nombre de jours</span> <span>{{ calc.joursTrav }}</span></div>
                <div class="cumul-row"><span>{{ countryRules.libelleImpotSalarial.split(' ')[0] }}</span> <span>{{ fcfa(calc.salarial.its) }}</span></div>
                <div class="cumul-row" v-if="countryRules.code === 'CI'"><span>RICF</span> <span>{{ fcfa(calc.salarial.ricf) }}</span></div>
                <div class="cumul-row"><span>{{ countryRules.organismeRetraite.split(' ')[0] }}</span> <span>{{ fcfa(calc.salarial.cnps) }}</span></div>
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
          
          <!-- Mode de paiement spécifique Bénin -->
          <div v-if="countryRules.code === 'BJ'" class="benin-payment-footer mt-4">
            <div><strong>MODE DE PAIEMENT :</strong> {{ emp.virement ? 'Virement bancaire' : 'Espèces' }}</div>
            <div v-if="emp.virement && emp.rib"><strong>Numéro de compte :</strong> {{ emp.rib }}</div>
            <div class="mt-2"><em>Arrêté le présent bulletin à la somme de : {{ fcfa(calc.netAPayer) }} francs CFA.</em></div>
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
          Comprendre le Bulletin {{ countryRules.adjectif.charAt(0).toUpperCase() + countryRules.adjectif.slice(1) }}
          <div class="edu-flag">
            <img :src="countryRules.flagUrl" :alt="countryRules.name" style="width: 24px; height: 16px; object-fit: cover; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" />
          </div>
        </h3>
        <p class="edu-intro">Quelques clés pour mieux décrypter vos rubriques de paie {{ countryRules.preposition }} {{ countryRules.name }}</p>
        
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

/* ══ Bouton Partager Simulation ══ */
.share-sim-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.85rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  color: #1d4ed8;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.share-sim-btn:hover {
  background: #dbeafe;
  border-color: #93c5fd;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(29, 78, 216, 0.15);
}
.share-toast {
  background: #065f46;
  color: white;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.65rem 1.25rem;
  border-radius: 12px;
  text-align: center;
  animation: slideDown 0.3s ease;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
/* STYLES SPECIFIQUES AU MODELE BENIN / TOGO (RESPONSIVE OPTIMISÉ) */
.payslip-benin {
  padding: 10px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.benin-section-title {
  text-align: center;
  font-weight: 700;
  font-size: 13px;
  background: #334155;
  color: white;
  padding: 6px 8px;
  margin-bottom: 8px;
  border-radius: 4px;
}
.benin-table {
  width: 100%;
  min-width: 480px; /* Empêche l'écrasement des colonnes sur mobile */
  border-collapse: collapse;
  font-size: 11px;
}
.benin-table th, .benin-table td {
  border: 1px solid #cbd5e1;
  padding: 6px 8px;
}
.benin-table thead th {
  background: #f1f5f9;
  color: #334155;
  font-weight: 700;
  text-align: left;
}
.benin-col-label { width: 45%; }
.benin-col-base { width: 18%; text-align: right; }
.benin-col-taux { width: 12%; text-align: center; }
.benin-col-montant { width: 25%; text-align: right; font-weight: 600; }
.benin-table td.label { color: #1e293b; font-weight: 500; }
.benin-table td.val { text-align: center; color: #475569; }
.benin-table td.montant { text-align: right; color: #0f172a; }
.benin-total-row td {
  background: #e2e8f0;
  font-weight: 700;
  color: #1e293b;
  text-align: left;
}
.benin-total-row td.montant {
  text-align: right;
  font-size: 12px;
}
.benin-net-row td {
  background: #1e293b;
  color: white;
  font-weight: 800;
  font-size: 13px;
}
.benin-net-row td.montant {
  text-align: right;
}
.benin-payment-footer {
  font-size: 11px;
  color: #1e293b;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
}

/* RESPONSIVE MOBILE FIXES FOR FORM & PREVIEW */
@media (max-width: 640px) {
  .field-group input,
  .field-group select {
    font-size: 16px !important; /* Empeche le zoom auto sur Safari/iOS */
    padding: 0.65rem 0.75rem !important;
  }
  
  .preview-container {
    padding: 10px !important;
    border-top-width: 4px !important;
  }

  .lph-row {
    font-size: 0.72rem;
    flex-wrap: wrap;
    gap: 4px;
  }

  .footer-signatures {
    flex-direction: column;
    gap: 30px;
    margin-top: 30px;
  }

  .sig-card {
    width: 100%;
  }

  .btn-generate {
    width: 100%;
    margin: 1rem 0;
    font-size: 1rem;
    padding: 1rem;
  }
}
</style>
