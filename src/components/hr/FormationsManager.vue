<script setup>
import { ref, computed, onMounted } from 'vue'
import { localDb } from '../../services/localDatabase.js'
import { showToast } from '../../services/toast.js'
import EmployeeSelect from './EmployeeSelect.vue'

const employees = ref([])
const formations = ref(JSON.parse(localStorage.getItem('onda_formations') || '[]'))
const competences = ref(JSON.parse(localStorage.getItem('onda_competences') || '[]'))

const save = () => {
  localStorage.setItem('onda_formations', JSON.stringify(formations.value))
  localStorage.setItem('onda_competences', JSON.stringify(competences.value))
}

onMounted(async () => {
  try { employees.value = await localDb.getEmployees() } catch (e) { employees.value = [] }
})

// ── Formations
const showFormF = ref(false)
const editFormId = ref(null)
const emptyFormF = () => ({ nom: '', type: 'Interne', organisme: '', duree: '', dateDebut: '', dateFin: '', employeeIds: [], statut: 'Planifiée', certifExpiry: '', description: '' })
const formF = ref(emptyFormF())

const TYPES_FORM = ['Interne', 'Externe', 'E-learning', 'Certification', 'Séminaire']
const STATUTS = ['Planifiée', 'En cours', 'Terminée', 'Annulée']

const addOrUpdateFormation = () => {
  if (!formF.value.nom) { showToast('Nom de la formation requis', 'error'); return }
  const entry = { id: editFormId.value || Date.now(), ...formF.value }
  if (editFormId.value) {
    const idx = formations.value.findIndex(f => f.id === editFormId.value)
    if (idx !== -1) formations.value[idx] = entry
    showToast('Formation mise à jour', 'success')
  } else {
    formations.value.unshift(entry)
    showToast('Formation enregistrée', 'success')
  }
  save()
  formF.value = emptyFormF()
  editFormId.value = null
  showFormF.value = false
}

const editFormation = (f) => {
  editFormId.value = f.id
  formF.value = { nom:f.nom, type:f.type, organisme:f.organisme, duree:f.duree, dateDebut:f.dateDebut, dateFin:f.dateFin, employeeIds:[...f.employeeIds], statut:f.statut, certifExpiry:f.certifExpiry, description:f.description }
  showFormF.value = true
}

const removeFormation = (id) => { formations.value = formations.value.filter(f => f.id !== id); save(); showToast('Formation supprimée', 'success') }

const toggleEmployee = (empId) => {
  const idx = formF.value.employeeIds.indexOf(empId)
  if (idx === -1) formF.value.employeeIds.push(empId)
  else formF.value.employeeIds.splice(idx, 1)
}

// Alertes certifications expirantes
const today = new Date()
const alertesCertifs = computed(() => formations.value.filter(f => {
  if (!f.certifExpiry) return false
  const exp = new Date(f.certifExpiry)
  const diff = Math.round((exp - today) / (1000 * 60 * 60 * 24))
  return diff <= 60
}).map(f => {
  const exp = new Date(f.certifExpiry)
  const diff = Math.round((exp - today) / (1000 * 60 * 60 * 24))
  return { ...f, diffJours: diff }
}))

// ── Compétences (matrice)
const showFormC = ref(false)
const editCompId = ref(null)
const emptyFormC = () => ({ nom: '', categorie: '', employeeIds: {} })
const formC = ref(emptyFormC())

const NIVEAUX = ['', 'Notions', 'Opérationnel', 'Avancé', 'Expert']
const NIVEAU_COLORS = ['#e2e8f0', '#dbeafe', '#bfdbfe', '#60a5fa', '#2563eb']

const addOrUpdateComp = () => {
  if (!formC.value.nom) { showToast('Nom de la compétence requis', 'error'); return }
  const entry = { id: editCompId.value || Date.now(), ...formC.value }
  if (editCompId.value) {
    const idx = competences.value.findIndex(c => c.id === editCompId.value)
    if (idx !== -1) competences.value[idx] = entry
    showToast('Compétence mise à jour', 'success')
  } else {
    competences.value.unshift(entry)
    showToast('Compétence enregistrée', 'success')
  }
  save()
  formC.value = emptyFormC()
  editCompId.value = null
  showFormC.value = false
}

const removeComp = (id) => { competences.value = competences.value.filter(c => c.id !== id); save(); showToast('Compétence supprimée', 'success') }

const setNiveau = (compId, empId, niveau) => {
  const comp = competences.value.find(c => c.id === compId)
  if (!comp) return
  if (!comp.employeeIds) comp.employeeIds = {}
  if (niveau === 0) delete comp.employeeIds[empId]
  else comp.employeeIds[empId] = niveau
  save()
}

const activeTab = ref('formations') // 'formations' | 'matrice' | 'alertes'

const statutColor = (s) => ({ 'Planifiée':'#f59e0b','En cours':'#2563eb','Terminée':'#10b981','Annulée':'#94a3b8' }[s]||'#64748b')
</script>

<template>
  <div class="form-wrapper">
    <!-- Header -->
    <div class="fw-header">
      <div class="fw-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
      </div>
      <div>
        <h2 class="fw-title">Formations &amp; Compétences</h2>
        <p class="fw-sub">{{ formations.length }} formation(s) · {{ competences.length }} compétence(s) · {{ alertesCertifs.length }} certif. à renouveler</p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="fw-tabs">
      <button :class="['tab-btn',{active:activeTab==='formations'}]" @click="activeTab='formations'">Formations</button>
      <button :class="['tab-btn',{active:activeTab==='matrice'}]" @click="activeTab='matrice'">Matrice Compétences</button>
      <button :class="['tab-btn',{active:activeTab==='alertes'}]" @click="activeTab='alertes'">
        Certifications
        <span v-if="alertesCertifs.length>0" class="alerte-count">{{ alertesCertifs.length }}</span>
      </button>
    </div>

    <!-- FORMATIONS -->
    <div v-if="activeTab==='formations'">
      <div style="display:flex;justify-content:flex-end;margin-bottom:0.85rem;">
        <button class="fw-add-btn" @click="showFormF=!showFormF;editFormId=null;formF=emptyFormF()">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ajouter une formation
        </button>
      </div>

      <div v-if="showFormF" class="fw-form-card">
        <h3 style="margin:0 0 1rem;font-size:0.9rem;font-weight:700;color:#334155;">{{ editFormId?'Modifier':'Nouvelle formation' }}</h3>
        <div class="form-grid">
          <div class="form-field" style="grid-column:1/-1;"><label class="fl">Nom de la formation *</label><input type="text" class="fi" v-model="formF.nom" placeholder="Ex: Formation sécurité incendie" /></div>
          <div class="form-field"><label class="fl">Type</label><select class="fi" v-model="formF.type"><option v-for="t in TYPES_FORM" :key="t">{{ t }}</option></select></div>
          <div class="form-field"><label class="fl">Organisme</label><input type="text" class="fi" v-model="formF.organisme" placeholder="Ex: CFPCI, CAMAS..." /></div>
          <div class="form-field"><label class="fl">Durée</label><input type="text" class="fi" v-model="formF.duree" placeholder="Ex: 2 jours, 40h..." /></div>
          <div class="form-field"><label class="fl">Statut</label><select class="fi" v-model="formF.statut"><option v-for="s in STATUTS" :key="s">{{ s }}</option></select></div>
          <div class="form-field"><label class="fl">Date de début</label><input type="date" class="fi" v-model="formF.dateDebut" /></div>
          <div class="form-field"><label class="fl">Date de fin</label><input type="date" class="fi" v-model="formF.dateFin" /></div>
          <div class="form-field"><label class="fl">Expiry certification (si applicable)</label><input type="date" class="fi" v-model="formF.certifExpiry" /></div>
        </div>
        <div class="form-field" style="grid-column:1/-1; margin:0.75rem 0;">
          <label class="fl">Employés inscrits</label>
          <EmployeeSelect :employees="employees" @select="(e) => { if (e && !formF.employeeIds.includes(e.id)) formF.employeeIds.push(e.id) }" placeholder="Rechercher et ajouter un employé..." />
          <div v-if="formF.employeeIds.length > 0" style="margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.4rem;">
            <div v-for="empId in formF.employeeIds" :key="empId" style="background: #e2e8f0; color: #334155; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; display: flex; align-items: center; gap: 0.35rem; border: 1px solid #cbd5e1;">
              {{ employees.find(e => e.id === empId)?.prenom }} {{ employees.find(e => e.id === empId)?.nom }}
              <button @click="toggleEmployee(empId)" style="background: none; border: none; cursor: pointer; color: #ef4444; font-weight: 700; padding: 0;">✕</button>
            </div>
          </div>
          <p v-if="employees.length===0" style="color:#94a3b8;font-size:0.78rem;margin:4px 0 0;">Annuaire vide.</p>
        </div>
        <div class="form-footer">
          <button class="btn-cancel" @click="showFormF=false;editFormId=null">Annuler</button>
          <button class="btn-save" @click="addOrUpdateFormation">{{ editFormId?'Modifier':'Ajouter' }}</button>
        </div>
      </div>

      <div v-if="formations.length===0 && !showFormF" class="empty-state">Aucune formation enregistrée.</div>
      <div v-else class="formations-list">
        <div v-for="f in formations" :key="f.id" class="formation-card">
          <div class="fc-header">
            <div>
              <div class="fc-nom">{{ f.nom }}</div>
              <div class="fc-meta">{{ f.type }} {{ f.organisme?'· '+f.organisme:'' }} {{ f.duree?'· '+f.duree:'' }}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem;">
              <span class="fc-statut" :style="{background:statutColor(f.statut)+'22',color:statutColor(f.statut)}">{{ f.statut }}</span>
              <div style="display:flex;gap:0.3rem;">
                <button class="ct-btn" @click="editFormation(f);showFormF=true" style="font-size:0.72rem;padding:0.2rem 0.5rem;">Modifier</button>
                <button class="ct-btn danger" @click="removeFormation(f.id)" style="font-size:0.72rem;padding:0.2rem 0.5rem;">Supprimer</button>
              </div>
            </div>
          </div>
          <div v-if="f.employeeIds && f.employeeIds.length>0" class="fc-emps">
            <span class="fc-emps-label">Participants :</span>
            <span v-for="eid in f.employeeIds" :key="eid" class="fc-emp-chip">
              {{ (employees.find(e=>e.id===eid)||{}).prenom || 'Inconnu' }}
            </span>
          </div>
          <div v-if="f.certifExpiry" style="margin-top:0.4rem;font-size:0.75rem;color:#f59e0b;font-weight:600;">Certif. expire : {{ new Date(f.certifExpiry).toLocaleDateString('fr-FR') }}</div>
        </div>
      </div>
    </div>

    <!-- MATRICE COMPÉTENCES -->
    <div v-if="activeTab==='matrice'">
      <div style="display:flex;justify-content:flex-end;margin-bottom:0.85rem;">
        <button class="fw-add-btn" @click="showFormC=!showFormC;editCompId=null;formC=emptyFormC()">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ajouter une compétence
        </button>
      </div>
      <div v-if="showFormC" class="fw-form-card">
        <div class="form-grid">
          <div class="form-field"><label class="fl">Compétence *</label><input type="text" class="fi" v-model="formC.nom" placeholder="Ex: Excel, Logiciel paie, Sécurité..." /></div>
          <div class="form-field"><label class="fl">Catégorie</label><input type="text" class="fi" v-model="formC.categorie" placeholder="Technique, Bureautique..." /></div>
        </div>
        <div class="form-footer" style="margin-top:0.75rem;">
          <button class="btn-cancel" @click="showFormC=false">Annuler</button>
          <button class="btn-save" @click="addOrUpdateComp">Ajouter</button>
        </div>
      </div>
      <div v-if="competences.length===0 && employees.length===0" class="empty-state">Ajoutez des compétences et des employés pour construire la matrice.</div>
      <div v-else-if="competences.length===0" class="empty-state">Aucune compétence définie. Cliquez sur "Ajouter une compétence".</div>
      <div v-else class="matrice-scroll">
        <table class="matrice-table">
          <thead>
            <tr>
              <th class="mat-th-comp">Compétence</th>
              <th v-for="emp in employees" :key="emp.id" class="mat-th-emp">{{ emp.prenom }}<br/><span>{{ emp.nom }}</span></th>
              <th class="mat-th-action"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="comp in competences" :key="comp.id">
              <td class="mat-td-comp">
                <div class="mat-comp-nom">{{ comp.nom }}</div>
                <div v-if="comp.categorie" class="mat-comp-cat">{{ comp.categorie }}</div>
              </td>
              <td v-for="emp in employees" :key="emp.id" class="mat-td-niveau">
                <select class="niveau-select" :value="(comp.employeeIds||{})[emp.id]||0" @change="setNiveau(comp.id, emp.id, parseInt($event.target.value))" :style="{ background: NIVEAU_COLORS[(comp.employeeIds||{})[emp.id]||0], color: (comp.employeeIds||{})[emp.id]>=3?'white':'#334155' }">
                  <option value="0">—</option>
                  <option v-for="(n,i) in NIVEAUX.slice(1)" :key="i+1" :value="i+1">{{ n }}</option>
                </select>
              </td>
              <td>
                <button class="ct-btn danger" @click="removeComp(comp.id)" style="font-size:0.72rem;padding:0.2rem 0.5rem;">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="matrice-legend">
        <span v-for="(n,i) in NIVEAUX.slice(1)" :key="i" class="legend-item">
          <span class="legend-dot" :style="{background:NIVEAU_COLORS[i+1]}"></span>{{ n }}
        </span>
      </div>
    </div>

    <!-- ALERTES CERTIFICATIONS -->
    <div v-if="activeTab==='alertes'">
      <div v-if="alertesCertifs.length===0" class="empty-state">Aucune certification n'expire dans les 60 prochains jours.</div>
      <div v-else class="alertes-list">
        <div v-for="f in alertesCertifs" :key="f.id" class="alerte-certif" :style="{borderLeftColor: f.diffJours<0?'#ef4444':f.diffJours<30?'#f59e0b':'#3b82f6'}">
          <div>
            <div style="font-weight:800;color:#1e293b;">{{ f.nom }}</div>
            <div style="font-size:0.78rem;color:#64748b;">{{ f.organisme || 'Formation interne' }} · Certif. expire : {{ new Date(f.certifExpiry).toLocaleDateString('fr-FR') }}</div>
          </div>
          <div class="alerte-badge" :style="{background: f.diffJours<0?'#fef2f2': f.diffJours<30?'#fffbeb':'#eff6ff', color: f.diffJours<0?'#dc2626':f.diffJours<30?'#d97706':'#2563eb'}">
            {{ f.diffJours < 0 ? 'Expirée' : `J-${f.diffJours}` }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-wrapper { padding: 1.5rem; }
.fw-header { display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;padding:1.1rem 1.4rem;background:linear-gradient(135deg,#0c4a6e 0%,#0ea5e9 100%);border-radius:14px;color:white; }
.fw-icon { width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
.fw-title { margin:0;font-size:1.05rem;font-weight:800; }
.fw-sub { margin:0;font-size:0.78rem;opacity:0.8; }
.fw-tabs { display:flex;gap:0.5rem;margin-bottom:1rem;border-bottom:1px solid #e2e8f0; }
.tab-btn { padding:0.6rem 1.1rem;border:none;background:none;cursor:pointer;font-weight:600;font-size:0.84rem;color:#64748b;border-bottom:3px solid transparent;margin-bottom:-1px;transition:all 0.15s;position:relative; }
.tab-btn.active { color:#0ea5e9;border-bottom-color:#0ea5e9; }
.alerte-count { position:absolute;top:4px;right:4px;background:#ef4444;color:white;font-size:0.6rem;font-weight:800;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px; }
.fw-add-btn { display:flex;align-items:center;gap:0.4rem;padding:0.5rem 1rem;background:#0ea5e9;color:white;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:0.82rem; }
.fw-form-card { background:white;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin-bottom:0.85rem; }
.form-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.75rem; }
.form-field { display:flex;flex-direction:column;gap:3px; }
.fl { font-size:0.76rem;font-weight:600;color:#475569; }
.fi { padding:0.55rem 0.75rem;border:1px solid #e2e8f0;border-radius:8px;font-size:0.84rem;background:#f8fafc;font-family:inherit;box-sizing:border-box;width:100%; }
.fi:focus { outline:none;border-color:#0ea5e9;background:white; }
.emp-checkboxes { display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:4px; }
.emp-check { display:flex;align-items:center;gap:0.3rem;font-size:0.8rem;color:#334155;cursor:pointer; }
.form-footer { display:flex;gap:0.75rem;justify-content:flex-end; }
.btn-cancel { padding:0.5rem 1rem;border:1px solid #e2e8f0;background:white;color:#64748b;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.84rem; }
.btn-save { padding:0.5rem 1.25rem;background:#0ea5e9;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.84rem; }
.formations-list { display:flex;flex-direction:column;gap:0.75rem; }
.formation-card { background:white;border:1px solid #e2e8f0;border-radius:12px;padding:1rem; }
.fc-header { display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem; }
.fc-nom { font-weight:800;color:#1e293b;font-size:0.9rem; }
.fc-meta { font-size:0.75rem;color:#64748b;margin-top:2px; }
.fc-statut { padding:0.2rem 0.65rem;border-radius:20px;font-size:0.72rem;font-weight:800; }
.fc-emps { display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-top:0.65rem; }
.fc-emps-label { font-size:0.74rem;color:#94a3b8;font-weight:600; }
.fc-emp-chip { padding:0.15rem 0.5rem;background:#eff6ff;color:#2563eb;border-radius:20px;font-size:0.74rem;font-weight:700; }
.matrice-scroll { overflow-x:auto;border:1px solid #e2e8f0;border-radius:12px; }
.matrice-table { width:100%;border-collapse:collapse; }
.mat-th-comp { padding:0.75rem 1rem;text-align:left;font-size:0.78rem;font-weight:700;color:#475569;background:#f8fafc;border-bottom:1px solid #e2e8f0;min-width:160px; }
.mat-th-emp { padding:0.5rem 0.6rem;text-align:center;font-size:0.72rem;font-weight:700;color:#334155;background:#f8fafc;border-bottom:1px solid #e2e8f0;min-width:80px;vertical-align:bottom; }
.mat-th-emp span { font-weight:600;color:#64748b; }
.mat-th-action { background:#f8fafc;border-bottom:1px solid #e2e8f0;width:60px; }
.mat-td-comp { padding:0.65rem 1rem;border-bottom:1px solid #f8fafc; }
.mat-comp-nom { font-weight:700;color:#1e293b;font-size:0.84rem; }
.mat-comp-cat { font-size:0.72rem;color:#94a3b8; }
.mat-td-niveau { padding:0.4rem 0.4rem;text-align:center;border-bottom:1px solid #f8fafc; }
.niveau-select { padding:0.3rem 0.4rem;border:1px solid transparent;border-radius:6px;font-size:0.75rem;font-weight:700;cursor:pointer;text-align:center;width:100%;outline:none;transition:all 0.15s; }
.matrice-legend { display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:0.75rem;font-size:0.75rem; }
.legend-item { display:flex;align-items:center;gap:0.3rem;color:#64748b; }
.legend-dot { width:10px;height:10px;border-radius:3px; }
.alertes-list { display:flex;flex-direction:column;gap:0.5rem; }
.alerte-certif { display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1rem;background:white;border:1px solid #e2e8f0;border-left:4px solid;border-radius:0 10px 10px 0; }
.alerte-badge { padding:0.2rem 0.75rem;border-radius:20px;font-size:0.76rem;font-weight:800;flex-shrink:0; }
.ct-btn { padding:0.25rem 0.5rem;border:1px solid #e2e8f0;background:white;border-radius:6px;cursor:pointer;font-size:0.76rem;font-weight:600;color:#64748b;transition:all 0.15s; }
.ct-btn:hover { border-color:#0ea5e9;color:#0ea5e9; }
.ct-btn.danger:hover { border-color:#ef4444;color:#ef4444; }
.empty-state { text-align:center;padding:3rem;color:#94a3b8;font-size:0.85rem;background:white;border:1px solid #e2e8f0;border-radius:12px; }
</style>
