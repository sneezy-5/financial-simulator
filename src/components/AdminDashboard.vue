<script setup>
import { ref, onMounted, computed } from 'vue'
import { adminUser, adminToken, adminLogin, adminLogout, fetchAdminMe } from '../services/adminAuth.js'
import { showToast } from '../services/toast.js'
import { showConfirm } from '../services/confirmModal.js'

const activeTab = ref('analytics') // 'analytics' | 'users'

const stats = ref(null)
const countryStats = ref([])
const users = ref([])
const loading = ref(false)
const usersLoading = ref(false)
const error = ref(null)
const searchUser = ref('')

// Formulaire de connexion Admin
const loginEmail = ref('')
const loginPassword = ref('')
const loginLoading = ref(false)
const loginError = ref('')

// Formulaire de création d'utilisateur client par l'Admin
const showCreateUserModal = ref(false)
const newUserEmail = ref('')
const newUserPassword = ref('')
const createUserLoading = ref(false)
const createUserError = ref('')

const handleCreateUser = async () => {
    try {
        createUserLoading.value = true
        createUserError.value = ''
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getHeaders()
            },
            body: JSON.stringify({
                email: newUserEmail.value,
                password: newUserPassword.value
            })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erreur lors de la création du compte')

        users.value.unshift(data.user)
        showCreateUserModal.value = false
        newUserEmail.value = ''
        newUserPassword.value = ''
    } catch (e) {
        createUserError.value = e.message
    } finally {
        createUserLoading.value = false
    }
}

const activeSubscriptionsCount = computed(() => {
    return users.value.filter(u => u.subscriptionTier && u.subscriptionExpiresAt && new Date(u.subscriptionExpiresAt) > new Date()).length
})

const handleAdminLogin = async () => {
    try {
        loginLoading.value = true
        loginError.value = ''
        await adminLogin(loginEmail.value, loginPassword.value)
        await loadAdminData()
    } catch (e) {
        loginError.value = e.message
    } finally {
        loginLoading.value = false
    }
}

const loadAdminData = async () => {
    if (!adminToken.value) return
    await fetchStats()
    await fetchUsers()
    await fetchSubscriptionPlans()
    await fetchLicenses()
    await fetchBankLoans()
}

// State for Subscription Plans CRUD (Tarifs)
const subscriptionPlans = ref([])
const subscriptionPlansLoading = ref(false)
const showPlanModal = ref(false)
const editingPlanId = ref(null)
const planForm = ref({ code: '', tier: '', billingCycle: 'monthly', name: '', bulletinLimit: 10, price: 5000, popular: false, active: true })
const planFormLoading = ref(false)
const planFormError = ref('')

const fetchSubscriptionPlans = async () => {
    if (!adminToken.value) return
    try {
        subscriptionPlansLoading.value = true
        const res = await fetch('/api/admin/subscription-plans', { headers: getHeaders() })
        if (!res.ok) throw new Error('Erreur chargement des formules')
        const data = await res.json()
        subscriptionPlans.value = data.plans || []
    } catch (e) {
        console.error("Erreur formules d'abonnement:", e.message)
    } finally {
        subscriptionPlansLoading.value = false
    }
}

const openNewPlanModal = () => {
    editingPlanId.value = null
    planForm.value = { code: '', tier: '', billingCycle: 'monthly', name: '', bulletinLimit: 10, price: 5000, popular: false, active: true }
    planFormError.value = ''
    showPlanModal.value = true
}

const openEditPlanModal = (plan) => {
    editingPlanId.value = plan.id
    planForm.value = {
        code: plan.code,
        tier: plan.tier || '',
        billingCycle: plan.billingCycle || 'monthly',
        name: plan.name,
        bulletinLimit: plan.bulletinLimit,
        price: plan.price,
        popular: plan.popular,
        active: plan.active
    }
    planFormError.value = ''
    showPlanModal.value = true
}

const handleSavePlan = async () => {
    try {
        planFormLoading.value = true
        planFormError.value = ''

        const url = editingPlanId.value
            ? `/api/admin/subscription-plans/${editingPlanId.value}`
            : '/api/admin/subscription-plans'
        const method = editingPlanId.value ? 'PUT' : 'POST'

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...getHeaders()
            },
            body: JSON.stringify(planForm.value)
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'enregistrement')

        if (editingPlanId.value) {
            const idx = subscriptionPlans.value.findIndex(p => p.id === editingPlanId.value)
            if (idx !== -1) subscriptionPlans.value[idx] = data.plan
        } else {
            subscriptionPlans.value.push(data.plan)
        }
        showPlanModal.value = false
    } catch (e) {
        planFormError.value = e.message
    } finally {
        planFormLoading.value = false
    }
}

const togglePlanActive = async (plan) => {
    try {
        const res = await fetch(`/api/admin/subscription-plans/${plan.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify({ active: !plan.active })
        })
        if (res.ok) {
            plan.active = !plan.active
        }
    } catch (e) {
        showToast("Erreur : " + e.message, 'error')
    }
}

const togglePlanPopular = async (plan) => {
    try {
        const res = await fetch(`/api/admin/subscription-plans/${plan.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify({ popular: !plan.popular })
        })
        if (res.ok) {
            plan.popular = !plan.popular
        }
    } catch (e) {
        showToast("Erreur : " + e.message, 'error')
    }
}

const deletePlan = async (plan) => {
    const ok = await showConfirm(`Supprimer la formule "${plan.name}" (${plan.bulletinLimit} bulletins pour ${plan.price} FCFA/mois) ?`, { title: 'Supprimer la formule' })
    if (!ok) return
    try {
        const res = await fetch(`/api/admin/subscription-plans/${plan.id}`, {
            method: 'DELETE',
            headers: getHeaders()
        })
        if (res.ok) {
            subscriptionPlans.value = subscriptionPlans.value.filter(p => p.id !== plan.id)
        }
    } catch (e) {
        showToast("Erreur : " + e.message, 'error')
    }
}

// State for Enterprise Licenses CRUD (Édition installable)
const licenses = ref([])
const licensesLoading = ref(false)
const showLicenseModal = ref(false)
const editingLicenseId = ref(null)
const licenseForm = ref({ companyName: '', contactEmail: '', expiresAt: '', price: 500000, notes: '' })
const licenseFormLoading = ref(false)
const licenseFormError = ref('')
const lastCreatedLicenseKey = ref('')

const fetchLicenses = async () => {
    if (!adminToken.value) return
    try {
        licensesLoading.value = true
        const res = await fetch('/api/admin/licenses', { headers: getHeaders() })
        if (!res.ok) throw new Error('Erreur chargement des licences')
        const data = await res.json()
        licenses.value = data.licenses || []
    } catch (e) {
        console.error("Erreur licences entreprise:", e.message)
    } finally {
        licensesLoading.value = false
    }
}

const openNewLicenseModal = () => {
    editingLicenseId.value = null
    licenseForm.value = { companyName: '', contactEmail: '', expiresAt: '', price: 500000, notes: '' }
    licenseFormError.value = ''
    lastCreatedLicenseKey.value = ''
    showLicenseModal.value = true
}

const openEditLicenseModal = (license) => {
    editingLicenseId.value = license.id
    licenseForm.value = {
        companyName: license.companyName,
        contactEmail: license.contactEmail || '',
        expiresAt: license.expiresAt ? license.expiresAt.substring(0, 10) : '',
        price: license.price,
        notes: license.notes || ''
    }
    licenseFormError.value = ''
    lastCreatedLicenseKey.value = ''
    showLicenseModal.value = true
}

const handleSaveLicense = async () => {
    try {
        licenseFormLoading.value = true
        licenseFormError.value = ''

        const url = editingLicenseId.value
            ? `/api/admin/licenses/${editingLicenseId.value}`
            : '/api/admin/licenses'
        const method = editingLicenseId.value ? 'PUT' : 'POST'

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...getHeaders()
            },
            body: JSON.stringify(licenseForm.value)
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'enregistrement')

        if (editingLicenseId.value) {
            const idx = licenses.value.findIndex(l => l.id === editingLicenseId.value)
            if (idx !== -1) licenses.value[idx] = data.license
            showLicenseModal.value = false
        } else {
            licenses.value.unshift(data.license)
            lastCreatedLicenseKey.value = data.license.licenseKey
        }
    } catch (e) {
        licenseFormError.value = e.message
    } finally {
        licenseFormLoading.value = false
    }
}

const toggleLicenseStatus = async (license) => {
    try {
        const newStatus = license.status === 'active' ? 'revoked' : 'active'
        const res = await fetch(`/api/admin/licenses/${license.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify({ status: newStatus })
        })
        if (res.ok) {
            license.status = newStatus
        }
    } catch (e) {
        showToast("Erreur : " + e.message, 'error')
    }
}

const resetLicenseActivation = async (license) => {
    const ok = await showConfirm(`Réinitialiser l'activation de "${license.companyName}" ? L'installation actuellement liée devra ressaisir la clé.`, { title: 'Réinitialiser l\'activation' })
    if (!ok) return
    try {
        const res = await fetch(`/api/admin/licenses/${license.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify({ resetActivation: true })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Échec de la réinitialisation')
        license.installationId = null
        license.activatedAt = null
        showToast(`Activation réinitialisée pour ${license.companyName}.`, 'success')
    } catch (e) {
        showToast("Erreur : " + e.message, 'error')
    }
}

const deleteLicense = async (license) => {
    const ok = await showConfirm(`Supprimer définitivement la licence de "${license.companyName}" ?`, { title: 'Supprimer la licence' })
    if (!ok) return
    try {
        const res = await fetch(`/api/admin/licenses/${license.id}`, {
            method: 'DELETE',
            headers: getHeaders()
        })
        if (res.ok) {
            licenses.value = licenses.value.filter(l => l.id !== license.id)
        }
    } catch (e) {
        showToast("Erreur : " + e.message, 'error')
    }
}

const maskLicenseKey = (key) => {
    if (!key) return ''
    const parts = key.split('-')
    return parts.length === 5 ? `${parts[0]}-${parts[1]}-••••-••••-${parts[4]}` : key
}

// State for Bank Loans CRUD (Simulateur de prêts bancaires)
const bankLoans = ref([])
const bankLoansLoading = ref(false)
const showLoanModal = ref(false)
const editingLoanId = ref(null)
const loanForm = ref({
    bankName: 'BNI',
    loanName: '',
    country: 'CI',
    interestRate: 8.5,
    minAmount: 500000,
    maxAmount: 25000000,
    minDurationMonths: 6,
    maxDurationMonths: 60,
    description: '',
    active: true
})
const loanFormLoading = ref(false)
const loanFormError = ref('')

const fetchBankLoans = async () => {
    if (!adminToken.value) return
    try {
        bankLoansLoading.value = true
        const res = await fetch('/api/admin/bank-loans', { headers: getHeaders() })
        if (!res.ok) throw new Error('Erreur chargement offres bancaires')
        const data = await res.json()
        bankLoans.value = data.loans || []
    } catch (e) {
        console.error("Erreur offres bancaires:", e.message)
    } finally {
        bankLoansLoading.value = false
    }
}

const openNewLoanModal = () => {
    editingLoanId.value = null
    loanForm.value = {
        bankName: 'BNI',
        loanName: '',
        country: 'CI',
        interestRate: 8.5,
        minAmount: 500000,
        maxAmount: 25000000,
        minDurationMonths: 6,
        maxDurationMonths: 60,
        description: '',
        active: true
    }
    loanFormError.value = ''
    showLoanModal.value = true
}

const openEditLoanModal = (loan) => {
    editingLoanId.value = loan.id
    loanForm.value = {
        bankName: loan.bankName,
        loanName: loan.loanName,
        country: loan.country,
        interestRate: loan.interestRate,
        minAmount: loan.minAmount,
        maxAmount: loan.maxAmount,
        minDurationMonths: loan.minDurationMonths,
        maxDurationMonths: loan.maxDurationMonths,
        description: loan.description || '',
        active: loan.active
    }
    loanFormError.value = ''
    showLoanModal.value = true
}

const handleSaveLoan = async () => {
    try {
        loanFormLoading.value = true
        loanFormError.value = ''

        const url = editingLoanId.value 
            ? `/api/admin/bank-loans/${editingLoanId.value}`
            : '/api/admin/bank-loans'
        const method = editingLoanId.value ? 'PUT' : 'POST'

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...getHeaders()
            },
            body: JSON.stringify(loanForm.value)
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'enregistrement de l\'offre')

        if (editingLoanId.value) {
            const idx = bankLoans.value.findIndex(l => l.id === editingLoanId.value)
            if (idx !== -1) bankLoans.value[idx] = data.loan
        } else {
            bankLoans.value.push(data.loan)
        }
        showLoanModal.value = false
    } catch (e) {
        loanFormError.value = e.message
    } finally {
        loanFormLoading.value = false
    }
}

const toggleLoanActive = async (loan) => {
    try {
        const res = await fetch(`/api/admin/bank-loans/${loan.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getHeaders() },
            body: JSON.stringify({ active: !loan.active })
        })
        if (res.ok) {
            loan.active = !loan.active
        }
    } catch (e) {
        showToast("Erreur : " + e.message, 'error')
    }
}

const deleteLoan = async (loan) => {
    const ok = await showConfirm(`Supprimer l'offre "${loan.loanName}" (${loan.bankName}) ?`, { title: 'Supprimer le prêt' })
    if (!ok) return
    try {
        const res = await fetch(`/api/admin/bank-loans/${loan.id}`, {
            method: 'DELETE',
            headers: getHeaders()
        })
        if (res.ok) {
            bankLoans.value = bankLoans.value.filter(l => l.id !== loan.id)
        }
    } catch (e) {
        showToast("Erreur : " + e.message, 'error')
    }
}

// State & Pagination pour Prêts Bancaires
const loanSearch = ref('')
const loanCountryFilter = ref('ALL')
const loanPage = ref(1)
const loansPerPage = ref(10)

const filteredBankLoans = computed(() => {
    return bankLoans.value.filter(l => {
        const matchesCountry = loanCountryFilter.value === 'ALL' || l.country === loanCountryFilter.value;
        const searchLower = loanSearch.value.toLowerCase().trim();
        const matchesSearch = !searchLower || 
            (l.bankName && l.bankName.toLowerCase().includes(searchLower)) || 
            (l.loanName && l.loanName.toLowerCase().includes(searchLower)) ||
            (l.country && l.country.toLowerCase().includes(searchLower));
        return matchesCountry && matchesSearch;
    });
});

const totalLoanPages = computed(() => {
    return Math.ceil(filteredBankLoans.value.length / loansPerPage.value) || 1;
});

const paginatedBankLoans = computed(() => {
    const start = (loanPage.value - 1) * loansPerPage.value;
    return filteredBankLoans.value.slice(start, start + loansPerPage.value);
});

const getHeaders = () => {
    return adminToken.value ? { 'Authorization': `Bearer ${adminToken.value}` } : {}
}

const fetchStats = async () => {
    if (!adminToken.value) return
    try {
        loading.value = true
        error.value = null
        const headers = getHeaders()

        const res = await fetch('/api/stats', { headers })
        if (!res.ok) throw new Error('Erreur de connexion au serveur analytique')
        stats.value = await res.json()

        try {
            const countryRes = await fetch('/api/admin/analytics/countries', { headers })
            if (countryRes.ok) {
                const data = await countryRes.json()
                countryStats.value = data.countryStats || []
            }
        } catch (err) {
            console.warn("Analytics pays réservés aux admins")
        }
    } catch (e) {
        error.value = e.message
    } finally {
        loading.value = false
    }
}

const fetchUsers = async () => {
    if (!adminToken.value) return
    try {
        usersLoading.value = true
        const headers = getHeaders()

        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchUser.value)}`, { headers })
        if (!res.ok) throw new Error('Erreur chargement utilisateurs')
        const data = await res.json()
        users.value = data.users || []
    } catch (e) {
        console.error("Erreur utilisateurs:", e.message)
    } finally {
        usersLoading.value = false
    }
}

// Octroi/prolongation manuelle d'un abonnement (ex : paiement Mobile Money hors Paystack)
const grantUserSubscription = async (userObj, tier) => {
    try {
        const res = await fetch(`/api/admin/users/${userObj.id}/subscription`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getHeaders()
            },
            body: JSON.stringify({ tier, days: 30 })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Échec de l\'activation de l\'abonnement')
        userObj.subscriptionTier = data.user.subscriptionTier
        userObj.subscriptionExpiresAt = data.user.subscriptionExpiresAt
        userObj.bulletinsUsed = data.user.bulletinsUsed
        showToast(tier ? `Abonnement ${tier === 'pro' ? 'Pro' : 'Starter'} activé pour ${userObj.email}.` : `Abonnement désactivé pour ${userObj.email}.`, 'success')
    } catch (e) {
        showToast("Erreur : " + e.message, 'error')
    }
}

const toggleBlockUser = async (userObj) => {
    const actionTxt = userObj.isBlocked ? 'débloquer' : 'suspendre / bloquer'
    const ok = await showConfirm(`Voulez-vous vraiment ${actionTxt} l'utilisateur ${userObj.email} ?`, { 
        title: 'Modération',
        confirmLabel: actionTxt.split(' ')[0].toUpperCase(),
        type: userObj.isBlocked ? 'info' : 'warning'
    })
    if (!ok) return

    try {
        const res = await fetch(`/api/admin/users/${userObj.id}/toggle-block`, {
            method: 'PUT',
            headers: getHeaders()
        })
        if (!res.ok) throw new Error('Échec modération')
        const data = await res.json()
        userObj.isBlocked = data.isBlocked
    } catch (e) {
        showToast("Erreur : " + e.message, 'error')
    }
}

const deleteUser = async (userObj) => {
    const ok = await showConfirm(`Attention : Voulez-vous définitivement supprimer le compte de ${userObj.email} ?`, { title: 'Supprimer le compte' })
    if (!ok) return

    try {
        const res = await fetch(`/api/admin/users/${userObj.id}`, {
            method: 'DELETE',
            headers: getHeaders()
        })
        if (!res.ok) throw new Error('Échec suppression')
        users.value = users.value.filter(u => u.id !== userObj.id)
    } catch (e) {
        showToast("Erreur : " + e.message, 'error')
    }
}

const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('fr-FR', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit'
    })
}

const getCountryBadge = (code) => {
    return (code || 'CI').toUpperCase()
}

const getCountryFlagUrl = (code) => {
    const c = (code || 'ci').toLowerCase()
    return `https://flagcdn.com/w40/${c}.png`
}

const getCountryName = (code) => {
    if (code === 'CI') return 'Côte d\'Ivoire'
    if (code === 'BJ') return 'Bénin'
    if (code === 'TG') return 'Togo'
    if (code === 'ML') return 'Mali'
    if (code === 'BF') return 'Burkina Faso'
    if (code === 'SN') return 'Sénégal'
    if (code === 'CM') return 'Cameroun'
    if (code === 'GA') return 'Gabon'
    return code || 'Autre / Global'
}

const totalCountryVisits = computed(() => {
    return countryStats.value.reduce((acc, c) => acc + (parseInt(c.count) || 0), 0)
})

onMounted(async () => {
    if (adminToken.value) {
        await fetchAdminMe()
        if (adminUser.value) {
            await loadAdminData()
        }
    }
})
</script>

<template>
  <!-- Formulaire de Connexion Administrateur Dédié (si non connecté comme admin) -->
  <div v-if="!adminUser" class="admin-login-wrapper">
    <div class="admin-login-card">
      <div class="admin-login-header">
        <div class="admin-shield-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#312e81" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <h2>Portail Administrateur ONDA</h2>
        <p>Connexion sécurisée réservée aux gestionnaires de la plateforme</p>
      </div>

      <form @submit.prevent="handleAdminLogin" class="admin-login-form">
        <div v-if="loginError" class="login-error-alert">
          {{ loginError }}
        </div>

        <div class="form-group">
          <label>Identifiant Administrateur (Email)</label>
          <input 
            v-model="loginEmail" 
            type="email" 
            required 
            placeholder="Entrez votre email" 
            class="admin-input" 
          />
        </div>

        <div class="form-group">
          <label>Mot de passe Administrateur</label>
          <input 
            v-model="loginPassword" 
            type="password" 
            required 
            placeholder="Entrez votre mot de passe" 
            class="admin-input" 
          />
        </div>

        <button type="submit" :disabled="loginLoading" class="admin-submit-btn">
          <span v-if="loginLoading">Vérification des accès...</span>
          <span v-else>Se connecter à la Console Admin</span>
        </button>
      </form>
    
    </div>
  </div>

  <!-- Dashboard Administrateur Complet (si connecté comme admin) -->
  <div v-else class="admin-container">
    <div class="admin-header">
      <div class="admin-title-area">
        <h1>Console d'Administration</h1>
        <p class="admin-subtitle">Connecté en tant que <strong>{{ adminUser.email }}</strong> ({{ adminUser.name }})</p>
      </div>

      <div class="header-actions" style="display: flex; align-items: center; gap: 0.75rem;">
        <button @click="fetchStats(); fetchUsers();" class="refresh-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          Actualiser
        </button>
        <button @click="adminLogout" class="admin-logout-btn" title="Se déconnecter de la session Admin">
          Déconnexion Admin
        </button>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="admin-tabs">
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'analytics' }"
        @click="activeTab = 'analytics'"
      >
        Analytique & Trafic par Pays
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'users' }"
        @click="activeTab = 'users'; fetchUsers();"
      >
        Utilisateurs & Modération
        <span class="user-count-badge">{{ users.length }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'packs' }"
        @click="activeTab = 'packs'; fetchSubscriptionPlans();"
      >
        Formules d'Abonnement (CRUD)
        <span class="user-count-badge">{{ subscriptionPlans.length }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'licenses' }"
        @click="activeTab = 'licenses'; fetchLicenses();"
      >
        Licences Entreprise
        <span class="user-count-badge">{{ licenses.length }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'bankLoans' }"
        @click="activeTab = 'bankLoans'; fetchBankLoans();"
      >
        Prêts Bancaires (Simulation)
        <span class="user-count-badge">{{ bankLoans.length }}</span>
      </button>
    </div>

    <div v-if="loading" class="admin-loading">
      <div class="spinner"></div>
      <span>Chargement des données administratives...</span>
    </div>

    <div v-else-if="error" class="admin-error">
      {{ error }}
    </div>

    <div v-else class="admin-content">
      <!-- TAB 1: ANALYTICS & TRAFIC -->
      <div v-if="activeTab === 'analytics'" class="tab-pane animate-fade">
        <!-- KPI Grid -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-icon icon-users">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div>
              <div class="kpi-value">{{ stats.totalVisits }}</div>
              <div class="kpi-label">Visiteurs Uniques</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon icon-hits">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h10"/><path d="M9 4v16"/><path d="m3 9 3 3-3 3"/></svg>
            </div>
            <div>
              <div class="kpi-value">{{ stats.totalHits }}</div>
              <div class="kpi-label">Pages Vues Totales</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon icon-accounts">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            </div>
            <div>
              <div class="kpi-value">{{ users.length }}</div>
              <div class="kpi-label">Comptes Inscrits</div>
            </div>
          </div>
        </div>

        <!-- Breakdown par Pays -->
        <div class="section-card">
          <div class="section-header">
            <h3>Ventilation du Trafic par Pays (UEMOA)</h3>
            <span class="subtext">Répartition des requêtes et visites</span>
          </div>

          <div v-if="countryStats.length === 0" class="empty-state">
            Aucune donnée géographique enregistrée pour le moment.
          </div>

          <div v-else class="country-list">
            <div v-for="c in countryStats" :key="c.country" class="country-row">
              <div class="country-info">
                <img :src="getCountryFlagUrl(c.country)" :alt="c.country" class="country-flag-img" />
                <span class="country-name">{{ getCountryName(c.country) }}</span>
                <span class="country-code-pill">{{ getCountryBadge(c.country) }}</span>
              </div>
              <div class="progress-bar-box">
                <div 
                  class="progress-fill" 
                  :style="{ width: Math.max(5, (c.count / (totalCountryVisits || 1)) * 100) + '%' }"
                ></div>
              </div>
              <div class="country-count">
                <strong>{{ c.count }}</strong> visites
                <span class="pct">({{ Math.round((c.count / (totalCountryVisits || 1)) * 100) }}%)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Activités Récentes -->
        <div class="section-card">
          <div class="section-header">
            <h3>Journal des Visites Récentes</h3>
            <span class="subtext">50 dernières interactions</span>
          </div>

          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date & Heure</th>
                  <th>IP Visiteur</th>
                  <th>Pays</th>
                  <th>Page</th>
                  <th>Navigateur / Appareil</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="visit in stats.recentVisits" :key="visit.id">
                  <td class="nowrap">{{ formatDate(visit.timestamp || visit.createdAt) }}</td>
                  <td class="font-mono">{{ visit.ip }}</td>
                  <td>
                    <div class="country-badge-box">
                      <img :src="getCountryFlagUrl(visit.country)" :alt="visit.country" class="country-flag-img-sm" />
                      <span>{{ getCountryBadge(visit.country) }}</span>
                    </div>
                  </td>
                  <td>
                    <span :class="'badge-' + (visit.page || 'home')" class="page-badge">
                      {{ visit.page || 'home' }}
                    </span>
                  </td>
                  <td class="text-sub font-mono" :title="visit.userAgent">{{ visit.userAgent?.substring(0, 45) }}...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 2: UTILISATEURS & ABONNEMENTS (CRUD & MODÉRATION) -->
      <div v-if="activeTab === 'users'" class="tab-pane animate-fade">

        <!-- KPI Abonnements & Comptes -->
        <div class="kpi-grid mb-4">
          <div class="kpi-card">
            <div class="kpi-icon icon-users">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            </div>
            <div>
              <div class="kpi-value">{{ users.length }}</div>
              <div class="kpi-label">Comptes Clients Inscrits</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon icon-hits">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </div>
            <div>
              <div class="kpi-value">{{ activeSubscriptionsCount }}</div>
              <div class="kpi-label">Abonnements Actifs</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon icon-accounts">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div>
              <div class="kpi-value">{{ users.filter(u => !u.isBlocked).length }}</div>
              <div class="kpi-label">Comptes Actifs</div>
            </div>
          </div>
        </div>

        <div class="section-card">
          <div class="user-toolbar">
            <div class="search-box">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input 
                type="text" 
                v-model="searchUser" 
                @input="fetchUsers"
                placeholder="Rechercher par adresse email..." 
                class="search-input"
              />
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button @click="fetchUsers" class="btn-secondary">Filtrer</button>
              <button @click="showCreateUserModal = true" class="btn-primary-action">
                + Créer un Compte Client
              </button>
            </div>
          </div>

          <div v-if="usersLoading" class="admin-loading">
            <div class="spinner"></div>
            <span>Chargement des comptes utilisateurs...</span>
          </div>

          <div v-else-if="users.length === 0" class="empty-state">
            <p>Aucun utilisateur trouvé.</p>
            <button @click="showCreateUserModal = true" class="btn-primary-action" style="margin-top: 0.75rem;">
              + Créer le premier compte client
            </button>
          </div>

          <div v-else class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôle</th>
                  <th>Abonnement</th>
                  <th>Statut du Compte</th>
                  <th>Date d'inscription</th>
                  <th style="text-align: right;">Actions Modération</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in users" :key="u.id" :class="{ 'row-blocked': u.isBlocked }">
                  <td>
                    <div class="user-email-cell">
                      <div class="user-avatar">{{ (u.name || u.companyName || u.email).substring(0, 2).toUpperCase() }}</div>
                      <div style="display: flex; flex-direction: column;">
                        <strong style="color: #0f172a; font-size: 0.875rem;">{{ u.name || u.companyName || u.email }}</strong>
                        <span style="font-size: 0.775rem; color: #64748b;">
                          {{ u.email }} 
                          <span v-if="u.companyName && u.name" style="color: #4f46e5; font-weight: 600;"> — {{ u.companyName }}</span>
                        </span>
                        <span style="font-size: 0.7rem; color: #475569; font-weight: 600; margin-top: 0.1rem;">
                          {{ u.accountType === 'company' ? '🏢 Société / Cabinet' : '👤 Libéral / Indépendant' }}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span :class="u.role === 'admin' ? 'role-badge-admin' : 'role-badge-user'">
                      {{ u.role.toUpperCase() }}
                    </span>
                  </td>
                  <td>
                    <div class="credits-adjuster">
                      <button @click="grantUserSubscription(u, null)" class="btn-credit-min" title="Désactiver l'abonnement">Aucun</button>
                      <button @click="grantUserSubscription(u, 'starter')" class="btn-credit-plus" title="Activer Starter pour 30 jours">Starter</button>
                      <button @click="grantUserSubscription(u, 'pro')" class="btn-credit-plus-big" title="Activer Pro pour 30 jours">Pro</button>
                    </div>
                    <div style="font-size: 0.7rem; color: #64748b; margin-top: 0.3rem;">
                      <template v-if="u.subscriptionTier">
                        <span class="credits-amount" style="padding: 0.15rem 0.5rem; font-size: 0.7rem;">{{ u.subscriptionTier === 'pro' ? 'Pro' : 'Starter' }}</span>
                        {{ u.bulletinsUsed || 0 }} bulletins · expire {{ formatDate(u.subscriptionExpiresAt) }}
                      </template>
                      <template v-else>Aucun abonnement</template>
                    </div>
                  </td>
                  <td>
                    <span v-if="u.isBlocked" class="status-blocked">Suspendu</span>
                    <span v-else class="status-active">Actif</span>
                  </td>
                  <td class="nowrap text-sub">{{ formatDate(u.createdAt) }}</td>
                  <td style="text-align: right;">
                    <div class="actions-cell">
                      <button 
                        @click="toggleBlockUser(u)" 
                        :class="u.isBlocked ? 'btn-unblock' : 'btn-block'"
                      >
                        {{ u.isBlocked ? 'Débloquer' : 'Bloquer' }}
                      </button>
                      <button @click="deleteUser(u)" class="btn-delete" title="Supprimer le compte">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 3: FORMULES D'ABONNEMENT (CRUD) -->
      <div v-if="activeTab === 'packs'" class="tab-pane animate-fade">
        <div class="section-card">
          <div class="user-toolbar">
            <div>
              <h3 style="margin: 0; font-size: 1.1rem; font-weight: 800; color: #0f172a;">Gestion des Formules d'Abonnement</h3>
              <p class="subtext">Configurez le volume de bulletins et les prix en FCFA/mois affichés aux clients.</p>
            </div>
            <button @click="openNewPlanModal" class="btn-primary-action">
              + Nouvelle Formule
            </button>
          </div>

          <div v-if="subscriptionPlansLoading" class="admin-loading">
            <div class="spinner"></div>
            <span>Chargement des formules...</span>
          </div>

          <div v-else-if="subscriptionPlans.length === 0" class="empty-state">
            <p>Aucune formule d'abonnement configurée.</p>
            <button @click="openNewPlanModal" class="btn-primary-action" style="margin-top: 0.75rem;">
              + Créer la première formule
            </button>
          </div>

          <div v-else class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Formule</th>
                  <th>Volume (bulletins/mois)</th>
                  <th>Prix (FCFA/mois)</th>
                  <th>Prix / bulletin</th>
                  <th>Badge Populaire</th>
                  <th>Visibilité Client</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in subscriptionPlans" :key="p.id" :class="{ 'row-inactive': !p.active }">
                  <td>
                    <strong style="color: #0f172a;">{{ p.name }}</strong>
                    <div class="text-sub" style="font-size: 0.7rem;">{{ p.code }} · {{ p.billingCycle === 'annual' ? 'Annuel' : 'Mensuel' }}</div>
                  </td>
                  <td>
                    <span class="credit-pill">{{ p.bulletinLimit }} bulletins</span>
                  </td>
                  <td>
                    <strong style="color: #1e1b4b; font-size: 1rem;">{{ p.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") }} FCFA</strong>
                  </td>
                  <td class="text-sub font-mono">
                    {{ Math.round(p.price / (p.bulletinLimit || 1)) }} FCFA / bulletin
                  </td>
                  <td>
                    <button
                      @click="togglePlanPopular(p)"
                      :class="p.popular ? 'badge-popular-on' : 'badge-popular-off'"
                    >
                      {{ p.popular ? '★ Populaire' : 'Standard' }}
                    </button>
                  </td>
                  <td>
                    <button
                      @click="togglePlanActive(p)"
                      :class="p.active ? 'status-active' : 'status-blocked'"
                    >
                      {{ p.active ? 'Actif' : 'Masqué' }}
                    </button>
                  </td>
                  <td style="text-align: right;">
                    <div class="actions-cell">
                      <button @click="openEditPlanModal(p)" class="btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;">
                        Modifier
                      </button>
                      <button @click="deletePlan(p)" class="btn-delete" title="Supprimer cette formule">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB : LICENCES ENTREPRISE (ÉDITION INSTALLABLE) -->
      <div v-if="activeTab === 'licenses'" class="tab-pane animate-fade">
        <div class="section-card">
          <div class="user-toolbar">
            <div>
              <h3 style="margin: 0; font-size: 1.1rem; font-weight: 800; color: #0f172a;">Licences Entreprise (Édition Installable)</h3>
              <p class="subtext">Vendez une licence unique par entreprise. Chaque clé ne peut être activée que sur une seule installation à la fois.</p>
            </div>
            <button @click="openNewLicenseModal" class="btn-primary-action">
              + Nouvelle Licence
            </button>
          </div>

          <div v-if="licensesLoading" class="admin-loading">
            <div class="spinner"></div>
            <span>Chargement des licences...</span>
          </div>

          <div v-else-if="licenses.length === 0" class="empty-state">
            <p>Aucune licence entreprise créée.</p>
            <button @click="openNewLicenseModal" class="btn-primary-action" style="margin-top: 0.75rem;">
              + Créer la première licence
            </button>
          </div>

          <div v-else class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Clé de licence</th>
                  <th>Origine</th>
                  <th>Statut</th>
                  <th>Expiration</th>
                  <th>Installation liée</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in licenses" :key="l.id" :class="{ 'row-inactive': l.status !== 'active' }">
                  <td>
                    <strong style="color: #0f172a;">{{ l.companyName }}</strong>
                    <div class="text-sub" style="font-size: 0.7rem;">{{ l.contactEmail }}</div>
                  </td>
                  <td class="font-mono text-sub">{{ maskLicenseKey(l.licenseKey) }}</td>
                  <td>
                    <span class="credit-pill" :style="l.reference ? 'background: #ecfdf5; color: #059669; border-color: #a7f3d0;' : 'background: #f1f5f9; color: #475569; border-color: #e2e8f0;'">
                      {{ l.reference ? 'Achat en ligne' : 'Manuel' }}
                    </span>
                  </td>
                  <td>
                    <button
                      @click="toggleLicenseStatus(l)"
                      :class="l.status === 'active' ? 'status-active' : 'status-blocked'"
                    >
                      {{ l.status === 'active' ? 'Active' : 'Révoquée' }}
                    </button>
                  </td>
                  <td class="text-sub">{{ l.expiresAt ? formatDate(l.expiresAt) : 'Perpétuelle' }}</td>
                  <td class="text-sub">
                    <span v-if="l.installationId">Oui · {{ formatDate(l.lastVerifiedAt) }}</span>
                    <span v-else>Non activée</span>
                  </td>
                  <td style="text-align: right;">
                    <div class="actions-cell">
                      <button v-if="l.installationId" @click="resetLicenseActivation(l)" class="btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;">
                        Réinitialiser
                      </button>
                      <button @click="openEditLicenseModal(l)" class="btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;">
                        Modifier
                      </button>
                      <button @click="deleteLicense(l)" class="btn-delete" title="Supprimer cette licence">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 4: PRÊTS BANCAIRES POUR SIMULATION (CRUD) -->
      <div v-if="activeTab === 'bankLoans'" class="tab-pane animate-fade">
        <div class="section-card">
          <div class="user-toolbar">
            <div>
              <h3 style="margin: 0; font-size: 1.1rem; font-weight: 800; color: #0f172a;">Gestion des Offres de Prêts Bancaires</h3>
              <p class="subtext">Configurez les banques, taux d'intérêt (%), montants min/max et durées pour le simulateur de crédit.</p>
            </div>
            <button @click="openNewLoanModal" class="btn-primary-action">
              + Nouvelle Offre de Prêt
            </button>
          </div>

          <!-- Barre de Recherche et Filtres par Pays -->
          <div class="user-toolbar-secondary" style="display: flex; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;">
            <div class="search-box" style="flex: 1; min-width: 240px;">
              <input 
                v-model="loanSearch" 
                @input="loanPage = 1"
                type="text" 
                placeholder="Rechercher par banque, prêt ou pays..." 
                class="admin-input" 
              />
            </div>
            <div class="filter-box" style="width: 220px;">
              <select v-model="loanCountryFilter" @change="loanPage = 1" class="admin-input" style="height: 42px;">
                <option value="ALL">Tous les pays</option>
                <option value="CI">🇨🇮 Côte d'Ivoire (CI)</option>
                <option value="BJ">🇧🇯 Bénin (BJ)</option>
                <option value="TG">🇹🇬 Togo (TG)</option>
                <option value="ML">🇲🇱 Mali (ML)</option>
                <option value="BF">🇧🇫 Burkina Faso (BF)</option>
                <option value="SN">🇸🇳 Sénégal (SN)</option>
                <option value="CM">🇨🇲 Cameroun (CM)</option>
                <option value="GA">🇬🇦 Gabon (GA)</option>
              </select>
            </div>
          </div>

          <div v-if="bankLoansLoading" class="admin-loading">
            <div class="spinner"></div>
            <span>Chargement des offres bancaires...</span>
          </div>

          <div v-else-if="filteredBankLoans.length === 0" class="empty-state">
            <p>Aucune offre de prêt bancaire ne correspond à votre recherche.</p>
            <button v-if="bankLoans.length === 0" @click="openNewLoanModal" class="btn-primary-action" style="margin-top: 0.75rem;">
              + Créer la première offre de prêt
            </button>
          </div>

          <div v-else class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Pays</th>
                  <th>Banque</th>
                  <th>Nom de l'Offre</th>
                  <th>Taux d'Intérêt</th>
                  <th>Montant Min / Max (FCFA)</th>
                  <th>Durée Min / Max</th>
                  <th>Statut</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in paginatedBankLoans" :key="l.id" :class="{ 'row-inactive': !l.active }">
                  <td>
                    <div class="country-badge-box">
                      <img :src="getCountryFlagUrl(l.country)" :alt="l.country" class="country-flag-img-sm" />
                      <span>{{ getCountryBadge(l.country) }}</span>
                    </div>
                  </td>
                  <td>
                    <strong style="color: #0f172a;">{{ l.bankName }}</strong>
                  </td>
                  <td>
                    <span style="font-weight: 600; color: #1e1b4b;">{{ l.loanName }}</span>
                  </td>
                  <td>
                    <span class="credit-pill" style="background: #fef3c7; color: #92400e; border-color: #fde68a;">
                      {{ l.interestRate }} %
                    </span>
                  </td>
                  <td class="nowrap text-sub font-mono">
                    {{ (l.minAmount || 0).toLocaleString('fr-FR') }} - {{ (l.maxAmount || 0).toLocaleString('fr-FR') }} FCFA
                  </td>
                  <td class="nowrap text-sub">
                    {{ l.minDurationMonths }} à {{ l.maxDurationMonths }} mois
                  </td>
                  <td>
                    <button 
                      @click="toggleLoanActive(l)" 
                      :class="l.active ? 'status-active' : 'status-blocked'"
                    >
                      {{ l.active ? 'Actif' : 'Masqué' }}
                    </button>
                  </td>
                  <td style="text-align: right;">
                    <div class="actions-cell">
                      <button @click="openEditLoanModal(l)" class="btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;">
                        Modifier
                      </button>
                      <button @click="deleteLoan(l)" class="btn-delete" title="Supprimer cette offre">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Pagination Controls -->
            <div class="pagination-bar" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-top: 1px solid #e2e8f0; margin-top: 1rem;">
              <span style="font-size: 0.85rem; color: #64748b;">
                Affichage {{ (loanPage - 1) * loansPerPage + 1 }} à {{ Math.min(loanPage * loansPerPage, filteredBankLoans.length) }} sur {{ filteredBankLoans.length }} offres
              </span>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <button 
                  @click="loanPage = Math.max(1, loanPage - 1)" 
                  :disabled="loanPage === 1"
                  class="btn-secondary" 
                  style="padding: 0.4rem 0.8rem; font-size: 0.85rem;"
                >
                  &laquo; Précédent
                </button>
                <span style="font-weight: 700; font-size: 0.85rem; color: #0f172a; padding: 0 0.5rem;">
                  Page {{ loanPage }} / {{ totalLoanPages }}
                </span>
                <button 
                  @click="loanPage = Math.min(totalLoanPages, loanPage + 1)" 
                  :disabled="loanPage === totalLoanPages"
                  class="btn-secondary" 
                  style="padding: 0.4rem 0.8rem; font-size: 0.85rem;"
                >
                  Suivant &raquo;
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal de Création de Compte Client -->
    <div v-if="showCreateUserModal" class="modal-backdrop" @click.self="showCreateUserModal = false">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>Créer un Compte Client</h3>
          <button @click="showCreateUserModal = false" class="modal-close-btn">×</button>
        </div>
        <form @submit.prevent="handleCreateUser" class="modal-body">
          <div v-if="createUserError" class="login-error-alert mb-3">
            {{ createUserError }}
          </div>

          <div class="form-group">
            <label>Adresse Email Client</label>
            <input v-model="newUserEmail" type="email" required placeholder="client@entreprise.com" class="admin-input" />
          </div>

          <div class="form-group">
            <label>Mot de passe temporaire</label>
            <input v-model="newUserPassword" type="password" required placeholder="Mot de passe sécurisé" class="admin-input" />
          </div>

          <div class="modal-actions">
            <button type="button" @click="showCreateUserModal = false" class="btn-secondary">Annuler</button>
            <button type="submit" :disabled="createUserLoading" class="btn-primary-action">
              <span v-if="createUserLoading">Création en cours...</span>
              <span v-else>Créer le Compte</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal de Création/Édition de Formule d'Abonnement -->
    <div v-if="showPlanModal" class="modal-backdrop" @click.self="showPlanModal = false">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>{{ editingPlanId ? 'Modifier la Formule' : 'Créer une Nouvelle Formule' }}</h3>
          <button @click="showPlanModal = false" class="modal-close-btn">×</button>
        </div>
        <form @submit.prevent="handleSavePlan" class="modal-body">
          <div v-if="planFormError" class="login-error-alert mb-3">
            {{ planFormError }}
          </div>

          <div class="form-group">
            <label>Nom de la Formule (Ex: Starter, Pro)</label>
            <input v-model="planForm.name" type="text" required placeholder="Nom de la formule" class="admin-input" />
          </div>

          <div class="form-group">
            <label>Code interne (Ex: starter, pro, starter_annual)</label>
            <input v-model="planForm.code" type="text" required placeholder="Ex: starter" class="admin-input" />
          </div>

          <div class="form-group">
            <label>Palier (tier) — identifie la même offre entre mensuel et annuel</label>
            <input v-model="planForm.tier" type="text" placeholder="Ex: starter (laisser vide = même que le code)" class="admin-input" />
          </div>

          <div class="form-group">
            <label>Périodicité</label>
            <select v-model="planForm.billingCycle" class="admin-input">
              <option value="monthly">Mensuel</option>
              <option value="annual">Annuel</option>
            </select>
          </div>

          <div class="form-group">
            <label>Volume de Bulletins Inclus / mois</label>
            <input v-model="planForm.bulletinLimit" type="number" min="1" required placeholder="Ex: 10" class="admin-input" />
          </div>

          <div class="form-group">
            <label>Prix de Vente (en FCFA / mois)</label>
            <input v-model="planForm.price" type="number" min="0" required placeholder="Ex: 5000" class="admin-input" />
          </div>

          <div class="form-group" style="flex-direction: row; align-items: center; gap: 0.75rem;">
            <input v-model="planForm.popular" type="checkbox" id="popular-check" style="width: 18px; height: 18px; cursor: pointer;" />
            <label for="popular-check" style="cursor: pointer; text-transform: none; font-size: 0.9rem;">Mettre en avant ("Le plus populaire")</label>
          </div>

          <div class="form-group" style="flex-direction: row; align-items: center; gap: 0.75rem;">
            <input v-model="planForm.active" type="checkbox" id="active-check" style="width: 18px; height: 18px; cursor: pointer;" />
            <label for="active-check" style="cursor: pointer; text-transform: none; font-size: 0.9rem;">Rendre la formule visible aux clients</label>
          </div>

          <div class="modal-actions">
            <button type="button" @click="showPlanModal = false" class="btn-secondary">Annuler</button>
            <button type="submit" :disabled="planFormLoading" class="btn-primary-action">
              <span v-if="planFormLoading">Enregistrement...</span>
              <span v-else>{{ editingPlanId ? 'Enregistrer les modifications' : 'Créer la formule' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal de Création/Édition de Licence Entreprise -->
    <div v-if="showLicenseModal" class="modal-backdrop" @click.self="showLicenseModal = false">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>{{ editingLicenseId ? 'Modifier la Licence' : 'Créer une Nouvelle Licence' }}</h3>
          <button @click="showLicenseModal = false" class="modal-close-btn">×</button>
        </div>

        <div v-if="lastCreatedLicenseKey" style="padding: 0 1.5rem;">
          <div class="login-error-alert mb-3" style="background: #ecfdf5; border-color: #a7f3d0; color: #059669;">
            Licence créée ! Clé (à transmettre à l'entreprise, elle ne sera plus affichée en clair) :
            <strong style="display: block; margin-top: 0.4rem; font-family: monospace; font-size: 0.95rem;">{{ lastCreatedLicenseKey }}</strong>
          </div>
        </div>

        <form @submit.prevent="handleSaveLicense" class="modal-body">
          <div v-if="licenseFormError" class="login-error-alert mb-3">
            {{ licenseFormError }}
          </div>

          <div class="form-group">
            <label>Raison Sociale de l'Entreprise</label>
            <input v-model="licenseForm.companyName" type="text" required placeholder="Ex: Cabinet RH SARL" class="admin-input" />
          </div>

          <div class="form-group">
            <label>Email de contact</label>
            <input v-model="licenseForm.contactEmail" type="email" placeholder="contact@entreprise.com" class="admin-input" />
          </div>

          <div class="form-group">
            <label>Date d'expiration (laisser vide = licence perpétuelle)</label>
            <input v-model="licenseForm.expiresAt" type="date" class="admin-input" />
          </div>

          <div class="form-group">
            <label>Prix de Vente (en FCFA)</label>
            <input v-model="licenseForm.price" type="number" min="0" required placeholder="Ex: 500000" class="admin-input" />
          </div>

          <div class="form-group">
            <label>Notes (référence d'achat, etc.)</label>
            <input v-model="licenseForm.notes" type="text" placeholder="Optionnel" class="admin-input" />
          </div>

          <div class="modal-actions">
            <button type="button" @click="showLicenseModal = false" class="btn-secondary">Fermer</button>
            <button type="submit" :disabled="licenseFormLoading" class="btn-primary-action">
              <span v-if="licenseFormLoading">Enregistrement...</span>
              <span v-else>{{ editingLicenseId ? 'Enregistrer les modifications' : 'Créer la licence' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal de Création/Édition de Prêt Bancaire -->
    <div v-if="showLoanModal" class="modal-backdrop" @click.self="showLoanModal = false">
      <div class="modal-dialog" style="max-width: 580px;">
        <div class="modal-header">
          <h3>{{ editingLoanId ? 'Modifier l\'Offre de Prêt' : 'Créer une Nouvelle Offre de Prêt Bancaire' }}</h3>
          <button @click="showLoanModal = false" class="modal-close-btn">×</button>
        </div>
        <form @submit.prevent="handleSaveLoan" class="modal-body">
          <div v-if="loanFormError" class="login-error-alert mb-3">
            {{ loanFormError }}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label>Nom de la Banque</label>
              <input v-model="loanForm.bankName" type="text" required placeholder="Ex: BNI, SGCI, Ecobank" class="admin-input" />
            </div>

            <div class="form-group">
              <label>Pays de l'Offre</label>
              <select v-model="loanForm.country" class="admin-input" style="height: 42px;">
                <option value="CI">🇨🇮 Côte d'Ivoire (CI)</option>
                <option value="BJ">🇧🇯 Bénin (BJ)</option>
                <option value="TG">🇹🇬 Togo (TG)</option>
                <option value="ML">🇲🇱 Mali (ML)</option>
                <option value="BF">🇧🇫 Burkina Faso (BF)</option>
                <option value="SN">🇸🇳 Sénégal (SN)</option>
                <option value="CM">🇨🇲 Cameroun (CM)</option>
                <option value="GA">🇬🇦 Gabon (GA)</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Nom du Prêt / Intitulé Commercial</label>
            <input v-model="loanForm.loanName" type="text" required placeholder="Ex: Prêt Personnel Conso, Prêt Oxygène" class="admin-input" />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label>Taux d'Intérêt Annuel (%)</label>
              <input v-model="loanForm.interestRate" type="number" step="0.05" min="0" required placeholder="Ex: 8.5" class="admin-input" />
            </div>

            <div class="form-group">
              <label>Montant Minimum (FCFA)</label>
              <input v-model="loanForm.minAmount" type="number" min="0" required placeholder="Ex: 500000" class="admin-input" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label>Montant Maximum (FCFA)</label>
              <input v-model="loanForm.maxAmount" type="number" min="0" required placeholder="Ex: 30000000" class="admin-input" />
            </div>

            <div class="form-group">
              <label>Durée Minimum (Mois)</label>
              <input v-model="loanForm.minDurationMonths" type="number" min="1" required placeholder="Ex: 6" class="admin-input" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label>Durée Maximum (Mois)</label>
              <input v-model="loanForm.maxDurationMonths" type="number" min="1" required placeholder="Ex: 72" class="admin-input" />
            </div>

            <div class="form-group" style="flex-direction: row; align-items: center; gap: 0.75rem; margin-top: 1.5rem;">
              <input v-model="loanForm.active" type="checkbox" id="loan-active-check" style="width: 18px; height: 18px; cursor: pointer;" />
              <label for="loan-active-check" style="cursor: pointer; text-transform: none; font-size: 0.9rem;">Activer dans le simulateur</label>
            </div>
          </div>

          <div class="form-group">
            <label>Description / Avantages (Optionnel)</label>
            <textarea v-model="loanForm.description" placeholder="Courte description de l'offre..." class="admin-input" style="height: 65px; resize: vertical;"></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" @click="showLoanModal = false" class="btn-secondary">Annuler</button>
            <button type="submit" :disabled="loanFormLoading" class="btn-primary-action">
              <span v-if="loanFormLoading">Enregistrement...</span>
              <span v-else>{{ editingLoanId ? 'Enregistrer les modifications' : 'Créer l\'offre de prêt' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>

  </div>
</template>

<style scoped>
.admin-container {
  max-width: 1100px;
  margin: 2rem auto;
  padding: 0 1.25rem 3rem 1.25rem;
  font-family: 'Inter', system-ui, sans-serif;
  color: #0f172a;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.75rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.admin-title-area h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.admin-subtitle {
  margin: 0.25rem 0 0 0;
  font-size: 0.875rem;
  color: #64748b;
}

.refresh-btn {
  background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
  color: #ffffff;
  border: none;
  padding: 0.65rem 1.2rem;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.refresh-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
}

/* ══════════════════════════════════════════════════════════════
   NAVIGATION TABS (PILL STYLE MODERN)
   ══════════════════════════════════════════════════════════════ */
.admin-tabs {
  display: flex;
  gap: 0.5rem;
  background: #f1f5f9;
  padding: 0.35rem;
  border-radius: 12px;
  margin-bottom: 1.75rem;
  border: 1px solid #e2e8f0;
  overflow-x: auto;
}

.tab-btn {
  background: transparent;
  border: none;
  padding: 0.65rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.tab-btn:hover {
  color: #1e1b4b;
  background: rgba(255, 255, 255, 0.6);
}

.tab-btn.active {
  background: #ffffff;
  color: #4f46e5;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}

.user-count-badge {
  background: #e0e7ff;
  color: #3730a3;
  font-size: 0.75rem;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  font-weight: 800;
}

.tab-btn.active .user-count-badge {
  background: #4f46e5;
  color: #ffffff;
}

.admin-loading {
  padding: 3.5rem;
  text-align: center;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  font-weight: 500;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.admin-error {
  padding: 1.5rem;
  background: #fef2f2;
  border-left: 4px solid #ef4444;
  color: #991b1b;
  border-radius: 0.5rem;
  font-weight: 600;
}

/* ══════════════════════════════════════════════════════════════
   KPI CARDS STYLES
   ══════════════════════════════════════════════════════════════ */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
  margin-bottom: 1.75rem;
}

.kpi-card {
  background: #ffffff;
  border-radius: 14px;
  padding: 1.35rem 1.5rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.04);
  display: flex;
  align-items: center;
  gap: 1.25rem;
  transition: all 0.2s ease;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -4px rgba(15, 23, 42, 0.08);
  border-color: #cbd5e1;
}

.kpi-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-users { background: #e0e7ff; color: #4338ca; }
.icon-hits { background: #fef3c7; color: #b45309; }
.icon-accounts { background: #dcfce7; color: #15803d; }

.kpi-value {
  font-size: 1.95rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.kpi-label {
  font-size: 0.825rem;
  color: #64748b;
  font-weight: 600;
  margin-top: 0.2rem;
}

/* ══════════════════════════════════════════════════════════════
   SECTION CARD & TABLES
   ══════════════════════════════════════════════════════════════ */
.section-card {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  padding: 1.75rem;
  box-shadow: 0 4px 16px -2px rgba(15, 23, 42, 0.04);
  margin-bottom: 1.75rem;
}

.section-header {
  margin-bottom: 1.25rem;
}

.section-header h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #0f172a;
}

.subtext {
  font-size: 0.825rem;
  color: #64748b;
  margin-top: 0.25rem;
}

.country-list {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.country-row {
  display: grid;
  grid-template-columns: 180px 1fr 140px;
  align-items: center;
  gap: 1rem;
}

.country-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-weight: 700;
  font-size: 0.9rem;
  color: #0f172a;
}

.country-flag-img {
  width: 24px;
  height: 16px;
  object-fit: cover;
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.country-flag-img-sm {
  width: 18px;
  height: 12px;
  object-fit: cover;
  border-radius: 2px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

.country-badge-box {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 0.25rem 0.6rem;
  border-radius: 8px;
  font-size: 0.775rem;
  font-weight: 700;
  color: #334155;
}

.country-code-pill {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  letter-spacing: 0.05em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.progress-bar-box {
  background: #f1f5f9;
  height: 10px;
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  background: linear-gradient(90deg, #4f46e5, #6366f1);
  height: 100%;
  border-radius: 9999px;
  transition: width 0.4s ease;
}

.country-count {
  font-size: 0.875rem;
  text-align: right;
  color: #334155;
  font-weight: 600;
}

.pct {
  color: #64748b;
  font-size: 0.775rem;
  margin-left: 0.25rem;
  font-weight: 500;
}

.table-wrapper {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  text-align: left;
  font-size: 0.875rem;
}

th {
  background: #f8fafc;
  padding: 0.875rem 1rem;
  font-weight: 700;
  font-size: 0.775rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #475569;
  border-bottom: 2px solid #e2e8f0;
}

td {
  padding: 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
  transition: background 0.15s ease;
}

tr:hover td {
  background: #f8fafc;
}

tr:last-child td {
  border-bottom: none;
}

.nowrap { white-space: nowrap; }
.font-mono { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.825rem; }
.text-sub { color: #64748b; }

.country-badge {
  background: #f1f5f9;
  padding: 0.2rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.775rem;
  font-weight: 600;
}

.page-badge {
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  font-size: 0.725rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.badge-home { background: #e0f2fe; color: #0369a1; }
.badge-tax { background: #fef3c7; color: #92400e; }
.badge-hr { background: #f3e8ff; color: #6b21a8; }

.user-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 0.5rem 0.875rem;
  transition: all 0.2s;
}

.search-box:focus-within {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
}

.search-input {
  border: none;
  background: none;
  outline: none;
  width: 100%;
  font-size: 0.9rem;
}

.btn-secondary {
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.btn-secondary:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
  color: #0f172a;
  transform: translateY(-1px);
}

.user-email-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 600;
}

.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
  color: #3730a3;
  font-size: 0.8rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.role-badge-admin {
  background: #fee2e2;
  color: #991b1b;
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  border: 1px solid #fca5a5;
}

.role-badge-user {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
}

.credits-adjuster {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.credits-amount {
  background: #fef9c3;
  color: #854d0e;
  border: 1px solid #fde047;
  font-weight: 800;
  padding: 0.25rem 0.65rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}

.credits-amount:hover {
  background: #fef08a;
  transform: scale(1.03);
}

.btn-credit-min {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-credit-min:hover {
  background: #ef4444;
  color: #ffffff;
}

.btn-credit-plus {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #86efac;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-credit-plus:hover {
  background: #22c55e;
  color: #ffffff;
}

.btn-credit-plus-big {
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #93c5fd;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-credit-plus-big:hover {
  background: #3b82f6;
  color: #ffffff;
}

/* ══════════════════════════════════════════════════════════════
   STATUS TOGGLE PILLS (ACTIF / MASQUÉ / BLOQUÉ)
   ══════════════════════════════════════════════════════════════ */
.status-active {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
  padding: 0.35rem 0.8rem;
  border-radius: 9999px;
  font-size: 0.775rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 3px rgba(16, 185, 129, 0.12);
}

.status-active::before {
  content: '';
  width: 7px;
  height: 7px;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 8px #10b981;
}

.status-active:hover {
  background: #d1fae5;
  border-color: #6ee7b7;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(16, 185, 129, 0.2);
}

.status-blocked {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: #fff1f2;
  color: #be123c;
  border: 1px solid #fecdd3;
  padding: 0.35rem 0.8rem;
  border-radius: 9999px;
  font-size: 0.775rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 3px rgba(244, 63, 94, 0.12);
}

.status-blocked::before {
  content: '';
  width: 7px;
  height: 7px;
  background: #f43f5e;
  border-radius: 50%;
}

.status-blocked:hover {
  background: #ffe4e6;
  border-color: #fda4af;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(244, 63, 94, 0.2);
}

.row-blocked {
  background: #fef2f2;
}

.actions-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn-block {
  background: #fff1f2;
  color: #be123c;
  border: 1px solid #fecdd3;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  font-size: 0.775rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-block:hover {
  background: #e11d48;
  color: #ffffff;
  border-color: #e11d48;
  box-shadow: 0 2px 8px rgba(225, 29, 72, 0.25);
}

.btn-unblock {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  font-size: 0.775rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-unblock:hover {
  background: #10b981;
  color: #ffffff;
  border-color: #10b981;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
}

.btn-delete {
  background: #f8fafc;
  color: #94a3b8;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  padding: 0.35rem 0.55rem;
  border-radius: 8px;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-delete:hover {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fca5a5;
}

.empty-state {
  text-align: center;
  padding: 3rem 2rem;
  color: #94a3b8;
  font-size: 0.925rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.animate-fade {
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ══════════════════════════════════════════════════════════════
   PORTAIL ADMIN LOGIN STYLES
   ══════════════════════════════════════════════════════════════ */
.admin-login-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  padding: 2rem 1rem;
}

.admin-login-card {
  background: #ffffff;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.15);
  max-width: 440px;
  width: 100%;
  padding: 2.5rem;
}

.admin-login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.admin-shield-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.admin-login-header h2 {
  font-size: 1.4rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.5rem 0;
}

.admin-login-header p {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0;
}

.admin-login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-group label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.admin-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  font-size: 0.925rem;
  transition: all 0.2s;
  outline: none;
  background: #ffffff;
}

.admin-input:focus {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}

.admin-submit-btn {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
  color: #ffffff;
  border: none;
  padding: 0.85rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 0.5rem;
  box-shadow: 0 4px 14px rgba(30, 27, 75, 0.3);
}

.admin-submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(30, 27, 75, 0.4);
}

.admin-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-error-alert {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
}

.admin-login-footer {
  margin-top: 2rem;
  padding-top: 1.25rem;
  border-top: 1px border-dashed #e2e8f0;
  text-align: center;
  font-size: 0.75rem;
  color: #94a3b8;
}

.admin-login-footer code {
  background: #f1f5f9;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  color: #334155;
  font-weight: 600;
}

.admin-logout-btn {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
  padding: 0.5rem 0.95rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.admin-logout-btn:hover {
  background: #dc2626;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.25);
}

/* ══════════════════════════════════════════════════════════════
   MODAL & TOOLBAR CREATION STYLES
   ══════════════════════════════════════════════════════════════ */
.btn-primary-action {
  background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
  color: #ffffff;
  border: none;
  padding: 0.65rem 1.25rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary-action:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.45);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(6px);
  z-index: 10050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal-dialog {
  background: #ffffff;
  border-radius: 20px;
  max-width: 520px;
  width: 100%;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f172a;
}

.modal-close-btn {
  background: #f1f5f9;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 1.2rem;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.15s;
}

.modal-close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  overflow-y: auto;
  flex: 1;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.credit-pill {
  background: #e0e7ff;
  color: #3730a3;
  font-weight: 800;
  font-size: 0.8rem;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  border: 1px solid #c7d2fe;
}

.badge-popular-on {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
  font-weight: 800;
  font-size: 0.75rem;
  padding: 0.3rem 0.7rem;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(245, 158, 11, 0.15);
}

.badge-popular-on:hover {
  background: #fef3c7;
  transform: translateY(-1px);
}

.badge-popular-off {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #f8fafc;
  color: #64748b;
  border: 1px solid #cbd5e1;
  font-weight: 600;
  font-size: 0.75rem;
  padding: 0.3rem 0.7rem;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.2s;
}

.badge-popular-off:hover {
  background: #f1f5f9;
  color: #334155;
}

.row-inactive {
  opacity: 0.6;
  background: #f8fafc;
}
</style>
