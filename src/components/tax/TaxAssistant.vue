<script setup>
import { ref, computed } from 'vue'
import { SECTEURS, MODELES_COMMERCE, formatFCFA } from '../../services/taxService.js'

const emit = defineEmits(['close', 'apply'])

const step = ref(1)
const data = ref({
  nom: '',
  secteur: '',
  caMois: '',
  hasEmployees: null,
})

const currentModele = computed(() =>
  MODELES_COMMERCE.find(m => m.secteur === data.value.secteur)
)

function next() { step.value++ }
function back() { step.value-- }

function finish() {
  const modele = currentModele.value
  const caMoisNum = parseInt(data.value.caMois.replace(/[^0-9]/g, ''), 10) || 0
  const caAnnuel = caMoisNum * 12

  emit('apply', {
    nom: data.value.nom,
    secteur: data.value.secteur,
    ca: String(caAnnuel).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'),
    chargesFixes: modele ? String(modele.chargesFixesMois).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') : '',
    chargesVariables: modele ? String(Math.round(caAnnuel * modele.chargesVariablesPct)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') : '',
  })
  emit('close')
}

function selectSecteur(id) {
  data.value.secteur = id
  next()
}

function formatAmount(e) {
  const raw = e.target.value.replace(/[^0-9]/g, '')
  data.value.caMois = raw.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
}
</script>

<template>
  <div class="assistant-overlay" @click.self="$emit('close')">
    <div class="assistant-modal">
      <div class="assistant-header">
        <div class="ah-left">
          <div class="bot-avatar">🤖</div>
          <div>
            <div class="ah-title">Assistant ONDA Lite</div>
            <div class="ah-sub">Je vous aide à configurer votre profil</div>
          </div>
        </div>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>

      <div class="assistant-body">
        <!-- Step 1: Nom -->
        <div v-if="step === 1" class="step">
          <div class="msg">Bonjour ! Pour commencer, comment s'appelle votre commerce ?</div>
          <input v-model="data.nom" type="text" placeholder="Ex: Boulangerie Saint-Jean" class="chat-input" @keyup.enter="next" />
          <button v-if="data.nom" class="chat-btn" @click="next">Continuer</button>
        </div>

        <!-- Step 2: Secteur -->
        <div v-if="step === 2" class="step">
          <div class="msg">Ravi de vous rencontrer, <strong>{{ data.nom }}</strong>. Quel est votre domaine d'activité ?</div>
          <div class="secteur-grid">
            <button v-for="s in SECTEURS" :key="s.id" class="s-card" @click="selectSecteur(s.id)">
              <div class="s-icon" v-html="s.icon"></div>
              <span>{{ s.label }}</span>
            </button>
          </div>
        </div>

        <!-- Step 3: CA mensuel -->
        <div v-if="step === 3" class="step">
          <div class="msg">Très bien. Environ combien vendez-vous par <strong>mois</strong> en moyenne ?</div>
          <div class="input-row">
            <input :value="data.caMois" type="text" inputmode="numeric" placeholder="Ex: 500 000" class="chat-input" @input="formatAmount" @keyup.enter="next" />
            <span class="unit">FCFA</span>
          </div>
          <div class="btn-row">
            <button class="chat-btn-sec" @click="back">Retour</button>
            <button v-if="data.caMois" class="chat-btn" @click="next">C'est noté</button>
          </div>
        </div>

        <!-- Step 4: Recap -->
        <div v-if="step === 4" class="step">
          <div class="msg">Parfait ! J'ai toutes les informations.</div>
          <div class="recap-card">
            <p>J'ai préparé une simulation pour <strong>{{ data.nom }}</strong> dans le secteur <strong>{{ SECTEURS.find(s => s.id === data.secteur)?.label }}</strong>.</p>
            <p>J'ai pré-rempli vos charges en me basant sur les moyennes des commerces similaires en Côte d'Ivoire.</p>
          </div>
          <div class="btn-row">
            <button class="chat-btn-sec" @click="back">Modifier</button>
            <button class="chat-btn" @click="finish">Voir mon impôt estimé</button>
          </div>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="assistant-progress">
        <div class="p-bar" :style="{ width: (step / 4) * 100 + '%' }"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assistant-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
.assistant-modal { background: white; width: 100%; max-width: 480px; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); font-family: 'Inter', system-ui, sans-serif; display: flex; flex-direction: column; }

.assistant-header { padding: 1.25rem 1.5rem; background: #f8fafc; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; }
.ah-left { display: flex; align-items: center; gap: 0.875rem; }
.bot-avatar { width: 40px; height: 40px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; }
.ah-title { font-size: 0.95rem; font-weight: 800; color: #0f172a; }
.ah-sub { font-size: 0.75rem; color: #64748b; }
.close-btn { background: none; border: none; font-size: 1.5rem; color: #94a3b8; cursor: pointer; padding: 0.5rem; }

.assistant-body { padding: 1.5rem; min-height: 280px; display: flex; flex-direction: column; justify-content: center; }

.msg { background: #eff6ff; color: #1e40af; padding: 1rem 1.25rem; border-radius: 0 16px 16px 16px; font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.25rem; align-self: flex-start; max-width: 90%; }

.chat-input { width: 100%; padding: 0.875rem 1rem; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 1rem; font-family: inherit; margin-bottom: 1rem; transition: border-color 0.15s; }
.chat-input:focus { outline: none; border-color: #3b82f6; }

.secteur-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
.s-card { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 12px; background: white; cursor: pointer; transition: all 0.15s; }
.s-card:hover { border-color: #3b82f6; background: #f0f9ff; transform: translateY(-2px); }
.s-icon { width: 24px; height: 24px; color: #3b82f6; }
.s-icon :deep(svg) { width: 24px; height: 24px; }
.s-card span { font-size: 0.8rem; font-weight: 600; color: #374151; }

.input-row { display: flex; align-items: center; border: 2px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 1rem; }
.input-row .chat-input { border: none; margin-bottom: 0; }
.unit { padding: 0 1rem; font-size: 0.8rem; font-weight: 700; color: #94a3b8; background: #f8fafc; border-left: 1px solid #e2e8f0; height: 50px; display: flex; align-items: center; }

.btn-row { display: flex; gap: 0.75rem; margin-top: 0.5rem; }
.chat-btn { flex: 1; background: #2563eb; color: white; border: none; padding: 0.875rem; border-radius: 12px; font-size: 0.9rem; font-weight: 700; cursor: pointer; transition: background 0.15s; }
.chat-btn:hover { background: #1d4ed8; }
.chat-btn-sec { background: #f1f5f9; color: #475569; border: none; padding: 0.875rem 1.25rem; border-radius: 12px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }

.recap-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; }
.recap-card p { font-size: 0.85rem; color: #374151; margin: 0 0 0.5rem; line-height: 1.5; }

.assistant-progress { height: 4px; background: #f1f5f9; }
.p-bar { height: 100%; background: #3b82f6; transition: width 0.3s; }

@media (max-width: 480px) {
  .assistant-modal { max-width: 100%; border-radius: 0; height: 100%; }
}
</style>
