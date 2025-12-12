
<script setup>
import { ref, reactive, computed } from 'vue'

// Steps Components - ORDER RESET TO PLAN
import InfoPersonnelles from './steps/InfoPersonnelles.vue'
import InfoProfessionnelles from './steps/InfoProfessionnelles.vue'
import SituationFinanciere from './steps/SituationFinanciere.vue'
import ParametresPret from './steps/ParametresPret.vue' // New Step 4
import SimulatorResults from './SimulatorResults.vue'

const currentStep = ref(1)
const TOTAL_STEPS = 5

// Data Store
const formData = reactive({
    // A. Infos Perso
    age: null,
    situation: '',
    personnesCharge: 0,
    
    // B. Infos Pro
    contrat: '',
    revenus: null,
    anciennete: null,

    // C. Finances
    hasCredits: false,
    creditMensualite: 0,
    historiqueCredit: 'bon',
    loyer: 0,
    autresCharges: 0,

    // D. Pret (To be filled in Step 4)
    banqueId: null,
    pretId: null,
    montant: 0,
    duree: 0,
})

// Progress
const progress = computed(() => {
    return ((currentStep.value - 1) / (TOTAL_STEPS - 1)) * 100
})

const nextStep = () => { if (currentStep.value < TOTAL_STEPS) currentStep.value++ }
const prevStep = () => { if (currentStep.value > 1) currentStep.value-- }
</script>

<template>
  <div class="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center">
    
    <!-- Branding -->
    <div class="text-center mb-8 relative z-20">
      <h1 class="text-4xl font-extrabold tracking-tight drop-shadow-lg">
          <span class="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
              Simulateur de Prêt
          </span>
      </h1>
      <p class="text-slate-400 mt-2 text-lg">Votre analyse financière complète en 4 étapes.</p>
    </div>

    <!-- Wizard Container -->
    <div class="w-full max-w-4xl glass-card overflow-hidden shadow-2xl relative z-10 animate-fade-in flex flex-col min-h-[550px]">
        
        <!-- Progress Bar -->
        <div class="h-1.5 bg-slate-700 w-full">
            <div 
                class="h-full bg-gradient-to-r from-blue-500 to-pink-500 transition-all duration-500"
                :style="{ width: progress + '%' }"
            ></div>
        </div>

        <!-- Step Indicator -->
        <div class="flex justify-between px-6 py-4 border-b border-white/5 bg-slate-900/30 text-xs uppercase tracking-wider text-muted font-semibold overflow-x-auto">
            <span class="whitespace-nowrap mr-4" :class="{ 'text-blue-400': currentStep >= 1 }">1. Personnel</span>
            <span class="whitespace-nowrap mr-4" :class="{ 'text-blue-400': currentStep >= 2 }">2. Professionnel</span>
            <span class="whitespace-nowrap mr-4" :class="{ 'text-blue-400': currentStep >= 3 }">3. Finances</span>
            <span class="whitespace-nowrap mr-4" :class="{ 'text-blue-400': currentStep >= 4 }">4. Prêt</span>
            <span class="whitespace-nowrap" :class="{ 'text-blue-400': currentStep >= 5 }">5. Résultats</span>
        </div>

        <!-- Dynamic Content -->
        <div class="p-6 md:p-10 flex-grow relative">
            <transition name="fade-slide" mode="out-in">
                
                <!-- 1. Perso -->
                <InfoPersonnelles 
                    v-if="currentStep === 1" 
                    v-model="formData" 
                    @next="nextStep"
                />

                <!-- 2. Pro -->
                <InfoProfessionnelles
                    v-else-if="currentStep === 2"
                    v-model="formData"
                    @next="nextStep"
                    @prev="prevStep"
                />

                <!-- 3. Finances -->
                <SituationFinanciere
                    v-else-if="currentStep === 3"
                    v-model="formData"
                    @next="nextStep"
                    @prev="prevStep"
                />

                <!-- 4. Parametres Pret (New Final Config Step) -->
                <ParametresPret
                    v-else-if="currentStep === 4"
                    v-model="formData"
                    @next="nextStep"
                    @prev="prevStep"
                />

                <!-- 5. Résultats -->
                <SimulatorResults
                    v-else-if="currentStep === 5"
                    :data="formData"
                    @restart="currentStep = 1"
                />

            </transition>
        </div>

    </div>



  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.4s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(15px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-15px);
}
</style>
