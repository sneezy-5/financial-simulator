<script setup>
import { computed } from 'vue'

const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue', 'next'])

const data = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const isValid = computed(() => {
  return data.value.age >= 18 && data.value.situation && data.value.personnesCharge >= 0
})
</script>

<template>
  <div class="step-content space-y-6 animate-fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
        👤 Informations Personnelles
      </h2>
      <p class="text-muted text-sm mt-2">Pour commencer, apprenez-nous en un peu plus sur vous.</p>
    </div>

    <div class="grid-2">
      <div>
        <label>Âge (années)</label>
        <input type="number" v-model="data.age" placeholder="Ex: 30" min="18" max="99" />
      </div>
      
      <div>
        <label>Situation Familiale</label>
        <select v-model="data.situation">
          <option value="" disabled>Choisir...</option>
          <option value="celibataire">Célibataire</option>
          <option value="marie">Marié(e)</option>
          <option value="divorce">Divorcé(e)</option>
          <option value="veuf">Veuf/Veuve</option>
        </select>
      </div>

      <div>
        <label>Personnes à charge (Enfants, etc.)</label>
        <input type="number" v-model="data.personnesCharge" min="0" placeholder="0" />
      </div>
    </div>

    <div class="pt-6 flex justify-end">
      <button 
        @click="$emit('next')" 
        :disabled="!isValid"
        class="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
        Suivant <span>👉</span>
      </button>
    </div>
  </div>
</template>
