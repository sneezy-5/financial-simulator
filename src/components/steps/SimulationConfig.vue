
<script setup>
import { computed, onMounted, watch } from 'vue'
import { api } from '../../services/mockData'
import { ref } from 'vue'

const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue', 'next', 'prev'])

const data = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const currentPret = ref(null)

onMounted(async () => {
    if (data.value.banqueId && data.value.pretId) {
        const prets = await api.getPretsByBanque(data.value.banqueId)
        currentPret.value = prets.find(p => p.id === data.value.pretId)
        
        // Initialize defaults if out of bounds
        if (currentPret.value) {
            if (data.value.montant < currentPret.value.montant_min) data.value.montant = currentPret.value.montant_min
            if (data.value.montant > currentPret.value.montant_max) data.value.montant = currentPret.value.montant_max
            
            if (data.value.duree < currentPret.value.duree_min) data.value.duree = currentPret.value.duree_min
            if (data.value.duree > currentPret.value.duree_max) data.value.duree = currentPret.value.duree_max
        }
    }
})

const constraints = computed(() => {
    if (!currentPret.value) return { minAmount: 0, maxAmount: 0, minDuration: 0, maxDuration: 0 }
    return {
        minAmount: currentPret.value.montant_min,
        maxAmount: currentPret.value.montant_max,
        minDuration: currentPret.value.duree_min,
        maxDuration: currentPret.value.duree_max
    }
})

const fcfa = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 })

const mensualiteEstimee = computed(() => {
    if (!currentPret.value) return 0
    const r = (currentPret.value.taux / 100) / 12
    const n = data.value.duree
    const P = data.value.montant
    return (P * r) / (1 - Math.pow(1 + r, -n))
})

const isValid = computed(() => {
   const c = constraints.value
   return data.value.montant >= c.minAmount && 
          data.value.montant <= c.maxAmount &&
          data.value.duree >= c.minDuration &&
          data.value.duree <= c.maxDuration
})
</script>

<template>
  <div class="step-content space-y-8 animate-fade-in">
    <div class="text-center mb-6">
      <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-green-500">
        ⚙️ 2. Configuration du Prêt
      </h2>
      <p class="text-muted text-sm mt-2">Définissez le montant et la durée adaptés à votre budget.</p>
    </div>

    <!-- Config Card -->
    <div class="card space-y-8 bg-slate-800/50">
        
        <!-- Montant -->
        <div class="space-y-4">
             <div class="flex justify-between items-end">
                <label class="font-bold text-lg">Montant souhaité</label>
                <div class="text-2xl font-bold text-emerald-400 bg-emerald-900/20 px-3 py-1 rounded">
                    {{ fcfa.format(data.montant) }}
                </div>
            </div>
            
            <input 
                type="range" 
                v-model.number="data.montant" 
                :min="constraints.minAmount" 
                :max="constraints.maxAmount" 
                step="50000" 
                class="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
            />
            
            <div class="flex justify-between text-xs text-muted font-mono">
                <span>Min: {{ fcfa.format(constraints.minAmount) }}</span>
                <span>Max: {{ fcfa.format(constraints.maxAmount) }}</span>
            </div>
        </div>

        <!-- Duree -->
        <div class="space-y-4 pt-4 border-t border-gray-700">
             <div class="flex justify-between items-end">
                <label class="font-bold text-lg">Durée de remboursement</label>
                <div class="text-2xl font-bold text-orange-400 bg-orange-900/20 px-3 py-1 rounded">
                    {{ data.duree }} Mois
                </div>
            </div>
            
             <input 
                type="range" 
                v-model.number="data.duree" 
                :min="constraints.minDuration" 
                :max="constraints.maxDuration" 
                step="1" 
                class="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-400 transition-all"
            />
            
             <div class="flex justify-between text-xs text-muted font-mono">
                <span>Min: {{ constraints.minDuration }} mois</span>
                <span>Max: {{ constraints.maxDuration }} mois</span>
            </div>
        </div>

    </div>

    <!-- Summary Box -->
    <div class="p-6 bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl border border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
            <div class="text-sm text-muted mb-1">Estimation Mensualité</div>
            <div class="text-3xl font-bold text-white">{{ fcfa.format(mensualiteEstimee) }}</div>
        </div>
        <div class="text-xs text-right text-muted max-w-[200px]">
            *Hors assurance. Calculé sur la base d'un taux de {{ currentPret?.taux }}%.
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
        Valider & Continuer <span>👉</span>
      </button>
    </div>
  </div>
</template>
