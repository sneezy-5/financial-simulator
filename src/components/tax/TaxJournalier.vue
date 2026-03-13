<script setup>
import { ref, computed } from 'vue'
import { formatFCFA } from '../../services/taxService.js'

const props = defineProps({
  impotAnnuel: { type: Number, required: true },
  caAnnuel: { type: Number, required: true },
  regime: { type: Object, required: true },
  nom: { type: String, default: '' },
})

const caJour = ref('')
const joursOuverture = ref(26) // jours ouverts par mois (typique)

const caJourNum = computed(() => {
  const raw = String(caJour.value).replace(/[^0-9]/g, '')
  return parseInt(raw, 10) || 0
})

// Taux effectif impôt / CA
const tauxEffectif = computed(() =>
  props.caAnnuel > 0 ? props.impotAnnuel / props.caAnnuel : 0
)

// Provision journalière
const provisionJour = computed(() =>
  Math.round(caJourNum.value * tauxEffectif.value)
)

// Cumul mensuel estimé
const caMoisEstime = computed(() =>
  caJourNum.value * joursOuverture.value
)
const provisionMois = computed(() =>
  Math.round(caMoisEstime.value * tauxEffectif.value)
)

// Représentation visuelle (% de la journée à mettre de côté)
const pctImpot = computed(() =>
  Math.round(tauxEffectif.value * 100)
)

function formatAmount(e) {
  const raw = e.target.value.replace(/[^0-9]/g, '')
  const formatted = raw ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') : ''
  caJour.value = formatted
  e.target.value = formatted
}
</script>

<template>
  <div class="journalier-card">
    <div class="jour-header">
      <div class="jour-title-wrap">
        <div class="jour-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>
          </svg>
        </div>
        <div>
          <div class="jour-title">Calculateur journalier</div>
          <div class="jour-sub">Combien mettre de côté chaque jour pour l'impôt ?</div>
        </div>
      </div>
      <div class="taux-badge">{{ pctImpot }}% de vos ventes → impôt</div>
    </div>

    <div class="jour-body">
      <!-- Saisie CA du jour -->
      <div class="input-section">
        <label class="input-label">Ventes du jour (FCFA)</label>
        <div class="input-row">
          <input
            :value="caJour"
            type="text"
            inputmode="numeric"
            placeholder="Ex : 50 000"
            @input="formatAmount"
          />
          <span class="unit">FCFA</span>
        </div>
        <div class="jours-row">
          <label>Jours ouverts / mois :</label>
          <div class="jours-buttons">
            <button v-for="j in [24, 26, 28, 30]" :key="j" class="jour-btn" :class="{ active: joursOuverture === j }" @click="joursOuverture = j" type="button">{{ j }}</button>
          </div>
        </div>
      </div>

      <!-- Résultats -->
      <div v-if="caJourNum > 0" class="resultats-jour">

        <!-- Provision du jour - mise en avant -->
        <div class="provision-principale">
          <div class="pp-label">À mettre de côté aujourd'hui</div>
          <div class="pp-value">{{ formatFCFA(provisionJour) }} <span class="pp-unit">FCFA</span></div>
          <div class="pp-detail">sur {{ formatFCFA(caJourNum) }} FCFA de ventes</div>
        </div>

        <!-- Barre visuelle -->
        <div class="barre-section">
          <div class="barre-label-row">
            <span>Revenus nets : {{ formatFCFA(caJourNum - provisionJour) }} FCFA</span>
            <span class="barre-impot-label">Impôt : {{ formatFCFA(provisionJour) }} FCFA</span>
          </div>
          <div class="barre-track">
            <div class="barre-net" :style="{ flex: caJourNum - provisionJour }"></div>
            <div class="barre-impot" :style="{ flex: provisionJour }"></div>
          </div>
        </div>

        <!-- Cumul mensuel -->
        <div class="cumul-section">
          <div class="cumul-titre">Estimation mensuelle ({{ joursOuverture }} jours)</div>
          <div class="cumul-grid">
            <div class="cumul-item">
              <div class="ci-label">CA du mois estimé</div>
              <div class="ci-val">{{ formatFCFA(caMoisEstime) }}</div>
            </div>
            <div class="cumul-item highlight">
              <div class="ci-label">À provisionner ce mois</div>
              <div class="ci-val">{{ formatFCFA(provisionMois) }}</div>
            </div>
            <div class="cumul-item">
              <div class="ci-label">Il vous reste</div>
              <div class="ci-val green">{{ formatFCFA(caMoisEstime - provisionMois) }}</div>
            </div>
          </div>
        </div>

        <p class="conseil">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/>
          </svg>
          Ouvrez un compte ou une tirelire séparée. Versez-y <strong>{{ formatFCFA(provisionJour) }} FCFA chaque soir</strong> — à la fin de l'année, l'impôt sera déjà payé.
        </p>
      </div>

      <div v-else class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" style="color:#cbd5e1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"/>
        </svg>
        <p>Entrez vos ventes du jour pour voir la provision à mettre de côté</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.journalier-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }

.jour-header { padding: 1.25rem 1.5rem; background: #f8fafc; border-bottom: 1px solid #f1f5f9; display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; }
.jour-title-wrap { display: flex; align-items: flex-start; gap: 0.75rem; }
.jour-icon { width: 34px; height: 34px; background: #eff6ff; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #1d4ed8; flex-shrink: 0; }
.jour-title { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.jour-sub { font-size: 0.75rem; color: #6b7280; margin-top: 1px; }
.taux-badge { font-size: 0.72rem; font-weight: 600; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 20px; padding: 0.25rem 0.625rem; white-space: nowrap; align-self: flex-start; }

.jour-body { padding: 1.25rem 1.5rem; }

/* Input */
.input-section { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem; }
.input-label { font-size: 0.82rem; font-weight: 600; color: #374151; }
.input-row { display: flex; border: 1.5px solid #d1d5db; border-radius: 8px; overflow: hidden; max-width: 260px; }
.input-row input { flex: 1; border: none; padding: 0.625rem 0.875rem; font-size: 1rem; font-family: inherit; background: white; color: #111827; }
.input-row input:focus { outline: none; }
.unit { padding: 0 0.75rem; font-size: 0.75rem; font-weight: 600; color: #9ca3af; background: #f9fafb; border-left: 1px solid #e5e7eb; display: flex; align-items: center; }

.jours-row { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.jours-row label { font-size: 0.78rem; color: #6b7280; }
.jours-buttons { display: flex; gap: 0.3rem; }
.jour-btn { padding: 0.25rem 0.625rem; border: 1px solid #e2e8f0; border-radius: 6px; background: white; font-size: 0.78rem; font-weight: 600; color: #64748b; cursor: pointer; transition: all 0.12s; }
.jour-btn.active { border-color: #1d4ed8; background: #eff6ff; color: #1d4ed8; }

/* Résultats */
.resultats-jour { display: flex; flex-direction: column; gap: 1rem; }

.provision-principale { background: #1d4ed8; border-radius: 12px; padding: 1.25rem; text-align: center; color: white; }
.pp-label { font-size: 0.78rem; font-weight: 600; opacity: 0.8; margin-bottom: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em; }
.pp-value { font-size: 2rem; font-weight: 800; line-height: 1; }
.pp-unit { font-size: 1rem; font-weight: 600; opacity: 0.7; }
.pp-detail { font-size: 0.78rem; opacity: 0.65; margin-top: 0.25rem; }

/* Barre */
.barre-section { background: #f8fafc; border-radius: 10px; padding: 0.875rem; }
.barre-label-row { display: flex; justify-content: space-between; font-size: 0.75rem; color: #475569; margin-bottom: 0.5rem; }
.barre-impot-label { color: #b91c1c; font-weight: 600; }
.barre-track { display: flex; height: 10px; border-radius: 5px; overflow: hidden; }
.barre-net { background: #15803d; transition: flex 0.4s; }
.barre-impot { background: #dc2626; transition: flex 0.4s; }

/* Cumul */
.cumul-section { background: #f8fafc; border-radius: 10px; padding: 0.875rem; }
.cumul-titre { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.625rem; }
.cumul-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
.cumul-item { text-align: center; padding: 0.625rem 0.375rem; border-radius: 8px; background: white; border: 1px solid #e2e8f0; }
.cumul-item.highlight { border-color: #1d4ed8; background: #eff6ff; }
.ci-label { font-size: 0.68rem; color: #6b7280; margin-bottom: 0.25rem; line-height: 1.3; }
.ci-val { font-size: 0.875rem; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.ci-val.green { color: #15803d; }
.cumul-item.highlight .ci-val { color: #1d4ed8; }

.conseil { display: flex; align-items: flex-start; gap: 0.4rem; font-size: 0.8rem; color: #475569; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.625rem; margin: 0; line-height: 1.5; }
.conseil svg { flex-shrink: 0; margin-top: 2px; color: #15803d; }

.empty-state { text-align: center; padding: 1.5rem; color: #9ca3af; }
.empty-state p { font-size: 0.82rem; margin: 0.5rem 0 0; }

@media (max-width: 640px) {
  .jour-header { padding: 1rem; }
  .jour-body { padding: 1rem; }
  .cumul-grid { grid-template-columns: 1fr; }
  .taux-badge { font-size: 0.68rem; }
}
</style>
