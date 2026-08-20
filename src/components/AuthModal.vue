<template>
  <div v-if="show" class="auth-modal-overlay" @click.self="$emit('close')">
    <div class="auth-modal-card">
      <!-- Header -->
      <div class="auth-modal-header">
        <div class="auth-header-title">
          <div class="auth-icon-badge">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
        <h2>
            <template v-if="isForgotPassword">Mot de passe oublié</template>
            <template v-else-if="isResetMode">Nouveau mot de passe</template>
            <template v-else-if="isOtpMode">Vérification de compte</template>
            <template v-else>{{ isLogin ? 'Connexion à votre espace' : 'Création de compte' }}</template>
          </h2>
        </div>
        <button @click="$emit('close')" class="auth-close-btn" title="Fermer">✕</button>
      </div>

      <!-- Body -->
      <div class="auth-modal-body">
        <div v-if="errorMsg" class="auth-error-alert">
          <svg class="error-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>{{ errorMsg }}</span>
        </div>

        <div v-if="successMsg" class="auth-success-alert">
          <svg class="success-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span>{{ successMsg }}</span>
        </div>

        <!-- Mode Forgot Password -->
        <form v-if="isForgotPassword" @submit.prevent="handleForgotPassword" class="auth-form">
          <p class="auth-subtitle">Saisissez votre e-mail pour recevoir un code de réinitialisation sécurisé :</p>
          <div class="form-field">
            <label>Adresse Email</label>
            <input 
              type="email" 
              v-model="email" 
              required 
              placeholder="votre.email@entreprise.com" 
              class="auth-input"
            />
          </div>
          <button type="submit" :disabled="loading" class="auth-submit-btn">
            <span v-if="loading" class="spinner"></span>
            <span v-else>Recevoir le code par e-mail</span>
          </button>
          <div class="auth-toggle-box">
            <button type="button" @click="isForgotPassword = false; isLogin = true" class="auth-link">← Retour à la connexion</button>
          </div>
        </form>

        <!-- Mode Reset Password (avec code OTP) -->
        <form v-else-if="isResetMode" @submit.prevent="handleResetPassword" class="auth-form">
          <p class="auth-subtitle">Saisissez le code reçu par e-mail et votre nouveau mot de passe :</p>
          <div class="form-field">
            <label>Code de sécurité (OTP)</label>
            <input 
              type="text" 
              v-model="resetToken" 
              required 
              placeholder="123456" 
              class="auth-input"
            />
          </div>
          <div class="form-field">
            <label>Nouveau mot de passe</label>
            <input 
              type="password" 
              v-model="password" 
              required 
              placeholder="••••••••" 
              class="auth-input"
            />
          </div>
          <button type="submit" :disabled="loading" class="auth-submit-btn">
            <span v-if="loading" class="spinner"></span>
            <span v-else>Enregistrer le mot de passe</span>
          </button>
        </form>

        <!-- Mode Verification OTP (après inscription) -->
        <form v-else-if="isOtpMode" @submit.prevent="handleVerifyOtp" class="auth-form">
          <p class="auth-subtitle">Un code de vérification a été envoyé à <strong>{{ email }}</strong> :</p>
          <div class="form-field">
            <label>Code de vérification (OTP)</label>
            <input 
              type="text" 
              v-model="otpCode" 
              required 
              placeholder="123456" 
              class="auth-input"
            />
          </div>
          <button type="submit" :disabled="loading" class="auth-submit-btn">
            <span v-if="loading" class="spinner"></span>
            <span v-else>Vérifier mon compte</span>
          </button>
        </form>

        <!-- Mode Login / Register classique -->
        <form v-else @submit.prevent="handleSubmit" class="auth-form">
          <div class="form-field">
            <label>Adresse Email</label>
            <input 
              type="email" 
              v-model="email" 
              required 
              placeholder="votre.email@entreprise.com" 
              class="auth-input"
            />
          </div>
          
          <div class="form-field">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label>Mot de passe</label>
              <button 
                v-if="isLogin" 
                type="button" 
                @click="isForgotPassword = true" 
                class="forgot-link"
              >
                Mot de passe oublié ?
              </button>
            </div>
            <input 
              type="password" 
              v-model="password" 
              required 
              placeholder="••••••••" 
              class="auth-input"
            />
          </div>

          <button type="submit" :disabled="loading" class="auth-submit-btn">
            <span v-if="loading" class="spinner"></span>
            <span v-else>{{ isLogin ? 'Se connecter' : 'S\'inscrire gratuitement' }}</span>
          </button>
        </form>
        
        <div v-if="!isForgotPassword && !isResetMode && !isOtpMode" class="auth-toggle-box">
          <span v-if="isLogin">
            Pas encore de compte ? 
            <button type="button" @click="isLogin = false" class="auth-link">S'inscrire</button>
          </span>
          <span v-else>
            Déjà inscrit ? 
            <button type="button" @click="isLogin = true" class="auth-link">Se connecter</button>
          </span>
        </div>
        

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { login, register, verifyOtp } from '../services/auth.js'

const props = defineProps({
  show: Boolean
})
const emit = defineEmits(['close', 'success'])

const isLogin = ref(true)
const isForgotPassword = ref(false)
const isResetMode = ref(false)
const isOtpMode = ref(false)
const resetToken = ref('')
const otpCode = ref('')

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('reset_token')) {
    resetToken.value = params.get('reset_token')
    isResetMode.value = true
  }
})

const handleSubmit = async () => {
  loading.value = true
  errorMsg.value = ''
  successMsg.value = ''
  
  try {
    if (isLogin.value) {
      try {
        await login(email.value, password.value)
        emit('success')
        emit('close')
        email.value = ''
        password.value = ''
      } catch (err) {
        if (err.message === 'email_not_verified') {
          isOtpMode.value = true
          isLogin.value = false
          successMsg.value = "Votre compte n'est pas vérifié. Un nouveau code vous a été envoyé."
        } else {
          throw err
        }
      }
    } else {
      await register(email.value, password.value)
      isOtpMode.value = true
      isLogin.value = false
      successMsg.value = "Compte créé ! Veuillez vérifier votre e-mail."
      password.value = '' // clear password
    }
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}

const handleForgotPassword = async () => {
  if (!email.value) return
  loading.value = true
  errorMsg.value = ''
  successMsg.value = ''
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value })
    })
    const data = await res.json()
    if (res.ok) {
      successMsg.value = data.message || "Un code de réinitialisation vous a été envoyé."
      setTimeout(() => {
        isForgotPassword.value = false
        isResetMode.value = true
        successMsg.value = ''
      }, 1500)
    } else {
      throw new Error(data.error || "Erreur de demande")
    }
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}

const handleResetPassword = async () => {
  if (!password.value || !resetToken.value) return
  loading.value = true
  errorMsg.value = ''
  successMsg.value = ''
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, otp: resetToken.value, newPassword: password.value })
    })
    const data = await res.json()
    if (res.ok) {
      successMsg.value = data.message || "Mot de passe réinitialisé !"
      setTimeout(() => {
        isResetMode.value = false
        isLogin.value = true
        // Nettoyer l'URL
        window.history.replaceState({}, document.title, window.location.pathname)
      }, 2500)
    } else {
      throw new Error(data.error || "Erreur de réinitialisation")
    }
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}

const handleVerifyOtp = async () => {
  loading.value = true
  errorMsg.value = ''
  successMsg.value = ''
  try {
    await verifyOtp(email.value, otpCode.value)
    successMsg.value = "Compte vérifié avec succès !"
    setTimeout(() => {
      emit('success')
      emit('close')
      isOtpMode.value = false
      email.value = ''
      otpCode.value = ''
    }, 1500)
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.3);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  animation: fadeIn 0.2s ease-out;
}

.auth-modal-card {
  background: #ffffff;
  border-radius: 1rem;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
  width: 100%;
  max-width: 440px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  color: #0f172a;
}

.auth-modal-header {
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #0f172a;
}

.auth-header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.auth-icon-badge {
  width: 36px;
  height: 36px;
  border-radius: 0.5rem;
  background: #eff6ff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3b82f6;
  border: 1px solid #dbeafe;
}

.auth-modal-header h2 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  color: #0f172a;
}

.auth-close-btn {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  color: #64748b;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  transition: all 0.2s;
}

.auth-close-btn:hover {
  background: #f8fafc;
  color: #0f172a;
}

.auth-modal-body {
  padding: 1.75rem 1.5rem;
}

.auth-subtitle {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0 0 1rem 0;
  line-height: 1.4;
}

.auth-error-alert {
  background: rgba(239, 68, 68, 0.1);
  border-left: 4px solid #ef4444;
  padding: 0.75rem 1rem;
  border-radius: 0.375rem;
  color: #b91c1c;
  font-size: 0.875rem;
  margin-bottom: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.auth-success-alert {
  background: rgba(16, 185, 129, 0.1);
  border-left: 4px solid #10b981;
  padding: 0.75rem 1rem;
  border-radius: 0.375rem;
  color: #047857;
  font-size: 0.875rem;
  margin-bottom: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.error-svg {
  color: #ef4444;
  flex-shrink: 0;
}

.success-svg {
  color: #10b981;
  flex-shrink: 0;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  text-align: left;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #475569;
}

.forgot-link {
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 0.775rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.forgot-link:hover {
  text-decoration: underline;
  color: #2563eb;
}

.auth-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.625rem;
  font-size: 0.95rem;
  color: #0f172a;
  background: #ffffff;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.auth-input:focus {
  border-color: #3b82f6;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.auth-submit-btn {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.875rem 1.25rem;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
  border: none;
  border-radius: 0.625rem;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.auth-submit-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
}

.auth-submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auth-toggle-box {
  margin-top: 1.25rem;
  text-align: center;
  font-size: 0.875rem;
  color: #64748b;
}

.auth-link {
  background: none;
  border: none;
  color: #3b82f6;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.auth-link:hover {
  color: #2563eb;
}

.bonus-badge {
  margin-top: 1.25rem;
  background: #f0fdf4;
  border: 1px solid #d1fae5;
  color: #047857;
  font-size: 0.825rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.bonus-icon {
  color: #10b981;
  flex-shrink: 0;
}

.spinner {
  width: 18px;
  height: 18px;
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
  .auth-modal-overlay {
    padding: 0.5rem !important;
  }
  
  .auth-modal-card {
    border-radius: 12px !important;
  }
  
  .auth-modal-body {
    padding: 1.25rem 0.75rem !important;
  }
  
  .auth-input {
    padding: 0.7rem 0.85rem !important;
    font-size: 0.9rem !important;
  }
  
  .auth-submit-btn {
    font-size: 0.95rem !important;
    padding: 0.8rem 1rem !important;
  }
}
</style>
