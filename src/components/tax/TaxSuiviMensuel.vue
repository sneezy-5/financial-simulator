<script setup>
import { ref, computed } from 'vue'
import { detecterRegime, calculerImpot, formatFCFA } from '../../services/taxService.js'

const props = defineProps({ resultats: Object, params: Object })

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const moisActuel = new Date().getMonth() // 0-indexed

// CA mensuel saisi par l'utilisateur
const caMois = ref(MOIS.map(() => ''))

function formatInput(e, i) {
  const raw = e.target.value.replace(/[^0-9]/g, '')
  const fmt = raw ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') : ''
  caMois.value[i] = fmt
  e.target.value = fmt
}

function parseNum(v) {
  return parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0
}

const caParMois = computed(() => caMois.value.map(v => parseNum(v)))
const caCumul = computed(() => {
  let cum = 0
  return caParMois.value.map(v => (cum += v))
})

const caTotalSaisi = computed(() => caParMois.value.reduce((s, v) => s + v, 0))
const nbMoisSaisis = computed(() => caParMois.value.filter(v => v > 0).length)

// Impôt estimé sur la base du CA saisi
const regimeCourant = computed(() => detecterRegime(caTotalSaisi.value || props.params?.ca || 1))
const impotEstime = computed(() => {
  const ca = caTotalSaisi.value || props.params?.ca || 0
  return calculerImpot({ regime: regimeCourant.value, ca, benefice: ca * 0.3, secteur: props.params?.secteur || 'commerce', cga: props.params?.cga || false })
})
const provisionMensuelle = computed(() => caTotalSaisi.value > 0 ? Math.round(impotEstime.value.impot / 12) : 0)

// Seuil de changement de régime
const seuilProchain = computed(() => regimeCourant.value?.caMax || Infinity)
const distanceSeuil = computed(() => seuilProchain.value - caTotalSaisi.value)
const risqueChangement = computed(() => distanceSeuil.value > 0 && distanceSeuil.value < caTotalSaisi.value * 0.25)

// Marge sur les mois saisis
const caExtrapolé = computed(() => {
  if (nbMoisSaisis.value === 0) return props.params?.ca || 0
  return Math.round((caTotalSaisi.value / nbMoisSaisis.value) * 12)
})
</script>

<template>
  <div class="suivi-card">
    <div class="suivi-header">
      <div class="suivi-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/>
        </svg>
      </div>
      <div>
        <div class="suivi-title">Suivi mensuel du CA réel</div>
        <div class="suivi-sub">Entrez vos ventes mois par mois — l'impôt se calcule en temps réel</div>
      </div>
    </div>

    <!-- Grille des 12 mois -->
    <div class="mois-grid">
      <div v-for="(mois, i) in MOIS" :key="mois" class="mois-item" :class="{ actuel: i === moisActuel, saisi: caParMois[i] > 0, futur: i > moisActuel }">
        <div class="mois-label">{{ mois.slice(0, 3) }}</div>
        <div class="mois-input-wrap">
          <input
            :value="caMois[i]"
            type="text"
            inputmode="numeric"
            :placeholder="i > moisActuel ? '—' : '0'"
            :disabled="i > moisActuel"
            @input="e => formatInput(e, i)"
          />
        </div>
        <div v-if="caParMois[i] > 0" class="mois-mini">{{ formatFCFA(caParMois[i]) }}</div>
        <div v-if="i === moisActuel" class="mois-badge-actuel">Ce mois</div>
      </div>
    </div>

    <!-- Résumé en temps réel -->
    <div v-if="caTotalSaisi > 0" class="suivi-resume">
      <div class="resume-grid">
        <div class="res-item">
          <div class="ri-label">CA saisi ({{ nbMoisSaisis }} mois)</div>
          <div class="ri-val">{{ formatFCFA(caTotalSaisi) }} FCFA</div>
        </div>
        <div class="res-item">
          <div class="ri-label">CA annuel extrapolé</div>
          <div class="ri-val">{{ formatFCFA(caExtrapolé) }} FCFA</div>
        </div>
        <div class="res-item highlight">
          <div class="ri-label">Impôt estimé sur l'année</div>
          <div class="ri-val">{{ formatFCFA(impotEstime.impot) }} FCFA</div>
        </div>
        <div class="res-item">
          <div class="ri-label">À mettre de côté / mois</div>
          <div class="ri-val">{{ formatFCFA(provisionMensuelle) }} FCFA</div>
        </div>
      </div>

      <!-- Progression annuelle -->
      <div class="progression">
        <div class="prog-label-row">
          <span>Progression annuelle</span>
          <span>{{ Math.round((caTotalSaisi / (caExtrapolé || 1)) * 100) }}%</span>
        </div>
        <div class="prog-track">
          <div class="prog-fill" :style="{ width: Math.min(100, Math.round((caTotalSaisi / (caExtrapolé || 1)) * 100)) + '%' }"></div>
          <!-- Marqueur seuil de régime -->
          <div v-if="seuilProchain < Infinity" class="prog-seuil" :style="{ left: Math.min(99, Math.round((seuilProchain / caExtrapolé) * 100)) + '%' }" title="Seuil de changement de régime"></div>
        </div>
        <div class="prog-legend">
          <span>0</span>
          <span v-if="seuilProchain < Infinity" class="seuil-label">Seuil {{ formatFCFA(seuilProchain) }}</span>
        </div>
      </div>

      <!-- Alerte changement de régime -->
      <div v-if="risqueChangement" class="alerte-regime">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
        <div>
          <strong>Attention :</strong> À ce rythme, votre CA annuel extrapolé (<strong>{{ formatFCFA(caExtrapolé) }} FCFA</strong>) approche du seuil de {{ formatFCFA(seuilProchain) }} FCFA. Si vous dépassez ce seuil, vous changerez automatiquement de régime fiscal l'année prochaine. Consultez la DGI.
        </div>
      </div>
    </div>

    <div v-else class="suivi-empty">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" style="color:#cbd5e1">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/>
      </svg>
      <p>Saisissez votre CA de chaque mois passé pour un suivi précis</p>
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.suivi-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }

.suivi-header { display: flex; align-items: flex-start; gap: 0.75rem; padding: 1.25rem 1.5rem; background: #f8fafc; border-bottom: 1px solid #f1f5f9; }
.suivi-icon { width: 34px; height: 34px; background: #eff6ff; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #1d4ed8; flex-shrink: 0; }
.suivi-title { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.suivi-sub { font-size: 0.75rem; color: #6b7280; margin-top: 1px; }

/* Grille des 12 mois */
.mois-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.5rem; padding: 1.25rem 1.5rem; }
.mois-item { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 0.5rem 0.25rem; border: 1px solid #f1f5f9; border-radius: 8px; background: #fafafa; position: relative; transition: all 0.15s; }
.mois-item.actuel { border-color: #bfdbfe; background: #eff6ff; }
.mois-item.saisi { border-color: #bbf7d0; background: #f0fdf4; }
.mois-item.futur { opacity: 0.45; }

.mois-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #9ca3af; }
.mois-item.actuel .mois-label { color: #1d4ed8; }
.mois-item.saisi .mois-label { color: #15803d; }

.mois-input-wrap input { width: 100%; border: 1px solid #e2e8f0; border-radius: 5px; padding: 0.3rem 0.25rem; font-size: 0.7rem; text-align: center; font-family: inherit; background: white; }
.mois-input-wrap input:focus { outline: none; border-color: #1d4ed8; }
.mois-input-wrap input:disabled { background: #f9fafb; cursor: not-allowed; }
.mois-mini { font-size: 0.6rem; color: #15803d; font-weight: 600; }
.mois-badge-actuel { position: absolute; top: -7px; left: 50%; transform: translateX(-50%); background: #1d4ed8; color: white; font-size: 0.55rem; font-weight: 700; padding: 1px 5px; border-radius: 4px; white-space: nowrap; }

/* Résumé */
.suivi-resume { padding: 1rem 1.5rem; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 0.875rem; }
.resume-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.625rem; }
.res-item { padding: 0.75rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
.res-item.highlight { background: #eff6ff; border-color: #bfdbfe; }
.ri-label { font-size: 0.72rem; color: #6b7280; margin-bottom: 0.2rem; }
.ri-val { font-size: 1rem; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.res-item.highlight .ri-val { color: #1d4ed8; }

/* Progression */
.progression { background: #f8fafc; border-radius: 8px; padding: 0.75rem; }
.prog-label-row { display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 600; color: #475569; margin-bottom: 0.4rem; }
.prog-track { height: 8px; background: #e2e8f0; border-radius: 4px; position: relative; overflow: hidden; }
.prog-fill { height: 100%; background: linear-gradient(90deg, #1d4ed8, #2563eb); border-radius: 4px; transition: width 0.5s; }
.prog-seuil { position: absolute; top: 0; height: 100%; width: 2px; background: #dc2626; z-index: 1; }
.prog-legend { display: flex; justify-content: space-between; font-size: 0.65rem; color: #9ca3af; margin-top: 0.2rem; }
.seuil-label { color: #dc2626; font-weight: 600; }

/* Alerte */
.alerte-regime { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.75rem; background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; font-size: 0.8rem; color: #78350f; line-height: 1.5; }
.alerte-regime svg { flex-shrink: 0; margin-top: 1px; color: #d97706; }

.suivi-empty { text-align: center; padding: 1.5rem; color: #9ca3af; }
.suivi-empty p { font-size: 0.82rem; margin: 0.5rem 0 0; }

@media (max-width: 640px) {
  .suivi-header { padding: 1rem; }
  .mois-grid { grid-template-columns: repeat(3, 1fr); padding: 1rem; }
  .resume-grid { grid-template-columns: 1fr; }
  .suivi-resume { padding: 1rem; }
}
</style>
