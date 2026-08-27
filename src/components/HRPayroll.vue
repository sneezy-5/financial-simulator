<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import PayslipSimulator from './PayslipSimulator.vue'
import SoldeCompteSimulator from './SoldeCompteSimulator.vue'
import LocalDatabasePanel from './LocalDatabasePanel.vue'
import EmployeeDirectory from './EmployeeDirectory.vue'
import SettingsPanel from './SettingsPanel.vue'
import DocumentsGenerator from './hr/DocumentsGenerator.vue'
import CongesManager from './hr/CongesManager.vue'
import ContratsManager from './hr/ContratsManager.vue'
import EvaluationsManager from './hr/EvaluationsManager.vue'
import FormationsManager from './hr/FormationsManager.vue'
import PlanningManager from './hr/PlanningManager.vue'
import DashboardManager from './hr/DashboardManager.vue'
import EmployeeSelect from './hr/EmployeeSelect.vue'
import { getCountryRules } from '../services/countryConfig.js'
import { localDb } from '../services/localDatabase.js'
import { showToast } from '../services/toast.js'
import { user, fetchMe } from '../services/auth.js'
import { loadPdfJs, prepareTemplateSource, requestTemplateReconstruction, wrapPreviewHtml } from '../services/templateExtractor.js'
import { buildPayrollBatch, employeeLabel } from '../services/payrollInput.js'

onMounted(() => {
  loadPdfJs().catch(e => console.warn('pdf.js indisponible:', e.message))
  fetchPayrollPeriods()
  if (user.value?.defaultBulletinStyle) builtinStyle.value = user.value.defaultBulletinStyle
})

const props = defineProps({
  country: {
    type: String,
    default: 'CI'
  },
  initialModule: {
    type: String,
    default: null
  },
  initialType: {
    type: String,
    default: null
  },
  activeModule: {
    type: String,
    default: null
  },
  activeType: {
    type: String,
    default: null
  }
})

const emit = defineEmits([
  'change-country', 
  'update:active-module', 
  'update:active-type',
  'require-auth',
  'require-billing'
])

const countryRules = computed(() => getCountryRules(props.country))

const isElectron = /electron/i.test(navigator.userAgent);
const isPro = computed(() => !!user.value || isElectron)
const isSimulatorMode = import.meta.env.VITE_APP_MODE === 'simulator'
const PRO_MODULES = ['simulation', 'simulation_habituel', 'simulation_conges', 'solde', 'import', 'local_db', 'directory', 'settings', 'saisie', 'stats', 'analytics_entreprise', 'conges', 'contrats', 'evaluations', 'formations', 'planning', 'dashboard', 'documents']
// En build simulateur, seuls ces modules restent joignables — peu importe la
// connexion (isPro) ou une manipulation d'URL/props (?type=import, etc.) : le
// reste du RH Pro (annuaire, import, dashboard, paramètres...) reste verrouillé.
const SIMULATOR_ALLOWED_MODULES = ['simulation', 'simulation_habituel', 'simulation_conges', 'solde']
const canOpenModule = (modId) => {
  if (isSimulatorMode) return SIMULATOR_ALLOWED_MODULES.includes(modId)
  return !PRO_MODULES.includes(modId) || isPro.value
}
// Pour l'affichage (badge 🔒, style verrouillé) : en simulateur, seuls les
// modules hors liste blanche sont "verrouillés" — bulletin/congés/solde ne
// doivent pas paraître bloqués alors qu'ils sont utilisables sans connexion.
const isModuleLocked = (modId) => !canOpenModule(modId)
const enterpriseUrl = import.meta.env.VITE_ENTERPRISE_URL || 'http://localhost:5174/'
// Vente de licences entreprise mise en pause pour le moment (réactivable en repassant à true)
const ENTERPRISE_SALES_ENABLED = false

// ═══ SIMULATION - Type Bulletin ═══
// null = choix du type | 'habituel' | 'conges'
const simulationType = ref('habituel')

// ═══ NAVIGATION ═══
// null = bureau | 'import' | 'simulation' | 'solde' | etc.
const activeModule = ref(null)
const hrWrapperRef = ref(null)

const setModuleSafe = (modVal, typeVal = null) => {
  let targetMod = modVal
  let targetType = typeVal

  if (!canOpenModule(modVal)) {
    targetMod = null
    targetType = null
  } else if (targetMod === 'simulation_habituel') {
    targetMod = 'simulation'
    targetType = 'habituel'
  } else if (targetMod === 'simulation_conges') {
    targetMod = 'simulation'
    targetType = 'conges'
  }

  activeModule.value = targetMod
  if (targetMod === 'simulation') {
    simulationType.value = targetType || 'habituel'
  }
}

// Initial set
setModuleSafe(props.initialModule, props.initialType)

const isStartMenuOpen = ref(false)
const toggleStartMenu = () => {
  isStartMenuOpen.value = !isStartMenuOpen.value
}

const openModule = (modId) => {
  if (!canOpenModule(modId)) {
    if (isSimulatorMode) {
      showToast("Cette fonctionnalité est réservée à la version ONDA RH Pro.", "error")
    } else {
      showToast("Cette fonctionnalité est réservée aux abonnés ONDA RH Pro. Veuillez vous connecter.", "error")
      emit('require-auth')
    }
    isStartMenuOpen.value = false
    return
  }

  if (modId === 'simulation_habituel') {
    activeModule.value = 'simulation'
    simulationType.value = 'habituel'
  } else if (modId === 'simulation_conges') {
    activeModule.value = 'simulation'
    simulationType.value = 'conges'
  } else {
    activeModule.value = modId
  }
  if (modId === 'saisie') {
    loadSaisieGrid()
  }
  if (modId === 'stats') {
    loadStatsEmployeeList()
  }
  if (modId === 'analytics_entreprise') {
    fetchCompanyAnalytics()
  }
  isStartMenuOpen.value = false
}

// Sync local state with parent props
watch(() => props.activeModule, (newVal) => {
  setModuleSafe(newVal, props.activeType)
})
watch(() => props.activeType, (newVal) => {
  simulationType.value = newVal
})

// Sync parent state with local updates
watch(activeModule, (newVal) => {
  emit('update:active-module', newVal)
})
watch(simulationType, (newVal) => {
  emit('update:active-type', newVal)
})

const goToSimulation = (type) => {
  simulationType.value = type
  setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, 50)
}

// ═══ IMPORT EXCEL ═══
const file = ref(null)
const templateFile = ref(null)
const uploading = ref(false)
const result = ref(null)
const error = ref(null)
const dragOver = ref(false)
const useLocalDb = ref(false)
const localEmployees = ref([])
// Salariés dont la rémunération n'est pas définie : leur bulletin sortirait à
// zéro. On préfère l'annoncer avant la génération plutôt que sur le PDF.
const payrollWarnings = ref({ sansContrat: [], sansRemuneration: [] })

// --- CUSTOM TEMPLATE ---
const pdfCanvas = ref(null)
const htmlTemplate = ref(null)
const draggedVar = ref(null)
// Image haute résolution + couche texte du modèle uploadé (cf. templateExtractor)
const templateSource = ref(null)
// Voie réellement employée par le serveur : 'deterministic' (géométrie exacte
// lue dans le PDF) ou 'ai-vision' (repli pour les documents scannés).
const lastEngine = ref(null)
const detectedVariables = ref([])
// Champs repérés dans le document mais qu'aucune donnée du système ne remplit
// encore : ils resteront vides sur le bulletin tant qu'ils ne sont pas rattachés.
const unmappedFields = ref([])
// Rapport de conformité : le modèle compare le gabarit produit au document
// d'origine et signale les écarts. Il constate, il ne corrige jamais.
const conformity = ref(null)
// Version du moteur d'analyse en vigueur. Un modèle enregistré avec une version
// antérieure conserve les défauts corrigés depuis : il doit être réanalysé.
const CURRENT_ENGINE_VERSION = 5
const staleTemplate = ref(null)
// La préparation est asynchrone : sans ce drapeau, un clic rapide envoyait
// une image vierge à l'IA.
const pdfReady = ref(false)
// Nombre de passes de correction demandées à l'IA (rendu → comparaison → correctif)
const aiRefinePasses = ref(1)
// Style du modèle ONDA intégré (sans rapport avec un modèle PDF/Word importé) :
// 'classique' (tableau Base/Taux) ou 'grille' (rubriques numérotées 010, 020…).
const builtinStyle = ref('classique')

const handleFileUpload = (event) => {
  file.value = event.target.files[0]
  error.value = null
  result.value = null
}

const handleTemplateUpload = (e) => {
  const file = e.target.files[0]
  if (file) {
    templateFile.value = file
    htmlTemplate.value = null
    templateSource.value = null
    pdfReady.value = false
    lastEngine.value = null
    detectedVariables.value = []
    unmappedFields.value = []
    conformity.value = null
    aiMappingSuccess.value = false
    
    // Le service accepte aussi les scans JPG/PNG (sans couche texte, l'IA
    // repasse alors en lecture d'image).
    nextTick(() => renderPdfCanvas(file))
  }
}

const renderPdfCanvas = async (file) => {
  try {
    const source = await prepareTemplateSource(file, pdfCanvas.value)
    templateSource.value = source
    pdfReady.value = true
  } catch (e) {
    console.error('Lecture du PDF modèle impossible:', e)
    showToast(e.message || "Ce PDF n'a pas pu être lu.", 'error')
  }
}

const onDragStartVar = (event, varName) => {
  draggedVar.value = varName
  event.dataTransfer.effectAllowed = 'copy'
}

const onDropVar = (event) => {
  if (!draggedVar.value) return
  
  // Le conteneur parent du canvas
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  const xPercent = x / rect.width
  const yPercent = y / rect.height
  
  pdfMapping.value[draggedVar.value] = { 
    xPercent, 
    yPercent,
    label: draggedVar.value,
    x, y // For local display
  }
  draggedVar.value = null
}

const removeMappedVar = (varName) => {
  delete pdfMapping.value[varName]
}

const aiMappingLoading = ref(false)
const aiMappingSuccess = ref(false)

const wrappedHtmlTemplate = computed(() => wrapPreviewHtml(htmlTemplate.value))

const autoMapPdf = async () => {
  if (!pdfReady.value || !templateSource.value) {
    showToast('Le modèle est encore en cours de lecture, patientez un instant.', 'error')
    return
  }

  aiMappingLoading.value = true
  aiMappingSuccess.value = false

  try {
    const result = await requestTemplateReconstruction(
      templateSource.value,
      'payslip',
      aiRefinePasses.value
    )
    htmlTemplate.value = result.htmlTemplate
    lastEngine.value = result.engine
    detectedVariables.value = result.variables || []
    unmappedFields.value = result.unmapped || []
    conformity.value = result.conformity || null
    aiMappingSuccess.value = true
  } catch (e) {
    console.error(e)
    showToast(e.message || "Erreur de connexion au serveur d'IA.", 'error')
  } finally {
    aiMappingLoading.value = false
  }
}

const onDrop = (e) => {
  dragOver.value = false
  const f = e.dataTransfer.files[0]
  if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
    file.value = f
  }
}

const fileHeaders = ref([])
const columnMapping = ref({})
const payrollMois = ref(new Date().getMonth() + 1)
const payrollAnnee = ref(new Date().getFullYear())
const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const payrollPeriods = ref([])
const payrollPeriodsLoading = ref(false)

const fetchPayrollPeriods = async () => {
  const token = localStorage.getItem('auth_token')
  if (!token) return
  try {
    payrollPeriodsLoading.value = true
    const res = await fetch('/api/rh/periods', { headers: { 'Authorization': `Bearer ${token}` } })
    const data = await res.json()
    if (data.success) payrollPeriods.value = data.periods || []
  } catch (e) {
    console.warn('Erreur chargement des périodes de paie:', e)
  } finally {
    payrollPeriodsLoading.value = false
  }
}

const sheetNames = ref([])
const selectedSheet = ref(null)
const showSheetPicker = ref(false)
const aiMappingUsed = ref(false)
const aiMappingLoadingCols = ref(false)

const standardFields = [
  { key: 'nom', label: 'Nom Complet', required: true, keywords: ['nom', 'name', 'salarie', 'salarié'] },
  { key: 'prenom', label: 'Prénom', required: false, keywords: ['prenom', 'prénom', 'first'] },
  { key: 'matricule', label: 'Matricule', required: false, keywords: ['matricule', 'id', 'numéro'] },
  { key: 'salaire_base', label: 'Salaire de Base', required: true, keywords: ['salaire', 'base', 'brut', 'mensuel'] },
  { key: 'prime_transport', label: 'Prime de Transport', required: false, keywords: ['transport', 'deplacement'] },
  { key: 'prime_logement', label: 'Prime de Logement', required: false, keywords: ['logement', 'loyer'] },
  { key: 'heures_sup_nb', label: 'Heures Supplémentaires (Nb)', required: false, keywords: ['heure', 'sup', 'hs'] },
  { key: 'jours_travailles', label: 'Jours Travaillés', required: false, keywords: ['jour', 'travaille', 'presence'] },
  { key: 'absences_jours', label: 'Jours d\'Absence', required: false, keywords: ['absence', 'absent'] }
]

const autoMapHeaders = () => {
  columnMapping.value = {}
  const usedHeaders = new Set()
  
  standardFields.forEach(field => {
    const match = fileHeaders.value.find(h => {
      if (usedHeaders.has(h)) return false
      const hLow = h.toLowerCase()
      return field.keywords.some(kw => hLow.includes(kw))
    })
    
    if (match) {
      columnMapping.value[field.key] = match
      usedHeaders.add(match)
    }
  })
}

// Nombre de champs auto-détectés
const autoMappedCount = computed(() => {
  return Object.values(columnMapping.value).filter(v => v && v !== '').length
})

// Vérifie si tous les champs requis sont mappés
const requiredFieldsMapped = computed(() => {
  return standardFields
    .filter(f => f.required)
    .every(f => columnMapping.value[f.key] && columnMapping.value[f.key] !== '')
})

// Détecte si le fichier est probablement un mauvais fichier
const isLikelyWrongFile = computed(() => {
  return fileHeaders.value.length > 0 && autoMappedCount.value === 0
})

// Copy variable to clipboard
const copiedVar = ref(null)
const copyVar = (varName) => {
  navigator.clipboard.writeText(varName).catch(() => {})
  copiedVar.value = varName
  setTimeout(() => { copiedVar.value = null }, 2000)
}

const analyzeFileHeaders = async (sheetOverride = null) => {
  if (!file.value) return
  uploading.value = true
  error.value = null
  const formData = new FormData()
  formData.append('file', file.value)
  if (sheetOverride) formData.append('sheetName', sheetOverride)
  try {
    const token = localStorage.getItem('auth_token')
    const res = await fetch('/api/rh/extract-headers', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error)
    fileHeaders.value = data.headers
    sheetNames.value = data.sheetNames || []
    selectedSheet.value = data.selectedSheet

    // Fichier multi-feuilles sans nom standard et sans choix explicite : on demande à l'utilisateur
    if (sheetNames.value.length > 1 && !sheetOverride) {
      showSheetPicker.value = true
      uploading.value = false
      return
    }

    showSheetPicker.value = false
    autoMapHeaders()
    runSmartMapping() // améliore le mapping en arrière-plan, ne bloque pas l'étape suivante
    importStep.value = 2 // Move to mapping step
  } catch(e) {
    error.value = e.message
  } finally {
    uploading.value = false
  }
}

const chooseSheet = (name) => {
  analyzeFileHeaders(name)
}

// Complète/améliore le mapping par mots-clés avec des suggestions IA (silencieux en cas d'échec)
const runSmartMapping = async () => {
  aiMappingUsed.value = false
  aiMappingLoadingCols.value = true
  try {
    const token = localStorage.getItem('auth_token')
    if (!token) return
    const res = await fetch('/api/rh/smart-mapping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        headers: fileHeaders.value,
        fields: standardFields.map(f => ({ key: f.key, label: f.label }))
      })
    })
    const data = await res.json()
    if (data.success && data.mapping && Object.keys(data.mapping).length > 0) {
      columnMapping.value = { ...columnMapping.value, ...data.mapping }
      aiMappingUsed.value = true
    }
  } catch (e) {
    console.warn('Mapping IA indisponible, mapping par mots-clés conservé.', e)
  } finally {
    aiMappingLoadingCols.value = false
  }
}

const useLocalDirectory = async () => {
  if (!isPro.value) {
    showToast("L'annuaire local est réservé aux abonnés ONDA RH Pro.", 'error')
    return
  }
  const emps = await localDb.getEmployees()
  if (emps.length === 0) {
    showToast('Votre annuaire est vide.', 'error')
    return
  }
  
  // Fetch default template
  const templates = await localDb.getTemplates()
  const defTpl = templates.find(t => t.isDefault && (!t.type || t.type === 'payslip'))
  if (defTpl && defTpl.htmlTemplate) {
    htmlTemplate.value = defTpl.htmlTemplate
    staleTemplate.value = (defTpl.engineVersion || 0) < CURRENT_ENGINE_VERSION ? defTpl : null
  } else {
    htmlTemplate.value = null
    staleTemplate.value = null
  }
  
  // Le contrat est la source de vérité de la rémunération ; la fiche employé ne
  // porte que l'identité et la situation personnelle. Sans cette fusion, aucun
  // montant n'atteignait le moteur de calcul.
  const batch = buildPayrollBatch(emps, {}, { mois: payrollMois.value, annee: payrollAnnee.value })
  localEmployees.value = batch.employees
  payrollWarnings.value = { sansContrat: batch.sansContrat, sansRemuneration: batch.sansRemuneration }
  useLocalDb.value = true
  file.value = { name: `Annuaire Local (${emps.length} employés)` }
  goToImportStep(4)
}

// ═══ SAISIE MENSUELLE (heures supp / absences) ═══
// Note : on ne demande que les jours d'absence, jamais un "nombre de jours travaillés" en plus —
// le moteur de calcul dérive automatiquement les jours travaillés à partir de la base légale (26)
// moins les absences. Demander les deux aurait un risque de double comptage si l'utilisateur les
// renseigne de façon incohérente entre elles.
const saisieEmployees = ref([])
const saisieGrid = ref({})
const saisieLoading = ref(false)
const saisieSearchQuery = ref('')

const saisieFilteredEmployees = computed(() => {
  if (!saisieSearchQuery.value) return saisieEmployees.value
  const q = saisieSearchQuery.value.toLowerCase()
  return saisieEmployees.value.filter(e => 
    (e.nom || '').toLowerCase().includes(q) || 
    (e.prenom || '').toLowerCase().includes(q) || 
    (e.matricule || '').toLowerCase().includes(q)
  )
})

const loadSaisieGrid = async () => {
  saisieLoading.value = true
  try {
    const emps = await localDb.getEmployees()
    saisieEmployees.value = emps
    const grid = {}
    emps.forEach(emp => {
      grid[emp.id] = { heures_sup_nb: 0, heures_sup_nuit: 0, heures_sup_ferie_jour: 0, heures_sup_ferie_nuit: 0, absences_jours: 0 }
    })
    saisieGrid.value = grid
  } finally {
    saisieLoading.value = false
  }
}

// Affichage en lecture seule du nombre de jours travaillés réellement retenu pour le calcul —
// soit la valeur explicite importée depuis une fiche de présence, soit la base légale (26)
// moins les absences saisies. Permet au RH de vérifier visuellement avant de générer.
const saisieJoursTravailles = (empId) => {
  const g = saisieGrid.value[empId]
  if (!g) return 26
  if (g.jours_travailles !== undefined) return g.jours_travailles
  return Math.max(0, 26 - (g.absences_jours || 0))
}

// Édition manuelle du champ : un champ vide repasse en mode "calculé automatiquement"
// (redevient dérivé des absences) ; une valeur saisie devient une valeur explicite qui
// prime sur les absences pour ce salarié (cohérent avec la logique du moteur de calcul).
const setSaisieJoursTravailles = (empId, rawValue) => {
  const g = saisieGrid.value[empId]
  if (!g) return
  if (rawValue === '') {
    delete g.jours_travailles
  } else {
    g.jours_travailles = Number(rawValue)
  }
}

// Import d'une fiche de présence légère (matricule + jours_travailles/heures_sup_nb/absences_jours)
// pour compléter/écraser la grille sans avoir à ressaisir toute la fiche employé.
const presenceImporting = ref(false)

const importPresenceFile = async (event) => {
  const file = event.target.files[0]
  event.target.value = '' // permet de réimporter le même fichier si besoin
  if (!file) return

  presenceImporting.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const token = localStorage.getItem('auth_token')
    const res = await fetch('/api/rh/extract-data', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || "Erreur de lecture du fichier")

    const byMatricule = {}
    saisieEmployees.value.forEach(emp => {
      if (emp.matricule) byMatricule[String(emp.matricule).trim()] = emp.id
    })

    let matched = 0
    let unmatched = 0
    data.data.forEach(row => {
      const mat = String(row.matricule || '').trim()
      const empId = byMatricule[mat]
      if (!empId) {
        if (mat) unmatched++
        return
      }
      const current = saisieGrid.value[empId] || { heures_sup_nb: 0, heures_sup_nuit: 0, heures_sup_ferie_jour: 0, heures_sup_ferie_nuit: 0, absences_jours: 0 }
      const reprendre = (champ) => row[champ] !== undefined && row[champ] !== '' ? parseFloat(row[champ]) : current[champ]
      saisieGrid.value[empId] = {
        heures_sup_nb: reprendre('heures_sup_nb'),
        heures_sup_nuit: reprendre('heures_sup_nuit'),
        heures_sup_ferie_jour: reprendre('heures_sup_ferie_jour'),
        heures_sup_ferie_nuit: reprendre('heures_sup_ferie_nuit'),
        absences_jours: reprendre('absences_jours'),
        ...(row.jours_travailles !== undefined && row.jours_travailles !== '' ? { jours_travailles: parseFloat(row.jours_travailles) } : {})
      }
      matched++
    })

    if (matched > 0) showToast(`${matched} employé(s) mis à jour depuis la fiche de présence.`, 'success')
    if (unmatched > 0) showToast(`${unmatched} matricule(s) du fichier non trouvé(s) dans l'annuaire, ignoré(s).`, 'error')
    if (matched === 0 && unmatched === 0) showToast("Aucune ligne exploitable dans le fichier.", 'error')
  } catch (e) {
    showToast('Erreur import : ' + e.message, 'error')
  } finally {
    presenceImporting.value = false
  }
}

const generateFromSaisie = async () => {
  if (saisieEmployees.value.length === 0) {
    showToast('Votre annuaire est vide.', 'error')
    return
  }

  const templates = await localDb.getTemplates()
  const defTpl = templates.find(t => t.isDefault && (!t.type || t.type === 'payslip'))
  htmlTemplate.value = (defTpl && defTpl.htmlTemplate) ? defTpl.htmlTemplate : null

  const batchSaisie = buildPayrollBatch(
    saisieEmployees.value,
    saisieGrid.value,
    { mois: payrollMois.value, annee: payrollAnnee.value }
  )
  localEmployees.value = batchSaisie.employees
  payrollWarnings.value = { sansContrat: batchSaisie.sansContrat, sansRemuneration: batchSaisie.sansRemuneration }
  useLocalDb.value = true
  file.value = { name: `Saisie Mensuelle (${saisieEmployees.value.length} employés)` }

  await processPayroll()
}

const fcfa = (v) => Math.round(v || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'

// ═══ STATISTIQUES EMPLOYÉ (dashboard absences / heures supp / rémunération) ═══
const statsEmployeesList = ref([])
const statsSelectedMatricule = ref('')
const statsSearchQuery = ref('')
// Plage de période (mois/année début → fin), par défaut l'année civile en cours
const statsDebutMois = ref(1)
const statsDebutAnnee = ref(new Date().getFullYear())
const statsFinMois = ref(12)
const statsFinAnnee = ref(new Date().getFullYear())
const statsData = ref(null)
const statsLoading = ref(false)

const statsFilteredEmployees = computed(() => {
  if (!statsSearchQuery.value) return statsEmployeesList.value
  const q = statsSearchQuery.value.toLowerCase()
  return statsEmployeesList.value.filter(e =>
    (e.nom || '').toLowerCase().includes(q) ||
    (e.prenom || '').toLowerCase().includes(q) ||
    (e.matricule || '').toLowerCase().includes(q)
  )
})

const loadStatsEmployeeList = async () => {
  const emps = await localDb.getEmployees()
  statsEmployeesList.value = emps.filter(e => e.matricule)
  if (statsEmployeesList.value.length > 0 && !statsSelectedMatricule.value) {
    statsSelectedMatricule.value = statsEmployeesList.value[0].matricule
  }
  if (statsSelectedMatricule.value) {
    fetchEmployeeStats()
  }
}

const fetchEmployeeStats = async () => {
  if (!statsSelectedMatricule.value) {
    statsData.value = null
    return
  }
  const token = localStorage.getItem('auth_token')
  if (!token) return
  statsLoading.value = true
  try {
    const params = `debutMois=${statsDebutMois.value}&debutAnnee=${statsDebutAnnee.value}&finMois=${statsFinMois.value}&finAnnee=${statsFinAnnee.value}`
    const res = await fetch(`/api/rh/employees/${encodeURIComponent(statsSelectedMatricule.value)}/stats?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.success) statsData.value = data
  } catch (e) {
    console.warn('Erreur chargement des statistiques employé:', e)
  } finally {
    statsLoading.value = false
  }
}

// Formulaires courts fr-FR pour l'axe des mois
const moisCourts = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

// Catégories d'axe dynamiques (peut couvrir plusieurs années) : une entrée par période réellement
// présente dans la réponse, plutôt qu'une grille fixe de 12 mois Jan-Déc.
const statsPeriodLabels = computed(() => statsData.value
  ? statsData.value.monthly.map(m => `${moisCourts[m.mois - 1]} ${m.annee}`)
  : [])

const statsAbsencesSeries = computed(() => [{
  name: "Jours d'absence",
  data: statsData.value ? statsData.value.monthly.map(m => m.absencesJours) : []
}])

const statsHeuresSupSeries = computed(() => [{
  name: 'Heures supplémentaires',
  data: statsData.value ? statsData.value.monthly.map(m => m.heuresSupNb) : []
}])

const statsChartOptionsBase = computed(() => ({
  chart: { toolbar: { show: false }, fontFamily: 'inherit', foreColor: '#52514e' },
  plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
  dataLabels: { enabled: false },
  grid: { borderColor: '#e1e0d9', strokeDashArray: 3 },
  xaxis: { categories: statsPeriodLabels.value, axisBorder: { color: '#c3c2b7' }, axisTicks: { color: '#c3c2b7' } },
  yaxis: { labels: { formatter: (v) => Math.round(v) } },
  tooltip: { theme: 'light' }
}))

const statsAbsencesOptions = computed(() => ({
  ...statsChartOptionsBase.value,
  colors: ['#eb6834']
}))

const statsHeuresSupOptions = computed(() => ({
  ...statsChartOptionsBase.value,
  colors: ['#2a78d6']
}))

watch(statsSelectedMatricule, () => fetchEmployeeStats())
watch([statsDebutMois, statsDebutAnnee, statsFinMois, statsFinAnnee], () => fetchEmployeeStats())

// Si la recherche exclut l'employé sélectionné, bascule automatiquement sur le premier résultat
watch(statsSearchQuery, () => {
  const stillMatches = statsFilteredEmployees.value.some(e => e.matricule === statsSelectedMatricule.value)
  if (!stillMatches) {
    statsSelectedMatricule.value = statsFilteredEmployees.value[0]?.matricule || ''
  }
})

// ═══ ANALYTIQUE RH ENTREPRISE (masse salariale, charges patronales, absentéisme, heures sup) ═══
// Plage de période (mois/année début → fin), par défaut l'année civile en cours
const companyDebutMois = ref(1)
const companyDebutAnnee = ref(new Date().getFullYear())
const companyFinMois = ref(12)
const companyFinAnnee = ref(new Date().getFullYear())
const companyAnalyticsData = ref(null)
const companyAnalyticsLoading = ref(false)
const bradfordSearchQuery = ref('')

// Seuils SLA ajustables à l'affichage (non persistés) — servent à colorer les KPI et à tracer
// les lignes de seuil sur les graphiques.
const slaAbsenteisme = ref(5) // % de jours d'absence sur jours attendus
const slaHeuresSupRatio = ref(10) // % du coût des heures sup sur la masse salariale brute
const slaBradford = ref(500) // score Bradford à partir duquel un cas est signalé à surveiller

const fetchCompanyAnalytics = async () => {
  const token = localStorage.getItem('auth_token')
  if (!token) return
  companyAnalyticsLoading.value = true
  try {
    const params = `debutMois=${companyDebutMois.value}&debutAnnee=${companyDebutAnnee.value}&finMois=${companyFinMois.value}&finAnnee=${companyFinAnnee.value}`
    const res = await fetch(`/api/rh/analytics/company?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.success) companyAnalyticsData.value = data
  } catch (e) {
    console.warn("Erreur chargement de l'analytique RH entreprise:", e)
  } finally {
    companyAnalyticsLoading.value = false
  }
}

watch([companyDebutMois, companyDebutAnnee, companyFinMois, companyFinAnnee], () => fetchCompanyAnalytics())

// Catégories d'axe dynamiques (peut couvrir plusieurs années)
const companyPeriodLabels = computed(() => companyAnalyticsData.value
  ? companyAnalyticsData.value.monthly.map(m => `${moisCourts[m.mois - 1]} ${m.annee}`)
  : [])

const companyCoutTotalEmployeur = computed(() => companyAnalyticsData.value
  ? companyAnalyticsData.value.totals.masseSalarialeAnnuelle + companyAnalyticsData.value.totals.chargesPatronalesAnnuelles
  : 0)

const companyHeuresSupRatioAnnuel = computed(() => {
  if (!companyAnalyticsData.value || !companyAnalyticsData.value.totals.masseSalarialeAnnuelle) return 0
  return Math.round((companyAnalyticsData.value.totals.coutHeuresSupAnnuel / companyAnalyticsData.value.totals.masseSalarialeAnnuelle) * 1000) / 10
})

const companyAbsenteismeAlert = computed(() => !!companyAnalyticsData.value && companyAnalyticsData.value.totals.tauxAbsenteismeMoyen > slaAbsenteisme.value)
const companyHeuresSupAlert = computed(() => companyHeuresSupRatioAnnuel.value > slaHeuresSupRatio.value)

const companyMasseSalarialeSeries = computed(() => [
  { name: 'Brut', data: companyAnalyticsData.value ? companyAnalyticsData.value.monthly.map(m => m.masseSalarialeBrute) : [] },
  { name: 'Net', data: companyAnalyticsData.value ? companyAnalyticsData.value.monthly.map(m => m.masseSalarialeNette) : [] }
])

const companyChartOptionsBase = computed(() => ({
  chart: { toolbar: { show: false }, fontFamily: 'inherit', foreColor: '#52514e' },
  plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
  dataLabels: { enabled: false },
  grid: { borderColor: '#e1e0d9', strokeDashArray: 3 },
  xaxis: { categories: companyPeriodLabels.value, axisBorder: { color: '#c3c2b7' }, axisTicks: { color: '#c3c2b7' } },
  yaxis: { labels: { formatter: (v) => Math.round(v) } },
  tooltip: { theme: 'light' }
}))

const companyMasseSalarialeOptions = computed(() => ({
  ...companyChartOptionsBase.value,
  colors: ['#2a78d6', '#eb6834'],
  yaxis: { labels: { formatter: (v) => Math.round(v / 1000) + 'k' } }
}))

const companyAbsenteismeSeries = computed(() => [{
  name: "Taux d'absentéisme (%)",
  data: companyAnalyticsData.value ? companyAnalyticsData.value.monthly.map(m => m.tauxAbsenteisme) : []
}])

const companyAbsenteismeOptions = computed(() => ({
  ...companyChartOptionsBase.value,
  colors: ['#eb6834'],
  yaxis: { labels: { formatter: (v) => Math.round(v) + '%' } },
  annotations: {
    yaxis: [{
      y: slaAbsenteisme.value,
      borderColor: '#dc2626',
      strokeDashArray: 4,
      label: { text: `SLA ${slaAbsenteisme.value}%`, style: { color: '#fff', background: '#dc2626', fontSize: '0.65rem' }, position: 'left' }
    }]
  }
}))

const companyHeuresSupSeries = computed(() => [{
  name: 'Heures sup (% masse brute)',
  data: companyAnalyticsData.value
    ? companyAnalyticsData.value.monthly.map(m => m.masseSalarialeBrute > 0 ? Math.round((m.montantHeuresSup / m.masseSalarialeBrute) * 1000) / 10 : 0)
    : []
}])

const companyHeuresSupOptions = computed(() => ({
  ...companyChartOptionsBase.value,
  colors: ['#2a78d6'],
  yaxis: { labels: { formatter: (v) => Math.round(v * 10) / 10 + '%' } },
  annotations: {
    yaxis: [{
      y: slaHeuresSupRatio.value,
      borderColor: '#dc2626',
      strokeDashArray: 4,
      label: { text: `SLA ${slaHeuresSupRatio.value}%`, style: { color: '#fff', background: '#dc2626', fontSize: '0.65rem' }, position: 'left' }
    }]
  }
}))

// Répartition par poste : top 8 + "Autres" si plus de postes que ça (évite un graphique illisible)
const companyByPosteDisplay = computed(() => {
  if (!companyAnalyticsData.value) return []
  const list = companyAnalyticsData.value.byPoste
  if (list.length <= 8) return list
  const top = list.slice(0, 8)
  const autres = list.slice(8)
  const autresTotal = autres.reduce((sum, p) => sum + p.masseSalariale, 0)
  const autresEffectif = autres.reduce((sum, p) => sum + p.effectif, 0)
  return [...top, { poste: 'Autres', masseSalariale: autresTotal, effectif: autresEffectif, salaireMoyen: 0, salaireMin: 0, salaireMax: 0 }]
})

const companyByPosteSeries = computed(() => [{ name: 'Masse salariale', data: companyByPosteDisplay.value.map(p => p.masseSalariale) }])

const companyByPosteOptions = computed(() => ({
  chart: { toolbar: { show: false }, fontFamily: 'inherit', foreColor: '#52514e' },
  plotOptions: { bar: { borderRadius: 4, horizontal: true } },
  dataLabels: { enabled: false },
  grid: { borderColor: '#e1e0d9', strokeDashArray: 3 },
  xaxis: { categories: companyByPosteDisplay.value.map(p => p.poste), labels: { formatter: (v) => Math.round(v / 1000) + 'k' } },
  colors: ['#2a78d6'],
  tooltip: { theme: 'light' }
}))

const bradfordFilteredEmployees = computed(() => {
  if (!companyAnalyticsData.value) return []
  const list = companyAnalyticsData.value.employees
  if (!bradfordSearchQuery.value) return list
  const q = bradfordSearchQuery.value.toLowerCase()
  return list.filter(e =>
    (e.nom || '').toLowerCase().includes(q) ||
    (e.prenom || '').toLowerCase().includes(q) ||
    (e.matricule || '').toLowerCase().includes(q)
  )
})

const processPayroll = async () => {
  if (!isPro.value) {
    showToast("Le traitement de paie en masse est réservé aux abonnés ONDA RH Pro.", 'error')
    return
  }
  const token = localStorage.getItem('auth_token')
  if (!token) {
    showToast("Vous devez être connecté pour générer des bulletins de paie.", 'error')
    emit('require-auth')
    return
  }
  if (!file.value && !useLocalDb.value) return
  uploading.value = true
  error.value = null
  result.value = null
  const formData = new FormData()
  if (useLocalDb.value) {
    formData.append('employeesData', JSON.stringify(localEmployees.value))
  } else {
    formData.append('file', file.value)
    formData.append('mapping', JSON.stringify(columnMapping.value))
    if (selectedSheet.value) formData.append('sheetName', selectedSheet.value)
  }
  
  if (templateFile.value) {
    formData.append('template', templateFile.value)
  }
  
  if (htmlTemplate.value) {
    formData.append('htmlTemplate', htmlTemplate.value)
  } else {
    // Si c'est un modèle de la db locale qui est DOCX, on envoie son base64
    const templates = await localDb.getTemplates()
    const defTpl = templates.find(t => t.isDefault && (!t.type || t.type === 'payslip'))
    if (defTpl && defTpl.isDocx && defTpl.fileBase64) {
      formData.append('docxTemplateBase64', defTpl.fileBase64)
    }
    // Le style ne s'applique qu'au modèle ONDA intégré, jamais à un modèle
    // personnalisé (htmlTemplate/docx ci-dessus).
    if (builtinStyle.value !== 'classique') formData.append('templateStyle', builtinStyle.value)
  }
  const activeLeaves = leaveCandidates.value.filter(c => c.goesOnLeave)
  if (activeLeaves.length > 0) {
    formData.append('leavesToProcess', JSON.stringify(activeLeaves))
  }
  formData.append('country', props.country)
  formData.append('mois', payrollMois.value)
  formData.append('annee', payrollAnnee.value)

  // Le profil entreprise (raison sociale, n° CNPS employeur...) vient des
  // paramètres, jamais des employés : sans lui, le serveur devait deviner
  // l'employeur à partir du premier salarié du lot, et son numéro CNPS
  // PERSONNEL se retrouvait imprimé comme numéro CNPS de l'ENTREPRISE sur
  // tous les bulletins générés.
  const entreprise = await localDb.getSetting('entreprise', null)
  if (entreprise) formData.append('entreprise', JSON.stringify(entreprise))

  try {
    const response = await fetch('/api/rh/generate-pay-slips', {
      method: 'POST', 
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData 
    })
    if (!response.ok) {
      if (response.status === 402) {
        emit('require-billing')
      }
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Erreur lors du traitement')
    }
    result.value = await response.json()
    
    if (result.value.success) {
      if (user.value && result.value.subscriptionTier !== undefined) {
        Object.assign(user.value, {
          subscriptionTier: result.value.subscriptionTier,
          subscriptionExpiresAt: result.value.subscriptionExpiresAt,
          bulletinsUsed: result.value.bulletinsUsed,
          credits: result.value.credits
        })
      }
      if (result.value.stats) {
        await localDb.savePayrollRun({
          ...result.value.stats,
          country: props.country
        })
      }
      
      // Save processed leaves to localStorage
      if (result.value.leavesProcessed && result.value.leavesProcessed.length > 0) {
        const congesStr = localStorage.getItem('onda_conges') || '[]'
        let allConges = JSON.parse(congesStr)
        const newConges = result.value.leavesProcessed.map(l => {
          const d1 = new Date(l.dateDebut)
          const d2 = new Date(l.dateFin)
          const diffDays = (!isNaN(d1) && !isNaN(d2)) ? Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1 : 30
          return {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            employeeId: l.id,
            matricule: l.matricule,
            dateDebut: l.dateDebut,
            dateFin: l.dateFin,
            jours: diffDays,
            type: 'annuel',
            statut: 'approuvé',
            dateDemande: new Date().toISOString()
          }
        })
        allConges = [...allConges, ...newConges]
        localStorage.setItem('onda_conges', JSON.stringify(allConges))
        window.dispatchEvent(new Event('conges-updated'))
      }

      try {
        await fetchMe()
      } catch (fetchErr) {
        console.warn("Erreur rafraîchissement utilisateur:", fetchErr)
      }
      fetchPayrollPeriods()
    }
  } catch (e) {
    error.value = e.message
  } finally {
    uploading.value = false
  }
}

// Le ZIP de bulletins contient des données personnelles réelles (salaires,
// N° CNPS, RIB) — /api/rh/download/:filename exige désormais d'être connecté
// et d'en être le propriétaire, donc un simple lien <a href> ne suffit plus
// (il ne peut pas porter l'en-tête Authorization). On télécharge via fetch et
// on déclenche l'enregistrement nous-mêmes.
const downloadingZip = ref(false)
const downloadZip = async (zipUrl) => {
  if (!zipUrl || downloadingZip.value) return
  downloadingZip.value = true
  try {
    const token = localStorage.getItem('auth_token')
    const response = await fetch(zipUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Erreur lors du téléchargement')
    }
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = zipUrl.split('/').pop() || 'bulletins.zip'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch (e) {
    error.value = e.message
  } finally {
    downloadingZip.value = false
  }
}

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

const leaveCandidates = ref([])
const prepareLeaveCandidates = async () => {
  try {
    const emps = await localDb.getEmployees()
    const congesStr = localStorage.getItem('onda_conges') || '[]'
    const allConges = JSON.parse(congesStr)
    
    // Si c'est un fichier Excel, on prend ceux qui matchent ou on propose tout le monde si Base Locale
    let targetEmps = emps
    if (!useLocalDb.value && file.value) {
      // Dans le cas d'un Excel, on n'a pas les employés formels ici, 
      // donc on s'appuie sur la base locale de toute façon pour proposer des congés connus.
    }
    
    leaveCandidates.value = targetEmps.map(emp => {
      const empConges = allConges.filter(c => c.employeeId === emp.id && c.type === 'annuel')
      const joursPris = empConges.reduce((sum, c) => sum + (Number(c.jours) || 0), 0)
      const solde = Math.max(0, 30 - joursPris)
      
      const defaultDebut = new Date(payrollAnnee.value, payrollMois.value - 1, 1)
      const defaultFin = new Date(payrollAnnee.value, payrollMois.value, 0)
      
      return {
        id: emp.id,
        nom: `${emp.nom} ${emp.prenom}`,
        matricule: emp.matricule,
        solde: solde,
        goesOnLeave: false,
        dateDebut: defaultDebut.toISOString().split('T')[0],
        dateFin: defaultFin.toISOString().split('T')[0]
      }
    }).filter(e => e.solde > 0)
  } catch (e) {
    console.warn("Erreur préparation congés:", e)
  }
}

// Step actuel pour le module import
const importStep = ref(1)

const goToImportStep = async (step) => {
  importStep.value = step
  if (step === 4) {
    await prepareLeaveCandidates()
  }
  // Scroll en haut du composant pour voir le stepper
  setTimeout(() => {
    if (hrWrapperRef.value) {
      hrWrapperRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, 50)
}

const currentTime = ref('')
const currentDate = ref('')

const updateTime = () => {
  const now = new Date()
  currentTime.value = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  
  // Capitalize first letter of date
  const rawDate = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  currentDate.value = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)
}

onMounted(() => {
  updateTime()
  const timeInterval = setInterval(updateTime, 1000)
  onUnmounted(() => clearInterval(timeInterval))
})

const modules = computed(() => {
  const allModules = [
  {
    id: 'dashboard',
    title: 'Tableau de Bord & Alertes',
    subtitle: 'Vue d\'ensemble RH',
    description: "Vue d'ensemble RH, KPIs, et alertes sur les congés et expirations de contrats.",
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
    isPro: true,
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #78350f 0%, #f59e0b 100%)',
    badge: 'Pro'
  },
  {
    id: 'simulation_habituel',
    title: 'Simuler un Bulletin (' + countryRules.value.name + ')',
    subtitle: 'Bulletin mensuel simple',
    description: `Calculez et générez un bulletin de paie mensuel standard conforme au droit du travail (${countryRules.value.name}).`,
    icon: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`,
    isPro: false,
    color: '#2563eb',
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
    badge: 'Gratuit',
    steps: ['Entreprise', 'Employé', 'Salaire', 'Paiement']
  },
  {
    id: 'simulation_conges',
    title: 'Calcul de Congés (' + countryRules.value.name + ')',
    subtitle: 'Indemnités de congés',
    description: `Calculez l'allocation et les indemnités de congés payés de vos employés (${countryRules.value.name}).`,
    icon: `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/>`,
    isPro: false,
    color: '#0d9488',
    gradient: 'linear-gradient(135deg, #115e59 0%, #0d9488 100%)',
    badge: 'Gratuit',
    steps: ['Entreprise', 'Employé', 'Congés', 'Calcul']
  },
  {
    id: 'import',
    title: 'Import en Masse',
    subtitle: 'Traitement Excel',
    description: `Importez votre fichier Excel pour générer les bulletins (${countryRules.value.name}) de tous vos employés.`,
    icon: `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/>`,
    isPro: true,
    color: '#059669',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
    badge: 'Pro',
    steps: ['Données', 'Mapping', 'Modèle', 'Génération']
  },
  {
    id: 'saisie',
    title: 'Saisie Mensuelle',
    subtitle: 'Heures Supp & Absences',
    description: `Renseignez rapidement les heures supplémentaires et jours d'absence du mois pour les employés de votre annuaire.`,
    icon: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
    isPro: true,
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #78350f 0%, #f59e0b 100%)',
    badge: 'Pro',
    steps: ['Grille', 'Génération']
  },
  {
    id: 'stats',
    title: 'Statistiques Employé',
    subtitle: 'Absences & Heures Supp',
    description: `Analysez l'historique d'un employé sur l'année : absences, heures supplémentaires et évolution de la rémunération.`,
    icon: `<path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>`,
    isPro: true,
    color: '#2563eb',
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
    badge: 'Pro',
    steps: ['Sélection', 'Analyse']
  },
  {
    id: 'analytics_entreprise',
    title: 'Analytique RH',
    subtitle: 'Masse salariale & SLA',
    description: `Vue d'ensemble entreprise : masse salariale, charges patronales, absentéisme et heures supplémentaires, avec seuils d'alerte configurables.`,
    icon: `<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>`,
    isPro: true,
    color: '#4f46e5',
    gradient: 'linear-gradient(135deg, #312e81 0%, #4f46e5 100%)',
    badge: 'Pro',
    steps: ['Année', 'Analyse']
  },
  {
    id: 'solde',
    title: 'Solde de Tout Compte',
    subtitle: 'Fin de contrat',
    description: `Calculez l'indemnité de fin de contrat selon le Code du Travail (${countryRules.value.name}).`,
    icon: `<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>`,
    isPro: false,
    color: '#d97706',
    gradient: 'linear-gradient(135deg, #78350f 0%, #d97706 100%)',
    badge: 'Gratuit',
    steps: ['Entreprise', 'Employé', 'Calcul']
  },
  {
    id: 'local_db',
    title: 'Base Locale & PWA',
    subtitle: 'Confidentialité Totale',
    description: `Stockez vos employés et historiques 100% en local sur votre appareil (IndexedDB / Offline-First).`,
    icon: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>`,
    isPro: true,
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #3b0764 0%, #7c3aed 100%)',
    badge: 'Pro',
    steps: ['Base Locale', 'PWA Offline', 'Sauvegarde']
  },
  {
    id: 'directory',
    title: 'Annuaire Employés',
    subtitle: 'Gestion des Salariés',
    description: `Gérez vos employés, importez depuis Excel et modifiez les salaires individuellement.`,
    icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>`,
    isPro: true,
    color: '#0ea5e9',
    gradient: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)',
    badge: 'Pro',
    steps: ['Liste', 'Import Excel', 'Édition']
  },
  {
    id: 'settings',
    title: 'Paramètres & Modèles',
    subtitle: 'Configuration RH',
    description: `Configurez vos modèles PDF personnalisés, le mapping et la planification automatique de paie.`,
    icon: `<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>`,
    isPro: false,
    color: '#64748b',
    gradient: 'linear-gradient(135deg, #334155 0%, #64748b 100%)',
    badge: 'Gratuit',
    steps: ['Modèles PDF', 'Planification']
  },
  {
    id: 'documents',
    title: 'Générateur de Documents',
    subtitle: 'Contrats & Attestations',
    description: `Générez en quelques secondes tous vos documents RH : attestations, contrats CDI/CDD, lettres d'avertissement, licenciements — pré-remplis depuis l'annuaire.`,
    icon: `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>`,
    isPro: true,
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #312e81 0%, #7c3aed 100%)',
    badge: 'Pro',
    steps: ['Document', 'Employé', 'Génération']
  },
  {
    id: 'conges',
    title: 'Absences & Congés',
    subtitle: 'Calendrier mensuel',
    description: `Calendrier mensuel des absences, soldes de congés annuels par employé et suivi des types d'absence.`,
    icon: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/>`,
    isPro: true,
    color: '#2563eb',
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
    badge: 'Pro',
    steps: ['Calendrier', 'Soldes']
  },
  {
    id: 'contrats',
    title: 'Contrats & Alertes',
    subtitle: 'Échéances CDD',
    description: `Suivez les contrats de vos employés et recevez des alertes automatiques à J-30, J-15 et J-7 avant l'expiration des CDD.`,
    icon: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>`,
    isPro: true,
    color: '#059669',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
    badge: 'Pro',
    steps: ['Contrats', 'Alertes']
  }
  ]

  if (isSimulatorMode) {
    const allowed = ['simulation_habituel', 'simulation_conges', 'solde']
    return allModules.filter(m => allowed.includes(m.id))
  }
  return allModules
})

const activeModuleDetails = computed(() => {
  if (!activeModule.value) return null
  if (activeModule.value === 'simulation') {
    return modules.value.find(m => m.id === (simulationType.value === 'conges' ? 'simulation_conges' : 'simulation_habituel'))
  }
  return modules.value.find(m => m.id === activeModule.value)
})
</script>

<template>
  <div class="hr-wrapper" ref="hrWrapperRef">
    <!-- Animated Background Shapes (always rendered in background) -->
    <div class="bg-shape shape-1" style="z-index: 1;"></div>
    <div class="bg-shape shape-2" style="z-index: 1;"></div>
    <div class="bg-shape shape-3" style="z-index: 1;"></div>

    <!-- ═══ BUREAU (Desktop) ═══ -->
    <div v-if="!activeModule" class="desktop-bg animate-in" @click="isStartMenuOpen = false">

      <div class="desktop-layout">
        
        <!-- Left Side: Desktop Shortcuts -->
        <div class="desktop-shortcuts">
          <button 
            v-for="mod in modules" 
            :key="mod.id" 
            class="desktop-shortcut-card"
            :class="{ 'locked-shortcut': isModuleLocked(mod.id) }"
            @click="openModule(mod.id)"
            :style="{ '--shortcut-color': mod.color }"
          >
            <div class="shortcut-icon-wrapper" :style="{ background: mod.gradient }">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="mod.icon"></svg>
            </div>
            <div class="shortcut-details">
              <h3>{{ mod.title.split(' (')[0] }}</h3>
              <p>{{ mod.subtitle }}</p>
            </div>
            <div class="shortcut-badge pro-badge" v-if="isModuleLocked(mod.id)">🔒 PRO</div>
            <div class="shortcut-badge" v-else>{{ mod.badge }}</div>
          </button>
        </div>

        <!-- Right Side: Clean Modern Clock / Date / Config Widget -->
        <div class="desktop-sidebar-widget">
          <div class="clock-display">
            <div class="large-time">{{ currentTime }}</div>
            <div class="calendar-date">{{ currentDate }}</div>
          </div>

          <div class="workspace-card">
            <div class="workspace-header">
              <div class="user-avatar" :style="{ background: isPro ? 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)' : '#475569' }">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <div class="workspace-info">
                <h4>{{ isPro ? 'ONDA RH PRO' : 'ONDA LITE' }}</h4>
                <p>{{ isPro ? 'Espace de travail connecté' : 'Simulations Individuelles' }}</p>
              </div>
            </div>

            <div class="workspace-meta">
              <div class="meta-row">
                <span class="meta-label">Version Pro :</span>
                <span class="meta-value" :style="{ color: isPro ? '#34d399' : '#94a3b8', fontWeight: '800' }">
                  {{ isPro ? 'Pro RH Installée' : 'Non activée' }}
                </span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Droit local :</span>
                <span class="meta-value">{{ countryRules.name }}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label" v-if="isPro">Base locale :</span>
                <span class="meta-value" v-if="isPro">IndexedDB Actif</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Statut PWA :</span>
                <span class="meta-value">{{ isHRApp ? 'Installé' : 'Mode Navigateur' }}</span>
              </div>
            </div>
          </div>

          <div v-if="!isSimulatorMode && payrollPeriods.length > 0" class="workspace-card" style="margin-top: 1.15rem;">
            <div class="workspace-header" style="margin-bottom: 0.5rem;">
              <div class="workspace-info">
                <h4>Périodes de paie</h4>
                <p>Historique des bulletins générés</p>
              </div>
            </div>
            <div style="max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
              <div
                v-for="p in payrollPeriods"
                :key="p.id"
                style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.65rem; background: rgba(255,255,255,0.06); border-radius: 8px; font-size: 0.775rem;"
              >
                <div>
                  <div style="font-weight: 700;">{{ moisNoms[p.mois - 1] }} {{ p.annee }}</div>
                  <div style="opacity: 0.7; font-size: 0.7rem;">{{ p.employeeCount }} bulletin(s)</div>
                </div>
                <span style="background: #dcfce7; color: #15803d; padding: 0.15rem 0.5rem; border-radius: 9999px; font-weight: 700; font-size: 0.7rem;">Validée</span>
              </div>
            </div>
          </div>

          <a v-if="ENTERPRISE_SALES_ENABLED" :href="enterpriseUrl" style="display: block; margin-top: 1.15rem; padding: 0.75rem 0.9rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; text-decoration: none; transition: all 0.2s;">
            <div style="font-size: 0.72rem; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.03em;">Version Entreprise</div>
            <div style="font-size: 0.775rem; color: #475569; margin-top: 0.2rem;">Logiciel complet installable, licence unique →</div>
          </a>
        </div>

      </div>
    </div>

    <!-- ═══ MENU DÉMARRER (START MENU) ═══ -->
    <div class="start-menu-overlay" v-if="isStartMenuOpen" @click="isStartMenuOpen = false"></div>
    <div class="start-menu" :class="{ 'open': isStartMenuOpen }">
      <div class="start-menu-sidebar" v-if="!isSimulatorMode">
        <button class="sm-sidebar-btn" title="Paramètres" @click="openModule('settings')">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>
      <div class="start-menu-content">
        <h3 class="sm-title">Toutes les applications</h3>
        <div class="sm-grid">
          <button
            v-for="mod in modules"
            :key="mod.id"
            class="sm-tile"
            :class="{ 'locked-tile': isModuleLocked(mod.id) }"
            :style="{ background: isModuleLocked(mod.id) ? '#475569' : mod.color }"
            @click="openModule(mod.id)"
          >
            <div class="sm-tile-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="mod.icon"></svg>
            </div>
            <div class="sm-tile-title">
              <template v-if="isModuleLocked(mod.id)">🔒 </template>
              {{ mod.title.split(' (')[0] }}
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ BARRE DES TÂCHES (TASKBAR) ═══ -->
    <div class="taskbar">
      <button class="taskbar-start-btn" @click="toggleStartMenu" :class="{ 'active': isStartMenuOpen }">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
      </button>
      <div class="taskbar-divider"></div>
      
      <!-- App opened indicator in taskbar -->
      <button class="taskbar-app-btn active" v-if="activeModule" @click="isStartMenuOpen = false">
        <div class="taskbar-app-icon" v-html="activeModuleDetails?.icon" :style="{ color: activeModuleDetails?.color }"></div>
        {{ activeModuleDetails?.title }}
      </button>
    </div>

    <!-- ═══ MODULE ACTIF ═══ -->
    <template v-if="activeModule">

      <!-- ════ MODULE SIMULATION ════ -->
      <div v-if="activeModule === 'simulation'" class="hr-module-view animate-in">
        <div class="module-content no-pad">
          <PayslipSimulator 
            :initialType="simulationType" 
            :country="props.country" 
            :key="simulationType + '_' + props.country" 
            @require-auth="emit('require-auth')"
            @require-billing="emit('require-billing')"
          />
        </div>
      </div>

      <!-- ════ MODULE IMPORT ════ -->
      <div v-if="activeModule === 'import'" class="module-content hr-module-view animate-in">

        <!-- Step indicator -->
        <div class="import-stepper">
          <div class="import-step" :class="{ active: importStep >= 1, done: importStep > 1 }">
            <div class="import-step-circle">
              <svg v-if="importStep > 1" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else>1</span>
            </div>
            <span>Fichier</span>
          </div>
          <div class="import-step-line"></div>
          <div class="import-step" :class="{ active: importStep >= 2, done: importStep > 2 }">
            <div class="import-step-circle">
              <svg v-if="importStep > 2" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else>2</span>
            </div>
            <span>Mapping</span>
          </div>
          <div class="import-step-line"></div>
          <div class="import-step" :class="{ active: importStep >= 3, done: importStep > 3 }">
            <div class="import-step-circle">
              <svg v-if="importStep > 3" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else>3</span>
            </div>
            <span>Modèle</span>
          </div>
          <div class="import-step-line"></div>
          <div class="import-step" :class="{ active: importStep >= 4 }">
            <div class="import-step-circle"><span>4</span></div>
            <span>Générer</span>
          </div>
        </div>

        <!-- Étape 1: Fichier Excel -->
        <div v-if="importStep === 1" class="import-step-content animate-in">
          <div class="import-intro">
            <div class="intro-icon-wrap">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div>
              <strong>Fichier Données Employés</strong>
              <p>Importez le fichier Excel contenant les données de tous vos employés (.xlsx ou .xls)</p>
            </div>
          </div>

          <div style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;">
            <div class="form-group" style="flex: 1; min-width: 160px;">
              <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Mois de paie</label>
              <select v-model.number="payrollMois" style="width: 100%; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; box-sizing: border-box;">
                <option v-for="(m, idx) in moisNoms" :key="idx" :value="idx + 1">{{ m }}</option>
              </select>
            </div>
            <div class="form-group" style="flex: 1; min-width: 120px;">
              <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Année</label>
              <input v-model.number="payrollAnnee" type="number" style="width: 100%; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
            </div>
          </div>

          <div class="local-directory-fast-option" style="margin-bottom: 24px; padding: 16px; background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #0369a1; display: block; margin-bottom: 4px;">Option Rapide : Annuaire Local</strong>
              <p style="color: #0c4a6e; font-size: 0.9rem; margin: 0;">Générez la paie pour tous les employés enregistrés dans votre base locale sans avoir à importer d'Excel.</p>
            </div>
            <button @click="useLocalDirectory" style="background: #0284c7; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">
              Générer la paie (Annuaire)
            </button>
          </div>

          <div
            v-if="!useLocalDb"
            class="upload-zone"
            :class="{ dragging: dragOver, 'has-file': file }"
            @dragover.prevent="dragOver = true"
            @dragleave.prevent="dragOver = false"
            @drop.prevent="onDrop"
          >
            <div v-if="!file" class="placeholder">
              <div class="upload-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <p class="upload-text">Glissez votre fichier ici</p>
              <p class="upload-hint">ou cliquez pour sélectionner (.xlsx, .xls)</p>
              <input type="file" accept=".xlsx, .xls" @change="handleFileUpload" />
            </div>
            <div v-else class="file-info">
              <div class="file-icon excel">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div class="file-details">
                <span class="file-name">{{ file.name }}</span>
                <span class="file-size">{{ formatSize(file.size) }}</span>
              </div>
              <button class="file-remove" @click="file = null; result = null">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div class="model-download-row">
            <a href="/api/rh/download/modele-paie.xlsx" class="model-link" download>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Télécharger le modèle Excel (vierge)
            </a>
          </div>

          <div v-if="showSheetPicker" class="sheet-picker-box">
            <strong>Ce fichier contient plusieurs feuilles.</strong>
            <p>Quelle feuille contient la liste de vos employés ?</p>
            <div class="sheet-picker-list">
              <button
                v-for="s in sheetNames"
                :key="s"
                class="sheet-picker-btn"
                :disabled="uploading"
                @click="chooseSheet(s)"
              >
                {{ s }}
              </button>
            </div>
          </div>

          <div class="step-nav">
            <div></div>
            <button class="btn-next" :disabled="!file || uploading || showSheetPicker" @click="analyzeFileHeaders()">
              <span v-if="uploading">Analyse en cours...</span>
              <span v-else>Suivant — Mapping Intelligent →</span>
            </button>
          </div>
        </div>

        <!-- Étape 2: Mapping Intelligent -->
        <div v-if="importStep === 2" class="import-step-content animate-in">

          <!-- ALERTE: Mauvais fichier -->
          <div v-if="isLikelyWrongFile" class="mapping-warning animate-in">
            <div class="mapping-warning-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div>
              <strong>Ce fichier ne semble pas être un fichier de paie</strong>
              <p>Aucune colonne reconnue (Nom, Salaire, etc.). Vérifiez que vous avez sélectionné le bon fichier Excel contenant les données de vos employés.</p>
              <button class="btn-change-file" @click="file = null; fileHeaders = []; columnMapping = {}; sheetNames = []; selectedSheet = null; showSheetPicker = false; aiMappingUsed = false; goToImportStep(1)">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                Choisir un autre fichier
              </button>
            </div>
          </div>

          <!-- En-tête normal (si le fichier semble OK) -->
          <div v-else class="import-intro">
            <div class="intro-icon-wrap" style="background: #f0fdf4;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div>
              <strong>
                {{ autoMappedCount }} colonne(s) détectée(s) automatiquement
                <span v-if="aiMappingUsed" class="ai-mapping-badge">✨ Suggestions améliorées par IA</span>
                <span v-else-if="aiMappingLoadingCols" class="ai-mapping-badge ai-mapping-badge-loading">IA en cours d'analyse...</span>
              </strong>
              <p>Vérifiez la correspondance ci-dessous. Les champs marqués d'un <span style="color:#ef4444">*</span> sont obligatoires.</p>
            </div>
          </div>

          <!-- Colonnes détectées dans le fichier (pour info) -->
          <div v-if="fileHeaders.length > 0" class="detected-headers">
            <small>Colonnes dans votre fichier :</small>
            <div class="header-tags">
              <span v-for="h in fileHeaders" :key="h" class="header-tag">{{ h }}</span>
            </div>
          </div>
          
          <div class="mapping-table-container">
            <table class="mapping-table">
              <thead>
                <tr>
                  <th>Champ ONDA</th>
                  <th>Colonne dans votre Fichier</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in standardFields" :key="field.key" :class="{ 'mapping-row-error': field.required && !columnMapping[field.key] }">
                  <td>
                    {{ field.label }}
                    <span v-if="field.required" class="required-asterisk">*</span>
                  </td>
                  <td>
                    <select v-model="columnMapping[field.key]" class="mapping-select">
                      <option value="">-- Ignorer --</option>
                      <option v-for="header in fileHeaders" :key="header" :value="header">
                        {{ header }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <span v-if="columnMapping[field.key]" class="mapped-badge">✓ Mappé</span>
                    <span v-else-if="field.required" class="unmapped-badge">Requis</span>
                    <span v-else class="optional-badge-small">Optionnel</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Message d'erreur si champs requis manquants -->
          <div v-if="!requiredFieldsMapped && !isLikelyWrongFile" class="mapping-error-msg">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Veuillez associer tous les champs obligatoires (*) pour continuer.
          </div>

          <div class="step-nav">
            <button class="btn-prev" @click="goToImportStep(1)">← Précédent</button>
            <button class="btn-next" :disabled="!requiredFieldsMapped" @click="goToImportStep(3)">Suivant — Modèle →</button>
          </div>
        </div>

        <!-- Étape 3: Modèle de bulletin & Auto-Mapping -->
        <div v-if="importStep === 3" class="import-step-content animate-in">
          <div class="import-intro">
            <div class="intro-icon-wrap" style="background: #eff6ff;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div>
              <strong>Modèle de bulletin personnalisé <span class="optional-badge">Optionnel</span></strong>
              <p>Uploadez votre propre modèle de bulletin (PDF). Sa mise en page est reproduite à l'identique ; seuls les champs que nous reconnaissons (les mêmes que sur nos bulletins par défaut) sont remplacés par vos données. Le reste du modèle reste tel quel.</p>
            </div>
          </div>

          <div v-if="!templateFile" class="builtin-style-picker">
            <label>Style du modèle ONDA (si vous n'importez pas de PDF ci-dessous) :</label>
            <select v-model="builtinStyle">
              <option value="classique">Classique (Base / Taux)</option>
              <option value="grille">Grille numérotée (010, 020… — P.S / P.P)</option>
              <option value="compact">Compact (une seule colonne)</option>
              <option value="ondaclassic"> Onda classic(charges patronales séparées)</option>
              <option value="bancaire">Reçu bancaire (gains / retenues côte à côte)</option>
              <option value="moderne">Moderne (cartes colorées)</option>
              <option value="lavandiere">Congés détaillés (Acquis/Reste/Pris)</option>
              <option value="adArchitecture">Cumuls annuels (billetage espèces)</option>
              <option value="tcmLogistic">Grille patronale détaillée (Retenue +/-)</option>
              <option value="scaso">SCASO (noir et blanc, cachet et signature)</option>
              <option value="personnalise">Personnalisé (votre couleur — Paramètres)</option>
            </select>
          </div>

          <div class="template-zone">
            <div v-if="!templateFile" class="template-empty">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <span>Ajouter un modèle de bulletin (PDF)</span>
              <input type="file" accept=".pdf" @change="handleTemplateUpload" />
            </div>
            
            <div v-else class="template-filled">
              <span class="word-icon" :style="{ background: '#ef4444' }">P</span>
              <span class="template-name">{{ templateFile.name }}</span>
              <button class="file-remove small" @click="templateFile = null; htmlTemplate = null">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          <!-- Actions de l'IA (après upload) -->
          <div class="ai-processing-zone" v-if="templateFile">
            <div v-if="!aiMappingLoading" class="fidelity-picker">
              <label>Fidélité de la reproduction (PDF scanné uniquement)</label>
              <select v-model.number="aiRefinePasses">
                <option :value="0">Rapide — 1 passe (~15 s)</option>
                <option :value="1">Fidèle — 2 passes (~40 s)</option>
                <option :value="2">Maximale — 3 passes (~70 s)</option>
              </select>
              <small>Sans texte détectable (scan), le modèle est reconstruit depuis l'image et affiné à chaque passe. Avec un PDF normal, l'analyse est directe et ce réglage ne s'applique pas.</small>
            </div>

            <button class="btn-ai-automap" style="width: 100%; justify-content: center;" @click="autoMapPdf" v-if="!aiMappingLoading && !htmlTemplate" :disabled="!pdfReady">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
              Analyser le modèle
            </button>

            <div v-if="aiMappingLoading" class="flex-center gap-2" style="padding: 1rem; color: #6b7280;">
              <svg class="spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Analyse du modèle en cours...
            </div>

            <div v-if="aiMappingSuccess && htmlTemplate" class="ai-success-toast animate-in" style="margin-bottom: 1rem; background: #ecfdf5; color: #059669; border: 1px solid #10b981; padding: 1rem; border-radius: 8px; display: flex; align-items: center; gap: 0.5rem; justify-content: center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span v-if="lastEngine === 'deterministic'">
                Reproduit à l'identique depuis la géométrie du PDF.
                <template v-if="detectedVariables.length"> {{ detectedVariables.length }} variable(s) détectée(s).</template>
              </span>
              <span v-else>Bulletin reconstruit de façon approximative (document scanné). Vérifiez l'aperçu.</span>
            </div>
            <div v-if="conformity" class="conformity-notice" :class="conformity.verdict">
              <strong v-if="conformity.verdict === 'identique'">Contrôle de conformité : reproduction jugée fidèle</strong>
              <strong v-else-if="conformity.verdict === 'indisponible'">Contrôle de conformité non concluant</strong>
              <strong v-else>Contrôle de conformité : {{ conformity.ecarts.length }} écart(s) relevé(s)</strong>
              <p v-if="conformity.raison">{{ conformity.raison }}</p>
              <ul v-if="conformity.ecarts.length">
                <li v-for="(e, i) in conformity.ecarts" :key="i">
                  <span class="gravite" :class="e.gravite">{{ e.gravite }}</span>
                  <strong>{{ e.zone }}</strong> — {{ e.probleme }}
                </li>
              </ul>
              <p v-if="conformity.valeursOubliees && conformity.valeursOubliees.length">
                Valeurs restées figées : {{ conformity.valeursOubliees.join(' · ') }}
              </p>
              <p v-if="conformity.textesEfaces && conformity.textesEfaces.length" class="grave">
                Mentions effacées à tort : {{ conformity.textesEfaces.join(' · ') }}
              </p>
            </div>

            <div v-if="unmappedFields.length" class="unmapped-notice">
              <strong>{{ unmappedFields.length }} champ(s) repéré(s) sans donnée associée</strong>
              <p>Ces emplacements sont bien reconnus dans votre modèle, mais le système ne sait pas encore quoi y mettre. Ils resteront vides.</p>
              <ul>
                <li v-for="f in unmappedFields" :key="f.variable">
                  <span class="unmapped-label">{{ f.label || f.variable }}</span>
                  <span class="unmapped-sample" v-if="f.samples && f.samples.length">ex. {{ f.samples[0] }}</span>
                </li>
              </ul>
            </div>

            <button v-if="htmlTemplate && !aiMappingLoading" class="btn-ai-automap" style="width: 100%; justify-content: center; margin-top: 0.75rem;" @click="autoMapPdf">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Relancer la reconstruction
            </button>
            <iframe v-if="htmlTemplate" :srcdoc="wrappedHtmlTemplate" style="width: 100%; height: 500px; border: 1px solid #e5e7eb; border-radius: 8px; background: white; margin-top: 1rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);"></iframe>
          </div>

          <!-- Canvas invisible (requis pour l'envoi de l'image à l'IA) -->
          <canvas ref="pdfCanvas" style="display: none;"></canvas>

          <div class="step-nav" style="margin-top: 2rem;">
            <button class="btn-prev" @click="goToImportStep(2)">← Précédent</button>
            <button class="btn-next" @click="goToImportStep(4)" :disabled="aiMappingLoading">Suivant — Générer →</button>
          </div>
        </div>

        <!-- Étape 4: Vérification des Congés -->
        <div v-if="importStep === 4" class="import-step-content animate-in">
          <div class="import-intro">
            <div class="intro-icon-wrap" style="background: #fdf4ff;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d946ef" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            </div>
            <div>
              <strong>Planification automatique des congés</strong>
              <p>Cochez les employés qui doivent partir en congé ce mois-ci. Le système générera un <strong>Bulletin d'allocation congé</strong> en plus de leur bulletin de paie normal.</p>
            </div>
          </div>
          
          <div class="mapping-table-container">
            <table class="mapping-table">
              <thead>
                <tr>
                  <th>Employé</th>
                  <th>Solde Actuel</th>
                  <th>Part en Congé ?</th>
                  <th>Dates du Congé</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="emp in leaveCandidates" :key="emp.id" :style="{ background: emp.goesOnLeave ? '#fdf4ff' : 'transparent' }">
                  <td>
                    <strong>{{ emp.nom }}</strong>
                    <div style="font-size: 0.75rem; color: #64748b;">{{ emp.matricule || '-' }}</div>
                  </td>
                  <td>
                    <span :style="{ color: emp.solde > 26 ? '#ea580c' : '#059669', fontWeight: '700' }">{{ emp.solde }} jours</span>
                  </td>
                  <td>
                    <input type="checkbox" v-model="emp.goesOnLeave" style="width: 20px; height: 20px; accent-color: #d946ef; cursor: pointer;">
                  </td>
                  <td>
                    <div v-if="emp.goesOnLeave" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                      <input type="date" v-model="emp.dateDebut" style="padding: 0.4rem; border-radius: 6px; border: 1px solid #d946ef; font-size: 0.8rem;">
                      <span style="color: #64748b; font-size: 0.8rem;">au</span>
                      <input type="date" v-model="emp.dateFin" style="padding: 0.4rem; border-radius: 6px; border: 1px solid #d946ef; font-size: 0.8rem;">
                    </div>
                    <div v-else style="color: #cbd5e1; font-size: 0.8rem; font-style: italic;">
                      Aucun congé planifié
                    </div>
                  </td>
                </tr>
                <tr v-if="leaveCandidates.length === 0">
                  <td colspan="4" style="text-align: center; color: #64748b; padding: 1.5rem;">Aucun employé éligible ou historique introuvable.</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div class="step-nav" style="margin-top: 2rem;">
            <button class="btn-prev" @click="goToImportStep(3)">← Précédent</button>
            <button class="btn-next" @click="goToImportStep(5)">Suivant — Lancement →</button>
          </div>
        </div>

        <!-- Étape 5: Lancement -->
        <div v-if="importStep === 5" class="import-step-content animate-in">
          <div v-if="staleTemplate" class="payroll-warning stale">
            <strong>Le modèle « {{ staleTemplate.name || 'par défaut' }} » a été analysé par une version antérieure</strong>
            <p>
              Un gabarit est figé au moment de son analyse. Celui-ci conserve donc les
              défauts corrigés depuis — libellés manquants, rubriques non remplies.
              Réanalysez-le depuis <em>Paramètres → Modèles</em> pour en bénéficier.
            </p>
          </div>

          <div v-if="payrollWarnings.sansRemuneration.length" class="payroll-warning">
            <strong>{{ payrollWarnings.sansRemuneration.length }} salarié(s) sans rémunération définie</strong>
            <p>
              Leur bulletin sortira à zéro. La rémunération se saisit dans le
              <em>contrat</em> (salaire de base, sursalaire, primes) — la fiche employé ne
              porte que l'identité, la situation matrimoniale et le numéro CNPS.
            </p>
            <ul>
              <li v-for="e in payrollWarnings.sansRemuneration.slice(0, 8)" :key="e.id">
                {{ employeeLabel(e) }}
                <span v-if="e._sansContrat" class="warn-tag">aucun contrat</span>
                <span v-else class="warn-tag">contrat sans salaire</span>
              </li>
            </ul>
            <p v-if="payrollWarnings.sansRemuneration.length > 8" class="warn-more">
              … et {{ payrollWarnings.sansRemuneration.length - 8 }} autre(s).
            </p>
          </div>

          <div class="launch-summary">
            <div class="summary-row">
              <span class="summary-label">Fichier de données</span>
              <span class="summary-value ok">{{ file?.name || 'Base Locale' }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Modèle</span>
              <span class="summary-value" :class="templateFile ? 'ok' : 'neutral'">{{ templateFile?.name || 'PDF par défaut' }}</span>
            </div>
          </div>

          <button class="btn-launch" :disabled="uploading" @click="processPayroll">
            <span v-if="uploading" class="flex-center gap-2">
              <svg class="spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Traitement en cours...
            </span>
            <span v-else class="flex-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Générer tous les bulletins
              <span class="mode-badge">{{ templateFile ? (templateFile.name.endsWith('.pdf') ? 'Modèle PDF' : 'Modèle Word') : 'Modèle ONDA par défaut' }}</span>
            </span>
          </button>

          <div v-if="result" class="result-success animate-in">
            <div class="result-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div class="result-text">
              <h4>Bulletins générés !</h4>
              <p>{{ result.message }}</p>
              <p style="font-size: 0.82rem; color: #64748b; margin-top: 4px;">Le ZIP contient un bulletin PDF par salarié, plus un état de paie récapitulatif au format Excel.</p>
            </div>
            <button type="button" class="btn-download" :disabled="downloadingZip" @click="downloadZip(result.zipUrl)">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {{ downloadingZip ? 'Téléchargement...' : 'Télécharger le ZIP (PDF + Excel)' }}
            </button>
            <button class="btn-restart" @click="file = null; templateFile = null; result = null; fileHeaders = []; columnMapping = {}; sheetNames = []; selectedSheet = null; showSheetPicker = false; aiMappingUsed = false; goToImportStep(1)">
              Recommencer
            </button>
          </div>

          <div v-if="error" class="result-error animate-in">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <div>
              <strong>Erreur</strong>
              <p>{{ error }}</p>
            </div>
          </div>

          <div class="step-nav">
            <button class="btn-prev" @click="goToImportStep(4)">← Précédent</button>
          </div>
        </div>

      </div>

      <!-- ════ MODULE SOLDE ════ -->
      <div v-if="activeModule === 'solde'" class="module-content hr-module-view no-pad animate-in">
        <SoldeCompteSimulator :country="country" />
      </div>

      <!-- ════ MODULE SAISIE MENSUELLE ════ -->
      <div v-if="activeModule === 'saisie'" class="module-content hr-module-view animate-in">
        <div class="import-intro" style="margin-bottom: 1.25rem;">
          <div class="intro-icon-wrap" style="background: #fffbeb;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <strong>Saisie Mensuelle</strong>
            <p>Renseignez les heures supplémentaires et jours d'absence du mois pour vos employés déjà enregistrés dans l'annuaire.</p>
          </div>
        </div>

        <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;">
          <div class="form-group" style="flex: 1; min-width: 160px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Mois de paie</label>
            <select v-model.number="payrollMois" style="width: 100%; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; box-sizing: border-box;">
              <option v-for="(m, idx) in moisNoms" :key="idx" :value="idx + 1">{{ m }}</option>
            </select>
          </div>
          <div class="form-group" style="flex: 1; min-width: 120px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Année</label>
            <input v-model.number="payrollAnnee" type="number" style="width: 100%; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
        </div>

        <div v-if="saisieLoading" class="admin-loading" style="padding: 2rem; text-align: center; color: #64748b;">
          Chargement de l'annuaire...
        </div>

        <div v-else-if="saisieEmployees.length === 0" class="empty-state" style="padding: 2.5rem 1.5rem; text-align: center; background: #f8fafc; border-radius: 12px; border: 1px dashed #e2e8f0;">
          <p style="color: #64748b; margin: 0 0 12px 0;">Votre annuaire est vide.</p>
          <button @click="openModule('directory')" class="btn-next" style="display: inline-flex;">Aller à l'Annuaire Employés</button>
        </div>

        <div v-else>
          <div class="local-directory-fast-option" style="margin-bottom: 20px; padding: 14px 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <strong style="color: #92400e; display: block; margin-bottom: 4px;">Vous avez un système de pointage ?</strong>
              <p style="color: #78350f; font-size: 0.85rem; margin: 0;">
                Importez directement une fiche de présence (matricule + jours travaillés/heures supp/absences) au lieu de saisir ligne par ligne.
                <a href="/api/rh/download/modele-presence.xlsx" download style="color: #92400e; font-weight: 700;">Télécharger le modèle</a>
              </p>
            </div>
            <label style="background: #d97706; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; white-space: nowrap;">
              {{ presenceImporting ? 'Import en cours...' : 'Importer une fiche de présence' }}
              <input type="file" accept=".xlsx,.xls" @change="importPresenceFile" style="display: none;" :disabled="presenceImporting" />
            </label>
          </div>
          <div style="margin-bottom: 12px; display: flex; justify-content: flex-end;">
            <div style="width: 100%; max-width: 300px; display: flex; flex-direction: column; align-items: flex-end;">
              <EmployeeSelect :employees="saisieEmployees" @select="(e) => saisieSearchQuery = e ? e.matricule : ''" placeholder="Rechercher un employé..." />
              <button v-if="saisieSearchQuery" @click="saisieSearchQuery = ''" style="margin-top: 0.25rem; font-size: 0.75rem; color: #64748b; background: none; border: none; cursor: pointer; text-decoration: underline;">
                Afficher tous les employés
              </button>
            </div>
          </div>
          <div class="mapping-table-container">
            <table class="mapping-table">
              <thead>
                <tr>
                  <th>Employé</th>
                  <th>Heures Supp.</th>
                  <th>Jours d'Absence</th>
                  <th>Jours Travaillés <span style="font-weight: 400; color: #94a3b8;">(auto, modifiable)</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="emp in saisieFilteredEmployees" :key="emp.id">
                  <td>
                    <strong>{{ emp.nom }} {{ emp.prenom }}</strong>
                    <div style="font-size: 0.75rem; color: #64748b;">{{ emp.matricule || '-' }}</div>
                  </td>
                  <td><input v-model.number="saisieGrid[emp.id].heures_sup_nb" type="number" min="0" style="width: 90px; padding: 0.4rem 0.5rem; border-radius: 6px; border: 1px solid #e2e8f0;" /></td>
                  <td><input v-model.number="saisieGrid[emp.id].absences_jours" type="number" min="0" max="26" style="width: 90px; padding: 0.4rem 0.5rem; border-radius: 6px; border: 1px solid #e2e8f0;" /></td>
                  <td>
                    <input
                      :value="saisieJoursTravailles(emp.id)"
                      @input="setSaisieJoursTravailles(emp.id, $event.target.value)"
                      type="number" min="0" max="31"
                      style="width: 90px; padding: 0.4rem 0.5rem; border-radius: 6px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700;"
                      title="Calculé automatiquement (26 - absences), modifiable si besoin. Videz le champ pour revenir au calcul automatique."
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="step-nav">
            <div></div>
            <button class="btn-next" :disabled="uploading" @click="generateFromSaisie">
              <span v-if="uploading">Génération en cours...</span>
              <span v-else>Générer les bulletins →</span>
            </button>
          </div>

          <div v-if="error" class="result-error" style="margin-top: 1rem;">
            <p>{{ error }}</p>
          </div>
          <div v-if="result && result.success" class="billing-alert alert-success" style="margin-top: 1rem; padding: 0.85rem 1rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; color: #059669;">
            {{ result.message }}
            <button type="button" :disabled="downloadingZip" @click="downloadZip(result.zipUrl)" style="display: block; margin-top: 0.5rem; font-weight: 700; background: none; border: none; padding: 0; color: inherit; text-decoration: underline; cursor: pointer;">{{ downloadingZip ? 'Téléchargement...' : 'Télécharger le ZIP (PDF + Excel)' }}</button>
          </div>
        </div>
      </div>

      <!-- ════ MODULE STATISTIQUES EMPLOYÉ ════ -->
      <div v-if="activeModule === 'stats'" class="module-content hr-module-view animate-in">
        <div class="import-intro" style="margin-bottom: 1.25rem;">
          <div class="intro-icon-wrap" style="background: #eff6ff;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
          </div>
          <div>
            <strong>Statistiques Employé</strong>
            <p>Absences, heures supplémentaires et rémunération sur l'année, à partir de l'historique de paie généré.</p>
          </div>
        </div>

        <div v-if="statsEmployeesList.length === 0" class="empty-state" style="padding: 2.5rem 1.5rem; text-align: center; background: #f8fafc; border-radius: 12px; border: 1px dashed #e2e8f0;">
          <p style="color: #64748b; margin: 0 0 12px 0;">Aucun employé avec matricule dans l'annuaire.</p>
          <button @click="openModule('directory')" class="btn-next" style="display: inline-flex;">Aller à l'Annuaire Employés</button>
        </div>

        <div v-else>
          <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;">
            <div class="form-group" style="flex: 4; min-width: 300px;">
              <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Rechercher un employé</label>
              <EmployeeSelect :employees="statsEmployeesList" @select="(e) => statsSelectedMatricule = e ? e.matricule : ''" placeholder="Nom, prénom ou matricule..." />
              <div v-if="statsSelectedMatricule" style="margin-top: 0.25rem; font-size: 0.75rem; color: #10b981;">
                Matricule sélectionné : {{ statsSelectedMatricule }}
              </div>
            </div>
            <div class="form-group" style="flex: 3; min-width: 280px;">
              <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Période</label>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 0.8rem; color: #64748b;">Du</span>
                <select v-model.number="statsDebutMois" style="padding: 0.6rem 0.5rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <option v-for="(m, i) in moisNoms" :key="i" :value="i + 1">{{ m }}</option>
                </select>
                <input v-model.number="statsDebutAnnee" type="number" style="width: 80px; padding: 0.6rem 0.5rem; border-radius: 8px; border: 1px solid #e2e8f0;" />
                <span style="font-size: 0.8rem; color: #64748b;">au</span>
                <select v-model.number="statsFinMois" style="padding: 0.6rem 0.5rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <option v-for="(m, i) in moisNoms" :key="i" :value="i + 1">{{ m }}</option>
                </select>
                <input v-model.number="statsFinAnnee" type="number" style="width: 80px; padding: 0.6rem 0.5rem; border-radius: 8px; border: 1px solid #e2e8f0;" />
              </div>
            </div>
          </div>

          <div v-if="statsLoading" class="admin-loading" style="padding: 2rem; text-align: center; color: #64748b;">
            Chargement des statistiques...
          </div>

          <template v-else-if="statsData">
            <div v-if="statsData.totals.moisAvecDonnees === 0" class="empty-state" style="padding: 2rem 1.5rem; text-align: center; background: #f8fafc; border-radius: 12px; border: 1px dashed #e2e8f0;">
              <p style="color: #64748b; margin: 0;">Aucun bulletin généré pour cet employé sur la période sélectionnée.</p>
            </div>

            <template v-else>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px;">
                <div class="kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                  <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Jours d'absence (année)</div>
                  <div style="font-size: 1.6rem; font-weight: 800; color: #0f172a; margin-top: 4px;">{{ statsData.totals.totalAbsences }}</div>
                </div>
                <div class="kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                  <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Heures supp. (année)</div>
                  <div style="font-size: 1.6rem; font-weight: 800; color: #0f172a; margin-top: 4px;">{{ statsData.totals.totalHeuresSup }}</div>
                </div>
                <div class="kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                  <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Brut moyen mensuel</div>
                  <div style="font-size: 1.6rem; font-weight: 800; color: #0f172a; margin-top: 4px;">{{ fcfa(statsData.totals.brutMoyen) }}</div>
                </div>
                <div class="kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                  <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Mois avec bulletin</div>
                  <div style="font-size: 1.6rem; font-weight: 800; color: #0f172a; margin-top: 4px;">{{ statsData.totals.moisAvecDonnees }} / 12</div>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                  <h4 style="margin: 0 0 8px 0; font-size: 0.9rem; color: #0f172a;">Jours d'absence par mois</h4>
                  <apexchart type="bar" height="240" :options="statsAbsencesOptions" :series="statsAbsencesSeries"></apexchart>
                </div>
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                  <h4 style="margin: 0 0 8px 0; font-size: 0.9rem; color: #0f172a;">Heures supplémentaires par mois</h4>
                  <apexchart type="bar" height="240" :options="statsHeuresSupOptions" :series="statsHeuresSupSeries"></apexchart>
                </div>
              </div>

              <div class="mapping-table-container" style="margin-top: 20px;">
                <h4 style="margin: 0 0 8px 0; font-size: 0.9rem; color: #0f172a;">Détail mensuel</h4>
                <table class="mapping-table">
                  <thead>
                    <tr>
                      <th>Mois</th>
                      <th>Jours Travaillés</th>
                      <th>Jours d'Absence</th>
                      <th>Heures Supp.</th>
                      <th>Brut</th>
                      <th>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="m in statsData.monthly" :key="m.mois">
                      <td>{{ moisNoms[m.mois - 1] }} {{ m.annee }}</td>
                      <td>{{ m.joursTravailles }}</td>
                      <td>{{ m.absencesJours }}</td>
                      <td>{{ m.heuresSupNb }}</td>
                      <td>{{ fcfa(m.brutTotal) }}</td>
                      <td>{{ fcfa(m.netAPayer) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </template>
          <div v-else class="empty-state" style="padding: 2rem 1.5rem; text-align: center; background: #f8fafc; border-radius: 12px; border: 1px dashed #e2e8f0;">
            <p style="color: #64748b; margin: 0;">Aucun employé ne correspond à « {{ statsSearchQuery }} ».</p>
          </div>
        </div>
      </div>

      <!-- ════ MODULE ANALYTIQUE RH ENTREPRISE ════ -->
      <div v-if="activeModule === 'analytics_entreprise'" class="module-content hr-module-view animate-in">
        <div class="import-intro" style="margin-bottom: 1.25rem;">
          <div class="intro-icon-wrap" style="background: #eef2ff;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
          </div>
          <div>
            <strong>Analytique RH</strong>
            <p>Masse salariale, charges patronales, absentéisme et heures supplémentaires — vue d'ensemble entreprise avec seuils d'alerte.</p>
          </div>
        </div>

        <div style="display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; align-items: flex-end;">
          <div class="form-group" style="flex: 3; min-width: 280px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Période</label>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 0.8rem; color: #64748b;">Du</span>
              <select v-model.number="companyDebutMois" style="padding: 0.6rem 0.5rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                <option v-for="(m, i) in moisNoms" :key="i" :value="i + 1">{{ m }}</option>
              </select>
              <input v-model.number="companyDebutAnnee" type="number" style="width: 80px; padding: 0.6rem 0.5rem; border-radius: 8px; border: 1px solid #e2e8f0;" />
              <span style="font-size: 0.8rem; color: #64748b;">au</span>
              <select v-model.number="companyFinMois" style="padding: 0.6rem 0.5rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                <option v-for="(m, i) in moisNoms" :key="i" :value="i + 1">{{ m }}</option>
              </select>
              <input v-model.number="companyFinAnnee" type="number" style="width: 80px; padding: 0.6rem 0.5rem; border-radius: 8px; border: 1px solid #e2e8f0;" />
            </div>
          </div>
          <div class="form-group" style="min-width: 140px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 4px;">SLA Absentéisme (%)</label>
            <input v-model.number="slaAbsenteisme" type="number" min="0" style="width: 100%; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group" style="min-width: 160px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 4px;">SLA Heures Sup (% masse)</label>
            <input v-model.number="slaHeuresSupRatio" type="number" min="0" style="width: 100%; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group" style="min-width: 140px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Seuil Bradford</label>
            <input v-model.number="slaBradford" type="number" min="0" style="width: 100%; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
        </div>

        <div v-if="companyAnalyticsLoading" class="admin-loading" style="padding: 2rem; text-align: center; color: #64748b;">
          Chargement de l'analytique...
        </div>

        <template v-else-if="companyAnalyticsData">
          <div v-if="companyAnalyticsData.totals.moisAvecDonnees === 0" class="empty-state" style="padding: 2rem 1.5rem; text-align: center; background: #f8fafc; border-radius: 12px; border: 1px dashed #e2e8f0;">
            <p style="color: #64748b; margin: 0;">Aucun bulletin généré sur la période sélectionnée.</p>
          </div>

          <template v-else>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px;">
              <div class="kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Masse salariale (brut, année)</div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #0f172a; margin-top: 4px;">{{ fcfa(companyAnalyticsData.totals.masseSalarialeAnnuelle) }}</div>
              </div>
              <div class="kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Coût total employeur</div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #0f172a; margin-top: 4px;">{{ fcfa(companyCoutTotalEmployeur) }}</div>
              </div>
              <div class="kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Charges patronales</div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #0f172a; margin-top: 4px;">{{ companyAnalyticsData.totals.ratioChargesPatronales }}%</div>
              </div>
              <div class="kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; display: flex; align-items: center; justify-content: space-between;">
                  <span>Absentéisme moyen</span>
                  <span v-if="companyAbsenteismeAlert" style="background: #fee2e2; color: #dc2626; padding: 0.1rem 0.4rem; border-radius: 9999px; font-weight: 800; font-size: 0.65rem;">Alerte</span>
                </div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #0f172a; margin-top: 4px;">{{ companyAnalyticsData.totals.tauxAbsenteismeMoyen }}%</div>
              </div>
              <div class="kpi-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; display: flex; align-items: center; justify-content: space-between;">
                  <span>Coût heures sup</span>
                  <span v-if="companyHeuresSupAlert" style="background: #fee2e2; color: #dc2626; padding: 0.1rem 0.4rem; border-radius: 9999px; font-weight: 800; font-size: 0.65rem;">Alerte</span>
                </div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #0f172a; margin-top: 4px;">{{ fcfa(companyAnalyticsData.totals.coutHeuresSupAnnuel) }}</div>
                <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">{{ companyHeuresSupRatioAnnuel }}% de la masse brute</div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                <h4 style="margin: 0 0 8px 0; font-size: 0.9rem; color: #0f172a;">Masse salariale par mois (brut / net)</h4>
                <apexchart type="bar" height="240" :options="companyMasseSalarialeOptions" :series="companyMasseSalarialeSeries"></apexchart>
              </div>
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                <h4 style="margin: 0 0 8px 0; font-size: 0.9rem; color: #0f172a;">Taux d'absentéisme par mois</h4>
                <apexchart type="bar" height="240" :options="companyAbsenteismeOptions" :series="companyAbsenteismeSeries"></apexchart>
              </div>
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                <h4 style="margin: 0 0 8px 0; font-size: 0.9rem; color: #0f172a;">Coût des heures sup par mois (% masse brute)</h4>
                <apexchart type="bar" height="240" :options="companyHeuresSupOptions" :series="companyHeuresSupSeries"></apexchart>
              </div>
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                <h4 style="margin: 0 0 8px 0; font-size: 0.9rem; color: #0f172a;">Masse salariale par poste</h4>
                <apexchart type="bar" :height="Math.max(240, companyByPosteDisplay.length * 34)" :options="companyByPosteOptions" :series="companyByPosteSeries"></apexchart>
              </div>
            </div>

            <div class="mapping-table-container" style="margin-top: 20px;">
              <h4 style="margin: 0 0 8px 0; font-size: 0.9rem; color: #0f172a;">Détail par poste</h4>
              <table class="mapping-table">
                <thead>
                  <tr>
                    <th>Poste</th>
                    <th>Effectif</th>
                    <th>Masse salariale</th>
                    <th>Salaire moyen</th>
                    <th>Min</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in companyAnalyticsData.byPoste" :key="p.poste">
                    <td>{{ p.poste }}</td>
                    <td>{{ p.effectif }}</td>
                    <td>{{ fcfa(p.masseSalariale) }}</td>
                    <td>{{ fcfa(p.salaireMoyen) }}</td>
                    <td>{{ fcfa(p.salaireMin) }}</td>
                    <td>{{ fcfa(p.salaireMax) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mapping-table-container" style="margin-top: 20px;">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
                <h4 style="margin: 0; font-size: 0.9rem; color: #0f172a;">
                  Score Bradford (absentéisme chronique)
                  <span title="Score = (nombre de mois avec au moins un jour d'absence)² × total de jours d'absence sur l'année. Approximation mensuelle : les données ne suivent pas les absences jour par jour, donc ce score est indicatif, pas une mesure clinique du Bradford Factor." style="cursor: help; color: #94a3b8; font-weight: 400; font-size: 0.75rem;">ⓘ</span>
                </h4>
                <input
                  v-model="bradfordSearchQuery"
                  type="text"
                  placeholder="Rechercher un employé..."
                  style="padding: 0.45rem 0.7rem; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 0.825rem; min-width: 220px;"
                />
              </div>
              <table class="mapping-table">
                <thead>
                  <tr>
                    <th>Employé</th>
                    <th>Poste</th>
                    <th>Jours d'absence</th>
                    <th>Mois avec absence</th>
                    <th>Score Bradford</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in bradfordFilteredEmployees" :key="e.matricule">
                    <td><strong>{{ e.nom }} {{ e.prenom }}</strong><div style="font-size: 0.7rem; color: #64748b;">{{ e.matricule }}</div></td>
                    <td>{{ e.poste }}</td>
                    <td>{{ e.totalAbsenceDays }}</td>
                    <td>{{ e.spellsCount }}</td>
                    <td>{{ e.bradfordScore }}</td>
                    <td>
                      <span v-if="e.bradfordScore > slaBradford" style="background: #fee2e2; color: #dc2626; padding: 0.15rem 0.5rem; border-radius: 9999px; font-weight: 700; font-size: 0.7rem;">Alerte</span>
                    </td>
                  </tr>
                  <tr v-if="bradfordFilteredEmployees.length === 0">
                    <td colspan="6" style="text-align: center; color: #64748b; padding: 1.25rem;">Aucun employé ne correspond à la recherche.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </template>
      </div>

      <!-- ════ MODULE BASE LOCALE ════ -->
      <div v-if="activeModule === 'local_db'" class="module-content hr-module-view animate-in">
        <LocalDatabasePanel :country="props.country" />
      </div>

      <!-- ════ MODULE ANNUAIRE EMPLOYÉS ════ -->
      <div v-if="activeModule === 'directory'" class="module-content hr-module-view animate-in">
        <EmployeeDirectory :country="props.country" />
      </div>

      <!-- ════ MODULE PARAMÈTRES ════ -->
      <div v-if="activeModule === 'settings'" class="module-content hr-module-view animate-in">
        <SettingsPanel :country="props.country" @change-country="(c) => emit('change-country', c)" />
      </div>

      <!-- ════ MODULE GÉNÉRATEUR DE DOCUMENTS ════ -->
      <div v-if="activeModule === 'documents'" class="module-content hr-module-view no-pad animate-in">
        <DocumentsGenerator :country="props.country" />
      </div>

      <!-- ════ MODULE ABSENCES & CONGÉS ════ -->
      <div v-if="activeModule === 'conges'" class="module-content hr-module-view no-pad animate-in">
        <CongesManager :country="props.country" />
      </div>

      <!-- ════ MODULE CONTRATS & ALERTES ════ -->
      <div v-if="activeModule === 'contrats'" class="module-content hr-module-view no-pad animate-in">
        <ContratsManager :country="props.country" />
      </div>

      <!-- ════ MODULE ÉVALUATIONS ════ -->
      <div v-if="activeModule === 'evaluations'" class="module-content hr-module-view no-pad animate-in">
        <EvaluationsManager :country="props.country" />
      </div>

      <!-- ════ MODULE FORMATIONS & COMPÉTENCES ════ -->
      <div v-if="activeModule === 'formations'" class="module-content hr-module-view no-pad animate-in">
        <FormationsManager :country="props.country" />
      </div>

      <!-- ════ MODULE PLANNING HEBDOMADAIRE ════ -->
      <div v-if="activeModule === 'planning'" class="module-content hr-module-view no-pad animate-in">
        <PlanningManager :country="props.country" />
      </div>

      <!-- ════ MODULE TABLEAU DE BORD ════ -->
      <div v-if="activeModule === 'dashboard'" class="module-content hr-module-view no-pad animate-in">
        <DashboardManager />
      </div>

    </template>

  </div>
</template>

<style scoped>
.conformity-notice {
  margin-top: 1rem;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-size: 0.8rem;
}
.conformity-notice.identique { background: #ecfdf5; border-color: #6ee7b7; color: #065f46; }
.conformity-notice.ecarts_majeurs { background: #fef2f2; border-color: #fca5a5; color: #7f1d1d; }
.conformity-notice strong { font-size: 0.85rem; }
.conformity-notice p { margin: 6px 0 0; line-height: 1.5; }
.conformity-notice p.grave { font-weight: 600; }
.conformity-notice ul { margin: 8px 0 0; padding-left: 18px; }
.conformity-notice li { margin-bottom: 3px; line-height: 1.45; }
.gravite {
  display: inline-block;
  margin-right: 6px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 0.68rem;
  text-transform: uppercase;
  background: #e2e8f0;
}
.gravite.moyenne { background: #fed7aa; }
.gravite.haute { background: #fecaca; }

.payroll-warning {
  margin-bottom: 1rem;
  padding: 14px 16px;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  color: #7f1d1d;
}
.payroll-warning strong { font-size: 0.88rem; }
.payroll-warning p { margin: 6px 0 8px; font-size: 0.78rem; line-height: 1.5; }
.payroll-warning ul { margin: 0; padding-left: 18px; }
.payroll-warning li { font-size: 0.8rem; margin-bottom: 3px; }
.warn-tag {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #fee2e2;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.warn-more { margin: 6px 0 0; font-style: italic; }
.payroll-warning.stale {
  background: #fffbeb;
  border-color: #fcd34d;
  color: #78350f;
}

.unmapped-notice {
  margin-top: 1rem;
  padding: 12px 14px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  color: #78350f;
}
.unmapped-notice strong { font-size: 0.85rem; }
.unmapped-notice p { margin: 4px 0 8px; font-size: 0.75rem; line-height: 1.4; }
.unmapped-notice ul { margin: 0; padding-left: 18px; }
.unmapped-notice li { font-size: 0.78rem; margin-bottom: 2px; }
.unmapped-label { font-weight: 600; }
.unmapped-sample { color: #92400e; margin-left: 6px; font-size: 0.72rem; }

.fidelity-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 1rem;
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.fidelity-picker label { font-size: 0.8rem; font-weight: 600; color: #374151; }
.fidelity-picker select {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.85rem;
  background: #fff;
  color: #111827;
}
.fidelity-picker small { font-size: 0.72rem; color: #6b7280; line-height: 1.4; }

.hr-wrapper {
  background: #f8fafc;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
  width: 100%;
  min-height: 85vh;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* En dessous de 900px, .desktop-bg gère déjà son propre défilement interne
 * (overflow-y: auto). Avec .hr-wrapper en simple flux de page (min-height),
 * la page elle-même peut aussi défiler dès que le contenu dépasse 85vh : deux
 * zones de scroll imbriquées se disputent alors le geste tactile, et la
 * première carte reste coincée à moitié sous l'en-tête fixe (.hr-page-header,
 * 64px). En figeant .hr-wrapper entre l'en-tête et la barre des tâches, il ne
 * reste qu'une seule zone défilante — celle de .desktop-bg.
 */
@media (max-width: 900px) {
  .hr-wrapper {
    position: fixed;
    top: 64px;
    left: 0;
    right: 0;
    bottom: 0;
    min-height: 0;
    border-radius: 0;
    box-shadow: none;
  }
}

/* ══════════════════════════════════════════
   BUREAU DESKTOP
══════════════════════════════════════════ */
.desktop-bg {
  flex: 1;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: absolute;
  inset: 0;
  bottom: 48px; /* taskbar height */
  z-index: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2rem;
}

/* .desktop-bg centre son contenu (justify-content: center) pour l'aspect
 * "bureau" sur grand écran. Mais quand le contenu dépasse la hauteur
 * disponible — la liste de modules sur mobile — un flex centré déborde de
 * façon symétrique des deux côtés, et le début de la liste (la carte
 * "Import en Masse") se retrouve repoussé dans un décalage négatif que
 * scrollTop ne peut pas atteindre : la carte reste inaccessible, quel que
 * soit le sens du scroll. En alignant au début, tout redevient atteignable
 * par un simple défilement vers le bas. */
@media (max-width: 900px) {
  .desktop-bg {
    justify-content: flex-start;
  }
}

/* Animated Ambient Shapes */
.bg-shape {
  position: absolute;
  filter: blur(100px);
  opacity: 0.6;
  border-radius: 50%;
  animation: floatShape 25s infinite ease-in-out alternate;
}
.shape-1 {
  width: 500px;
  height: 500px;
  background: rgba(56, 189, 248, 0.15); /* Sky blue */
  top: -150px;
  left: -150px;
}
.shape-2 {
  width: 600px;
  height: 600px;
  background: rgba(129, 140, 248, 0.15); /* Indigo */
  bottom: -200px;
  right: -150px;
  animation-delay: -6s;
}
.shape-3 {
  width: 400px;
  height: 400px;
  background: rgba(167, 139, 250, 0.1); /* Violet */
  top: 30%;
  left: 40%;
  animation-delay: -12s;
}

@keyframes floatShape {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(50px, -70px) scale(1.15); }
  100% { transform: translate(-30px, 30px) scale(0.9); }
}

/* Desktop layout grid */
.desktop-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 2.5rem;
  width: 100%;
  max-width: 1200px;
  min-height: min-content;
  z-index: 2;
  align-items: start;
}

@media (max-width: 900px) {
  .desktop-layout {
    grid-template-columns: 1fr;
    align-items: start;
    padding-top: 1rem;
    gap: 1.5rem;
  }
  .desktop-sidebar-widget {
    order: -1; /* Clock on top for mobile */
    align-self: stretch;
  }
  .workspace-card {
    display: none !important;
  }
  .local-directory-fast-option {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 12px !important;
    text-align: center;
  }
  .local-directory-fast-option button {
    width: 100% !important;
    padding: 12px !important;
  }
}

/* Desktop Shortcuts Grid */
.desktop-shortcuts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  grid-auto-rows: min-content;
  align-content: start;
  gap: 1.25rem;
  padding: 0.5rem;
}

.desktop-sidebar-widget {
  align-self: center;
}

/* Shortcut card styling */
.desktop-shortcut-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 16px;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  text-align: left;
  color: #0f172a;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  overflow: hidden;
  width: 100%;
}

.desktop-shortcut-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.3s;
}

.desktop-shortcut-card:hover {
  transform: translateY(-4px) scale(1.02);
  background: rgba(255, 255, 255, 1);
  border-color: var(--shortcut-color, #e2e8f0);
  box-shadow: 0 12px 24px -10px rgba(0, 0, 0, 0.1), 0 0 15px rgba(0, 0, 0, 0.03);
}

.desktop-shortcut-card:hover::before {
  opacity: 1;
}

.shortcut-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
}

.shortcut-icon-wrapper :deep(svg) {
  width: 22px;
  height: 22px;
  color: white;
}

.shortcut-details h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.shortcut-details p {
  margin: 4px 0 0 0;
  font-size: 0.75rem;
  color: #475569;
}

.shortcut-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
}

/* Sidebar widget styling (Clock & Calendar) */
.desktop-sidebar-widget {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.clock-display {
  text-align: center;
  padding: 1rem;
}

.large-time {
  font-size: 3.5rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -2px;
  line-height: 1;
}

.calendar-date {
  font-size: 1rem;
  color: #3b82f6;
  font-weight: 600;
  margin-top: 0.5rem;
}

/* Workspace status card */
.workspace-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.05);
}

.workspace-header {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 1rem;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.workspace-info h4 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
}

.workspace-info p {
  margin: 2px 0 0 0;
  font-size: 0.75rem;
  color: #64748b;
}

.workspace-meta {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 1rem;
}

.meta-row {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
}

.meta-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 8px;
}

.meta-dot.green { background-color: #10b981; }
.meta-dot.purple { background-color: #a78bfa; }
.meta-dot.blue { background-color: #0ea5e9; }

.meta-label {
  color: #64748b;
  font-weight: 500;
  margin-right: 8px;
}

.meta-value {
  color: #0f172a;
  font-weight: 700;
  margin-left: auto;
}

.quick-status-badge {
  margin-top: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.15);
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  color: #34d399;
  font-size: 0.75rem;
  font-weight: 600;
  justify-content: center;
}

.pulsing-dot {
  width: 8px;
  height: 8px;
  background-color: #10b981;
  border-radius: 50%;
  position: relative;
}

.pulsing-dot::after {
  content: '';
  position: absolute;
  top: -4px;
  left: -4px;
  right: -4px;
  bottom: -4px;
  border-radius: 50%;
  background-color: #10b981;
  opacity: 0.4;
  animation: pulseDot 2s infinite;
}

@keyframes pulseDot {
  0% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.5); opacity: 0; }
  100% { transform: scale(0.8); opacity: 0; }
}

/* ══════════════════════════════════════════
   MENU DÉMARRER (START MENU)
══════════════════════════════════════════ */
.start-menu-overlay {
  position: fixed;
  inset: 0;
  bottom: 48px;
  z-index: 9998;
  background: transparent;
}

.start-menu {
  position: fixed;
  bottom: 48px;
  left: 0;
  width: 320px;
  height: 450px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border-right: 1px solid #e2e8f0;
  border-top: 1px solid #e2e8f0;
  border-top-right-radius: 8px;
  z-index: 9999;
  display: flex;
  transform: translateY(110%);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
}

.start-menu.open {
  transform: translateY(0);
}

.start-menu-sidebar {
  width: 48px;
  background: rgba(248, 250, 252, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 8px;
  justify-content: flex-end;
  border-right: 1px solid #e2e8f0;
}

.sm-sidebar-btn {
  width: 48px;
  height: 48px;
  background: transparent;
  border: none;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.sm-sidebar-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.start-menu-content {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
}

.sm-title {
  color: #0f172a;
  font-size: 0.95rem;
  margin: 0 0 1rem 0;
  font-weight: 600;
}

.sm-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.sm-tile {
  background: #3b82f6;
  border: none;
  border-radius: 4px;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  color: white;
  cursor: pointer;
  padding: 0.75rem;
  transition: transform 0.2s, filter 0.2s;
}

.sm-tile:hover {
  filter: brightness(1.1);
  transform: scale(0.98);
}

.sm-tile-icon {
  width: 28px;
  height: 28px;
  margin-bottom: 6px;
}
.sm-tile-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.sm-tile-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-align: left;
  line-height: 1.2;
}

/* ══════════════════════════════════════════
   BARRE DES TÂCHES (TASKBAR)
══════════════════════════════════════════ */
.taskbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: #ffffff;
  display: flex;
  align-items: center;
  padding: 0 8px;
  z-index: 10000;
  border-top: 1px solid #e2e8f0;
}

.taskbar-start-btn {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.taskbar-start-btn:hover, .taskbar-start-btn.active {
  background: #f1f5f9;
}

.taskbar-start-btn:active {
  transform: scale(0.95);
}

.taskbar-divider {
  width: 1px;
  height: 24px;
  background: #e2e8f0;
  margin: 0 8px;
}

.taskbar-app-btn {
  height: 40px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid #3b82f6;
}

.taskbar-app-icon {
  width: 16px;
  height: 16px;
}
.taskbar-app-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.animate-in {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Ensure active modules take remaining space above taskbar and can scroll.
 * `.hr-wrapper` clips overflow and — on mobile — is pinned to the exact
 * viewport slice between the header and the taskbar (see its rule above),
 * so each module view must own its own scroll region rather than relying on
 * outer page scroll (previously targeted via the invalid selector
 * `.hr-wrapper > template > div`, which never matches: Vue's `<template
 * v-if>` doesn't render an actual DOM node, so its children land as direct
 * children of `.hr-wrapper` and that rule silently applied to nothing). */
.hr-module-view {
  height: calc(100% - 48px); /* space for taskbar */
  overflow-y: auto;
  position: relative;
  z-index: 2;
}

.hr-home-intro {
  text-align: center;
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.hr-home-intro h2 {
  margin: 0 0 0.4rem;
  font-size: 1.4rem;
  font-weight: 800;
  color: #1e293b;
}

.hr-home-intro p {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
}

/* Annonce SaaS Pro RH */
.saas-pro-banner {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
  color: white;
  border-radius: 14px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 4px 12px rgba(49, 46, 129, 0.2);
  flex-wrap: wrap;
}
.saas-pro-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.saas-pro-icon {
  font-size: 1.8rem;
}
.saas-pro-content strong {
  display: block;
  font-size: 0.95rem;
  color: #a5b4fc;
}
.saas-pro-content p {
  margin: 0.2rem 0 0 0;
  font-size: 0.8rem;
  color: #e0e7ff;
  max-width: 600px;
}
.saas-pro-tag {
  font-size: 0.7rem;
  font-weight: 800;
  background: #4f46e5;
  color: #e0e7ff;
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  border: 1px solid #818cf8;
  white-space: nowrap;
}

/* Grille des 6 cartes (3 en haut, 3 en bas) */
.feature-cards-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 900px) {
  .feature-cards-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
  }
}

.feature-card {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem;
  background: white;
  border: 1.5px solid #e2e8f0;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.feature-card::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.25s;
}

.feature-card:hover {
  transform: translateY(-3px);
  border-color: transparent;
  box-shadow: 0 12px 30px -8px rgba(0, 0, 0, 0.15);
}

.feature-card:hover::before {
  opacity: 0.03;
}

@media (min-width: 900px) {
  .feature-card {
    flex-direction: column;
    height: 100%;
  }
}

.feature-card-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.feature-card-body {
  flex: 1;
}

.feature-card-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.15rem;
}

.feature-card-body h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #1e293b;
}

.feature-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}

.feature-card-subtitle {
  margin: 0 0 0.5rem;
  font-size: 0.775rem;
  color: #64748b;
  font-weight: 600;
}

.feature-card-desc {
  margin: 0 0 0.85rem;
  font-size: 0.82rem;
  color: #475569;
  line-height: 1.5;
}

/* Mini stepper en bas de la carte */
.feature-steps-preview {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.feature-step-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: white;
  font-size: 0.6rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.feature-steps-label {
  font-size: 0.68rem;
  color: #94a3b8;
  font-weight: 500;
}

.feature-card-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.2s;
}

.feature-card:hover .feature-card-arrow {
  transform: translateX(4px);
}

@media (min-width: 900px) {
  .feature-card-arrow {
    position: absolute;
    right: 1.15rem;
    top: 1.15rem;
  }
}

/* ══════════════════════════════════════════
   MODULE HEADER (sous-nav quand module ouvert)
══════════════════════════════════════════ */
.module-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.module-back-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0.4rem 0.85rem;
  background: white;
  color: #475569;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.module-back-btn:hover {
  background: #f1f5f9;
  transform: translateX(-2px);
}

.module-header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.module-header-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.module-header-title strong {
  display: block;
  font-size: 0.9rem;
  color: #1e293b;
  font-weight: 800;
}

.module-header-title span {
  font-size: 0.75rem;
  color: #64748b;
}

/* ══════════════════════════════════════════
   SIMULATION TYPE CHOOSER
══════════════════════════════════════════ */
.sim-type-chooser {
  padding: 1.5rem;
}

.sim-type-intro {
  text-align: center;
  margin-bottom: 1.75rem;
}

.sim-type-intro h3 {
  margin: 0 0 0.4rem;
  font-size: 1.15rem;
  font-weight: 800;
  color: #1e293b;
}

.sim-type-intro p {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
}

.sim-type-cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

@media (min-width: 640px) {
  .sim-type-cards { flex-direction: row; }
}

.sim-type-card {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem;
  background: white;
  border: 1.5px solid #e2e8f0;
  border-radius: 16px;
  cursor: pointer;
  text-align: left;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.sim-type-card:hover {
  transform: translateY(-3px);
  border-color: transparent;
  box-shadow: 0 12px 30px -8px rgba(0, 0, 0, 0.15);
}

.sim-type-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.sim-type-body { flex: 1; }

.sim-type-badge {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
  margin-bottom: 0.5rem;
}

.sim-type-body h4 {
  margin: 0 0 0.4rem;
  font-size: 1rem;
  font-weight: 800;
  color: #1e293b;
}

.sim-type-body > p {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.5;
}

.sim-type-features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sim-type-features li {
  font-size: 0.75rem;
  color: #475569;
  font-weight: 500;
}

.sim-type-arrow {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  transition: transform 0.2s;
}

.sim-type-card:hover .sim-type-arrow { transform: translateX(4px); }

.sim-breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1.25rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.sim-back {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0.3rem 0.8rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.sim-back:hover { background: #f1f5f9; transform: translateX(-2px); }

.sim-bread-type {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
}

/* ══════════════════════════════════════════
   MODULE CONTENT
══════════════════════════════════════════ */
.module-content {
  padding: 1.5rem;
}
.module-content.no-pad {
  padding: 0;
}

/* ══════════════════════════════════════════
   IMPORT STEPPER
══════════════════════════════════════════ */
.import-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: 2rem;
  padding: 1rem 0;
}

.import-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.import-step-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 800;
  transition: all 0.3s;
}

.import-step.active .import-step-circle {
  background: #059669;
  color: white;
  box-shadow: 0 0 0 4px rgba(5, 150, 105, 0.15);
}

.import-step.done .import-step-circle {
  background: #16a34a;
  color: white;
}

.import-step span:last-child {
  font-size: 0.65rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
}

.import-step.active span:last-child {
  color: #059669;
}

.import-step-line {
  flex: 1;
  height: 2px;
  background: #e2e8f0;
  min-width: 40px;
  max-width: 80px;
  margin-bottom: 18px;
}

/* ══════════════════════════════════════════
   IMPORT INTRO
══════════════════════════════════════════ */


.import-intro {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  margin-bottom: 1.25rem;
}

.intro-icon-wrap {
  width: 42px;
  height: 42px;
  background: #dcfce7;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.import-intro strong {
  color: #166534;
  font-size: 0.9rem;
  display: block;
  margin-bottom: 0.25rem;
}

.import-intro p {
  margin: 0;
  font-size: 0.8rem;
  color: #15803d;
}

/* ══════════════════════════════════════════
   STEP NAV
══════════════════════════════════════════ */
.step-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid #e2e8f0;
  gap: 0.75rem;
}

.btn-prev {
  padding: 0.6rem 1.25rem;
  background: white;
  color: #475569;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-prev:hover {
  background: #f1f5f9;
}

.btn-next {
  padding: 0.7rem 1.5rem;
  background: linear-gradient(135deg, #064e3b 0%, #059669 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);
}

.btn-next:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(5, 150, 105, 0.35);
}

.btn-next:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

/* Launch summary */
.launch-summary {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  font-size: 0.85rem;
  border-bottom: 1px solid #e2e8f0;
}

.summary-row:last-child {
  border-bottom: none;
}

.summary-label {
  color: #64748b;
  font-weight: 600;
}

.summary-value {
  font-weight: 700;
  font-size: 0.8rem;
}

.summary-value.ok { color: #16a34a; }
.summary-value.neutral { color: #94a3b8; }

/* ══════════════════════════════════════════
   UPLOAD
══════════════════════════════════════════ */
.upload-zone {
  border: 2.5px dashed #cbd5e1;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  position: relative;
  transition: all 0.2s;
  background: #f8fafc;
  cursor: pointer;
}
.upload-zone:hover, .upload-zone.dragging { border-color: #059669; background: #f0fdf4; }
.upload-zone.has-file { border-style: solid; border-color: #6ee7b7; background: #f0fdf4; padding: 1rem; }
.upload-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.upload-icon { color: #059669; margin-bottom: 0.75rem; }
.upload-text { font-weight: 600; color: #374151; margin: 0 0 0.25rem; }
.upload-hint { font-size: 0.8rem; color: #64748b; margin: 0; }

.file-info { display: flex; align-items: center; gap: 0.75rem; text-align: left; }
.file-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.file-icon.excel { background: #dcfce7; color: #16a34a; }
.file-details { flex: 1; }
.file-name { display: block; font-weight: 700; font-size: 0.875rem; color: #1e293b; }
.file-size { font-size: 0.75rem; color: #64748b; }
.file-remove { background: none; border: none; cursor: pointer; color: #94a3b8; padding: 0.25rem; border-radius: 4px; transition: color 0.2s; }
.file-remove:hover { color: #ef4444; }
.file-remove.small { padding: 0.1rem; }

/* TEMPLATE */
.builtin-style-picker { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; font-size: 0.85rem; color: #475569; }
.builtin-style-picker select { border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.4rem 0.6rem; font-size: 0.85rem; color: #334155; background: white; }
.template-zone { border: 1.5px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
.template-empty { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; background: #f8fafc; cursor: pointer; color: #2563eb; font-weight: 600; font-size: 0.875rem; position: relative; transition: background 0.2s; }
.template-empty:hover { background: #eff6ff; }
.template-empty input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.template-filled { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1rem; background: #f0f7ff; }
.word-icon { width: 28px; height: 28px; background: #2b579a; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.8rem; }
.template-name { flex: 1; font-size: 0.875rem; font-weight: 600; color: #1e293b; }
.template-vars { margin-top: 0.75rem; font-size: 0.72rem; color: #64748b; line-height: 1.8; }
.template-vars code { background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 4px; color: #0f172a; font-family: monospace; font-size: 0.7rem; margin-right: 0.25rem; }

.optional-badge { font-size: 0.7rem; color: #64748b; font-weight: 500; background: #f1f5f9; padding: 0.1rem 0.5rem; border-radius: 20px; }

/* LAUNCH BUTTON */
.btn-launch {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #064e3b, #059669);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35);
}
.btn-launch:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(5, 150, 105, 0.4); }
.btn-launch:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

.mode-badge { background: rgba(255,255,255,0.2); padding: 0.15rem 0.6rem; border-radius: 20px; font-size: 0.75rem; }
.flex-center { display: flex; align-items: center; justify-content: center; }
.gap-2 { gap: 0.5rem; }
.result-icon.spin svg { animation: spin 2s linear infinite; color: #3b82f6; }
@keyframes spin { 100% { transform: rotate(360deg); } }

/* MAPPING UI */
.mapping-warning {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem;
  background: #fef2f2;
  border: 1.5px solid #fecaca;
  border-radius: 12px;
  margin-bottom: 1rem;
}
.mapping-warning-icon {
  flex-shrink: 0;
  margin-top: 2px;
}
.mapping-warning strong {
  display: block;
  color: #991b1b;
  font-size: 0.95rem;
  margin-bottom: 0.3rem;
}
.mapping-warning p {
  margin: 0 0 0.75rem;
  color: #b91c1c;
  font-size: 0.82rem;
  line-height: 1.5;
}
.btn-change-file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0.45rem 1rem;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-change-file:hover {
  background: #b91c1c;
}

.detected-headers {
  margin: 0.75rem 0;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.detected-headers small {
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 600;
}
.header-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.4rem;
}
.header-tag {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  background: #e0e7ff;
  color: #3730a3;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 4px;
}

.mapping-table-container {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  margin-top: 1rem;
}
.mapping-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.mapping-table th {
  background: #f8fafc;
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}
.mapping-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: middle;
}
.mapping-table tr:last-child td {
  border-bottom: none;
}
.mapping-row-error {
  background: #fff5f5;
}
.mapping-select {
  padding: 0.4rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: white;
  width: 100%;
  max-width: 250px;
  font-size: 0.8rem;
  color: #1e293b;
}
.mapping-select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37,99,235,0.1);
}
.required-asterisk {
  color: #ef4444;
  margin-left: 2px;
}
.mapped-badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  background: #dcfce7;
  color: #16a34a;
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: 4px;
}
.unmapped-badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  background: #fef2f2;
  color: #dc2626;
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: 4px;
  border: 1px solid #fecaca;
}
.optional-badge-small {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  background: #f1f5f9;
  color: #94a3b8;
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 4px;
}
.mapping-error-msg {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding: 0.65rem 1rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  color: #92400e;
  font-size: 0.8rem;
  font-weight: 600;
}

/* RÉSULTATS */
.result-success { margin-top: 1.25rem; padding: 1.25rem; background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; color: #166534; }
.result-icon { color: #16a34a; flex-shrink: 0; }
.result-text { flex: 1; min-width: 150px; }
.result-text h4 { margin: 0 0 0.2rem; font-size: 0.95rem; }
.result-text p { margin: 0; font-size: 0.8rem; opacity: 0.8; }
.btn-download { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.6rem 1.25rem; background: #16a34a; color: white; text-decoration: none; border: none; border-radius: 8px; font-weight: 700; font-size: 0.85rem; transition: background 0.2s; cursor: pointer; }
.btn-download:hover { background: #15803d; }
.btn-download:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-restart { background: none; border: none; text-decoration: underline; color: #166534; cursor: pointer; font-size: 0.8rem; }
.result-error { margin-top: 1.25rem; padding: 1rem; background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 12px; display: flex; align-items: flex-start; gap: 0.75rem; color: #991b1b; }
.result-error strong { display: block; margin-bottom: 0.2rem; font-size: 0.9rem; }
.result-error p { margin: 0; font-size: 0.8rem; }

/* MODEL DOWNLOAD */
.model-download-row { margin-top: 1rem; text-align: center; }
.model-link { display: inline-flex; align-items: center; gap: 0.4rem; color: #059669; font-size: 0.85rem; text-decoration: none; font-weight: 600; border-bottom: 1.5px dashed #059669; padding-bottom: 1px; transition: all 0.2s; }
.model-link:hover { border-bottom-style: solid; color: #047857; }

/* SHEET PICKER (fichiers Excel multi-feuilles) */
.sheet-picker-box {
  margin-top: 1.25rem;
  padding: 1rem 1.25rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 12px;
}
.sheet-picker-box strong { display: block; color: #92400e; font-size: 0.9rem; }
.sheet-picker-box p { margin: 0.25rem 0 0.75rem 0; color: #78350f; font-size: 0.85rem; }
.sheet-picker-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.sheet-picker-btn {
  background: #ffffff;
  border: 1px solid #fbbf24;
  color: #92400e;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}
.sheet-picker-btn:hover:not(:disabled) { background: #fef3c7; }
.sheet-picker-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* AI MAPPING BADGE */
.ai-mapping-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 0.5rem;
  background: #eef2ff;
  color: #4f46e5;
  border: 1px solid #c7d2fe;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.6rem;
  border-radius: 9999px;
  vertical-align: middle;
}
.ai-mapping-badge-loading {
  background: #f1f5f9;
  color: #64748b;
  border-color: #e2e8f0;
}

/* VARIABLES GUIDE PRO */
.vars-guide {
  margin-top: 1.25rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}
.vars-guide-header {
  padding: 1rem 1.25rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.vars-guide-header strong {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: #1e293b;
}
.vars-guide-header p {
  margin: 0.3rem 0 0;
  font-size: 0.78rem;
  color: #64748b;
}
.vars-category {
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
}
.vars-category:last-of-type { border-bottom: none; }
.vars-cat-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
  margin-bottom: 0.5rem;
}
.vars-cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.vars-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.var-chip {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: 'Courier New', monospace;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}
.var-chip:hover {
  background: #dbeafe;
  border-color: #93c5fd;
  transform: translateY(-1px);
}
.var-chip.green { background: #f0fdf4; color: #16a34a; }
.var-chip.green:hover { background: #dcfce7; border-color: #86efac; }
.var-chip.red { background: #fef2f2; color: #dc2626; }
.var-chip.red:hover { background: #fee2e2; border-color: #fca5a5; }
.var-chip.orange { background: #fffbeb; color: #d97706; }
.var-chip.orange:hover { background: #fef3c7; border-color: #fde68a; }
.var-chip.purple { background: #eef2ff; color: #6366f1; }
.var-chip.purple:hover { background: #e0e7ff; border-color: #a5b4fc; }

.vars-tip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1.25rem;
  background: #f0fdf4;
  font-size: 0.75rem;
  color: #166534;
  border-top: 1px solid #e2e8f0;
}

.copy-toast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.6rem 1.25rem;
  background: #1e293b;
  color: white;
  font-size: 0.82rem;
  font-weight: 600;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  z-index: 1000;
}

/* PDF EDITOR (DRAG & DROP) */
.pdf-editor-layout {
  display: flex;
  gap: 1.5rem;
  margin-top: 1.5rem;
  align-items: flex-start;
}
.pdf-vars-sidebar {
  width: 250px;
  flex-shrink: 0;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
  max-height: 500px;
  overflow-y: auto;
}
.pdf-vars-sidebar strong {
  display: block;
  font-size: 0.85rem;
  color: #1e293b;
  margin-bottom: 0.8rem;
}
.pdf-var-draggable {
  display: inline-block;
  padding: 0.35rem 0.6rem;
  margin: 0.2rem;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: 'Courier New', monospace;
  border-radius: 5px;
  cursor: grab;
  border: 1px dashed #93c5fd;
}
.pdf-var-draggable:active {
  cursor: grabbing;
}
.pdf-var-draggable.green { background: #f0fdf4; color: #16a34a; border-color: #86efac; }
.pdf-var-draggable.red { background: #fef2f2; color: #dc2626; border-color: #fca5a5; }
.pdf-var-draggable.purple { background: #eef2ff; color: #6366f1; border-color: #a5b4fc; }

.pdf-canvas-container {
  flex: 1;
  position: relative;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  background: #f1f5f9;
  overflow: auto;
  min-height: 400px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}
.pdf-canvas {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  margin: 1rem;
  transform-origin: top left;
}
.pdf-dropped-var {
  position: absolute;
  transform: translate(-50%, -50%);
  background: rgba(37, 99, 235, 0.9);
  color: white;
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  font-family: 'Courier New', monospace;
  font-weight: bold;
  border-radius: 4px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 10;
}
.pdf-dropped-var:hover {
  background: rgba(220, 38, 38, 0.9);
}
.remove-var {
  font-size: 0.8rem;
  font-weight: bold;
}

.pdf-ai-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}
.btn-ai-automap {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #a855f7, #6366f1);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  transition: all 0.2s;
}
.btn-ai-automap:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
}
.btn-ai-automap:disabled {
  opacity: 0.7;
  cursor: wait;
}
.ai-success-toast {
  color: #16a34a;
  font-weight: 600;
  font-size: 0.85rem;
  background: #f0fdf4;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  border: 1px solid #bbf7d0;
}
.pdf-canvas-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-in { animation: slideIn 0.3s ease-out; }

/* Responsive overrides for Mapping Step */
@media (max-width: 640px) {
  .mapping-table-container {
    border: none !important;
    background: transparent !important;
    margin-top: 0.5rem !important;
  }
  
  .mapping-table, .mapping-table tbody, .mapping-table tr, .mapping-table td {
    display: block !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  
  .mapping-table thead {
    display: none !important;
  }
  
  .mapping-table tr {
    background: white !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 12px !important;
    padding: 14px !important;
    margin-bottom: 12px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.02) !important;
  }
  
  .mapping-table td {
    padding: 0 !important;
    border-bottom: none !important;
    text-align: left !important;
  }
  
  /* Label and asterisk */
  .mapping-table tr td:first-child {
    font-weight: 700 !important;
    font-size: 0.9rem !important;
    color: #1e293b !important;
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
  }
  
  /* Dropdown container */
  .mapping-table tr td:nth-child(2) {
    margin-top: 4px !important;
  }
  
  .mapping-select {
    max-width: 100% !important;
    width: 100% !important;
    height: 42px !important;
    padding: 8px 12px !important;
    font-size: 0.85rem !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 8px !important;
  }
  
  /* Badges - Status (Requis / Optionnel) */
  .mapping-table tr td:last-child {
    order: -1 !important; /* Put status badge at the top right/left of card */
    display: inline-flex !important;
    width: auto !important;
    align-self: flex-start !important;
  }
  
  .mapped-badge, .unmapped-badge, .optional-badge-small {
    font-size: 0.75rem !important;
    padding: 3px 8px !important;
  }
  
  /* Step navigation buttons on mobile */
  .step-nav {
    flex-direction: row !important;
    gap: 8px !important;
    padding-top: 1rem !important;
    margin-top: 1rem !important;
  }
  
  .step-nav button {
    flex: 1 !important;
    padding: 10px 8px !important;
    font-size: 0.8rem !important;
    white-space: nowrap !important;
    height: 42px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
}

/* Espace RH access control / locking styles */
.locked-shortcut {
  opacity: 0.6 !important;
  filter: grayscale(0.8) !important;
  transition: all 0.3s ease;
}
.locked-shortcut:hover {
  opacity: 0.85 !important;
  filter: grayscale(0.4) !important;
  transform: translateY(-2px) scale(1.01) !important;
  border-color: rgba(245, 158, 11, 0.4) !important;
}
.locked-shortcut .shortcut-icon-wrapper {
  background: #334155 !important;
  box-shadow: none !important;
}
.shortcut-badge.pro-badge {
  background: rgba(245, 158, 11, 0.18) !important;
  color: #fdba74 !important;
  border: 1px solid rgba(245, 158, 11, 0.3) !important;
  font-weight: 800 !important;
  font-size: 0.65rem !important;
}
.locked-tile {
  opacity: 0.65 !important;
  filter: grayscale(0.8) !important;
}
.locked-sidebar-btn {
  opacity: 0.5 !important;
  filter: grayscale(1) !important;
}
</style>
