<script setup>
import { ref, computed, onMounted } from 'vue'
import { localDb } from '../../services/localDatabase.js'
import { showToast } from '../../services/toast.js'
import EmployeeSelect from './EmployeeSelect.vue'

// ── Données
const employees = ref([])
const absences = ref(JSON.parse(localStorage.getItem('onda_conges') || '[]'))

const TYPES_CONGES = [
  { id: 'annuel', label: 'Congé annuel', color: '#2563eb', jours_par_an: 26 },
  { id: 'maladie', label: 'Maladie', color: '#dc2626', jours_par_an: null },
  { id: 'maternite', label: 'Maternité / Paternité', color: '#ec4899', jours_par_an: null },
  { id: 'sans_solde', label: 'Sans solde', color: '#64748b', jours_par_an: null },
  { id: 'ferie', label: 'Jour férié', color: '#f59e0b', jours_par_an: null },
  { id: 'autre', label: 'Autre', color: '#8b5cf6', jours_par_an: null },
]

const saveAbsences = () => localStorage.setItem('onda_conges', JSON.stringify(absences.value))

onMounted(async () => {
  try { employees.value = await localDb.getEmployees() } catch (e) { employees.value = [] }
})

// ── Formulaire ajout
const showForm = ref(false)
const form = ref({
  employeeId: '',
  type: 'annuel',
  dateDebut: '',
  dateFin: '',
  commentaire: ''
})

const handleEmployeeSelect = (e) => {
  form.value.employeeId = e ? e.id : ''
}

const calcJours = (d1Str, d2Str) => {
  if (!d1Str || !d2Str) return 0
  const d1 = new Date(d1Str), d2 = new Date(d2Str)
  if (isNaN(d1) || isNaN(d2)) return 0
  return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1)
}

const joursForm = computed(() => calcJours(form.value.dateDebut, form.value.dateFin))

const addAbsence = () => {
  if (!form.value.employeeId) { showToast('Sélectionnez un employé', 'error'); return }
  if (!form.value.dateDebut || !form.value.dateFin) { showToast('Dates requises', 'error'); return }
  const emp = employees.value.find(e => e.id === form.value.employeeId)
  const entry = {
    id: Date.now(),
    employeeId: form.value.employeeId,
    employeNom: emp ? `${emp.prenom || ''} ${emp.nom || ''}`.trim() : 'Inconnu',
    type: form.value.type,
    dateDebut: form.value.dateDebut,
    dateFin: form.value.dateFin,
    jours: joursForm.value,
    commentaire: form.value.commentaire,
  }
  absences.value.unshift(entry)
  saveAbsences()
  showToast(`Absence enregistrée : ${joursForm.value} jour(s)`, 'success')
  form.value = { employeeId: '', type: 'annuel', dateDebut: '', dateFin: '', commentaire: '' }
  showForm.value = false
}

const removeAbsence = (id) => {
  absences.value = absences.value.filter(a => a.id !== id)
  saveAbsences()
  showToast('Absence supprimée', 'success')
}

// ── Vue calendrier mensuel
const viewMois = ref(new Date().getMonth())
const viewAnnee = ref(new Date().getFullYear())
const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const prevMonth = () => { if (viewMois.value === 0) { viewMois.value = 11; viewAnnee.value-- } else viewMois.value-- }
const nextMonth = () => { if (viewMois.value === 11) { viewMois.value = 0; viewAnnee.value++ } else viewMois.value++ }

const calendarDays = computed(() => {
  const firstDay = new Date(viewAnnee.value, viewMois.value, 1).getDay()
  const daysInMonth = new Date(viewAnnee.value, viewMois.value + 1, 0).getDate()
  const start = firstDay === 0 ? 6 : firstDay - 1 // lundi = 0
  const days = []
  for (let i = 0; i < start; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  return days
})

const absencesForDay = (day) => {
  if (!day) return []
  const date = new Date(viewAnnee.value, viewMois.value, day)
  return absences.value.filter(a => {
    const d1 = new Date(a.dateDebut), d2 = new Date(a.dateFin)
    return date >= d1 && date <= d2
  })
}

const typeInfo = (typeId) => TYPES_CONGES.find(t => t.id === typeId) || { color: '#64748b', label: typeId }

// ── Soldes par employé (congés annuels)
const soldesConges = computed(() => {
  return employees.value.map(emp => {
    const droits = 26
    const pris = absences.value.filter(a => a.employeeId === emp.id && a.type === 'annuel')
      .reduce((sum, a) => sum + (a.jours || 0), 0)
    const restant = Math.max(0, droits - pris)
    return { emp, droits, pris, restant }
  })
})

// ── Filtre par employé dans la liste
const filterEmployee = ref('')
const listEmpSearch = ref('')
const listFilteredEmployees = computed(() => {
  const q = listEmpSearch.value.toLowerCase()
  if (!q) return employees.value
  return employees.value.filter(e => 
    (e.nom && e.nom.toLowerCase().includes(q)) || 
    (e.prenom && e.prenom.toLowerCase().includes(q))
  )
})

const filteredAbsences = computed(() => {
  if (!filterEmployee.value) return absences.value
  return absences.value.filter(a => a.employeeId === filterEmployee.value)
})

// ── Onglets
const activeTab = ref('calendar') // 'calendar' | 'list' | 'soldes'
const expandedSolde = ref(null)

const toggleSolde = (id) => {
  expandedSolde.value = expandedSolde.value === id ? null : id
}

const formatDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('fr-FR')
}
</script>

<template>
  <div class="conges-wrapper">
    <!-- Header -->
    <div class="conges-header">
      <div class="ch-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
      </div>
      <div>
        <h2 class="ch-title">Absences &amp; Congés</h2>
        <p class="ch-sub">Calendrier mensuel · Soldes · {{ employees.length }} employé(s)</p>
      </div>
      <button class="ch-add-btn" @click="showForm = !showForm">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Ajouter une absence
      </button>
    </div>

    <!-- Formulaire d'ajout -->
    <div v-if="showForm" class="conges-form-card">
      <h3 style="margin:0 0 1rem;font-size:0.9rem;font-weight:700;color:#334155;">Enregistrer une absence / congé</h3>
      <div class="form-grid">
        <div class="form-field">
          <label class="fl">Employé</label>
          <div style="margin-top: 0.25rem;">
            <EmployeeSelect 
              :employees="employees" 
              @select="handleEmployeeSelect" 
              placeholder="Rechercher un employé..." 
            />
            <div v-if="form.employeeId" style="margin-top: 0.5rem; padding: 0.5rem; background: #f8fafc; border-radius: 6px; font-size: 0.8rem; color: #334155; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
              <span><strong>Sélectionné :</strong> {{ employees.find(e => e.id === form.employeeId)?.prenom }} {{ employees.find(e => e.id === form.employeeId)?.nom }}</span>
              <button @click="handleEmployeeSelect(null)" style="font-size: 0.75rem; color: #64748b; background: none; border: none; cursor: pointer; text-decoration: underline;">Changer</button>
            </div>
          </div>
        </div>
        <div class="form-field">
          <label class="fl">Type</label>
          <select class="fi" v-model="form.type">
            <option v-for="t in TYPES_CONGES" :key="t.id" :value="t.id">{{ t.label }}</option>
          </select>
        </div>
        <div class="form-field">
          <label class="fl">Date de début</label>
          <input type="date" class="fi" v-model="form.dateDebut" />
        </div>
        <div class="form-field">
          <label class="fl">Date de fin</label>
          <input type="date" class="fi" v-model="form.dateFin" :min="form.dateDebut" />
        </div>
        <div class="form-field" style="grid-column:1/-1;">
          <label class="fl">Commentaire (facultatif)</label>
          <input type="text" class="fi" v-model="form.commentaire" placeholder="Ex: Certificat médical fourni..." />
        </div>
      </div>
      <div class="form-footer">
        <span v-if="joursForm > 0" class="jours-badge">{{ joursForm }} jour(s)</span>
        <button class="btn-cancel" @click="showForm = false">Annuler</button>
        <button class="btn-save" @click="addAbsence">Enregistrer</button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="conges-tabs">
      <button :class="['tab-btn', { active: activeTab==='calendar' }]" @click="activeTab='calendar'">Calendrier</button>
      <button :class="['tab-btn', { active: activeTab==='list' }]" @click="activeTab='list'">Liste des absences</button>
      <button :class="['tab-btn', { active: activeTab==='soldes' }]" @click="activeTab='soldes'">Soldes Congés</button>
    </div>

    <!-- CALENDRIER -->
    <div v-if="activeTab==='calendar'" class="calendar-section">
      <div class="cal-nav">
        <button class="cal-nav-btn" @click="prevMonth">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="cal-month-label">{{ MOIS[viewMois] }} {{ viewAnnee }}</span>
        <button class="cal-nav-btn" @click="nextMonth">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="cal-grid-header">
        <span v-for="j in ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']" :key="j" class="cal-day-name">{{ j }}</span>
      </div>
      <div class="cal-grid">
        <div v-for="(day, idx) in calendarDays" :key="idx" class="cal-cell" :class="{ empty: !day }">
          <span v-if="day" class="cal-date">{{ day }}</span>
          <div v-if="day" class="cal-events">
            <div v-for="abs in absencesForDay(day)" :key="abs.id" class="cal-event" :style="{ background: typeInfo(abs.type).color + '22', color: typeInfo(abs.type).color, borderLeft: `3px solid ${typeInfo(abs.type).color}` }" :title="`${abs.employeNom} — ${typeInfo(abs.type).label}`">
              {{ abs.employeNom.split(' ')[0] }}
            </div>
          </div>
        </div>
      </div>
      <!-- Légende -->
      <div class="cal-legend">
        <span v-for="t in TYPES_CONGES" :key="t.id" class="legend-item">
          <span class="legend-dot" :style="{background:t.color}"></span>{{ t.label }}
        </span>
      </div>
    </div>

    <!-- LISTE -->
    <div v-if="activeTab==='list'" class="list-section">
      <div style="display:flex;align-items:flex-start;gap:0.75rem;margin-bottom:0.85rem;flex-wrap:wrap;">
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; width:280px;">
          <div style="padding: 0.4rem; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
            <input type="text" class="fi" style="border:none; box-shadow:none; padding:0.2rem; outline:none;" v-model="listEmpSearch" placeholder="Filtrer les absences par employé..." />
          </div>
          <div style="max-height: 120px; overflow-y: auto;">
            <div class="emp-search-item" :class="{active: filterEmployee === ''}" @click="filterEmployee = ''">
              — Tous les employés —
            </div>
            <div v-for="emp in listFilteredEmployees" :key="emp.id" class="emp-search-item" :class="{active: filterEmployee === emp.id}" @click="filterEmployee = emp.id">
              {{ emp.prenom }} {{ emp.nom }}
            </div>
          </div>
        </div>
        <span style="color:#64748b;font-size:0.82rem;margin-top:0.5rem;">{{ filteredAbsences.length }} enregistrement(s)</span>
      </div>
      <div v-if="filteredAbsences.length === 0" class="empty-state">Aucune absence enregistrée.</div>
      <div v-else class="absence-list">
        <div v-for="a in filteredAbsences" :key="a.id" class="absence-item">
          <div class="ai-type-dot" :style="{background:typeInfo(a.type).color}"></div>
          <div class="ai-body">
            <div class="ai-emp">{{ a.employeNom }}</div>
            <div class="ai-detail">{{ typeInfo(a.type).label }} · Du {{ formatDate(a.dateDebut) }} au {{ formatDate(a.dateFin) }} · <strong>{{ a.jours }} j</strong></div>
            <div v-if="a.commentaire" class="ai-comment">{{ a.commentaire }}</div>
          </div>
          <button class="ai-remove" @click="removeAbsence(a.id)" title="Supprimer">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- SOLDES CONGÉS -->
    <div v-if="activeTab==='soldes'" class="soldes-section">
      <div v-if="employees.length === 0" class="empty-state">Annuaire vide. Ajoutez des employés dans l'Annuaire Employés.</div>
      <div v-else>
        <p style="color:#64748b;font-size:0.82rem;margin:0 0 1rem;">Droits : 26 jours ouvrables par an (norme UEMOA). Cliquez sur une carte pour voir l'historique des congés pris.</p>
        <div class="soldes-grid">
          <div v-for="s in soldesConges" :key="s.emp.id" class="solde-card" @click="toggleSolde(s.emp.id)" style="cursor: pointer; transition: all 0.2s;">
            <div class="sc-name">{{ s.emp.prenom }} {{ s.emp.nom }}</div>
            <div class="sc-poste">{{ s.emp.poste || 'Sans poste' }}</div>
            <div class="sc-bar-bg">
              <div class="sc-bar-fill" :style="{ width: Math.min(100, (s.pris/s.droits)*100) + '%', background: s.restant < 5 ? '#ef4444' : '#2563eb' }"></div>
            </div>
            <div class="sc-stats">
              <span class="sc-stat used">{{ s.pris }} j pris</span>
              <span class="sc-stat left" :style="{ color: s.restant < 5 ? '#ef4444' : '#10b981' }">{{ s.restant }} j restants</span>
            </div>
            
            <!-- Détails développés -->
            <div v-if="expandedSolde === s.emp.id" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed #e2e8f0;">
              <h4 style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin-bottom: 0.5rem;">Détail des congés annuels pris</h4>
              <div v-if="absences.filter(a => a.employeeId === s.emp.id && a.type === 'annuel').length === 0" style="font-size: 0.8rem; color: #64748b; font-style: italic;">
                Aucun congé annuel pris.
              </div>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.8rem; color: #334155;">
                <li v-for="abs in absences.filter(a => a.employeeId === s.emp.id && a.type === 'annuel')" :key="abs.id" style="margin-bottom: 0.3rem; display: flex; justify-content: space-between;">
                  <span>Du {{ formatDate(abs.dateDebut) }} au {{ formatDate(abs.dateFin) }}</span>
                  <span style="font-weight: 600;">{{ abs.jours }} j</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conges-wrapper { padding: 1.5rem; }
.conges-header {
  display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem;
  padding: 1.1rem 1.4rem; background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
  border-radius: 14px; color: white;
}
.ch-icon { width: 40px; height: 40px; background: rgba(255,255,255,0.15); border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ch-title { margin: 0; font-size: 1.05rem; font-weight: 800; }
.ch-sub { margin: 0; font-size: 0.78rem; opacity: 0.8; }
.ch-add-btn {
  margin-left: auto; display: flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 1rem; background: rgba(255,255,255,0.15); color: white;
  border: 1.5px solid rgba(255,255,255,0.3); border-radius: 9px; cursor: pointer;
  font-weight: 700; font-size: 0.82rem; transition: all 0.15s; white-space: nowrap;
}
.ch-add-btn:hover { background: rgba(255,255,255,0.25); }

.conges-form-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; }
.form-field { display: flex; flex-direction: column; gap: 3px; }
.fl { font-size: 0.76rem; font-weight: 600; color: #475569; }
.fi { padding: 0.55rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.84rem; background: #f8fafc; font-family: inherit; box-sizing: border-box; width: 100%; }
.fi:focus { outline: none; border-color: #2563eb; background: white; }
.form-footer { display: flex; align-items: center; gap: 0.75rem; margin-top: 1rem; justify-content: flex-end; }
.jours-badge { background: #dbeafe; color: #1d4ed8; padding: 0.25rem 0.75rem; border-radius: 20px; font-weight: 800; font-size: 0.82rem; margin-right: auto; }
.btn-cancel { padding: 0.5rem 1rem; border: 1px solid #e2e8f0; background: white; color: #64748b; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.84rem; }
.btn-save { padding: 0.5rem 1.25rem; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 0.84rem; }
.btn-save:hover { background: #1d4ed8; }

.conges-tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0; }
.tab-btn { padding: 0.6rem 1.1rem; border: none; background: none; cursor: pointer; font-weight: 600; font-size: 0.84rem; color: #64748b; border-bottom: 3px solid transparent; margin-bottom: -1px; transition: all 0.15s; }
.tab-btn.active { color: #2563eb; border-bottom-color: #2563eb; }
.tab-btn:hover { color: #1d4ed8; }

/* Calendar */
.calendar-section { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem; }
.cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
.cal-nav-btn { width: 32px; height: 32px; border: 1px solid #e2e8f0; border-radius: 8px; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.cal-nav-btn:hover { background: #f1f5f9; }
.cal-month-label { font-weight: 800; color: #1e293b; font-size: 1rem; }
.cal-grid-header { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 4px; }
.cal-day-name { text-align: center; font-size: 0.72rem; font-weight: 700; color: #94a3b8; padding: 0.25rem 0; text-transform: uppercase; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-cell { min-height: 68px; border: 1px solid #f1f5f9; border-radius: 6px; padding: 4px; background: #fafafa; }
.cal-cell.empty { background: transparent; border-color: transparent; }
.cal-date { font-size: 0.75rem; font-weight: 700; color: #475569; display: block; margin-bottom: 2px; }
.cal-events { display: flex; flex-direction: column; gap: 2px; }
.cal-event { font-size: 0.65rem; font-weight: 600; padding: 1px 4px; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
.cal-legend { display: flex; flex-wrap: wrap; gap: 0.65rem; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #f1f5f9; }
.legend-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; color: #64748b; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

/* List */
.list-section { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem; }
.absence-list { display: flex; flex-direction: column; gap: 0.5rem; }
.absence-item { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; }
.ai-type-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
.ai-body { flex: 1; }
.ai-emp { font-weight: 700; color: #1e293b; font-size: 0.88rem; }
.ai-detail { color: #64748b; font-size: 0.8rem; margin-top: 2px; }
.ai-comment { color: #94a3b8; font-size: 0.76rem; margin-top: 2px; font-style: italic; }
.ai-remove { padding: 0.25rem; border: none; background: none; cursor: pointer; color: #94a3b8; transition: color 0.15s; }
.ai-remove:hover { color: #ef4444; }
.empty-state { text-align: center; padding: 3rem; color: #94a3b8; font-size: 0.85rem; }

/* Soldes */
.soldes-section { }
.soldes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.85rem; }
.solde-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; }
.sc-name { font-weight: 800; color: #1e293b; font-size: 0.9rem; }
.sc-poste { color: #64748b; font-size: 0.76rem; margin-top: 1px; margin-bottom: 0.75rem; }
.sc-bar-bg { height: 6px; background: #f1f5f9; border-radius: 999px; overflow: hidden; margin-bottom: 0.5rem; }
.sc-bar-fill { height: 100%; border-radius: 999px; transition: width 0.5s ease; }
.sc-stats { display: flex; justify-content: space-between; }
.sc-stat { font-size: 0.78rem; font-weight: 700; }
.sc-stat.used { color: #475569; }

.emp-search-item {
  padding: 0.4rem 0.65rem; font-size: 0.8rem; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: all 0.1s;
}
.emp-search-item:hover { background: #f8fafc; }
.emp-search-item.active { background: #f3f4f6; border-left: 3px solid #2563eb; font-weight: 600; }

@media (max-width: 600px) {
  .conges-header { flex-direction: column; text-align: center; }
  .ch-add-btn { width: 100%; justify-content: center; }
  .form-grid { grid-template-columns: 1fr; }
  .cal-grid { grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .cal-cell { min-height: 60px; }
  .soldes-grid { grid-template-columns: 1fr; }
}
</style>
