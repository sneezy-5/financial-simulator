<template>
  <div class="local-db-container animate-fade-in">
    <!-- Header Confidentialité & Mode PWA -->
    <div class="privacy-hero-card">
      <div class="hero-left">
        <div class="shield-badge">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
        </div>
        <div>
          <h2 class="hero-title">Base de Données Locale & Confidentialité Totale RH</h2>
          <p class="hero-subtitle">
            Toutes les données nominatives de vos employés, salaires et historiques de bulletins sont enregistrées <strong>exclusivement sur votre appareil</strong>.
          </p>
        </div>
      </div>

      <div class="pwa-install-box" v-if="canInstallPwa">
        <button @click="installPwa" class="btn-install-pwa">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
          <span>Installer l'App PWA RH</span>
        </button>
      </div>
    </div>

    <!-- KPIs Statistiques Générées en Local -->
    <div class="local-kpi-grid">
      <div class="kpi-box">
        <div class="kpi-header">
          <span class="kpi-icon icon-emp">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </span>
          <span class="kpi-tag">BD Locale</span>
        </div>
        <div class="kpi-value">{{ stats.employeeCount }}</div>
        <div class="kpi-label">Employés en BD Locale</div>
      </div>

      <div class="kpi-box">
        <div class="kpi-header">
          <span class="kpi-icon icon-runs">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </span>
          <span class="kpi-tag">Traitements</span>
        </div>
        <div class="kpi-value">{{ stats.totalBulletins }}</div>
        <div class="kpi-label">Bulletins de Paie Générés</div>
      </div>

      <div class="kpi-box">
        <div class="kpi-header">
          <span class="kpi-icon icon-masse">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>
          </span>
          <span class="kpi-tag">Calculé en Local</span>
        </div>
        <div class="kpi-value font-mono">{{ formatFcfa(stats.totalMasseSalariale) }}</div>
        <div class="kpi-label">Masse Salariale Traitée</div>
      </div>

      <div class="kpi-box">
        <div class="kpi-header">
          <span class="kpi-icon icon-cnps">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M12 6h.01"></path><path d="M12 10h.01"></path><path d="M12 14h.01"></path><path d="M16 10h.01"></path><path d="M16 14h.01"></path><path d="M8 10h.01"></path><path d="M8 14h.01"></path></svg>
          </span>
          <span class="kpi-tag">Cotisations</span>
        </div>
        <div class="kpi-value font-mono">{{ formatFcfa(stats.totalCNPS + stats.totalImpots) }}</div>
        <div class="kpi-label">Cotisations CNPS & Impôts Salaires</div>
      </div>

      <div class="kpi-box">
        <div class="kpi-header">
          <span class="kpi-icon icon-its-ci" style="color: #f59e0b;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M16 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>
          </span>
          <span class="kpi-tag" style="background: #fef3c7; color: #d97706;">
            {{ countryRules.libelleImpotSalarial.split(' (')[0] }} {{ props.country }}
          </span>
        </div>
        <div class="kpi-value font-mono">{{ formatFcfa(stats.totalImpotsCountry) }}</div>
        <div class="kpi-label">Impôts {{ countryRules.libelleImpotSalarial.split(' (')[0] }} {{ countryRules.name }}</div>
      </div>
    </div>

    <!-- Actions Sauvegarde & Restauration -->
    <div class="db-actions-section">
      <div class="actions-card">
        <h3>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 0.25rem; color: #38bdf8;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          Gestion de votre Sauvegarde Locale
        </h3>
        <p class="subtext">
          Conservez une copie autonome de vos données RH ou migrez-les vers un autre ordinateur/terminal.
        </p>

        <div class="actions-buttons-row">
          <button @click="handleExport" class="btn-action-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Exporter la BD Locale (.json)</span>
          </button>

          <label class="btn-action-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Restaurer une Sauvegarde</span>
            <input type="file" accept=".json" @change="handleImport" style="display: none;" />
          </label>
        </div>

        <div v-if="msg" class="status-msg" :class="msgType">
          {{ msg }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { localDb } from '../services/localDatabase.js'
import { getCountryRules } from '../services/countryConfig.js'

const props = defineProps({
  country: {
    type: String,
    default: 'CI'
  }
})

const stats = ref({
  employeeCount: 0,
  runsCount: 0,
  totalBulletins: 0,
  totalMasseSalariale: 0,
  totalCNPS: 0,
  totalImpots: 0,
  totalImpotsCountry: 0
})

const msg = ref('')
const msgType = ref('success')
const canInstallPwa = ref(false)
let deferredPrompt = null

const countryRules = computed(() => getCountryRules(props.country))

const loadStats = async () => {
  try {
    stats.value = await localDb.getLocalStats(props.country)
  } catch (e) {
    console.error("Erreur stats locales:", e)
  }
}

watch(() => props.country, () => {
  loadStats()
})

const formatFcfa = (val) => {
  return Math.round(val || 0).toLocaleString('fr-FR') + ' FCFA'
}

const handleExport = async () => {
  try {
    await localDb.exportBackup()
    msg.value = "Sauvegarde locale téléchargée avec succès !"
    msgType.value = "success"
  } catch (e) {
    msg.value = "Erreur lors de l'exportation: " + e.message
    msgType.value = "error"
  }
}

const handleImport = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      await localDb.importBackup(e.target.result)
      await loadStats()
      msg.value = "Restauration effectuée avec succès !"
      msgType.value = "success"
    } catch (err) {
      msg.value = "Erreur d'importation: " + err.message
      msgType.value = "error"
    }
  }
  reader.readAsText(file)
}

onMounted(() => {
  loadStats()

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    canInstallPwa.value = true
  })
})

const installPwa = async () => {
  if (!deferredPrompt) return
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  if (outcome === 'accepted') {
    canInstallPwa.value = false
  }
  deferredPrompt = null
}
</script>

<style scoped>
.local-db-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.privacy-hero-card {
  background: #f8fafc;
  border-radius: 16px;
  padding: 1.75rem;
  color: #0f172a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
}

.hero-left {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.shield-badge {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #10b981;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.hero-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
}

.hero-subtitle {
  margin: 0.35rem 0 0 0;
  font-size: 0.875rem;
  color: #64748b;
  line-height: 1.4;
  max-width: 620px;
}

.btn-install-pwa {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  border: none;
  padding: 0.75rem 1.25rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.25);
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-install-pwa:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
}

/* KPIs */
.local-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
}

.kpi-box {
  background: #ffffff;
  border-radius: 14px;
  padding: 1.25rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.kpi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.kpi-icon {
  font-size: 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3b82f6;
}

.kpi-tag {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  text-transform: uppercase;
  border: 1px solid #e2e8f0;
}

.kpi-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
}

.kpi-label {
  font-size: 0.8rem;
  color: #64748b;
  margin-top: 0.25rem;
  font-weight: 600;
}

/* Actions Section */
.db-actions-section {
  background: #f8fafc;
  border-radius: 16px;
  padding: 1.5rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  color: #0f172a;
}

.actions-card h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f172a;
}

.subtext {
  font-size: 0.9rem;
  color: #64748b;
  margin: 0.5rem 0 0 0;
}

.actions-buttons-row {
  display: flex;
  gap: 1rem;
  margin-top: 1.25rem;
  flex-wrap: wrap;
}

.btn-action-primary {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #ffffff;
  border: none;
  padding: 0.7rem 1.2rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.25);
  transition: all 0.2s;
}

.btn-action-primary:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
  transform: translateY(-1px);
}

.btn-action-secondary {
  background: #ffffff;
  color: #475569;
  border: 1px solid #e2e8f0;
  padding: 0.7rem 1.2rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
}

.btn-action-secondary:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.status-msg {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
}

.status-msg.success {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}

.status-msg.error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, monospace;
}

@media (max-width: 640px) {
  .privacy-hero-card {
    flex-direction: column !important;
    align-items: center !important;
    text-align: center !important;
    padding: 1.25rem !important;
  }
  
  .hero-left {
    flex-direction: column !important;
    align-items: center !important;
    text-align: center !important;
    gap: 1rem !important;
  }
  
  .hero-title {
    font-size: 1.15rem !important;
    text-align: center !important;
  }
  
  .hero-subtitle {
    font-size: 0.85rem !important;
    text-align: center !important;
    margin-top: 0.5rem !important;
  }
}
</style>
