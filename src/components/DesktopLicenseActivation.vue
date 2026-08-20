<script setup>
import { ref } from 'vue';

const emit = defineEmits(['unlocked']);

const licenseKey = ref('');
const errorMsg = ref('');
const isLoading = ref(false);

const activateLicense = async () => {
  if (!licenseKey.value) {
    errorMsg.value = "Veuillez entrer une clé de licence valide.";
    return;
  }
  
  errorMsg.value = '';
  isLoading.value = true;
  
  try {
    const response = await fetch('/api/local-license/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: licenseKey.value })
    });
    const data = await response.json();
    
    if (data.success) {
      emit('unlocked', licenseKey.value);
    } else {
      errorMsg.value = data.error || "Clé invalide ou expirée.";
    }
  } catch (err) {
    errorMsg.value = "Erreur de connexion au serveur local.";
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="license-screen">
    <!-- Decorative background elements -->
    <div class="bg-decoration shape-1"></div>
    <div class="bg-decoration shape-2"></div>
    
    <div class="license-card">
      <div class="logo-container">
        <div class="logo-box">O</div>
      </div>
      
      <h1 class="title">ONDA RH</h1>
      <p class="subtitle">Version Entreprise Hors-Ligne</p>
      
      <div class="input-group">
        <label class="input-label">Clé de Licence Administrateur</label>
        <input 
          v-model="licenseKey" 
          type="text" 
          placeholder="XXXX-XXXX-XXXX-XXXX" 
          class="license-input"
          @keyup.enter="activateLicense"
        />
      </div>
      
      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
      
      <button 
        @click="activateLicense" 
        :disabled="isLoading"
        class="submit-btn"
      >
        <span v-if="isLoading" class="spinner"></span>
        DÉVERROUILLER L'APPLICATION
      </button>
      
      <div class="footer">
        &copy; 2026 ONDA Solutions. Tous droits réservés.
      </div>
    </div>
  </div>
</template>

<style scoped>
.license-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f8fafc;
  color: #0f172a;
  position: relative;
  overflow: hidden;
  font-family: system-ui, -apple-system, sans-serif;
}

.bg-decoration {
  position: absolute;
  border-radius: 50%;
  z-index: 0;
  opacity: 0.1;
  filter: blur(80px);
}

.shape-1 {
  top: -20%;
  left: -10%;
  width: 50vw;
  height: 50vh;
  background-color: #3b82f6;
}

.shape-2 {
  bottom: 10%;
  right: -10%;
  width: 40vw;
  height: 40vh;
  background-color: #22d3ee;
}

.license-card {
  z-index: 10;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  padding: 3rem;
  border-radius: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.1);
  max-width: 400px;
  width: 90%;
  text-align: center;
}

.logo-container {
  display: flex;
  justify-content: center;
  margin-bottom: 2rem;
}

.logo-box {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%);
  border-radius: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  font-weight: 900;
  color: white;
  box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3);
}

.title {
  font-size: 1.875rem;
  font-weight: 800;
  margin: 0 0 0.5rem 0;
  letter-spacing: -0.025em;
  color: #1e293b;
}

.subtitle {
  color: #64748b;
  font-size: 0.875rem;
  margin: 0 0 2.5rem 0;
  font-weight: 500;
}

.input-group {
  text-align: left;
  margin-bottom: 1.5rem;
}

.input-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 0.5rem;
}

.license-input {
  width: 100%;
  background-color: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.875rem 1rem;
  color: #0f172a;
  font-size: 1.1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  text-align: center;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  transition: all 0.2s;
  box-sizing: border-box;
  font-weight: 600;
}

.license-input:focus {
  outline: none;
  background-color: #ffffff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.error-msg {
  color: #dc2626;
  font-size: 0.875rem;
  background-color: #fee2e2;
  padding: 0.75rem;
  border-radius: 0.375rem;
  margin-bottom: 1.5rem;
  font-weight: 500;
}

.submit-btn {
  width: 100%;
  background: linear-gradient(to right, #2563eb, #06b6d4);
  color: white;
  font-weight: 700;
  padding: 0.875rem 1rem;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.submit-btn:hover:not(:disabled) {
  background: linear-gradient(to right, #1d4ed8, #0891b2);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.footer {
  margin-top: 2rem;
  font-size: 0.75rem;
  color: #64748b;
}
</style>
