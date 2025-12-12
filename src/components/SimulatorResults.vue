<script setup>
import { computed, ref, onMounted } from 'vue'
import { api } from '../services/mockData'

const props = defineProps(['data'])
const emit = defineEmits(['restart'])

const fcfa = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0
})

const currentPret = ref(null)
const currentBanque = ref(null)

onMounted(async () => {
    if (props.data.banqueId) {
        const banks = await api.getBanques()
        currentBanque.value = banks.find(b => b.id === props.data.banqueId)
        
        const loans = await api.getPretsByBanque(props.data.banqueId)
        currentPret.value = loans.find(p => p.id === props.data.pretId)
    }
})

const calculMensualite = computed(() => {
    if (!currentPret.value || !props.data.montant || !props.data.duree) return 0
    const P = props.data.montant
    const r = (currentPret.value.taux / 100) / 12
    const n = props.data.duree
    return (P * r) / (1 - Math.pow(1 + r, -n))
})

const calculTotalCout = computed(() => {
    return calculMensualite.value * props.data.duree
})

const calculTotalInteret = computed(() => {
    return calculTotalCout.value - props.data.montant
})

const revenus = computed(() => props.data.revenus || 0)
const chargesFixes = computed(() => {
    let total = (props.data.loyer || 0) + (props.data.autresCharges || 0)
    if (props.data.hasCredits && props.data.creditMensualite) {
        total += props.data.creditMensualite
    }
    return total
})
const totalChargesApresPret = computed(() => chargesFixes.value + calculMensualite.value)

const quotiteLegalePct = 35
const quotiteUtiliseePct = computed(() => {
    if (revenus.value === 0) return 0
    return (totalChargesApresPret.value / revenus.value) * 100
})
const quotiteDisponiblePct = computed(() => Math.max(0, quotiteLegalePct - quotiteUtiliseePct.value))
const resteAVivre = computed(() => revenus.value - totalChargesApresPret.value)

const scoreCredit = computed(() => {
    let score = 0
    if (revenus.value > 1000000) score += 30
    else if (revenus.value > 500000) score += 20
    else score += 10
    
    const age = props.data.age
    if (age >= 25 && age <= 45) score += 15
    else if (age < 25) score += 10
    else score += 5
    
    if (['fonctionnaire', 'cdi'].includes(props.data.contrat)) score += 20
    else if (props.data.contrat === 'retraite') score += 15
    else score += 10
    
    if (props.data.anciennete > 5) score += 10
    else if (props.data.anciennete > 2) score += 5
    else score += 2
    
    if (props.data.historiqueCredit === 'bon') score += 25
    if (props.data.historiqueCredit === 'premier') score += 15
    if (props.data.historiqueCredit === 'moyen') score += 5
    
    return score
})

const scoreColor = computed(() => {
    if (scoreCredit.value >= 80) return 'text-success'
    if (scoreCredit.value >= 60) return 'text-primary'
    if (scoreCredit.value >= 40) return 'text-warning'
    return 'text-danger'
})

const decision = computed(() => {
    const reasons = []
    let isEligible = true
    
    if (quotiteUtiliseePct.value > quotiteLegalePct) {
        isEligible = false
        reasons.push(`Quotité trop élevée (${quotiteUtiliseePct.value.toFixed(1)}% > 35%)`)
    }
    
    if (scoreCredit.value < 40) {
        isEligible = false
        reasons.push(`Score de crédit insuffisant (${scoreCredit.value}/100)`)
    }
    
    if (resteAVivre.value < 150000) {
        isEligible = false
        reasons.push("Reste à vivre insuffisant (< 150 000 FCFA)")
    }
    
    return { isEligible, reasons }
})

const tableauAmortissement = computed(() => {
    if (!currentPret.value) return []
    const rows = []
    let solde = props.data.montant
    const tauxMensuel = (currentPret.value.taux / 100) / 12
    const mens = calculMensualite.value
    let cumInt = 0
    
    for (let i = 1; i <= props.data.duree; i++) {
        const int = solde * tauxMensuel
        const capital = mens - int
        solde -= capital
        cumInt += int
        
        rows.push({
            mois: i,
            mensualite: mens,
            capital: capital,
            interets: int,
            solde: Math.max(0, solde),
            cumulInterets: cumInt
        })
    }
    return rows
})

const showFullTable = ref(false)
</script>

<template>
  <div class="result-container space-y-8 animate-fade-in pb-10">
    
    <div class="text-center">
      <h2 class="text-3xl font-bold mb-2 flex items-center justify-center gap-2">
        <span class="icon-svg icon-chart" style="width: 32px; height: 32px;"></span> Vos Résultats
      </h2>
      <p class="text-muted">Analyse complète générée par l'IA du simulateur.</p>
    </div>

    <div 
        class="p-6 rounded-xl border-l-8 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4"
        :class="decision.isEligible ? 'bg-green-900/20 border-green-500' : 'bg-red-900/20 border-red-500'"
    >
        <div class="flex items-center gap-4">
            <div class="text-4xl">
                <span v-if="decision.isEligible" class="icon-svg icon-check" style="width: 40px; height: 40px;"></span>
                <span v-else class="icon-svg icon-x" style="width: 40px; height: 40px;"></span>
            </div>
            <div>
                <h3 class="text-2xl font-bold" :class="decision.isEligible ? 'text-green-400' : 'text-red-400'">
                    {{ decision.isEligible ? 'PRÊT ÉLIGIBLE' : 'PRÊT NON ÉLIGIBLE' }}
                </h3>
                <p class="text-sm text-gray-300">
                    {{ decision.isEligible 
                        ? 'Votre profil correspond aux critères de la banque.' 
                        : 'Malheureusement, des ajustements sont nécessaires.' }}
                </p>
            </div>
        </div>
        
        <div v-if="!decision.isEligible" class="bg-red-900/40 p-3 rounded text-sm text-red-200 w-full md:w-auto">
            <strong>Raisons du refus :</strong>
            <ul class="list-disc ml-5 mt-1">
                <li v-for="r in decision.reasons" :key="r">{{ r }}</li>
            </ul>
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        <div class="card space-y-4">
            <h3 class="text-xl font-semibold border-b border-gray-700 pb-2 flex items-center gap-2">
                <span class="icon-svg icon-money"></span> Analyse Financière
            </h3>
            
            <div class="space-y-4">
                <div>
                   <div class="flex justify-between text-sm mb-1">
                        <span>Quotité Utilisée</span>
                        <span :class="quotiteUtiliseePct > 35 ? 'text-danger' : 'text-success'">
                            {{ quotiteUtiliseePct.toFixed(1) }}%
                        </span>
                   </div>
                   <div class="w-full bg-gray-700 rounded-full h-4 overflow-hidden relative">
                       <div class="absolute right-[65%] top-0 h-full w-0.5 bg-red-500 z-10" title="Limite 35%"></div>
                       <div 
                            class="h-full rounded-full transition-all duration-1000"
                            :class="quotiteUtiliseePct > 35 ? 'bg-danger' : 'bg-success'"
                            :style="{ width: Math.min(quotiteUtiliseePct, 100) + '%' }"
                       ></div>
                   </div>
                   <div class="text-xs text-right mt-1 text-muted">Max légal: 35%</div>
                </div>

                <div class="grid grid-cols-2 gap-4 text-center">
                    <div class="bg-slate-800 p-3 rounded">
                        <div class="text-muted text-xs">Reste à Vivre</div>
                        <div class="font-bold text-lg text-emerald-400">{{ fcfa.format(resteAVivre) }}</div>
                    </div>
                    <div class="bg-slate-800 p-3 rounded">
                        <div class="text-muted text-xs">Quotité Dispo.</div>
                         <div class="font-bold text-lg text-blue-400">{{ quotiteDisponiblePct.toFixed(1) }}%</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card space-y-4 flex flex-col justify-center">
            <h3 class="text-xl font-semibold border-b border-gray-700 pb-2 flex items-center gap-2">
                <span class="icon-svg icon-star"></span> Votre Score
            </h3>
            
            <div class="flex flex-col items-center justify-center py-4">
                <div class="relative w-32 h-32 flex items-center justify-center rounded-full border-4 border-slate-700">
                    <div class="text-3xl font-bold" :class="scoreColor">{{ scoreCredit }}/100</div>
                    <svg class="absolute top-0 left-0 w-full h-full -rotate-90">
                         <circle cx="60" cy="60" r="58" stroke="currentColor" stroke-width="4" fill="transparent" class="text-gray-700" />
                         <circle cx="60" cy="60" r="58" stroke="currentColor" stroke-width="4" fill="transparent" 
                            :class="scoreColor"
                            :stroke-dasharray="364"
                            :stroke-dashoffset="364 - (364 * scoreCredit / 100)"
                            class="transition-all duration-1000"
                         />
                    </svg>
                </div>
                <div class="mt-4 text-center">
                    <div class="font-medium flex items-center justify-center gap-2" v-if="scoreCredit >= 80">Excellent Profil <span class="icon-svg icon-star"></span></div>
                    <div class="font-medium flex items-center justify-center gap-2" v-else-if="scoreCredit >= 60">Bon Profil <span class="icon-svg icon-check"></span></div>
                    <div class="font-medium flex items-center justify-center gap-2" v-else>Profil à Risque <span class="icon-svg icon-warning"></span></div>
                </div>
            </div>
        </div>

    </div>

    <div class="card">
        <h3 class="text-xl font-semibold border-b border-gray-700 pb-2 mb-4 flex items-center gap-2">
            <div style="width: 24px; height: 24px;" v-if="currentBanque?.logo">
                <img :src="currentBanque.logo" class="bank-logo-img" alt="Logo"/>
            </div>
            <span v-else class="icon-svg icon-card"></span>
            <span>Détails du Prêt - {{ currentBanque?.nom }}</span>
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="space-y-1">
                <div class="text-sm text-muted">Mensualité</div>
                <div class="text-2xl font-bold text-blue-400">{{ fcfa.format(calculMensualite) }}</div>
            </div>
             <div class="space-y-1">
                <div class="text-sm text-muted">Coût Total Crédit</div>
                <div class="text-xl font-bold">{{ fcfa.format(calculTotalCout) }}</div>
            </div>
             <div class="space-y-1">
                <div class="text-sm text-muted">Dont Intérêts</div>
                <div class="text-xl font-bold text-orange-400">{{ fcfa.format(calculTotalInteret) }}</div>
            </div>
        </div>
        <div class="mt-4 p-4 bg-slate-800 rounded grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
                <span class="text-muted block">Montant</span>
                <span class="font-semibold">{{ fcfa.format(props.data.montant) }}</span>
            </div>
             <div>
                <span class="text-muted block">Durée</span>
                <span class="font-semibold">{{ props.data.duree }} mois</span>
            </div>
             <div>
                <span class="text-muted block">Taux</span>
                <span class="font-semibold">{{ currentPret?.taux }}%</span>
            </div>
             <div>
                <span class="text-muted block">Banque</span>
                <span class="font-semibold">{{ currentBanque?.nom }}</span>
            </div>
        </div>
    </div>

    <div class="card overflow-hidden">
        <h3 class="text-xl font-semibold border-b border-gray-700 pb-2 mb-4 flex justify-between items-center">
            <span class="flex items-center gap-2"><span class="icon-svg icon-list"></span> Tableau d'amortissement</span>
            <button @click="showFullTable = !showFullTable" class="text-sm btn-outline py-1 px-3">
                {{ showFullTable ? 'Réduire' : 'Voir tout' }}
            </button>
        </h3>
        
        <div class="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table class="w-full text-sm text-left">
                <thead class="text-xs text-muted uppercase bg-slate-800 sticky top-0">
                    <tr>
                        <th class="p-3">Mois</th>
                        <th class="p-3">Mensualité</th>
                        <th class="p-3">Capital</th>
                        <th class="p-3">Intérêts</th>
                        <th class="p-3">Solde Restant</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-700">
                    <tr v-for="row in (showFullTable ? tableauAmortissement : tableauAmortissement.slice(0, 5))" :key="row.mois" class="hover:bg-slate-800/50">
                        <td class="p-3">{{ row.mois }}</td>
                        <td class="p-3 font-medium">{{ fcfa.format(row.mensualite) }}</td>
                        <td class="p-3 text-emerald-400">{{ fcfa.format(row.capital) }}</td>
                        <td class="p-3 text-orange-400">{{ fcfa.format(row.interets) }}</td>
                         <td class="p-3 text-muted">{{ fcfa.format(row.solde) }}</td>
                    </tr>
                </tbody>
            </table>
            <div v-if="!showFullTable" class="p-2 text-center text-xs text-muted italic bg-slate-800/30">
                Affichage des 5 premiers mois uniquement...
            </div>
        </div>
    </div>

    <div class="flex justify-center pt-6">
        <button @click="$emit('restart')" class="btn-outline border-dashed hover:border-solid flex items-center gap-2">
            <span class="icon-svg icon-refresh"></span> Nouvelle Simulation
        </button>
    </div>

  </div>
</template>
