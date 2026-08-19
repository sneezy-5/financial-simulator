<template>
  <div v-if="show" class="billing-modal-overlay" @click.self="$emit('close')">
    <div class="billing-modal-card">
      <!-- Header -->
      <div class="billing-modal-header">
        <div class="billing-header-title">
          <div class="billing-icon-badge">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          </div>
          <h2>Mon abonnement ONDA RH</h2>
        </div>
        <button @click="$emit('close')" class="billing-close-btn" title="Fermer">✕</button>
      </div>

      <!-- Body -->
      <div class="billing-modal-body">
        <div class="balance-banner">
          <div>
            <h3 class="balance-title">Abonnement actuel</h3>
            <p class="balance-val">{{ currentTierLabel }}</p>
          </div>
          <div class="balance-info">
            <p v-if="user?.subscriptionTier">{{ user.bulletinsUsed || 0 }}/{{ currentLimit }} bulletins utilisés</p>
            <p v-if="user?.subscriptionExpiresAt">Expire le {{ formatDate(user.subscriptionExpiresAt) }}</p>
            <p v-if="!user?.subscriptionTier">Choisissez une formule pour générer des bulletins.</p>
          </div>
        </div>

        <div v-if="successMsg" class="billing-alert alert-success">
          <svg class="alert-icon-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span>{{ successMsg }}</span>
        </div>
        <div v-if="errorMsg" class="billing-alert alert-error">
          <svg class="alert-icon-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>{{ errorMsg }}</span>
        </div>

        <h3 class="packs-section-title">Choisissez une formule d'abonnement</h3>

        <div class="cycle-toggle">
          <button
            type="button"
            class="cycle-toggle-btn"
            :class="{ 'cycle-toggle-btn-active': selectedCycle === 'monthly' }"
            @click="selectedCycle = 'monthly'"
          >Mensuel</button>
          <button
            type="button"
            class="cycle-toggle-btn"
            :class="{ 'cycle-toggle-btn-active': selectedCycle === 'annual' }"
            @click="selectedCycle = 'annual'"
          >Annuel <span class="cycle-toggle-badge">2 mois offerts</span></button>
        </div>

        <div v-if="plansLoading" style="text-align: center; padding: 2rem; color: #64748b;">
          Chargement des formules...
        </div>

        <div v-else class="packs-grid">
          <div
            v-for="p in displayedPlans"
            :key="p.id"
            class="pack-card"
            :class="{'pack-card-active': selectedPlanId === p.id, 'pack-popular': p.popular}"
            @click="selectedPlanId = p.id"
          >
            <div v-if="p.popular" class="popular-ribbon">LE PLUS POPULAIRE</div>
            <div class="pack-content">
              <span class="pack-badge" :class="p.popular ? 'badge-pro' : 'badge-starter'">{{ p.tier ? p.tier.toUpperCase() : p.name.toUpperCase() }}</span>
              <h4 class="pack-credits">jusqu'à {{ p.bulletinLimit }} <span class="unit">bulletins/mois</span></h4>
            </div>
            <div class="pack-price">
              {{ p.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") }} FCFA{{ p.billingCycle === 'annual' ? '/an' : '/mois' }}
            </div>
          </div>
        </div>

        <div class="checkout-area">
          <button @click="handlePurchase" :disabled="loading || !selectedPlanId" class="checkout-btn">
            <span v-if="loading" class="spinner"></span>
            <span v-else>Activer {{ selectedPlan?.name || '' }} — {{ formattedSelectedPrice }} FCFA{{ selectedPlan?.billingCycle === 'annual' ? '/an' : '/mois' }}</span>
          </button>
          <p class="checkout-note">
            <svg style="width: 14px; height: 14px; display: inline-block; vertical-align: text-bottom; margin-right: 4px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Paiement sécurisé · Mobile Money, Wave, Carte bancaire (FCFA)
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { user, verifyPaystackPayment } from '../services/auth'

const props = defineProps({
  show: Boolean
})
const emit = defineEmits(['close'])

const plans = ref([])
const selectedCycle = ref('monthly')
const selectedPlanId = ref(null)
const loading = ref(false)
const plansLoading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

// Une ligne tarifaire (code) n'identifie plus une formule de façon unique : mensuel et annuel
// partagent le même palier ('starter'/'pro'/...) sous 2 codes différents, donc la sélection se
// fait par id de ligne tarifaire.
const displayedPlans = computed(() => plans.value.filter(p => p.billingCycle === selectedCycle.value))
const selectedPlan = computed(() => plans.value.find(p => p.id === selectedPlanId.value) || null)
const formattedSelectedPrice = computed(() => selectedPlan.value ? selectedPlan.value.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") : '')

const currentPlan = computed(() => plans.value.find(p => p.code === user.value?.subscriptionTier) || null)
const currentTierLabel = computed(() => {
  if (!user.value?.subscriptionTier) return "Aucun abonnement actif"
  const label = currentPlan.value?.name || user.value.subscriptionTier
  return user.value.subscriptionIsTrial ? `Essai gratuit — ${label}` : label
})
const currentLimit = computed(() => currentPlan.value ? currentPlan.value.bulletinLimit : 0)

const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR')

// Sélectionne une formule dans le cycle donné, en essayant de garder le même palier que la
// sélection précédente (ex: on reste sur "Pro" en passant de mensuel à annuel)
const pickPlanForCycle = (cycle) => {
  const pool = plans.value.filter(p => p.billingCycle === cycle)
  if (pool.length === 0) return
  const previousTier = selectedPlan.value?.tier
  const sameTier = previousTier && pool.find(p => p.tier === previousTier)
  const popular = pool.find(p => p.popular)
  selectedPlanId.value = (sameTier || popular || pool[0]).id
}

watch(selectedCycle, (cycle) => pickPlanForCycle(cycle))

const fetchPlans = async () => {
  try {
    plansLoading.value = true
    const res = await fetch('/api/billing/plans')
    if (res.ok) {
      const data = await res.json()
      plans.value = data.plans || []
      if (plans.value.length > 0 && !selectedPlanId.value) {
        pickPlanForCycle(selectedCycle.value)
      }
    }
  } catch (e) {
    console.error("Erreur chargement des formules d'abonnement:", e)
  } finally {
    plansLoading.value = false
  }
}

onMounted(() => {
  fetchPlans()
})

watch(() => props.show, (newVal) => {
  if (newVal) fetchPlans()
})

// Charge le script Paystack dynamiquement si absent
const ensurePaystackLoaded = () => {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) return resolve();
    const existing = document.querySelector('script[src*="paystack"]');
    if (existing) {
      // Script déjà dans le DOM mais peut-être pas encore chargé
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', () => reject(new Error('Échec du chargement du script Paystack')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Échec du chargement du script Paystack'));
    document.head.appendChild(script);
  });
};

const handlePurchase = async () => {
  if (!selectedPlanId.value || !user.value) return;

  const planObj = plans.value.find(p => p.id === selectedPlanId.value);
  if (!planObj) return;

  loading.value = true;
  errorMsg.value = '';
  successMsg.value = '';

  try {
    const amountToCharge = planObj.price;
    const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

    if (!publicKey) {
      throw new Error('Clé publique Paystack non configurée.');
    }

    // S'assurer que le SDK Paystack est bien chargé
    await ensurePaystackLoaded();

    if (!window.PaystackPop) {
      throw new Error('Le SDK Paystack n\'a pas pu être initialisé. Vérifiez votre connexion.');
    }

    const handler = window.PaystackPop.setup({
      key: publicKey,
      email: user.value.email,
      amount: amountToCharge,
      currency: 'XOF',
      ref: 'onda_' + Math.floor((Math.random() * 1000000000) + 1),
      metadata: {
        userId: user.value.id,
        planCode: planObj.code,
        custom_fields: [
          { display_name: 'Utilisateur', variable_name: 'user_id', value: user.value.id },
          { display_name: 'Formule', variable_name: 'plan_code', value: planObj.code }
        ]
      },
      callback: function(response) {
        // Paystack exige une fonction synchrone – on appelle l'async en interne
        ;(async () => {
          try {
            const msg = await verifyPaystackPayment(response.reference, planObj.code);
            successMsg.value = msg;
            setTimeout(() => emit('close'), 2000);
          } catch (err) {
            errorMsg.value = err.message;
          } finally {
            loading.value = false;
          }
        })();
      },
      onClose: function() {
        errorMsg.value = 'Transaction annulée.';
        loading.value = false;
      }
    });

    handler.openIframe();

  } catch (err) {
    console.error('Erreur handlePurchase:', err);
    errorMsg.value = err.message || 'Une erreur est survenue. Veuillez réessayer.';
    loading.value = false;
  }
}
</script>

<style scoped>
.billing-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  animation: fadeIn 0.2s ease-out;
}

.billing-modal-card {
  background: #ffffff;
  border-radius: 1.25rem;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
  width: 100%;
  max-width: 600px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  color: #0f172a;
}

.billing-modal-header {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #0f172a;
}

.billing-header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.billing-icon-badge {
  width: 38px;
  height: 38px;
  border-radius: 0.625rem;
  background: #fffbeb;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f59e0b;
  border: 1px solid #fde68a;
}

.billing-modal-header h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}

.billing-close-btn {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  color: #64748b;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  transition: all 0.2s;
}

.billing-close-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.billing-modal-body {
  padding: 1.5rem 1.25rem;
}

.balance-banner {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.875rem;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
}

.balance-title {
  margin: 0 0 0.25rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #3b82f6;
}

.balance-val {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: #1d4ed8;
  line-height: 1;
}

.balance-unit {
  font-size: 0.875rem;
  font-weight: 500;
  color: #3b82f6;
}

.balance-info {
  text-align: right;
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.4;

  @media (max-width: 640px) {
    text-align: left;
  }
}

.billing-alert {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  margin-bottom: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.alert-success {
  background: #ecfdf5;
  border-left: 4px solid #10b981;
  color: #059669;
}

.alert-error {
  background: #fef2f2;
  border-left: 4px solid #ef4444;
  color: #dc2626;
}

.packs-section-title {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.cycle-toggle {
  display: inline-flex;
  background: #f1f5f9;
  border-radius: 9999px;
  padding: 0.25rem;
  margin-bottom: 1.25rem;
  gap: 0.25rem;
}

.cycle-toggle-btn {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 0.825rem;
  font-weight: 700;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.cycle-toggle-btn-active {
  background: #ffffff;
  color: #4f46e5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.cycle-toggle-badge {
  background: #dcfce7;
  color: #16a34a;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
}

.packs-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
}

.pack-card {
  border: 1px solid #e2e8f0;
  border-radius: 0.875rem;
  padding: 1.25rem 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  background: #ffffff;
  color: #0f172a;

  &:hover {
    border-color: #6366f1;
    transform: translateY(-2px);
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.05);
  }
}

.pack-card-active {
  border-color: #6366f1 !important;
  background: #eef2ff !important;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2) !important;
}

.pack-popular {
  border-color: #a5b4fc;
}

.popular-ribbon {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: #6366f1;
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 0.25rem 0.6rem;
  border-radius: 9999px;
  letter-spacing: 0.05em;
  white-space: nowrap;
  border: 1px solid #818cf8;
}

.pack-badge {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
  margin-bottom: 0.5rem;
  border: 1px solid transparent;
}

.badge-starter {
  background: #f1f5f9;
  color: #475569;
  border-color: #e2e8f0;
}

.badge-pro {
  background: #eef2ff;
  color: #4f46e5;
  border-color: #c7d2fe;
}

.badge-enterprise {
  background: #fef3c7;
  color: #d97706;
  border-color: #fde68a;
}

.pack-credits {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;

  .unit {
    font-size: 0.85rem;
    font-weight: 500;
    color: #64748b;
  }
}

.pack-desc {
  margin: 0;
  font-size: 0.775rem;
  color: #64748b;
  line-height: 1.35;
}

.pack-price {
  margin-top: 1.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e2e8f0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
  text-align: center;
}

.checkout-area {
  margin-top: 1rem;
}

.checkout-btn {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #ffffff;
  border: none;
  border-radius: 0.875rem;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.25);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.checkout-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.35);
}

.checkout-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkout-note {
  margin: 0.75rem 0 0 0;
  text-align: center;
  font-size: 0.75rem;
  color: #94a3b8;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (max-width: 640px) {
  .billing-modal-overlay {
    padding: 0.5rem !important;
  }
  
  .billing-modal-card {
    border-radius: 12px !important;
  }
  
  .billing-modal-body {
    padding: 1.25rem 0.75rem !important;
  }
  
  .balance-banner {
    padding: 1rem 0.75rem !important;
    gap: 0.5rem !important;
  }
  
  .pack-card {
    padding: 1rem 0.75rem !important;
  }
  
  .checkout-btn {
    font-size: 0.9rem !important;
    padding: 0.85rem !important;
  }
}
</style>
