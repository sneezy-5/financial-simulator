<script setup>
import { ref, computed, onMounted } from 'vue'
import { localDb } from '../../services/localDatabase.js'
import { showToast } from '../../services/toast.js'

const employees = ref([])
onMounted(async () => {
  try { employees.value = await localDb.getEmployees() } catch (e) { employees.value = [] }
})

// ── State
const currentWeek = ref(getWeekStart(new Date()))
const planning = ref(JSON.parse(localStorage.getItem('onda_planning') || '{}'))
const save = () => localStorage.setItem('onda_planning', JSON.stringify(planning.value))

function getWeekStart(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // lundi
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date.toISOString().split('T')[0]
}

const prevWeek = () => {
  const d = new Date(currentWeek.value)
  d.setDate(d.getDate() - 7)
  currentWeek.value = d.toISOString().split('T')[0]
}
const nextWeek = () => {
  const d = new Date(currentWeek.value)
  d.setDate(d.getDate() + 7)
  currentWeek.value = d.toISOString().split('T')[0]
}

const weekDays = computed(() => {
  const days = []
  const start = new Date(currentWeek.value)
  const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push({
      key: d.toISOString().split('T')[0],
      label: JOURS[i],
      num: d.getDate(),
      isWeekend: i >= 5
    })
  }
  return days
})

const weekLabel = computed(() => {
  const start = new Date(currentWeek.value)
  const end = new Date(currentWeek.value)
  end.setDate(end.getDate() + 6)
  return `${start.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} → ${end.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`
})

const CRENEAUX = [
  { id: 'matin', label: 'Matin', short: 'M', color: '#2563eb', heures: 4 },
  { id: 'aprem', label: 'Après-midi', short: 'AM', color: '#0ea5e9', heures: 4 },
  { id: 'soir', label: 'Soir / Nuit', short: 'N', color: '#7c3aed', heures: 8 },
  { id: 'repos', label: 'Repos', short: 'R', color: '#94a3b8', heures: 0 },
  { id: 'conge', label: 'Congé', short: 'C', color: '#10b981', heures: 0 },
  { id: 'absence', label: 'Absence', short: 'A', color: '#ef4444', heures: 0 },
]

const creneauInfo = (id) => CRENEAUX.find(c => c.id === id) || { label: id, color: '#e2e8f0', heures: 0, short: '?' }

const getCell = (empId, dayKey) => {
  return (planning.value[empId]?.[dayKey]) || null
}

const setCell = (empId, dayKey, creneauId) => {
  if (!planning.value[empId]) planning.value[empId] = {}
  if (planning.value[empId][dayKey] === creneauId) {
    delete planning.value[empId][dayKey]
  } else {
    planning.value[empId][dayKey] = creneauId
  }
  save()
}

const totalHeureSemaine = (empId) => {
  return weekDays.value.reduce((sum, day) => {
    const cell = getCell(empId, day.key)
    if (!cell) return sum
    return sum + (creneauInfo(cell).heures || 0)
  }, 0)
}

// Sélection du créneau à placer
const selectedCreneau = ref('matin')

// Stats de la semaine
const statsWeek = computed(() => {
  const total = employees.value.length * 5 // jours ouvrables
  const planifies = employees.value.reduce((sum, emp) => {
    return sum + weekDays.value.filter(d => !d.isWeekend && getCell(emp.id, d.key)).length
  }, 0)
  return { total, planifies, taux: total > 0 ? Math.round(planifies / total * 100) : 0 }
})
</script>

<template>
  <div class="plan-wrapper">
    <!-- Header -->
    <div class="pl-header">
      <div class="pl-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </div>
      <div>
        <h2 class="pl-title">Planning Hebdomadaire</h2>
        <p class="pl-sub">Semaine du {{ weekLabel }} · {{ employees.length }} employé(s) · {{ statsWeek.planifies }}/{{ statsWeek.total }} créneaux saisis</p>
      </div>
    </div>

    <!-- Nav semaine + légende créneaux -->
    <div class="pl-controls">
      <div class="week-nav">
        <button class="nav-btn" @click="prevWeek">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="week-label">{{ weekLabel }}</span>
        <button class="nav-btn" @click="nextWeek">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <!-- Sélecteur créneau actif -->
      <div class="creneau-selector">
        <span style="font-size:0.78rem;font-weight:600;color:#475569;margin-right:0.5rem;">Poser :</span>
        <button
          v-for="c in CRENEAUX"
          :key="c.id"
          class="creneau-pick-btn"
          :class="{ active: selectedCreneau === c.id }"
          :style="selectedCreneau===c.id ? `background:${c.color};color:white;border-color:${c.color}` : `border-color:${c.color}20;color:${c.color}`"
          @click="selectedCreneau = c.id"
        >{{ c.label }}</button>
      </div>
    </div>

    <!-- Grille planning -->
    <div class="pl-table-wrap">
      <div v-if="employees.length === 0" class="empty-state">Ajoutez des employés dans l'Annuaire Employés pour construire le planning.</div>
      <table v-else class="pl-table">
        <thead>
          <tr>
            <th class="pl-th-emp">Employé</th>
            <th v-for="day in weekDays" :key="day.key" class="pl-th-day" :class="{weekend: day.isWeekend}">
              <span class="th-jour">{{ day.label }}</span>
              <span class="th-num">{{ day.num }}</span>
            </th>
            <th class="pl-th-total">Total h</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="emp in employees" :key="emp.id" class="pl-row">
            <td class="pl-td-emp">
              <div class="emp-name">{{ emp.prenom }} {{ emp.nom }}</div>
              <div class="emp-poste">{{ emp.poste || '—' }}</div>
            </td>
            <td
              v-for="day in weekDays"
              :key="day.key"
              class="pl-td-cell"
              :class="{ weekend: day.isWeekend, 'has-creneau': !!getCell(emp.id, day.key) }"
              @click="setCell(emp.id, day.key, selectedCreneau)"
              :style="getCell(emp.id, day.key) ? `background:${creneauInfo(getCell(emp.id, day.key)).color}20; border-color:${creneauInfo(getCell(emp.id, day.key)).color}40` : ''"
              :title="getCell(emp.id, day.key) ? creneauInfo(getCell(emp.id, day.key)).label : 'Cliquez pour assigner'"
            >
              <span v-if="getCell(emp.id, day.key)" class="cell-chip" :style="`background:${creneauInfo(getCell(emp.id, day.key)).color};color:white`">
                {{ creneauInfo(getCell(emp.id, day.key)).short }}
              </span>
            </td>
            <td class="pl-td-total" :class="{ 'over-legal': totalHeureSemaine(emp.id) > 48 }">
              {{ totalHeureSemaine(emp.id) }}h
              <span v-if="totalHeureSemaine(emp.id) > 48" title="Dépasse 48h legales" style="color:#ef4444;margin-left:2px;">⚠</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Légende -->
    <div class="pl-legend">
      <span v-for="c in CRENEAUX" :key="c.id" class="legend-item">
        <span class="legend-dot" :style="{background:c.color}"></span>{{ c.label }}{{ c.heures > 0 ? ` (${c.heures}h)` : '' }}
      </span>
      <span class="legend-item" style="color:#ef4444;font-weight:600;margin-left:auto;">⚠ = Dépasse 48h/semaine (légal)</span>
    </div>
    <p style="color:#94a3b8;font-size:0.76rem;margin:0.5rem 0 0;">Cliquez sur une cellule pour assigner le créneau sélectionné. Cliquez à nouveau pour l'effacer.</p>
  </div>
</template>

<style scoped>
.plan-wrapper { padding: 1.5rem; }
.pl-header { display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;padding:1.1rem 1.4rem;background:linear-gradient(135deg,#78350f 0%,#f59e0b 100%);border-radius:14px;color:white; }
.pl-icon { width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
.pl-title { margin:0;font-size:1.05rem;font-weight:800; }
.pl-sub { margin:0;font-size:0.78rem;opacity:0.8; }
.pl-controls { display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem;flex-wrap:wrap; }
.week-nav { display:flex;align-items:center;gap:0.6rem;background:white;border:1px solid #e2e8f0;border-radius:10px;padding:0.35rem 0.6rem; }
.nav-btn { width:28px;height:28px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center; }
.nav-btn:hover { background:#e2e8f0; }
.week-label { font-size:0.84rem;font-weight:700;color:#334155; }
.creneau-selector { display:flex;align-items:center;flex-wrap:wrap;gap:0.4rem; }
.creneau-pick-btn { padding:0.3rem 0.7rem;border:1.5px solid;border-radius:20px;font-size:0.76rem;font-weight:700;cursor:pointer;background:white;transition:all 0.15s; }
.pl-table-wrap { overflow-x:auto;border:1px solid #e2e8f0;border-radius:12px; }
.pl-table { width:100%;border-collapse:collapse;background:white; }
.pl-th-emp { padding:0.75rem 1rem;text-align:left;font-size:0.76rem;font-weight:700;color:#475569;background:#f8fafc;border-bottom:1px solid #e2e8f0;min-width:140px;border-right:2px solid #e2e8f0; }
.pl-th-day { padding:0.5rem 0.4rem;text-align:center;font-size:0.72rem;font-weight:700;color:#334155;background:#f8fafc;border-bottom:1px solid #e2e8f0;min-width:60px; }
.pl-th-day.weekend { background:#fff7ed;color:#f59e0b; }
.pl-th-total { padding:0.5rem;text-align:center;font-size:0.72rem;font-weight:700;color:#475569;background:#f8fafc;border-bottom:1px solid #e2e8f0;border-left:2px solid #e2e8f0;min-width:55px; }
.th-jour { display:block;font-weight:800; }
.th-num { font-size:0.68rem;color:#94a3b8; }
.pl-row { border-bottom:1px solid #f8fafc; }
.pl-row:hover { background:#fafafa; }
.pl-td-emp { padding:0.65rem 1rem;border-right:2px solid #e2e8f0; }
.emp-name { font-weight:700;color:#1e293b;font-size:0.84rem; }
.emp-poste { font-size:0.73rem;color:#64748b; }
.pl-td-cell { padding:0.3rem 0.35rem;text-align:center;border:1px solid transparent;cursor:pointer;transition:all 0.1s;vertical-align:middle; }
.pl-td-cell:hover { background:#f1f5f9; }
.pl-td-cell.weekend { background:#fff7ed08; }
.pl-td-cell.has-creneau { border-radius:4px; }
.cell-chip { display:inline-block;padding:0.15rem 0.45rem;border-radius:5px;font-size:0.7rem;font-weight:800; }
.pl-td-total { padding:0.5rem;text-align:center;font-size:0.84rem;font-weight:800;color:#334155;border-left:2px solid #e2e8f0; }
.pl-td-total.over-legal { color:#ef4444; }
.pl-legend { display:flex;flex-wrap:wrap;gap:0.75rem;margin-top:1rem;font-size:0.75rem;align-items:center; }
.legend-item { display:flex;align-items:center;gap:0.3rem;color:#64748b; }
.legend-dot { width:10px;height:10px;border-radius:50%;flex-shrink:0; }
.empty-state { text-align:center;padding:3rem;color:#94a3b8;font-size:0.85rem; }
</style>
