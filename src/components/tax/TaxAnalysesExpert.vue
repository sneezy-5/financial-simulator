<script setup>
import { computed } from 'vue'
import { formatFCFA, calculerSeuilRentabilite, analyserImpactTVA } from '../../services/taxService'

const props = defineProps({
  resultats: Object,
  params: Object,
  projections: Array
})

// 1. Point Mort
const pointMort = computed(() => {
  const p = props.params
  if (!p || !p.ca) return null
  return calculerSeuilRentabilite(
    p.ca, 
    p.chargesFixes || 0, 
    p.chargesVariables || 0
  )
})

// 2. TVA Simulator
const tva = computed(() => {
  const p = props.params
  if (!p || !p.ca) return null
  return analyserImpactTVA(p.ca, p.chargesVariables || 0)
})

// 3. SVG Graph Data
const graphPoints = computed(() => {
  if (!props.projections || props.projections.length === 0) return []
  
  // On prend le scénario réaliste par défaut pour le graph expert
  const scenario = props.projections.find(s => s.scenario === 'realiste') || props.projections[0]
  if (!scenario || !scenario.annees) return []

  // Calcul du max pour la mise à l'échelle
  const values = scenario.annees.map(a => a.ca)
  const maxVal = Math.max(...values, 1)
  
  return scenario.annees.map((a, i) => {
    const x = (i * 20) + 10
    const y = 90 - ((a.ca / maxVal) * 70)
    return {
      x,
      y: isNaN(y) ? 90 : y,
      ca: a.ca,
      impot: a.impot,
      annee: a.annee,
      maxVal
    }
  })
})

const polylineCA = computed(() => {
  if (graphPoints.value.length === 0) return '0,90 100,90'
  return graphPoints.value.map(p => `${p.x},${p.y}`).join(' ')
})

const polylineImpot = computed(() => {
  if (graphPoints.value.length === 0) return '0,90 100,90'
  const maxVal = graphPoints.value[0].maxVal || 1
  return graphPoints.value.map(p => {
    const y = 90 - ((p.impot / maxVal) * 70)
    return `${p.x},${isNaN(y) ? 90 : y}`
  }).join(' ')
})

</script>

<template>
  <div class="analyses-expert">
    <div class="ae-header">
      <div class="ae-badge">EXPERT</div>
      <h3>Analyses Prédictives & Stratégie</h3>
    </div>

    <div class="ae-grid">
      <!-- Point Mort -->
      <div class="ae-card">
        <div class="ae-card-header">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125z"/></svg>
          <h4>Seuil de Rentabilité</h4>
        </div>
        <div v-if="pointMort" class="ae-card-body">
          <div class="ae-main-val">{{ formatFCFA(pointMort.seuilCA) }} F</div>
          <p class="ae-desc">C'est le CA minimum à réaliser pour ne pas perdre d'argent.</p>
          <div class="ae-stats">
            <div class="ae-stat">
              <span class="ae-stat-label">Par jour</span>
              <span class="ae-stat-val">{{ formatFCFA(pointMort.seuilJournalier) }} F</span>
            </div>
            <div class="ae-stat">
              <span class="ae-stat-label">Objectif atteint le</span>
              <span class="ae-stat-val">Jour {{ pointMort.joursPourRentabilite }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- TVA Simulator -->
      <div class="ae-card">
        <div class="ae-card-header">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
          <h4>Impact TVA (18%)</h4>
        </div>
        <div v-if="tva" class="ae-card-body">
          <div class="ae-main-val">+{{ formatFCFA(tva.tvaAPayer) }} F</div>
          <p class="ae-desc">Estimation de la TVA nette à reverser si vous passez au régime RSI/RNI.</p>
          <div class="ae-alert-box">
            ⚠️ Pour garder votre marge actuelle, vous devrez augmenter vos prix de <strong>18%</strong>.
          </div>
        </div>
      </div>
    </div>

    <!-- Graph -->
    <div class="ae-graph-card">
      <div class="ae-card-header">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.5 4.5L21.75 7.5M21.75 7.5V12m0-4.5H17.25"/></svg>
        <h4>Projection Croissance vs Impôts</h4>
      </div>
      <div class="graph-container">
        <svg v-if="graphPoints.length > 0" viewBox="0 0 100 100" preserveAspectRatio="none" class="ae-svg">
          <defs>
            <linearGradient id="gradCA" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3" />
              <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
            </linearGradient>
          </defs>

          <!-- Grille -->
          <line x1="0" y1="90" x2="100" y2="90" stroke="rgba(255,255,255,0.1)" stroke-width="0.5" />
          
          <!-- Remplissage CA -->
          <path :d="`M ${graphPoints[0]?.x},90 ` + graphPoints.map(p => `L ${p.x},${p.y}`).join(' ') + ` L ${graphPoints[graphPoints.length-1]?.x},90 Z`" fill="url(#gradCA)" />

          <!-- Ligne CA -->
          <polyline :points="polylineCA" fill="none" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          
          <!-- Ligne Impôt -->
          <polyline :points="polylineImpot" fill="none" stroke="#f87171" stroke-width="2.5" stroke-dasharray="3,2" />

          <!-- Points -->
          <circle v-for="p in graphPoints" :key="p.annee" :cx="p.x" :cy="p.y" r="2" fill="#60a5fa" stroke="#1e293b" stroke-width="0.5" />

          <!-- Labels Années -->
          <text v-for="p in graphPoints" :key="'t'+p.annee" :x="p.x" y="98" fill="#94a3b8" font-size="5" text-anchor="middle">An {{ p.annee }}</text>
        </svg>
        <div class="graph-legend">
          <div class="legend-item"><span class="dot ca"></span> Croissance CA</div>
          <div class="legend-item"><span class="dot impot"></span> Charge Fiscale</div>
        </div>
      </div>
    </div>

    <!-- CTA Expert -->
    <div class="ae-cta no-print">
      <div class="cta-info">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
        <span>Ces analyses sont des estimations. Pour un rapport certifié conforme :</span>
      </div>
      <button class="btn-expert-cta disabled">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" /></svg>
        Consulter un Expert (Bientôt)
      </button>
    </div>
  </div>
</template>

<style scoped>
.analyses-expert {
  background: #1e293b;
  color: white;
  border-radius: 24px;
  padding: 2rem;
  margin-top: 2rem;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
}

.ae-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
.ae-badge { background: #3b82f6; color: white; font-size: 0.65rem; font-weight: 900; padding: 3px 8px; border-radius: 6px; letter-spacing: 0.05em; }
.ae-header h3 { margin: 0; font-size: 1.3rem; font-weight: 800; letter-spacing: -0.02em; color: #f1f5f9; }

.ae-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }

.ae-card { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 1.75rem; }
.ae-card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; color: #cbd5e1; }
.ae-card-header h4 { margin: 0; font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }

.ae-main-val { font-size: 1.8rem; font-weight: 900; color: #f8fafc; margin-bottom: 0.75rem; }
.ae-desc { font-size: 0.85rem; color: #cbd5e1; line-height: 1.5; margin-bottom: 1.5rem; }

.ae-stats { display: flex; flex-direction: column; gap: 0.85rem; }
.ae-stat { display: flex; justify-content: space-between; font-size: 0.85rem; padding-top: 0.85rem; border-top: 1px solid rgba(255,255,255,0.1); }
.ae-stat-label { color: #94a3b8; }
.ae-stat-val { font-weight: 700; color: #f1f5f9; }

.ae-alert-box { background: rgba(234,179,8,0.12); border: 1px solid rgba(234,179,8,0.3); border-radius: 12px; padding: 1rem; color: #fef08a; font-size: 0.8rem; line-height: 1.5; }

.ae-graph-card { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 1.75rem; }

.graph-container { height: 200px; position: relative; margin-top: 1.5rem; }
.ae-svg { width: 100%; height: 100%; overflow: visible; }

.graph-legend { display: flex; gap: 2rem; margin-top: 1.5rem; justify-content: center; }
.legend-item { display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; color: #cbd5e1; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.dot.ca { background: #2563eb; }
.dot.impot { background: #ef4444; border: 1px dashed rgba(239, 68, 68, 0.5); }

@media (max-width: 640px) {
  .ae-grid { grid-template-columns: 1fr; }
  .analyses-expert { padding: 1.5rem; }
}

/* CTA Expert */
.ae-cta {
  margin-top: 2rem;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  text-align: center;
}
.cta-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
  color: #94a3b8;
}
.btn-expert-cta {
  background: white;
  color: #0f172a;
  border: none;
  padding: 0.85rem 1.75rem;
  border-radius: 12px;
  font-weight: 800;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.btn-expert-cta:hover {
  background: #f1f5f9;
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 10px 20px rgba(0,0,0,0.2);
}
</style>
