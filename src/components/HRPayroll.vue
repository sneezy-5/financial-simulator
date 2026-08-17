<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import PayslipSimulator from './PayslipSimulator.vue'
import SoldeCompteSimulator from './SoldeCompteSimulator.vue'
import LocalDatabasePanel from './LocalDatabasePanel.vue'
import EmployeeDirectory from './EmployeeDirectory.vue'
import SettingsPanel from './SettingsPanel.vue'
import { getCountryRules } from '../services/countryConfig.js'
import { localDb } from '../services/localDatabase.js'
import { showToast } from '../services/toast.js'
import { user, fetchMe } from '../services/auth.js'

onMounted(() => {
  // Load pdf.js dynamically for the visual template editor
  if (!document.getElementById('pdfjs-lib')) {
    const script = document.createElement('script')
    script.id = 'pdfjs-lib'
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }
    document.head.appendChild(script)
  }
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

const isPro = computed(() => !!user.value)

// ═══ SIMULATION - Type Bulletin ═══
// null = choix du type | 'habituel' | 'conges'
const simulationType = ref('habituel')

// ═══ NAVIGATION ═══
// null = bureau | 'import' | 'simulation' | 'solde' | etc.
const activeModule = ref(null)
const hrWrapperRef = ref(null)

const setModuleSafe = (modVal, typeVal = null) => {
  const proModules = ['import', 'solde', 'local_db', 'directory', 'settings']
  let targetMod = modVal
  let targetType = typeVal

  if (targetMod === 'simulation_habituel') {
    targetMod = 'simulation'
    targetType = 'habituel'
  } else if (targetMod === 'simulation_conges') {
    targetMod = 'simulation'
    targetType = 'conges'
  }

  if (proModules.includes(targetMod) && !isPro.value) {
    targetMod = 'simulation'
    targetType = 'habituel'
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
  const proModules = ['import', 'solde', 'local_db', 'directory', 'settings']
  if (proModules.includes(modId) && !isPro.value) {
    showToast("Cette fonctionnalité est réservée aux abonnés ONDA RH Pro. Veuillez vous connecter.", "error")
    emit('require-auth')
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

// --- CUSTOM TEMPLATE ---
const pdfCanvas = ref(null)
const htmlTemplate = ref(null)
const draggedVar = ref(null)

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
    
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setTimeout(() => renderPdfCanvas(file), 100)
    }
  }
}

const renderPdfCanvas = (file) => {
  if (!window.pdfjsLib) {
    showToast("La librairie PDF est en cours de chargement, veuillez réessayer dans quelques secondes.", 'error')
    return
  }
  
  const fileReader = new FileReader()
  fileReader.onload = async function() {
    const typedarray = new Uint8Array(this.result)
    const pdf = await window.pdfjsLib.getDocument(typedarray).promise
    const page = await pdf.getPage(1)
    
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = pdfCanvas.value
    if (!canvas) return
    const context = canvas.getContext('2d')
    canvas.height = viewport.height
    canvas.width = viewport.width
    
    await page.render({ canvasContext: context, viewport: viewport }).promise
  }
  fileReader.readAsArrayBuffer(file)
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

const wrappedHtmlTemplate = computed(() => {
  if (!htmlTemplate.value) return ''
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <script src="https://cdn.tailwindcss.com"><\/script>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: white; color: #1f2937; margin: 0; text-align: left; }
      <\/style>
    </head>
    <body class="p-8">
      ${htmlTemplate.value}
    </body>
    </html>
  `
})

const autoMapPdf = async () => {
  if (!pdfCanvas.value) return
  
  aiMappingLoading.value = true
  aiMappingSuccess.value = false
  
  try {
    const token = localStorage.getItem('auth_token')
    
    if (!token) {
      throw new Error("Vous devez être connecté pour utiliser l'Intelligence Artificielle.")
    }

    const imageBase64 = pdfCanvas.value.toDataURL('image/jpeg', 0.8)

    const response = await fetch('/api/rh/analyze-pdf-template', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ imageBase64 })
    })
    
    const result = await response.json()
    
    if (!response.ok) {
      if (response.status === 402) {
        throw new Error("Crédits insuffisants. Veuillez recharger votre compte en cliquant sur votre solde en haut à droite.")
      }
      throw new Error(result.error || "Erreur lors de l'analyse IA")
    }

    if (result.htmlTemplate) {
      htmlTemplate.value = result.htmlTemplate
      aiMappingSuccess.value = true
    } else {
      showToast("Erreur lors de l'analyse : " + (result.error || "Réponse invalide"), 'error')
    }
  } catch (e) {
    console.error(e)
    showToast("Erreur de connexion au serveur d'IA.", 'error')
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

const standardFields = [
  { key: 'nom', label: 'Nom Complet', required: true, keywords: ['nom', 'name', 'salarie', 'salarié'] },
  { key: 'prenom', label: 'Prénom', required: false, keywords: ['prenom', 'prénom', 'first'] },
  { key: 'matricule', label: 'Matricule', required: false, keywords: ['matricule', 'id', 'numéro'] },
  { key: 'salaire_base', label: 'Salaire de Base', required: true, keywords: ['salaire', 'base', 'brut', 'mensuel'] },
  { key: 'prime_transport', label: 'Prime de Transport', required: false, keywords: ['transport', 'deplacement'] },
  { key: 'prime_logement', label: 'Prime de Logement', required: false, keywords: ['logement', 'loyer'] },
  { key: 'heures_sup_nb', label: 'Heures Supplémentaires (Nb)', required: false, keywords: ['heure', 'sup', 'hs'] }
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

const analyzeFileHeaders = async () => {
  if (!file.value) return
  uploading.value = true
  error.value = null
  const formData = new FormData()
  formData.append('file', file.value)
  try {
    const res = await fetch('/api/rh/extract-headers', { method: 'POST', body: formData })
    const data = await res.json()
    if (!data.success) throw new Error(data.error)
    fileHeaders.value = data.headers
    autoMapHeaders()
    importStep.value = 2 // Move to mapping step
  } catch(e) {
    error.value = e.message
  } finally {
    uploading.value = false
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
  } else {
    htmlTemplate.value = null
  }
  
  localEmployees.value = emps
  useLocalDb.value = true
  file.value = { name: `Annuaire Local (${emps.length} employés)` }
  goToImportStep(4)
}

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
  }
  
  if (templateFile.value) {
    formData.append('template', templateFile.value)
  }
  if (htmlTemplate.value) {
    formData.append('htmlTemplate', htmlTemplate.value)
  }
  formData.append('country', props.country)
  
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
      if (user.value && result.value.creditsRemaining !== undefined) {
        user.value.credits = result.value.creditsRemaining
      }
      if (result.value.stats) {
        await localDb.savePayrollRun({
          ...result.value.stats,
          country: props.country
        })
      }
      try {
        await fetchMe()
      } catch (fetchErr) {
        console.warn("Erreur rafraîchissement utilisateur:", fetchErr)
      }
    }
  } catch (e) {
    error.value = e.message
  } finally {
    uploading.value = false
  }
}

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

// Step actuel pour le module import
const importStep = ref(1)

const goToImportStep = (step) => {
  importStep.value = step
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

const modules = computed(() => [
  {
    id: 'simulation_habituel',
    title: 'Simuler un Bulletin (' + countryRules.value.name + ')',
    subtitle: 'Bulletin mensuel simple',
    description: `Calculez et générez un bulletin de paie mensuel standard conforme au droit du travail (${countryRules.value.name}).`,
    icon: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`,
    color: '#2563eb',
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
    badge: 'Temps réel',
    steps: ['Entreprise', 'Employé', 'Salaire', 'Paiement']
  },
  {
    id: 'simulation_conges',
    title: 'Calcul de Congés (' + countryRules.value.name + ')',
    subtitle: 'Indemnités de congés',
    description: `Calculez l'allocation et les indemnités de congés payés de vos employés (${countryRules.value.name}).`,
    icon: `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/>`,
    color: '#0d9488',
    gradient: 'linear-gradient(135deg, #115e59 0%, #0d9488 100%)',
    badge: 'Allocation congés',
    steps: ['Entreprise', 'Employé', 'Congés', 'Calcul']
  },
  {
    id: 'import',
    title: 'Import en Masse',
    subtitle: 'Traitement Excel',
    description: `Importez votre fichier Excel pour générer les bulletins (${countryRules.value.name}) de tous vos employés.`,
    icon: `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/>`,
    color: '#059669',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
    badge: 'Multi-employés',
    steps: ['Données', 'Mapping', 'Modèle', 'Génération']
  },
  {
    id: 'solde',
    title: 'Solde de Tout Compte',
    subtitle: 'Fin de contrat',
    description: `Calculez l'indemnité de fin de contrat selon le Code du Travail (${countryRules.value.name}).`,
    icon: `<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>`,
    color: '#d97706',
    gradient: 'linear-gradient(135deg, #78350f 0%, #d97706 100%)',
    badge: 'Fin de contrat',
    steps: ['Entreprise', 'Employé', 'Calcul']
  },
  {
    id: 'local_db',
    title: 'Base Locale & PWA',
    subtitle: 'Confidentialité Totale',
    description: `Stockez vos employés et historiques 100% en local sur votre appareil (IndexedDB / Offline-First).`,
    icon: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>`,
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #3b0764 0%, #7c3aed 100%)',
    badge: '100% Confidentiel',
    steps: ['Base Locale', 'PWA Offline', 'Sauvegarde']
  },
  {
    id: 'directory',
    title: 'Annuaire Employés',
    subtitle: 'Gestion des Salariés',
    description: `Gérez vos employés, importez depuis Excel et modifiez les salaires individuellement.`,
    icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>`,
    color: '#0ea5e9',
    gradient: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)',
    badge: 'CRUD Employés',
    steps: ['Liste', 'Import Excel', 'Édition']
  },
  {
    id: 'settings',
    title: 'Paramètres & Modèles',
    subtitle: 'Configuration RH',
    description: `Configurez vos modèles PDF personnalisés, le mapping et la planification automatique de paie.`,
    icon: `<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>`,
    color: '#64748b',
    gradient: 'linear-gradient(135deg, #334155 0%, #64748b 100%)',
    badge: 'Configuration',
    steps: ['Modèles PDF', 'Planification']
  }
])

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
            :class="{ 'locked-shortcut': ['import', 'solde', 'local_db', 'directory', 'settings'].includes(mod.id) && !isPro }"
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
            <div class="shortcut-badge pro-badge" v-if="['import', 'solde', 'local_db', 'directory', 'settings'].includes(mod.id) && !isPro">🔒 PRO</div>
            <div class="shortcut-badge" v-else-if="mod.badge">{{ mod.badge }}</div>
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

            <button 
              v-if="!isPro" 
              @click="emit('require-auth')" 
              style="margin-top: 1.15rem; width: 100%; padding: 0.65rem 1rem; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; border: none; border-radius: 10px; font-weight: 700; font-size: 0.775rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.35rem; box-shadow: 0 4px 10px rgba(99, 102, 241, 0.25); transition: all 0.2s;"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              Débloquer la version Pro RH
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- ═══ MENU DÉMARRER (START MENU) ═══ -->
    <div class="start-menu-overlay" v-if="isStartMenuOpen" @click="isStartMenuOpen = false"></div>
    <div class="start-menu" :class="{ 'open': isStartMenuOpen }">
      <div class="start-menu-sidebar">
        <button class="sm-sidebar-btn" :class="{ 'locked-sidebar-btn': !isPro }" title="Paramètres" @click="openModule('settings')">
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
            :class="{ 'locked-tile': ['import', 'solde', 'local_db', 'directory', 'settings'].includes(mod.id) && !isPro }"
            :style="{ background: ['import', 'solde', 'local_db', 'directory', 'settings'].includes(mod.id) && !isPro ? '#475569' : mod.color }"
            @click="openModule(mod.id)"
          >
            <div class="sm-tile-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="mod.icon"></svg>
            </div>
            <div class="sm-tile-title">
              <template v-if="['import', 'solde', 'local_db', 'directory', 'settings'].includes(mod.id) && !isPro">🔒 </template>
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
      <div v-if="activeModule === 'simulation'" class="animate-in">
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
      <div v-if="activeModule === 'import'" class="module-content animate-in">

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
          <div class="step-nav">
            <div></div>
            <button class="btn-next" :disabled="!file || uploading" @click="analyzeFileHeaders">
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
              <button class="btn-change-file" @click="file = null; fileHeaders = []; columnMapping = {}; goToImportStep(1)">
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
              <strong>{{ autoMappedCount }} colonne(s) détectée(s) automatiquement</strong>
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

        <!-- Étape 3: Modèle PDF/Word — VERSION PRO (DRAG & DROP) -->
        <!-- Étape 3: Modèle de bulletin & Auto-Mapping -->
        <div v-if="importStep === 3" class="import-step-content animate-in">
          <div class="import-intro">
            <div class="intro-icon-wrap" style="background: #eff6ff;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div>
              <strong>Modèle de bulletin personnalisé <span class="optional-badge">Optionnel</span></strong>
              <p>Uploadez votre propre modèle de bulletin (PDF). L'IA analysera automatiquement la structure en arrière-plan pour y insérer les données.</p>
            </div>
          </div>

          <div class="template-zone">
            <div v-if="!templateFile" class="template-empty">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <span>Ajouter un modèle de bulletin (.pdf)</span>
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
            <button class="btn-ai-automap" style="width: 100%; justify-content: center;" @click="autoMapPdf" v-if="!aiMappingLoading && !htmlTemplate">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
              Lancer la Reconstruction IA (HTML to PDF)
            </button>
            
            <div v-if="aiMappingLoading" class="flex-center gap-2" style="padding: 1rem; color: #6b7280;">
              <svg class="spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              L'IA réécrit complètement votre bulletin de paie en HTML... (peut prendre 10-15s)
            </div>

            <div v-if="aiMappingSuccess && htmlTemplate" class="ai-success-toast animate-in" style="margin-bottom: 1rem; background: #ecfdf5; color: #059669; border: 1px solid #10b981; padding: 1rem; border-radius: 8px; display: flex; align-items: center; gap: 0.5rem; justify-content: center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Bulletin reconstruit avec succès ! (Aperçu brut ci-dessous)
            </div>
            <iframe v-if="htmlTemplate" :srcdoc="wrappedHtmlTemplate" style="width: 100%; height: 500px; border: 1px solid #e5e7eb; border-radius: 8px; background: white; margin-top: 1rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);"></iframe>
          </div>

          <!-- Canvas invisible (requis pour l'envoi de l'image à l'IA) -->
          <canvas ref="pdfCanvas" style="display: none;"></canvas>

          <div class="step-nav" style="margin-top: 2rem;">
            <button class="btn-prev" @click="goToImportStep(2)">← Précédent</button>
            <button class="btn-next" @click="goToImportStep(4)" :disabled="aiMappingLoading">Suivant — Générer →</button>
          </div>
        </div>

        <!-- Étape 4: Lancement -->
        <div v-if="importStep === 4" class="import-step-content animate-in">
          <div class="launch-summary">
            <div class="summary-row">
              <span class="summary-label">Fichier de données</span>
              <span class="summary-value ok">{{ file?.name }}</span>
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
            </div>
            <a :href="result.zipUrl" class="btn-download" download target="_blank">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Télécharger le ZIP
            </a>
            <button class="btn-restart" @click="file = null; templateFile = null; result = null; goToImportStep(1)">
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
            <button class="btn-prev" @click="goToImportStep(3)">← Précédent</button>
          </div>
        </div>

      </div>

      <!-- ════ MODULE SOLDE ════ -->
      <div v-if="activeModule === 'solde'" class="module-content no-pad animate-in">
        <SoldeCompteSimulator :country="country" />
      </div>

      <!-- ════ MODULE BASE LOCALE ════ -->
      <div v-if="activeModule === 'local_db'" class="module-content animate-in">
        <LocalDatabasePanel :country="props.country" />
      </div>

      <!-- ════ MODULE ANNUAIRE EMPLOYÉS ════ -->
      <div v-if="activeModule === 'directory'" class="module-content animate-in">
        <EmployeeDirectory :country="props.country" />
      </div>

      <!-- ════ MODULE PARAMÈTRES ════ -->
      <div v-if="activeModule === 'settings'" class="module-content animate-in">
        <SettingsPanel :country="props.country" @change-country="(c) => emit('change-country', c)" />
      </div>

    </template>

  </div>
</template>

<style scoped>
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
  overflow: hidden;
  padding: 2rem;
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
  height: 100%;
  z-index: 2;
  align-items: center;
}

@media (max-width: 900px) {
  .desktop-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
    align-items: start;
    padding-top: 1rem;
    gap: 1.5rem;
  }
  .desktop-sidebar-widget {
    order: -1; /* Clock on top for mobile */
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
  gap: 1.25rem;
  max-height: 100%;
  overflow-y: auto;
  padding: 0.5rem;
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

/* Ensure active modules take remaining space above taskbar */
.module-content, .sim-type-chooser, .hr-home-intro {
  margin-bottom: 48px; /* space for taskbar */
  position: relative;
  z-index: 2;
}
.hr-wrapper > template > div {
  height: calc(100% - 48px);
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
.btn-download { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.6rem 1.25rem; background: #16a34a; color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 0.85rem; transition: background 0.2s; }
.btn-download:hover { background: #15803d; }
.btn-restart { background: none; border: none; text-decoration: underline; color: #166534; cursor: pointer; font-size: 0.8rem; }
.result-error { margin-top: 1.25rem; padding: 1rem; background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 12px; display: flex; align-items: flex-start; gap: 0.75rem; color: #991b1b; }
.result-error strong { display: block; margin-bottom: 0.2rem; font-size: 0.9rem; }
.result-error p { margin: 0; font-size: 0.8rem; }

/* MODEL DOWNLOAD */
.model-download-row { margin-top: 1rem; text-align: center; }
.model-link { display: inline-flex; align-items: center; gap: 0.4rem; color: #059669; font-size: 0.85rem; text-decoration: none; font-weight: 600; border-bottom: 1.5px dashed #059669; padding-bottom: 1px; transition: all 0.2s; }
.model-link:hover { border-bottom-style: solid; color: #047857; }

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
