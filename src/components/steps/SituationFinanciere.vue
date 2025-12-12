<script setup>
import { computed } from 'vue'

const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue', 'next', 'prev'])

const data = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const isValid = computed(() => {
  return true 
})
</script>

<template>
  <div class="step-content space-y-6 animate-fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
        💰 Situation Financière
      </h2>
      <p class="text-muted text-sm mt-2">Détaillez vos charges actuelles.</p>
    </div>

    <div class="space-y-6">
      
      <div class="card bg-slate-800/50 border-0">
        <div class="flex items-center justify-between mb-4">
          <label class="mb-0 cursor-pointer">Avez-vous des crédits en cours ?</label>
          <div class="flex items-center gap-4">
             <label class="flex items-center gap-2 cursor-pointer font-normal">
                <input type="radio" :value="true" v-model="data.hasCredits" class="w-4 h-4" /> Oui
             </label>
             <label class="flex items-center gap-2 cursor-pointer font-normal">
                <input type="radio" :value="false" v-model="data.hasCredits" class="w-4 h-4" /> Non
             </label>
          </div>
        </div>

        <div v-if="data.hasCredits" class="animate-fade-in">
            <label>Montant total des mensualités actuelles (FCFA)</label>
            <input type="number" v-model="data.creditMensualite" step="1000" placeholder="Ex: 50000" />
        </div>
      </div>

        <div>
        <label>Historique de crédit</label>
        <select v-model="data.historiqueCredit">
            <option value="premier">Premier crédit (Jamais emprunté)</option>
            <option value="bon">Bon historique (Toujours remboursé à temps)</option>
            <option value="moyen">Quelques retards par le passé</option>
            <option value="mauvais">Incidents de paiement / Contentieux</option>
        </select>
        </div>

      <div class="grid-2">
          <div>
            <label>Loyer / Logement (FCFA)</label>
            <input type="number" v-model="data.loyer" min="0" placeholder="0 if owner" />
          </div>
          <div>
            <label>Autres charges fixes (Électricité, Eau, Transport)</label>
            <input type="number" v-model="data.autresCharges" min="0" placeholder="Ex: 50000" />
          </div>
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
