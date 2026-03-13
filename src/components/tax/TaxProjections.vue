<script setup>
import { ref, computed } from 'vue'
import { formatFCFA } from '../../services/taxService.js'

const props = defineProps({ projections: Array, params: Object })

const scenarioActif = ref('realiste')
const scenarioData = computed(() => props.projections?.find(p => p.scenario === scenarioActif.value))
const tousScenarios = computed(() => props.projections || [])
const annees = computed(() => scenarioData.value?.annees || [])
const maxCA = computed(() => Math.max(...tousScenarios.value.flatMap(s => s.annees.map(a => a.ca)), 1))

function pct(val) { return Math.min(100, Math.max(0, (val / maxCA.value) * 100)) }

const SCENARIO_COLORS = { pessimiste: '#dc2626', realiste: '#2563eb', optimiste: '#15803d' }
</script>

<template>
  <div class="proj-card">
    <div class="proj-head">
      <div class="section-title">Projections financières</div>
      <div class="scenario-tabs">
        <button
          v-for="s in tousScenarios" :key="s.scenario"
          class="tab-btn"
          :class="{ active: scenarioActif === s.scenario }"
          :style="scenarioActif === s.scenario ? { color: SCENARIO_COLORS[s.scenario], borderColor: SCENARIO_COLORS[s.scenario] + '50', background: SCENARIO_COLORS[s.scenario] + '08' } : {}"
          @click="scenarioActif = s.scenario"
        >{{ s.label }}</button>
      </div>
    </div>

    <!-- Graphique -->
    <div class="chart-area">
      <div class="chart-y-labels">
        <span>Max</span>
        <span>Moy</span>
        <span>0</span>
      </div>
      <div class="chart-bars">
        <div v-for="a in annees" :key="a.annee" class="bar-col">
          <div class="bars-row">
            <div class="bar b-ca" :style="{ height: pct(a.ca) + '%' }" :title="'CA : ' + formatFCFA(a.ca) + ' FCFA'"></div>
            <div class="bar b-charges" :style="{ height: pct(a.totalCharges) + '%' }" :title="'Charges : ' + formatFCFA(a.totalCharges) + ' FCFA'"></div>
            <div class="bar b-impot" :style="{ height: pct(a.impot) + '%' }" :title="'Impôt : ' + formatFCFA(a.impot) + ' FCFA'"></div>
            <div class="bar b-benef" :style="{ height: Math.max(0, pct(a.beneficeNet)) + '%' }" :title="'Bénéfice net : ' + formatFCFA(a.beneficeNet) + ' FCFA'"></div>
          </div>
          <div class="bar-label">{{ a.annee }}</div>
          <div v-if="a.changementRegime" class="regime-warning" title="Changement de régime fiscal">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
          </div>
        </div>
      </div>
      <div class="chart-legend">
        <span class="leg"><span class="dot" style="background:#1d4ed8"></span>CA</span>
        <span class="leg"><span class="dot" style="background:#f97316"></span>Charges</span>
        <span class="leg"><span class="dot" style="background:#dc2626"></span>Impôt</span>
        <span class="leg"><span class="dot" style="background:#15803d"></span>Bénéfice net</span>
      </div>
    </div>

    <!-- Tableau -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Année</th>
            <th class="r">CA projeté</th>
            <th class="r">Charges</th>
            <th>Régime</th>
            <th class="r">Impôt</th>
            <th class="r">Bénéfice net</th>
            <th class="r">Marge</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in annees" :key="a.annee" :class="{ 'row-alert': a.changementRegime }">
            <td>
              <strong>{{ a.annee }}</strong>
              <div v-if="a.changementRegime" class="change-note">Nouveau régime</div>
            </td>
            <td class="r fw">{{ formatFCFA(a.ca) }}</td>
            <td class="r muted">{{ formatFCFA(a.totalCharges) }}</td>
            <td><span class="regime-badge">{{ a.regime }}</span></td>
            <td class="r red">{{ formatFCFA(a.impot) }}</td>
            <td class="r fw" :class="a.beneficeNet >= 0 ? 'green' : 'red'">{{ formatFCFA(a.beneficeNet) }}</td>
            <td class="r">
              <span class="marge" :class="a.margeNette < 10 ? 'low' : a.margeNette < 20 ? 'mid' : 'hi'">{{ a.margeNette.toFixed(1) }}%</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Comparaison 3 scénarios -->
    <div class="compare-section">
      <div class="section-title">Comparaison des 3 scénarios — Année {{ new Date().getFullYear() + 4 }}</div>
      <div class="compare-grid">
        <div v-for="s in tousScenarios" :key="s.scenario" class="compare-card"
          :style="{ borderLeftColor: SCENARIO_COLORS[s.scenario] }">
          <div class="compare-label" :style="{ color: SCENARIO_COLORS[s.scenario] }">{{ s.label }}</div>
          <div class="compare-row">
            <span class="cr-key">CA final</span>
            <span class="cr-val">{{ formatFCFA(s.annees[s.annees.length - 1]?.ca) }} FCFA</span>
          </div>
          <div class="compare-row">
            <span class="cr-key">Impôt</span>
            <span class="cr-val red">{{ formatFCFA(s.annees[s.annees.length - 1]?.impot) }} FCFA</span>
          </div>
          <div class="compare-row">
            <span class="cr-key">Bénéfice net</span>
            <span class="cr-val green">{{ formatFCFA(s.annees[s.annees.length - 1]?.beneficeNet) }} FCFA</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.proj-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }

.proj-head { padding: 1.25rem 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid #f1f5f9; }
.section-title { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }

.scenario-tabs { display: flex; gap: 0.35rem; }
.tab-btn { padding: 0.35rem 0.875rem; border: 1px solid #e2e8f0; border-radius: 20px; background: white; font-size: 0.78rem; font-weight: 600; color: #6b7280; cursor: pointer; transition: all 0.15s; }
.tab-btn:hover { border-color: #94a3b8; }

/* Chart */
.chart-area { padding: 1.25rem 1.5rem 0.75rem; }
.chart-bars { display: flex; align-items: flex-end; gap: 0.75rem; height: 160px; padding-bottom: 1.5rem; border-bottom: 1px solid #e2e8f0; position: relative; }
.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; }
.bars-row { display: flex; align-items: flex-end; gap: 2px; width: 100%; height: 140px; }
.bar { flex: 1; min-height: 2px; border-radius: 3px 3px 0 0; transition: height 0.5s ease; }
.b-ca { background: #1d4ed8; }
.b-charges { background: #f97316; }
.b-impot { background: #dc2626; }
.b-benef { background: #15803d; }
.bar-label { position: absolute; bottom: 0; font-size: 0.68rem; font-weight: 600; color: #64748b; }
.regime-warning { position: absolute; top: -18px; color: #d97706; }
.chart-y-labels { display: flex; flex-direction: column; justify-content: space-between; height: 140px; margin-bottom: 1.5rem; font-size: 0.65rem; color: #94a3b8; float: left; padding-right: 0.35rem; }
.chart-legend { display: flex; gap: 1rem; flex-wrap: wrap; padding-top: 0.625rem; }
.leg { display: flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; color: #64748b; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

/* Table */
.table-wrap { overflow-x: auto; padding: 0 1.5rem 1rem; border-top: 1px solid #f1f5f9; }
table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
th { padding: 0.625rem 0.5rem; text-align: left; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; background: #f8fafc; }
td { padding: 0.6rem 0.5rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #374151; }
tr:hover td { background: #f8fafc; }
tr.row-alert td { background: #fffbeb; }
.r { text-align: right; }
.fw { font-weight: 600; }
.muted { color: #9ca3af; }
.red { color: #b91c1c; }
.green { color: #15803d; }
.change-note { font-size: 0.65rem; color: #d97706; margin-top: 1px; }
.regime-badge { font-size: 0.7rem; background: #f1f5f9; color: #475569; padding: 0.15rem 0.5rem; border-radius: 4px; white-space: nowrap; }
.marge { font-size: 0.75rem; padding: 0.2rem 0.45rem; border-radius: 4px; font-weight: 600; }
.marge.low { background: #fee2e2; color: #b91c1c; }
.marge.mid { background: #fefce8; color: #b45309; }
.marge.hi { background: #f0fdf4; color: #15803d; }

/* Compare */
.compare-section { padding: 1.25rem 1.5rem; border-top: 1px solid #f1f5f9; }
.compare-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 0.75rem; }
.compare-card { border: 1px solid #e2e8f0; border-left: 3px solid; border-radius: 8px; padding: 0.875rem; }
.compare-label { font-size: 0.8rem; font-weight: 700; margin-bottom: 0.5rem; }
.compare-row { display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.3rem; }
.cr-key { color: #6b7280; }
.cr-val { font-weight: 600; color: #374151; }

@media (max-width: 640px) {
  .compare-grid { grid-template-columns: 1fr; }
  .scenario-tabs { flex-wrap: wrap; }
  .proj-head { flex-direction: column; align-items: flex-start; }
}
</style>
