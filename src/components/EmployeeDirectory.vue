<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { localDb } from '../services/localDatabase.js'
import { getCountryRules } from '../services/countryConfig.js'
import { showToast } from '../services/toast.js'
import { showConfirm } from '../services/confirmModal.js'

const props = defineProps({
  country: {
    type: String,
    default: 'CI'
  }
})

const countryRules = computed(() => getCountryRules(props.country))
const fcfa = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + countryRules.value.currency

const employees = ref([])
const loading = ref(true)
const searchQuery = ref('')
const selectedEmployee = ref(null)

const loadEmployees = async () => {
  loading.value = true
  try {
    employees.value = await localDb.getEmployees()
  } catch (e) {
    console.error("Erreur de chargement des employés", e)
  }
  loading.value = false
}

onMounted(() => {
  loadEmployees()
})

const filteredEmployees = computed(() => {
  if (!searchQuery.value) return employees.value
  const q = searchQuery.value.toLowerCase()
  return employees.value.filter(e =>
    (e.nom || '').toLowerCase().includes(q) ||
    (e.prenom || '').toLowerCase().includes(q) ||
    (e.matricule || '').toLowerCase().includes(q) ||
    (e.poste || '').toLowerCase().includes(q) ||
    (e.telephone || '').toLowerCase().includes(q)
  )
})

const currentPage = ref(1)
const pageSize = ref(12)

const totalPages = computed(() => {
  return Math.ceil(filteredEmployees.value.length / pageSize.value) || 1
})

const paginatedEmployees = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredEmployees.value.slice(start, end)
})

watch(searchQuery, () => {
  currentPage.value = 1
})
const deleteEmployee = async (id) => {
  const ok = await showConfirm('Voulez-vous vraiment supprimer cet employé de la base locale ? Cette action est irréversible.', {
    title: 'Supprimer l\'employé',
    confirmLabel: 'Supprimer',
    cancelLabel: 'Annuler',
    type: 'danger'
  })
  if (!ok) return
  try {
    await localDb.deleteEmployee(id)
    await loadEmployees()
  } catch (e) {
    showToast("Erreur lors de la suppression.", 'error')
  }
}

const editEmployee = (emp) => {
  const clone = JSON.parse(JSON.stringify(emp)) // Clone
  if (!clone.statut_salarie) clone.statut_salarie = 'local'
  selectedEmployee.value = clone
}

const saveEmployee = async () => {
  if (!selectedEmployee.value.nom || !selectedEmployee.value.nom.trim()) {
    showToast("Le nom complet est obligatoire", 'error')
    return
  }
  // La composition de la rémunération appartient au contrat, pas à la fiche :
  // la même donnée à deux endroits finit toujours par diverger. On ne demande
  // ici que le net de référence, et il reste facultatif.
  if (selectedEmployee.value.salaire_net !== undefined && selectedEmployee.value.salaire_net !== ''
      && parseFloat(selectedEmployee.value.salaire_net) < 0) {
    showToast("Le salaire net ne peut pas être négatif", 'error')
    return
  }
  if (!selectedEmployee.value.date_embauche) {
    showToast("La date d'embauche est obligatoire pour le calcul de l'ancienneté", 'error')
    return
  }
  try {
    await localDb.saveEmployee(selectedEmployee.value)
    selectedEmployee.value = null
    await loadEmployees()
  } catch (e) {
    showToast("Erreur lors de la sauvegarde", 'error')
  }
}

const fileInput = ref(null)
const isImporting = ref(false)

const triggerImport = () => {
  if (fileInput.value) fileInput.value.click()
}

/**
 * Import du classeur unique : ENTREPRISE, EMPLOYES, CONTRATS.
 *
 * Le matricule fait le lien entre une fiche et son contrat. Un salarié sans
 * matricule est apparié par nom et prénom — et à défaut créé, jamais fusionné
 * au hasard avec un homonyme approximatif.
 */
const importExcel = async (e) => {
  const file = e.target.files[0]
  if (!file) return
  isImporting.value = true
  const formData = new FormData()
  formData.append('file', file)

  try {
    const token = localStorage.getItem('auth_token')
    const res = await fetch('/api/rh/import/classeur', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) throw new Error(data.error || "Le classeur n'a pas pu être lu.")

    const existants = await localDb.getEmployees()
    const parMatricule = new Map()
    let ajoutes = 0
    let majs = 0

    for (const ligne of data.employes || []) {
      const existant = existants.find(x =>
        (ligne.matricule && x.matricule === ligne.matricule) ||
        (!ligne.matricule && x.nom === ligne.nom && (x.prenom || '') === (ligne.prenom || ''))
      )
      const fiche = { ...(existant || {}), ...ligne }
      if (existant) { fiche.id = existant.id; majs++ } else { ajoutes++ }
      const enregistre = await localDb.saveEmployee(fiche)
      const id = (enregistre && enregistre.id) || fiche.id
      if (ligne.matricule && id) parMatricule.set(ligne.matricule, id)
    }

    // Les contrats sont rattachés par matricule à la fiche qui vient d'être
    // enregistrée : c'est le contrat qui porte la rémunération.
    let contratsRepris = 0
    if (Array.isArray(data.contrats) && data.contrats.length) {
      const dejaLa = JSON.parse(localStorage.getItem('onda_contrats') || '[]')
      for (const c of data.contrats) {
        const employeeId = parMatricule.get(c.matricule)
        if (!employeeId) continue
        const jumeau = dejaLa.find(x =>
          String(x.employeeId) === String(employeeId) && (x.dateDebut || '') === (c.dateDebut || '')
        )
        const contrat = {
          id: jumeau ? jumeau.id : Date.now() + Math.floor(Math.random() * 1000),
          employeeId,
          type: c.type, dateDebut: c.dateDebut, dateFin: c.dateFin, poste: c.poste,
          salaireDeBase: c.salaireDeBase, sursalaire: c.sursalaire, primes: c.primes,
          commentaire: jumeau ? jumeau.commentaire : ''
        }
        if (jumeau) Object.assign(jumeau, contrat)
        else dejaLa.push(contrat)
        contratsRepris++
      }
      localStorage.setItem('onda_contrats', JSON.stringify(dejaLa))
    }

    // Le volet entreprise sert d'en-tête à tous les documents générés.
    if (data.entreprise && data.entreprise.raisonSociale) {
      await localDb.saveSetting('entreprise', data.entreprise)
    }

    const parts = []
    if (ajoutes) parts.push(`${ajoutes} salarié(s) ajouté(s)`)
    if (majs) parts.push(`${majs} mis à jour`)
    if (contratsRepris) parts.push(`${contratsRepris} contrat(s) repris`)
    if (data.entreprise && data.entreprise.raisonSociale) parts.push('profil entreprise enregistré')
    showToast(parts.length ? parts.join(', ') + '.' : 'Rien à importer dans ce classeur.', parts.length ? 'success' : 'info')

    for (const avertissement of data.avertissements || []) {
      showToast(avertissement, 'info')
    }
    await loadEmployees()
  } catch (err) {
    showToast("Erreur lors de l'import : " + err.message, 'error')
  } finally {
    isImporting.value = false
    e.target.value = null
  }
}


</script>

<template>
  <div class="directory-wrapper animate-in">
    <!-- HEADER -->
    <div class="directory-header">
      <div class="header-info">
        <h2>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          Annuaire des Employés
        </h2>
        <p>Gérez vos salariés de manière 100% confidentielle dans votre navigateur (IndexedDB).</p>
        <p class="header-note">
          La fiche décrit <strong>qui est le salarié</strong> ; son <strong>contrat</strong> décrit
          ce qu'il perçoit. Le classeur d'import contient les deux, plus le profil de l'entreprise.
        </p>
      </div>
      <a href="/api/rh/download/modele-paie.xlsx" download class="btn-download-model">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Modèle d'import (entreprise · employés · contrats)
      </a>
    </div>

    <!-- LISTE ET RECHERCHE -->
    <div v-if="!selectedEmployee">
      <div class="controls-bar">
        <div class="search-input-wrapper">
          <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" v-model="searchQuery" placeholder="Rechercher par nom, matricule, poste, téléphone..." />
        </div>
        
        <input type="file" ref="fileInput" accept=".xlsx, .xls" style="display: none" @change="importExcel" />
        
        <div class="action-buttons">
          <button @click="triggerImport" :disabled="isImporting" class="btn-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            {{ isImporting ? 'Import en cours...' : 'Importer Excel' }}
          </button>
          
          <button @click="editEmployee({})" class="btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span class="btn-text">Ajouter un Employé</span>
          </button>
        </div>
      </div>

      <div v-if="loading" class="state-container">
        <div class="loader"></div>
        <p>Chargement des employés...</p>
      </div>
      
      <div v-else-if="filteredEmployees.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        </div>
        <h3>Aucun employé trouvé</h3>
        <p>Votre base de données locale est vide ou aucun résultat ne correspond à votre recherche.</p>
        <button @click="editEmployee({})" class="btn-primary-outline">Créer le premier employé</button>
      </div>

      <div v-else class="directory-content">
        <!-- Desktop Table view -->
        <div class="table-container-responsive desktop-only">
          <table class="employees-table">
            <thead>
              <tr>
                <th>Employé</th>
                <th>Matricule</th>
                <th>Poste</th>
                <th style="text-align: right;">Salaire net</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="emp in paginatedEmployees" :key="emp.id" class="employee-row">
                <td>
                  <div class="employee-identity">
                    <div class="avatar-circle">
                      {{ (emp.nom || 'E').charAt(0).toUpperCase() }}
                    </div>
                    <div>
                      <div class="emp-name">{{ emp.nom }} {{ emp.prenom }}</div>
                      <div class="emp-date" v-if="emp.telephone">{{ emp.telephone }}</div>
                      <div class="emp-date" v-else-if="emp.date_embauche">Recruté le {{ new Date(emp.date_embauche).toLocaleDateString('fr-FR') }}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="badge-matricule">{{ emp.matricule || 'Non spécifié' }}</span>
                </td>
                <td>
                  <span class="emp-poste-cell">{{ emp.poste || '—' }}</span>
                </td>
                <td style="text-align: right; font-weight: 700; color: #ffffff;">
                  {{ emp.salaire_net ? fcfa(emp.salaire_net) : String.fromCharCode(8212) }}
                </td>
                <td>
                  <div class="row-actions">
                    <button @click="editEmployee(emp)" class="btn-icon-edit" title="Modifier">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg>
                    </button>
                    <button @click="deleteEmployee(emp.id)" class="btn-icon-delete" title="Supprimer">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Card view -->
        <div class="mobile-only mobile-cards-container">
          <div v-for="emp in paginatedEmployees" :key="emp.id" class="employee-mobile-card animate-in">
            <div class="mobile-card-header">
              <div class="employee-identity">
                <div class="avatar-circle">
                  {{ (emp.nom || 'E').charAt(0).toUpperCase() }}
                </div>
                <div>
                  <div class="emp-name">{{ emp.nom }} {{ emp.prenom }}</div>
                  <div class="emp-date" v-if="emp.date_embauche">Recruté le {{ new Date(emp.date_embauche).toLocaleDateString('fr-FR') }}</div>
                </div>
              </div>
              <div class="row-actions">
                <button @click="editEmployee(emp)" class="btn-icon-edit" title="Modifier">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg>
                </button>
                <button @click="deleteEmployee(emp.id)" class="btn-icon-delete" title="Supprimer">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </div>
            
            <div class="mobile-card-details">
              <div class="mobile-detail-row">
                <span class="mobile-detail-label">Matricule :</span>
                <span class="badge-matricule">{{ emp.matricule || 'Non spécifié' }}</span>
              </div>
              <div class="mobile-detail-row">
                <span class="mobile-detail-label">Poste :</span>
                <span class="emp-poste-cell">{{ emp.poste || '—' }}</span>
              </div>
              <div class="mobile-detail-row" v-if="emp.telephone">
                <span class="mobile-detail-label">Téléphone :</span>
                <span>{{ emp.telephone }}</span>
              </div>
              <div class="mobile-detail-row">
                <span class="mobile-detail-label">Salaire net :</span>
                <span class="mobile-salary-val" style="font-weight: 700; color: #ffffff;">{{ emp.salaire_net ? fcfa(emp.salaire_net) : String.fromCharCode(8212) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="pagination-container">
          <button @click="currentPage--" :disabled="currentPage === 1" class="btn-pag">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            Précédent
          </button>
          <span class="pag-info">Page {{ currentPage }} sur {{ totalPages }}</span>
          <button @click="currentPage++" :disabled="currentPage === totalPages" class="btn-pag">
            Suivant
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- EDITEUR INDIVIDUEL -->
    <div v-else class="employee-editor">
      <div class="editor-header">
        <h3>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          {{ selectedEmployee.id ? 'Éditer la fiche salarié' : 'Créer une fiche salarié' }}
        </h3>
        <button @click="selectedEmployee = null" class="btn-close">&times;</button>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label>Nom Complet <span class="req">*</span></label>
          <input v-model="selectedEmployee.nom" type="text" placeholder="ex. N'Guessan" />
        </div>
        <div class="form-group">
          <label>Prénom(s)</label>
          <input v-model="selectedEmployee.prenom" type="text" placeholder="ex. Koffi Emmanuel" />
        </div>
        <div class="form-group">
          <label>Matricule</label>
          <input v-model="selectedEmployee.matricule" type="text" placeholder="ex. EMP-2026-004" />
        </div>
        <div class="form-group">
          <label>Poste occupé</label>
          <input v-model="selectedEmployee.poste" type="text" placeholder="ex. Directeur des Opérations" />
        </div>
        <div class="form-group">
          <label>Numéro de téléphone</label>
          <input v-model="selectedEmployee.telephone" type="text" placeholder="ex. +225 07 00 00 00" />
        </div>
        <div class="form-group">
          <label>Salaire net de référence ({{ getCountryRules(props.country).currency }})</label>
          <input v-model="selectedEmployee.salaire_net" type="number" placeholder="ex. 385000" />
          <small class="champ-aide">
            Montant effectivement versé. Le salaire de base, le sursalaire et les primes
            se déclarent dans le <strong>contrat</strong> : ce sont eux qui servent au calcul.
          </small>
        </div>
        <div class="form-group">
          <label>Date d'embauche <span class="req">*</span></label>
          <input v-model="selectedEmployee.date_embauche" type="date" />
        </div>
        <div class="form-group">
          <label>Numéro CNPS</label>
          <input v-model="selectedEmployee.numero_cnps" type="text" placeholder="ex. 123456-A" />
        </div>
        <div class="form-group">
          <label>Sexe</label>
          <select v-model="selectedEmployee.genre">
            <option value="">-- Non renseigné --</option>
            <option value="M">Homme</option>
            <option value="F">Femme</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date de naissance</label>
          <input v-model="selectedEmployee.date_naissance" type="date" />
        </div>
        <div class="form-group">
          <label>Catégorie professionnelle</label>
          <select v-model="selectedEmployee.categorie_professionnelle">
            <option value="">-- Non renseignée --</option>
            <option value="cadre">Cadre</option>
            <option value="employe">Employé</option>
          </select>
          <small class="champ-aide">
            Alimente la répartition Cadres/Employés du tableau de bord RH.
          </small>
        </div>
        <div class="form-group">
          <label>Situation matrimoniale</label>
          <select v-model="selectedEmployee.situation_matrimoniale">
            <option value="">-- Non renseignée --</option>
            <option value="celibataire">Célibataire</option>
            <option value="marie">Marié(e)</option>
            <option value="divorce">Divorcé(e)</option>
            <option value="veuf">Veuf(ve)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Nombre d'enfants (à charge)</label>
          <input v-model="selectedEmployee.nombre_enfants" type="number" min="0" placeholder="ex. 2" />
        </div>
        <div class="form-group">
          <label>Expatrié ?</label>
          <select v-model="selectedEmployee.statut_salarie">
            <option value="local">Non</option>
            <option value="expatrie">Oui</option>
          </select>
          <small class="champ-aide">
            L'employeur paie une T.A.S.P plus élevée sur un salarié expatrié : ce statut sert au calcul du bulletin.
          </small>
        </div>
      </div>

      <div class="editor-footer">
        <button @click="selectedEmployee = null" class="btn-cancel">Annuler</button>
        <button @click="saveEmployee" class="btn-save">Enregistrer les modifications</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.champ-aide {
  display: block; margin-top: 6px; font-size: 0.74rem;
  color: #64748b; line-height: 1.45;
}
.header-note {
  margin-top: 4px; font-size: 0.78rem; color: #64748b; line-height: 1.5;
}
.directory-wrapper {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: inherit;
  color: #0f172a;
}

/* Header */
.directory-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.header-info h2 {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0 0.5rem 0;
}

.header-info p {
  font-size: 0.9rem;
  color: #64748b;
  margin: 0;
}

.btn-download-model {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(16, 185, 129, 0.1);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
  padding: 0.6rem 1.2rem;
  border-radius: 10px;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.85rem;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
}

.btn-download-model:hover {
  background: rgba(16, 185, 129, 0.2);
  transform: translateY(-1px);
}

/* Controls Bar */
.controls-bar {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.search-input-wrapper {
  position: relative;
  flex: 1;
  min-width: 250px;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}

.search-input-wrapper input {
  width: 100%;
  padding: 0.75rem 1rem 0.75rem 2.5rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #0f172a;
  font-size: 0.9rem;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}

.search-input-wrapper input:focus {
  border-color: #3b82f6;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.action-buttons {
  display: flex;
  gap: 0.75rem;
}

.btn-secondary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #ffffff;
  color: #475569;
  border: 1px solid #e2e8f0;
  padding: 0.75rem 1.25rem;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85rem;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.25);
}

.btn-primary:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(59, 130, 246, 0.35);
}

/* Empty States */
.empty-state {
  padding: 4rem 2rem;
  text-align: center;
  background: #f8fafc;
  border-radius: 16px;
  border: 2px dashed #e2e8f0;
  margin-top: 1rem;
}

.empty-icon {
  color: #94a3b8;
  margin-bottom: 1rem;
}

.empty-state h3 {
  color: #0f172a;
  margin: 0 0 0.5rem 0;
  font-size: 1.2rem;
}

.empty-state p {
  color: #64748b;
  font-size: 0.9rem;
  margin: 0 0 1.5rem 0;
}

.btn-primary-outline {
  background: transparent;
  color: #3b82f6;
  border: 1px solid #3b82f6;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.btn-primary-outline:hover {
  background: #eff6ff;
}

/* Loading States */
.state-container {
  padding: 4rem;
  text-align: center;
  color: #64748b;
}

.loader {
  width: 24px;
  height: 24px;
  border: 3px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem auto;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Table Design */
.table-container-responsive {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
  overflow: auto;
  max-height: 480px;
}

.employees-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.9rem;
}

.employees-table th {
  background: #f8fafc;
  color: #475569;
  font-weight: 700;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: inset 0 -1px 0 #e2e8f0;
}

.employees-table td {
  padding: 1.1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  color: #475569;
  background: transparent !important;
}

.employee-row {
  transition: background 0.15s;
  background: transparent !important;
}

.employee-row:hover {
  background: #f8fafc !important;
}

.employee-identity {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.avatar-circle {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(3, 105, 161, 0.2) 100%);
  color: #3b82f6;
  border: 1px solid rgba(56, 189, 248, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.95rem;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
}

.emp-name {
  font-weight: 700;
  color: #0f172a;
}

.emp-date {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 2px;
}

.badge-matricule {
  display: inline-block;
  background: #f1f5f9;
  color: #475569;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid #e2e8f0;
}

.emp-poste-cell {
  font-weight: 500;
  color: #64748b;
}

/* Actions in Table */
.row-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn-icon-edit, .btn-icon-delete {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon-edit {
  color: #64748b;
}

.btn-icon-edit:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #0f172a;
}

.btn-icon-delete {
  color: #ef4444;
}

.btn-icon-delete:hover {
  background: #fef2f2;
  border-color: #fecaca;
  color: #dc2626;
}

/* Pagination */
.pagination-container {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1.5rem;
  margin-top: 2rem;
}

.btn-pag {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  color: #475569;
  font-weight: 700;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.btn-pag:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.btn-pag:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.pag-info {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 700;
}

/* Employee Editor */
.employee-editor {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e2e8f0;
}

.editor-header h3 {
  margin: 0;
  color: #0f172a;
  font-size: 1.25rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #64748b;
  font-size: 1.75rem;
  line-height: 1;
  transition: color 0.2s;
}

.btn-close:hover {
  color: #0f172a;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #475569;
}

.form-group label .req {
  color: #ef4444;
}

.form-group input,
.form-group select {
  padding: 0.75rem 1rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #0f172a;
  font-size: 0.9rem;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
  font-family: inherit;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  background: #ffffff;
}

.editor-footer {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.btn-cancel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  color: #64748b;
  padding: 0.75rem 1.5rem;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.btn-save {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  padding: 0.75rem 1.75rem;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85rem;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
}

.btn-save:hover {
  background: linear-gradient(135deg, #34d399 0%, #047857 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(16, 185, 129, 0.4);
}

/* Responsive visibility */
@media (min-width: 641px) {
  .desktop-only {
    display: block !important;
  }
  .mobile-only {
    display: none !important;
  }
}

@media (max-width: 640px) {
  .desktop-only {
    display: none !important;
  }
  .mobile-only {
    display: block !important;
  }
  
  .directory-wrapper {
    padding: 0.5rem 0.25rem !important;
  }
  
  /* Squeeze directory header */
  .directory-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
    text-align: center;
    margin-bottom: 1.25rem;
  }
  
  .header-info h2 {
    justify-content: center;
    font-size: 1.25rem;
  }
  
  .btn-download-model {
    justify-content: center;
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
  }
  
  /* Squeeze controls bar */
  .controls-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }
  
  .action-buttons {
    width: 100%;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  
  .action-buttons .btn-secondary {
    flex: 1;
    justify-content: center;
    padding: 0 12px;
    height: 42px;
    font-size: 0.8rem;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    display: flex;
    align-items: center;
  }
  
  .action-buttons .btn-primary {
    flex: 0 0 42px;
    width: 42px;
    height: 42px;
    padding: 0 !important;
    justify-content: center;
    align-items: center;
    border-radius: 10px;
    display: flex;
  }
  
  .action-buttons .btn-primary .btn-text {
    display: none !important;
  }
  
  /* Mobile Cards */
  .mobile-cards-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .employee-mobile-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }
  
  .mobile-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 8px;
  }
  
  .mobile-card-details {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .mobile-detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
  }
  
  .mobile-detail-label {
    color: #64748b;
    font-weight: 500;
  }
}
</style>
