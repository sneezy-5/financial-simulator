<script setup>
import { ref, computed } from 'vue'

const emit = defineEmits(['retour'])

const chiffreAffaires = ref(25000000)
const tauxCroissance = ref(15) // % par an
const horizonAnnees = ref(5)

const projections = computed(() => {
  const list = []
  let ca = chiffreAffaires.value
  for (let i = 1; i <= horizonAnnees.value; i++) {
    const caFutur = Math.round(ca * Math.pow(1 + tauxCroissance.value / 100, i - 1))
    // Estimation impôt synthétique (~5%)
    const impotEstime = Math.round(caFutur * 0.05)
    list.push({
      annee: `Année ${i}`,
      ca: caFutur,
      impot: impotEstime
    })
  }
  return list
})

const fcfa = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'
</script>

<template>
  <div class="tax-projections-container animate-in">
    <header class="page-top-bar">
      <button class="btn-back" @click="emit('retour')">← Accueil</button>
      <h2>Pilier 5 — Projections & Scénarios « Et si... »</h2>
    </header>

    <div class="content-wrapper">
      <div class="intro-box">
        <h1>Simulateur de Projections Financières PME</h1>
        <p>Anticipez la croissance de votre chiffre d'affaires et vos futures charges fiscales à 3 et 5 ans.</p>
      </div>

      <div class="sim-grid">
        <div class="form-card">
          <h3>Hypothèses de croissance</h3>

          <div class="form-group">
            <label>Chiffre d'affaires actuel (Annuel)</label>
            <input v-model.number="chiffreAffaires" type="number" step="1000000" />
          </div>

          <div class="form-group">
            <label>Taux de croissance annuel estimé ({{ tauxCroissance }}%)</label>
            <input v-model.number="tauxCroissance" type="range" min="0" max="50" step="1" />
          </div>

          <div class="form-group">
            <label>Horizon de projection ({{ horizonAnnees }} ans)</label>
            <input v-model.number="horizonAnnees" type="range" min="2" max="5" />
          </div>
        </div>

        <div class="results-card">
          <h3>Projections pluriannuelles</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Année</th>
                  <th>Chiffre d'affaires</th>
                  <th>Impôt estimé</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in projections" :key="p.annee">
                  <td><strong>{{ p.annee }}</strong></td>
                  <td class="text-green">{{ fcfa(p.ca) }}</td>
                  <td class="text-orange">{{ fcfa(p.impot) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tax-projections-container {
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

.sim-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
@media (max-width: 768px) { .sim-grid { grid-template-columns: 1fr; } }

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

.table-container table { width: 100%; border-collapse: collapse; text-align: left; }
.table-container th, .table-container td { padding: 0.75rem; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
.table-container th { background: #f8fafc; color: #64748b; font-weight: 600; }
.text-green { color: #059669; font-weight: 600; }
.text-orange { color: #d97706; font-weight: 600; }
</style>
