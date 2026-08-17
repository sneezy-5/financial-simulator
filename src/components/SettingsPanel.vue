<script setup>
import { ref, onMounted, watch } from 'vue'
import { localDb } from '../services/localDatabase.js'
import { showToast } from '../services/toast.js'
import { showConfirm } from '../services/confirmModal.js'

const props = defineProps({
  country: {
    type: String,
    default: 'CI'
  }
})

const emit = defineEmits(['change-country'])

const templates = ref([])
const activeTab = ref('general') // general | templates | schedule
const selectedCountry = ref(props.country)

watch(() => props.country, (newVal) => {
  selectedCountry.value = newVal
})

const countries = [
  { code: 'CI', flagUrl: 'https://flagcdn.com/w40/ci.png', name: 'Côte d\'Ivoire', desc: 'Réglementation fiscale UEMOA (ITS, CNSS, IGR...)' },
  { code: 'BJ', flagUrl: 'https://flagcdn.com/w40/bj.png', name: 'Bénin', desc: 'Réglementation fiscale Bénin (AIB, CNSS, VPS...)' },
  { code: 'TG', flagUrl: 'https://flagcdn.com/w40/tg.png', name: 'Togo', desc: 'Réglementation fiscale Togo (CNSS, IRPP...)' }
]

const selectCountry = (code) => {
  selectedCountry.value = code
  emit('change-country', code)
  showToast(`Réglementation mise à jour : ${countries.find(c => c.code === code).name}`, 'success')
}

const scheduleSettings = ref({
  autoGenerate: false,
  generationDay: 25,
  defaultTemplateId: null
})

const showUploadModal = ref(false)
const newTemplateName = ref('')
const newTemplateType = ref('payslip')
const selectedFile = ref(null)

const loadData = async () => {
  try {
    templates.value = await localDb.getTemplates()
    const autoGen = await localDb.getSetting('autoGenerate', false)
    const genDay = await localDb.getSetting('generationDay', 25)
    scheduleSettings.value = {
      autoGenerate: autoGen,
      generationDay: genDay
    }
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  loadData()
  if (!document.getElementById('pdfjs-lib-settings')) {
    const script = document.createElement('script')
    script.id = 'pdfjs-lib-settings'
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }
    document.head.appendChild(script)
  }
})

const pdfCanvas = ref(null)
const isAnalyzing = ref(false)

const handleFileUpload = (e) => {
  const file = e.target.files[0]
  if (file && file.name.toLowerCase().endsWith('.pdf')) {
    selectedFile.value = file
    setTimeout(() => renderPdfCanvas(file), 100)
  } else {
    showToast("Veuillez sélectionner un fichier PDF valide.", 'error')
    e.target.value = null
  }
}

const renderPdfCanvas = (file) => {
  if (!window.pdfjsLib) return
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

const saveTemplate = async () => {
  if (!newTemplateName.value || !selectedFile.value) {
    showToast("Veuillez donner un nom et sélectionner un fichier PDF.", 'error')
    return
  }
  
  isAnalyzing.value = true
  try {
    // Analyse IA
    const token = localStorage.getItem('auth_token')
    if (!token) throw new Error("Vous devez être connecté pour analyser le modèle.")
    
    const imageBase64 = pdfCanvas.value.toDataURL('image/jpeg', 0.8)
    const response = await fetch('/api/rh/analyze-pdf-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ imageBase64 })
    })
    
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Erreur IA")
    
    const generatedHtml = result.htmlTemplate
    
    // Convert PDF to Base64 to store in IndexedDB
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = e.target.result
      const templateData = {
        name: newTemplateName.value,
        type: newTemplateType.value,
        pdfData: base64, // Data URL
        htmlTemplate: generatedHtml,
        isDefault: templates.value.filter(t => (t.type || 'payslip') === newTemplateType.value).length === 0, // Default if first of its type
        createdAt: new Date().toISOString()
      }
      
      await localDb.saveTemplate(templateData)
      showUploadModal.value = false
      newTemplateName.value = ''
      newTemplateType.value = 'payslip'
      selectedFile.value = null
      isAnalyzing.value = false
      await loadData()
    }
    reader.readAsDataURL(selectedFile.value)
  } catch (err) {
    showToast("Erreur lors de l'enregistrement : " + err.message, 'error')
    isAnalyzing.value = false
  }
}

const deleteTemplate = async (id) => {
  const ok = await showConfirm('Voulez-vous supprimer ce modèle ?', {
    title: 'Supprimer le modèle',
    confirmLabel: 'Supprimer',
    cancelLabel: 'Annuler',
    type: 'danger'
  })
  if (ok) {
    await localDb.deleteTemplate(id)
    await loadData()
  }
}

const setDefaultTemplate = async (template) => {
  const t = { ...template, isDefault: true }
  await localDb.saveTemplate(t)
  await loadData()
}

const saveScheduleSettings = async () => {
  try {
    await localDb.saveSetting('autoGenerate', scheduleSettings.value.autoGenerate)
    await localDb.saveSetting('generationDay', scheduleSettings.value.generationDay)
    showToast("Paramètres de planification sauvegardés avec succès !", 'success')
  } catch (e) {
    showToast("Erreur lors de la sauvegarde", 'error')
  }
}
</script>

<template>
  <div class="settings-wrapper">
    <div class="hr-home-intro" style="margin-bottom: 24px;">
      <h2 style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px; color: #0f172a;">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        Paramètres & Modèles
      </h2>
      <p style="color: #64748b;">Configurez les modèles PDF personnalisés et l'automatisation de la paie.</p>
    </div>

    <!-- TABS -->
    <div class="tabs-header" style="display: flex; gap: 16px; border-bottom: 1px solid #e2e8f0; margin-bottom: 24px;">
      <button @click="activeTab = 'general'" :style="{ borderBottom: activeTab === 'general' ? '2px solid #3b82f6' : 'none', color: activeTab === 'general' ? '#0f172a' : '#64748b', fontWeight: activeTab === 'general' ? '600' : '400', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '12px 16px', cursor: 'pointer', fontSize: '1rem' }">
        Général
      </button>
      <button @click="activeTab = 'templates'" :style="{ borderBottom: activeTab === 'templates' ? '2px solid #3b82f6' : 'none', color: activeTab === 'templates' ? '#0f172a' : '#64748b', fontWeight: activeTab === 'templates' ? '600' : '400', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '12px 16px', cursor: 'pointer', fontSize: '1rem' }">
        Modèles PDF
      </button>
      <button @click="activeTab = 'schedule'" :style="{ borderBottom: activeTab === 'schedule' ? '2px solid #3b82f6' : 'none', color: activeTab === 'schedule' ? '#0f172a' : '#64748b', fontWeight: activeTab === 'schedule' ? '600' : '400', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '12px 16px', cursor: 'pointer', fontSize: '1rem' }">
        Planification
      </button>
    </div>

    <!-- TAB: GENERAL -->
    <div v-if="activeTab === 'general'" class="animate-in">
      <h3 style="margin: 0 0 16px 0; color: #0f172a;">Réglementation & Pays</h3>
      <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 24px;">
        Sélectionnez le pays d'application pour les calculs de salaire, cotisations sociales (CNSS/VPS) et barèmes fiscaux de paie.
      </p>

      <div class="countries-settings-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <div 
          v-for="c in countries" 
          :key="c.code" 
          @click="selectCountry(c.code)"
          style="border: 2px solid; border-radius: 12px; padding: 20px; cursor: pointer; display: flex; align-items: flex-start; gap: 16px; transition: all 0.2s;"
          :style="{ 
            borderColor: selectedCountry === c.code ? '#3b82f6' : '#e2e8f0', 
            background: selectedCountry === c.code ? '#eff6ff' : '#ffffff',
            boxShadow: selectedCountry === c.code ? '0 4px 12px rgba(59, 130, 246, 0.15)' : 'none'
          }"
        >
          <img :src="c.flagUrl" :alt="c.name" style="width: 32px; height: 24px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); object-fit: cover;" />
          <div style="flex: 1;">
            <h4 style="margin: 0 0 4px 0; color: #0f172a; font-weight: 700;">{{ c.name }}</h4>
            <p style="margin: 0; font-size: 0.8rem; color: #64748b; line-height: 1.4;">{{ c.desc }}</p>
          </div>
          <div v-if="selectedCountry === c.code" style="width: 20px; height: 20px; border-radius: 50%; background: #3b82f6; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold;">✓</div>
        </div>
      </div>
    </div>

    <!-- TAB: TEMPLATES -->
    <div v-if="activeTab === 'templates'">
      <div class="templates-tab-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #0f172a;">Vos modèles personnalisés</h3>
        <button @click="showUploadModal = true" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 700; box-shadow: 0 4px 12px rgba(59,130,246,0.25);">+ Importer un modèle</button>
      </div>
      
      <div v-if="templates.length === 0" style="padding: 60px 20px; text-align: center; background: #f8fafc; border-radius: 16px; border: 1px dashed #e2e8f0;">
        <h3 style="color: #0f172a; margin-bottom: 8px;">Aucun modèle personnalisé</h3>
        <p style="color: #64748b; font-size: 0.9rem;">Le système utilise le modèle par défaut (généré dynamiquement).</p>
      </div>

      <div v-else class="templates-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
        <div v-for="t in templates" :key="t.id" class="template-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; background: #fef2f2; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #ef4444;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              </div>
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <h4 style="margin: 0; font-size: 1rem; color: #0f172a;">{{ t.name }}</h4>
                  <span v-if="t.isDefault" style="background: #fef9c3; color: #d97706; border: 1px solid #fde047; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Défaut</span>
                  <span style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">
                    {{ (t.type || 'payslip') === 'stc' ? 'Solde de Tout Compte' : 'Bulletin' }}
                  </span>
                </div>
                <p style="margin: 4px 0 0; color: #64748b; font-size: 0.85rem;">Ajouté le {{ new Date(t.createdAt).toLocaleDateString() }}</p>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            <button v-if="!t.isDefault" @click="setDefaultTemplate(t)" style="flex: 1; background: #ffffff; border: 1px solid #e2e8f0; color: #475569; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; transition: background 0.2s;">Utiliser par défaut</button>
            <button @click="deleteTemplate(t.id)" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; transition: background 0.2s;">Supprimer</button>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB: SCHEDULE -->
    <div v-if="activeTab === 'schedule'" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; max-width: 600px; color: #0f172a;">
      <h3 style="margin-top: 0; margin-bottom: 24px; color: #0f172a;">Planification de la paie</h3>
      
      <div style="margin-bottom: 20px;">
        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
          <input type="checkbox" v-model="scheduleSettings.autoGenerate" style="width: 20px; height: 20px; accent-color: #3b82f6;" />
          <span style="font-weight: 600; color: #0f172a;">Activer l'alerte de génération automatique</span>
        </label>
        <p style="margin-top: 8px; margin-left: 32px; color: #64748b; font-size: 0.9rem; line-height: 1.5;">
          Lorsque cette option est activée, le système vérifiera chaque mois à la date spécifiée si la paie a été générée. Si ce n'est pas le cas, une alerte s'affichera à l'ouverture de l'application pour vous proposer de générer la paie en 1 clic pour tous vos employés.
        </p>
      </div>

      <div style="margin-bottom: 32px; padding-left: 32px;" v-if="scheduleSettings.autoGenerate">
        <label style="display: block; font-weight: 600; color: #475569; margin-bottom: 8px;">Jour de génération (chaque mois)</label>
        <div style="display: flex; align-items: center; gap: 12px;">
          Le 
          <input type="number" min="1" max="31" v-model="scheduleSettings.generationDay" style="width: 80px; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #0f172a; text-align: center; font-weight: bold; outline: none;" />
          du mois.
        </div>
      </div>

      <button @click="saveScheduleSettings" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 700; width: 100%; box-shadow: 0 4px 12px rgba(59,130,246,0.25);">
        Sauvegarder la planification
      </button>
    </div>

    <!-- MODAL UPLOAD TEMPLATE -->
    <div v-if="showUploadModal" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.3); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100;">
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; width: 100%; max-width: 500px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); color: #0f172a;">
        <h3 style="margin-top: 0; margin-bottom: 20px; color: #0f172a;">Nouveau Modèle PDF</h3>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #475569;">Nom du modèle</label>
          <input type="text" v-model="newTemplateName" placeholder="Ex: Modèle ONDA 2024" style="width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #0f172a; outline: none;" />
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #475569;">Type de Document</label>
          <select v-model="newTemplateType" style="width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #0f172a; outline: none;">
            <option value="payslip">Bulletin de Paie</option>
            <option value="stc">Reçu pour Solde de Tout Compte (STC)</option>
          </select>
        </div>
        
        <div style="margin-bottom: 24px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #475569;">Fichier PDF Vierge</label>
          <input type="file" accept=".pdf" @change="handleFileUpload" style="width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px dashed #cbd5e1; background: #f8fafc; color: #64748b;" />
        </div>

        <div style="background: #eff6ff; color: #2563eb; padding: 12px; border-radius: 8px; font-size: 0.85rem; margin-bottom: 24px; border: 1px solid #bfdbfe;">
          <strong>Magie IA :</strong> Le système va automatiquement analyser votre PDF et placer les champs au bon endroit lors de l'enregistrement.
        </div>
        
        <canvas ref="pdfCanvas" style="display: none;"></canvas>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button @click="showUploadModal = false" :disabled="isAnalyzing" style="background: #ffffff; border: 1px solid #e2e8f0; padding: 10px 20px; border-radius: 8px; cursor: pointer; color: #64748b;">Annuler</button>
          <button @click="saveTemplate" :disabled="isAnalyzing" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 12px rgba(16,185,129,0.25);">
            {{ isAnalyzing ? 'Analyse IA en cours...' : 'Enregistrer le modèle' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-wrapper {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}

.tabs-header {
  display: flex !important;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 24px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.tabs-header::-webkit-scrollbar {
  display: none;
}

.tabs-header button {
  flex-shrink: 0 !important;
  white-space: nowrap !important;
}

@media (max-width: 640px) {
  .settings-wrapper {
    padding: 8px 6px !important;
  }
  
  .tabs-header {
    gap: 4px;
  }
  
  .tabs-header button {
    padding: 8px 10px !important;
    font-size: 0.85rem !important;
  }
  
  .countries-settings-grid {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
  }
  
  /* Templates Tab Mobile adjustments */
  .templates-tab-header {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 12px !important;
    text-align: center;
  }
  
  .templates-tab-header h3 {
    font-size: 1.2rem;
  }
  
  .templates-tab-header button {
    width: 100%;
    justify-content: center;
    padding: 12px !important;
  }
  
  .templates-grid {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
  
  .template-card {
    padding: 12px !important;
  }
  
  /* Schedule Tab Mobile adjustments */
  .settings-wrapper p {
    margin-left: 12px !important;
    font-size: 0.85rem !important;
  }
  
  .settings-wrapper div[style*="padding-left: 32px"] {
    padding-left: 12px !important;
  }
}
</style>
