<script setup>
import { ref, computed } from 'vue'
import { FAMILLES } from '../../services/financialAnalysisService.js'

const props = defineProps({
  ratios: { type: Array, required: true },
})

const onglets = Object.values(FAMILLES)
const activeOnglet = ref(onglets[0])

const ratiosAffiches = computed(() => props.ratios.filter(r => r.famille === activeOnglet.value))

const compteParNiveau = (niveau) => props.ratios.filter(r => r.niveau === niveau).length

function formatValeur(ratio) {
  const v = ratio.valeurN
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  switch (ratio.unite) {
    case '%': return (v * 100).toFixed(1).replace('.', ',') + ' %'
    case 'FCFA': return new Intl.NumberFormat('fr-FR').format(Math.round(v)) + ' FCFA'
    case 'x': return v.toFixed(2).replace('.', ',') + ' x'
    case 'jours': return Math.round(v) + ' j'
    case 'années': return v.toFixed(1).replace('.', ',') + ' ans'
    default: return v.toFixed(2)
  }
}

function amelioration(ratio) {
  if (ratio.evolution === null || ratio.evolution === undefined) return null
  return ratio.sens === 'haut' ? ratio.evolution > 0 : ratio.evolution < 0
}
</script>

<template>
  <div class="ratios-resultats">
    <div class="synthese-bar">
      <div class="synthese-item bon"><span class="pastille"></span>{{ compteParNiveau('bon') }} indicateurs bons</div>
      <div class="synthese-item moyen"><span class="pastille"></span>{{ compteParNiveau('moyen') }} à surveiller</div>
      <div class="synthese-item faible"><span class="pastille"></span>{{ compteParNiveau('faible') }} en zone de risque</div>
    </div>

    <div class="onglets">
      <button
        v-for="o in onglets" :key="o"
        class="onglet-btn" :class="{ active: activeOnglet === o }"
        @click="activeOnglet = o"
      >{{ o }}</button>
    </div>

    <div class="ratios-grid">
      <div v-for="r in ratiosAffiches" :key="r.id" class="ratio-card" :class="r.niveau">
        <div class="ratio-header">
          <span class="ratio-label">{{ r.label }}</span>
          <span class="niveau-badge" :class="r.niveau">{{ r.niveau === 'bon' ? 'Bon' : r.niveau === 'moyen' ? 'Moyen' : 'Faible' }}</span>
        </div>
        <div class="ratio-valeur">{{ formatValeur(r) }}</div>
        <div class="ratio-footer">
          <span v-if="r.valeurN1 !== null" class="valeur-n1">N-1 : {{ formatValeur({ ...r, valeurN: r.valeurN1 }) }}</span>
          <span v-if="r.evolution !== null" class="evolution" :class="amelioration(r) ? 'up' : 'down'">
            {{ r.evolution >= 0 ? '↑' : '↓' }} {{ Math.abs(r.evolution * 100).toFixed(1).replace('.', ',') }} %
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ratios-resultats {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.synthese-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.synthese-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.9rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 700;
}
.synthese-item .pastille { width: 8px; height: 8px; border-radius: 50%; }
.synthese-item.bon { background: #ecfdf5; color: #047857; }
.synthese-item.bon .pastille { background: #10b981; }
.synthese-item.moyen { background: #fffbeb; color: #b45309; }
.synthese-item.moyen .pastille { background: #f59e0b; }
.synthese-item.faible { background: #fef2f2; color: #b91c1c; }
.synthese-item.faible .pastille { background: #ef4444; }

.onglets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.75rem;
}
.onglet-btn {
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.onglet-btn:hover { border-color: var(--primary); color: var(--primary); }
.onglet-btn.active { background: var(--primary); border-color: var(--primary); color: #fff; }

.ratios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

.ratio-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 4px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.1rem;
}
.ratio-card.bon { border-left-color: #10b981; }
.ratio-card.moyen { border-left-color: #f59e0b; }
.ratio-card.faible { border-left-color: #ef4444; }

.ratio-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
.ratio-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  line-height: 1.3;
}
.niveau-badge {
  flex-shrink: 0;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
}
.niveau-badge.bon { background: #d1fae5; color: #047857; }
.niveau-badge.moyen { background: #fef3c7; color: #b45309; }
.niveau-badge.faible { background: #fee2e2; color: #b91c1c; }

.ratio-valeur {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--text-dark);
  margin-bottom: 0.5rem;
}

.ratio-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.72rem;
  color: var(--text-muted);
}
.evolution { font-weight: 700; }
.evolution.up { color: #059669; }
.evolution.down { color: #dc2626; }
</style>
