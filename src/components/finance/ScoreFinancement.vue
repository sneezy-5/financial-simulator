<script setup>
import { computed } from 'vue'
import ScoreGauge from './ScoreGauge.vue'

const props = defineProps({
  resultat: { type: Object, required: true }, // { score, niveau, motifs }
})

const CONFIG_NIVEAU = {
  'eligible': { color: '#22c55e', label: 'Éligible au financement', classe: 'eligible',
    description: "Les indicateurs financiers de l'entreprise sont globalement dans les normes attendues pour un dossier de financement bancaire." },
  'sous-conditions': { color: '#f59e0b', label: 'Éligible sous conditions', classe: 'sous-conditions',
    description: "Certains indicateurs sont à surveiller. Un dossier de financement reste envisageable, avec des garanties ou des justificatifs complémentaires." },
  'non-eligible': { color: '#ef4444', label: "Non éligible en l'état", classe: 'non-eligible',
    description: "Plusieurs indicateurs clés sont en zone de risque. Il est recommandé de consolider la structure financière avant de déposer un dossier." },
}

const config = computed(() => CONFIG_NIVEAU[props.resultat.niveau] || CONFIG_NIVEAU['sous-conditions'])
</script>

<template>
  <div class="score-financement" :class="config.classe">
    <ScoreGauge :score="resultat.score" :color="config.color" :size="140" />
    <div class="score-details">
      <span class="score-label" :style="{ color: config.color }">{{ config.label }}</span>
      <p class="score-description">{{ config.description }}</p>
      <ul v-if="resultat.motifs && resultat.motifs.length" class="score-motifs">
        <li v-for="(m, i) in resultat.motifs" :key="i">{{ m }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.score-financement {
  display: flex;
  align-items: center;
  gap: 1.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.75rem;
}
@media (max-width: 560px) {
  .score-financement { flex-direction: column; text-align: center; }
}

.score-details { flex: 1; }

.score-label {
  display: block;
  font-size: 1.15rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
}

.score-description {
  margin: 0 0 0.75rem 0;
  font-size: 0.88rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.score-motifs {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: var(--text-body);
}
</style>
