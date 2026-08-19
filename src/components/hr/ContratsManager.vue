<script setup>
import { ref, computed, onMounted } from 'vue'
import { localDb } from '../../services/localDatabase.js'
import { showToast } from '../../services/toast.js'
import EmployeeSelect from './EmployeeSelect.vue'

const employees = ref([])
const contrats = ref(JSON.parse(localStorage.getItem('onda_contrats') || '[]'))
const saveContrats = () => localStorage.setItem('onda_contrats', JSON.stringify(contrats.value))

onMounted(async () => {
  try { employees.value = await localDb.getEmployees() } catch (e) { employees.value = [] }
})

const today = new Date()
const showForm = ref(false)
const editId = ref(null)

const emptyForm = () => ({
  employeeId: '', type: 'CDI', dateDebut: '', dateFin: '', poste: '',
  salaireDeBase: '', sursalaire: '', primes: [],
  commentaire: ''
})
const form = ref(emptyForm())

const addPrime = (libelle = '') => form.value.primes.push({ libelle, montant: '', imposable: true })
const removePrime = (idx) => form.value.primes.splice(idx, 1)

// Suggestions rapides de primes courantes — un clic ajoute une ligne pré-remplie avec ce libellé
const PRIMES_SUGGESTIONS = ['Prime de transport', 'Prime de logement', 'Prime de fonction', 'Prime de responsabilité']

const totalBrutForm = computed(() =>
  (+form.value.salaireDeBase || 0) +
  (+form.value.sursalaire || 0) +
  form.value.primes.reduce((sum, p) => sum + (+p.montant || 0), 0)
)

const calcStatut = (c) => {
  if (c.type === 'CDI' || !c.dateFin) return 'actif'
  const fin = new Date(c.dateFin)
  const diffJours = Math.round((fin - today) / (1000 * 60 * 60 * 24))
  if (diffJours < 0) return 'expire'
  if (diffJours <= 7) return 'alerte7'
  if (diffJours <= 15) return 'alerte15'
  if (diffJours <= 30) return 'alerte30'
  return 'actif'
}

const statutLabel = (s) => ({
  actif: 'Actif', expire: 'Expiré', alerte7: 'Expire dans 7 j', alerte15: 'Expire dans 15 j', alerte30: 'Expire dans 30 j'
}[s] || s)

const statutColor = (s) => ({
  actif: '#10b981', expire: '#dc2626', alerte7: '#dc2626', alerte15: '#f59e0b', alerte30: '#f59e0b'
}[s] || '#64748b')

const alertes = computed(() => contrats.value.filter(c => {
  const s = calcStatut(c)
  return ['expire', 'alerte7', 'alerte15', 'alerte30'].includes(s)
}).sort((a, b) => new Date(a.dateFin) - new Date(b.dateFin)))

const contratsWithStatut = computed(() =>
  contrats.value.map(c => ({ ...c, statut: calcStatut(c), empNom: employees.value.find(e => e.id === c.employeeId) ? `${employees.value.find(e => e.id === c.employeeId).prenom} ${employees.value.find(e => e.id === c.employeeId).nom}` : c.empNomManuel || 'Inconnu' }))
    .sort((a, b) => {
      const order = { expire: 0, alerte7: 1, alerte15: 2, alerte30: 3, actif: 4 }
      return (order[a.statut] ?? 5) - (order[b.statut] ?? 5)
    })
)

const addOrUpdateContrat = () => {
  if (!form.value.dateDebut) { showToast('Date de début requise', 'error'); return }
  const emp = employees.value.find(e => e.id === form.value.employeeId)
  const entry = {
    id: editId.value || Date.now(),
    employeeId: form.value.employeeId,
    empNomManuel: emp ? `${emp.prenom || ''} ${emp.nom || ''}`.trim() : 'Inconnu',
    type: form.value.type,
    dateDebut: form.value.dateDebut,
    dateFin: form.value.dateFin,
    poste: form.value.poste,
    salaireDeBase: form.value.salaireDeBase,
    sursalaire: form.value.sursalaire,
    primes: form.value.primes.filter(p => p.libelle || p.montant),
    commentaire: form.value.commentaire,
  }
  if (editId.value) {
    const idx = contrats.value.findIndex(c => c.id === editId.value)
    if (idx !== -1) contrats.value[idx] = entry
    showToast('Contrat mis à jour', 'success')
  } else {
    contrats.value.unshift(entry)
    showToast('Contrat enregistré', 'success')
  }
  saveContrats()
  form.value = emptyForm()
  editId.value = null
  showForm.value = false
}

const editContrat = (c) => {
  editId.value = c.id
  form.value = {
    employeeId: c.employeeId, type: c.type, dateDebut: c.dateDebut, dateFin: c.dateFin, poste: c.poste,
    // Rétrocompatibilité : les contrats enregistrés avant la séparation salaire de base/sursalaire/primes
    // n'ont qu'un champ "salaire" global — on le reprend comme salaire de base par défaut.
    salaireDeBase: c.salaireDeBase !== undefined ? c.salaireDeBase : (c.salaire || ''),
    sursalaire: c.sursalaire || '',
    // Rétrocompatibilité : les primes enregistrées avant l'ajout du statut imposable/non
    // imposable n'ont pas ce champ — imposable par défaut si absent.
    primes: c.primes ? c.primes.map(p => ({ ...p, imposable: p.imposable !== undefined ? p.imposable : true })) : [],
    commentaire: c.commentaire
  }
  showForm.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const removeContrat = (id) => {
  contrats.value = contrats.value.filter(c => c.id !== id)
  saveContrats()
  showToast('Contrat supprimé', 'success')
}

const formatDate = (d) => { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('fr-FR') }

const diffJours = (dateFin) => {
  if (!dateFin) return null
  return Math.round((new Date(dateFin) - today) / (1000 * 60 * 60 * 24))
}

const searchQuery = ref('')
const filteredContrats = computed(() => {
  const q = searchQuery.value.toLowerCase()
  return contratsWithStatut.value.filter(c =>
    !q || c.empNom.toLowerCase().includes(q) || (c.poste || '').toLowerCase().includes(q) || c.type.toLowerCase().includes(q)
  )
})

// ── Importation Excel
const fileInput = ref(null)
const isImporting = ref(false)

const triggerImport = () => {
  if (fileInput.value) fileInput.value.click()
}

const parseDateFromExcel = (val) => {
  if (!val) return ''
  // Si c'est un numéro série Excel
  if (!isNaN(val) && val > 20000) {
    const d = new Date(Math.round((val - 25569) * 864e5))
    return d.toISOString().split('T')[0]
  }
  // Si c'est une string JJ/MM/AAAA
  if (typeof val === 'string') {
    const parts = val.split('/')
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    return val // YYYY-MM-DD
  }
  return val
}

const importExcel = async (e) => {
  const file = e.target.files[0]
  if (!file) return
  isImporting.value = true
  const formData = new FormData()
  formData.append('file', file)
  
  try {
    const res = await fetch('/api/rh/extract-data', { method: 'POST', body: formData })
    const data = await res.json()
    if (!data.success) throw new Error(data.error)
    
    if (data.data.length === 0) throw new Error("Fichier vide")
    
    // Auto-map headers
    const headers = Object.keys(data.data[0])
    const columnMap = {} 
    
    const fieldMappings = [
      { key: 'nom', keywords: ['nom', 'employe', 'salarie'] },
      { key: 'type', keywords: ['type', 'contrat'] },
      { key: 'dateDebut', keywords: ['debut', 'embauche', 'entree'] },
      { key: 'dateFin', keywords: ['fin', 'sortie', 'echeance'] },
      { key: 'poste', keywords: ['poste', 'fonction'] },
      // "sursalaire" contient "salaire" comme sous-chaîne : il doit être détecté AVANT le
      // mapping générique "salaireDeBase" pour ne pas lui voler sa colonne.
      { key: 'sursalaire', keywords: ['sursalaire', 'sur-salaire', 'sur salaire'] },
      { key: 'salaireDeBase', keywords: ['salaire', 'brut'] },
      { key: 'primeTransport', keywords: ['prime_transport', 'prime transport'] },
      { key: 'primeLogement', keywords: ['prime_logement', 'prime logement'] },
      { key: 'primeFonction', keywords: ['prime_fonction', 'prime fonction'] },
      { key: 'primeResponsabilite', keywords: ['prime_responsabilite', 'prime responsabilite', 'prime responsabilité'] }
    ]
    
    const usedHeaders = new Set()
    fieldMappings.forEach(field => {
      const match = headers.find(h => {
        if (usedHeaders.has(h)) return false
        const hLow = h.toLowerCase()
        return field.keywords.some(kw => hLow.includes(kw))
      })
      if (match) {
        columnMap[match] = field.key
        usedHeaders.add(match)
      }
    })
    
    // Process rows
    let added = 0
    for (const rawRow of data.data) {
      const mapped = {}
      for (const [header, val] of Object.entries(rawRow)) {
        if (columnMap[header]) mapped[columnMap[header]] = val
      }
      if (!mapped.nom || !mapped.dateDebut) continue // Skip invalid rows
      
      // Try to link with employee
      const nomLow = mapped.nom.toString().toLowerCase()
      const emp = employees.value.find(e => 
        (e.nom + ' ' + e.prenom).toLowerCase().includes(nomLow) || 
        (e.prenom + ' ' + e.nom).toLowerCase().includes(nomLow)
      )
      
      const newContrat = {
        id: Date.now() + Math.random(),
        employeeId: emp ? emp.id : '',
        empNomManuel: mapped.nom,
        type: (mapped.type || 'CDI').toUpperCase().includes('CDD') ? 'CDD' : 'CDI',
        dateDebut: parseDateFromExcel(mapped.dateDebut),
        dateFin: parseDateFromExcel(mapped.dateFin),
        poste: mapped.poste || '',
        salaireDeBase: mapped.salaireDeBase || '',
        sursalaire: mapped.sursalaire || '',
        primes: [
          ['Prime de transport', mapped.primeTransport],
          ['Prime de logement', mapped.primeLogement],
          ['Prime de fonction', mapped.primeFonction],
          ['Prime de responsabilité', mapped.primeResponsabilite]
        ].filter(([, montant]) => +montant > 0).map(([libelle, montant]) => ({ libelle, montant, imposable: true })),
        commentaire: 'Importé depuis Excel'
      }
      contrats.value.unshift(newContrat)
      added++
    }
    
    if (added > 0) {
      saveContrats()
      showToast(`${added} contrats importés avec succès`, 'success')
    } else {
      showToast("Aucun contrat valide trouvé", 'error')
    }
    
  } catch (err) {
    showToast("Erreur d'import : " + err.message, 'error')
  } finally {
    isImporting.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<template>
  <div class="contrats-wrapper">
    <!-- Header -->
    <div class="ctr-header">
      <div class="ctr-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      </div>
      <div>
        <h2 class="ctr-title">Contrats &amp; Alertes d'Échéance</h2>
        <p class="ctr-sub">{{ alertes.length }} alerte(s) active(s) · {{ contrats.length }} contrat(s) enregistré(s)</p>
      </div>
      
      <div style="margin-left:auto; display:flex; gap:0.5rem; align-items:center;">
        <a href="/api/rh/download/modele-contrats.xlsx" class="ctr-model-link" download title="Télécharger le modèle Excel à remplir puis importer">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Modèle Excel
        </a>
        <!-- Bouton Import -->
        <button class="ctr-import-btn" @click="triggerImport" :disabled="isImporting">
          <svg v-if="!isImporting" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
          <span v-else class="loader-spinner"></span>
          Importer
        </button>
        <input type="file" ref="fileInput" accept=".xlsx, .xls, .csv" style="display: none" @change="importExcel" />

        <button class="ctr-add-btn" @click="showForm = !showForm; editId = null; form = emptyForm()">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ajouter un contrat
        </button>
      </div>
    </div>

    <!-- Alertes prioritaires -->
    <div v-if="alertes.length > 0" class="alertes-section">
      <h3 class="section-title-alert">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Alertes d'échéance
      </h3>
      <div class="alertes-list">
        <div v-for="c in alertes" :key="c.id" class="alerte-item" :style="{ borderLeftColor: statutColor(calcStatut(c)) }">
          <div>
            <span class="alerte-emp">{{ c.empNomManuel || employees.find(e=>e.id===c.employeeId)?.nom || '—' }}</span>
            <span class="alerte-type"> · {{ c.type }}</span>
            <div class="alerte-details">
              {{ c.poste || 'Poste non spécifié' }} · Fin : {{ formatDate(c.dateFin) }}
            </div>
          </div>
          <div class="alerte-badge" :style="{ background: statutColor(calcStatut(c)) + '22', color: statutColor(calcStatut(c)) }">
            {{ calcStatut(c) === 'expire' ? 'Expiré' : diffJours(c.dateFin) !== null ? `J-${diffJours(c.dateFin)}` : '—' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Formulaire -->
    <div v-if="showForm" class="form-card">
      <h3 style="margin:0 0 1rem;font-size:0.9rem;font-weight:700;color:#334155;">{{ editId ? 'Modifier le contrat' : 'Ajouter un contrat' }}</h3>
      <div class="form-grid">
        <div class="form-field">
          <label class="fl">Employé</label>
          <EmployeeSelect :employees="employees" @select="(e) => form.employeeId = e ? e.id : ''" placeholder="Sélectionner ou vider..." />
          <div v-if="form.employeeId" style="margin-top: 0.25rem; font-size: 0.75rem; color: #10b981;">
            Lié à : {{ employees.find(e => e.id === form.employeeId)?.prenom }} {{ employees.find(e => e.id === form.employeeId)?.nom }}
            <button @click="form.employeeId = ''" style="margin-left: 0.5rem; background: none; border: none; color: #64748b; text-decoration: underline; cursor: pointer;">Détacher</button>
          </div>
        </div>
        <div class="form-field">
          <label class="fl">Type de contrat</label>
          <select class="fi" v-model="form.type">
            <option>CDI</option><option>CDD</option><option>Stage</option><option>Intérim</option><option>Essai</option>
          </select>
        </div>
        <div class="form-field">
          <label class="fl">Poste</label>
          <input type="text" class="fi" v-model="form.poste" placeholder="Ex: Chef comptable" />
        </div>
        <div class="form-field">
          <label class="fl">Salaire de base</label>
          <input type="number" class="fi" v-model="form.salaireDeBase" placeholder="0" />
        </div>
        <div class="form-field">
          <label class="fl">Sursalaire</label>
          <input type="number" class="fi" v-model="form.sursalaire" placeholder="0" />
        </div>
        <div class="form-field">
          <label class="fl">Date de début</label>
          <input type="date" class="fi" v-model="form.dateDebut" />
        </div>
        <div class="form-field">
          <label class="fl">Date de fin {{ form.type==='CDI'?'(facultatif)':'(obligatoire)' }}</label>
          <input type="date" class="fi" v-model="form.dateFin" :min="form.dateDebut" />
        </div>
        <div class="form-field" style="grid-column:1/-1;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.4rem;">
            <label class="fl">Primes</label>
            <button type="button" class="prime-add-btn" @click="addPrime()">+ Prime personnalisée</button>
          </div>
          <div class="prime-suggestions">
            <button type="button" v-for="s in PRIMES_SUGGESTIONS" :key="s" class="prime-suggest-chip" @click="addPrime(s)">+ {{ s }}</button>
          </div>
          <div v-if="form.primes.length === 0" style="font-size:0.78rem;color:#94a3b8;margin-top:0.4rem;">Aucune prime ajoutée.</div>
          <div v-for="(p, idx) in form.primes" :key="idx" class="prime-row">
            <input type="text" class="fi" v-model="p.libelle" placeholder="Ex: Prime de transport" />
            <input type="number" class="fi" v-model="p.montant" placeholder="0" />
            <label class="prime-imposable-toggle">
              <input type="checkbox" v-model="p.imposable" />
              Imposable
            </label>
            <button type="button" class="ct-btn danger" @click="removePrime(idx)" title="Supprimer">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
        <div class="form-field" style="grid-column:1/-1;">
          <label class="fl">Commentaire</label>
          <input type="text" class="fi" v-model="form.commentaire" placeholder="Note interne..." />
        </div>
        <div class="form-field" style="grid-column:1/-1;">
          <div class="total-brut-banner">Total brut mensuel : <strong>{{ totalBrutForm.toLocaleString('fr-FR') }} FCFA</strong></div>
        </div>
      </div>
      <div class="form-footer">
        <button class="btn-cancel" @click="showForm=false;editId=null;form=emptyForm()">Annuler</button>
        <button class="btn-save" @click="addOrUpdateContrat">{{ editId ? 'Enregistrer les modifications' : 'Ajouter le contrat' }}</button>
      </div>
    </div>

    <!-- Liste des contrats -->
    <div class="contrats-list-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.85rem;flex-wrap:wrap;gap:0.5rem;">
        <h3 style="margin:0;font-size:0.88rem;font-weight:700;color:#334155;">Tous les contrats</h3>
        <input class="fi" style="width:auto;min-width:220px;" v-model="searchQuery" placeholder="Rechercher employé, poste..." />
      </div>
      <div v-if="filteredContrats.length===0" class="empty-state">Aucun contrat enregistré. Ajoutez-en un ci-dessus.</div>
      <div v-else class="contrats-table">
        <div class="ct-header">
          <span>Employé</span><span>Type</span><span>Poste</span><span>Dates</span><span>Statut</span><span></span>
        </div>
        <div v-for="c in filteredContrats" :key="c.id" class="ct-row">
          <span class="ct-emp">{{ c.empNom }}</span>
          <span class="ct-type-badge" :style="{ background: c.type==='CDI'?'#dbeafe':'#fef3c7', color: c.type==='CDI'?'#1d4ed8':'#92400e' }">{{ c.type }}</span>
          <span class="ct-poste">{{ c.poste || '—' }}</span>
          <span class="ct-dates">{{ formatDate(c.dateDebut) }} → {{ c.dateFin ? formatDate(c.dateFin) : '∞' }}</span>
          <span class="ct-statut-badge" :style="{ background: statutColor(c.statut)+'22', color: statutColor(c.statut) }">{{ statutLabel(c.statut) }}</span>
          <div class="ct-actions">
            <button class="ct-btn" @click="editContrat(c)" title="Modifier">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="ct-btn danger" @click="removeContrat(c.id)" title="Supprimer">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contrats-wrapper { padding: 1.5rem; }
.ctr-header { display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;padding:1.1rem 1.4rem;background:linear-gradient(135deg,#065f46 0%,#059669 100%);border-radius:14px;color:white; }
.ctr-icon { width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
.ctr-title { margin:0;font-size:1.05rem;font-weight:800; }
.ctr-sub { margin:0;font-size:0.78rem;opacity:0.8; }
.ctr-add-btn, .ctr-import-btn { display:flex;align-items:center;gap:0.4rem;padding:0.5rem 1rem;background:rgba(255,255,255,0.15);color:white;border:1.5px solid rgba(255,255,255,0.3);border-radius:9px;cursor:pointer;font-weight:700;font-size:0.82rem;white-space:nowrap; transition:all 0.15s; }
.ctr-add-btn:hover, .ctr-import-btn:hover { background: rgba(255,255,255,0.25); }
.ctr-import-btn:disabled { opacity:0.5; cursor:not-allowed; }
.ctr-model-link { display:flex;align-items:center;gap:0.4rem;padding:0.5rem 0.85rem;color:white;text-decoration:underline;font-weight:600;font-size:0.8rem;white-space:nowrap;opacity:0.9; }
.ctr-model-link:hover { opacity:1; }

.loader-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: white; border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }

.alertes-section { background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:1.1rem;margin-bottom:1rem; }
.section-title-alert { display:flex;align-items:center;gap:0.5rem;margin:0 0 0.85rem;font-size:0.84rem;font-weight:700;color:#92400e; }
.alertes-list { display:flex;flex-direction:column;gap:0.5rem; }
.alerte-item { display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.65rem 0.85rem;background:white;border-left:4px solid;border-radius:0 8px 8px 0;box-shadow:0 1px 3px rgba(0,0,0,0.04); }
.alerte-emp { font-weight:700;color:#1e293b;font-size:0.87rem; }
.alerte-type { color:#64748b;font-size:0.84rem; }
.alerte-details { font-size:0.76rem;color:#94a3b8;margin-top:1px; }
.alerte-badge { padding:0.2rem 0.65rem;border-radius:20px;font-size:0.75rem;font-weight:800;flex-shrink:0; }
.form-card { background:white;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin-bottom:1rem; }
.form-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.75rem; }
.form-field { display:flex;flex-direction:column;gap:3px; }
.fl { font-size:0.76rem;font-weight:600;color:#475569; }
.fi { padding:0.55rem 0.75rem;border:1px solid #e2e8f0;border-radius:8px;font-size:0.84rem;background:#f8fafc;font-family:inherit;box-sizing:border-box;width:100%; }
.fi:focus { outline:none;border-color:#059669;background:white; }
.form-footer { display:flex;gap:0.75rem;margin-top:1rem;justify-content:flex-end; }
.prime-add-btn { background:none;border:none;color:#059669;font-weight:700;font-size:0.76rem;cursor:pointer;text-decoration:underline; }
.prime-suggestions { display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.5rem; }
.prime-suggest-chip { background:#f0fdf4;border:1px dashed #86efac;color:#059669;border-radius:9999px;padding:0.25rem 0.7rem;font-size:0.74rem;font-weight:600;cursor:pointer;transition:all 0.15s; }
.prime-suggest-chip:hover { background:#dcfce7;border-style:solid; }
.prime-row { display:grid;grid-template-columns:2fr 1fr auto auto;gap:0.5rem;margin-top:0.4rem;align-items:center; }
.prime-imposable-toggle { display:flex;align-items:center;gap:0.3rem;font-size:0.74rem;color:#475569;white-space:nowrap;cursor:pointer; }
.total-brut-banner { background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:0.6rem 0.85rem;font-size:0.84rem;color:#065f46; }
.btn-cancel { padding:0.5rem 1rem;border:1px solid #e2e8f0;background:white;color:#64748b;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.84rem; }
.btn-save { padding:0.5rem 1.25rem;background:#059669;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.84rem; }
.contrats-list-section { background:white;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem; }
.empty-state { text-align:center;color:#94a3b8;font-size:0.85rem;padding:2rem;background:#f8fafc;border-radius:8px; }
.contrats-table { display:flex;flex-direction:column; }
.ct-header { display:grid;grid-template-columns:2fr 1fr 2fr 2fr 1fr 60px;padding:0.6rem 1rem;font-size:0.72rem;font-weight:700;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0; }
.ct-row { display:grid;grid-template-columns:2fr 1fr 2fr 2fr 1fr 60px;padding:0.85rem 1rem;align-items:center;border-bottom:1px solid #f1f5f9;gap:0.5rem;font-size:0.84rem; }
.ct-emp { font-weight:700;color:#1e293b; }
.ct-type-badge { padding:0.2rem 0.5rem;border-radius:6px;font-size:0.72rem;font-weight:800;display:inline-block;text-align:center;white-space:nowrap; }
.ct-poste { color:#475569;font-weight:500; }
.ct-dates { color:#64748b;font-size:0.78rem;font-family:monospace; }
.ct-statut-badge { padding:0.2rem 0.5rem;border-radius:20px;font-size:0.72rem;font-weight:800;text-align:center;white-space:nowrap; }
.ct-actions { display:flex;gap:0.4rem;justify-content:flex-end; }
.ct-btn { padding:0.35rem;background:white;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;color:#64748b;display:flex;align-items:center;justify-content:center;transition:all 0.15s; }
.ct-btn:hover { border-color:#94a3b8;color:#1e293b;background:#f8fafc; }
.ct-btn.danger:hover { border-color:#fca5a5;color:#ef4444;background:#fef2f2; }
</style>
