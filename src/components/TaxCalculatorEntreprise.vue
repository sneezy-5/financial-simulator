<script setup>
import { ref, computed, watch } from 'vue'
import { detecterRegime, calculerSituationActuelle, projeterSurNAns, genererSuggestions, formatFCFA, SECTEURS, SCENARIOS_DEFAUT, MODELES_COMMERCE } from '../services/taxService.js'
import TaxModeles from './tax/TaxModeles.vue'
import TaxResultats from './tax/TaxResultats.vue'
import TaxRegimeExplication from './tax/TaxRegimeExplication.vue'
import TaxJournalier from './tax/TaxJournalier.vue'
import TaxCalendrier from './tax/TaxCalendrier.vue'
import TaxComparateurCGA from './tax/TaxComparateurCGA.vue'
import TaxSuiviMensuel from './tax/TaxSuiviMensuel.vue'
import TaxSimulateurEtSi from './tax/TaxSimulateurEtSi.vue'
import TaxProjections from './tax/TaxProjections.vue'
import TaxAI from './tax/TaxAI.vue'
import TaxOutilsFinanciers from './tax/TaxOutilsFinanciers.vue'
import TaxFichePDF from './tax/TaxFichePDF.vue'
import TaxGuideCharges from './tax/TaxGuideCharges.vue'
import TaxAssistant from './tax/TaxAssistant.vue'
import TaxAnalysesExpert from './tax/TaxAnalysesExpert.vue'
import TaxResumeClair from './tax/TaxResumeClair.vue'

import { getCountryRules } from '../services/countryConfig.js'

const props = defineProps({
  country: {
    type: String,
    default: 'CI'
  }
})

const emit = defineEmits(['retour'])
const countryRules = computed(() => getCountryRules(props.country))

const form = ref({
  nom: '',
  secteur: 'commerce',
  ca: '',
  chargesFixes: '',
  chargesVariables: '',
  employes: 0,
  cga: false,
  beneficeManuel: '',
  saisirBenefice: false,
})

const errors = ref({})
const resultats = ref(null)
const projections = ref(null)
const suggestions = ref([])
const version = ref(0)
const showAssistant = ref(false)
const activeResultTab = ref('analyses')
const showBanner = ref(true)
const activeTooltip = ref(null)

const TOOLTIPS = {
  ca: {
    titre: 'Chiffre d\'Affaires (CA)',
    texte: 'C\'est TOUT l\'argent que vos clients vous ont payé dans l\'année. Ventes de marchandises, prestations de services... Si vous vendez 5 000 FCFA par jour pendant 300 jours, votre CA est de 1 500 000 FCFA.',
    exemple: 'Ex : épicier qui vend 2 500 000 FCFA/mois → CA annuel = 30 000 000 FCFA'
  },
  chargesFixes: {
    titre: 'Charges Fixes',
    texte: 'Ce sont les dépenses que vous payez chaque mois, MÊME si vous n\'avez pas vendu grand chose. Ce sont les coûts incompressibles de votre activité.',
    exemple: 'Ex : Loyer boutique 150 000 FCFA + salaire gardien 80 000 FCFA + électricité 20 000 FCFA = 250 000 FCFA/mois de charges fixes'
  },
  chargesVariables: {
    titre: 'Charges Variables (Achats)',
    texte: 'Ce que vous achetez pour pouvoir vendre ou fabriquer. Ces dépenses augmentent quand vous vendez plus, et diminuent quand vous vendez moins.',
    exemple: 'Ex : un revendeur qui achète 60% de son CA en marchandises → pour 30 000 000 FCFA de CA, il a 18 000 000 FCFA de charges variables'
  },
  cga: {
    titre: 'Centre de Gestion Agréé (CGA)',
    texte: 'Un CGA est un organisme officiel agréé par l\'État qui aide les petites entreprises à tenir leur comptabilité. En échange, l\'État vous offre une réduction d\'impôt de 50% si vous êtes dans le régime TEE.',
    exemple: 'Sans CGA : impôt = 4% du CA. Avec CGA : impôt = 2% du CA. Pour 30M FCFA de CA, économie de 600 000 FCFA !'
  },
  employes: {
    titre: 'Nombre d\'Employés',
    texte: 'Indiquez le nombre de personnes que vous employez et payez régulièrement. Cette information n\'affecte pas directement votre impôt de base, mais elle est utile pour les analyses et pour calculer vos cotisations sociales.',
    exemple: 'Comptez vos salariés permanents. Ne comptez pas les prestataires occasionnels.'
  },
  regime: {
    titre: 'Régime Fiscal',
    texte: 'L\'État classe toutes les entreprises en catégories selon leur chiffre d\'affaires. Chaque catégorie a ses propres règles d\'imposition. Votre régime est automatiquement déterminé par votre CA.',
    exemple: 'CA < 5M → Très Petite Activité (2%) | CA 5-50M → Petite Entreprise (4%) | CA 50-200M → Microentreprise (6%) | CA > 200M → Comptabilité Complète'
  }
}

function toggleTooltip(key) {
  activeTooltip.value = activeTooltip.value === key ? null : key
}

const currentParams = computed(() => ({
  ca: parseNum(form.value.ca),
  chargesFixes: parseNum(form.value.chargesFixes) * 12 || 0,
  chargesVariables: parseNum(form.value.chargesVariables) || 0,
  secteur: form.value.secteur,
  cga: form.value.cga,
  beneficeManuel: form.value.saisirBenefice ? parseNum(form.value.beneficeManuel) : undefined,
}))

function handleAssistantApply(assistantData) {
  form.value = { ...form.value, ...assistantData }
  // Scroll to form and pulse the calculate button?
  setTimeout(() => document.getElementById('form-main')?.scrollIntoView({ behavior: 'smooth' }), 100)
}

const regimeDetecte = computed(() => {
  const ca = parseNum(form.value.ca)
  return ca > 0 ? detecterRegime(ca) : null
})

const needsBenefice = computed(() =>
  regimeDetecte.value?.id === 'rsi' || regimeDetecte.value?.id === 'rni'
)

function valider() {
  errors.value = {}
  const ca = parseNum(form.value.ca)
  if (!ca || ca <= 0) errors.value.ca = 'Veuillez saisir votre chiffre d\'affaires'
  if (!form.value.secteur) errors.value.secteur = 'Sélectionnez votre secteur'
  return Object.keys(errors.value).length === 0
}

function applyModele(modele) {
  const cfMois = modele.chargesFixesMois
  const cfFormate = String(cfMois).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  const cvAnnuel = Math.round(modele.caExempleAnnuel * modele.chargesVariablesPct)
  const cvFormate = String(cvAnnuel).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  const caFormate = String(modele.caExempleAnnuel).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  form.value.secteur = modele.secteur
  form.value.chargesFixes = cfFormate
  form.value.chargesVariables = cvFormate
  form.value.ca = caFormate
  // Scroll vers le formulaire
  setTimeout(() => document.getElementById('form-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
}

function formatAmount(e, key) {
  const raw = e.target.value.replace(/[^0-9]/g, '')
  const formatted = raw ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') : ''
  form.value[key] = formatted
  // Force the input value to match (preserve cursor at end)
  const pos = e.target.selectionStart + (formatted.length - e.target.value.length)
  e.target.value = formatted
  try { e.target.setSelectionRange(pos, pos) } catch {}
}

function calculer() {
  if (!valider()) return
  resultats.value = calculerSituationActuelle(currentParams.value)
  projections.value = projeterSurNAns(currentParams.value, 5, SCENARIOS_DEFAUT)
  suggestions.value = genererSuggestions(resultats.value, currentParams.value)
  version.value++
  setTimeout(() => {
    document.getElementById('tax-resultats')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 100)
}

// Mise à jour automatique des calculs dès qu'un champ change
watch(form, () => {
  const caNum = parseNum(form.value.ca)
  if (caNum > 0 && form.value.secteur) {
    resultats.value = calculerSituationActuelle(currentParams.value)
    projections.value = projeterSurNAns(currentParams.value, 5, SCENARIOS_DEFAUT)
    suggestions.value = genererSuggestions(resultats.value, currentParams.value)
    version.value++
  }
}, { deep: true })

function reset() {
  resultats.value = null
  projections.value = null
  form.value = { nom: '', secteur: 'commerce', ca: '', chargesFixes: '', chargesVariables: '', employes: 0, cga: false, beneficeManuel: '', saisirBenefice: false }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function parseNum(val) {
  if (val === '' || val === null || val === undefined) return 0
  return parseInt(String(val).replace(/[^0-9]/g, ''), 10) || 0
}

const contexteIA = computed(() => ({
  ca: parseNum(form.value.ca),
  secteur: form.value.secteur,
  regime: resultats.value?.regime?.label || '',
  nom: form.value.nom,
}))

const params = computed(() => ({
  ca: parseNum(form.value.ca),
  chargesFixes: parseNum(form.value.chargesFixes) * 12 || 0,
  chargesVariables: parseNum(form.value.chargesVariables) || 0,
  secteur: form.value.secteur,
  cga: form.value.cga,
}))

const REGIME_COLORS = {
  entreprenant_tce: '#0369a1',
  entreprenant_tee: '#0284c7',
  rme: '#0f766e',
  rsi: '#7c3aed',
  rni: '#dc2626',
}

const warningMessage = computed(() => {
  const ca = parseNum(form.value.ca)
  const cf = parseNum(form.value.chargesFixes) * 12
  const cv = parseNum(form.value.chargesVariables)
  if (ca > 0 && (cf + cv) > ca) {
    return "⚠️ Vos charges totales (" + formatFCFA(cf + cv) + "/an) dépassent votre chiffre d'affaires. Votre entreprise fonctionnera en déficit (-" + formatFCFA(cf + cv - ca) + "/an)."
  }
  if (form.value.saisirBenefice && parseNum(form.value.beneficeManuel) < 0) {
    return "⚠️ Le bénéfice net saisi est négatif. Votre entreprise fonctionnera en déficit."
  }
  if (form.value.saisirBenefice && parseNum(form.value.beneficeManuel) > ca) {
    return "⚠️ Le bénéfice net saisi est supérieur à votre chiffre d'affaires, ce qui est impossible comptablement."
  }
  return ""
})

watch(() => form.value.employes, (newVal) => {
  if (newVal < 0) form.value.employes = 0
  if (newVal > 10000) form.value.employes = 10000
})

watch(() => form.value.ca, (newVal) => {
  const val = parseNum(newVal)
  if (val > 10000000000) {
    form.value.ca = String(10000000000).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
    errors.value.ca = "Le chiffre d'affaires est limité à 10 milliards FCFA pour la simulation."
  } else if (errors.value.ca && val > 0) {
    delete errors.value.ca
  }
})

watch(() => form.value.chargesFixes, (newVal) => {
  const val = parseNum(newVal)
  if (val > 1000000000) {
    form.value.chargesFixes = String(1000000000).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  }
})

watch(() => form.value.chargesVariables, (newVal) => {
  const val = parseNum(newVal)
  if (val > 10000000000) {
    form.value.chargesVariables = String(10000000000).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  }
})

watch(() => form.value.beneficeManuel, (newVal) => {
  const val = parseNum(newVal)
  if (val > 10000000000) {
    form.value.beneficeManuel = String(10000000000).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  }
})
</script>

<template>
  <div class="tax-page">

    <!-- Header -->
    <header class="tax-header no-print">
      <button class="back-btn" @click="emit('retour')">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
        </svg>
        Accueil
      </button>
      <div class="tax-title">
        <img src="/logo.png?v=2" alt="Onda Logo" style="width: 24px; height: 24px; object-fit: contain;">
        <div>
          <div class="tax-title-main">ONDA Lite</div>
          <div class="tax-title-sub">Simulation Fiscale Côte d'Ivoire</div>
        </div>
      </div>
      <div style="width:80px"></div><!-- spacer -->
    </header>

    <div class="tax-content">

      <!-- Formulaire -->
      <div class="form-card no-print" id="form-main">
        <!-- Modèles préconfigurés -->
        <TaxModeles @select="applyModele" />
        <!-- Bannière pédagogique d'accueil -->
        <div v-if="showBanner" class="welcome-banner">
          <div class="wb-content">
            <div class="wb-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="color: #2563eb;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="wb-text">
              <strong>Comment ça marche ?</strong>
              <div class="wb-steps">
                <span class="wb-step"><span class="wb-num">1</span> Dites-nous ce que vous faites et combien vous gagnez</span>
                <span class="wb-step"><span class="wb-num">2</span> On calcule automatiquement ce que vous devez à l'État</span>
                <span class="wb-step"><span class="wb-num">3</span> On vous explique comment payer et comment réduire votre impôt</span>
              </div>
            </div>
          </div>
          <button class="wb-close" @click="showBanner = false" title="Fermer">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="form-header">
          <div class="fh-left">
            <h2>Simulateur de taxes</h2>
            <p>Remplissez les informations ci-dessous — on vous explique tout !</p>
          </div>
          <button class="btn-assistant-trigger" @click="showAssistant = true">
            <span class="bot-icon">🤖</span>
            <span>M'aider à configurer</span>
          </button>
        </div>
        <div class="form-divider"></div>

        <div class="form-body">

          <!-- Nom -->
          <div class="field full">
            <label>Nom de l'entreprise <span class="opt">(optionnel)</span></label>
            <input v-model="form.nom" type="text" placeholder="Ex : SARL Kouassi Commerce" />
          </div>

          <!-- Secteur -->
          <div class="field full">
            <label>Dans quel domaine travaillez-vous ? <span class="req">*</span></label>
            <p class="field-desc">Choisissez l'activité qui ressemble le plus à ce que vous faites.</p>
          <div class="secteur-grid">
              <button
                v-for="s in SECTEURS" :key="s.id"
                class="secteur-btn"
                :class="{ active: form.secteur === s.id }"
                @click="form.secteur = s.id"
                type="button"
              >
                <span class="secteur-icon" v-html="s.icon"></span>
                <span class="secteur-label">{{ s.label }}</span>
              </button>
            </div>
            <p v-if="errors.secteur" class="err">{{ errors.secteur }}</p>
          </div>

          <!-- CA -->
          <div class="field">
            <div class="label-with-tip">
              <label>Vos revenus totaux de l'année <span class="req">*</span></label>
              <button class="tip-btn" @click.stop="toggleTooltip('ca')" type="button" :class="{ active: activeTooltip === 'ca' }">?</button>
            </div>
            <p class="field-desc">Tout l'argent reçu de vos clients : ventes, prestations...</p>
            <div v-if="activeTooltip === 'ca'" class="tooltip-box">
              <div class="tt-title">{{ TOOLTIPS.ca.titre }}</div>
              <p class="tt-text">{{ TOOLTIPS.ca.texte }}</p>
              <div class="tt-exemple">{{ TOOLTIPS.ca.exemple }}</div>
            </div>
            <div class="input-row">
              <input
                :value="form.ca"
                type="text"
                inputmode="numeric"
                placeholder="Ex : 30 000 000"
                @input="e => formatAmount(e, 'ca')"
                @focus="activeTooltip = null"
              />
              <span class="unit">FCFA / an</span>
            </div>
            <p v-if="errors.ca" class="err">{{ errors.ca }}</p>
            <!-- Régime détecté (en clair) -->
            <div v-if="regimeDetecte" class="regime-chip-edu" :style="{ color: REGIME_COLORS[regimeDetecte.id], background: REGIME_COLORS[regimeDetecte.id] + '12', border: '1px solid ' + REGIME_COLORS[regimeDetecte.id] + '30' }">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>
              <div>
                <div class="rce-name">Catégorie fiscale : <strong>{{ regimeDetecte.label }}</strong></div>
                <div class="rce-hint">{{ regimeDetecte.description }}</div>
              </div>
              <button class="tip-btn small" @click.stop="toggleTooltip('regime')" type="button">?</button>
            </div>
            <div v-if="activeTooltip === 'regime'" class="tooltip-box">
              <div class="tt-title">{{ TOOLTIPS.regime.titre }}</div>
              <p class="tt-text">{{ TOOLTIPS.regime.texte }}</p>
              <div class="tt-exemple">{{ TOOLTIPS.regime.exemple }}</div>
            </div>
          </div>

          <!-- Guide des charges -->
          <div class="field full" style="margin-top: 1.5rem">
            <TaxGuideCharges :secteur="form.secteur" />
          </div>

          <!-- Charges fixes -->
          <div class="field">
            <div class="label-with-tip">
              <label>Ce que vous payez chaque mois</label>
              <button class="tip-btn" @click.stop="toggleTooltip('chargesFixes')" type="button" :class="{ active: activeTooltip === 'chargesFixes' }">?</button>
            </div>
            <p class="field-desc">Loyer, salaires, électricité... même si vous ne vendez rien</p>
            <div v-if="activeTooltip === 'chargesFixes'" class="tooltip-box">
              <div class="tt-title">{{ TOOLTIPS.chargesFixes.titre }}</div>
              <p class="tt-text">{{ TOOLTIPS.chargesFixes.texte }}</p>
              <div class="tt-exemple">{{ TOOLTIPS.chargesFixes.exemple }}</div>
            </div>
            <div class="input-row">
              <input
                :value="form.chargesFixes"
                type="text"
                inputmode="numeric"
                placeholder="Ex : 250 000"
                @input="e => formatAmount(e, 'chargesFixes')"
                @focus="activeTooltip = null"
              />
              <span class="unit">FCFA / mois</span>
            </div>
            <p class="hint">Ce montant sera automatiquement multiplié × 12 pour l'année</p>
          </div>

          <!-- Charges variables -->
          <div class="field">
            <div class="label-with-tip">
              <label>Ce que vous achetez pour vendre</label>
              <button class="tip-btn" @click.stop="toggleTooltip('chargesVariables')" type="button" :class="{ active: activeTooltip === 'chargesVariables' }">?</button>
            </div>
            <p class="field-desc">Marchandises, matières premières, emballages...</p>
            <div v-if="activeTooltip === 'chargesVariables'" class="tooltip-box">
              <div class="tt-title">{{ TOOLTIPS.chargesVariables.titre }}</div>
              <p class="tt-text">{{ TOOLTIPS.chargesVariables.texte }}</p>
              <div class="tt-exemple">{{ TOOLTIPS.chargesVariables.exemple }}</div>
            </div>
            <div class="input-row">
              <input
                :value="form.chargesVariables"
                type="text"
                inputmode="numeric"
                placeholder="Ex : 18 000 000"
                @input="e => formatAmount(e, 'chargesVariables')"
                @focus="activeTooltip = null"
              />
              <span class="unit">FCFA / an</span>
            </div>
          </div>

          <!-- Employés -->
          <div class="field">
            <div class="label-with-tip">
              <label>Nombre d'employés</label>
              <button class="tip-btn" @click.stop="toggleTooltip('employes')" type="button" :class="{ active: activeTooltip === 'employes' }">?</button>
            </div>
            <p class="field-desc">Personnes que vous payez chaque mois</p>
            <div v-if="activeTooltip === 'employes'" class="tooltip-box">
              <div class="tt-title">{{ TOOLTIPS.employes.titre }}</div>
              <p class="tt-text">{{ TOOLTIPS.employes.texte }}</p>
              <div class="tt-exemple">{{ TOOLTIPS.employes.exemple }}</div>
            </div>
            <input v-model.number="form.employes" type="number" min="0" placeholder="0" @focus="activeTooltip = null" />
          </div>

          <!-- CGA -->
          <div class="field full">
            <div class="label-with-tip" style="margin-bottom:0.5rem">
              <label style="margin:0">Êtes-vous membre d'un CGA ?</label>
              <button class="tip-btn" @click.stop="toggleTooltip('cga')" type="button" :class="{ active: activeTooltip === 'cga' }">?</button>
            </div>
            <div v-if="activeTooltip === 'cga'" class="tooltip-box">
              <div class="tt-title">{{ TOOLTIPS.cga.titre }}</div>
              <p class="tt-text">{{ TOOLTIPS.cga.texte }}</p>
              <div class="tt-exemple">{{ TOOLTIPS.cga.exemple }}</div>
            </div>
            <label class="check-label">
              <input type="checkbox" v-model="form.cga" />
              <span>Oui, je suis adhérent à un <strong>Centre de Gestion Agréé (CGA)</strong> <span class="cga-badge">→ -50% d'impôt pour le régime TEE</span></span>
            </label>
          </div>

          <!-- Bénéfice RSI -->
          <div v-if="needsBenefice" class="field full rsi-notice">
            <div class="notice-text">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
              Régime RSI : l'impôt se calcule sur le bénéfice net, pas sur le CA.
            </div>
            <label class="check-label">
              <input type="checkbox" v-model="form.saisirBenefice" />
              <span>Je connais mon bénéfice net comptable</span>
            </label>
            <div v-if="form.saisirBenefice" class="field" style="margin-top:0.75rem">
              <div class="input-row">
                <input :value="form.beneficeManuel" type="text" inputmode="numeric" placeholder="25 000 000" @input="e => formatAmount(e, 'beneficeManuel')" />
                <span class="unit">FCFA / an</span>
              </div>
            </div>
          </div>
          
          <!-- Message de déficit et sécurité -->
          <div v-if="warningMessage" class="field full deficit-alert animate-shake">
            <span class="alert-icon">⚠️</span>
            <span class="alert-text">{{ warningMessage }}</span>
          </div>

        </div><!-- /form-body -->

        <div v-if="!resultats" class="form-footer">
          <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; color: #64748b; font-size: 0.85rem; font-weight: 600; padding: 1rem; background: #f8fafc; border-radius: 12px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="animation: spin 3s linear infinite;"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
            Simulation en temps réel activée
          </div>
        </div>
      </div>

      <!-- Résultats -->
      <div id="tax-resultats" v-if="resultats" :key="version">
        <!-- Résumé en clair — nouveau composant pédagogique -->
        <TaxResumeClair class="no-print" :resultats="resultats" :params="currentParams" :nom="form.nom" />
        <!-- TOP : Synthèse Immédiate (Fixe) -->
        <TaxResultats class="no-print" :resultats="resultats" :suggestions="suggestions" :nom="form.nom" />
        <TaxRegimeExplication class="no-print" :resultats="resultats" />
        
        <!-- NAVIGATION PAR ONGLETS -->
        <div class="result-tabs no-print">
          <button @click="activeResultTab = 'analyses'" :class="{ active: activeResultTab === 'analyses' }">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125z"/></svg>
            Analyses
          </button>
          <button @click="activeResultTab = 'calendrier'" :class="{ active: activeResultTab === 'calendrier' }">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"/></svg>
            Calendrier
          </button>
          <button @click="activeResultTab = 'strategie'" :class="{ active: activeResultTab === 'strategie' }">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v17.25m0 0a.75.75 0 0 1-.75.75H4.125a.75.75 0 0 1-.75-.75V4.125a.75.75 0 0 1 .75-.75h15.75a.75.75 0 0 1 .75.75v13.125a.75.75 0 0 1-.75.75H12z"/></svg>
            Stratégie
          </button>
          <button @click="activeResultTab = 'outils'" :class="{ active: activeResultTab === 'outils' }">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l5.654-4.654m5.896-2.613l.617-.923a2.25 2.25 0 00-.933-3.26 2.25 2.25 0 01-2.206-2.22V5.25A2.25 2.25 0 009 3H5.25A2.25 2.25 0 003 5.25v3.75A2.25 2.25 0 005.25 11.25h2.206c.98 0 1.815.7 2.004 1.66l.047.234c.11.55.421 1.04.869 1.38z"/></svg>
            Outils
          </button>
          <button @click="activeResultTab = 'ia'" :class="{ active: activeResultTab === 'ia' }">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a.75.75 0 0 1-1.074-.85l.384-1.973A8.25 8.25 0 0 1 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"/></svg>
            IA Conseil
          </button>
        </div>

        <div class="tab-content-area" :key="activeResultTab">
          <!-- ONGLET ANALYSES -->
          <div v-if="activeResultTab === 'analyses'" class="tab-pane">
            <TaxJournalier :impot-annuel="resultats.impot" :ca-annuel="parseNum(form.ca)" :regime="resultats.regime" :nom="form.nom" />
            <TaxAnalysesExpert :resultats="resultats" :params="currentParams" :projections="projections" />
          </div>

          <!-- ONGLET CALENDRIER -->
          <div v-if="activeResultTab === 'calendrier'" class="tab-pane">
            <TaxCalendrier :resultats="resultats" />
            <TaxSuiviMensuel :resultats="resultats" :params="currentParams" />
          </div>

          <!-- ONGLET STRATÉGIE -->
          <div v-if="activeResultTab === 'strategie'" class="tab-pane">
            <TaxComparateurCGA :resultats="resultats" :params="currentParams" />
            <TaxSimulateurEtSi :resultats="resultats" :params="currentParams" />
            <TaxProjections :projections="projections" :params="currentParams" />
          </div>

          <!-- ONGLET OUTILS -->
          <div v-if="activeResultTab === 'outils'" class="tab-pane">
            <TaxOutilsFinanciers :resultats="resultats" :params="currentParams" />
          </div>

          <!-- ONGLET IA -->
          <div v-if="activeResultTab === 'ia'" class="tab-pane">
            <TaxAI :resultats="resultats" :projections="projections" :contexte="contexteIA" />
          </div>
        </div>

        <!-- Bloc 11 : Fiche PDF (Toujours accessible en bas) -->
        <TaxFichePDF :resultats="resultats" :projections="projections" :params="currentParams" :nom="form.nom" />

        <!-- PROMO ONDA PRO -->
        <div class="onda-pro-promo no-print">
          <div class="promo-content">
            <div class="promo-badge">BIENTÔT DISPONIBLE</div>
            <h3>Passez à ONDA Pro sur Mobile</h3>
            <p>Gérez vos factures, suivez votre trésorerie et recevez des alertes DGI en temps réel sur votre smartphone.</p>
            <div class="promo-actions">
              <button class="btn-primary disabled">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
                Télécharger (Bientôt)
              </button>
            </div>
          </div>
          <div class="promo-icon">
            <div class="phone-mockup">
              <div class="phone-screen">
                <div class="screen-content"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="reset-row no-print">
          <button class="btn-outline" @click="reset">Nouvelle simulation</button>
        </div>
      </div>

    </div>

    <!-- Assistant Modal -->
    <TaxAssistant
      class="no-print"
      v-if="showAssistant"
      @close="showAssistant = false"
      @apply="handleAssistantApply"
    />
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.tax-page { min-height: 100vh; background: #f8fafc; font-family: 'Inter', system-ui, sans-serif; }

/* Header - Default Mobile */
.tax-header {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 0 0.875rem;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
}
.back-btn {
  display: flex; align-items: center; gap: 0.375rem;
  background: transparent; border: 1px solid #e2e8f0;
  border-radius: 8px; padding: 0.375rem 0.625rem;
  font-size: 0.8rem; font-weight: 600; color: #475569;
  cursor: pointer; transition: all 0.15s;
}
.back-btn:hover { background: #f1f5f9; border-color: #cbd5e1; }
.tax-title { display: flex; align-items: center; gap: 0.625rem; }
.tax-title-main { font-size: 0.85rem; font-weight: 700; color: #0f172a; }
.tax-title-sub { display: none; }

/* Deficit Alert */
.deficit-alert {
  background: #fff5f5;
  border: 1px solid #fee2e2;
  border-radius: 12px;
  padding: 0.875rem 1.125rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
  box-shadow: 0 2px 4px rgba(220, 38, 38, 0.05);
}
.alert-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}
.alert-text {
  font-size: 0.84rem;
  color: #b91c1c;
  font-weight: 600;
  line-height: 1.4;
}

/* Shake Animation */
.animate-shake {
  animation: shake 0.4s ease-in-out;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Content - Default Mobile */
.tax-content {
  max-width: 780px;
  margin: 0 auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

/* Form card */
.form-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; }

.form-header {
  padding: 1rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.fh-left h2 { font-size: 0.95rem; font-weight: 700; color: #0f172a; margin: 0; }
.fh-left p { font-size: 0.8rem; color: #64748b; margin: 0.25rem 0 0; }

.btn-assistant-trigger {
  display: flex; align-items: center; justify-content: center; gap: 0.625rem;
  padding: 0.625rem 1rem; background: #eff6ff; color: #2563eb;
  border: 1px solid #bfdbfe; border-radius: 10px; font-size: 0.84rem;
  font-weight: 700; cursor: pointer; transition: all 0.15s;
  width: 100%;
}
.btn-assistant-trigger:hover { background: #dbeafe; transform: translateY(-1px); }
.bot-icon { font-size: 1.1rem; }

.form-body {
  padding: 0.875rem;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}
.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field.full { grid-column: 1 / -1; }

label { font-size: 0.83rem; font-weight: 600; color: #374151; }
.req { color: #ef4444; }
.opt { color: #9ca3af; font-weight: 400; }
.hint { font-size: 0.74rem; color: #9ca3af; margin: 0; }
.err { font-size: 0.74rem; color: #dc2626; margin: 0; }

input[type="text"], input[type="number"] {
  width: 100%; padding: 0.75rem 0.875rem;
  border: 1px solid #d1d5db; border-radius: 8px;
  font-size: 1rem; font-family: inherit;
  background: white; color: #111827;
  transition: border-color 0.15s;
}
input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }

.input-row { display: flex; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; background: white; }
.input-row input { border: none; border-radius: 0; flex: 1; box-shadow: none !important; }
.input-row input:focus { box-shadow: none !important; }
.unit {
  padding: 0 0.5rem; font-size: 0.72rem; font-weight: 600;
  color: #9ca3af; background: #f9fafb;
  border-left: 1px solid #e5e7eb; display: flex; align-items: center; white-space: nowrap;
}

/* Secteur - Default Mobile */
.secteur-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.375rem; }
.secteur-btn {
  display: flex; flex-direction: column; align-items: center; gap: 0.35rem;
  padding: 0.5rem 0.375rem; border: 1px solid #e2e8f0;
  border-radius: 10px; background: white; cursor: pointer;
  font-size: 0.75rem; font-weight: 500; color: #475569;
  text-align: center; transition: all 0.15s; width: 100%;
}
.secteur-btn:hover { border-color: #94a3b8; background: #f8fafc; }
.secteur-btn.active { border-color: #0f766e; background: #f0fdfa; color: #0f766e; font-weight: 600; }
.secteur-icon { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; color: inherit; }
.secteur-icon :deep(svg) { width: 20px; height: 20px; }
.secteur-label { font-size: 0.68rem; line-height: 1.3; }

/* Checkbox */
.check-label { display: flex; align-items: flex-start; gap: 0.5rem; cursor: pointer; font-weight: 500; font-size: 0.85rem; color: #374151; }
.check-label input[type="checkbox"] { margin-top: 2px; width: 15px; height: 15px; accent-color: #0f766e; flex-shrink: 0; }

/* Regime chip */
.regime-chip { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.65rem; border-radius: 20px; font-size: 0.78rem; font-weight: 600; margin-top: 0.3rem; }

/* Regime chip éducatif */
.regime-chip-edu {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.6rem 0.875rem; border-radius: 12px;
  font-size: 0.82rem; font-weight: 600; margin-top: 0.5rem;
}
.rce-name { font-size: 0.82rem; font-weight: 600; }
.rce-hint { font-size: 0.73rem; font-weight: 400; opacity: 0.75; margin-top: 0.1rem; }

/* Label with tooltip button */
.label-with-tip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.tip-btn {
  flex-shrink: 0;
  width: 20px; height: 20px;
  min-width: 20px; min-height: 20px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid #d1d5db;
  background: #f9fafb;
  color: #6b7280;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  line-height: 1;
}
.tip-btn:hover, .tip-btn.active {
  background: #2563eb;
  border-color: #2563eb;
  color: white;
}
.tip-btn.small {
  width: 18px; height: 18px;
  min-width: 18px; min-height: 18px;
  font-size: 0.65rem;
}

/* Tooltip box */
.tooltip-box {
  background: #0f172a;
  color: white;
  border-radius: 12px;
  padding: 0.875rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  animation: fadeIn 0.2s ease-out;
}
.tt-title { font-size: 0.82rem; font-weight: 700; color: #f8fafc; }
.tt-text { font-size: 0.8rem; color: #cbd5e1; line-height: 1.55; margin: 0; }
.tt-exemple {
  font-size: 0.75rem; color: #94a3b8;
  background: rgba(255,255,255,0.07);
  border-radius: 6px;
  padding: 0.4rem 0.625rem;
  line-height: 1.4;
  font-style: italic;
}

/* Field description */
.field-desc {
  font-size: 0.77rem;
  color: #64748b;
  margin: 0;
  line-height: 1.4;
}

/* CGA badge */
.cga-badge {
  display: inline-block;
  background: #dcfce7;
  color: #15803d;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 6px;
  margin-left: 0.25rem;
}

/* Welcome banner */
.welcome-banner {
  background: linear-gradient(135deg, #eff6ff 0%, #f0fdfa 100%);
  border-bottom: 1px solid #e0f2fe;
  padding: 0.875rem;
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
}
.wb-content {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  flex: 1;
}
.wb-icon { font-size: 1.5rem; flex-shrink: 0; margin-top: 2px; }
.wb-text { flex: 1; }
.wb-text strong { font-size: 0.88rem; color: #0f172a; display: block; margin-bottom: 0.5rem; }
.wb-steps {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.wb-step {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #374151;
}
.wb-num {
  flex-shrink: 0;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: #0f172a;
  color: white;
  font-size: 0.68rem;
  font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.wb-close {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px;
  cursor: pointer;
  color: #94a3b8;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.wb-close:hover { background: #f1f5f9; color: #374151; }

/* RSI notice */
.rsi-notice { background: #fefce8; border: 1px solid #fde68a; border-radius: 10px; padding: 1rem; display: flex; flex-direction: column; gap: 0.625rem; }
.notice-text { display: flex; align-items: center; gap: 0.5rem; font-size: 0.83rem; color: #92400e; font-weight: 500; }

/* Form footer - Default Mobile */
.form-footer { padding: 0.875rem; display: flex; justify-content: flex-end; border-top: 1px solid #f1f5f9; }
.btn-primary {
  display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  background: #0f766e; color: white;
  border: none; border-radius: 9px;
  padding: 0.875rem;
  font-size: 1rem; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
  touch-action: manipulation;
  width: 100%;
}
.btn-primary:hover { background: #0d6460; box-shadow: 0 4px 12px rgba(15,118,110,0.25); }
.btn-primary:active { transform: scale(0.98); }

.reset-row { display: flex; justify-content: center; padding: 0.5rem; }
.btn-outline {
  background: white; border: 1px solid #d1d5db;
  border-radius: 8px; padding: 0.6rem 1.5rem;
  font-size: 0.875rem; font-weight: 600; color: #6b7280;
  cursor: pointer; transition: all 0.15s;
}
.btn-outline:hover { background: #f9fafb; border-color: #9ca3af; color: #374151; }

/* Divider */
.form-divider { height: 1px; background: #f1f5f9; margin: 0 1.75rem; }

/* Results Tabs - Default Mobile */
.result-tabs {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  gap: 0.5rem;
  background: white;
  padding: 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  margin: 1rem 0;
  scrollbar-width: none;
}
.result-tabs::-webkit-scrollbar { display: none; }

.result-tabs button {
  flex: 0 0 auto;
  white-space: nowrap;
  padding: 0.6rem 1rem;
  border: none;
  background: transparent;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}
.result-tabs button:hover { background: #f1f5f9; color: #0f172a; }
.result-tabs button.active {
  background: #0f172a;
  color: white;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
}

.tab-content-area {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Promo ONDA Pro - Default Mobile */
.onda-pro-promo {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border-radius: 20px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  text-align: center;
  gap: 1.5rem;
  margin: 2rem 0;
  color: white;
  position: relative;
  overflow: hidden;
}
.promo-content { flex: 1; z-index: 2; }
.promo-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: #3b82f6;
  color: white;
  border-radius: 20px;
  font-size: 0.65rem;
  font-weight: 800;
  margin-bottom: 1rem;
}
.promo-content h3 { font-size: 1.5rem; margin-bottom: 0.75rem; color: white; }
.promo-content p { color: #94a3b8; font-size: 0.9rem; margin-bottom: 1.5rem; line-height: 1.6; }
.promo-actions { display: flex; gap: 1rem; justify-content: center; }

.promo-actions .btn-primary {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  justify-content: center;
}
.promo-actions .btn-primary:hover { background: #2563eb; transform: translateY(-2px); }

.btn-outline-white {
  background: transparent;
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 0.75rem 1.5rem;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  width: 100%;
}

.promo-icon { display: none; }
.phone-mockup {
  width: 120px;
  height: 220px;
  background: #334155;
  border-radius: 20px;
  border: 4px solid #475569;
  padding: 6px;
  position: relative;
  transform: rotate(5deg);
}
.phone-screen {
  width: 100%;
  height: 100%;
  background: #1e293b;
  border-radius: 14px;
  overflow: hidden;
}

/* ─────────────────────────────────────────────────────────────
   Media Queries pour tablettes et ordinateurs (Desktop-First progressive enhancements)
   ───────────────────────────────────────────────────────────── */

@media (min-width: 641px) {
  /* Header */
  .tax-header { padding: 0 1.5rem; height: 58px; }
  .back-btn { padding: 0.4rem 0.875rem; font-size: 0.85rem; }
  .tax-title-main { font-size: 0.95rem; }
  .tax-title-sub { display: block; font-size: 0.72rem; color: #64748b; }

  /* Content spacing */
  .tax-content { padding: 2rem 1rem; gap: 1.5rem; }

  /* Welcome Banner */
  .welcome-banner { padding: 1rem 1.25rem; }
  .wb-content { gap: 0.875rem; }

  /* Form spacing and layout */
  .form-header { padding: 1.5rem 1.75rem; flex-direction: row; align-items: center; justify-content: space-between; gap: 1.5rem; }
  .fh-left h2 { font-size: 1.05rem; }
  .btn-assistant-trigger { width: auto; }
  
  .form-body { padding: 1.5rem 1.75rem; grid-template-columns: 1fr 1fr; gap: 1.25rem; }

  /* Fields inputs */
  input[type="text"], input[type="number"] { font-size: 0.9rem; padding: 0.625rem 0.875rem; }
  .unit { padding: 0 0.75rem; font-size: 0.75rem; }

  /* Secteurs */
  .secteur-grid { grid-template-columns: repeat(4, 1fr); gap: 0.4rem; }
  .secteur-btn { padding: 0.625rem 0.5rem; }

  /* Form footer */
  .form-footer { padding: 1rem 1.75rem 1.5rem; }
  .btn-primary { width: auto; padding: 0.75rem 1.5rem; font-size: 0.9rem; }

  /* Tabs */
  .result-tabs { overflow-x: visible; }
  .result-tabs button { flex: 1; padding: 0.75rem 1rem; font-size: 0.85rem; }
}

@media (min-width: 769px) {
  /* Promo ONDA Pro */
  .onda-pro-promo { flex-direction: row; text-align: left; gap: 2rem; padding: 2rem; }
  .promo-actions { justify-content: flex-start; }
  .promo-actions .btn-primary, .btn-outline-white { width: auto; }
  .promo-icon { display: block; flex-shrink: 0; z-index: 2; }
}

@media print {
  .no-print { display: none !important; }
  .tax-page { background: white !important; }
  .tax-content { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
}
</style>
