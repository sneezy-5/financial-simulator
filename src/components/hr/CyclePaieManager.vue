<script setup>
import { ref, computed, onMounted } from 'vue'
import { showToast } from '../../services/toast.js'

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const STATUTS = {
  draft: { libelle: 'Brouillon', classe: 'st-brouillon' },
  validated: { libelle: 'Validée', classe: 'st-validee' },
  closed: { libelle: 'Clôturée', classe: 'st-cloturee' }
}
const NIVEAUX = {
  bloquant: { libelle: 'Bloquant', classe: 'nv-bloquant' },
  alerte: { libelle: 'À vérifier', classe: 'nv-alerte' },
  info: { libelle: 'Info', classe: 'nv-info' }
}

const onglet = ref('periodes')
const periods = ref([])
const loading = ref(true)
const controles = ref({})        // periodId → résultat des contrôles
const ouverte = ref(null)        // periodId dont le détail est déplié
const enCours = ref('')
const evenements = ref([])
const chargementAudit = ref(false)
const filtreAudit = ref('')

const token = () => localStorage.getItem('auth_token')
const api = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Erreur serveur'); err.data = data; throw err }
  return data
}

const chargerPeriodes = async () => {
  loading.value = true
  try {
    const data = await api('/api/rh/periods')
    periods.value = (data.periods || []).sort((a, b) => b.annee - a.annee || b.mois - a.mois)
  } catch (e) {
    showToast('Impossible de charger les périodes de paie.', 'error')
  } finally {
    loading.value = false
  }
}

const controler = async (p) => {
  enCours.value = `ctrl-${p.id}`
  try {
    controles.value[p.id] = await api(`/api/rh/periods/${p.id}/controles`)
    ouverte.value = p.id
  } catch (e) {
    showToast('Contrôle impossible : ' + e.message, 'error')
  } finally {
    enCours.value = ''
  }
}

const changerStatut = async (p, action) => {
  let motif = null
  if (action === 'rouvrir') {
    motif = prompt(`Motif de la réouverture de ${MOIS[p.mois]} ${p.annee} (obligatoire, conservé dans le journal d'audit) :`)
    if (!motif) return
  }
  if (action === 'cloturer' && !confirm(`Clôturer ${MOIS[p.mois]} ${p.annee} ?\n\nLes bulletins de ce mois ne pourront plus être régénérés. Une erreur se corrigera par régularisation sur le mois suivant, ou en rouvrant la période avec un motif.`)) return
  enCours.value = `${action}-${p.id}`
  try {
    const data = await api(`/api/rh/periods/${p.id}/statut`, { method: 'POST', body: JSON.stringify({ action, motif }) })
    Object.assign(p, data.period)
    if (data.controles) controles.value[p.id] = { ...data.controles, statut: data.period.status }
    const messages = { valider: 'Période validée.', cloturer: 'Période clôturée.', rouvrir: 'Période rouverte — elle repasse en brouillon.' }
    showToast(messages[action], 'success')
    if (onglet.value === 'audit') chargerAudit()
  } catch (e) {
    if (e.data?.anomalies) { controles.value[p.id] = e.data; ouverte.value = p.id }
    showToast(e.message, 'error')
  } finally {
    enCours.value = ''
  }
}

const chargerAudit = async () => {
  chargementAudit.value = true
  try {
    const qs = new URLSearchParams({ limit: '200', ...(filtreAudit.value ? { entite: filtreAudit.value } : {}) })
    evenements.value = (await api(`/api/rh/audit?${qs}`)).evenements || []
  } catch (e) {
    showToast("Impossible de charger le journal d'audit.", 'error')
  } finally {
    chargementAudit.value = false
  }
}

const basculer = (o) => {
  onglet.value = o
  if (o === 'audit' && !evenements.value.length) chargerAudit()
}

const dateHeure = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
const changementsDe = (ev) => Object.entries(ev.details?.changements || {})
const valeur = (v) => (v === null || v === undefined || v === '') ? '—' : String(v)

const resumePeriode = (p) => {
  const c = controles.value[p.id]
  if (!c) return null
  const r = c.resume
  if (r.bloquants) return { texte: `${r.bloquants} bloquant(s)`, classe: 'nv-bloquant' }
  if (r.alertes) return { texte: `${r.alertes} alerte(s)`, classe: 'nv-alerte' }
  return { texte: 'Aucune anomalie', classe: 'nv-ok' }
}

const compteurs = computed(() => ({
  brouillons: periods.value.filter(p => p.status === 'draft').length,
  validees: periods.value.filter(p => p.status === 'validated').length,
  cloturees: periods.value.filter(p => p.status === 'closed').length
}))

onMounted(chargerPeriodes)
</script>

<template>
  <div class="cy-wrap">
    <div class="cy-intro">
      <strong>Cycle de paie</strong>
      <p>
        <b>Brouillon</b> → <b>Validée</b> → <b>Clôturée</b>. Une période clôturée est figée : plus de régénération ni de
        bulletin sur ce mois. Les contrôles signalent les erreurs certaines (bloquantes) et les points à vérifier.
        Chaque action est tracée dans le journal d'audit.
      </p>
    </div>

    <div class="cy-tabs">
      <button :class="{ actif: onglet === 'periodes' }" @click="basculer('periodes')">Périodes</button>
      <button :class="{ actif: onglet === 'audit' }" @click="basculer('audit')">Journal d'audit</button>
    </div>

    <!-- ═══ PÉRIODES ═══ -->
    <template v-if="onglet === 'periodes'">
      <div v-if="loading" class="cy-vide">Chargement des périodes…</div>
      <div v-else-if="!periods.length" class="cy-vide">
        Aucune période de paie. Générez d'abord des bulletins (module <b>Import en Masse</b> ou <b>Saisie Mensuelle</b>).
      </div>
      <template v-else>
        <div class="cy-compteurs">
          <span class="st-brouillon">{{ compteurs.brouillons }} brouillon(s)</span>
          <span class="st-validee">{{ compteurs.validees }} validée(s)</span>
          <span class="st-cloturee">{{ compteurs.cloturees }} clôturée(s)</span>
        </div>

        <div v-for="p in periods" :key="p.id" class="cy-carte">
          <div class="cy-ligne">
            <div>
              <strong>{{ MOIS[p.mois] }} {{ p.annee }}</strong>
              <span class="cy-sub">{{ p.employeeCount || 0 }} bulletin(s)</span>
            </div>
            <div class="cy-droite">
              <span v-if="resumePeriode(p)" class="cy-pastille" :class="resumePeriode(p).classe">{{ resumePeriode(p).texte }}</span>
              <span class="cy-statut" :class="STATUTS[p.status]?.classe">{{ STATUTS[p.status]?.libelle || p.status }}</span>
            </div>
          </div>

          <div class="cy-actions">
            <button class="cy-btn" :disabled="!!enCours" @click="ouverte === p.id && controles[p.id] ? (ouverte = null) : controler(p)">
              {{ enCours === `ctrl-${p.id}` ? '…' : (ouverte === p.id && controles[p.id] ? 'Masquer les contrôles' : 'Contrôler') }}
            </button>
            <button v-if="p.status === 'draft'" class="cy-btn cy-btn-vert" :disabled="!!enCours" @click="changerStatut(p, 'valider')">Valider</button>
            <button v-if="p.status !== 'closed'" class="cy-btn cy-btn-bleu" :disabled="!!enCours" @click="changerStatut(p, 'cloturer')">Clôturer</button>
            <button v-if="p.status !== 'draft'" class="cy-btn cy-btn-gris" :disabled="!!enCours" @click="changerStatut(p, 'rouvrir')">Rouvrir…</button>
          </div>

          <div v-if="ouverte === p.id && controles[p.id]" class="cy-controles">
            <div v-if="!controles[p.id].anomalies.length" class="cy-ok">✓ Aucune anomalie détectée sur {{ controles[p.id].resume.bulletins }} bulletin(s).</div>
            <div v-for="(a, i) in controles[p.id].anomalies" :key="i" class="cy-anomalie">
              <span class="cy-niveau" :class="NIVEAUX[a.niveau].classe">{{ NIVEAUX[a.niveau].libelle }}</span>
              <span><b v-if="a.salarie">{{ a.salarie }} — </b>{{ a.message }}</span>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ═══ JOURNAL D'AUDIT ═══ -->
    <template v-else>
      <div class="cy-filtres">
        <select v-model="filtreAudit" @change="chargerAudit">
          <option value="">Tous les événements</option>
          <option value="periode">Périodes de paie</option>
          <option value="salarie">Fiches salarié</option>
          <option value="parametres">Paramètres</option>
        </select>
        <button class="cy-btn" :disabled="chargementAudit" @click="chargerAudit">Actualiser</button>
      </div>
      <div v-if="chargementAudit" class="cy-vide">Chargement…</div>
      <div v-else-if="!evenements.length" class="cy-vide">Aucun événement enregistré pour le moment.</div>
      <div v-else class="cy-journal">
        <div v-for="ev in evenements" :key="ev.id" class="cy-ev">
          <div class="cy-ev-tete">
            <span class="cy-ev-date">{{ dateHeure(ev.createdAt) }}</span>
            <span class="cy-ev-libelle">{{ ev.libelle }}</span>
            <span class="cy-ev-auteur">{{ ev.auteurEmail || '' }}</span>
          </div>
          <table v-if="changementsDe(ev).length" class="cy-diff">
            <tr v-for="[champ, c] in changementsDe(ev)" :key="champ">
              <td class="cy-champ">{{ champ }}</td>
              <td class="cy-avant">{{ valeur(c.avant) }}</td>
              <td class="cy-fleche">→</td>
              <td class="cy-apres">{{ valeur(c.apres) }}</td>
            </tr>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cy-wrap { padding: 1.5rem; max-width: 920px; }
.cy-intro { padding: 14px 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; margin-bottom: 1rem; }
.cy-intro strong { display: block; color: #1e3a8a; margin-bottom: 4px; }
.cy-intro p { margin: 0; font-size: 0.85rem; color: #1e40af; line-height: 1.5; }
.cy-tabs { display: flex; gap: 6px; margin-bottom: 1rem; border-bottom: 1px solid #e2e8f0; }
.cy-tabs button { background: none; border: none; padding: 8px 14px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.cy-tabs button.actif { color: #1e3a8a; border-bottom-color: #1e3a8a; }
.cy-vide { padding: 2.5rem 1.5rem; text-align: center; color: #64748b; background: #f8fafc; border: 1px dashed #e2e8f0; border-radius: 12px; }
.cy-compteurs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; font-size: 0.78rem; }
.cy-compteurs span { padding: 3px 10px; border-radius: 999px; font-weight: 600; }
.cy-carte { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; background: #fff; }
.cy-ligne { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.cy-sub { margin-left: 8px; font-size: 0.8rem; color: #64748b; }
.cy-droite { display: flex; gap: 6px; align-items: center; }
.cy-statut, .cy-pastille { font-size: 0.72rem; font-weight: 700; padding: 2px 9px; border-radius: 999px; border: 1px solid transparent; }
.st-brouillon { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }
.st-validee { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
.st-cloturee { background: #eef2ff; color: #3730a3; border-color: #c7d2fe; }
.nv-bloquant { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
.nv-alerte { background: #fffbeb; color: #b45309; border-color: #fde68a; }
.nv-info { background: #f0f9ff; color: #0369a1; border-color: #bae6fd; }
.nv-ok { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
.cy-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.cy-btn { font-size: 0.78rem; padding: 5px 12px; border-radius: 7px; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155; font-weight: 600; cursor: pointer; }
.cy-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cy-btn-vert { background: #ecfdf5; border-color: #6ee7b7; color: #047857; }
.cy-btn-bleu { background: #eef2ff; border-color: #a5b4fc; color: #3730a3; }
.cy-btn-gris { background: #fff; color: #64748b; }
.cy-controles { margin-top: 10px; border-top: 1px dashed #e2e8f0; padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.cy-ok { font-size: 0.82rem; color: #047857; }
.cy-anomalie { display: flex; gap: 8px; align-items: flex-start; font-size: 0.82rem; color: #334155; }
.cy-niveau { flex-shrink: 0; font-size: 0.68rem; font-weight: 700; padding: 1px 7px; border-radius: 999px; border: 1px solid transparent; }
.cy-filtres { display: flex; gap: 8px; margin-bottom: 10px; }
.cy-filtres select { padding: 5px 8px; border-radius: 7px; border: 1px solid #cbd5e1; font-size: 0.82rem; }
.cy-journal { display: flex; flex-direction: column; gap: 8px; }
.cy-ev { border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px 12px; background: #fff; }
.cy-ev-tete { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; font-size: 0.82rem; }
.cy-ev-date { color: #64748b; font-variant-numeric: tabular-nums; }
.cy-ev-libelle { font-weight: 600; color: #0f172a; flex: 1; }
.cy-ev-auteur { color: #94a3b8; font-size: 0.75rem; }
.cy-diff { margin-top: 6px; font-size: 0.76rem; border-collapse: collapse; }
.cy-diff td { padding: 2px 8px 2px 0; }
.cy-champ { color: #64748b; }
.cy-avant { color: #b91c1c; text-decoration: line-through; }
.cy-fleche { color: #94a3b8; }
.cy-apres { color: #047857; font-weight: 600; }
@media (max-width: 640px) { .cy-wrap { padding: 1rem; } }
</style>
