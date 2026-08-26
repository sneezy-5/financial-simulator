<script setup>
// ═══════════════════════════════════════════════════════
// ASSISTANT DE MODÈLE WORD / EXCEL
//
// Trois temps, dans cet ordre, et jamais l'inverse :
//   1. l'utilisateur choisit le TYPE de document
//   2. le moteur PROPOSE des emplacements — rien n'est modifié
//   3. l'utilisateur VALIDE, ou fait RÉANALYSER
//
// Le fichier ne quitte le navigateur que pour être lu. Il n'est transformé
// qu'au moment où l'utilisateur clique sur « Valider ».
// ═══════════════════════════════════════════════════════
import { ref, computed, onMounted } from 'vue'
import {
  FORMATS_ACCEPTES, estFichierOffice, lireFichier,
  chargerTypesDocuments, analyserModeleOffice, produireGabaritOffice
} from '../services/officeTemplate.js'
import { showToast } from '../services/toast.js'

const emit = defineEmits(['gabarit-valide', 'annuler'])

const types = ref([])
const typeChoisi = ref('bulletin_paie')
const fichier = ref(null)
const fileBase64 = ref(null)
const analyse = ref(null)
const enCours = ref(false)
const etape = ref(1)   // 1 = choix, 2 = validation
// Nom affiché du modèle une fois enregistré : pré-rempli depuis le fichier,
// mais librement modifiable — importer « Contrat_V3_final.docx » ne doit pas
// coincer l'utilisateur avec ce nom-là pour toujours (ex: « CDD Développeur »).
const nomPersonnalise = ref('')

// Emplacements décochés par l'utilisateur : ils resteront en texte figé.
const ecartes = ref(new Set())

onMounted(async () => { types.value = await chargerTypesDocuments() })

const typeCourant = computed(() => types.value.find(t => t.code === typeChoisi.value) || null)

const emplacementsRetenus = computed(() =>
  (analyse.value?.emplacements || []).filter(e => !ecartes.value.has(e.original))
)

const choisirFichier = async (evenement) => {
  const f = evenement.target.files[0]
  if (!f) return
  if (!estFichierOffice(f)) {
    showToast('Fournissez un fichier .docx ou .xlsx.', 'error')
    evenement.target.value = ''
    return
  }
  fichier.value = f
  fileBase64.value = await lireFichier(f)
  analyse.value = null
  etape.value = 1
  if (!nomPersonnalise.value) nomPersonnalise.value = f.name.replace(/\.(docx|xlsx)$/i, '')
}

const analyser = async () => {
  if (!fileBase64.value) return
  enCours.value = true
  try {
    analyse.value = await analyserModeleOffice({
      fileBase64: fileBase64.value,
      filename: fichier.value.name,
      docType: typeChoisi.value
    })
    ecartes.value = new Set()
    etape.value = 2
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    enCours.value = false
  }
}

const basculer = (emplacement) => {
  const suivant = new Set(ecartes.value)
  if (suivant.has(emplacement.original)) suivant.delete(emplacement.original)
  else suivant.add(emplacement.original)
  ecartes.value = suivant
}

const valider = async () => {
  if (!emplacementsRetenus.value.length) {
    showToast('Aucun emplacement retenu : il n\'y a rien à paramétrer.', 'error')
    return
  }
  if (!nomPersonnalise.value.trim()) {
    showToast('Donnez un nom à ce modèle.', 'error')
    return
  }
  enCours.value = true
  try {
    const resultat = await produireGabaritOffice({
      fileBase64: fileBase64.value,
      filename: fichier.value.name,
      emplacements: emplacementsRetenus.value
    })
    emit('gabarit-valide', {
      nom: nomPersonnalise.value.trim(),
      format: resultat.format,
      gabaritBase64: resultat.gabaritBase64,
      docType: typeChoisi.value,
      variables: [...new Set(emplacementsRetenus.value.map(e => e.variable))],
      introuvables: resultat.introuvables
    })
    showToast(`Modèle validé : ${resultat.remplaces} emplacement(s) paramétré(s).`, 'success')
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    enCours.value = false
  }
}

const reanalyser = () => { analyse.value = null; etape.value = 1 }
</script>

<template>
  <div class="assistant">
    <!-- ── Étape 1 : type de document et fichier ── -->
    <div v-if="etape === 1" class="bloc">
      <h4>1. Quel type de document ?</h4>
      <p class="aide">
        Le type détermine les variables attendues et la façon de lire le document.
        Un bulletin se lit comme une grille, un contrat comme un texte rédigé.
      </p>
      <select v-model="typeChoisi" class="champ">
        <option v-for="t in types" :key="t.code" :value="t.code">{{ t.libelle }}</option>
      </select>
      <p v-if="typeCourant" class="type-desc">{{ typeCourant.description }}</p>

      <h4 style="margin-top: 20px;">2. Votre modèle</h4>
      <p class="aide">
        Word ou Excel uniquement. Ces formats déclarent leur structure : votre mise en
        page est <strong>conservée telle quelle</strong>, elle n'est jamais reconstruite.
        Fournissez un document <strong>rempli avec de vraies valeurs</strong> — c'est ce
        qui permet de repérer les emplacements à paramétrer.
      </p>
      <label class="depot">
        <input type="file" :accept="FORMATS_ACCEPTES" @change="choisirFichier" />
        <span v-if="!fichier">Choisir un fichier .docx ou .xlsx</span>
        <span v-else class="depot-nom">{{ fichier.name }}</span>
      </label>

      <div class="actions">
        <button class="btn" :disabled="!fichier || enCours" @click="analyser">
          {{ enCours ? 'Analyse en cours…' : 'Analyser le modèle' }}
        </button>
        <button class="btn ghost" @click="emit('annuler')">Annuler</button>
      </div>
    </div>

    <!-- ── Étape 2 : validation ── -->
    <div v-else-if="analyse" class="bloc">
      <div class="champ-nom">
        <label>Nom du modèle</label>
        <input type="text" class="champ" v-model="nomPersonnalise" placeholder="Ex : CDD Développeur, Contrat de Stage…" />
        <p class="aide" style="margin: 4px 0 0;">C'est ce nom qui apparaîtra dans votre liste de modèles — libre à vous de le changer, il ne dépend pas du nom du fichier importé.</p>
      </div>

      <h4>Ce que le moteur propose</h4>

      <div class="completude" :class="{ insuffisant: !analyse.completude.suffisant }">
        <strong v-if="analyse.completude.suffisant">
          Modèle exploitable — {{ analyse.resume.emplacements }} emplacement(s) repéré(s)
        </strong>
        <strong v-else>Ce modèle semble trop peu renseigné</strong>
        <p v-if="!analyse.completude.suffisant">{{ analyse.completude.conseil }}</p>
        <p v-if="analyse.completude.manquantes.length" class="manquantes">
          Non repéré : {{ analyse.completude.manquantes.join(', ') }}
        </p>
      </div>

      <p class="aide">
        Comparez : les champs repérés dans votre fichier à gauche, le document tel qu'il
        deviendra à droite. Décochez ce qui ne doit <em>pas</em> devenir une variable : ces
        textes resteront écrits en dur.
      </p>

      <div class="comparaison">
        <div class="comparaison-col">
          <div class="comparaison-label">CHAMPS REPÉRÉS DANS VOTRE FICHIER</div>
          <ul class="emplacements">
            <li v-for="e in analyse.emplacements" :key="e.original"
                :class="{ ecarte: ecartes.has(e.original) }">
              <input type="checkbox" :checked="!ecartes.has(e.original)" @change="basculer(e)" />
              <span class="valeur">{{ e.original }}</span>
              <span class="fleche">→</span>
              <code :class="{ provisoire: !e.mappe }">{{ '{' + e.variable + '}' }}</code>
              <span class="contexte">{{ e.libelle || e.raison }}</span>
            </li>
          </ul>
        </div>
        <div class="comparaison-col">
          <div class="comparaison-label">LE DOCUMENT TEL QU'IL DEVIENDRA</div>
          <div class="apercu">
            <template v-for="(ligne, i) in analyse.apercu" :key="i">
              <p v-if="ligne.type === 'paragraphe'" :class="{ gras: ligne.gras }">{{ ligne.texte }}</p>
              <table v-else>
                <tr v-for="(rang, r) in ligne.rangs" :key="r">
                  <td v-for="(cellule, c) in rang" :key="c" :colspan="cellule.colSpan"
                      :class="{ gras: cellule.gras, variable: cellule.variable }">{{ cellule.texte }}</td>
                </tr>
              </table>
            </template>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn" :disabled="enCours || !emplacementsRetenus.length" @click="valider">
          Valider ce modèle ({{ emplacementsRetenus.length }})
        </button>
        <button class="btn ghost" :disabled="enCours" @click="reanalyser">Réanalyser</button>
        <button class="btn ghost" :disabled="enCours" @click="emit('annuler')">Annuler</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assistant { font-size: 0.88rem; color: #334155; }
.bloc { display: flex; flex-direction: column; }
h4 { margin: 0 0 6px; color: #0f172a; font-size: 0.95rem; }
.aide { margin: 0 0 10px; font-size: 0.8rem; color: #64748b; line-height: 1.5; }
.type-desc { margin: 6px 0 0; font-size: 0.78rem; color: #475569; font-style: italic; }
.champ {
  width: 100%; padding: 9px 11px; border: 1px solid #cbd5e1;
  border-radius: 8px; background: #fff; color: #0f172a;
}
.champ-nom { margin-bottom: 16px; }
.champ-nom label { display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px; }
.depot {
  display: block; padding: 18px; border: 2px dashed #cbd5e1; border-radius: 10px;
  text-align: center; cursor: pointer; color: #64748b; background: #f8fafc;
}
.depot input { display: none; }
.depot-nom { color: #0f172a; font-weight: 600; }
.actions { display: flex; gap: 10px; margin-top: 18px; }
.btn {
  padding: 9px 16px; border-radius: 8px; border: none; background: #2563eb;
  color: #fff; font-weight: 600; cursor: pointer; font-size: 0.85rem;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.ghost { background: #fff; color: #475569; border: 1px solid #cbd5e1; }

.completude {
  padding: 12px 14px; border-radius: 8px; margin-bottom: 14px;
  background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46;
}
.completude.insuffisant { background: #fffbeb; border-color: #fcd34d; color: #78350f; }
.completude p { margin: 6px 0 0; font-size: 0.79rem; line-height: 1.5; }
.manquantes { font-style: italic; }

.comparaison { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 720px) { .comparaison { grid-template-columns: 1fr; } }
.comparaison-col { display: flex; flex-direction: column; min-width: 0; }
.comparaison-label { font-size: 0.7rem; color: #94a3b8; font-weight: 700; letter-spacing: 0.02em; margin-bottom: 6px; text-align: center; }

.emplacements { list-style: none; margin: 0; padding: 0; height: 340px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
.emplacements li {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-bottom: 1px solid #f1f5f9; font-size: 0.8rem;
}
.emplacements li.ecarte { opacity: 0.42; }
.valeur { font-weight: 600; color: #0f172a; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fleche { color: #94a3b8; }
code { background: #eff6ff; color: #1d4ed8; padding: 1px 6px; border-radius: 4px; font-size: 0.76rem; }
code.provisoire { background: #fef3c7; color: #92400e; }
.contexte { margin-left: auto; color: #94a3b8; font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90px; }

.apercu {
  padding: 14px; background: #fff; border: 1px solid #e2e8f0;
  border-radius: 8px; height: 340px; overflow: auto; font-size: 0.78rem; box-sizing: border-box;
}
.apercu p { margin: 0 0 4px; }
.apercu .gras { font-weight: 700; }
.apercu table { border-collapse: collapse; margin: 8px 0; width: 100%; }
.apercu td { border: 1px solid #e2e8f0; padding: 3px 6px; }
.apercu td.variable { background: #eff6ff; color: #1d4ed8; }
</style>
