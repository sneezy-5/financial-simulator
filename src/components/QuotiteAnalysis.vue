<script setup>
import { ref, computed } from 'vue'

// Inputs
const revenus = ref(500000)
const dureeMois = ref(20) // Based on 3.5M / 175k example roughly
const tauxInteret = ref(5) // Example rate

const charges = ref({
  loyer: 0,
  autresCredits: 50000,
  chargesFamiliales: 0,
  nbPersonnes: 1 // Borrower
})

const nouveauPret = ref({
  montant: 2150000 // approx to get ~120k/mo for 20 months at 5%?
  // Let's just allow user to input Montant, Duree, Taux -> Calculate Mensualité
})
// Or maybe user inputs Mensualité directly?
// The prompt says "Mensualité de ce nouveau prêt: 120 000".
// I will calculate Mensualité from Amount/Duration/Rate.
// Let's adjust default amount to match ~120k for 20 months. pmt(5%, 20, 2.3M) approx.
// 120000 * 20 = 2.4M. 
// Let's set default Amount = 2,250,000.

const montantEmprunt = ref(2250000)

// Format currency
const fcfa = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'XOF',
  maximumFractionDigits: 0
})

// Calculations ---------------------------

// 1. Mensualité Nouveau Prêt
const mensualite = computed(() => {
  const r = tauxInteret.value / 100 / 12
  const n = dureeMois.value
  const P = montantEmprunt.value
  if (n <= 0) return 0
  if (r === 0) return P / n
  return (P * r) / (1 - Math.pow(1 + r, -n))
})

// 2. Charges
const chargesFixes = computed(() => {
  return (charges.value.loyer || 0) + 
         (charges.value.autresCredits || 0) + 
         (charges.value.chargesFamiliales || 0)
})

const totalCharges = computed(() => chargesFixes.value + mensualite.value)

// 3. Quotité
const quotiteLegalePct = 35
const quotiteCiblePct = 30

const montantMaxCharges = computed(() => revenus.value * (quotiteLegalePct / 100))
const montantRecommande = computed(() => revenus.value * (quotiteCiblePct / 100))

const quotiteUtiliseePct = computed(() => {
  if (revenus.value === 0) return 0
  return (totalCharges.value / revenus.value) * 100
})

const quotiteDisponiblePct = computed(() => {
  return Math.max(0, quotiteLegalePct - quotiteUtiliseePct.value)
})

const montantDisponibleRestant = computed(() => {
   // How much more can be borrowed in terms of Monthly Payment?
   return Math.max(0, montantMaxCharges.value - totalCharges.value)
})

const statutQuotite = computed(() => {
  if (quotiteUtiliseePct.value > quotiteLegalePct) return { label: 'REFUS AUTOMATIQUE', color: 'text-danger', icon: 'icon-x' }
  if (quotiteUtiliseePct.value > quotiteCiblePct) return { label: 'LIMITE ATTEINTE', color: 'text-warning', icon: 'icon-warning' }
  return { label: 'CONFORTABLE', color: 'text-success', icon: 'icon-check' }
})

const progressColor = computed(() => {
  if (quotiteUtiliseePct.value > quotiteLegalePct) return 'bg-danger'
  if (quotiteUtiliseePct.value > quotiteCiblePct) return 'bg-warning'
  return 'bg-success'
})

// 4. Reste à vivre
const resteAVivre = computed(() => revenus.value - totalCharges.value)
const resteAVivreMin = computed(() => {
  // 150k base + 50k per dependent
  const dependents = Math.max(0, charges.value.nbPersonnes - 1)
  return 150000 + (dependents * 50000)
})

const statutResteAVivre = computed(() => {
  if (resteAVivre.value < resteAVivreMin.value) return { label: 'INSUFFISANT', color: 'text-danger' }
  return { label: 'CONFORTABLE', color: 'text-success' }
})

// 5. Capacité d'Emprunt (Total Max Power)
// Assuming this means "If I had NO loads, what could I borrow?" OR "Given my revenues, what is the max theoretical loan?"
// The example: "Capacité d'Emprunt Maximale : 3 500 000 FCFA" (with 500k rev).
// Max Monthly = 175k. 
// If Duration = 20 months (derived from earlier), Max Princ = PV(Rate, 20, 175k).
const capaciteEmpruntMax = computed(() => {
  const maxMonthly = revenus.value * (quotiteLegalePct / 100)
  const r = tauxInteret.value / 100 / 12
  const n = dureeMois.value
  if (n <= 0) return 0
  if (r === 0) return maxMonthly * n
  return (maxMonthly * (1 - Math.pow(1 + r, -n))) / r
})

// Taux de remboursement ? (Optional metric mentioned: "Pourcentage du prêt remboursé chaque mois" ?)
// User said: "TAUX DE REMBOURSEMENT : Pourcentage du prêt remboursé chaque mois".
// This is typically 1/N (principal) or Pmt/Principal?
// "Vitesse de remboursement". 
// Maybe MonthlyPayment / Principal * 100 ?
const tauxRemboursement = computed(() => {
  if (montantEmprunt.value === 0) return 0
  return (mensualite.value / montantEmprunt.value) * 100
})

</script>

<template>
  <div class="quotite-analysis max-w-4xl mx-auto space-y-8">
    
    <!-- Header -->
    <div class="header text-center space-y-2">
      <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-blue-500">
        Simulation & Analyse Financière
      </h1>
      <p class="text-muted">Analysez votre capacité d'emprunt en temps réel.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      
      <!-- Input Section -->
      <div class="card space-y-6">
        <h2 class="text-xl font-semibold border-b border-gray-700 pb-2 mb-4 flex items-center gap-2">
            <span class="icon-svg icon-list"></span> Vos Informations
        </h2>

        <!-- Revenus -->
        <div class="form-group">
          <label class="block text-sm font-medium mb-1 flex items-center gap-2">
            <span class="icon-svg icon-money"></span> Revenus Mensuels (FCFA)
          </label>
          <input type="number" v-model="revenus" step="5000" class="w-full" />
        </div>

        <!-- Charges -->
        <div class="space-y-4">
            <h3 class="text-sm font-semibold text-muted uppercase tracking-wider">Charges Fixes</h3>
            <div class="grid grid-cols-1 gap-4">
                <div>
                    <label class="block text-xs mb-1 flex items-center gap-1">
                        <span class="icon-svg icon-home" style="width:14px;height:14px;"></span> Loyer / Logement
                    </label>
                    <input type="number" v-model="charges.loyer" class="w-full" />
                </div>
                <div>
                    <label class="block text-xs mb-1 flex items-center gap-1">
                        <span class="icon-svg icon-card" style="width:14px;height:14px;"></span> Autres Crédits en cours
                    </label>
                    <input type="number" v-model="charges.autresCredits" class="w-full" />
                </div>
                 <div>
                    <label class="block text-xs mb-1 flex items-center gap-1">
                        <span class="icon-svg icon-user" style="width:14px;height:14px;"></span> Charges Familiales / Divers
                    </label>
                    <input type="number" v-model="charges.chargesFamiliales" class="w-full" />
                </div>
            </div>
        </div>

        <!-- Foyer -->
        <div class="form-group">
             <label class="block text-sm font-medium mb-1 flex items-center gap-2">
                <span class="icon-svg icon-user"></span> Nombre de personnes au foyer
             </label>
             <input type="number" v-model="charges.nbPersonnes" min="1" class="w-full" />
        </div>

        <!-- Nouveau Prêt -->
        <div class="space-y-4 pt-4 border-t border-gray-700">
            <h3 class="text-sm font-semibold text-muted uppercase tracking-wider">Nouveau Prêt</h3>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs mb-1">Montant Demandé</label>
                    <input type="number" v-model="montantEmprunt" step="50000" class="w-full" />
                </div>
                 <div>
                    <label class="block text-xs mb-1">Durée (Mois)</label>
                    <input type="number" v-model="dureeMois" class="w-full" />
                </div>
                 <div class="col-span-2">
                    <label class="block text-xs mb-1">Taux d'intérêt (%)</label>
                    <input type="number" v-model="tauxInteret" step="0.1" class="w-full" />
                </div>
            </div>
             <div class="bg-slate-800 p-3 rounded flex justify-between items-center">
                <span>Mensualité estimée :</span>
                <span class="font-bold text-lg text-blue-400">{{ fcfa.format(mensualite) }}</span>
            </div>
        </div>

      </div>

      <!-- Analysis Section -->
      <div class="space-y-6">
        
        <!-- 1. Analyse Situation -->
        <div class="card space-y-4">
            <h2 class="text-xl font-semibold border-b border-gray-700 pb-2 flex items-center gap-2">
                <span class="icon-svg icon-chart"></span> Analyse de votre situation
            </h2>

            <!-- Summary Table -->
             <div class="space-y-3 text-sm">
                <div class="flex justify-between items-center">
                    <div class="tooltip-container">
                        <span class="border-b border-dotted border-gray-500">Quotité Légale (Max)</span>
                        <div class="tooltip-text">La loi interdit de dépasser ce seuil (35%) pour protéger l'emprunteur du surendettement.</div>
                    </div>
                    <span>35% (<span class="text-muted">{{ fcfa.format(montantMaxCharges) }}</span>)</span>
                </div>
                <div class="flex justify-between items-center">
                     <div class="tooltip-container">
                        <span class="border-b border-dotted border-gray-500">Quotité Cible</span>
                        <div class="tooltip-text">Seuil recommandé (30%) pour garder une marge de sécurité en cas d'imprévus.</div>
                    </div>
                    <span class="text-warning">30% (<span class="text-muted">{{ fcfa.format(montantRecommande) }}</span>)</span>
                </div>
             </div>

             <!-- Visual Bar -->
             <div class="mt-4">
                <div class="flex justify-between text-xs mb-1">
                    <span>0%</span>
                    <span>35% (Max)</span>
                </div>
                <div class="h-4 bg-gray-700 rounded-full overflow-hidden relative">
                    <!-- Target Line -->
                    <div class="absolute top-0 bottom-0 w-0.5 bg-white z-10" style="left: 30%;"></div>
                    <!-- Max Line -->
                    <div class="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style="left: 35%;"></div>
                    
                    <!-- Progress -->
                    <div class="h-full transition-all duration-500"
                         :class="{
                            'bg-green-500': quotiteUtiliseePct <= 30,
                            'bg-yellow-500': quotiteUtiliseePct > 30 && quotiteUtiliseePct <= 35,
                            'bg-red-500': quotiteUtiliseePct > 35
                         }"
                         :style="{ width: Math.min(quotiteUtiliseePct, 100) + '%' }">
                    </div>
                </div>
                <div class="flex justify-between text-xs mt-1 font-bold" :class="statutQuotite.color">
                    <span>Utilisé : {{ quotiteUtiliseePct.toFixed(1) }}%</span>
                    <span>{{ statutQuotite.label }}</span>
                </div>
             </div>
        </div>

        <!-- 2. Detail Metrics -->
        <div class="card space-y-4">
             <h2 class="text-xl font-semibold border-b border-gray-700 pb-2 flex items-center gap-2">
                <span class="icon-svg icon-chart"></span> Détails & Indicateurs
             </h2>

             <div class="space-y-4">
                 <!-- Quotité Utilisée / Disponible -->
                 <div class="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                    <div>
                         <div class="text-sm text-muted flex items-center gap-1">
                             <span class="icon-svg icon-x" style="width:14px;height:14px;"></span> Quotité Utilisée
                         </div>
                         <div class="font-bold text-lg">{{ quotiteUtiliseePct.toFixed(1) }}%</div>
                         <div class="text-xs text-muted">{{ fcfa.format(totalCharges) }} / mois</div>
                    </div>
                     <div class="text-right">
                         <div class="text-sm text-muted flex items-center justify-end gap-1">
                             Quotité Disponible <span class="icon-svg icon-check" style="width:14px;height:14px;"></span>
                         </div>
                         <div class="font-bold text-lg">{{ quotiteDisponiblePct.toFixed(1) }}%</div>
                         <div class="text-xs text-muted text-green-400">
                             +{{ fcfa.format(montantDisponibleRestant) }} / mois
                         </div>
                    </div>
                 </div>

                 <!-- Reste à vivre -->
                 <div class="p-3 bg-slate-800/50 rounded-lg">
                     <div class="flex justify-between items-center mb-1">
                        <div class="tooltip-container">
                            <span class="text-sm text-muted border-b border-dotted border-gray-500 flex items-center gap-1">
                                <span class="icon-svg icon-money" style="width:14px;height:14px;"></span> Reste à Vivre
                            </span>
                            <div class="tooltip-text">Argent disponible pour manger, se déplacer et vivre après paiement de toutes les charges.</div>
                        </div>
                        <span class="font-bold text-lg">{{ fcfa.format(resteAVivre) }}</span>
                     </div>
                     <div class="flex justify-between text-xs">
                         <span class="text-muted">Min recommandé: {{ fcfa.format(resteAVivreMin) }}</span>
                         <span :class="statutResteAVivre.color">{{ statutResteAVivre.label }}</span>
                     </div>
                 </div>

                 <!-- Capacite Max -->
                  <div class="p-3 bg-slate-800/50 rounded-lg border border-blue-500/30">
                     <div class="flex justify-between items-center mb-1">
                        <div class="tooltip-container">
                            <span class="text-sm text-blue-300 border-b border-dotted border-blue-500 flex items-center gap-1">
                                <span class="icon-svg icon-chart" style="width:14px;height:14px;"></span> Capacité d'Emprunt Max
                            </span>
                            <div class="tooltip-text">Montant total théorique que vous pourriez emprunter sur {{ dureeMois }} mois avec vos revenus actuels (sans autres crédits).</div>
                        </div>
                        <span class="font-bold text-lg text-blue-300">{{ fcfa.format(capaciteEmpruntMax) }}</span>
                     </div>
                     <div class="text-xs text-muted text-right">
                         Basée sur 35% de quotité max
                     </div>
                 </div>

             </div>
        </div>

      </div>

    </div>
  </div>
</template>

<style scoped>
.bg-danger { background-color: var(--danger); }
.bg-warning { background-color: var(--warning); }
.bg-success { background-color: var(--success); }
</style>
