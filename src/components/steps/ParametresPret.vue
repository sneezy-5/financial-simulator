<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { api } from '../../services/mockData'

const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue', 'next', 'prev'])

const data = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const banques = ref([])
const prets = ref([])
const loadingBanques = ref(false)

onMounted(async () => {
    loadingBanques.value = true
    banques.value = await api.getBanques()
    loadingBanques.value = false
    
    if (data.value.banqueId) {
        prets.value = await api.getPretsByBanque(data.value.banqueId)
    }
})

watch(() => data.value.banqueId, async (newId) => {
    if (!newId) return
    prets.value = await api.getPretsByBanque(newId)
    if (!prets.value.find(p => p.id === data.value.pretId)) {
        data.value.pretId = null
    }
})

watch(() => data.value.pretId, (newId) => {
    if (!newId) return
    const p = prets.value.find(x => x.id === newId)
    if (p) {
        if (data.value.montant < p.montant_min || data.value.montant > p.montant_max) {
             data.value.montant = p.montant_min
        }
        if (data.value.duree < p.duree_min || data.value.duree > p.duree_max) {
             data.value.duree = p.duree_min
        }
    }
})

const selectedPret = computed(() => prets.value.find(p => p.id === data.value.pretId))

const constraints = computed(() => {
    if (!selectedPret.value) return { minAmount: 0, maxAmount: 0, minDuration: 0, maxDuration: 0 }
    return {
        minAmount: selectedPret.value.montant_min,
        maxAmount: selectedPret.value.montant_max,
        minDuration: selectedPret.value.duree_min,
        maxDuration: selectedPret.value.duree_max
    }
})

const fcfa = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 })

const mensualiteEstimee = computed(() => {
    if (!selectedPret.value) return 0
    const r = (selectedPret.value.taux / 100) / 12
    const n = data.value.duree
    const P = data.value.montant
    if (n === 0) return 0
    return (P * r) / (1 - Math.pow(1 + r, -n))
})

const isValid = computed(() => {
    return !!data.value.banqueId && !!data.value.pretId
})
</script>

<template>
  <div class="step-content space-y-6 animate-fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-rose-500">
        📝 Détails du Prêt Souhaité
      </h2>
      <p class="text-muted text-sm mt-2">Dernière étape avant vos résultats.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <div>
            <label class="block mb-2 font-semibold">Choisir la Banque</label>
            <div class="grid grid-cols-2 gap-3">
                <div 
                    v-for="b in banques" :key="b.id"
                    @click="data.banqueId = b.id"
                    class="cursor-pointer border border-gray-700 rounded-lg p-3 flex flex-col items-center gap-2 hover:bg-slate-800 transition-colors"
                    :class="{'bg-slate-800 border-blue-500 ring-1 ring-blue-500': data.banqueId === b.id}"
                >
                    <img :src="b.logo" class="h-8 w-auto bg-white rounded p-0.5" />
                    <span class="text-xs font-bold">{{ b.nom }}</span>
                </div>
            </div>
        </div>

        <div class="space-y-3">
            <label class="block font-semibold">Type de Prêt</label>
            <select v-model="data.pretId" :disabled="!data.banqueId" class="w-full">
                <option :value="null">-- Sélectionner --</option>
                <option v-for="p in prets" :key="p.id" :value="p.id">
                    {{ p.nom }} ({{ p.taux }}%)
                </option>
            </select>
            
            <div v-if="selectedPret" class="p-3 bg-blue-900/20 border border-blue-800 rounded text-xs text-blue-200">
                {{ selectedPret.description }} <br/>
                <span class="opacity-70">{{ selectedPret.conditions }}</span>
            </div>
        </div>
    </div>

    <div v-if="selectedPret" class="card bg-slate-800/50 space-y-6 mt-4 animate-fade-in">
        
        <div>
            <div class="flex justify-between items-end mb-2">
                <label class="mb-0">Montant (FCFA)</label>
                <span class="text-xl font-bold text-emerald-400">{{ fcfa.format(data.montant) }}</span>
            </div>
            <input 
                type="range" v-model.number="data.montant"
                :min="constraints.minAmount" :max="constraints.maxAmount" step="100000"
                class="w-full accent-emerald-500 cursor-pointer"
            />
            <div class="flex justify-between text-xs text-muted">
                <span>{{ fcfa.format(constraints.minAmount) }}</span>
                <span>{{ fcfa.format(constraints.maxAmount) }}</span>
            </div>
        </div>

        <div>
             <div class="flex justify-between items-end mb-2">
                <label class="mb-0">Durée (Mois)</label>
                <span class="text-xl font-bold text-orange-400">{{ data.duree }} mois</span>
            </div>
            <input 
                type="range" v-model.number="data.duree"
                :min="constraints.minDuration" :max="constraints.maxDuration" step="1"
                class="w-full accent-orange-500 cursor-pointer"
            />
             <div class="flex justify-between text-xs text-muted">
                <span>{{ constraints.minDuration }} mois</span>
                <span>{{ constraints.maxDuration }} mois</span>
            </div>
        </div>

        <div class="pt-4 border-t border-gray-700 flex justify-between items-center">
            <span class="text-sm text-muted">Mensualité Estimée :</span>
            <span class="text-2xl font-bold text-white">{{ fcfa.format(mensualiteEstimee) }}</span>
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
        VOIR LES RÉSULTATS 🚀
      </button>
    </div>

  </div>
</template>
