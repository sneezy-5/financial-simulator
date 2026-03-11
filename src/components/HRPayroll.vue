<script setup>
import { ref } from 'vue'
import PayslipSimulator from './PayslipSimulator.vue'
import SoldeCompteSimulator from './SoldeCompteSimulator.vue'

// ═══ NAVIGATION ═══
// null = accueil | 'import' | 'simulation' | 'solde'
const activeModule = ref(null)
const hrWrapperRef = ref(null)

// ═══ SIMULATION - Type Bulletin ═══
// null = choix du type | 'habituel' | 'conges'
const simulationType = ref(null)

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
  if (templateFile.value) formData.append('template', templateFile.value)
  try {
    const response = await fetch('/api/rh/generate-pay-slips', { method: 'POST', body: formData })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Erreur lors du traitement')
    }
    result.value = await response.json()
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

const modules = [
  {
    id: 'simulation',
    title: 'Simuler un Bulletin',
    subtitle: 'Bulletin habituel ou congés',
    description: "Calculez et g\u00e9n\u00e9rez un bulletin de paie individuel en temps r\u00e9el. Visualisez l'impact de chaque rubrique.",
    icon: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`,
    color: '#2563eb',
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
    badge: 'Temps réel',
    steps: ['Entreprise', 'Employé', 'Salaire', 'Paiement']
  },
  {
    id: 'import',
    title: 'Import en Masse',
    subtitle: 'Traitement Excel',
    description: 'Importez votre fichier Excel pour générer les bulletins de tous vos employés en un seul clic.',
    icon: `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/>`,
    color: '#059669',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
    badge: 'Multi-employés',
    steps: ['Données', 'Modèle', 'Génération']
  },
  {
    id: 'solde',
    title: 'Solde de Tout Compte',
    subtitle: 'Fin de contrat',
    description: 'Calculez l\'indemnité de fin de contrat, le préavis, les congés non pris et les droits du salarié.',
    icon: `<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>`,
    color: '#d97706',
    gradient: 'linear-gradient(135deg, #78350f 0%, #d97706 100%)',
    badge: 'Fin de contrat',
    steps: ['Entreprise', 'Employé', 'Calcul']
  }
]
</script>

<template>
  <div class="hr-wrapper" ref="hrWrapperRef">

    <!-- ═══ PAGE ACCUEIL (Choix du module) ═══ -->
    <div v-if="!activeModule" class="hr-home animate-in">

      <!-- Intro -->
      <div class="hr-home-intro">
        <h2>Que souhaitez-vous faire ?</h2>
        <p>Sélectionnez un outil pour commencer</p>
      </div>

      <!-- Les 3 Cartes Fonctionnalités -->
      <div class="feature-cards-grid">
        <button
          v-for="mod in modules"
          :key="mod.id"
          class="feature-card"
          @click="activeModule = mod.id"
        >
          <!-- Icône -->
          <div class="feature-card-icon" :style="{ background: mod.gradient }">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
              fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
              v-html="mod.icon">
            </svg>
          </div>

          <!-- Texte -->
          <div class="feature-card-body">
            <div class="feature-card-header-row">
              <h3>{{ mod.title }}</h3>
              <span class="feature-badge" :style="{ background: mod.color + '20', color: mod.color }">
                {{ mod.badge }}
              </span>
            </div>
            <p class="feature-card-subtitle">{{ mod.subtitle }}</p>
            <p class="feature-card-desc">{{ mod.description }}</p>

            <!-- Mini stepper -->
            <div class="feature-steps-preview">
              <span
                v-for="(step, i) in mod.steps"
                :key="i"
                class="feature-step-dot"
                :style="{ background: mod.color }"
              >{{ i + 1 }}</span>
              <span class="feature-steps-label">{{ mod.steps.join(' → ') }}</span>
            </div>
          </div>

          <!-- Flèche -->
          <div class="feature-card-arrow" :style="{ color: mod.color }">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </button>
      </div>

    </div>

    <!-- ═══ MODULE ACTIF ═══ -->
    <template v-else>

      <!-- Sub-header avec retour -->
      <div class="module-header animate-in">
        <button class="module-back-btn" @click="activeModule = null; goToImportStep(1)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Retour
        </button>
        <div class="module-header-title">
          <div class="module-header-icon"
            :style="{ background: modules.find(m => m.id === activeModule)?.gradient }">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
              v-html="modules.find(m => m.id === activeModule)?.icon">
            </svg>
          </div>
          <div>
            <strong>{{ modules.find(m => m.id === activeModule)?.title }}</strong>
            <span>{{ modules.find(m => m.id === activeModule)?.subtitle }}</span>
          </div>
        </div>
      </div>

      <!-- ════ MODULE SIMULATION ════ -->
      <div v-if="activeModule === 'simulation'" class="animate-in">

        <!-- Étape A: Choix du type de bulletin -->
        <div v-if="!simulationType" class="sim-type-chooser">
          <div class="sim-type-intro">
            <h3>Quel type de bulletin souhaitez-vous générer ?</h3>
            <p>Choisissez le type pour pré-configurer automatiquement le calcul</p>
          </div>
          <div class="sim-type-cards">

            <!-- Carte Bulletin Habituel -->
            <button class="sim-type-card" @click="goToSimulation('habituel')">
              <div class="sim-type-icon" style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div class="sim-type-body">
                <div class="sim-type-badge" style="background: #dbeafe; color: #1d4ed8">📅 Mensuel</div>
                <h4>Bulletin de Paie Habituel</h4>
                <p>Salaire mensuel standard avec toutes les rubriques : salaire de base, primes, heures sup, cotisations.</p>
                <ul class="sim-type-features">
                  <li>✓ Calcul ITS 2024 automatique</li>
                  <li>✓ Primes imposables et non imposables</li>
                  <li>✓ Heures supplémentaires</li>
                </ul>
              </div>
              <div class="sim-type-arrow" style="color: #2563eb">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </button>

            <!-- Carte Bulletin Congés -->
            <button class="sim-type-card" @click="goToSimulation('conges')">
              <div class="sim-type-icon" style="background: linear-gradient(135deg, #064e3b 0%, #059669 100%)">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                  <path d="m9 16 2 2 4-4"/>
                </svg>
              </div>
              <div class="sim-type-body">
                <div class="sim-type-badge" style="background: #d1fae5; color: #065f46">🌴 Congés</div>
                <h4>Bulletin de Congés Payés</h4>
                <p>Calcul automatique de l’allocation congés selon les mois travaillés depuis le dernier retour.</p>
                <ul class="sim-type-features">
                  <li>✓ Calcul auto des jours de congés</li>
                  <li>✓ Sans prime de transport</li>
                  <li>✓ Allocation congés incluse</li>
                </ul>
              </div>
              <div class="sim-type-arrow" style="color: #059669">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </button>

          </div>
        </div>

        <!-- Étape B: Formulaire du bulletin -->
        <template v-else>
          <!-- Breadcrumb interne -->
          <div class="sim-breadcrumb">
            <button class="sim-back" @click="simulationType = null">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              Changer de type
            </button>
            <span class="sim-bread-type" :style="{ background: simulationType === 'conges' ? '#d1fae5' : '#dbeafe', color: simulationType === 'conges' ? '#065f46' : '#1d4ed8' }">
              {{ simulationType === 'conges' ? '🌴 Bulletin Congés' : '📅 Bulletin Habituel' }}
            </span>
          </div>
          <div class="module-content no-pad">
            <PayslipSimulator :initialType="simulationType" :key="simulationType" />
          </div>
        </template>

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
            <span>Données</span>
          </div>
          <div class="import-step-line"></div>
          <div class="import-step" :class="{ active: importStep >= 2, done: importStep > 2 }">
            <div class="import-step-circle"><span>2</span></div>
            <span>Modèle</span>
          </div>
          <div class="import-step-line"></div>
          <div class="import-step" :class="{ active: importStep >= 3 }">
            <div class="import-step-circle"><span>3</span></div>
            <span>Génération</span>
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
          <div class="model-download-row">
            <a href="/api/rh/download/modele-paie.xlsx" class="model-link" download>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Télécharger le modèle Excel (vierge)
            </a>
          </div>
          <div class="step-nav">
            <div></div>
            <button class="btn-next" :disabled="!file" @click="goToImportStep(2)">
              Suivant — Choisir un modèle →
            </button>
          </div>
        </div>

        <!-- Étape 2: Modèle Word -->
        <div v-if="importStep === 2" class="import-step-content animate-in">
          <div class="import-intro">
            <div class="intro-icon-wrap" style="background: #eff6ff;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div>
              <strong>Modèle de bulletin personnalisé <span class="optional-badge">Optionnel</span></strong>
              <p>Utilisez un modèle Word (.docx) pour personnaliser la mise en page du bulletin</p>
            </div>
          </div>
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
            <strong>Variables disponibles :</strong><br>
            <code>{nom}</code> <code>{prenom}</code> <code>{matricule}</code> <code>{salaire_base}</code>
            <code>{netAPayer}</code> <code>{brut}</code> <code>{is}</code> <code>{igr}</code>
            <code>{cn}</code> <code>{cnps}</code> <code>{date_jour}</code>
          </div>
          <div class="step-nav">
            <button class="btn-prev" @click="goToImportStep(1)">← Précédent</button>
            <button class="btn-next" @click="goToImportStep(3)">Suivant — Générer →</button>
          </div>
        </div>

        <!-- Étape 3: Lancement -->
        <div v-if="importStep === 3" class="import-step-content animate-in">
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
              <span class="mode-badge">{{ templateFile ? 'Word (.docx)' : 'PDF' }}</span>
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
            <button class="btn-prev" @click="goToImportStep(2)">← Précédent</button>
          </div>
        </div>

      </div>

      <!-- ════ MODULE SOLDE ════ -->
      <div v-if="activeModule === 'solde'" class="module-content no-pad animate-in">
        <SoldeCompteSimulator />
      </div>

    </template>

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

/* ══════════════════════════════════════════
   PAGE ACCUEIL
══════════════════════════════════════════ */
.hr-home {
  padding: 2rem 1.5rem;
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

/* Grille des 3 cartes */
.feature-cards-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

@media (min-width: 900px) {
  .feature-cards-grid {
    flex-direction: row;
    gap: 1.25rem;
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
    flex: 1;
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
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

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

@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-in { animation: slideIn 0.3s ease-out; }
</style>
