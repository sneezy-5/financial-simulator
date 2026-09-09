<script setup>
defineProps({
  score: { type: Number, required: true },
  color: { type: String, default: '#3b82f6' },
  size: { type: Number, default: 100 },
})
</script>

<template>
  <div class="score-gauge" :style="{ width: size + 'px', height: size + 'px' }">
    <svg viewBox="0 0 100 100" style="transform: rotate(-90deg);">
      <circle cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" stroke-width="10" />
      <circle
        cx="50" cy="50" r="45" fill="none" :stroke="color" stroke-width="10" stroke-linecap="round"
        :stroke-dasharray="283"
        :stroke-dashoffset="283 - (283 * Math.min(Math.max(score, 0), 100) / 100)"
        style="transition: stroke-dashoffset 1s ease, stroke 0.3s ease"
      />
    </svg>
    <div class="score-gauge-center">
      <span class="score-gauge-value">{{ Math.round(score) }}</span>
      <span class="score-gauge-suffix">/100</span>
    </div>
  </div>
</template>

<style scoped>
.score-gauge {
  position: relative;
  flex-shrink: 0;
}
.score-gauge svg {
  width: 100%;
  height: 100%;
}
.score-gauge-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.score-gauge-value {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-dark);
  line-height: 1;
}
.score-gauge-suffix {
  font-size: 0.65rem;
  color: var(--text-muted);
  margin-top: 2px;
}
</style>
