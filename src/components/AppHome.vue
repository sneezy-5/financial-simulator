<script setup>
import { computed } from 'vue'
import CountrySelector from './CountrySelector.vue'
import { getCountryRules } from '../services/countryConfig.js'
import { user, logout } from '../services/auth.js'

const props = defineProps({
  country: {
    type: String,
    default: 'CI'
  }
})

const emit = defineEmits(['navigate', 'country-changed', 'require-auth', 'require-billing'])

const countryRules = computed(() => getCountryRules(props.country))

const fcfa = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + countryRules.value.currency

const modules = computed(() => [
  {
    id: 'loan',
    pilier: 'PILIER 1',
    titre: 'Comprendre le Crédit',
    sous: 'Banques & Prêts',
    description: `Simulateur de mensualités, TEG et capacité d'emprunt.`,
    avantages: ['Mensualité', 'Taux & TEG', 'Scoring'],
    couleur: '#38bdf8',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z"/></svg>`,
  },
  {
    id: 'hr',
    pilier: 'PILIER 2',
    titre: 'Espace RH',
    sous: `Bulletin & Cotisations`,
    description: `Calculs de salaire net, impôts ITS et cotisations sociales.`,
    avantages: ['Calcul Net', 'ITS & CNSS', 'Expatriés'],
    couleur: '#c084fc',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/></svg>`,
  },
  {
    id: 'tax',
    pilier: 'PILIER 3',
    titre: 'Fiscalité PME',
    sous: `Impôts Entreprise`,
    description: `Comparatif d'impôts et aide au choix de régime fiscal.`,
    avantages: ['Impôt PME', 'Choix du Régime', 'TPS & Réel'],
    couleur: '#34d399',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"/></svg>`,
  },
  {
    id: 'outils_pro',
    pilier: 'PILIER 4',
    titre: 'Santé Financière',
    sous: 'Marge & Rentabilité',
    description: `Détermination du point mort, des prix et de la marge brute.`,
    avantages: ['Prix de Vente', 'Marge Brute', 'Point Mort'],
    couleur: '#60a5fa',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l5.654-4.654m5.896-2.613l.617-.923a2.25 2.25 0 00-.933-3.26 2.25 2.25 0 01-2.206-2.22V5.25A2.25 2.25 0 009 3H5.25A2.25 2.25 0 003 5.25v3.75A2.25 2.25 0 005.25 11.25h2.206c.98 0 1.815.7 2.004 1.66l.047.234c.11.55.421 1.04.869 1.38z"/></svg>`,
  }
])
</script>

<template>
  <div class="home-page">
    <!-- Sticky Glass Header -->
    <header class="home-header">
      <div class="home-header-inner" style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
        <div class="logo-area">
          <div class="logo-icon-box">
            <img src="/logo.png?v=2" alt="ONDA Logo" class="logo-img" />
          </div>
          <div>
            <div class="logo-name">ONDA <span class="logo-badge-lite">LITE</span></div>
            <div class="logo-sub">Plateforme Financière & Paie</div>
          </div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <CountrySelector :country="props.country" @change-country="(c) => emit('country-changed', c)" />
          
          <div v-if="user" style="display: flex; align-items: center; gap: 0.5rem;">
            <button @click="emit('require-billing')" style="background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; font-weight: 800; font-size: 0.75rem; padding: 0.35rem 0.75rem; border-radius: 9999px; cursor: pointer; display: flex; align-items: center; gap: 0.35rem; transition: all 0.2s;" title="Recharger mes crédits">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #f59e0b;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              {{ user.credits || 0 }} crédits
            </button>
            <button @click="emit('open-profile')" style="background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; font-weight: 700; font-size: 0.75rem; padding: 0.35rem 0.8rem; border-radius: 9999px; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08);" title="Mon Profil Client (Cliquer pour éditer)">
              <span style="width: 20px; height: 20px; border-radius: 50%; background: #4f46e5; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 800;">
                {{ (user.name || user.companyName || user.email || 'U').substring(0, 1).toUpperCase() }}
              </span>
              <span style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #0f172a; font-weight: 700;">
                {{ user.companyName || user.name || user.email }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Hero Executive Card (Dark Midnight Navy) -->
    <div class="country-card-wrapper animate-in">
      <div class="country-card">
        <div class="country-card-header">
          <div class="country-badge">
            <img :src="countryRules.flagUrl" :alt="countryRules.name" class="country-flag-img-lg" />
            <div class="country-text-box">
              <span class="country-title">{{ countryRules.name }}</span>
              <span class="region-pill">{{ countryRules.region }}</span>
            </div>
          </div>
        </div>
        
        <div class="country-metrics">
          <div class="metric-chip">
            <span class="chip-label">Caisse Retraite</span>
            <span class="chip-val">{{ countryRules.organismeRetraite }}</span>
          </div>
          <div class="metric-chip">
            <span class="chip-label">Impôt Employeur</span>
            <span class="chip-val">{{ countryRules.libelleImpotEmployeur }}</span>
          </div>
          <div class="metric-chip smig-chip">
            <span class="chip-label">SMIG Légal</span>
            <span class="chip-val">{{ fcfa(countryRules.smig) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Modules Grid -->
    <div class="modules-section">
      <div class="modules-header">
        <h2>4 PILIERS FINANCIERS — {{ countryRules.name.toUpperCase() }}</h2>
        <div class="header-line"></div>
      </div>

      <div class="modules-grid">
        <div
          v-for="m in modules"
          :key="m.id"
          class="module-card"
          @click="emit('navigate', m.id)"
        >
          <div class="module-left">
            <div class="module-icon-wrap">
              <span v-html="m.icon" class="module-icon-svg"></span>
            </div>
          </div>
          
          <div class="module-right">
            <div class="module-meta">
              <span class="module-sous">{{ m.sous }}</span>
              <span class="pilier-tag">{{ m.pilier }}</span>
            </div>
            
            <h3 class="module-titre">{{ m.titre }}</h3>
            <p class="module-desc">{{ m.description }}</p>
            
            <div class="module-tags-container">
              <span 
                v-for="a in m.avantages" 
                :key="a" 
                class="module-tag-pill"
              >
                {{ a }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f8fafc;
  padding-bottom: 5rem;
  color: #0f172a;
}

/* Header Glassmorphism */
.home-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
  padding: 0.75rem 0;
  box-shadow: 0 4px 20px -5px rgba(0, 0, 0, 0.03);
}

.home-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.logo-icon-box {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 5px rgba(0,0,0,0.05);
}

.logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.logo-name {
  font-size: 1.2rem;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: -0.02em;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.logo-badge-lite {
  font-size: 0.65rem;
  font-weight: 800;
  background: #2563eb;
  color: white;
  padding: 1px 6px;
  border-radius: 6px;
  letter-spacing: 0.05em;
}

.logo-sub {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 500;
}

/* Executive Light Country Card */
.country-card-wrapper {
  max-width: 1200px;
  margin: 1.5rem auto 2.5rem auto;
  padding: 0 1.5rem;
  box-sizing: border-box;
}

.country-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  box-sizing: border-box;
  width: 100%;
  color: #0f172a;
}

.country-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.country-badge {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.country-flag-img-lg {
  width: 32px;
  height: 22px;
  object-fit: cover;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}

.country-text-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.country-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.region-pill {
  font-size: 0.68rem;
  font-weight: 800;
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  padding: 0.15rem 0.6rem;
  border-radius: 12px;
}

.status-live {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: #047857;
  background: #f0fdf4;
  border: 1px solid #d1fae5;
  padding: 0.35rem 0.85rem;
  border-radius: 20px;
  letter-spacing: 0.03em;
}

.live-dot {
  width: 7px;
  height: 7px;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 8px #34d399;
}

/* Metric Chips (Executive Style) */
.country-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.85rem;
  width: 100%;
  box-sizing: border-box;
}

.metric-chip {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  transition: background 0.2s;
}

.metric-chip:hover {
  background: #f1f5f9;
}

.chip-label {
  font-size: 0.68rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.chip-val {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  margin-top: 0.25rem;
}

/* High contrast accent for SMIG without harsh green */
.smig-chip {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.smig-chip .chip-label {
  color: #2563eb;
}

.smig-chip .chip-val {
  color: #1d4ed8;
}

/* Intro Section */
.home-intro {
  text-align: center;
  margin: 3rem 1.5rem 2.5rem 1.5rem;
}

.hero-tag {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 800;
  color: #2563eb;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  padding: 0.3rem 0.85rem;
  border-radius: 20px;
  margin-bottom: 1rem;
  letter-spacing: 0.05em;
}

.home-intro h1 {
  font-size: 2.25rem;
  font-weight: 900;
  color: #0f172a;
  margin-bottom: 0.75rem;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.hero-highlight {
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.home-intro p {
  font-size: 1.05rem;
  color: #64748b;
  max-width: 680px;
  margin: 0 auto;
  line-height: 1.6;
}

/* Modules Grid */
.modules-section {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.modules-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.modules-header h2 {
  font-size: 0.85rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
  white-space: nowrap;
  margin: 0;
}

.header-line {
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}

.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 1.25rem;
}

.module-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 1.15rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  box-sizing: border-box;
}

.module-card:hover {
  transform: translateY(-4px) scale(1.01);
  box-shadow: 0 20px 35px rgba(0, 0, 0, 0.1);
  border-color: #cbd5e1;
  background: #f8fafc;
}

.module-left {
  flex-shrink: 0;
}

.module-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eff6ff;
  color: #3b82f6;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
}

.module-icon-svg {
  width: 22px;
  height: 22px;
  display: flex;
}

.module-right {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.module-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.module-sous {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #3b82f6;
}

.pilier-tag {
  font-size: 0.6rem;
  font-weight: 800;
  padding: 0.15rem 0.45rem;
  border-radius: 20px;
  background: #f8fafc;
  color: #64748b;
  border: 1px solid #e2e8f0;
  letter-spacing: 0.06em;
}

.module-titre {
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.35rem 0;
  letter-spacing: -0.01em;
}

.module-desc {
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.4;
  margin: 0 0 0.75rem 0;
}

.module-tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0;
}

.module-tag-pill {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .home-header-inner {
    flex-direction: column;
    align-items: stretch;
    padding: 0 1rem;
    gap: 0.75rem;
  }
  
  .country-card-wrapper {
    padding: 0 1rem;
    margin-top: 1rem;
  }
  
  .country-card {
    padding: 1.25rem;
    border-radius: 16px;
  }
  
  .country-metrics {
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }
  
  .home-intro {
    margin: 2rem 1rem 1.5rem 1rem;
  }
  
  .home-intro h1 {
    font-size: 1.45rem;
  }
  
  .home-intro p {
    font-size: 0.9rem;
  }

  .modules-section {
    padding: 0 1rem;
  }
  
  .modules-grid {
    grid-template-columns: 1fr !important;
  }
}

@media (max-width: 480px) {
  .module-card {
    flex-direction: column !important;
    align-items: center !important;
    text-align: center !important;
    padding: 1.25rem !important;
  }
  
  .module-meta {
    flex-direction: column !important;
    gap: 0.35rem !important;
    align-items: center !important;
    margin-bottom: 0.5rem !important;
  }
  
  .module-titre {
    font-size: 1.15rem !important;
  }
  
  .module-desc {
    font-size: 0.8rem !important;
    text-align: center !important;
  }
  
  .module-tags-container {
    justify-content: center !important;
  }
}
</style>
