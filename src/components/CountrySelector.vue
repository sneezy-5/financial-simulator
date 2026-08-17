<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  country: {
    type: String,
    default: 'CI'
  }
})

const selectedCountry = ref(props.country)

watch(() => props.country, (newVal) => {
  selectedCountry.value = newVal
})

const countries = [
  { code: 'CI', flagUrl: 'https://flagcdn.com/w40/ci.png', name: 'Côte d\'Ivoire' },
  { code: 'BJ', flagUrl: 'https://flagcdn.com/w40/bj.png', name: 'Bénin' },
  { code: 'TG', flagUrl: 'https://flagcdn.com/w40/tg.png', name: 'Togo' }
]

const emit = defineEmits(['change-country'])

const select = (code) => {
  selectedCountry.value = code
  emit('change-country', code)
}
</script>


<template>
  <div class="country-selector-wrap">
    <div class="selector-badge">
      <span class="selector-label">Réglementation :</span>
    </div>
    <div class="country-pills-container">
      <button 
        v-for="c in countries" 
        :key="c.code"
        :class="{ active: selectedCountry === c.code }"
        @click="select(c.code)"
        class="country-pill-btn"
      >
        <img :src="c.flagUrl" :alt="c.name" class="country-flag" />
        <span class="country-name">{{ c.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.country-selector-wrap {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #f8fafc;
  padding: 4px 6px;
  border-radius: 9999px;
  border: 1px solid #e2e8f0;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.03);
  max-width: 100%;
  box-sizing: border-box;
}

.selector-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 8px;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background: #3b82f6;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.selector-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.country-pills-container {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  flex: 1;
}

.country-pills-container::-webkit-scrollbar {
  display: none;
}

.country-pill-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  flex-shrink: 0;
}

.country-flag {
  width: 18px;
  height: 13px;
  object-fit: cover;
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.country-pill-btn:hover {
  color: #0f172a;
  background: rgba(241, 245, 249, 0.8);
}

.country-pill-btn.active {
  background: #ffffff;
  color: #1e40af;
  font-weight: 800;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
}

@media (max-width: 640px) {
  .country-selector-wrap {
    width: 100%;
    justify-content: space-between;
  }
  .selector-label {
    display: none; /* Simplification sur mobile pour gagner de la place */
  }
  .selector-badge {
    padding-left: 6px;
  }
  .country-pill-btn {
    padding: 6px 10px;
    font-size: 0.76rem;
  }
}
</style>
