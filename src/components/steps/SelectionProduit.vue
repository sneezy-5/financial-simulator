
<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { api } from '../../services/mockData'

const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue', 'next'])

const data = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const banques = ref([])
const prets = ref([])
const loadingBanques = ref(false)
const loadingPrets = ref(false)

// Load banks
onMounted(async () => {
    loadingBanques.value = true
    try {
        banques.value = await api.getBanques()
    } finally {
        loadingBanques.value = false
    }
})

// Watch bank selection
watch(() => data.value.banqueId, async (newId) => {
    prets.value = []
    if (!newId) return
    
    loadingPrets.value = true
    try {
        prets.value = await api.getPretsByBanque(newId)
        // Reset dependent fields if bank changes
        if (data.value.pretId) {
             const currentPret = prets.value.find(p => p.id === data.value.pretId)
             if (!currentPret) data.value.pretId = null
        }
    } finally {
        loadingPrets.value = false
    }
})

const selectedPret = computed(() => prets.value.find(p => p.id === data.value.pretId))

const isValid = computed(() => !!data.value.banqueId && !!data.value.pretId)

const handleNext = () => {
    if (isValid.value) emit('next')
}
</script>

<template>
  <div class="step-content space-y-8 animate-fade-in">
    <div class="text-center mb-6">
      <h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
        🏦 1. Choisissez votre Partenaire
      </h2>
      <p class="text-muted text-sm mt-2">Sélectionnez la banque et le type de financement souhaité.</p>
    </div>

    <!-- Banque Grid -->
    <div class="space-y-4">
        <label class="font-semibold text-lg">Sélectionnez une Banque</label>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div 
                v-for="banque in banques" 
                :key="banque.id"
                @click="data.banqueId = banque.id"
                class="cursor-pointer border rounded-xl p-4 flex flex-col items-center gap-3 transition-all duration-200 relative overflow-hidden group"
                :class="data.banqueId === banque.id 
                    ? 'border-blue-500 bg-slate-800 shadow-[0_0_20px_rgba(59,130,246,0.5)]' 
                    : 'border-gray-700 bg-slate-900 hover:border-gray-500'"
            >
                <div class="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" v-if="data.banqueId !== banque.id"></div>
                <img :src="banque.logo" alt="logo" class="h-10 w-auto object-contain bg-white rounded p-1" />
                <span class="font-bold text-sm text-center">{{ banque.nom }}</span>
                
                <!-- Checkmark -->
                <div v-if="data.banqueId === banque.id" class="absolute top-2 right-2 text-blue-500">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                    </svg>
                </div>
            </div>
        </div>
    </div>

    <!-- Prets List -->
    <div v-if="data.banqueId" class="space-y-4 animate-fade-in">
        <label class="font-semibold text-lg">Type de Prêt</label>
        
        <div class="grid grid-cols-1 gap-3">
             <div 
                v-for="pret in prets" 
                :key="pret.id"
                @click="data.pretId = pret.id"
                class="cursor-pointer p-4 rounded-lg border flex items-center justify-between transition-all hover:bg-slate-800"
                :class="data.pretId === pret.id ? 'border-blue-500 bg-slate-800 ring-1 ring-blue-500' : 'border-gray-700 bg-slate-900/50'"
             >
                <div>
                    <div class="font-bold text-base">{{ pret.nom }}</div>
                    <div class="text-sm text-muted mt-1">{{ pret.description }}</div>
                    <div class="text-xs text-blue-400 mt-2 font-mono bg-blue-900/20 inline-block px-2 py-1 rounded">
                        Taux: {{ pret.taux }}%
                    </div>
                </div>
                <div v-if="data.pretId === pret.id" class="text-blue-500">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
             </div>
        </div>
    </div>

    <!-- Info Box -->
    <div v-if="selectedPret" class="p-5 bg-blue-900/20 border border-blue-900/50 rounded-xl text-sm text-blue-100 animate-fade-in shadow-lg">
        <h4 class="font-bold text-base flex items-center gap-2 mb-4 text-blue-400">
            <span class="text-xl">ℹ️</span> Détails du {{ selectedPret.nom }}
        </h4>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-3">
                <div class="flex flex-col gap-1">
                    <span class="text-xs text-blue-400 font-semibold uppercase tracking-wider">Montants & Durée</span>
                    <p class="font-medium">
                        {{ new Intl.NumberFormat('fr-FR').format(selectedPret.montant_min) }} - 
                        {{ new Intl.NumberFormat('fr-FR').format(selectedPret.montant_max) }} FCFA
                        <span class="block text-xs text-muted mt-0.5">Sur {{ selectedPret.duree_min }} à {{ selectedPret.duree_max }} mois</span>
                    </p>
                </div>

                <div v-if="selectedPret.frais_dossier_grille || (selectedPret.frais_dossier && selectedPret.frais_dossier > 0)" class="flex flex-col gap-1">
                    <span class="text-xs text-blue-400 font-semibold uppercase tracking-wider">Frais de Dossier</span>
                    <div v-if="selectedPret.frais_dossier_grille" class="space-y-1">
                        <div v-for="(g, idx) in selectedPret.frais_dossier_grille" :key="idx" class="text-xs flex justify-between border-b border-blue-900/30 pb-1">
                            <span>Jusqu'à {{ new Intl.NumberFormat('fr-FR').format(g.max) }} F</span>
                            <span class="font-bold">{{ new Intl.NumberFormat('fr-FR').format(g.frais) }} F</span>
                        </div>
                    </div>
                    <p v-else-if="selectedPret.frais_dossier" class="font-medium">
                        {{ selectedPret.frais_dossier }}% du montant
                    </p>
                </div>
            </div>

            <div class="space-y-3 border-l border-blue-900/20 pl-6">
                <span class="text-xs text-blue-400 font-semibold uppercase tracking-wider">Avantages Clés</span>
                <ul class="space-y-2">
                    <li v-for="(avantage, idx) in selectedPret.avantages" :key="idx" class="flex items-start gap-2 text-xs">
                        <span class="text-blue-500 mt-0.5">✓</span>
                        <span>{{ avantage }}</span>
                    </li>
                </ul>
            </div>
        </div>
    </div>

    <div class="pt-6 flex justify-end">
      <button 
        @click="handleNext" 
        :disabled="!isValid"
        class="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
        Continuer <span>👉</span>
      </button>
    </div>
  </div>
</template>
