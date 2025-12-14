<script setup>
import { ref } from 'vue'

const file = ref(null)
const templateFile = ref(null) // Nouveau fichier template
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
    // On assume que le drop concerne le fichier principal pour simplifier
    file.value = e.dataTransfer.files[0]
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erreur lors du traitement');
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
</script>

<template>
  <div class="rh-container">
    <h2 class="text-2xl font-bold mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        Espace RH - Génération de Paie
    </h2>
    
    <!-- Zone Upload Fichier Données (Excel) -->
    <div class="upload-section">
        <label class="section-label">1. Fichier Données (Excel)</label>
        <div class="upload-zone" 
             :class="{ 'dragging': dragOver, 'has-file': file }"
             @dragover.prevent="dragOver = true"
             @dragleave.prevent="dragOver = false"
             @drop.prevent="onDrop">
            
            <div v-if="!file" class="placeholder">
                <div class="icon-wrapper">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-green-600 mb-2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M8 13h2"></path><path d="M8 17h2"></path><path d="M14 13h2"></path><path d="M14 17h2"></path></svg>
                </div>
                <p>Glissez le fichier Excel ici</p>
                <input type="file" accept=".xlsx, .xls" @change="handleFileUpload" />
            </div>

            <div v-else class="file-info">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                <div class="details">
                    <span class="name">{{ file.name }}</span>
                    <span class="size">{{ (file.size / 1024).toFixed(1) }} KB</span>
                </div>
                <button class="remove-btn" @click="file = null">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
    </div>

    <!-- Zone Upload Template (Word) - Optionnel -->
    <div class="upload-section mt-4">
        <label class="section-label">2. Modèle Personnalisé de bulletin de paie (Word) <small>(Optionnel)</small></label>
        <div class="template-zone">
            <div v-if="!templateFile" class="mini-upload">
                <div class="flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M10 13l2 2 2-2"></path><path d="M12 15V9"></path></svg>
                  <span>Ajouter un modèle .docx</span>
                </div>
                <input type="file" accept=".docx" @change="handleTemplateUpload" />
            </div>
            <div v-else class="file-info compact">
                <span class="icon-word">W</span>
                <span class="name">{{ templateFile.name }}</span>
                <button class="remove-btn" @click="templateFile = null">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
        <p class="text-xs text-gray-500 mt-1">
            Utilisez des balises comme <code>{nom}</code>, <code>{netAPayer}</code> dans votre document Word.
        </p>
    </div>

    <button 
        v-if="file && !result" 
        class="analyze-btn flex items-center justify-center gap-2" 
        :disabled="uploading"
        @click="processPayroll"
    >
        <span v-if="uploading" class="flex items-center gap-2">
          <svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
          Traitement en cours...
        </span>
        <span v-else class="flex items-center gap-2">
            Lancer la génération
            <span v-if="templateFile" class="text-xs opacity-90">(Word)</span>
            <span v-else class="text-xs opacity-90">(PDF)</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </span>
    </button>

    <!-- Résultat -->
    <div v-if="result" class="result-box success animate-in">
        <h3 class="flex items-center justify-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          Terminé !
        </h3>
        <p>{{ result.message }}</p>
        <a :href="result.zipUrl" class="download-btn flex items-center justify-center gap-2" download target="_blank">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>Télécharger les bulletins (ZIP)</span>
        </a>
        <button class="reset-link" @click="file = null; templateFile = null; result = null">Traiter un autre fichier</button>
    </div>

    <div v-if="error" class="result-box error animate-in">
        <h3 class="flex items-center justify-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-600"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          Erreur
        </h3>
        <p>{{ error }}</p>
    </div>

    <div class="actions-row">
        <a href="/api/rh/download/modele-paie.xlsx" class="template-link flex items-center justify-center gap-2" download>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Télécharger le modèle Excel à utiliser (Vierge)
        </a>
    </div>

    <div class="info-notice">
        <strong>Champs disponibles pour le template :</strong><br>
        <em>{matricule}, {nom}, {prenom}, {salaire_base}, {sursalaire}, {cnps}, {is}, {netAPayer}...</em>
    </div>
  </div>
</template>

<style scoped>
.rh-container {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    max-width: 600px;
    margin: 0 auto;
}

.section-label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: #1e293b;
}

.upload-zone {
    border: 2px dashed #cbd5e1;
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
    position: relative;
    transition: all 0.2s;
    background: #f8fafc;
    cursor: pointer;
}
.upload-zone:hover, .upload-zone.dragging { border-color: #3b82f6; background: #eff6ff; }
.upload-zone.has-file { border-style: solid; border-color: #e2e8f0; padding: 1rem; }

.upload-zone input, .mini-upload input {
    position: absolute; inset: 0; opacity: 0; cursor: pointer;
}

.placeholder .icon { font-size: 2rem; display: block; margin-bottom: 0.5rem; opacity: 0.5; }
.placeholder p { color: #64748b; font-size: 0.9rem; }

.template-zone {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #fff;
    overflow: hidden;
}

.mini-upload {
    padding: 0.75rem;
    text-align: center;
    position: relative;
    cursor: pointer;
    color: #2563eb;
    font-weight: 500;
    background: #f1f5f9;
}
.mini-upload:hover { background: #e2e8f0; }

.file-info { display: flex; align-items: center; gap: 1rem; text-align: left; }
.file-info.compact { padding: 0.5rem 1rem; }
.file-info .icon-word { 
    background: #2b579a; color: white; width: 24px; height: 24px; 
    display: flex; align-items: center; justify-content: center; 
    border-radius: 4px; font-weight: bold; font-size: 0.8rem; 
}
.file-info .details { flex: 1; }
.file-info .name { font-weight: 600; font-size: 0.9rem; }
.file-info .size { font-size: 0.8rem; color: #64748b; }

.remove-btn { 
    background: none; border: none; font-size: 1.1rem; cursor: pointer; color: #94a3b8;
    padding: 0.2rem; margin-left: auto;
}
.remove-btn:hover { color: #ef4444; }

.analyze-btn {
    width: 100%; margin-top: 1.5rem; padding: 1rem;
    background: #2563eb; color: white; border: none; border-radius: 8px; font-weight: 600;
    cursor: pointer; transition: background 0.2s;
}
.analyze-btn:hover { background: #1d4ed8; }
.analyze-btn:disabled { background: #94a3b8; cursor: not-allowed; }

.result-box { margin-top: 1.5rem; padding: 1.5rem; border-radius: 8px; text-align: center; }
.result-box.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.result-box.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }

.download-btn {
    display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem;
    background: #16a34a; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;
}
.download-btn:hover { background: #15803d; }

.reset-link {
    display: block; margin: 1rem auto 0; background: none; border: none;
    text-decoration: underline; color: #64748b; cursor: pointer; font-size: 0.9rem;
}

.info-notice {
    margin-top: 1rem; font-size: 0.75rem; color: #64748b;
    background: #f1f5f9; padding: 0.75rem; border-radius: 6px; border-left: 3px solid #64748b;
}

.actions-row { margin-top: 2rem; text-align: center; }
.template-link { color: #2563eb; font-size: 0.9rem; text-decoration: none; border-bottom: 1px dashed #2563eb; }
.template-link:hover { color: #1d4ed8; border-style: solid; }

@keyframes slideIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
.animate-in { animation: slideIn 0.3s ease-out; }
</style>
