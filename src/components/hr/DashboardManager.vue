<script setup>
import { ref, computed, onMounted } from 'vue'
import { localDb } from '../../services/localDatabase.js'
import { getContracts } from '../../services/payrollInput.js'

const employees = ref([])
const conges = ref([])
const contrats = ref([])
const formations = ref([])

onMounted(async () => {
  try { employees.value = await localDb.getEmployees() } catch (e) { employees.value = [] }
  try { conges.value = await localDb.getAbsences() } catch (e) { conges.value = [] }
  try { formations.value = await localDb.getFormations() } catch (e) { formations.value = [] }
  contrats.value = getContracts()
})

const now = new Date()
now.setHours(0,0,0,0)
const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
const fmtMontant = (m) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(m)

// ══════════════════════════════════════════════
// INDICATEURS RH — inspiré de la feuille LOGIPAIE « 41-INDICATEURS RH »
// (effectifs / masse salariale répartis par sexe, contrat, catégorie,
// statut et tranche d'âge, plus mouvements et absences du mois).
// ══════════════════════════════════════════════

// Le contrat effectivement en vigueur AUJOURD'HUI pour un employé — distinct
// de `findActiveContract()` (utilisé pour préremplir un bulletin), qui replie
// sur le contrat le plus récent même expiré faute de mieux. Ici, un salarié
// dont le seul CDD est terminé ne doit compter dans aucune statistique
// d'effectif actif : sans ce filtre plus strict, la masse salariale et les
// répartitions incluraient des départs.
function contratEnVigueur(employeeId) {
  const mine = contrats.value.filter(c => String(c.employeeId) === String(employeeId))
  const enCours = mine.filter(c => {
    const debut = c.dateDebut ? new Date(c.dateDebut) : null
    const fin = c.dateFin ? new Date(c.dateFin) : null
    if (debut && debut > now) return false
    if (fin && fin < now) return false
    return true
  })
  if (!enCours.length) return null
  return enCours.slice().sort((a, b) => new Date(b.dateDebut || 0) - new Date(a.dateDebut || 0))[0]
}

const brutContrat = (c) =>
  (+c.salaireDeBase || 0) + (+c.sursalaire || 0) + (c.primes || []).reduce((s, p) => s + (+p.montant || 0), 0)

// --- KPIs ---
const kpiEmployees = computed(() => employees.value.length)
const actifs = computed(() => employees.value
  .map(emp => ({ emp, contrat: contratEnVigueur(emp.id) }))
  .filter(x => x.contrat))
const kpiActifs = computed(() => actifs.value.length)
const masseSalariale = computed(() => actifs.value.reduce((sum, x) => sum + brutContrat(x.contrat), 0))

// --- Répartitions (effectif + masse salariale) ---
function repartition(classifier) {
  const groupes = new Map()
  for (const { emp, contrat } of actifs.value) {
    const cle = classifier(emp, contrat)
    if (cle == null) continue
    if (!groupes.has(cle)) groupes.set(cle, { effectif: 0, montant: 0 })
    const g = groupes.get(cle)
    g.effectif += 1
    g.montant += brutContrat(contrat)
  }
  const totalEffectif = actifs.value.length || 1
  const totalMontant = masseSalariale.value || 1
  return Array.from(groupes.entries()).map(([label, g]) => ({
    label,
    effectif: g.effectif,
    montant: g.montant,
    pctEffectif: g.effectif / totalEffectif,
    pctMontant: g.montant / totalMontant
  }))
}

const repartitionSexe = computed(() => repartition((emp) =>
  emp.genre === 'M' ? 'Hommes' : emp.genre === 'F' ? 'Femmes' : null))
const repartitionContrat = computed(() => repartition((emp, c) => c.type || null))
const repartitionCategorie = computed(() => repartition((emp) =>
  emp.categorie_professionnelle === 'cadre' ? 'Cadres'
    : emp.categorie_professionnelle === 'employe' ? 'Employés' : null))
const repartitionStatut = computed(() => repartition((emp) =>
  emp.statut_salarie === 'expatrie' ? 'Expatriés' : 'Locaux'))

const TRANCHES_AGE = [
  { label: '< 25 ans', test: (age) => age < 25 },
  { label: '25-30 ans', test: (age) => age >= 25 && age <= 30 },
  { label: '30-40 ans', test: (age) => age > 30 && age <= 40 },
  { label: '40-50 ans', test: (age) => age > 40 && age <= 50 },
  { label: '> 50 ans', test: (age) => age > 50 }
]
const ageDe = (dateNaissance) => {
  if (!dateNaissance) return null
  const naissance = new Date(dateNaissance)
  if (isNaN(naissance.getTime())) return null
  return (now - naissance) / (1000 * 60 * 60 * 24 * 365.25)
}
const repartitionAge = computed(() => {
  const buckets = TRANCHES_AGE.map(b => ({ label: b.label, effectif: 0, montant: 0 }))
  for (const { emp, contrat } of actifs.value) {
    const age = ageDe(emp.date_naissance)
    if (age == null) continue
    const idx = TRANCHES_AGE.findIndex(b => b.test(age))
    if (idx === -1) continue
    buckets[idx].effectif += 1
    buckets[idx].montant += brutContrat(contrat)
  }
  const totalEffectif = actifs.value.length || 1
  const totalMontant = masseSalariale.value || 1
  return buckets.map(b => ({ ...b, pctEffectif: b.effectif / totalEffectif, pctMontant: b.montant / totalMontant }))
})

const indicateursRH = computed(() => [
  { titre: 'Sexe', rows: repartitionSexe.value },
  { titre: 'Type de contrat', rows: repartitionContrat.value },
  { titre: 'Catégorie professionnelle', rows: repartitionCategorie.value },
  { titre: 'Statut', rows: repartitionStatut.value },
  { titre: "Tranches d'âge", rows: repartitionAge.value }
])
const vueIndicateur = ref('effectifs') // 'effectifs' | 'masse'

// ══════════════════════════════════════════════
// ANALYSE DES SALAIRES — salaire moyen, ancienneté, parité, écart H/F,
// salaires par département et par sexe, salaire selon l'ancienneté.
// Le « salaire » est le brut mensuel du contrat en vigueur (brutContrat).
// ══════════════════════════════════════════════
const moyenne = (valeurs) => valeurs.length ? valeurs.reduce((s, v) => s + v, 0) / valeurs.length : null

const salaireMoyen = computed(() => kpiActifs.value ? masseSalariale.value / kpiActifs.value : null)

// L'ancienneté part de la date d'embauche de la fiche ; à défaut, du plus
// ancien contrat connu du salarié (un CDD renouvelé en CDI ne remet pas
// l'ancienneté à zéro).
function dateEntree(emp) {
  if (emp.date_embauche) return new Date(emp.date_embauche)
  const debuts = contrats.value
    .filter(c => String(c.employeeId) === String(emp.id) && c.dateDebut)
    .map(c => new Date(c.dateDebut))
  return debuts.length ? new Date(Math.min(...debuts)) : null
}
const ancienneteAns = (emp) => {
  const d = dateEntree(emp)
  if (!d || isNaN(d.getTime()) || d > now) return null
  return (now - d) / (1000 * 60 * 60 * 24 * 365.25)
}
const ancienneteMoyenne = computed(() =>
  moyenne(actifs.value.map(x => ancienneteAns(x.emp)).filter(a => a != null)))
const fmtAnciennete = (ans) => {
  if (ans == null) return '—'
  if (ans < 1) return `${Math.round(ans * 12)} mois`
  return `${ans.toFixed(1).replace('.', ',')} an${ans >= 2 ? 's' : ''}`
}

const actifsHommes = computed(() => actifs.value.filter(x => x.emp.genre === 'M'))
const actifsFemmes = computed(() => actifs.value.filter(x => x.emp.genre === 'F'))
const sexeRenseigne = computed(() => actifsHommes.value.length + actifsFemmes.value.length)
const pctFemmes = computed(() => sexeRenseigne.value ? actifsFemmes.value.length / sexeRenseigne.value : null)
const salaireMoyenHommes = computed(() => moyenne(actifsHommes.value.map(x => brutContrat(x.contrat))))
const salaireMoyenFemmes = computed(() => moyenne(actifsFemmes.value.map(x => brutContrat(x.contrat))))
// Écart exprimé en % du salaire moyen masculin (convention usuelle de
// l'index d'égalité) : positif = les hommes sont mieux payés en moyenne.
const ecartHF = computed(() => {
  if (!salaireMoyenHommes.value || salaireMoyenFemmes.value == null) return null
  return (salaireMoyenHommes.value - salaireMoyenFemmes.value) / salaireMoyenHommes.value
})
const fmtPct = (v, decimales = 1) => v == null ? '—' : `${(v * 100).toFixed(decimales).replace('.', ',')} %`

// --- Salaires par département et par sexe ---
const SANS_DEPARTEMENT = 'Non affecté'
const salairesParDepartement = computed(() => {
  const groupes = new Map()
  for (const { emp, contrat } of actifs.value) {
    const cle = (emp.departement || '').trim() || SANS_DEPARTEMENT
    if (!groupes.has(cle)) groupes.set(cle, { tous: [], H: [], F: [] })
    const g = groupes.get(cle)
    const brut = brutContrat(contrat)
    g.tous.push(brut)
    if (emp.genre === 'M') g.H.push(brut)
    if (emp.genre === 'F') g.F.push(brut)
  }
  return Array.from(groupes.entries())
    .map(([label, g]) => ({
      label,
      effectif: g.tous.length,
      nbH: g.H.length,
      nbF: g.F.length,
      moyenne: moyenne(g.tous),
      moyenneH: moyenne(g.H),
      moyenneF: moyenne(g.F)
    }))
    // « Non affecté » toujours en dernier, le reste par salaire moyen décroissant.
    .sort((a, b) => (a.label === SANS_DEPARTEMENT) - (b.label === SANS_DEPARTEMENT) || b.moyenne - a.moyenne)
})
const aucunDepartement = computed(() =>
  salairesParDepartement.value.every(d => d.label === SANS_DEPARTEMENT))
const maxSalaireDepartement = computed(() =>
  Math.max(1, ...salairesParDepartement.value.flatMap(d => [d.moyenneH || 0, d.moyenneF || 0, d.moyenne || 0])))

// --- Salaire et ancienneté ---
const TRANCHES_ANCIENNETE = [
  { label: '< 1 an', test: (a) => a < 1 },
  { label: '1-3 ans', test: (a) => a >= 1 && a < 3 },
  { label: '3-5 ans', test: (a) => a >= 3 && a < 5 },
  { label: '5-10 ans', test: (a) => a >= 5 && a < 10 },
  { label: '≥ 10 ans', test: (a) => a >= 10 }
]
const salaireParAnciennete = computed(() => {
  const buckets = TRANCHES_ANCIENNETE.map(t => ({ label: t.label, salaires: [] }))
  for (const { emp, contrat } of actifs.value) {
    const a = ancienneteAns(emp)
    if (a == null) continue
    const idx = TRANCHES_ANCIENNETE.findIndex(t => t.test(a))
    if (idx !== -1) buckets[idx].salaires.push(brutContrat(contrat))
  }
  return buckets.map(b => ({ label: b.label, effectif: b.salaires.length, moyenne: moyenne(b.salaires) }))
})
const maxSalaireAnciennete = computed(() =>
  Math.max(1, ...salaireParAnciennete.value.map(b => b.moyenne || 0)))
const largeurBarre = (valeur, max) => valeur ? Math.max(2, Math.round(valeur / max * 100)) + '%' : '0%'

// --- Mouvements et événements du mois ---
const estDansMoisCourant = (dateStr) => {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}
const chevaucheMoisCourant = (dateDebutStr, dateFinStr) => {
  if (!dateDebutStr) return false
  const d1 = new Date(dateDebutStr)
  const d2 = dateFinStr ? new Date(dateFinStr) : d1
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1)
  const finMois = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return d1 <= finMois && d2 >= debutMois
}

const embauchesMois = computed(() => contrats.value.filter(c => estDansMoisCourant(c.dateDebut)).length)
const departsMois = computed(() => contrats.value.filter(c => c.type === 'CDD' && estDansMoisCourant(c.dateFin)).length)
const employesFormesMois = computed(() => {
  const ids = new Set()
  for (const f of formations.value) {
    if (!chevaucheMoisCourant(f.dateDebut, f.dateFin)) continue
    for (const id of f.employeeIds || []) ids.add(id)
  }
  return ids.size
})
const arretsMaladieMois = computed(() =>
  conges.value.filter(a => a.type === 'maladie' && chevaucheMoisCourant(a.dateDebut, a.dateFin)).length)
const autresAbsencesMois = computed(() =>
  conges.value.filter(a => !['maladie', 'annuel'].includes(a.type) && chevaucheMoisCourant(a.dateDebut, a.dateFin)).length)

// --- Alertes Contrats ---
// Un contrat brut n'a jamais de `.statut` : ce champ n'existe que dans le
// calcul local de ContratsManager.vue, jamais persisté. Le filtrer dessus
// ici viderait systématiquement l'alerte — on se fie donc directement à la
// date de fin.
const alertesContrats = computed(() => {
  return contrats.value.filter(c => {
    if (!c.dateFin) return false
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
        <div class="kpi-label">Masse Salariale Brute (Active)</div>
        <div class="kpi-val" style="color: #059669;">{{ fmtMontant(masseSalariale) }}</div>
        <div class="kpi-sub">Base + sursalaire + primes, mensuelle</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Alertes Actives</div>
        <div class="kpi-val" style="color: #ef4444;">{{ alertesContrats.length + alertesConges.length }}</div>
        <div class="kpi-sub">Nécessitent votre attention</div>
      </div>
    </div>

    <!-- KPIs d'analyse salariale -->
    <div class="kpi-grid kpi-grid-4">
      <div class="kpi-card">
        <div class="kpi-label">Salaire moyen</div>
        <div class="kpi-val kpi-val-sm">{{ salaireMoyen == null ? '—' : fmtMontant(salaireMoyen) }}</div>
        <div class="kpi-sub">Brut mensuel, salariés sous contrat</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Ancienneté moyenne</div>
        <div class="kpi-val kpi-val-sm">{{ fmtAnciennete(ancienneteMoyenne) }}</div>
        <div class="kpi-sub">Depuis la date d'embauche</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Part des femmes</div>
        <div class="kpi-val kpi-val-sm" style="color: #db2777;">{{ fmtPct(pctFemmes) }}</div>
        <div class="kpi-sub">{{ actifsFemmes.length }} F · {{ actifsHommes.length }} H<template v-if="sexeRenseigne < kpiActifs"> · {{ kpiActifs - sexeRenseigne }} non renseigné(s)</template></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Écart salarial H/F</div>
        <div class="kpi-val kpi-val-sm" :style="{ color: ecartHF == null ? '#1e293b' : Math.abs(ecartHF) < 0.05 ? '#059669' : '#ea580c' }">{{ fmtPct(ecartHF) }}</div>
        <div class="kpi-sub" v-if="ecartHF == null">Nécessite au moins un homme et une femme</div>
        <div class="kpi-sub" v-else>{{ ecartHF >= 0 ? 'En faveur des hommes' : 'En faveur des femmes' }} (salaire moyen)</div>
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

    <!-- Analyse des salaires -->
    <div class="rh-indic-section" v-if="kpiActifs > 0">
      <h3 class="panel-title" style="color: #0f766e;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        Analyse des salaires
      </h3>
      <div class="sal-grid">
        <!-- Par département et par sexe -->
        <div class="rh-indic-card">
          <div class="sal-card-head">
            <h4 class="rh-indic-title">Salaire moyen par département et par sexe</h4>
            <div class="sal-legend">
              <span><i class="dot dot-h"></i>Hommes</span>
              <span><i class="dot dot-f"></i>Femmes</span>
            </div>
          </div>
          <div v-if="aucunDepartement" class="rh-indic-empty">
            Aucun département renseigné. Complétez le champ « Département / Service » des fiches salarié
            (ou la colonne <em>departement</em> du classeur d'import).
          </div>
          <div v-else class="rh-indic-rows">
            <div v-for="d in salairesParDepartement" :key="d.label" class="sal-dept">
              <div class="rh-indic-row-head">
                <span class="rh-indic-row-label">{{ d.label }} <small class="sal-muted">({{ d.effectif }})</small></span>
                <span class="rh-indic-row-val">{{ fmtMontant(d.moyenne) }}</span>
              </div>
              <div class="sal-bar-line" :title="`Hommes (${d.nbH}) : ${d.moyenneH == null ? '—' : fmtMontant(d.moyenneH)}`">
                <div class="rh-indic-bar-track"><div class="sal-bar sal-bar-h" :style="{ width: largeurBarre(d.moyenneH, maxSalaireDepartement) }"></div></div>
                <span class="sal-bar-val">{{ d.moyenneH == null ? '—' : fmtMontant(d.moyenneH) }}</span>
              </div>
              <div class="sal-bar-line" :title="`Femmes (${d.nbF}) : ${d.moyenneF == null ? '—' : fmtMontant(d.moyenneF)}`">
                <div class="rh-indic-bar-track"><div class="sal-bar sal-bar-f" :style="{ width: largeurBarre(d.moyenneF, maxSalaireDepartement) }"></div></div>
                <span class="sal-bar-val">{{ d.moyenneF == null ? '—' : fmtMontant(d.moyenneF) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Salaire selon l'ancienneté -->
        <div class="rh-indic-card">
          <h4 class="rh-indic-title">Salaire moyen selon l'ancienneté</h4>
          <div class="rh-indic-rows">
            <div v-for="b in salaireParAnciennete" :key="b.label" class="rh-indic-row">
              <div class="rh-indic-row-head">
                <span class="rh-indic-row-label">{{ b.label }} <small class="sal-muted">({{ b.effectif }})</small></span>
                <span class="rh-indic-row-val">{{ b.moyenne == null ? '—' : fmtMontant(b.moyenne) }}</span>
              </div>
              <div class="rh-indic-bar-track">
                <div class="sal-bar sal-bar-anc" :style="{ width: largeurBarre(b.moyenne, maxSalaireAnciennete) }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Indicateurs RH (inspiré de LOGIPAIE) -->
    <div class="rh-indic-section">
      <div class="rh-indic-header">
        <h3 class="panel-title" style="color: #7c3aed;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
          Indicateurs RH — Salariés sous contrat en cours ({{ kpiActifs }})
        </h3>
        <div class="rh-indic-toggle">
          <button :class="{ active: vueIndicateur === 'effectifs' }" @click="vueIndicateur = 'effectifs'">Effectifs</button>
          <button :class="{ active: vueIndicateur === 'masse' }" @click="vueIndicateur = 'masse'">Masse salariale</button>
        </div>
      </div>

      <!-- Mouvements & événements du mois -->
      <div class="mvt-grid">
        <div class="mvt-chip"><span class="mvt-val">{{ embauchesMois }}</span><span class="mvt-label">Embauche(s) ce mois</span></div>
        <div class="mvt-chip"><span class="mvt-val">{{ departsMois }}</span><span class="mvt-label">Départ(s) ce mois</span></div>
        <div class="mvt-chip"><span class="mvt-val">{{ employesFormesMois }}</span><span class="mvt-label">Employé(s) formé(s)</span></div>
        <div class="mvt-chip"><span class="mvt-val">{{ arretsMaladieMois }}</span><span class="mvt-label">Arrêt(s) maladie</span></div>
        <div class="mvt-chip"><span class="mvt-val">{{ autresAbsencesMois }}</span><span class="mvt-label">Autre(s) absence(s)</span></div>
      </div>

      <div v-if="kpiActifs === 0" class="empty-state">
        Aucun salarié avec un contrat en cours. Renseignez le contrat de chaque employé pour peupler ces indicateurs.
      </div>
      <div v-else class="rh-indic-grid">
        <div v-for="bloc in indicateursRH" :key="bloc.titre" class="rh-indic-card">
          <h4 class="rh-indic-title">{{ bloc.titre }}</h4>
          <div v-if="bloc.rows.length === 0" class="rh-indic-empty">Non renseigné sur les fiches salarié.</div>
          <div v-else class="rh-indic-rows">
            <div v-for="row in bloc.rows" :key="row.label" class="rh-indic-row">
              <div class="rh-indic-row-head">
                <span class="rh-indic-row-label">{{ row.label }}</span>
                <span class="rh-indic-row-val">
                  {{ vueIndicateur === 'effectifs' ? row.effectif : fmtMontant(row.montant) }}
                  <small>({{ Math.round((vueIndicateur === 'effectifs' ? row.pctEffectif : row.pctMontant) * 100) }}%)</small>
                </span>
              </div>
              <div class="rh-indic-bar-track">
                <div class="rh-indic-bar-fill" :style="{ width: Math.round((vueIndicateur === 'effectifs' ? row.pctEffectif : row.pctMontant) * 100) + '%' }"></div>
              </div>
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

.rh-indic-section { margin-top: 1.5rem; }
.rh-indic-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
.rh-indic-toggle { display: flex; background: #f1f5f9; border-radius: 8px; padding: 0.2rem; gap: 0.2rem; }
.rh-indic-toggle button { border: none; background: transparent; padding: 0.4rem 0.85rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; color: #64748b; cursor: pointer; transition: all 0.15s; }
.rh-indic-toggle button.active { background: white; color: #7c3aed; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

.mvt-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.mvt-chip { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.9rem; text-align: center; }
.mvt-val { display: block; font-size: 1.3rem; font-weight: 800; color: #1e293b; }
.mvt-label { display: block; font-size: 0.72rem; color: #64748b; margin-top: 0.15rem; }

.rh-indic-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
.rh-indic-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
.rh-indic-title { margin: 0 0 0.9rem 0; font-size: 0.85rem; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.02em; }
.rh-indic-empty { font-size: 0.8rem; color: #94a3b8; font-style: italic; }
.rh-indic-rows { display: flex; flex-direction: column; gap: 0.75rem; }
.rh-indic-row-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.3rem; font-size: 0.85rem; }
.rh-indic-row-label { color: #334155; font-weight: 600; }
.rh-indic-row-val { color: #1e293b; font-weight: 700; }
.rh-indic-row-val small { color: #94a3b8; font-weight: 600; }
.rh-indic-bar-track { height: 6px; background: #f1f5f9; border-radius: 99px; overflow: hidden; }
.rh-indic-bar-fill { height: 100%; background: linear-gradient(90deg, #a78bfa, #7c3aed); border-radius: 99px; }

.kpi-grid-4 { grid-template-columns: repeat(4, 1fr); }
.kpi-val-sm { font-size: 1.55rem; }

.sal-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 1.5rem; }
.sal-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; flex-wrap: wrap; }
.sal-legend { display: flex; gap: 0.75rem; font-size: 0.75rem; color: #64748b; font-weight: 600; }
.sal-legend span { display: inline-flex; align-items: center; gap: 0.3rem; }
.dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.dot-h, .sal-bar-h { background: #3b82f6; }
.dot-f, .sal-bar-f { background: #ec4899; }
.sal-muted { color: #94a3b8; font-weight: 600; }
.sal-dept { display: flex; flex-direction: column; gap: 0.3rem; }
.sal-bar-line { display: grid; grid-template-columns: 1fr 9.5rem; align-items: center; gap: 0.6rem; }
.sal-bar-val { font-size: 0.75rem; color: #475569; font-weight: 600; text-align: right; white-space: nowrap; }
.sal-bar { height: 100%; border-radius: 99px; }
.sal-bar-anc { background: linear-gradient(90deg, #5eead4, #0f766e); }

@media (max-width: 1100px) {
  .kpi-grid-4 { grid-template-columns: repeat(2, 1fr); }
  .sal-grid { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .kpi-grid, .alerts-grid, .rh-indic-grid { grid-template-columns: 1fr; }
  .kpi-grid-4 { grid-template-columns: repeat(2, 1fr); }
  .mvt-grid { grid-template-columns: repeat(2, 1fr); }
  .sal-bar-line { grid-template-columns: 1fr 7.5rem; }
}
</style>
