<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { api, LABELS } from './services/mockData'

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════

const step = ref(1)

// Data
const banques = ref([])
const prets = ref([])

// Selections
const selectedBanque = ref(null)
const selectedPret = ref(null)

// Config Prêt
const montant = ref(0)
const duree = ref(0)

// Infos Client COMPLÈTES
const client = ref({
  age: 0,
  personnesCharge: 0,
  situationFamiliale: 'celibataire',
  typeContrat: 'cdi',
  anciennete: 0, // en mois
  revenus: 0,
  chargesLoyer: 0,
  chargesCredits: 0,
  autresCharges: 0,
  historiqueCredit: 'bon',
  garantieDisponible: 'aucune',
  apportDisponible: 0
})

// UI
const showFullTable = ref(false)

// ══════════════════════════════════════════════════════════════
// CHARGEMENT
// ══════════════════════════════════════════════════════════════

onMounted(async () => {
  banques.value = await api.getBanques()
})

watch(selectedBanque, async (banque) => {
  if (!banque) return
  prets.value = await api.getPretsByBanque(banque.id)
  selectedPret.value = null
})

watch(selectedPret, (pret) => {
  if (!pret) return
  montant.value = pret.montant_min
  duree.value = pret.duree_min
  
  // Auto-scroll vers les détails du prêt
  nextTick(() => {
    const detailsEl = document.getElementById('pret-details')
    if (detailsEl) {
      detailsEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
})

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

const fcfa = (val) => new Intl.NumberFormat('fr-FR').format(Math.round(val)) + ' FCFA'

// ══════════════════════════════════════════════════════════════
// TAUX PERSONNALISABLE (pour toutes les banques)
// ══════════════════════════════════════════════════════════════
const tauxPersonnalise = ref(null)
const tauxModifie = ref(false) // Flag pour savoir si l'utilisateur a modifié le taux

// Taux effectif utilisé pour les calculs
const tauxEffectif = computed(() => {
  if (!selectedPret.value) return 0
  // Si un taux personnalisé est défini, l'utiliser
  if (tauxPersonnalise.value !== null) {
    return tauxPersonnalise.value
  }
  return selectedPret.value.taux
})

// Réinitialiser le taux personnalisé quand on change de prêt
watch(selectedPret, (newPret) => {
  if (newPret) {
    tauxPersonnalise.value = newPret.taux
    tauxModifie.value = false
  } else {
    tauxPersonnalise.value = null
    tauxModifie.value = false
  }
})

// ══════════════════════════════════════════════════════════════
// CALCULS FINANCIERS
// ══════════════════════════════════════════════════════════════

const mensualite = computed(() => {
  if (!selectedPret.value || !montant.value || !duree.value) return 0
  const r = (tauxEffectif.value / 100) / 12
  const n = duree.value
  const P = montant.value
  if (r === 0) return P / n
  return (P * r) / (1 - Math.pow(1 + r, -n))
})

const coutTotal = computed(() => mensualite.value * duree.value)
const totalInterets = computed(() => coutTotal.value - montant.value)
const fraisDossier = computed(() => selectedPret.value ? montant.value * (selectedPret.value.frais_dossier / 100) : 0)
const coutAssurance = computed(() => selectedPret.value ? montant.value * (selectedPret.value.assurance / 100) * (duree.value / 12) : 0)

// Charges totales client
const totalChargesClient = computed(() => {
  return client.value.chargesLoyer + client.value.chargesCredits + client.value.autresCharges
})

const totalChargesApresPret = computed(() => totalChargesClient.value + mensualite.value)

// Quotités
const quotiteUtilisee = computed(() => {
  if (!client.value.revenus) return 0
  return (totalChargesApresPret.value / client.value.revenus) * 100
})

const quotiteDisponible = computed(() => Math.max(0, 35 - quotiteUtilisee.value))
const quotiteCessible = 33.33

// Reste à vivre (avec personnes à charge)
const resteAVivre = computed(() => client.value.revenus - totalChargesApresPret.value)
const resteAVivreMinimum = computed(() => {
  // 100k de base + 50k par personne à charge
  return 100000 + (client.value.personnesCharge * 50000)
})

// Capacité emprunt max
const capaciteEmpruntMax = computed(() => {
  if (!selectedPret.value || !client.value.revenus) return 0
  const mensualiteMax = client.value.revenus * 0.35 - totalChargesClient.value
  if (mensualiteMax <= 0) return 0
  const r = (selectedPret.value.taux / 100) / 12
  const n = duree.value
  if (r === 0) return mensualiteMax * n
  return (mensualiteMax * (1 - Math.pow(1 + r, -n))) / r
})

const quotiteStatus = computed(() => {
  if (quotiteUtilisee.value > 35) return { label: 'Refusé', color: 'danger', icon: '❌' }
  if (quotiteUtilisee.value > 30) return { label: 'Limite', color: 'warning', icon: '⚠️' }
  return { label: 'OK', color: 'success', icon: '✅' }
})

// ══════════════════════════════════════════════════════════════
// SCORING
// ══════════════════════════════════════════════════════════════

const scoring = computed(() => {
  let score = 0
  let details = []

  // Revenus (25 pts)
  if (client.value.revenus >= 1000000) { score += 25; details.push({ label: 'Revenus', points: 25, max: 25 }) }
  else if (client.value.revenus >= 500000) { score += 18; details.push({ label: 'Revenus', points: 18, max: 25 }) }
  else if (client.value.revenus >= 300000) { score += 12; details.push({ label: 'Revenus', points: 12, max: 25 }) }
  else { score += 5; details.push({ label: 'Revenus', points: 5, max: 25 }) }

  // Âge (15 pts)
  if (client.value.age >= 25 && client.value.age <= 45) { score += 15; details.push({ label: 'Âge', points: 15, max: 15 }) }
  else if (client.value.age >= 18 && client.value.age < 25) { score += 10; details.push({ label: 'Âge', points: 10, max: 15 }) }
  else { score += 5; details.push({ label: 'Âge', points: 5, max: 15 }) }

  // Stabilité (20 pts)
  if (client.value.typeContrat === 'fonctionnaire') { score += 20; details.push({ label: 'Emploi', points: 20, max: 20 }) }
  else if (client.value.typeContrat === 'cdi') { score += 18; details.push({ label: 'Emploi', points: 18, max: 20 }) }
  else if (client.value.typeContrat === 'cdd') { score += 8; details.push({ label: 'Emploi', points: 8, max: 20 }) }
  else { score += 5; details.push({ label: 'Emploi', points: 5, max: 20 }) }

  // Ancienneté (15 pts)
  if (client.value.anciennete >= 60) { score += 15; details.push({ label: 'Ancienneté', points: 15, max: 15 }) }
  else if (client.value.anciennete >= 24) { score += 10; details.push({ label: 'Ancienneté', points: 10, max: 15 }) }
  else { score += 5; details.push({ label: 'Ancienneté', points: 5, max: 15 }) }

  // Historique (25 pts)
  if (client.value.historiqueCredit === 'bon') { score += 25; details.push({ label: 'Historique', points: 25, max: 25 }) }
  else if (client.value.historiqueCredit === 'premier') { score += 15; details.push({ label: 'Historique', points: 15, max: 25 }) }
  else if (client.value.historiqueCredit === 'retards') { score += 8; details.push({ label: 'Historique', points: 8, max: 25 }) }
  else { score += 0; details.push({ label: 'Historique', points: 0, max: 25 }) }

  let niveau, couleur
  if (score >= 80) { niveau = 'Excellent'; couleur = 'success' }
  else if (score >= 60) { niveau = 'Bon'; couleur = 'primary' }
  else if (score >= 40) { niveau = 'Moyen'; couleur = 'warning' }
  else { niveau = 'Faible'; couleur = 'danger' }

  return { score, details, niveau, couleur }
})

// ══════════════════════════════════════════════════════════════
// VÉRIFICATION CONDITIONS DU PRÊT
// ══════════════════════════════════════════════════════════════

const verificationConditions = computed(() => {
  if (!selectedPret.value) return { ok: false, erreurs: [], avertissements: [] }
  
  const cond = selectedPret.value.conditions
  const erreurs = []
  const avertissements = []

  // Âge
  if (client.value.age < cond.age_min) {
    erreurs.push(`Âge minimum requis: ${cond.age_min} ans (vous avez ${client.value.age} ans)`)
  }
  if (client.value.age > cond.age_max) {
    erreurs.push(`Âge maximum: ${cond.age_max} ans (vous avez ${client.value.age} ans)`)
  }

  // Ancienneté
  if (client.value.anciennete < cond.anciennete_min) {
    erreurs.push(`Ancienneté minimum: ${cond.anciennete_min} mois (vous avez ${client.value.anciennete} mois)`)
  }

  // Revenus
  if (client.value.revenus < cond.revenus_min) {
    erreurs.push(`Revenus minimum: ${fcfa(cond.revenus_min)} (vous avez ${fcfa(client.value.revenus)})`)
  }

  // Type de contrat
  if (!cond.types_contrat.includes(client.value.typeContrat)) {
    erreurs.push(`Type de contrat non accepté. Acceptés: ${cond.types_contrat.map(c => LABELS.contrats[c]).join(', ')}`)
  }

  // Garantie
  const garantieRequise = cond.garantie_requise || 
    (cond.garantie_si_montant_superieur && montant.value > cond.garantie_si_montant_superieur)
  
  if (garantieRequise) {
    if (client.value.garantieDisponible === 'aucune') {
      erreurs.push(`Garantie obligatoire. Acceptées: ${cond.types_garantie_acceptes.map(g => LABELS.garanties[g]).join(', ')}`)
    } else if (!cond.types_garantie_acceptes.includes(client.value.garantieDisponible)) {
      erreurs.push(`Votre garantie (${LABELS.garanties[client.value.garantieDisponible]}) n'est pas acceptée pour ce prêt`)
    }
  }

  // Apport personnel
  if (cond.apport_personnel > 0) {
    const apportRequis = montant.value * (cond.apport_personnel / 100)
    if (client.value.apportDisponible < apportRequis) {
      erreurs.push(`Apport personnel requis: ${cond.apport_personnel}% soit ${fcfa(apportRequis)} (vous avez ${fcfa(client.value.apportDisponible)})`)
    }
  }

  // Domiciliation
  if (cond.domiciliation_obligatoire) {
    avertissements.push("Domiciliation de salaire obligatoire dans cette banque")
  }

  return { ok: erreurs.length === 0, erreurs, avertissements }
})

// ══════════════════════════════════════════════════════════════
// DÉCISION FINALE
// ══════════════════════════════════════════════════════════════

const decision = computed(() => {
  let eligible = true
  const raisons = []

  // Vérification conditions prêt
  if (!verificationConditions.value.ok) {
    eligible = false
    raisons.push(...verificationConditions.value.erreurs)
  }

  // Quotité
  if (quotiteUtilisee.value > 35) {
    eligible = false
    raisons.push(`Taux d'endettement: ${quotiteUtilisee.value.toFixed(1)}% (max 35%)`)
  }

  // Reste à vivre
  if (resteAVivre.value < resteAVivreMinimum.value) {
    eligible = false
    raisons.push(`Reste à vivre insuffisant: ${fcfa(resteAVivre.value)} (min ${fcfa(resteAVivreMinimum.value)} pour ${client.value.personnesCharge + 1} personne(s))`)
  }

  // Score
  if (scoring.value.score < 40) {
    eligible = false
    raisons.push(`Score de crédit: ${scoring.value.score}/100 (min 40)`)
  }

  return { eligible, raisons, avertissements: verificationConditions.value.avertissements }
})

// ══════════════════════════════════════════════════════════════
// AMORTISSEMENT
// ══════════════════════════════════════════════════════════════

const amortissement = computed(() => {
  if (!selectedPret.value || !montant.value || !duree.value) return []
  const rows = []
  let solde = montant.value
  const r = (selectedPret.value.taux / 100) / 12
  const pmt = mensualite.value
  
  for (let i = 1; i <= duree.value; i++) {
    const interets = solde * r
    const capital = pmt - interets
    solde -= capital
    rows.push({ mois: i, mensualite: pmt, capital, interets, solde: Math.max(0, solde) })
  }
  return rows
})

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════

const canProceedStep1 = computed(() => selectedBanque.value && selectedPret.value)
const canProceedStep2 = computed(() => montant.value > 0 && duree.value > 0 && client.value.revenus > 0 && client.value.age > 0 && client.value.anciennete >= 0)

// Toast notification
const toast = ref({ show: false, message: '', type: 'error' })

const showToast = (message, type = 'error') => {
  toast.value = { show: true, message, type }
  setTimeout(() => {
    toast.value.show = false
  }, 4000)
}

// Validation des champs requis étape 2
const getStep2Errors = () => {
  const errors = []
  if (!client.value.age || client.value.age <= 0) errors.push('Âge')
  if (!client.value.revenus || client.value.revenus <= 0) errors.push('Revenus')
  if (!montant.value || montant.value <= 0) errors.push('Montant du prêt')
  if (!duree.value || duree.value <= 0) errors.push('Durée du prêt')
  return errors
}

const tryGoToStep3 = () => {
  const errors = getStep2Errors()
  if (errors.length > 0) {
    showToast(`Veuillez remplir les champs suivants : ${errors.join(', ')}`, 'error')
    return
  }
  goToStep(3)
}

const goToStep = (s) => {
  step.value = s
  // Scroll vers le haut de la page
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
const reset = () => { step.value = 1; selectedBanque.value = null; selectedPret.value = null }
</script>

<template>
  <div class="app-container">
    
    <!-- Toast Notification -->
    <div v-if="toast.show" class="toast-notification" :class="toast.type">
      <span class="toast-icon">{{ toast.type === 'error' ? '⚠️' : '✅' }}</span>
      <span class="toast-message">{{ toast.message }}</span>
      <button class="toast-close" @click="toast.show = false">×</button>
    </div>
    
    <div class="text-center mb-6">
      <h1 style="color: #1e40af;">🏦 Simulateur de Prêt Bancaire</h1>
      <p class="text-muted">Évaluez votre éligibilité en toute transparence</p>
    </div>

    <!-- Bouton Retour Fixe Global (visible sur étapes 2 et 3) -->
    <div v-if="step > 1" class="fixed-back-button">
      <button @click="goToStep(step - 1)">
        ← Retour
      </button>
    </div>

    <div class="main-card">
      
      <!-- Progress -->
      <div style="display: flex; background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
        <div 
          v-for="s in [{n:1, label:'Banque & Prêt'}, {n:2, label:'Votre Profil'}, {n:3, label:'Résultats'}]"
          :key="s.n"
          style="flex: 1; padding: 1rem; text-align: center; font-weight: 600; font-size: 0.875rem;"
          :style="{ background: step >= s.n ? '#2563eb' : 'transparent', color: step >= s.n ? 'white' : '#64748b' }"
        >
          {{ s.n }}. {{ s.label }}
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════
           ÉTAPE 1
           ═══════════════════════════════════════════════════════════════ -->
      <div v-if="step === 1" class="card-body animate-in">
        
        <div class="mb-6">
          <label style="font-size: 1rem; margin-bottom: 1rem;">Choisissez votre banque</label>
          <div class="bank-grid">
            <div v-for="b in banques" :key="b.id" class="bank-card" :class="{ selected: selectedBanque?.id === b.id }" @click="selectedBanque = b">
              <img :src="b.logo" :alt="b.nom" />
              <div class="name">{{ b.nom }}</div>
            </div>
          </div>
        </div>

        <div v-if="selectedBanque" class="animate-in">
          <label style="font-size: 1rem; margin-bottom: 1rem;">Prêts disponibles</label>
          
          <div class="loan-list">
            <div v-for="p in prets" :key="p.id" class="loan-card" :class="{ selected: selectedPret?.id === p.id }" @click="selectedPret = p">
              <div class="info">
                <h4>{{ p.nom }}</h4>
                <p>{{ p.description }}</p>
                <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                  <span class="text-xs" style="background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 4px;">
                    💰 {{ fcfa(p.montant_min) }} → {{ fcfa(p.montant_max) }}
                  </span>
                  <span class="text-xs" style="background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 4px;">
                    ⏱ {{ p.duree_min }}-{{ p.duree_max }} mois
                  </span>
                </div>
              </div>
              <div class="rate">{{ p.taux }}%</div>
            </div>
          </div>

          <!-- Conditions du prêt sélectionné - Version Dynamique -->
          <div v-if="selectedPret" id="pret-details" class="pret-details-container">
            
            <!-- Header du prêt sélectionné -->
            <div class="pret-selected-header">
              <div class="pret-selected-icon">🎯</div>
              <div class="pret-selected-info">
                <h4>{{ selectedPret.nom }}</h4>
                <p>{{ selectedPret.description }}</p>
              </div>
              <div class="pret-taux-badge">
                <span class="taux-value">{{ selectedPret.taux }}%</span>
                <span class="taux-label">Taux HT</span>
              </div>
            </div>

            <!-- Avantages avec animation -->
            <div class="avantages-section">
              <h5 class="section-subtitle">
                <span class="subtitle-icon">✨</span> Avantages
              </h5>
              <div class="avantages-grid">
                <div 
                  v-for="(av, index) in selectedPret.avantages" 
                  :key="av" 
                  class="avantage-item"
                  :style="{ animationDelay: (index * 0.1) + 's' }"
                >
                  <span class="avantage-check">✓</span>
                  <span>{{ av }}</span>
                </div>
              </div>
            </div>
            
            <!-- Critères d'éligibilité avec cartes -->
            <div class="eligibilite-section">
              <h5 class="section-subtitle">
                <span class="subtitle-icon">📋</span> Critères d'éligibilité
              </h5>
              <div class="criteres-grid">
                
                <div class="critere-card" style="--delay: 0s">
                  <div class="critere-icon">👤</div>
                  <div class="critere-content">
                    <span class="critere-label">Âge requis</span>
                    <span class="critere-value">{{ selectedPret.conditions.age_min }} - {{ selectedPret.conditions.age_max }} ans</span>
                  </div>
                </div>
                
                <div class="critere-card" style="--delay: 0.05s">
                  <div class="critere-icon">📅</div>
                  <div class="critere-content">
                    <span class="critere-label">Ancienneté bancaire min.</span>
                    <span class="critere-value">{{ selectedPret.conditions.anciennete_min }} mois à la banque</span>
                  </div>
                </div>
                
                <div class="critere-card" style="--delay: 0.1s">
                  <div class="critere-icon">💰</div>
                  <div class="critere-content">
                    <span class="critere-label">Revenus minimum</span>
                    <span class="critere-value">{{ fcfa(selectedPret.conditions.revenus_min) }}</span>
                  </div>
                </div>
                
                <div class="critere-card" style="--delay: 0.15s">
                  <div class="critere-icon">📝</div>
                  <div class="critere-content">
                    <span class="critere-label">Contrats acceptés</span>
                    <span class="critere-value contrats-list">{{ selectedPret.conditions.types_contrat.map(c => LABELS.contrats[c]).join(', ') }}</span>
                  </div>
                </div>
                
                <div v-if="selectedPret.conditions.apport_personnel > 0" class="critere-card" style="--delay: 0.2s">
                  <div class="critere-icon">🏦</div>
                  <div class="critere-content">
                    <span class="critere-label">Apport personnel</span>
                    <span class="critere-value highlight-warning">{{ selectedPret.conditions.apport_personnel }}% du montant</span>
                  </div>
                </div>
                
                <div v-if="selectedPret.conditions.garantie_requise" class="critere-card" style="--delay: 0.25s">
                  <div class="critere-icon">🔐</div>
                  <div class="critere-content">
                    <span class="critere-label">Garantie requise</span>
                    <span class="critere-value">{{ selectedPret.conditions.types_garantie_acceptes.map(g => LABELS.garanties[g]).join(', ') }}</span>
                  </div>
                </div>
                
                <div v-else-if="selectedPret.conditions.garantie_si_montant_superieur" class="critere-card" style="--delay: 0.25s">
                  <div class="critere-icon">🔐</div>
                  <div class="critere-content">
                    <span class="critere-label">Garantie conditionnelle</span>
                    <span class="critere-value">Si montant > {{ fcfa(selectedPret.conditions.garantie_si_montant_superieur) }}</span>
                  </div>
                </div>
                
                <div v-if="selectedPret.conditions.domiciliation_obligatoire" class="critere-card info" style="--delay: 0.3s">
                  <div class="critere-icon">🏠</div>
                  <div class="critere-content">
                    <span class="critere-label">Domiciliation</span>
                    <span class="critere-value">Obligatoire</span>
                  </div>
                </div>
                
              </div>
            </div>

            <!-- Note informative -->
            <div class="info-note">
              <span class="note-icon">💡</span>
              <span>Les conditions définitives seront confirmées après étude de votre dossier par la banque.</span>
            </div>
            
          </div>
        </div>

        <!-- Bouton Sticky Footer pour mobile -->
        <div class="sticky-footer" v-if="canProceedStep1">
          <div class="sticky-footer-content">
            <div class="selected-info">
              <span class="selected-badge">✅ {{ selectedBanque?.nom }} - {{ selectedPret?.nom }}</span>
            </div>
            <button class="btn btn-primary" @click="goToStep(2)">Continuer →</button>
          </div>
        </div>

        <div class="mt-6 flex justify-between desktop-nav">
          <div></div>
          <button class="btn btn-primary" :disabled="!canProceedStep1" @click="goToStep(2)">Continuer →</button>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════
           ÉTAPE 2 - PROFIL COMPLET (REDESIGN)
           ═══════════════════════════════════════════════════════════════ -->
      <div v-if="step === 2" class="card-body animate-in">
        
        <!-- Header info prêt sélectionné -->
        <div class="pret-info-header-compact">
          <div class="pret-logo-box">
            <img v-if="selectedBanque?.logo" :src="selectedBanque.logo" alt="Logo" />
            <span v-else>🏦</span>
          </div>
          <div class="pret-info-text">
            <span class="pret-name">{{ selectedPret?.nom }}</span>
            <span class="pret-bank">{{ selectedBanque?.nom }}</span>
          </div>
          <div class="pret-taux">{{ tauxEffectif.toFixed(2) }}%</div>
        </div>

        <div class="params-grid">
          
          <!-- PARAMÈTRES PRÊT -->
          <div class="param-section">
            <h3 class="param-section-title">
              <span class="icon-svg icon-money"></span> Paramètres du prêt
            </h3>
            
            <!-- Montant -->
            <div class="param-group">
              <div class="param-header">
                <span class="param-label">Montant du prêt</span>
                <span class="param-value">{{ fcfa(montant) }}</span>
              </div>
              <div class="slider-wrapper">
                <input 
                  type="range" 
                  class="styled-slider"
                  v-model.number="montant" 
                  :min="selectedPret?.montant_min" 
                  :max="selectedPret?.montant_max" 
                  step="100000" 
                />
              </div>
              <div class="slider-labels">
                <span>{{ fcfa(selectedPret?.montant_min || 0) }}</span>
                <span>{{ fcfa(selectedPret?.montant_max || 0) }}</span>
              </div>
            </div>

            <!-- Durée -->
            <div class="param-group">
              <div class="param-header">
                <span class="param-label">Durée de remboursement</span>
                <span class="param-value orange">{{ duree }} mois</span>
              </div>
              <div class="slider-wrapper">
                <input 
                  type="range" 
                  class="styled-slider orange"
                  v-model.number="duree" 
                  :min="selectedPret?.duree_min" 
                  :max="selectedPret?.duree_max" 
                  step="1" 
                />
              </div>
              <div class="slider-labels">
                <span>{{ selectedPret?.duree_min || 0 }} mois</span>
                <span>{{ selectedPret?.duree_max || 0 }} mois</span>
              </div>
            </div>

            <!-- Taux d'intérêt -->
            <div class="rate-card" :class="{ modified: tauxModifie }">
              <div class="param-header">
                <span class="param-label">
                  🎯 Taux d'intérêt
                  <span v-if="tauxModifie" style="color: #f59e0b; font-weight: 600;"> (personnalisé)</span>
                </span>
                <span class="param-value" :class="{ orange: tauxModifie }">{{ tauxPersonnalise?.toFixed(2) }}% HT</span>
              </div>
              <div class="slider-wrapper">
                <input 
                  type="range" 
                  class="styled-slider"
                  :class="{ orange: tauxModifie }"
                  v-model.number="tauxPersonnalise" 
                  :min="selectedPret?.taux_min || Math.max(0, (selectedPret?.taux || 10) - 5)" 
                  :max="selectedPret?.taux_max || ((selectedPret?.taux || 10) + 5)" 
                  step="0.25" 
                  @input="tauxModifie = (tauxPersonnalise !== selectedPret?.taux)"
                />
              </div>
              <div class="slider-labels">
                <span>{{ (selectedPret?.taux_min || Math.max(0, (selectedPret?.taux || 10) - 5)).toFixed(1) }}%</span>
                <span style="font-style: italic; color: var(--text-muted);">Indicatif : {{ selectedPret?.taux }}%</span>
                <span>{{ (selectedPret?.taux_max || ((selectedPret?.taux || 10) + 5)).toFixed(1) }}%</span>
              </div>
              
              <div class="rate-note">
                <span class="icon-svg icon-warning"></span>
                <span>Le taux affiché est <strong>indicatif</strong>. Ajustez-le si vous connaissez le taux exact de votre banque.</span>
              </div>
              
              <button 
                v-if="tauxModifie" 
                @click="tauxPersonnalise = selectedPret?.taux; tauxModifie = false" 
                class="rate-reset-btn"
              >
                <span class="icon-svg icon-refresh"></span> Réinitialiser
              </button>
            </div>

            <!-- Apport si requis -->
            <div v-if="selectedPret?.conditions.apport_personnel > 0" class="param-group">
              <label>Apport personnel disponible</label>
              <input type="number" v-model.number="client.apportDisponible" step="100000" placeholder="0" />
              <p class="text-xs text-muted mt-2">
                Minimum requis: {{ selectedPret.conditions.apport_personnel }}% = {{ fcfa(montant * selectedPret.conditions.apport_personnel / 100) }}
              </p>
            </div>

            <!-- Garantie si requise -->
            <div v-if="selectedPret?.conditions.garantie_requise || (selectedPret?.conditions.garantie_si_montant_superieur && montant > selectedPret.conditions.garantie_si_montant_superieur)" class="param-group">
              <label>Garantie disponible</label>
              <select v-model="client.garantieDisponible">
                <option value="aucune">Aucune</option>
                <option v-for="g in selectedPret.conditions.types_garantie_acceptes" :key="g" :value="g">
                  {{ LABELS.garanties[g] }}
                </option>
              </select>
            </div>

            <!-- Mensualité -->
            <div class="mensualite-card">
              <span class="label"><span class="icon-svg icon-wallet"></span> Mensualité estimée</span>
              <span class="value">{{ fcfa(mensualite) }}</span>
            </div>
          </div>

          <!-- PROFIL CLIENT -->
          <div class="param-section">
            <h3 class="param-section-title">
              <span class="icon-svg icon-user"></span> Votre profil
            </h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="param-group" style="margin-bottom: 0;">
                <label>Âge</label>
                <input type="number" v-model.number="client.age" min="18" max="70" />
              </div>
              <div class="param-group" style="margin-bottom: 0;">
                <label>Personnes à charge</label>
                <input type="number" v-model.number="client.personnesCharge" min="0" />
              </div>
            </div>

            <div class="param-group">
              <label>Type de contrat</label>
              <select v-model="client.typeContrat">
                <option value="fonctionnaire">Fonctionnaire</option>
                <option value="cdi">CDI</option>
                <option value="cdd">CDD</option>
                <option value="independant">Indépendant</option>
              </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="param-group" style="margin-bottom: 0;">
                <label>Ancienneté bancaire (mois)</label>
                <input type="number" v-model.number="client.anciennete" min="0" placeholder="Ex: 24" />
                <p class="text-xs text-muted mt-1">Durée depuis l'ouverture de votre compte</p>
              </div>
              <div class="param-group" style="margin-bottom: 0;">
                <label>Revenus mensuels nets</label>
                <input type="number" v-model.number="client.revenus" step="10000" />
              </div>
            </div>

            <div class="param-group" style="margin-top: 1.25rem;">
              <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
                <span class="icon-svg icon-charges"></span> Charges mensuelles
              </label>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
                <div>
                  <label class="text-xs" style="color: var(--text-muted); font-weight: 400;">Loyer</label>
                  <input type="number" v-model.number="client.chargesLoyer" step="5000" placeholder="0" />
                </div>
                <div>
                  <label class="text-xs" style="color: var(--text-muted); font-weight: 400;">Crédits en cours</label>
                  <input type="number" v-model.number="client.chargesCredits" step="5000" placeholder="0" />
                </div>
                <div>
                  <label class="text-xs" style="color: var(--text-muted); font-weight: 400;">Autres</label>
                  <input type="number" v-model.number="client.autresCharges" step="5000" placeholder="0" />
                </div>
              </div>
            </div>

            <div class="param-group">
              <label>Historique de crédit</label>
              <select v-model="client.historiqueCredit">
                <option value="bon">Bon (aucun incident)</option>
                <option value="premier">Premier crédit</option>
                <option value="retards">Quelques retards</option>
                <option value="incidents">Incidents graves</option>
              </select>
            </div>
          </div>

        </div>

        <div class="mt-6 flex justify-between">
          <button class="btn btn-outline" @click="goToStep(1)">← Retour</button>
          <button class="btn btn-success" @click="tryGoToStep3">Voir les résultats</button>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════
           ÉTAPE 3 - RÉSULTATS
           ═══════════════════════════════════════════════════════════════ -->
      <div v-if="step === 3" class="card-body animate-in">
        
        <!-- Décision -->
        <div class="p-6 rounded-lg mb-6 text-center" :style="{ background: decision.eligible ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : 'linear-gradient(135deg, #fee2e2, #fecaca)', border: decision.eligible ? '2px solid #22c55e' : '2px solid #ef4444' }">
          <div style="font-size: 3rem;">
            <span v-if="decision.eligible" class="icon-svg icon-check" style="width: 48px; height: 48px;"></span>
            <span v-else class="icon-svg icon-x" style="width: 48px; height: 48px;"></span>
          </div>
          <h2 :style="{ color: decision.eligible ? '#166534' : '#dc2626' }">
            {{ decision.eligible ? 'Prêt Éligible' : 'Prêt Non Éligible' }}
          </h2>
          <p class="text-muted">{{ selectedPret?.nom }} — {{ selectedBanque?.nom }}</p>
          
          <div v-if="!decision.eligible" class="mt-4 text-left p-4 rounded" style="background: rgba(255,255,255,0.8);">
            <strong style="color: #dc2626; display: flex; align-items: center; gap: 0.5rem;">
                <span class="icon-svg icon-x" style="width:16px;height:16px;"></span> Raisons du refus :
            </strong>
            <ul style="margin: 0.5rem 0 0 1.25rem; color: #7f1d1d; font-size: 0.9rem;">
              <li v-for="(r, i) in decision.raisons" :key="i">{{ r }}</li>
            </ul>
          </div>

          <div v-if="decision.avertissements.length" class="avertissement-box">
            <div class="avertissement-header">
              <span class="icon-svg icon-warning" style="width:18px;height:18px;"></span>
              <strong>À noter :</strong>
            </div>
            <ul class="avertissement-list">
              <li v-for="(a, i) in decision.avertissements" :key="i">{{ a }}</li>
            </ul>
          </div>
        </div>

        <!-- Stats -->
        <div class="key-stats-grid">
          <div class="key-stat-card highlight">
             <div class="label">Mensualité</div>
             <div class="value">{{ fcfa(mensualite) }}</div>
          </div>
          <div class="key-stat-card">
              <div class="label">Montant</div>
              <div class="value">{{ fcfa(montant) }}</div>
          </div>
          <div class="key-stat-card">
              <div class="label">Coût total</div>
              <div class="value">{{ fcfa(coutTotal) }}</div>
          </div>
          <div class="key-stat-card">
              <div class="label">Intérêts</div>
              <div class="value text-warning">{{ fcfa(totalInterets) }}</div>
          </div>
        </div>

        <!-- Quotité -->
        <div class="card mb-6">
          <h3 class="mb-2 flex items-center gap-2">
            <span class="icon-svg icon-chart"></span> Analyse Financière
          </h3>
          <p class="term-explanation mb-4">
            💡 Le <strong>taux d'endettement</strong> représente le pourcentage de vos revenus consacré au remboursement de vos dettes. Les banques exigent généralement qu'il reste <strong>inférieur à 35%</strong>.
          </p>
          
          <div class="mb-4">
            <div class="flex justify-between text-sm mb-2">
              <span>Taux d'endettement</span>
              <span class="font-bold flex items-center gap-1" :class="'text-' + quotiteStatus.color">
                <span v-if="quotiteStatus.icon === '✅'" class="icon-svg icon-check" style="width:16px;height:16px;"></span>
                <span v-else-if="quotiteStatus.icon === '⚠️'" class="icon-svg icon-warning" style="width:16px;height:16px;"></span>
                <span v-else-if="quotiteStatus.icon === '🔴'" class="icon-svg icon-x" style="width:16px;height:16px;"></span>
                {{ quotiteUtilisee.toFixed(1) }}%
              </span>
            </div>
            <div class="progress-bar" style="position: relative;">
              <div class="fill" :class="quotiteStatus.color" :style="{ width: Math.min(quotiteUtilisee, 100) + '%' }"></div>
              <div style="position: absolute; left: 30%; top: -6px; width: 2px; height: calc(100% + 12px); background: #fbbf24;"></div>
              <div style="position: absolute; left: 35%; top: -6px; width: 2px; height: calc(100% + 12px); background: #ef4444;"></div>
            </div>
            <div class="flex justify-between text-xs text-muted mt-1">
              <span>0%</span><span style="color:#d97706">30%</span><span style="color:#dc2626">35% max</span>
            </div>
          </div>

          <div class="metrics-grid">
            <div class="metric-box" title="Part de vos revenus déjà engagée dans le remboursement de dettes">
              <div class="m-label">Quotité utilisée</div>
              <div class="m-value">{{ quotiteUtilisee.toFixed(1) }}%</div>
            </div>
            <div class="metric-box success" title="Marge de manœuvre restante pour emprunter davantage">
              <div class="m-label">Quotité disponible</div>
              <div class="m-value">{{ quotiteDisponible.toFixed(1) }}%</div>
            </div>
            <div class="metric-box warning" title="Part maximum de votre salaire qui peut être prélevée directement par la banque">
              <div class="m-label">Quotité cessible</div>
              <div class="m-value">{{ quotiteCessible }}%</div>
            </div>
            <div class="metric-box" :class="resteAVivre >= resteAVivreMinimum ? 'success' : 'danger'" title="Montant restant après paiement de toutes vos charges pour vivre">
              <div class="m-label">Reste à vivre</div>
              <div class="m-value">{{ fcfa(resteAVivre) }}</div>
              <div class="m-sub">Min: {{ fcfa(resteAVivreMinimum) }}</div>
            </div>
          </div>
          
          <div class="glossary-note mt-4">
            <strong>📖 Glossaire :</strong>
            <ul>
              <li><strong>Quotité utilisée :</strong> Pourcentage de vos revenus actuellement consacré aux remboursements de crédits.</li>
              <li><strong>Quotité disponible :</strong> Marge restante avant d'atteindre le seuil maximal d'endettement (35%).</li>
              <li><strong>Quotité cessible :</strong> Part maximale de votre salaire pouvant être prélevée automatiquement (règle UEMOA : 33,33%).</li>
              <li><strong>Reste à vivre :</strong> Montant qui vous reste après le paiement de toutes vos charges fixes et crédits.</li>
            </ul>
          </div>
        </div>

        <!-- Scoring -->
        <div class="card mb-6">
          <h3 class="mb-2 flex items-center gap-2">
            <span class="icon-svg icon-star"></span> Score de Crédit
          </h3>
          <p class="term-explanation mb-4">
            💡 Ce score évalue votre <strong>profil d'emprunteur</strong> sur 100 points. Plus il est élevé, plus vos chances d'obtenir le prêt sont grandes. Un score <strong>≥ 60</strong> est généralement requis.
          </p>
          <div style="display: flex; gap: 2rem; align-items: center;">
            <div style="position: relative; width: 100px; height: 100px; flex-shrink: 0;">
              <svg viewBox="0 0 100 100" style="transform: rotate(-90deg);">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" stroke-width="10"/>
                <circle cx="50" cy="50" r="45" fill="none" :stroke="scoring.couleur === 'success' ? '#22c55e' : scoring.couleur === 'primary' ? '#3b82f6' : scoring.couleur === 'warning' ? '#f59e0b' : '#ef4444'" stroke-width="10" stroke-linecap="round" :stroke-dasharray="283" :stroke-dashoffset="283 - (283 * scoring.score / 100)" style="transition: 1s"/>
              </svg>
              <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <span class="text-xl font-bold">{{ scoring.score }}</span>
                <span class="text-xs text-muted">/100</span>
              </div>
            </div>
            <div style="flex: 1;">
              <div class="mb-2 font-bold" :class="'text-' + scoring.couleur">{{ scoring.niveau }}</div>
              <div style="display: grid; gap: 0.4rem;">
                <div v-for="d in scoring.details" :key="d.label" class="flex items-center gap-2 text-sm">
                  <span style="width: 70px;">{{ d.label }}</span>
                  <div style="flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                    <div style="height: 100%; background: #3b82f6;" :style="{ width: (d.points / d.max * 100) + '%' }"></div>
                  </div>
                  <span class="text-muted text-xs" style="width: 40px;">{{ d.points }}/{{ d.max }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Amortissement -->
        <div class="card">
          <div class="flex justify-between items-center mb-2">
            <h3 class="flex items-center gap-2">
                <span class="icon-svg icon-list"></span> Tableau d'amortissement
            </h3>
            <button class="btn btn-outline text-sm" @click="showFullTable = !showFullTable">{{ showFullTable ? 'Réduire' : 'Voir tout' }}</button>
          </div>
          <p class="term-explanation mb-4">
            💡 Ce tableau détaille <strong>mois par mois</strong> comment votre prêt sera remboursé. Chaque mensualité comprend une part de <strong style="color: #059669;">capital</strong> (remboursement du montant emprunté) et une part d'<strong style="color: #d97706;">intérêts</strong> (coût du crédit).
          </p>
          <div class="table-container" style="max-height: 350px; overflow-y: auto;">
            <table>
              <thead><tr><th>Mois</th><th>Mensualité</th><th>Capital</th><th>Intérêts</th><th>Solde</th></tr></thead>
              <tbody>
                <tr v-for="row in (showFullTable ? amortissement : amortissement.slice(0, 6))" :key="row.mois">
                  <td>{{ row.mois }}</td>
                  <td>{{ fcfa(row.mensualite) }}</td>
                  <td style="color: #059669;">{{ fcfa(row.capital) }}</td>
                  <td style="color: #d97706;">{{ fcfa(row.interets) }}</td>
                  <td class="text-muted">{{ fcfa(row.solde) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="mt-6 flex justify-between">
          <button class="btn btn-outline" @click="goToStep(2)">← Modifier</button>
          <button class="btn btn-primary" @click="reset">Nouvelle simulation</button>
        </div>
      </div>

    </div>

    <div class="text-center mt-6 text-sm text-muted">
      Simulation indicative. Les conditions définitives dépendent de l'étude de votre dossier.
    </div>
  </div>
</template>

<style scoped>
/* Responsive grids */
.charges-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 640px) {
  .charges-grid {
    grid-template-columns: 1fr;
  }
  
  .profile-grid {
    grid-template-columns: 1fr;
  }
}

/* Progress steps responsive */
:deep(.main-card > div:first-child) {
  display: flex;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  :deep(.main-card > div:first-child > div) {
    flex: 1 1 33.333%;
    min-width: 0;
    padding: 0.5rem 0.25rem !important;
    font-size: 0.6rem !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

/* Inline grid overrides for mobile */
@media (max-width: 640px) {
  :deep([style*="grid-template-columns: 1fr 1fr"]),
  :deep([style*="grid-template-columns: repeat(2, 1fr)"]) {
    grid-template-columns: 1fr !important;
  }
  
  :deep([style*="grid-template-columns: 1fr 1fr 1fr"]),
  :deep([style*="grid-template-columns: repeat(3, 1fr)"]) {
    grid-template-columns: 1fr !important;
  }
  
  :deep([style*="gap: 2rem"]) {
    gap: 1rem !important;
  }
  
  /* Score section */
  :deep([style*="display: flex"][style*="gap: 2rem"]) {
    flex-direction: column !important;
    align-items: center !important;
    gap: 1rem !important;
  }
}

/* Scoring details mobile */
@media (max-width: 640px) {
  :deep(.card > div > div[style*="display: grid"][style*="gap: 0.4rem"]) {
    gap: 0.6rem !important;
  }
  
  :deep(.card > div > div[style*="display: grid"][style*="gap: 0.4rem"] > div) {
    flex-wrap: wrap;
  }
  
  :deep(.card > div > div[style*="display: grid"][style*="gap: 0.4rem"] > div > span:first-child) {
    width: 100% !important;
    margin-bottom: 0.25rem;
  }
}

/* Toast Notifications */
.toast-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  background: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 9999;
  animation: slideIn 0.3s ease-out;
  max-width: 90vw;
}

.toast-notification.error {
  border-left: 4px solid #ef4444;
  background: #fef2f2;
  color: #991b1b;
}

.toast-notification.success {
  border-left: 4px solid #22c55e;
  background: #f0fdf4;
  color: #166534;
}

.toast-close {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  opacity: 0.5;
  padding: 0;
  margin-left: auto;
}

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
</style>
