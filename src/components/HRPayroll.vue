<script setup>
import { ref } from 'vue'
import PayslipSimulator from './PayslipSimulator.vue'
import SoldeCompteSimulator from './SoldeCompteSimulator.vue'

// ═══ ONGLET ACTIF ═══
const activeModule = ref('import') // 'import' | 'simulation' | 'solde'

// ═══ IMPORT EXCEL ═══
const file = ref(null)
const templateFile = ref(null)
const uploading = ref(false)
const result = ref(null)
const error = ref(null)
const dragOver = ref(false)

const handleFileUpload = (event) => {
  file.value = event.target.files[0]
  error.value = null
  result.value = null
}

const handleTemplateUpload = (event) => {
  templateFile.value = event.target.files[0]
}

const onDrop = (e) => {
  dragOver.value = false
  const f = e.dataTransfer.files[0]
  if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
    file.value = f
  }
}

const processPayroll = async () => {
  if (!file.value) return

  uploading.value = true
  error.value = null
  result.value = null

  const formData = new FormData()
  formData.append('file', file.value)
  if (templateFile.value) {
    formData.append('template', templateFile.value)
  }

  try {
    const response = await fetch('/api/rh/generate-pay-slips', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Erreur lors du traitement')
    }

    const data = await response.json()
    result.value = data
  } catch (e) {
    error.value = e.message
    console.error(e)
  } finally {
    uploading.value = false
  }
}

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="hr-wrapper">

    <!-- EN-TÊTE -->
    <div class="hr-header">
      <div class="hr-header-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </div>
      <div class="hr-header-text">
        <h2>Espace RH — Gestion de Paie</h2>
        <p>Générez vos bulletins de paie conformes à la législation ivoirienne</p>
      </div>
    </div>

    <!-- ONGLETS MODULE -->
    <div class="module-tabs">
      <button
        class="module-tab"
        :class="{ active: activeModule === 'import' }"
        @click="activeModule = 'import'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>
        Import Excel (Masse)
      </button>
      <button
        class="module-tab"
        :class="{ active: activeModule === 'simulation' }"
        @click="activeModule = 'simulation'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Simuler un bulletin
      </button>
      <button
        class="module-tab"
        :class="{ active: activeModule === 'solde' }"
        @click="activeModule = 'solde'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
        Solde de Tout Compte
      </button>
    </div>

    <!-- ════════════════════════════════════
         MODULE IMPORT EXCEL
         ════════════════════════════════════ -->
    <div v-if="activeModule === 'import'" class="module-content">

      <div class="import-intro">
        <div class="intro-icon">📊</div>
        <div>
          <strong>Traitement en masse</strong>
          <p>Importez votre fichier Excel contenant les données de tous les employés pour générer l'ensemble des bulletins en un seul clic.</p>
        </div>
      </div>

      <!-- 1. Fichier Excel -->
      <div class="upload-section">
        <label class="section-label">
          <span class="step-badge">1</span>
          Fichier Données Employés (Excel)
        </label>
        <div
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
      </div>

      <!-- 2. Template Word (optionnel) -->
      <div class="upload-section">
        <label class="section-label">
          <span class="step-badge optional">2</span>
          Modèle Bulletin Personnalisé (Word) <span class="optional-badge">Optionnel</span>
        </label>
        <div class="template-zone">
          <div v-if="!templateFile" class="template-empty">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>Ajouter un modèle .docx personnalisé</span>
            <input type="file" accept=".docx" @change="handleTemplateUpload" />
          </div>
          <div v-else class="template-filled">
            <span class="word-icon">W</span>
            <span class="template-name">{{ templateFile.name }}</span>
            <button class="file-remove small" @click="templateFile = null">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="template-vars">
          <strong>Variables disponibles dans votre modèle :</strong><br>
          <code>{nom}</code> <code>{prenom}</code> <code>{matricule}</code> <code>{salaire_base}</code>
          <code>{netAPayer}</code> <code>{brut}</code> <code>{is}</code> <code>{igr}</code>
          <code>{cn}</code> <code>{cnps}</code> <code>{date_jour}</code>
        </div>
      </div>

      <!-- Bouton Lancer -->
      <button
        v-if="file && !result"
        class="btn-launch"
        :disabled="uploading"
        @click="processPayroll"
      >
        <span v-if="uploading" class="flex-center gap-2">
          <svg class="spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Traitement en cours...
        </span>
        <span v-else class="flex-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Générer tous les bulletins
          <span class="mode-badge">{{ templateFile ? 'Word (.docx)' : 'PDF' }}</span>
        </span>
      </button>

      <!-- Résultat succès -->
      <div v-if="result" class="result-success animate-in">
        <div class="result-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <div class="result-text">
          <h4>Bulletins générés avec succès !</h4>
          <p>{{ result.message }}</p>
        </div>
        <a :href="result.zipUrl" class="btn-download" download target="_blank">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Télécharger le ZIP
        </a>
        <button class="btn-restart" @click="file = null; templateFile = null; result = null">
          Traiter un autre fichier
        </button>
      </div>

      <!-- Erreur -->
      <div v-if="error" class="result-error animate-in">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <div>
          <strong>Erreur de traitement</strong>
          <p>{{ error }}</p>
        </div>
      </div>

      <!-- Lien modèle -->
      <div class="model-download-row">
        <a href="/api/rh/download/modele-paie.xlsx" class="model-link" download>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Télécharger le modèle Excel (vierge)
        </a>
        <span class="model-desc">Format requis avec feuilles EMPLOYES, REMUNERATION et INFORMATIONS_ENTREPRISE</span>
      </div>
    </div>

    <!-- ════════════════════════════════════
         MODULE SIMULATION
         ════════════════════════════════════ -->
    <div v-if="activeModule === 'simulation'" class="module-content no-pad">
      <PayslipSimulator />
    </div>

    <!-- ════════════════════════════════════
         MODULE SOLDE DE TOUT COMPTE
         ════════════════════════════════════ -->
    <div v-if="activeModule === 'solde'" class="module-content no-pad">
      <SoldeCompteSimulator />
    </div>

  </div>
</template>

<style scoped>
.hr-wrapper {
  background: white;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  width: 100%;
}

/* HEADER */
.hr-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%);
  color: white;
}
.hr-header-icon {
  width: 50px; height: 50px;
  background: rgba(255,255,255,0.15);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.hr-header-text h2 { margin: 0; font-size: 1.15rem; font-weight: 800; }
.hr-header-text p { margin: 0.2rem 0 0; font-size: 0.8rem; opacity: 0.8; }

/* MODULE TABS */
.module-tabs {
  display: flex;
  border-bottom: 2px solid #e2e8f0;
  background: #f8fafc;
}
.module-tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  padding: 0.875rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  border: none;
  background: none;
  cursor: pointer;
  color: #64748b;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
  justify-content: center;
}
.module-tab.active {
  color: #1d4ed8;
  border-bottom-color: #1d4ed8;
  background: white;
}
.module-tab:hover:not(.active) { background: #f1f5f9; color: #374151; }

/* MODULE CONTENT */
.module-content {
  padding: 1.5rem;
}
.module-content.no-pad { padding: 0; }

/* IMPORT INTRO */
.import-intro {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  margin-bottom: 1.25rem;
}
.intro-icon { font-size: 1.75rem; flex-shrink: 0; }
.import-intro strong { color: #1e40af; font-size: 0.9rem; display: block; margin-bottom: 0.2rem; }
.import-intro p { margin: 0; font-size: 0.8rem; color: #3b82f6; }

/* UPLOAD */
.upload-section { margin-bottom: 1.25rem; }
.section-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 0.875rem;
  color: #1e293b;
  margin-bottom: 0.6rem;
}
.step-badge {
  width: 22px; height: 22px;
  background: #2563eb;
  color: white;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem;
  font-weight: 800;
  flex-shrink: 0;
}
.step-badge.optional { background: #94a3b8; }
.optional-badge {
  font-size: 0.7rem;
  color: #64748b;
  font-weight: 500;
  background: #f1f5f9;
  padding: 0.1rem 0.5rem;
  border-radius: 20px;
}

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
.upload-zone:hover, .upload-zone.dragging {
  border-color: #2563eb;
  background: #eff6ff;
}
.upload-zone.has-file {
  border-style: solid;
  border-color: #93c5fd;
  background: #f0f7ff;
  padding: 1rem;
}
.upload-zone input {
  position: absolute; inset: 0; opacity: 0; cursor: pointer;
}

.upload-icon { color: #2563eb; margin-bottom: 0.75rem; }
.upload-text { font-weight: 600; color: #374151; margin: 0 0 0.25rem; }
.upload-hint { font-size: 0.8rem; color: #64748b; margin: 0; }

.file-info {
  display: flex; align-items: center; gap: 0.75rem; text-align: left;
}
.file-icon {
  width: 40px; height: 40px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.file-icon.excel { background: #dcfce7; color: #16a34a; }
.file-details { flex: 1; }
.file-name { display: block; font-weight: 700; font-size: 0.875rem; color: #1e293b; }
.file-size { font-size: 0.75rem; color: #64748b; }
.file-remove {
  background: none; border: none; cursor: pointer; color: #94a3b8;
  padding: 0.25rem; border-radius: 4px; transition: color 0.2s;
}
.file-remove:hover { color: #ef4444; }
.file-remove.small { padding: 0.1rem; }

/* TEMPLATE ZONE */
.template-zone {
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}
.template-empty {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  cursor: pointer;
  color: #2563eb;
  font-weight: 600;
  font-size: 0.875rem;
  position: relative;
  transition: background 0.2s;
}
.template-empty:hover { background: #eff6ff; }
.template-empty input {
  position: absolute; inset: 0; opacity: 0; cursor: pointer;
}
.template-filled {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.6rem 1rem;
  background: #f0f7ff;
}
.word-icon {
  width: 28px; height: 28px;
  background: #2b579a; color: white;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 0.8rem;
}
.template-name { flex: 1; font-size: 0.875rem; font-weight: 600; color: #1e293b; }
.template-vars {
  margin-top: 0.5rem;
  font-size: 0.72rem;
  color: #64748b;
  line-height: 1.8;
}
.template-vars code {
  background: #f1f5f9;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  color: #0f172a;
  font-family: monospace;
  font-size: 0.7rem;
  margin-right: 0.25rem;
}

/* LAUNCH BUTTON */
.btn-launch {
  width: 100%;
  margin-top: 0.5rem;
  padding: 1rem;
  background: linear-gradient(135deg, #1e3a5f, #2563eb);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
}
.btn-launch:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.4);
}
.btn-launch:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

.mode-badge {
  background: rgba(255,255,255,0.2);
  padding: 0.15rem 0.6rem;
  border-radius: 20px;
  font-size: 0.75rem;
}

.flex-center { display: flex; align-items: center; justify-content: center; }
.gap-2 { gap: 0.5rem; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* RÉSULTATS */
.result-success {
  margin-top: 1.25rem;
  padding: 1.25rem;
  background: #f0fdf4;
  border: 1.5px solid #bbf7d0;
  border-radius: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  color: #166534;
}
.result-icon { color: #16a34a; flex-shrink: 0; }
.result-text { flex: 1; min-width: 150px; }
.result-text h4 { margin: 0 0 0.2rem; font-size: 0.95rem; }
.result-text p { margin: 0; font-size: 0.8rem; opacity: 0.8; }

.btn-download {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.6rem 1.25rem;
  background: #16a34a; color: white;
  text-decoration: none; border-radius: 8px;
  font-weight: 700; font-size: 0.85rem;
  transition: background 0.2s;
}
.btn-download:hover { background: #15803d; }

.btn-restart {
  background: none; border: none;
  text-decoration: underline;
  color: #166534; cursor: pointer;
  font-size: 0.8rem;
}

.result-error {
  margin-top: 1.25rem;
  padding: 1rem;
  background: #fef2f2;
  border: 1.5px solid #fecaca;
  border-radius: 12px;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  color: #991b1b;
}
.result-error strong { display: block; margin-bottom: 0.2rem; font-size: 0.9rem; }
.result-error p { margin: 0; font-size: 0.8rem; }

/* MODÈLE DOWNLOAD */
.model-download-row {
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid #e2e8f0;
  text-align: center;
}
.model-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: #2563eb;
  font-size: 0.875rem;
  text-decoration: none;
  font-weight: 600;
  border-bottom: 1.5px dashed #2563eb;
  padding-bottom: 1px;
  transition: all 0.2s;
}
.model-link:hover { border-bottom-style: solid; color: #1d4ed8; }
.model-desc {
  display: block;
  font-size: 0.72rem;
  color: #64748b;
  margin-top: 0.4rem;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-in { animation: slideIn 0.3s ease-out; }
</style>
