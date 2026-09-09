<script setup>
import { ref, computed } from 'vue'
import {
  creerBilanVide, creerCRVide, verifierEquilibreBilan,
  calculerRatios, calculerScoreFinancement,
} from '../../services/financialAnalysisService.js'
import { genererModeleImport, importerClasseurExcel } from '../../services/financialExportService.js'
import BilanForm from './BilanForm.vue'
import CompteResultatForm from './CompteResultatForm.vue'
import RatiosResultats from './RatiosResultats.vue'
import ScoreFinancement from './ScoreFinancement.vue'
import FicheAnalyseExport from './FicheAnalyseExport.vue'

const nom = ref('')
const bilanN = ref(creerBilanVide())
const bilanN1 = ref(creerBilanVide())
const crN = ref(creerCRVide())
const crN1 = ref(creerCRVide())

const fichierInput = ref(null)
const importEnCours = ref(false)
const resultatImport = ref(null) // { postesReconnus, postesTotal, postesNonReconnus }
const erreurImport = ref('')

function declencherImport() {
  fichierInput.value?.click()
}

async function surFichierChoisi(e) {
  const file = e.target.files?.[0]
  if (!file) return
  importEnCours.value = true
  erreurImport.value = ''
  resultatImport.value = null
  try {
    const r = await importerClasseurExcel(file)
    bilanN.value = r.bilanN
    bilanN1.value = r.bilanN1
    crN.value = r.crN
    crN1.value = r.crN1
    resultatImport.value = { postesReconnus: r.postesReconnus, postesTotal: r.postesTotal, postesNonReconnus: r.postesNonReconnus }
    // Tout reconnu et bilan équilibré : direction les résultats. Sinon on reste
    // sur le Bilan pour que l'utilisateur complète/corrige ce qui manque.
    if (r.postesNonReconnus.length === 0 && verifierEquilibreBilan(r.bilanN).equilibre && verifierEquilibreBilan(r.bilanN1).equilibre) {
      etape.value = 3
    } else {
      etape.value = 1
    }
  } catch (err) {
    erreurImport.value = "Impossible de lire ce fichier — vérifiez qu'il s'agit bien du modèle Excel téléchargé depuis cette page."
  } finally {
    importEnCours.value = false
    e.target.value = ''
  }
}

const ETAPES = [
  { n: 1, label: 'Bilan' },
  { n: 2, label: 'Compte de Résultat' },
  { n: 3, label: 'Résultats' },
]
const etape = ref(1)

const equilibreN = computed(() => verifierEquilibreBilan(bilanN.value))
const equilibreN1 = computed(() => verifierEquilibreBilan(bilanN1.value))
const bilanBloquant = computed(() => !equilibreN.value.equilibre || !equilibreN1.value.equilibre)

const ratios = computed(() => calculerRatios(bilanN.value, bilanN1.value, crN.value, crN1.value))
const scoreFinancement = computed(() => calculerScoreFinancement(ratios.value))

function allerEtape(n) {
  if (n > etape.value && etape.value === 1 && bilanBloquant.value) return
  etape.value = n
}
</script>

<template>
  <div class="analyse-financiere">
    <div class="af-import-bar no-print">
      <div class="af-import-text">
        <strong>Trop de champs à remplir à la main ?</strong>
        <span>Téléchargez le modèle Excel, remplissez-le avec vos chiffres (copier-coller depuis votre propre fichier si vous en avez un), puis réimportez-le ici.</span>
      </div>
      <div class="af-import-buttons">
        <button class="btn btn-outline" @click="genererModeleImport">↓ Télécharger le modèle Excel</button>
        <button class="btn btn-primary" @click="declencherImport" :disabled="importEnCours">
          {{ importEnCours ? 'Import en cours…' : '↑ Importer un fichier rempli' }}
        </button>
        <input ref="fichierInput" type="file" accept=".xlsx,.xls" style="display: none;" @change="surFichierChoisi" />
      </div>
      <div v-if="erreurImport" class="af-import-msg af-import-erreur">{{ erreurImport }}</div>
      <div v-else-if="resultatImport" class="af-import-msg" :class="resultatImport.postesNonReconnus.length ? 'af-import-partiel' : 'af-import-ok'">
        <span v-if="resultatImport.postesNonReconnus.length === 0">
          ✓ {{ resultatImport.postesReconnus }} postes importés avec succès.
        </span>
        <span v-else>
          {{ resultatImport.postesReconnus }} postes reconnus sur {{ resultatImport.postesTotal }}. Non reconnus (à compléter à la main) :
          {{ resultatImport.postesNonReconnus.join(', ') }}
        </span>
      </div>
    </div>

    <div class="af-header no-print">
      <div class="af-nom-field">
        <label>Nom de l'entreprise (optionnel, pour la fiche PDF)</label>
        <input type="text" v-model="nom" placeholder="Ex: Cabinet Test SARL" />
      </div>
      <div class="af-stepper">
        <button
          v-for="e in ETAPES" :key="e.n"
          class="af-step-btn" :class="{ active: etape === e.n, done: etape > e.n }"
          @click="allerEtape(e.n)"
        >
          <span class="af-step-num">{{ e.n }}</span>
          {{ e.label }}
        </button>
      </div>
    </div>

    <div class="af-body">
      <BilanForm v-if="etape === 1" :bilan-n="bilanN" :bilan-n1="bilanN1" />
      <CompteResultatForm v-else-if="etape === 2" :cr-n="crN" :cr-n1="crN1" />
      <div v-else-if="etape === 3" class="af-resultats">
        <div class="no-print af-resultats-preview">
          <ScoreFinancement :resultat="scoreFinancement" />
          <RatiosResultats :ratios="ratios" />
        </div>
        <FicheAnalyseExport
          :nom="nom" :bilan-n="bilanN" :bilan-n1="bilanN1" :cr-n="crN" :cr-n1="crN1"
          :ratios="ratios" :score-financement="scoreFinancement"
        />
      </div>
    </div>

    <div class="af-nav no-print">
      <div v-if="etape === 1 && bilanBloquant" class="af-bloquant-msg">
        ⚠ Corrigez l'équilibre du bilan (Actif = Passif) avant de continuer.
      </div>
      <div class="af-nav-buttons">
        <button v-if="etape > 1" class="btn btn-outline" @click="etape--">← Précédent</button>
        <button v-if="etape < 3" class="btn btn-primary" :disabled="etape === 1 && bilanBloquant" @click="etape++">Suivant →</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analyse-financiere {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 1100px;
  margin: 0 auto;
}

.af-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.af-import-bar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%);
  border: 1px dashed #6ee7b7;
  border-radius: var(--radius-lg);
  padding: 1.1rem 1.25rem;
}
.af-import-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.af-import-text strong {
  font-size: 0.92rem;
  color: var(--text-dark);
}
.af-import-text span {
  font-size: 0.82rem;
  color: var(--text-muted);
}
.af-import-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.af-import-msg {
  font-size: 0.82rem;
  padding: 0.6rem 0.85rem;
  border-radius: 10px;
  line-height: 1.5;
}
.af-import-ok { background: #d1fae5; color: #065f46; }
.af-import-partiel { background: #fef3c7; color: #92400e; }
.af-import-erreur { background: #fee2e2; color: #991b1b; }

.af-nom-field label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.35rem;
}
.af-nom-field input { max-width: 360px; }

.af-stepper {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.af-step-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.1rem;
  border-radius: 9999px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-muted);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.af-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bg-input);
  color: var(--text-muted);
  font-size: 0.7rem;
}
.af-step-btn.active { background: var(--primary); border-color: var(--primary); color: #fff; }
.af-step-btn.active .af-step-num { background: rgba(255,255,255,0.25); color: #fff; }
.af-step-btn.done .af-step-num { background: #d1fae5; color: #059669; }

.af-resultats {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.af-resultats-preview {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.af-nav {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.af-bloquant-msg {
  padding: 0.65rem 1rem;
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: var(--radius);
  font-size: 0.85rem;
  font-weight: 600;
}
.af-nav-buttons {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
</style>
