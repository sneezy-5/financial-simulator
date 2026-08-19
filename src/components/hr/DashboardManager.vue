<script setup>
import { ref, computed, onMounted } from 'vue'
import { localDb } from '../../services/localDatabase.js'

const employees = ref([])
const conges = ref([])
const contrats = ref([])

onMounted(async () => {
  try { employees.value = await localDb.getEmployees() } catch (e) { employees.value = [] }
  conges.value = JSON.parse(localStorage.getItem('onda_conges') || '[]')
  contrats.value = JSON.parse(localStorage.getItem('onda_contrats') || '[]')
})

const now = new Date()
now.setHours(0,0,0,0)
const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

// --- KPIs ---
const kpiEmployees = computed(() => employees.value.length)
const kpiActifs = computed(() => contrats.value.filter(c => c.statut === 'actif').length)
const masseSalariale = computed(() => {
  return contrats.value
    .filter(c => c.statut === 'actif')
    .reduce((sum, c) => sum + (Number(c.salaireBase) || 0), 0)
})
const fmtMontant = (m) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(m)

// --- Alertes Contrats ---
const alertesContrats = computed(() => {
  return contrats.value.filter(c => {
    if (c.statut !== 'actif' || !c.dateFin) return false
    const dFin = new Date(c.dateFin)
    return dFin >= now && dFin <= in30Days
  }).map(c => {
    const emp = employees.value.find(e => e.id === c.employeeId)
    const nomComplet = emp ? `${emp.prenom} ${emp.nom}` : 'Inconnu'
    const daysLeft = Math.ceil((new Date(c.dateFin) - now) / (1000 * 60 * 60 * 24))
    return { ...c, nomComplet, daysLeft }
  }).sort((a, b) => a.daysLeft - b.daysLeft)
})

// --- Alertes Congés ---
const alertesConges = computed(() => {
  return conges.value.filter(c => {
    const dDebut = new Date(c.dateDebut)
    const dFin = new Date(c.dateFin)
    return (dDebut <= in14Days && dFin >= now)
  }).map(c => {
    const dDebut = new Date(c.dateDebut)
    let statut = ''
    let daysDiff = Math.ceil((dDebut - now) / (1000 * 60 * 60 * 24))
    if (daysDiff <= 0) {
      statut = 'En cours'
    } else {
      statut = `Dans ${daysDiff} j`
    }
    return { ...c, statutStr: statut, daysDiff }
  }).sort((a, b) => a.daysDiff - b.daysDiff)
})

const getAbsenceColor = (type) => {
  const map = { annuel: '#2563eb', maladie: '#dc2626', maternite: '#ec4899', sans_solde: '#64748b', ferie: '#f59e0b', autre: '#8b5cf6' }
  return map[type] || '#8b5cf6'
}
const getAbsenceLabel = (type) => {
  const map = { annuel: 'Congé annuel', maladie: 'Maladie', maternite: 'Maternité', sans_solde: 'Sans solde', ferie: 'Férié', autre: 'Autre' }
  return map[type] || 'Autre'
}
</script>

<template>
  <div class="dash-wrapper">
    <div class="dash-header">
      <div class="dh-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
      </div>
      <div>
        <h2 class="dh-title">Tableau de Bord & Alertes</h2>
        <p class="dh-sub">Vue d'ensemble et alertes prioritaires</p>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Effectif Total</div>
        <div class="kpi-val">{{ kpiEmployees }}</div>
        <div class="kpi-sub">{{ kpiActifs }} contrats actifs</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Masse Salariale Base (Active)</div>
        <div class="kpi-val" style="color: #059669;">{{ fmtMontant(masseSalariale) }}</div>
        <div class="kpi-sub">Mensuelle brute estimée</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Alertes Actives</div>
        <div class="kpi-val" style="color: #ef4444;">{{ alertesContrats.length + alertesConges.length }}</div>
        <div class="kpi-sub">Nécessitent votre attention</div>
      </div>
    </div>

    <!-- Alertes -->
    <div class="alerts-grid">
      
      <!-- Contrats à expiration -->
      <div class="alert-panel">
        <h3 class="panel-title" style="color: #ea580c;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Contrats expirant sous 30 jours ({{ alertesContrats.length }})
        </h3>
        <div v-if="alertesContrats.length === 0" class="empty-state">Aucun contrat ne se termine bientôt.</div>
        <div v-else class="alert-list">
          <div v-for="c in alertesContrats" :key="c.id" class="alert-item">
            <div class="ai-main">
              <span class="ai-emp">{{ c.nomComplet }}</span>
              <span class="ai-badge" :style="{ background: c.daysLeft <= 10 ? '#fee2e2' : '#ffedd5', color: c.daysLeft <= 10 ? '#dc2626' : '#ea580c' }">
                Expire dans {{ c.daysLeft }} j
              </span>
            </div>
            <div class="ai-sub">Contrat {{ c.typeContrat }} - Fin le {{ c.dateFin }}</div>
          </div>
        </div>
      </div>

      <!-- Congés à venir / en cours -->
      <div class="alert-panel">
        <h3 class="panel-title" style="color: #2563eb;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Congés & Absences à venir (J-14) ({{ alertesConges.length }})
        </h3>
        <div v-if="alertesConges.length === 0" class="empty-state">Aucun congé prévu prochainement.</div>
        <div v-else class="alert-list">
          <div v-for="c in alertesConges" :key="c.id" class="alert-item">
            <div class="ai-main">
              <span class="ai-emp">{{ c.employeNom }}</span>
              <span class="ai-badge" :style="{ background: c.daysDiff <= 0 ? '#dcfce7' : '#e0e7ff', color: c.daysDiff <= 0 ? '#16a34a' : '#4f46e5' }">
                {{ c.statutStr }}
              </span>
            </div>
            <div class="ai-sub">
              <span :style="{ color: getAbsenceColor(c.type), fontWeight: '700' }">{{ getAbsenceLabel(c.type) }}</span> 
              · Du {{ c.dateDebut }} au {{ c.dateFin }} ({{ c.jours }} j)
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.dash-wrapper { padding: 1.5rem; max-width: 1400px; margin: 0 auto; height: 100%; display: flex; flex-direction: column; overflow-y: auto; background: #f8fafc; }
.dash-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
.dh-icon { width: 44px; height: 44px; background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 10px rgba(234, 88, 12, 0.25); }
.dh-title { margin: 0; font-size: 1.4rem; font-weight: 800; color: #1e293b; }
.dh-sub { margin: 0; font-size: 0.9rem; color: #64748b; }

.kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-bottom: 2rem; }
.kpi-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
.kpi-label { font-size: 0.85rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem; }
.kpi-val { font-size: 2rem; font-weight: 800; color: #1e293b; margin-bottom: 0.25rem; }
.kpi-sub { font-size: 0.8rem; color: #94a3b8; }

.alerts-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; }
.alert-panel { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
.panel-title { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 1.25rem 0; font-size: 1rem; font-weight: 800; }
.empty-state { text-align: center; padding: 2.5rem 1rem; color: #94a3b8; font-size: 0.9rem; font-style: italic; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1; }
.alert-list { display: flex; flex-direction: column; gap: 0.75rem; }
.alert-item { padding: 1rem; border: 1px solid #f1f5f9; border-radius: 8px; background: #fcfcfd; transition: all 0.2s; }
.alert-item:hover { border-color: #cbd5e1; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
.ai-main { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
.ai-emp { font-weight: 700; color: #1e293b; font-size: 0.95rem; }
.ai-badge { padding: 0.2rem 0.5rem; border-radius: 99px; font-size: 0.75rem; font-weight: 800; }
.ai-sub { font-size: 0.85rem; color: #64748b; }

@media (max-width: 900px) {
  .kpi-grid, .alerts-grid { grid-template-columns: 1fr; }
}
</style>
