<script setup>
import { ref, computed, onMounted } from 'vue'
import { showToast } from '../../services/toast.js'

const props = defineProps({ country: { type: String, default: 'CI' } })

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const periods = ref([])
const loading = ref(true)
const downloading = ref('')

const token = () => localStorage.getItem('auth_token')

const load = async () => {
  loading.value = true
  try {
    const res = await fetch('/api/rh/periods', { headers: { Authorization: `Bearer ${token()}` } })
    const data = await res.json()
    periods.value = (data.periods || [])
      .filter(p => (p.country || 'CI') === 'CI')
      .sort((a, b) => b.annee - a.annee || b.mois - a.mois)
  } catch (e) {
    showToast("Impossible de charger les périodes de paie.", 'error')
  } finally {
    loading.value = false
  }
}
onMounted(load)

const disponible = computed(() => props.country === 'CI')

// Regroupe les périodes par trimestre civil, pour le versement CNPS trimestriel (< 20 salariés).
const trimestres = computed(() => {
  const map = new Map()
  for (const p of periods.value) {
    const q = Math.floor((p.mois - 1) / 3) + 1
    const key = `${p.annee}-T${q}`
    if (!map.has(key)) map.set(key, { key, annee: p.annee, q, periods: [] })
    map.get(key).periods.push(p)
  }
  return [...map.values()]
    .filter(t => t.periods.length >= 2)
    .sort((a, b) => b.annee - a.annee || b.q - a.q)
})

const nomFichierDepuis = (cd, fallback) => {
  const m = /filename="?([^"]+)"?/.exec(cd || '')
  return (m && m[1]) || fallback
}

const telecharger = async ({ type, format, periodIds, cle }) => {
  if (downloading.value) return
  downloading.value = cle
  try {
    const qs = new URLSearchParams({ type, format, periodIds: periodIds.join(',') })
    const res = await fetch(`/api/rh/declarations?${qs}`, { headers: { Authorization: `Bearer ${token()}` } })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Génération impossible.')
    }
    const partielle = res.headers.get('X-Declaration-Partielle') === '1'
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomFichierDepuis(res.headers.get('Content-Disposition'), `declaration.${format}`)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    if (partielle) {
      showToast("Déclaration générée mais PARTIELLE : des données historiques manquent. Vérifiez avant dépôt.", 'info')
    }
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error')
  } finally {
    downloading.value = ''
  }
}

const FORMATS = [
  { format: 'pdf', label: 'PDF' },
  { format: 'xlsx', label: 'Excel' },
  { format: 'csv', label: 'CSV' }
]
const DECLARATIONS = [
  { type: 'cnps', label: 'Bordereau CNPS' },
  { type: 'cnps-liste', label: 'Liste nominative CNPS' }
]
</script>

<template>
  <div class="decl-wrap">
    <div class="decl-intro">
      <div class="decl-intro-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="13" y2="11"/>
        </svg>
      </div>
      <div>
        <strong>Déclarations sociales &amp; fiscales</strong>
        <p>
          Bordereaux générés à partir de vos périodes de paie déjà enregistrées.
          <b>Aide à la saisie sur e-CNPS / e-Impôts — ce ne sont pas des télédéclarations.</b>
          Le taux Accident du Travail, le N° employeur et la périodicité de versement se règlent dans
          <em>Paramètres&nbsp;&rsaquo;&nbsp;Profil entreprise</em>.
        </p>
      </div>
    </div>

    <div v-if="!disponible" class="decl-empty">
      Les déclarations ne sont disponibles que pour la Côte d'Ivoire pour le moment.
    </div>

    <div v-else-if="loading" class="decl-empty">Chargement des périodes…</div>

    <div v-else-if="periods.length === 0" class="decl-empty">
      Aucune période de paie enregistrée. Générez d'abord des bulletins (module <b>Import en Masse</b> ou <b>Saisie Mensuelle</b>).
    </div>

    <template v-else>
      <!-- Trimestres (versement CNPS trimestriel) -->
      <section v-if="trimestres.length" class="decl-section">
        <h3>Versement trimestriel CNPS <span class="decl-hint">(entreprises &lt; 20 salariés)</span></h3>
        <div v-for="t in trimestres" :key="t.key" class="decl-card">
          <div class="decl-card-head">
            <strong>{{ t.annee }} — T{{ t.q }}</strong>
            <span class="decl-sub">{{ t.periods.map(p => MOIS[p.mois]).join(', ') }} · {{ t.periods.reduce((s,p)=>s+(p.employeeCount||0),0) }} bulletin(s)</span>
          </div>
          <div class="decl-actions">
            <div v-for="d in DECLARATIONS" :key="d.type" class="decl-line">
              <span class="decl-line-label">{{ d.label }}</span>
              <button v-for="f in FORMATS" :key="f.format"
                class="decl-btn"
                :disabled="!!downloading"
                @click="telecharger({ type: d.type, format: f.format, periodIds: t.periods.map(p=>p.id), cle: t.key+d.type+f.format })">
                {{ downloading === t.key+d.type+f.format ? '…' : f.label }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Périodes mensuelles -->
      <section class="decl-section">
        <h3>Périodes mensuelles</h3>
        <div v-for="p in periods" :key="p.id" class="decl-card">
          <div class="decl-card-head">
            <strong>{{ MOIS[p.mois] }} {{ p.annee }}</strong>
            <span class="decl-sub">
              {{ p.employeeCount || 0 }} bulletin(s)
              <span v-if="p.status === 'validated'" class="decl-badge">validée</span>
            </span>
          </div>
          <div class="decl-actions">
            <div v-for="d in DECLARATIONS" :key="d.type" class="decl-line">
              <span class="decl-line-label">{{ d.label }}</span>
              <button v-for="f in FORMATS" :key="f.format"
                class="decl-btn"
                :disabled="!!downloading"
                @click="telecharger({ type: d.type, format: f.format, periodIds: [p.id], cle: p.id+d.type+f.format })">
                {{ downloading === p.id+d.type+f.format ? '…' : f.label }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.decl-wrap { padding: 1.5rem; max-width: 900px; }
.decl-intro { display: flex; gap: 14px; padding: 14px 16px; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 12px; margin-bottom: 1.5rem; }
.decl-intro-icon { flex-shrink: 0; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: #ccfbf1; border-radius: 10px; }
.decl-intro strong { display: block; margin-bottom: 4px; color: #134e4a; }
.decl-intro p { margin: 0; font-size: 0.85rem; color: #115e59; line-height: 1.5; }
.decl-empty { padding: 2.5rem 1.5rem; text-align: center; color: #64748b; background: #f8fafc; border: 1px dashed #e2e8f0; border-radius: 12px; }
.decl-section { margin-bottom: 1.75rem; }
.decl-section h3 { font-size: 0.9rem; color: #334155; margin: 0 0 0.75rem; }
.decl-hint { font-weight: 400; color: #94a3b8; font-size: 0.8rem; }
.decl-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; background: #fff; }
.decl-card-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.decl-card-head strong { color: #0f172a; }
.decl-sub { font-size: 0.8rem; color: #64748b; }
.decl-badge { margin-left: 6px; font-size: 0.7rem; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; border-radius: 999px; padding: 1px 7px; }
.decl-actions { display: flex; flex-direction: column; gap: 8px; }
.decl-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.decl-line-label { font-size: 0.82rem; color: #475569; min-width: 170px; }
.decl-btn { font-size: 0.78rem; padding: 5px 12px; border-radius: 7px; border: 1px solid #99f6e4; background: #f0fdfa; color: #0f766e; font-weight: 600; cursor: pointer; }
.decl-btn:hover:not(:disabled) { background: #ccfbf1; }
.decl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 640px) {
  .decl-wrap { padding: 1rem; }
  .decl-line-label { min-width: 0; width: 100%; }
}
</style>
