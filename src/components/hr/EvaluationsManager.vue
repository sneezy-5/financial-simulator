<script setup>
import { ref, computed, onMounted } from 'vue'
import { localDb } from '../../services/localDatabase.js'
import { showToast } from '../../services/toast.js'
import EmployeeSelect from './EmployeeSelect.vue'

const employees = ref([])
const evaluations = ref([])

onMounted(async () => {
  try { 
    employees.value = await localDb.getEmployees() 
    evaluations.value = await localDb.getEvaluations()
  } catch (e) { 
    employees.value = [] 
    evaluations.value = []
  }
})

const CRITERES = [
  { id: 'ponctualite', label: 'Ponctualité & Assiduité' },
  { id: 'qualite', label: 'Qualité du travail' },
  { id: 'initiative', label: 'Initiative & Proactivité' },
  { id: 'equipe', label: "Travail d'équipe" },
  { id: 'objectifs', label: 'Atteinte des objectifs' },
]

const showForm = ref(false)
const editId = ref(null)
const emptyForm = () => ({
  employeeId: '', periode: '', notes: Object.fromEntries(CRITERES.map(c => [c.id, 3])), commentaire: '', recommandation: ''
})
const form = ref(emptyForm())

const noteGlobale = (notes) => {
  const vals = CRITERES.map(c => parseFloat(notes[c.id]) || 0)
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
}

const noteColor = (n) => {
  if (n >= 4.5) return '#10b981'
  if (n >= 3.5) return '#2563eb'
  if (n >= 2.5) return '#f59e0b'
  return '#ef4444'
}

const noteLabel = (n) => {
  if (n >= 4.5) return 'Excellent'
  if (n >= 3.5) return 'Bien'
  if (n >= 2.5) return 'Satisfaisant'
  if (n >= 1.5) return 'À améliorer'
  return 'Insuffisant'
}

const addOrUpdateEval = async () => {
  if (!form.value.employeeId) { showToast("Sélectionnez un employé", 'error'); return }
  if (!form.value.periode) { showToast("Indiquez la période d'évaluation", 'error'); return }
  const emp = employees.value.find(e => e.id === form.value.employeeId)
  
  const entry = {
    id: editId.value || undefined,
    employeeId: form.value.employeeId,
    empNom: emp ? `${emp.prenom || ''} ${emp.nom || ''}`.trim() : 'Inconnu',
    empPoste: emp?.poste || '',
    periode: form.value.periode,
    notes: { ...form.value.notes },
    global: parseFloat(noteGlobale(form.value.notes)),
    commentaire: form.value.commentaire,
    recommandation: form.value.recommandation,
    date: new Date().toLocaleDateString('fr-FR'),
  }

  const saved = await localDb.saveEvaluation(entry)

  if (editId.value) {
    const idx = evaluations.value.findIndex(e => e.id === editId.value)
    if (idx !== -1) evaluations.value[idx] = saved
    showToast('Évaluation mise à jour', 'success')
  } else {
    evaluations.value.unshift(saved)
    showToast('Évaluation enregistrée', 'success')
  }
  
  form.value = emptyForm()
  editId.value = null
  showForm.value = false
}

const editEval = (ev) => {
  editId.value = ev.id
  form.value = { employeeId: ev.employeeId, periode: ev.periode, notes: { ...ev.notes }, commentaire: ev.commentaire, recommandation: ev.recommandation }
  showForm.value = true
}

const removeEval = async (id) => {
  await localDb.deleteEvaluation(id)
  evaluations.value = evaluations.value.filter(e => e.id !== id)
  showToast('Évaluation supprimée', 'success')
}

// Employés à évaluer ce trimestre (sans évaluation dans les 3 derniers mois)
const aEvaluer = computed(() => {
  const now = new Date()
  return employees.value.filter(emp => {
    const derniereEval = evaluations.value.filter(e => e.employeeId === emp.id)
      .sort((a, b) => b.id - a.id)[0]
    if (!derniereEval) return true
    const dateEval = new Date(derniereEval.date.split('/').reverse().join('-'))
    const diffMois = (now.getFullYear() - dateEval.getFullYear()) * 12 + (now.getMonth() - dateEval.getMonth())
    return diffMois >= 3
  })
})

const activeTab = ref('list') // 'list' | 'form' | 'todo'
const searchQuery = ref('')
const filteredEvals = computed(() => {
  const q = searchQuery.value.toLowerCase()
  return evaluations.value.filter(e => !q || e.empNom.toLowerCase().includes(q) || (e.periode||'').toLowerCase().includes(q))
})
</script>

<template>
  <div class="eval-wrapper">
    <!-- Header -->
    <div class="ev-header">
      <div class="ev-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </div>
      <div>
        <h2 class="ev-title">Évaluations de Performance</h2>
        <p class="ev-sub">{{ evaluations.length }} évaluation(s) · {{ aEvaluer.length }} employé(s) à évaluer ce trimestre</p>
      </div>
      <button class="ev-add-btn" @click="showForm=!showForm;editId=null;form=emptyForm();activeTab='form'">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nouvelle évaluation
      </button>
    </div>

    <!-- Tabs -->
    <div class="ev-tabs">
      <button :class="['tab-btn',{active:activeTab==='list'}]" @click="activeTab='list'">Historique</button>
      <button :class="['tab-btn',{active:activeTab==='todo'}]" @click="activeTab='todo'">
        À évaluer <span v-if="aEvaluer.length>0" class="todo-badge">{{ aEvaluer.length }}</span>
      </button>
      <button :class="['tab-btn',{active:activeTab==='form'}]" @click="activeTab='form';showForm=true;editId=null;form=emptyForm()">Formulaire</button>
    </div>

    <!-- Formulaire -->
    <div v-if="activeTab==='form'" class="ev-form-card">
      <h3 style="margin:0 0 1rem;font-size:0.9rem;font-weight:700;color:#334155;">{{ editId ? 'Modifier l\'évaluation' : 'Nouvelle évaluation' }}</h3>
      <div class="form-grid">
        <div class="form-field">
          <label class="fl">Employé</label>
          <EmployeeSelect :employees="employees" @select="(e) => form.employeeId = e ? e.id : ''" placeholder="Rechercher l'employé à évaluer..." />
          <div v-if="form.employeeId" style="margin-top: 0.25rem; font-size: 0.75rem; color: #10b981;">
            Employé sélectionné : {{ employees.find(e => e.id === form.employeeId)?.prenom }} {{ employees.find(e => e.id === form.employeeId)?.nom }}
            <button @click="form.employeeId = ''" style="margin-left: 0.5rem; background: none; border: none; color: #64748b; text-decoration: underline; cursor: pointer;">Changer</button>
          </div>
        </div>
        <div class="form-field">
          <label class="fl">Période évaluée</label>
          <input type="text" class="fi" v-model="form.periode" placeholder="Ex: T3 2025, Année 2024..." />
        </div>
      </div>

      <!-- Critères de notation -->
      <div class="criteres-section">
        <h4 style="margin:0 0 0.85rem;font-size:0.82rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.05em;">Notation des critères (1 = Insuffisant · 5 = Excellent)</h4>
        <div v-for="c in CRITERES" :key="c.id" class="critere-row">
          <span class="critere-label">{{ c.label }}</span>
          <div class="stars">
            <button v-for="n in 5" :key="n" class="star-btn" :class="{active: form.notes[c.id] >= n}" @click="form.notes[c.id] = n">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" :fill="form.notes[c.id]>=n?'#f59e0b':'none'" stroke="#f59e0b" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>
          </div>
          <span class="critere-note" :style="{color: noteColor(form.notes[c.id])}">{{ form.notes[c.id] }}/5</span>
        </div>
        <div class="note-globale-preview">
          <span>Note globale</span>
          <span class="ng-value" :style="{ color: noteColor(parseFloat(noteGlobale(form.notes))) }">{{ noteGlobale(form.notes) }} / 5 — {{ noteLabel(parseFloat(noteGlobale(form.notes))) }}</span>
        </div>
      </div>

      <div class="form-grid" style="margin-top:0.75rem;">
        <div class="form-field" style="grid-column:1/-1;">
          <label class="fl">Commentaires</label>
          <textarea class="fi" style="resize:vertical;min-height:70px;" v-model="form.commentaire" placeholder="Points forts, axes d'amélioration..."></textarea>
        </div>
        <div class="form-field" style="grid-column:1/-1;">
          <label class="fl">Recommandation</label>
          <select class="fi" v-model="form.recommandation">
            <option value="">— Aucune —</option>
            <option>Promotion à envisager</option>
            <option>Formation recommandée</option>
            <option>Plan de performance requis</option>
            <option>Renouvellement du contrat</option>
          </select>
        </div>
      </div>
      <div class="form-footer">
        <button class="btn-cancel" @click="showForm=false;editId=null;activeTab='list'">Annuler</button>
        <button class="btn-save" @click="addOrUpdateEval">{{ editId ? 'Enregistrer les modifications' : 'Créer l\'évaluation' }}</button>
      </div>
    </div>

    <!-- Liste historique -->
    <div v-if="activeTab==='list'">
      <div style="margin-bottom:0.75rem;">
        <input class="fi" v-model="searchQuery" placeholder="Rechercher un employé ou une période..." style="max-width:300px;" />
      </div>
      <div v-if="filteredEvals.length===0" class="empty-state">Aucune évaluation enregistrée.</div>
      <div v-else class="evals-list">
        <div v-for="ev in filteredEvals" :key="ev.id" class="eval-card">
          <div class="ec-top">
            <div>
              <div class="ec-emp">{{ ev.empNom }}</div>
              <div class="ec-poste">{{ ev.empPoste }} · {{ ev.periode }}</div>
            </div>
            <div class="ec-note" :style="{ background: noteColor(ev.global)+'18', color: noteColor(ev.global) }">
              {{ ev.global.toFixed(1) }}/5 · {{ noteLabel(ev.global) }}
            </div>
          </div>
          <div class="ec-criteres">
            <div v-for="c in CRITERES" :key="c.id" class="ec-critere">
              <span class="ec-cl">{{ c.label }}</span>
              <div class="ec-bar-bg">
                <div class="ec-bar-fill" :style="{ width: ((ev.notes[c.id]||0)/5*100)+'%', background: noteColor(ev.notes[c.id]||0) }"></div>
              </div>
              <span class="ec-cn" :style="{color: noteColor(ev.notes[c.id]||0)}">{{ ev.notes[c.id]||0 }}</span>
            </div>
          </div>
          <div v-if="ev.commentaire" class="ec-comment">{{ ev.commentaire }}</div>
          <div v-if="ev.recommandation" class="ec-reco">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ ev.recommandation }}
          </div>
          <div class="ec-footer">
            <span class="ec-date">Évalué le {{ ev.date }}</span>
            <div style="display:flex;gap:0.35rem;">
              <button class="ct-btn" @click="editEval(ev);activeTab='form'">Modifier</button>
              <button class="ct-btn danger" @click="removeEval(ev.id)">Supprimer</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Todo -->
    <div v-if="activeTab==='todo'">
      <div v-if="aEvaluer.length===0" class="empty-state">Tous les employés ont été évalués récemment.</div>
      <div v-else class="evals-list">
        <div v-for="emp in aEvaluer" :key="emp.id" class="eval-card todo-card">
          <div class="ec-top">
            <div>
              <div class="ec-emp">{{ emp.prenom }} {{ emp.nom }}</div>
              <div class="ec-poste">{{ emp.poste || 'Sans poste' }}</div>
            </div>
            <button class="btn-save" style="font-size:0.78rem;padding:0.4rem 0.85rem;" @click="form.employeeId=emp.id;activeTab='form';showForm=true;editId=null">Évaluer</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eval-wrapper { padding: 1.5rem; }
.ev-header { display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;padding:1.1rem 1.4rem;background:linear-gradient(135deg,#3b0764 0%,#7c3aed 100%);border-radius:14px;color:white; }
.ev-icon { width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
.ev-title { margin:0;font-size:1.05rem;font-weight:800; }
.ev-sub { margin:0;font-size:0.78rem;opacity:0.8; }
.ev-add-btn { margin-left:auto;display:flex;align-items:center;gap:0.4rem;padding:0.5rem 1rem;background:rgba(255,255,255,0.15);color:white;border:1.5px solid rgba(255,255,255,0.3);border-radius:9px;cursor:pointer;font-weight:700;font-size:0.82rem;white-space:nowrap; }
.ev-tabs { display:flex;gap:0.5rem;margin-bottom:1rem;border-bottom:1px solid #e2e8f0;padding-bottom:0; }
.tab-btn { padding:0.6rem 1.1rem;border:none;background:none;cursor:pointer;font-weight:600;font-size:0.84rem;color:#64748b;border-bottom:3px solid transparent;margin-bottom:-1px;transition:all 0.15s;position:relative; }
.tab-btn.active { color:#7c3aed;border-bottom-color:#7c3aed; }
.todo-badge { position:absolute;top:4px;right:4px;background:#ef4444;color:white;font-size:0.6rem;font-weight:800;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px; }
.ev-form-card { background:white;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin-bottom:1rem; }
.form-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.75rem; }
.form-field { display:flex;flex-direction:column;gap:3px; }
.fl { font-size:0.76rem;font-weight:600;color:#475569; }
.fi { padding:0.55rem 0.75rem;border:1px solid #e2e8f0;border-radius:8px;font-size:0.84rem;background:#f8fafc;font-family:inherit;box-sizing:border-box;width:100%; }
.fi:focus { outline:none;border-color:#7c3aed;background:white; }
.criteres-section { background:#fafafa;border:1px solid #f1f5f9;border-radius:10px;padding:1rem;margin-top:0.75rem; }
.critere-row { display:flex;align-items:center;gap:0.75rem;margin-bottom:0.65rem;flex-wrap:wrap; }
.critere-label { font-size:0.82rem;font-weight:600;color:#334155;min-width:180px; }
.stars { display:flex;gap:2px; }
.star-btn { background:none;border:none;cursor:pointer;padding:2px;transition:transform 0.1s; }
.star-btn:hover { transform:scale(1.2); }
.critere-note { font-size:0.82rem;font-weight:800;min-width:30px; }
.note-globale-preview { display:flex;justify-content:space-between;align-items:center;margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid #e2e8f0;font-size:0.84rem;font-weight:700;color:#334155; }
.ng-value { font-size:0.9rem;font-weight:800; }
.form-footer { display:flex;gap:0.75rem;margin-top:1rem;justify-content:flex-end; }
.btn-cancel { padding:0.5rem 1rem;border:1px solid #e2e8f0;background:white;color:#64748b;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.84rem; }
.btn-save { padding:0.5rem 1.25rem;background:#7c3aed;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.84rem; }
.evals-list { display:flex;flex-direction:column;gap:0.75rem; }
.eval-card { background:white;border:1px solid #e2e8f0;border-radius:12px;padding:1rem; }
.todo-card { border-style:dashed; }
.ec-top { display:flex;align-items:flex-start;justify-content:space-between;gap:0.75rem;margin-bottom:0.75rem; }
.ec-emp { font-weight:800;color:#1e293b;font-size:0.9rem; }
.ec-poste { font-size:0.76rem;color:#64748b; }
.ec-note { padding:0.3rem 0.75rem;border-radius:20px;font-size:0.82rem;font-weight:800;flex-shrink:0; }
.ec-criteres { display:flex;flex-direction:column;gap:0.35rem;margin-bottom:0.75rem; }
.ec-critere { display:flex;align-items:center;gap:0.5rem; }
.ec-cl { font-size:0.75rem;color:#64748b;min-width:160px; }
.ec-bar-bg { flex:1;height:5px;background:#f1f5f9;border-radius:999px;overflow:hidden; }
.ec-bar-fill { height:100%;border-radius:999px;transition:width 0.4s; }
.ec-cn { font-size:0.75rem;font-weight:800;min-width:16px; }
.ec-comment { font-size:0.8rem;color:#475569;font-style:italic;margin-bottom:0.5rem;padding-top:0.5rem;border-top:1px solid #f1f5f9; }
.ec-reco { display:flex;align-items:center;gap:0.4rem;font-size:0.78rem;color:#7c3aed;font-weight:600;margin-bottom:0.5rem; }
.ec-footer { display:flex;align-items:center;justify-content:space-between;margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid #f8fafc; }
.ec-date { font-size:0.74rem;color:#94a3b8; }
.ct-btn { padding:0.25rem 0.6rem;border:1px solid #e2e8f0;background:white;border-radius:6px;cursor:pointer;font-size:0.76rem;font-weight:600;color:#64748b;transition:all 0.15s; }
.ct-btn:hover { border-color:#7c3aed;color:#7c3aed; }
.ct-btn.danger:hover { border-color:#ef4444;color:#ef4444; }
.empty-state { text-align:center;padding:3rem;color:#94a3b8;font-size:0.85rem;background:white;border:1px solid #e2e8f0;border-radius:12px; }
</style>
