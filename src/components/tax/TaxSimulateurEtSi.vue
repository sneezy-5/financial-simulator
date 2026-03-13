<script setup>
import { ref, computed } from 'vue'
import { calculerSituationActuelle, formatFCFA } from '../../services/taxService.js'

const props = defineProps({ resultats: Object, params: Object })

const scenarioActif = ref(null)

const SCENARIOS = [
  {
    id: 'employe',
    label: 'Je prends un employé',
    desc: 'Impact d\'un nouveau salarié (150 000 FCFA/mois)',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>`,
    couleur: '#1d4ed8',
    modifier: (params) => ({ ...params, chargesFixes: (params.chargesFixes || 0) + 150_000 * 12, employes: (params.employes || 0) + 1 }),
    explication: 'Salaire net + charges patronales CNPS estimées à 150 000 FCFA/mois soit 1 800 000 FCFA/an de charges supplémentaires.',
  },
  {
    id: 'deuxieme_point',
    label: 'J\'ouvre un 2ème point de vente',
    desc: 'Doublement approximatif du CA et des charges',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z"/></svg>`,
    couleur: '#7c3aed',
    modifier: (params) => ({ ...params, ca: params.ca * 2, chargesFixes: (params.chargesFixes || 0) * 2, chargesVariables: (params.chargesVariables || 0) * 2 }),
    explication: 'Estimation : CA doublé, charges fixes et variables doublées. Le régime fiscal peut changer si le CA dépasse un seuil.',
  },
  {
    id: 'hausse_ca',
    label: 'Mon CA augmente de 30%',
    desc: 'Croissance de 30% grâce à plus de clients',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"/></svg>`,
    couleur: '#15803d',
    modifier: (params) => ({ ...params, ca: Math.round(params.ca * 1.3) }),
    explication: 'Seulement le CA augmente (+30%). Les charges restent identiques — meilleure rentabilité.',
  },
  {
    id: 'adhesion_cga',
    label: 'J\'adhère à un CGA',
    desc: 'Impact de l\'adhésion au Centre de Gestion Agréé',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/></svg>`,
    couleur: '#0f766e',
    modifier: (params) => ({ ...params, cga: true }),
    explication: 'Réduction de 50% de l\'impôt si votre régime est TEE. Cotisation CGA : ~200 000 FCFA/an à déduire des économies.',
  },
  {
    id: 'baisse_charges',
    label: 'Je réduis mes charges de 20%',
    desc: 'Renégociation loyer, optimisation achats...',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181"/></svg>`,
    couleur: '#b45309',
    modifier: (params) => ({ ...params, chargesFixes: Math.round((params.chargesFixes || 0) * 0.8), chargesVariables: Math.round((params.chargesVariables || 0) * 0.8) }),
    explication: 'Toutes les charges (fixes et variables) réduites de 20% — renégociation du loyer, achats en gros, etc.',
  },
]

const resultatBase = computed(() => props.resultats)

const resultatScenario = computed(() => {
  if (!scenarioActif.value || !props.params) return null
  const sc = SCENARIOS.find(s => s.id === scenarioActif.value)
  if (!sc) return null
  const newParams = sc.modifier({ ...props.params })
  return calculerSituationActuelle(newParams)
})

const scenarioData = computed(() => SCENARIOS.find(s => s.id === scenarioActif.value))

// Différences
const diffImpot = computed(() => resultatScenario.value && resultatBase.value ? resultatScenario.value.impot - resultatBase.value.impot : 0)
const diffBenefice = computed(() => resultatScenario.value && resultatBase.value ? resultatScenario.value.beneficeNet - resultatBase.value.beneficeNet : 0)

function choisir(id) {
  scenarioActif.value = scenarioActif.value === id ? null : id
}
</script>

<template>
  <div class="etsi-card">
    <div class="etsi-header">
      <div class="etsi-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"/>
        </svg>
      </div>
      <div>
        <div class="etsi-title">Simulateur "Et si..."</div>
        <div class="etsi-sub">Testez différents scénarios — voyez l'impact sur votre impôt et votre bénéfice</div>
      </div>
    </div>

    <!-- Boutons de scénarios -->
    <div class="scenarios-grid">
      <button
        v-for="sc in SCENARIOS"
        :key="sc.id"
        class="sc-btn"
        :class="{ active: scenarioActif === sc.id }"
        :style="scenarioActif === sc.id ? { borderColor: sc.couleur, background: sc.couleur + '10', color: sc.couleur } : {}"
        @click="choisir(sc.id)"
        type="button"
      >
        <span class="sc-icon" v-html="sc.icon"></span>
        <div class="sc-text">
          <div class="sc-label">{{ sc.label }}</div>
          <div class="sc-desc">{{ sc.desc }}</div>
        </div>
        <svg v-if="scenarioActif === sc.id" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="sc-check"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
      </button>
    </div>

    <!-- Résultat du scénario -->
    <transition name="slide">
      <div v-if="resultatScenario && scenarioData" class="resultat-scenario">
        <div class="sc-explication">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>
          {{ scenarioData.explication }}
        </div>

        <!-- Tableau comparatif -->
        <div class="comp-table">
          <div class="comp-head">
            <div></div>
            <div class="ch-base">Situation actuelle</div>
            <div class="ch-scenario" :style="{ color: scenarioData.couleur }">{{ scenarioData.label }}</div>
          </div>
          <div class="comp-row">
            <div class="cr-label">CA annuel</div>
            <div class="cr-base">{{ formatFCFA(resultatBase.ca) }} FCFA</div>
            <div class="cr-scenario">{{ formatFCFA(resultatScenario.ca) }} FCFA</div>
          </div>
          <div class="comp-row">
            <div class="cr-label">Régime fiscal</div>
            <div class="cr-base">{{ resultatBase.regime.label }}</div>
            <div class="cr-scenario" :class="{ changed: resultatScenario.regime.id !== resultatBase.regime.id }">{{ resultatScenario.regime.label }}</div>
          </div>
          <div class="comp-row">
            <div class="cr-label">Charges totales</div>
            <div class="cr-base">{{ formatFCFA(resultatBase.totalCharges) }} FCFA</div>
            <div class="cr-scenario">{{ formatFCFA(resultatScenario.totalCharges) }} FCFA</div>
          </div>
          <div class="comp-row impot-row">
            <div class="cr-label">Impôt</div>
            <div class="cr-base">{{ formatFCFA(resultatBase.impot) }} FCFA</div>
            <div class="cr-scenario">{{ formatFCFA(resultatScenario.impot) }} FCFA</div>
          </div>
          <div class="comp-row benef-row">
            <div class="cr-label">Bénéfice net</div>
            <div class="cr-base">{{ formatFCFA(resultatBase.beneficeNet) }} FCFA</div>
            <div class="cr-scenario">{{ formatFCFA(resultatScenario.beneficeNet) }} FCFA</div>
          </div>
        </div>

        <!-- Impact résumé -->
        <div class="impact-row">
          <div class="impact-item" :class="diffImpot < 0 ? 'bon' : diffImpot > 0 ? 'mauvais' : 'neutre'">
            <div class="imp-label">Impact impôt</div>
            <div class="imp-val">{{ diffImpot > 0 ? '+' : '' }}{{ formatFCFA(diffImpot) }} FCFA</div>
          </div>
          <div class="impact-item" :class="diffBenefice > 0 ? 'bon' : diffBenefice < 0 ? 'mauvais' : 'neutre'">
            <div class="imp-label">Impact bénéfice net</div>
            <div class="imp-val">{{ diffBenefice > 0 ? '+' : '' }}{{ formatFCFA(diffBenefice) }} FCFA</div>
          </div>
        </div>

        <div v-if="resultatScenario.regime.id !== resultatBase.regime.id" class="regime-change-alert">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
          Ce scénario entraîne un <strong>changement de régime fiscal</strong> : de {{ resultatBase.regime.label }} vers {{ resultatScenario.regime.label }}. Anticipez auprès de la DGI.
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.etsi-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }

.etsi-header { display: flex; align-items: flex-start; gap: 0.75rem; padding: 1.25rem 1.5rem; background: #f8fafc; border-bottom: 1px solid #f1f5f9; }
.etsi-icon { width: 34px; height: 34px; background: #fdf4ff; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #9333ea; flex-shrink: 0; }
.etsi-title { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.etsi-sub { font-size: 0.75rem; color: #6b7280; margin-top: 1px; }

.scenarios-grid { display: flex; flex-direction: column; gap: 0.5rem; padding: 1.25rem 1.5rem; }
.sc-btn { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border: 1.5px solid #e2e8f0; border-radius: 10px; background: white; cursor: pointer; transition: all 0.15s; text-align: left; }
.sc-btn:hover { border-color: #94a3b8; background: #f8fafc; }
.sc-icon { width: 20px; height: 20px; flex-shrink: 0; }
.sc-icon :deep(svg) { width: 20px; height: 20px; }
.sc-text { flex: 1; }
.sc-label { font-size: 0.84rem; font-weight: 600; color: #0f172a; }
.sc-desc { font-size: 0.72rem; color: #9ca3af; margin-top: 1px; }
.sc-check { flex-shrink: 0; }

/* Résultat */
.resultat-scenario { padding: 0 1.5rem 1.25rem; display: flex; flex-direction: column; gap: 0.875rem; }
.sc-explication { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.78rem; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.625rem; line-height: 1.5; }
.sc-explication svg { flex-shrink: 0; margin-top: 1px; color: #64748b; }

/* Tableau comparatif */
.comp-table { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
.comp-head { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 0.5rem 0.75rem; background: #f8fafc; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
.comp-row { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 0.5rem 0.75rem; border-top: 1px solid #f1f5f9; align-items: center; }
.comp-row.impot-row { background: #fef2f2; }
.comp-row.benef-row { background: #f0fdf4; }
.cr-label { font-size: 0.78rem; color: #6b7280; }
.cr-base { font-size: 0.8rem; font-weight: 600; color: #374151; }
.cr-scenario { font-size: 0.8rem; font-weight: 700; color: #0f172a; }
.cr-scenario.changed { color: #dc2626; }

/* Impact */
.impact-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }
.impact-item { padding: 0.75rem; border-radius: 8px; text-align: center; border: 1px solid; }
.impact-item.bon { background: #f0fdf4; border-color: #bbf7d0; }
.impact-item.mauvais { background: #fef2f2; border-color: #fecaca; }
.impact-item.neutre { background: #f8fafc; border-color: #e2e8f0; }
.imp-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 0.2rem; }
.imp-val { font-size: 1rem; font-weight: 800; }
.bon .imp-val { color: #15803d; }
.mauvais .imp-val { color: #b91c1c; }
.neutre .imp-val { color: #374151; }

.regime-change-alert { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.75rem; background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; font-size: 0.8rem; color: #78350f; line-height: 1.5; }
.regime-change-alert svg { flex-shrink: 0; color: #d97706; }

.slide-enter-active, .slide-leave-active { transition: all 0.25s; }
.slide-enter-from { opacity: 0; transform: translateY(-8px); }
.slide-leave-to { opacity: 0; }

@media (max-width: 640px) {
  .etsi-header, .scenarios-grid, .resultat-scenario { padding-left: 1rem; padding-right: 1rem; }
  .comp-head, .comp-row { font-size: 0.7rem; }
}
</style>
