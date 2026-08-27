<template>
  <div v-if="show" class="profile-modal-backdrop" @click.self="emit('close')">
    <div class="profile-modal-card animate-slide-up">
      <!-- Header -->
      <div class="profile-modal-header">
        <div class="header-user-info">
          <div class="avatar-box">
            {{ getInitials(user?.name || user?.companyName || user?.email) }}
          </div>
          <div>
            <h3 class="user-display-name">{{ user?.name || user?.companyName || 'Mon Profil Client' }}</h3>
            <p class="user-email-subtitle">{{ user?.email }}</p>
          </div>
        </div>
        <button @click="emit('close')" class="close-btn" title="Fermer">×</button>
      </div>

      <!-- Body -->
      <form @submit.prevent="handleSave" class="profile-modal-body">
        <div v-if="successMsg" class="alert-box alert-success">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          {{ successMsg }}
        </div>
        <div v-if="errorMsg" class="alert-box alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {{ errorMsg }}
        </div>

        <div class="form-group">
          <label>Type de Compte & Usage</label>
          <div class="account-type-grid">
            <label 
              class="type-card" 
              :class="{ 'type-card-selected': form.accountType === 'individual' }"
              @click="form.accountType = 'individual'"
            >
              <div class="type-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div>
                <strong class="type-title">Compte Libéral / Indépendant</strong>
                <p class="type-sub">Pour consultants, fiscalistes, experts-comptables individuels</p>
              </div>
            </label>

            <label 
              class="type-card" 
              :class="{ 'type-card-selected': form.accountType === 'company' }"
              @click="form.accountType = 'company'"
            >
              <div class="type-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              </div>
              <div>
                <strong class="type-title">Société / Cabinet RH</strong>
                <p class="type-sub">Pour PME, grands groupes, direction RH & cabinets d'audit</p>
              </div>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="profile-name">Nom & Prénom (Déclarant)</label>
          <input 
            id="profile-name"
            v-model="form.name" 
            type="text" 
            placeholder="Ex: Narcisse Kouadio" 
            class="profile-input" 
          />
        </div>

        <div class="form-group">
          <label for="profile-company">Raison Sociale / Nom de l'Entreprise ou Cabinet</label>
          <input 
            id="profile-company"
            v-model="form.companyName" 
            type="text" 
            placeholder="Ex: Cabinet Audit & RH Côte d'Ivoire" 
            class="profile-input" 
          />
        </div>

        <div class="form-group">
          <label for="profile-phone">Numéro de Téléphone (WhatsApp)</label>
          <input 
            id="profile-phone"
            v-model="form.phone" 
            type="tel" 
            placeholder="Ex: +225 07 00 00 00 00" 
            class="profile-input" 
          />
        </div>

        <!-- Badges & Abonnement -->
        <div class="credits-info-banner">
          <div class="credits-badge">
            <span class="bolt">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </span>
            <span v-if="user?.subscriptionTier">
              <strong>{{ user.subscriptionIsTrial ? 'Essai gratuit' : user.subscriptionTier === 'pro' ? 'Pro' : user.subscriptionTier === 'starter' ? 'Starter' : user.subscriptionTier }}</strong> — {{ user.bulletinsUsed || 0 }} bulletins utilisés · expire le {{ formatDate(user.subscriptionExpiresAt) }}
            </span>
            <span v-else>Aucun abonnement actif. <strong>{{ user?.credits || 0 }} crédits gratuits restants.</strong></span>
          </div>
          <button type="button" @click="emit('open-billing')" class="recharge-btn">
            Gérer mon abonnement
          </button>
        </div>

        <!-- Mes Factures -->
        <div class="form-group">
          <label>Mes Factures</label>
          <div v-if="invoicesLoading" style="font-size: 0.85rem; color: #64748b;">Chargement...</div>
          <div v-else-if="invoices.length === 0" style="font-size: 0.85rem; color: #64748b;">Aucune facture pour le moment.</div>
          <div v-else class="invoices-list">
            <div v-for="inv in invoices" :key="inv.id" class="invoice-row">
              <div>
                <strong style="font-size: 0.85rem; color: #0f172a;">{{ inv.invoiceNumber }}</strong>
                <div style="font-size: 0.75rem; color: #64748b;">
                  {{ formatDate(inv.createdAt) }} · {{ inv.subscriptionTier === 'pro' ? 'Pro' : 'Starter' }} · {{ formatAmount(inv.amount) }} FCFA
                </div>
              </div>
              <button type="button" @click="downloadInvoice(inv)" class="invoice-download-btn" :disabled="downloadingId === inv.id">
                {{ downloadingId === inv.id ? '...' : 'Télécharger' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Modal Actions -->
        <div class="profile-modal-actions">
          <button type="button" @click="handleLogout" class="btn-logout-client">
            Se déconnecter
          </button>
          <button type="submit" :disabled="loading" class="btn-save-profile">
            <span v-if="loading">Enregistrement...</span>
            <span v-else>Enregistrer mon profil</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { user, token, updateProfile, logout } from '../services/auth'

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['close', 'open-billing', 'logout'])

const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : ''
const formatAmount = (v) => Math.round(v || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const invoices = ref([])
const invoicesLoading = ref(false)
const downloadingId = ref(null)

const fetchInvoices = async () => {
  if (!token.value) return
  try {
    invoicesLoading.value = true
    const res = await fetch('/api/billing/invoices', {
      headers: { 'Authorization': `Bearer ${token.value}` }
    })
    if (res.ok) {
      const data = await res.json()
      invoices.value = data.invoices || []
    }
  } catch (e) {
    console.error('Erreur chargement des factures:', e)
  } finally {
    invoicesLoading.value = false
  }
}

const downloadInvoice = async (inv) => {
  try {
    downloadingId.value = inv.id
    const res = await fetch(`/api/billing/invoices/${inv.id}/download`, {
      headers: { 'Authorization': `Bearer ${token.value}` }
    })
    if (!res.ok) throw new Error('Téléchargement impossible')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeInvoiceNumber = inv.invoiceNumber || `ONDA-Facture-${inv.id}`;
    a.download = `${safeInvoiceNumber}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error(e)
  } finally {
    downloadingId.value = null
  }
}

const form = ref({
  name: '',
  companyName: '',
  phone: '',
  accountType: 'individual'
})

const syncForm = () => {
  if (user.value) {
    form.value.name = user.value.name || ''
    form.value.companyName = user.value.companyName || ''
    form.value.phone = user.value.phone || ''
    form.value.accountType = user.value.accountType || 'individual'
  }
}

onMounted(() => {
  syncForm()
})

watch(() => props.show, (newVal) => {
  if (newVal) {
    syncForm()
    errorMsg.value = ''
    successMsg.value = ''
    fetchInvoices()
  }
})

const getInitials = (str) => {
  if (!str) return 'U'
  const parts = str.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return str.substring(0, 2).toUpperCase()
}

const handleSave = async () => {
  try {
    loading.value = true
    errorMsg.value = ''
    successMsg.value = ''
    
    const msg = await updateProfile({
      name: form.value.name,
      companyName: form.value.companyName,
      phone: form.value.phone,
      accountType: form.value.accountType
    })
    
    successMsg.value = msg || 'Profil mis à jour avec succès !'
    setTimeout(() => {
      emit('close')
    }, 1500)
  } catch (e) {
    errorMsg.value = e.message
  } finally {
    loading.value = false
  }
}

const handleLogout = () => {
  logout()
  emit('close')
  emit('logout')
}
</script>

<style scoped>
.profile-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.3);
  backdrop-filter: blur(4px);
  z-index: 99990;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.profile-modal-card {
  background: #ffffff;
  border-radius: 20px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.profile-modal-header {
  padding: 1.5rem;
  background: #f8fafc;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
}

.header-user-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.avatar-box {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
  color: #ffffff;
  font-weight: 800;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
}

.user-display-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f172a;
}

.user-email-subtitle {
  margin: 0.2rem 0 0 0;
  font-size: 0.8rem;
  color: #64748b;
}

.close-btn {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 1rem;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.profile-modal-body {
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  overflow-y: auto;
}

.alert-box {
  padding: 0.75rem 1rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.alert-success {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #059669;
}

.alert-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  text-align: left;
}

.form-group label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.account-type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.type-card {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 12px;
  padding: 0.875rem;
  cursor: pointer;
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  transition: all 0.2s ease;
  color: #0f172a;
}

.type-card:hover {
  border-color: #6366f1;
  background: #f8fafc;
}

.type-card-selected {
  border-color: #6366f1 !important;
  background: #eef2ff !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
}

.type-icon {
  font-size: 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
}

.type-card-selected .type-icon {
  color: #4f46e5;
}

.type-title {
  display: block;
  font-size: 0.85rem;
  color: #0f172a;
  line-height: 1.2;
}

.type-sub {
  margin: 0.25rem 0 0 0;
  font-size: 0.725rem;
  color: #64748b;
  line-height: 1.25;
}

.profile-input {
  width: 100%;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  font-size: 1rem;
  font-weight: 500;
  outline: none;
  transition: all 0.2s;
  color: #0f172a;
}

.profile-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.credits-info-banner {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.875rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.credits-badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  color: #0f172a;
  font-weight: 600;
}

.bolt {
  color: #f59e0b;
  display: flex;
  align-items: center;
  justify-content: center;
}

.recharge-btn {
  background: #fffbeb;
  color: #d97706;
  border: 1px solid #fde68a;
  padding: 0.4rem 0.85rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.recharge-btn:hover {
  background: #fef3c7;
}

.invoices-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 180px;
  overflow-y: auto;
}

.invoice-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
}

.invoice-download-btn {
  background: #eef2ff;
  color: #4f46e5;
  border: 1px solid #c7d2fe;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.invoice-download-btn:hover:not(:disabled) {
  background: #e0e7ff;
}

.invoice-download-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.profile-modal-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
  gap: 1rem;
}

.btn-logout-client {
  background: #ffffff;
  color: #64748b;
  border: 1px solid #e2e8f0;
  padding: 0.65rem 1rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-logout-client:hover {
  background: #fef2f2;
  color: #dc2626;
  border-color: #fca5a5;
}

.btn-save-profile {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #ffffff;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
  transition: all 0.2s;
}

.btn-save-profile:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
}

.animate-slide-up {
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 640px) {
  .profile-modal-backdrop {
    padding: 0.5rem !important;
  }
  
  .profile-modal-card {
    border-radius: 12px !important;
    max-height: 95vh !important;
  }
  
  .profile-modal-body {
    padding: 1.25rem 0.75rem !important;
    gap: 1rem !important;
  }
  
  .account-type-grid {
    grid-template-columns: 1fr !important;
    gap: 0.75rem !important;
  }
  
  .type-card {
    padding: 0.75rem !important;
  }
  
  .profile-input {
    padding: 0.75rem 0.85rem !important;
    font-size: 0.9rem !important;
  }
  
  .credits-info-banner {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 10px !important;
    padding: 0.75rem !important;
    text-align: center;
  }
  
  .credits-badge {
    justify-content: center !important;
  }
  
  .recharge-btn {
    width: 100% !important;
    padding: 8px !important;
  }
  
  .profile-modal-actions {
    flex-direction: column-reverse !important;
    align-items: stretch !important;
    gap: 10px !important;
  }
  
  .btn-logout-client, .btn-save-profile {
    width: 100% !important;
    justify-content: center !important;
    display: flex !important;
    align-items: center !important;
  }
}
</style>
