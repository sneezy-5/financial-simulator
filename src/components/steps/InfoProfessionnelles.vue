<script setup>
import { computed } from 'vue'

const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue', 'next', 'prev'])

const data = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const isValid = computed(() => {
  return data.value.contrat && data.value.revenus > 0 && data.value.anciennete >= 0
})
</script>

<template>
  <div class="step-content space-y-6 animate-fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-500">
        💼 Situation Professionnelle
      </h2>
      <p class="text-muted text-sm mt-2">Votre stabilité financière est un atout clé.</p>
    </div>

    <div class="grid-2">
      <div class="col-span-1 md:col-span-2">
        <label>Type de Contrat</label>
        <select v-model="data.contrat">
          <option value="" disabled>Choisir...</option>
          <option value="fonctionnaire">Fonctionnaire</option>
          <option value="cdi">CDI (Contrat à Durée Indéterminée)</option>
          <option value="cdd">CDD (Contrat à Durée Déterminée)</option>
          <option value="independant">Indépendant / Entrepreneur</option>
          <option value="retraite">Retraité</option>
          <option value="autre">Autre</option>
        </select>
      </div>

      <div>
        <label>Revenus Mensuels Nets (FCFA)</label>
        <input type="number" v-model="data.revenus" step="5000" min="0" placeholder="Ex: 500000" />
        <p class="text-xs text-muted mt-1">Le salaire net qui tombe sur votre compte bancaire.</p>
      </div>

      <div>
        <label>Ancienneté (Années)</label>
        <input type="number" v-model="data.anciennete" min="0" placeholder="Ex: 5" />
      </div>
    </div>

    <div class="pt-6 flex justify-between">
      <button @click="$emit('prev')" class="btn-outline">
        👈 Retour
      </button>
      <button 
        @click="$emit('next')" 
        :disabled="!isValid"
        class="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
        Suivant <span>👉</span>
      </button>
    </div>
  </div>
</template>
