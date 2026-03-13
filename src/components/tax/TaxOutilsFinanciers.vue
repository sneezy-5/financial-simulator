<script setup>
import { ref, computed } from 'vue'
import { 
  formatFCFA, 
  calculerCNPS, 
  calculerPrixVenteIdeal, 
  calculerScoreOnda, 
  recommanderStatut, 
  calculerCapaciteEmprunt 
} from '../../services/taxService'

const props = defineProps({
  resultats: Object,
  params: Object
})

const formatInput = (val) => {
  if (val === 0 || val === '0' || !val) return ''
  return new Intl.NumberFormat('fr-FR').format(val)
}

const parseInput = (event) => {
  const val = event.target.value
  if (!val) return 0
  const clean = val.toString().replace(/[^0-9]/g, '')
  return clean ? parseInt(clean, 10) : 0
}

const activeTab = ref('sante')

// CNPS
const salaireNetInput = ref(75000)
const cnps = computed(() => calculerCNPS(salaireNetInput.ref || salaireNetInput.value))

// Prix de Vente
const prixAchatInput = ref(1000)
const margeSouhaitee = ref(25)
const prixVente = computed(() => {
  return calculerPrixVenteIdeal(
    prixAchatInput.value, 
    margeSouhaitee.value, 
    props.resultats.regime.id, 
    props.params.secteur
  )
})

// Score ONDA
const scoreOnda = computed(() => calculerScoreOnda(props.resultats))

// Statut
const recommandation = computed(() => recommanderStatut(props.params.ca, 1))

// Emprunt
const dureeEmprunt = ref(3)
const montantSouhaite = ref(0)
const emprunt = computed(() => calculerCapaciteEmprunt(props.resultats?.beneficeNet || 0, dureeEmprunt.value))

const calculerMensualiteSimulee = computed(() => {
  if (!montantSouhaite.value) return 0
  const tauxAnnuel = 0.12
  const tauxMensuel = tauxAnnuel / 12
  const nbMois = dureeEmprunt.value * 12
  
  // Formule mensualité : M = P * [r(1+r)^n] / [(1+r)^n - 1]
  const m = montantSouhaite.value * (tauxMensuel * Math.pow(1 + tauxMensuel, nbMois)) / (Math.pow(1 + tauxMensuel, nbMois) - 1)
  return Math.round(m)
})

const tabs = [
  { id: 'sante', label: 'Santé ONDA', icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>` },
  { id: 'cnps', label: 'CNPS / Salaire', icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>` },
  { id: 'prix', label: 'Prix de Vente', icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a2.25 2.25 0 003.182 0l4.318-4.318a2.25 2.25 0 000-3.182L11.159 3.659A2.25 2.25 0 009.568 3zM6 6h1.5v1.5H6V6z"/></svg>` },
  { id: 'statut', label: 'Statut Juridique', icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z"/></svg>` },
  { id: 'emprunt', label: 'Crédit / Prêt', icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>` },
]
</script>

<template>
  <div class="outils-card">
    <div class="outils-header">
      <div class="oh-title">
        <div class="oh-icon-bg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l5.654-4.654m5.896-2.613l.617-.923a2.25 2.25 0 00-.933-3.26 2.25 2.25 0 01-2.206-2.22V5.25A2.25 2.25 0 009 3H5.25A2.25 2.25 0 003 5.25v3.75A2.25 2.25 0 005.25 11.25h2.206c.98 0 1.815.7 2.004 1.66l.047.234c.11.55.421 1.04.869 1.38z"/></svg>
        </div>
        <h3>Outils Avancés ONDA Lite</h3>
      </div>
      <div class="tabs-nav">
        <button 
          v-for="t in tabs" 
          :key="t.id"
          class="tab-btn"
          :class="{ active: activeTab === t.id }"
          @click="activeTab = t.id"
        >
          <div class="t-icon-svg" v-html="t.icon"></div>
          <span class="t-label">{{ t.label }}</span>
        </button>
      </div>
    </div>

    <div class="outils-body">
      <!-- 1. SANTE / SCORE ONDA -->
      <div v-if="activeTab === 'sante'" class="tool-pane">
        <!-- Message si pas de résultats -->
        <div v-if="!resultats" class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="48" height="48" style="color: #cbd5e1; margin-bottom: 1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
          <p>Utilisez d'abord le simulateur d'impôts pour générer votre score de santé financière.</p>
        </div>
        <div v-else class="score-container">
          <div class="score-circle" :class="scoreOnda.grade.toLowerCase()">
            <div class="score-val">{{ scoreOnda.score }}</div>
            <div class="score-grade">GRADE {{ scoreOnda.grade }}</div>
          </div>
          <div class="score-info">
            <h4>Diagnostic de votre PME</h4>
            <ul class="crit-list">
              <li v-for="c in scoreOnda.criteres" :key="c">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14" style="color: #22c55e; margin-right: 6px;"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                {{ c }}
              </li>
            </ul>
            <p class="score-desc">
              Ce score évalue votre rentabilité, votre sécurité financière et votre optimisation fiscale.
            </p>
          </div>
        </div>
      </div>

      <!-- 2. CNPS -->
      <div v-if="activeTab === 'cnps'" class="tool-pane">
        <div class="tool-intro">
          <h4>Coût réel d'un employé</h4>
          <p>Saisissez le salaire net que vous souhaitez verser pour voir le coût total (patronal + salarial).</p>
        </div>
        <div class="calc-row">
          <div class="input-group">
            <label>Salaire NET mensuel (FCFA)</label>
            <input 
              type="text" 
              :value="formatInput(salaireNetInput)"
              @input="salaireNetInput = parseInput($event)"
              placeholder="Ex: 150 000"
            >
          </div>
        </div>
        <div class="results-grid">
          <div class="res-item">
            <div class="res-label">Salaire Brut estimé</div>
            <div class="res-val">{{ formatFCFA(cnps.salaireBrut) }} F</div>
          </div>
          <div class="res-item">
            <div class="res-label">Charges Patronales</div>
            <div class="res-val">{{ formatFCFA(cnps.partPatronale) }} F</div>
          </div>
          <div class="res-item highlight">
            <div class="res-label">Coût Total Entreprise</div>
            <div class="res-val">{{ formatFCFA(cnps.coutTotal) }} F</div>
          </div>
        </div>
        <div class="tool-note">Estimation basée sur les taux CNPS 2024 (Retraite, Famille, AT).</div>
      </div>

      <!-- 3. PRIX DE VENTE -->
      <div v-if="activeTab === 'prix'" class="tool-pane">
        <div class="tool-intro">
          <h4>Calculateur de Prix de Vente Idéal</h4>
          <p>Fixez vos prix en tenant compte de l'impôt sur le CA pour garantir votre marge réelle.</p>
        </div>
        <div class="calc-row grid-2">
          <div class="input-group">
            <label>Prix d'Achat Unitaire (FCFA)</label>
            <input 
              type="text" 
              :value="formatInput(prixAchatInput)"
              @input="prixAchatInput = parseInput($event)"
              placeholder="Ex: 1 500"
            >
          </div>
          <div class="input-group">
            <label>Marge Nette souhaitée (%)</label>
            <input type="number" v-model="margeSouhaitee" max="80">
          </div>
        </div>
        <div class="results-grid">
          <div class="res-item highlight">
            <div class="res-label">Prix de Vente Conseillé</div>
            <div class="res-val">{{ formatFCFA(prixVente.pvIdeal) }} F</div>
          </div>
          <div class="res-item">
            <div class="res-label">Impôt DGI ({{ prixVente.tauxImpotApplique }}%)</div>
            <div class="res-val">{{ formatFCFA(prixVente.impotSurVente) }} F</div>
          </div>
          <div class="res-item">
            <div class="res-label">Bénéfice Réel Net / article</div>
            <div class="res-val">{{ formatFCFA(prixVente.margeReelle) }} F</div>
          </div>
        </div>
      </div>

      <!-- 4. STATUT -->
      <div v-if="activeTab === 'statut'" class="tool-pane">
        <div class="status-box">
          <div class="status-icon-svg">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="32" height="32" style="color: #0369a1;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z"/></svg>
          </div>
          <div class="status-content">
            <h4>Recommandation : {{ recommandation.statut }}</h4>
            <p>{{ recommandation.raison }}</p>
            <div v-if="params" class="status-alert">
              Ce conseil est basé sur votre CA actuel de {{ formatFCFA(params.ca) }} FCFA.
            </div>
            <div v-else class="status-alert">
              Faites une simulation pour une recommandation personnalisée.
            </div>
          </div>
        </div>
      </div>

      <!-- 5. EMPRUNT -->
      <div v-if="activeTab === 'emprunt'" class="tool-pane">
        <div class="tool-intro">
          <h4>Simulation de Crédit</h4>
          <p>Estimez votre capacité d'emprunt ou calculez vos mensualités pour un projet spécifique.</p>
        </div>
        
        <div v-if="!resultats" class="empty-state">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="48" height="48" style="color: #cbd5e1; margin-bottom: 1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
           <p>Lancez une simulation d'impôt pour débloquer l'analyse de capacité basée sur vos bénéfices réels.</p>
        </div>
        
        <div v-else>
          <div class="calc-row grid-2">
            <div class="input-group">
              <label>Durée du prêt</label>
              <select v-model="dureeEmprunt">
                <option :value="1">1 an (12 mois)</option>
                <option :value="2">2 ans (24 mois)</option>
                <option :value="3">3 ans (36 mois)</option>
                <option :value="5">5 ans (60 mois)</option>
              </select>
            </div>
            <div class="input-group">
              <label>Montant du projet (Optionnel)</label>
              <input 
                type="text" 
                :value="formatInput(montantSouhaite)"
                @input="montantSouhaite = parseInput($event)"
                placeholder="Ex: 5 000 000"
              >
            </div>
          </div>

          <div class="results-grid">
            <!-- Capacité Maximale -->
            <div class="res-item highlight" :class="{ 'error-border': emprunt.capitalEstimé <= 0 }">
              <div class="res-label">Capacité d'Emprunt Max</div>
              <div v-if="emprunt.capitalEstimé > 0">
                <div class="res-val">{{ formatFCFA(emprunt.capitalEstimé) }} F</div>
                <div class="res-sub">Mensualité max : {{ formatFCFA(emprunt.mensualiteMax) }} F</div>
              </div>
              <div v-else>
                <div class="res-val text-danger">0 F</div>
                <div class="res-sub text-danger">⚠️ Votre activité est actuellement en déficit. Aucune banque ne pourra vous prêter dans cette situation.</div>
              </div>
            </div>
            
            <!-- Simulation Manuelle -->
            <div v-if="montantSouhaite > 0 && emprunt.capitalEstimé > 0" class="res-item">
              <div class="res-label">Mensualité pour {{ formatFCFA(montantSouhaite) }} F</div>
              <div class="res-val" style="color: #2563eb;">{{ formatFCFA(calculerMensualiteSimulee) }} F</div>
              <div class="res-sub" :class="{ 'text-danger': calculerMensualiteSimulee > emprunt.mensualiteMax }">
                {{ calculerMensualiteSimulee > emprunt.mensualiteMax ? '⚠️ Dépasse votre capacité' : '✅ Compatible avec vos revenus' }}
              </div>
            </div>
          </div>
          
          <div class="tool-note">Estimation basée sur un taux d'intérêt moyen de 12% (norme bancaire PME).</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.outils-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 1.5rem;
}

.outils-header {
  padding: 1.25rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.oh-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.oh-title h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
}

.oh-icon-bg {
  width: 32px;
  height: 32px;
  background: #2563eb;
  color: white;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(37,99,235,0.2);
}

.tabs-nav {
  display: flex;
  gap: 0.625rem;
  overflow-x: auto;
  padding-bottom: 4px;
}

.tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  min-width: 105px;
  transition: all 0.2s;
  color: #64748b;
}

.tab-btn.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #2563eb;
  box-shadow: 0 2px 4px rgba(37,99,235,0.1);
}

.t-icon-svg { 
  width: 20px; height: 20px; 
  display: flex; align-items: center; justify-content: center;
}
.t-icon-svg :deep(svg) { width: 20px; height: 20px; }

.t-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; white-space: nowrap; }

.outils-body {
  padding: 1.75rem;
  min-height: 280px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem 1rem;
  color: #94a3b8;
  font-size: 0.85rem;
  min-height: 200px;
}

.tool-pane {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.tool-intro { margin-bottom: 1.5rem; }
.tool-intro h4 { margin: 0 0 0.5rem; color: #1e293b; font-size: 1.1rem; font-weight: 800; }
.tool-intro p { margin: 0; color: #64748b; font-size: 0.88rem; line-height: 1.5; }

.calc-row { margin-bottom: 1.75rem; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }

.input-group { display: flex; flex-direction: column; gap: 0.5rem; }
.input-group label { font-size: 0.78rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.02em; }
.input-group input, .input-group select {
  padding: 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  width: 100%;
  background: white;
  transition: all 0.2s;
}
.input-group input:focus { border-color: #2563eb; outline: none; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1.25rem;
  margin-bottom: 1.25rem;
}

.res-item {
  background: #f8fafc;
  padding: 1.25rem;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
}

.res-item.highlight {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.res-label { font-size: 0.75rem; font-weight: 600; color: #64748b; margin-bottom: 0.625rem; text-transform: uppercase; }
.res-val { font-size: 1.25rem; font-weight: 900; color: #0f172a; }
.res-sub { font-size: 0.7rem; font-weight: 700; margin-top: 0.5rem; color: #64748b; }

.text-danger { color: #ef4444 !important; }
.error-border { border-color: #fecaca !important; background-color: #fff1f2 !important; }

.tool-note { font-size: 0.75rem; color: #94a3b8; font-style: italic; margin-top: 0.5rem; }

/* Score ONDA Styles */
.score-container { display: flex; gap: 2.5rem; align-items: center; }
.score-circle {
  width: 130px; height: 130px;
  border-radius: 50%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  border: 10px solid #e2e8f0;
  flex-shrink: 0;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
}
.score-circle.a { border-color: #22c55e; background: #f0fdf4; color: #166534; }
.score-circle.b { border-color: #eab308; background: #fefce8; color: #854d0e; }
.score-circle.c { border-color: #ef4444; background: #fef2f2; color: #991b1b; }

.score-val { font-size: 2.5rem; font-weight: 900; line-height: 1; }
.score-grade { font-size: 0.75rem; font-weight: 800; margin-top: 4px; }

.crit-list { list-style: none; padding: 0; margin: 1rem 0; }
.crit-list li { font-size: 0.9rem; font-weight: 600; color: #334155; margin-bottom: 0.5rem; display: flex; align-items: center; }
.score-desc { font-size: 0.85rem; color: #64748b; line-height: 1.4; }

/* Status Box */
.status-box { display: flex; gap: 1.5rem; background: #f0f9ff; padding: 1.5rem; border-radius: 16px; border: 1px solid #bae6fd; }
.status-icon-svg { width: 48px; height: 48px; background: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(186,230,253,0.3); flex-shrink: 0; }
.status-content h4 { margin: 0 0 0.5rem; font-size: 1.1rem; color: #0c4a6e; }
.status-content p { margin: 0; font-size: 0.9rem; color: #0369a1; line-height: 1.5; }
.status-alert { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #bae6fd; font-size: 0.8rem; color: #0369a1; font-weight: 700; }

@media (max-width: 640px) {
  .score-container { flex-direction: column; gap: 1.5rem; text-align: center; }
  .grid-2 { grid-template-columns: 1fr; }
  .tabs-nav { padding-bottom: 8px; }
  .tab-btn { min-width: 95px; padding: 0.6rem 0.4rem; }
  .outils-body { padding: 1.25rem; }
}
.btn-bank-cta {
  background: #16a34a;
  color: white;
  border: none;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-bank-cta:hover {
  background: #15803d;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.2);
}
</style>
