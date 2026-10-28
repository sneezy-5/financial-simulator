<script setup>
import { ref, computed, onMounted } from 'vue'
import { calculerBulletinCI } from '../../server/moteur/paieCI.mjs'
import { suivre } from '../services/entonnoir.js'

// Simulateur côté employeur (Côte d'Ivoire) : coût réel d'un salarié,
// effet d'une augmentation, et salaire possible pour un budget donné.
// Même moteur que les bulletins : les chiffres tombent juste au franc près.
//
// Composition du bulletin ivoirien : le salaire catégoriel (minimum de la
// catégorie, convention collective) est fixe ; ce qui se négocie passe par le
// sursalaire. Les recherches « net voulu » et « budget » ajustent donc le
// sursalaire, jamais le catégoriel.

const isSimulatorMode = import.meta.env.VITE_APP_MODE === 'simulator'
const PRO_URL = import.meta.env.VITE_PRO_URL || 'https://rh.eonda.online/'
const maintenant = new Date()

const mode = ref('cout')            // cout | augmentation | budget
const entree = ref('montants')      // montants | net  (mode « coût »)
const saisie = ref({
  salaire_base: 200000,             // salaire catégoriel
  sursalaire: 100000,
  primes_imposables: 0,
  prime_transport: 30000,
  situation_matrimoniale: 'celibataire',
  nombre_enfants: 0,
  statut_salarie: 'local',
  taux_at: 0.02,
  effectif: 1
})
const netVoulu = ref(300000)
const augmentation = ref(50000)
const budget = ref(500000)

const fiche = (sursalaire) => ({
  ...saisie.value,
  sursalaire,
  primes: (+saisie.value.primes_imposables || 0) > 0
    ? [{ libelle: 'Primes imposables', montant: +saisie.value.primes_imposables, imposable: true }]
    : [],
  mois: maintenant.getMonth() + 1,
  annee: maintenant.getFullYear()
})
const bulletin = (sursalaire) => calculerBulletinCI(fiche(Math.max(0, sursalaire)))
const coutDe = (c) => c.gainsTotaux + c.patronal.grandTotal

// Plus petit sursalaire qui atteint la valeur voulue (le net et le coût
// croissent avec le sursalaire) — dichotomie sur le moteur.
function sursalairePour(mesure, cible) {
  let bas = 0, haut = Math.max(100000, cible * 3)
  while (mesure(bulletin(haut)) < cible && haut < 1e10) haut *= 2
  for (let i = 0; i < 60 && haut - bas > 0.5; i++) {
    const m = (bas + haut) / 2
    if (mesure(bulletin(m)) < cible) bas = m; else haut = m
  }
  return haut
}

// Mode « coût » : sursalaire saisi, ou recalculé pour atteindre le net voulu.
const sansSursalaire = computed(() => bulletin(0))
const sursalaireCout = computed(() => {
  if (entree.value !== 'net') return +saisie.value.sursalaire || 0
  if (sansSursalaire.value.netAPayer >= (+netVoulu.value || 0)) return 0
  return Math.ceil(sursalairePour(c => c.netAPayer, +netVoulu.value || 0))
})
const actuel = computed(() => bulletin(sursalaireCout.value))
const netDejaAtteint = computed(() => entree.value === 'net' && sansSursalaire.value.netAPayer > (+netVoulu.value || 0))

// Mode « augmentation » : ajoutée au sursalaire.
const avantAug = computed(() => bulletin(+saisie.value.sursalaire || 0))
const apresAug = computed(() => bulletin((+saisie.value.sursalaire || 0) + (+augmentation.value || 0)))

// Mode « budget » : sursalaire le plus élevé dont le coût reste dans le budget.
const sursalaireBudget = computed(() => {
  const cible = +budget.value || 0
  if (coutDe(sansSursalaire.value) > cible) return null
  // Recherche sur des francs entiers : coût(bas) ≤ budget < coût(haut).
  let bas = 0, haut = Math.max(100000, cible)
  while (coutDe(bulletin(haut)) <= cible && haut < 1e10) haut *= 2
  while (haut - bas > 1) {
    const m = Math.floor((bas + haut) / 2)
    if (coutDe(bulletin(m)) <= cible) bas = m; else haut = m
  }
  return bas
})
const bulletinBudget = computed(() => sursalaireBudget.value === null ? null : bulletin(sursalaireBudget.value))

const f = (v) => Math.round(v || 0).toLocaleString('fr-FR')
const pct = (v) => (Math.round(v * 1000) / 10).toLocaleString('fr-FR') + ' %'
const n = computed(() => Math.max(1, +saisie.value.effectif || 1))

// Lignes du bulletin, dans l'ordre d'un bulletin ivoirien.
const composition = (c) => [
  ['Salaire catégoriel', c.salaireBase],
  ['Sursalaire', c.sursalaire],
  ['Primes imposables', c.primesImposables],
  ['Excédent de transport imposable', c.primeTransportImposable],
  ['= Brut imposable', c.brutImposable, true],
  ['Transport exonéré', c.primeTransport],
  ['= Total versé (gains)', c.gainsTotaux, true]
].filter(([, m, total]) => total || m > 0)

const detailCharges = (c) => [
  ['CNPS retraite (7,7 %)', c.patronal.cnpsRetraite],
  ['Prestations familiales + maternité', c.patronal.cnpsPF + c.patronal.cnpsAM],
  ['Accident du travail', c.patronal.cnpsAT],
  ['CMU (part employeur)', c.patronal.cmu],
  ['Contribution nationale (CN)' + (c.patronal.ceEmployeur ? ' + CE expatrié' : ''), c.patronal.cnEmployeur + c.patronal.ceEmployeur],
  ['FDFP (apprentissage + formation)', c.patronal.fdfpTA + c.patronal.fdfpFPC]
]

onMounted(() => suivre('cout_employeur', { unique: true }))
</script>

<template>
  <div class="ce-wrap">
    <div class="ce-intro">
      <h2>Simulateur employeur</h2>
      <p>Ce que coûte réellement un salarié en Côte d'Ivoire, ce que rapporte une augmentation au salarié, et le salaire que permet votre budget. Calcul sur le barème en vigueur (ITS, CNPS, CMU, CN/CE, FDFP).</p>
    </div>

    <div class="ce-modes">
      <button :class="{ actif: mode === 'cout' }" @click="mode = 'cout'">Coût d'un salarié</button>
      <button :class="{ actif: mode === 'augmentation' }" @click="mode = 'augmentation'">Simuler une augmentation</button>
      <button :class="{ actif: mode === 'budget' }" @click="mode = 'budget'">Partir d'un budget</button>
    </div>

    <div class="ce-grille">
      <!-- Saisie -->
      <div class="ce-carte">
        <h3>Le poste</h3>

        <div v-if="mode === 'cout'" class="ce-bascule">
          <button type="button" :class="{ actif: entree === 'montants' }" @click="entree = 'montants'">Je connais les montants</button>
          <button type="button" :class="{ actif: entree === 'net' }" @click="entree = 'net'">Je connais le net voulu</button>
        </div>

        <label>Salaire catégoriel (FCFA / mois)
          <input v-model.number="saisie.salaire_base" type="number" min="0" step="5000" />
          <small>Minimum de la catégorie du salarié (convention collective). Base de la prime d'ancienneté.</small>
        </label>
        <label v-if="!(mode === 'cout' && entree === 'net') && mode !== 'budget'">Sursalaire (FCFA / mois)
          <input v-model.number="saisie.sursalaire" type="number" min="0" step="5000" />
          <small>Complément négocié au-dessus du catégoriel.</small>
        </label>
        <label v-if="mode === 'cout' && entree === 'net'">Net à payer voulu (FCFA / mois)
          <input v-model.number="netVoulu" type="number" min="0" step="5000" />
          <small>Le sursalaire nécessaire est calculé.</small>
        </label>
        <label v-if="mode === 'augmentation'">Augmentation (FCFA / mois)
          <input v-model.number="augmentation" type="number" step="5000" />
          <small>Ajoutée au sursalaire.</small>
        </label>
        <label v-if="mode === 'budget'">Budget mensuel total employeur (FCFA)
          <input v-model.number="budget" type="number" min="0" step="10000" />
          <small>Charges comprises. Le sursalaire possible est calculé.</small>
        </label>
        <label>Primes imposables (FCFA / mois)
          <input v-model.number="saisie.primes_imposables" type="number" min="0" step="5000" />
          <small>Fonction, responsabilité, rendement… : total mensuel.</small>
        </label>
        <label>Prime de transport (FCFA / mois)
          <input v-model.number="saisie.prime_transport" type="number" min="0" step="1000" />
          <small>Exonérée jusqu'à 30 000 FCFA à Abidjan ; l'excédent est imposable.</small>
        </label>
        <label>Situation
          <select v-model="saisie.situation_matrimoniale">
            <option value="celibataire">Célibataire</option><option value="marie">Marié(e)</option><option value="veuf">Veuf / veuve</option>
          </select>
        </label>
        <label>Enfants à charge<input v-model.number="saisie.nombre_enfants" type="number" min="0" max="10" /></label>
        <label>Statut
          <select v-model="saisie.statut_salarie"><option value="local">Local</option><option value="expatrie">Expatrié</option></select>
        </label>
        <label>Taux accident du travail
          <select v-model.number="saisie.taux_at"><option :value="0.02">2 %</option><option :value="0.03">3 %</option><option :value="0.04">4 %</option><option :value="0.05">5 %</option></select>
        </label>
        <label v-if="mode === 'cout'">Nombre de salariés sur ce poste<input v-model.number="saisie.effectif" type="number" min="1" /></label>
      </div>

      <!-- Résultats -->
      <div class="ce-carte ce-resultat">
        <template v-if="mode === 'cout'">
          <h3>Coût réel</h3>
          <div v-if="entree === 'net'" class="ce-chiffre"><span>Sursalaire nécessaire</span><strong>{{ f(sursalaireCout) }} FCFA</strong></div>
          <p v-if="netDejaAtteint" class="ce-phrase ce-alerte">Le salaire catégoriel et les primes donnent déjà {{ f(sansSursalaire.netAPayer) }} FCFA net, plus que le net voulu : aucun sursalaire n'est nécessaire.</p>
          <div class="ce-chiffre"><span>Coût mensuel employeur</span><strong>{{ f(coutDe(actuel) * n) }} FCFA</strong></div>
          <div class="ce-chiffre"><span>Net versé au salarié</span><strong class="vert">{{ f(actuel.netAPayer * n) }} FCFA</strong></div>
          <div class="ce-chiffre"><span>Coût annuel (12 mois)</span><strong>{{ f(coutDe(actuel) * 12 * n) }} FCFA</strong></div>
          <p class="ce-phrase">Pour <b>1 FCFA</b> versé en net, l'entreprise dépense <b>{{ (coutDe(actuel) / Math.max(1, actuel.netAPayer)).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) }} FCFA</b>.</p>
          <table class="ce-table">
            <tr v-for="[lib, m, total] in composition(actuel)" :key="lib" :class="{ 'ce-sous-total': total }"><td>{{ lib }}</td><td>{{ f(m) }}</td></tr>
            <tr><td>− ITS, CNPS et CMU du salarié</td><td>{{ f(actuel.salarial.total) }}</td></tr>
            <tr class="ce-sous-total"><td>= Net à payer</td><td>{{ f(actuel.netAPayer) }}</td></tr>
            <tr v-for="[lib, m] in detailCharges(actuel)" :key="lib"><td>+ {{ lib }}</td><td>{{ f(m) }}</td></tr>
            <tr class="ce-total"><td>Coût mensuel par salarié (gains + charges)</td><td>{{ f(coutDe(actuel)) }}</td></tr>
          </table>
        </template>

        <template v-else-if="mode === 'augmentation'">
          <h3>Effet de l'augmentation</h3>
          <div class="ce-chiffre"><span>Le salarié touche en plus</span><strong class="vert">+ {{ f(apresAug.netAPayer - avantAug.netAPayer) }} FCFA / mois</strong></div>
          <div class="ce-chiffre"><span>L'entreprise paie en plus</span><strong class="rouge">+ {{ f(coutDe(apresAug) - coutDe(avantAug)) }} FCFA / mois</strong></div>
          <p class="ce-phrase" v-if="augmentation > 0">Sur {{ f(augmentation) }} FCFA d'augmentation, le salarié garde <b>{{ pct((apresAug.netAPayer - avantAug.netAPayer) / augmentation) }}</b> en net, pour un coût de <b>{{ pct((coutDe(apresAug) - coutDe(avantAug)) / augmentation) }}</b> pour l'entreprise. L'écart part en ITS, CNPS et contributions.</p>
          <table class="ce-table">
            <tr><th></th><th>Avant</th><th>Après</th></tr>
            <tr><td>Salaire catégoriel</td><td>{{ f(avantAug.salaireBase) }}</td><td>{{ f(apresAug.salaireBase) }}</td></tr>
            <tr><td>Sursalaire</td><td>{{ f(avantAug.sursalaire) }}</td><td>{{ f(apresAug.sursalaire) }}</td></tr>
            <tr><td>Brut imposable</td><td>{{ f(avantAug.brutImposable) }}</td><td>{{ f(apresAug.brutImposable) }}</td></tr>
            <tr><td>ITS</td><td>{{ f(avantAug.salarial.its) }}</td><td>{{ f(apresAug.salarial.its) }}</td></tr>
            <tr><td>CNPS salarié</td><td>{{ f(avantAug.salarial.cnps) }}</td><td>{{ f(apresAug.salarial.cnps) }}</td></tr>
            <tr><td>Net à payer</td><td>{{ f(avantAug.netAPayer) }}</td><td>{{ f(apresAug.netAPayer) }}</td></tr>
            <tr class="ce-total"><td>Coût employeur</td><td>{{ f(coutDe(avantAug)) }}</td><td>{{ f(coutDe(apresAug)) }}</td></tr>
          </table>
        </template>

        <template v-else>
          <h3>Ce que permet votre budget</h3>
          <template v-if="bulletinBudget">
            <div class="ce-chiffre"><span>Sursalaire possible</span><strong>{{ f(sursalaireBudget) }} FCFA</strong></div>
            <div class="ce-chiffre"><span>Net pour le salarié</span><strong class="vert">{{ f(bulletinBudget.netAPayer) }} FCFA</strong></div>
            <div class="ce-chiffre"><span>Coût employeur exact</span><strong>{{ f(coutDe(bulletinBudget)) }} FCFA</strong></div>
            <table class="ce-table">
              <tr v-for="[lib, m, total] in composition(bulletinBudget)" :key="lib" :class="{ 'ce-sous-total': total }"><td>{{ lib }}</td><td>{{ f(m) }}</td></tr>
            </table>
            <p class="ce-phrase">Avec le catégoriel, les primes et la situation indiqués, c'est le sursalaire le plus élevé qui reste dans le budget.</p>
          </template>
          <p v-else class="ce-phrase ce-alerte">Le budget ne couvre pas le salaire catégoriel, les primes et les charges : {{ f(coutDe(sansSursalaire)) }} FCFA au minimum.</p>
        </template>
      </div>
    </div>

    <div class="ce-pro">
      <div>
        <strong>Passez du calcul à la paie complète</strong>
        <p>ONDA RH Pro génère les bulletins de toute l'équipe, contrôle et clôture chaque mois, prépare les déclarations CNPS, ITS, FDFP et DISA, et produit le journal comptable SYSCOHADA.</p>
      </div>
      <a v-if="isSimulatorMode" :href="PRO_URL + '?source=cout_employeur'" target="_blank" rel="noopener" class="ce-pro-btn" @click="suivre('clic_pro', { source: 'cout_employeur' })">Essayer gratuitement →</a>
    </div>
  </div>
</template>

<style scoped>
.ce-wrap { padding: 1.5rem; max-width: 1000px; margin: 0 auto; color: #0f172a; }
.ce-intro h2 { margin: 0 0 6px; font-size: 1.35rem; }
.ce-intro p { margin: 0 0 16px; color: #475569; font-size: 0.92rem; line-height: 1.5; }
.ce-modes { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.ce-modes button { padding: 8px 14px; border-radius: 999px; border: 1px solid #cbd5e1; background: #fff; font-weight: 600; color: #475569; cursor: pointer; }
.ce-modes button.actif { background: #1e3a8a; border-color: #1e3a8a; color: #fff; }
.ce-bascule { display: flex; gap: 6px; margin-bottom: 12px; }
.ce-bascule button { flex: 1; padding: 7px 8px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 0.78rem; font-weight: 600; color: #475569; cursor: pointer; }
.ce-bascule button.actif { background: #eff6ff; border-color: #1e3a8a; color: #1e3a8a; }
.ce-grille { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 16px; }
.ce-carte { border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; background: #fff; }
.ce-carte h3 { margin: 0 0 12px; font-size: 1rem; color: #1e3a8a; }
.ce-carte label { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; color: #475569; margin-bottom: 10px; font-weight: 600; }
.ce-carte label small { font-weight: 400; color: #94a3b8; font-size: 0.74rem; line-height: 1.35; }
.ce-carte input, .ce-carte select { padding: 8px 10px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 0.95rem; color: #0f172a; }
.ce-chiffre { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; }
.ce-chiffre span { color: #475569; font-size: 0.88rem; }
.ce-chiffre strong { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.vert { color: #047857; } .rouge { color: #b91c1c; }
.ce-phrase { font-size: 0.86rem; color: #334155; line-height: 1.55; margin: 12px 0; }
.ce-alerte { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 10px; color: #92400e; }
.ce-table { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
.ce-table td, .ce-table th { padding: 6px 4px; border-bottom: 1px solid #f1f5f9; text-align: right; font-variant-numeric: tabular-nums; }
.ce-table td:first-child, .ce-table th:first-child { text-align: left; color: #475569; }
.ce-sous-total td { font-weight: 700; color: #1e3a8a !important; }
.ce-total td { font-weight: 800; color: #0f172a !important; border-top: 2px solid #e2e8f0; }
.ce-pro { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 18px; padding: 16px 18px; border-radius: 14px; background: #0f172a; color: #cbd5e1; }
.ce-pro strong { color: #fff; }
.ce-pro p { margin: 4px 0 0; font-size: 0.85rem; max-width: 620px; }
.ce-pro-btn { background: #10b981; color: #fff; font-weight: 700; padding: 10px 18px; border-radius: 10px; text-decoration: none; white-space: nowrap; }
@media (max-width: 760px) { .ce-grille { grid-template-columns: 1fr; } .ce-wrap { padding: 1rem; } }
</style>
