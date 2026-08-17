<script setup>
import { ref, computed } from 'vue'

const emit = defineEmits(['retour'])

const epargneInitiale = ref(500000)
const versementMensuel = ref(50000)
const dureeAnnees = ref(5)
const tauxRendement = ref(6) // 6% rendement annuel estimé (ex: DAT, SCPI, Titres UEMOA)

const capitalFinal = computed(() => {
  const r = (tauxRendement.value / 100) / 12
  const n = dureeAnnees.value * 12
  let capital = epargneInitiale.value
  
  for (let i = 0; i < n; i++) {
    capital = (capital + versementMensuel.value) * (1 + r)
  }
  return Math.round(capital)
})

const totalVersements = computed(() => {
  return epargneInitiale.value + (versementMensuel.value * dureeAnnees.value * 12)
})

const totalInteretsGagnes = computed(() => {
  return capitalFinal.value - totalVersements.value
})

const fcfa = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'
</script>

<template>
  <div class="personal-finance-container animate-in">
    <header class="page-top-bar">
      <button class="btn-back" @click="emit('retour')">← Accueil</button>
      <h2>Pilier 6 — Épargne & Intérêts Composés</h2>
    </header>

    <div class="content-wrapper">
      <div class="intro-box">
        <h1>Simulateur d'Épargne & Placements</h1>
        <p>Découvrez la puissance des intérêts composés et projetez la croissance de votre patrimoine financier.</p>
      </div>

      <div class="sim-grid">
        <div class="form-card">
          <h3>Paramètres d'épargne</h3>
          
          <div class="form-group">
            <label>Capital de départ (Apport initial)</label>
            <input v-model.number="epargneInitiale" type="number" step="50000" />
          </div>

          <div class="form-group">
            <label>Versement mensuel régulier</label>
            <input v-model.number="versementMensuel" type="number" step="10000" />
          </div>

          <div class="form-group">
            <label>Durée du placement ({{ dureeAnnees }} ans)</label>
            <input v-model.number="dureeAnnees" type="range" min="1" max="25" />
          </div>

          <div class="form-group">
            <label>Taux de rendement annuel estimé ({{ tauxRendement }}%)</label>
            <input v-model.number="tauxRendement" type="range" min="1" max="15" step="0.5" />
            <small class="hint">Exemples : DAT (4-5%), Bons du Trésor UEMOA (6-7%), Actions (8-10%)</small>
          </div>
        </div>

        <div class="results-card">
          <h3>Résultats de la projection</h3>

          <div class="kpi-main">
            <span class="kpi-label">Capital final estimé</span>
            <span class="kpi-val">{{ fcfa(capitalFinal) }}</span>
          </div>

          <div class="kpi-sub-grid">
            <div class="kpi-box">
              <span>Total versé</span>
              <strong>{{ fcfa(totalVersements) }}</strong>
            </div>
            <div class="kpi-box highlight">
              <span>Intérêts générés</span>
              <strong>+ {{ fcfa(totalInteretsGagnes) }}</strong>
            </div>
          </div>

          <div class="advice-box">
            <h4>💡 Le pouvoir du temps</h4>
            <p>En plaçant <strong>{{ fcfa(versementMensuel) }}</strong> par mois pendant <strong>{{ dureeAnnees }} ans</strong> à <strong>{{ tauxRendement }}%</strong>, vous gagnez <strong>{{ fcfa(totalInteretsGagnes) }}</strong> uniquement grâce aux intérêts générés !</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.personal-finance-container {
  min-height: 100vh;
  background: #f8fafc;
  padding-bottom: 3rem;
}
.page-top-bar {
  background: white;
  padding: 1rem 2rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.btn-back {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  color: #475569;
}
.content-wrapper {
  max-width: 1000px;
  margin: 2rem auto;
  padding: 0 1rem;
}
.intro-box { text-align: center; margin-bottom: 2rem; }
.intro-box h1 { font-size: 1.8rem; color: #0f172a; margin-bottom: 0.5rem; }
.intro-box p { color: #64748b; }

.sim-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}
@media (max-width: 768px) {
  .sim-grid { grid-template-columns: 1fr; }
}

.form-card, .results-card {
  background: white;
  padding: 1.5rem;
  border-radius: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
}

.form-group { margin-bottom: 1.25rem; }
.form-group label { display: block; font-weight: 600; margin-bottom: 0.5rem; color: #334155; font-size: 0.9rem; }
.form-group input[type="number"] { width: 100%; padding: 0.65rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 1rem; }
.form-group input[type="range"] { width: 100%; }
.hint { font-size: 0.75rem; color: #94a3b8; display: block; margin-top: 0.25rem; }

.kpi-main {
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  color: white;
  padding: 1.5rem;
  border-radius: 12px;
  text-align: center;
  margin-bottom: 1rem;
}
.kpi-label { display: block; font-size: 0.85rem; opacity: 0.9; }
.kpi-val { font-size: 1.8rem; font-weight: 800; display: block; margin-top: 0.25rem; }

.kpi-sub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
.kpi-box { background: #f8fafc; padding: 1rem; border-radius: 10px; border: 1px solid #e2e8f0; text-align: center; }
.kpi-box span { font-size: 0.75rem; color: #64748b; display: block; }
.kpi-box strong { font-size: 1rem; color: #0f172a; margin-top: 0.25rem; display: block; }
.kpi-box.highlight { background: #ecfdf5; border-color: #a7f3d0; }
.kpi-box.highlight strong { color: #047857; }

.advice-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 1rem; color: #1e40af; }
.advice-box h4 { margin-top: 0; margin-bottom: 0.5rem; }
.advice-box p { margin: 0; font-size: 0.85rem; line-height: 1.5; }
</style>
