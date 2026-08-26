<script setup>
// ═══════════════════════════════════════════════════════
// CONCEPTION DU MODÈLE « SUR-MESURE » PAR CONVERSATION
//
// Le glisser-déposer manuel s'est révélé trop pénible à l'usage : ici,
// l'utilisateur décrit ce qu'il veut en français, l'IA produit directement
// la disposition (bulletinCanvasLayout — le même format que
// payrollService.js imprime via absolutePosition), un aperçu PDF réel
// s'affiche immédiatement, et un clic sur « Valider » l'enregistre. Chaque
// nouvelle demande part de la disposition en cours, pas de zéro : c'est un
// réglage successif, pas une regénération à chaque message.
// ═══════════════════════════════════════════════════════
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { showToast } from '../services/toast.js'

const emit = defineEmits(['fermer', 'enregistre'])

const chargement = ref(true)
const messages = ref([])
const currentLayout = ref([])
const userInput = ref('')
const envoiEnCours = ref(false)
const previewUrl = ref(null)
const genererApercuEnCours = ref(false)
const saving = ref(false)
const zoneMessages = ref(null)
const importEnCours = ref(false)
const importErreur = ref('')

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token')}` })

// La reproduction à partir d'une PHOTO (vision) a été désactivée : le résultat
// n'était pas assez fidèle en pratique pour être proposé tel quel. Le moteur
// (aiService.genererBulletinCanvasIA accepte toujours un paramètre "image",
// server.js aussi) reste en place pour une reprise ultérieure, mais rien dans
// cette interface n'envoie plus d'image — texte uniquement.
//
// L'import PDF ci-dessous est différent : il ne passe PAS par l'IA. Il
// s'appuie sur le moteur déterministe déjà utilisé pour l'import de modèles
// (docengine — géométrie réelle du PDF, positions exactes) pour poser un
// premier jet fidèle, que l'utilisateur affine ensuite dans le chat.

const defiler = () => nextTick(() => { if (zoneMessages.value) zoneMessages.value.scrollTop = zoneMessages.value.scrollHeight })

const genererApercu = async () => {
  genererApercuEnCours.value = true
  try {
    const res = await fetch('/api/rh/preview-bulletin-style', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ templateStyle: 'surMesure', bulletinCanvasLayout: currentLayout.value })
    })
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Erreur lors de l'aperçu") }
    const blob = await res.blob()
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)
  } catch (e) {
    showToast(e.message || "Erreur lors de l'aperçu", 'error')
  } finally {
    genererApercuEnCours.value = false
  }
}

const chargerDonnees = async () => {
  chargement.value = true
  try {
    const res = await fetch('/api/rh/bulletin-canvas-layout', { headers: authHeaders() })
    if (!res.ok) throw new Error('Chargement impossible')
    const data = await res.json()
    const dejaPersonnalise = Array.isArray(data.layout) && JSON.stringify(data.layout) !== JSON.stringify(data.layoutParDefaut)
    currentLayout.value = data.layout || data.layoutParDefaut || []
    messages.value = [{
      role: 'assistant',
      content: dejaPersonnalise
        ? "Voici votre modèle « Sur-mesure » actuel. Dites-moi ce que vous voulez changer (couleurs, position d'un bloc, ajouter les charges patronales…), importez un PDF (📄 ci-dessous) pour repartir d'un vrai bulletin, ou décrivez un bulletin complètement différent."
        : "Décrivez le bulletin que vous voulez (logo, couleurs, disposition des blocs, ce qui doit apparaître…), ou importez directement un PDF d'un vrai bulletin (📄 ci-dessous) pour partir de sa mise en page exacte. Vous pourrez ensuite me demander des ajustements avant de valider."
    }]
    await genererApercu()
  } catch (e) {
    showToast(e.message || 'Erreur de chargement', 'error')
  } finally {
    chargement.value = false
    defiler()
  }
}
onMounted(chargerDonnees)

const envoyerMessage = async () => {
  const texte = userInput.value.trim()
  if (!texte || envoiEnCours.value) return
  messages.value.push({ role: 'user', content: texte })
  userInput.value = ''
  envoiEnCours.value = true
  defiler()
  try {
    const token = localStorage.getItem('auth_token')
    // On ne renvoie que les derniers échanges : l'IA reçoit déjà toute la
    // disposition en cours à part, l'historique ne sert qu'à comprendre le
    // fil de la conversation, pas à retenir des détails déjà dans le layout.
    const historiqueRecent = messages.value.slice(-10).map(m => ({ role: m.role, content: m.content }))
    const res = await fetch('/api/rh/bulletin-canvas-ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: historiqueRecent, currentLayout: currentLayout.value })
    })
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erreur') }
    const data = await res.json()
    currentLayout.value = data.layout || currentLayout.value
    messages.value.push({ role: 'assistant', content: data.message || 'Disposition mise à jour.' })
    await genererApercu()
  } catch (e) {
    messages.value.push({ role: 'assistant', content: `⚠️ ${e.message || 'Erreur'}`, erreur: true })
    showToast(e.message || 'Erreur', 'error')
  } finally {
    envoiEnCours.value = false
    defiler()
  }
}

// Un PDF NATIF (avec du texte sélectionnable), pas un scan — le moteur
// déterministe a besoin d'une couche texte, sinon il n'a rien à mesurer.
const PDF_TAILLE_MAX = 15 * 1024 * 1024
const importerPdf = (evenement) => {
  const fichier = evenement.target.files[0]
  evenement.target.value = ''
  if (!fichier) return
  importErreur.value = ''
  if (fichier.type !== 'application/pdf' && !/\.pdf$/i.test(fichier.name)) {
    importErreur.value = 'Le fichier doit être un PDF.'
    return
  }
  if (fichier.size > PDF_TAILLE_MAX) {
    importErreur.value = `Fichier trop lourd (max ${(PDF_TAILLE_MAX / 1024 / 1024).toFixed(0)} Mo).`
    return
  }
  const lecteur = new FileReader()
  lecteur.onload = async () => {
    importEnCours.value = true
    try {
      const res = await fetch('/api/rh/bulletin-canvas-from-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ fileBase64: lecteur.result, filename: fichier.name })
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Erreur lors de l'import") }
      const data = await res.json()
      currentLayout.value = data.layout || currentLayout.value
      messages.value.push({ role: 'assistant', content: `📄 ${data.message}` })
      await genererApercu()
      defiler()
    } catch (e) {
      showToast(e.message || "Erreur lors de l'import", 'error')
    } finally {
      importEnCours.value = false
    }
  }
  lecteur.onerror = () => { importErreur.value = 'Lecture du fichier impossible.' }
  lecteur.readAsDataURL(fichier)
}

const valider = async () => {
  saving.value = true
  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ bulletinCanvasLayout: currentLayout.value })
    })
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erreur') }
    showToast('Modèle « Sur-mesure » enregistré.', 'success')
    emit('enregistre')
  } catch (e) {
    showToast(e.message || 'Erreur', 'error')
  } finally {
    saving.value = false
  }
}

const fermerSurEchap = (evt) => { if (evt.key === 'Escape') emit('fermer') }
onMounted(() => window.addEventListener('keydown', fermerSurEchap))
onUnmounted(() => {
  window.removeEventListener('keydown', fermerSurEchap)
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <div class="chat-overlay" @click.self="$emit('fermer')">
    <div class="chat-panel">
      <div class="chat-entete">
        <div>
          <h3 class="chat-titre">Modèle « Sur-mesure » — conçu avec l'IA</h3>
          <p class="chat-sous-titre">Décrivez ce que vous voulez, l'aperçu à droite se met à jour à chaque message. Cliquez sur « Valider » quand il vous convient.</p>
        </div>
        <button type="button" class="chat-fermer" title="Fermer" aria-label="Fermer" @click="$emit('fermer')">&times;</button>
      </div>

      <div v-if="chargement" style="padding: 60px; text-align: center; color: #64748b;">Chargement…</div>

      <div v-else class="chat-corps">
        <div class="chat-colonne-conversation">
          <div class="chat-messages" ref="zoneMessages">
            <div v-for="(m, i) in messages" :key="i" class="chat-message" :class="[m.role, { erreur: m.erreur }]">
              {{ m.content }}
            </div>
            <div v-if="envoiEnCours" class="chat-message assistant chat-en-cours">L'IA compose la disposition…</div>
            <div v-if="importEnCours" class="chat-message assistant chat-en-cours">Analyse du PDF…</div>
          </div>
          <p v-if="importErreur" style="color: #dc2626; font-size: 0.78rem; margin: 4px 0 0;">{{ importErreur }}</p>
          <label class="chat-importer-pdf" :class="{ disabled: envoiEnCours || importEnCours }" title="Importer un vrai bulletin en PDF comme point de départ (position exacte, pas devinée)">
            📄 Importer un PDF (position exacte, pas par l'IA)
            <input type="file" accept="application/pdf" @change="importerPdf" :disabled="envoiEnCours || importEnCours" style="display: none;" />
          </label>
          <form class="chat-saisie" @submit.prevent="envoyerMessage">
            <textarea
              v-model="userInput"
              rows="3"
              placeholder="Ex : Mets le logo en haut à gauche, le titre en violet à droite, ajoute les charges patronales au tableau, et un filigrane léger avec le nom de l'entreprise."
              @keydown.enter.exact.prevent="envoyerMessage"
              :disabled="envoiEnCours"
            ></textarea>
            <button type="submit" :disabled="envoiEnCours || !userInput.trim()" class="chat-envoyer">
              {{ envoiEnCours ? 'Envoi…' : 'Envoyer' }}
            </button>
          </form>
        </div>

        <div class="chat-colonne-apercu">
          <div class="apercu-cadre">
            <div v-if="genererApercuEnCours" class="apercu-chargement">Génération de l'aperçu…</div>
            <iframe v-if="previewUrl" :src="previewUrl" class="apercu-iframe"></iframe>
          </div>
          <button @click="valider" :disabled="saving || genererApercuEnCours" class="chat-valider">
            {{ saving ? 'Enregistrement…' : '✓ Valider et enregistrer ce modèle' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px); display: flex; align-items: center;
  justify-content: center; z-index: 200; padding: 16px;
}
.chat-panel {
  background: #fff; border-radius: 16px; padding: 20px; width: 100%;
  max-width: 1300px; height: 92vh; display: flex; flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
}
.chat-entete { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
.chat-titre { margin: 0 0 4px; color: #0f172a; font-size: 1.05rem; }
.chat-sous-titre { margin: 0; color: #64748b; font-size: 0.82rem; line-height: 1.4; max-width: 700px; }
.chat-fermer {
  margin-left: auto; flex: none; width: 32px; height: 32px; line-height: 1;
  border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;
  color: #64748b; font-size: 1.35rem; cursor: pointer;
}
.chat-fermer:hover { background: #f1f5f9; color: #0f172a; }

.chat-corps { display: flex; gap: 18px; flex: 1; min-height: 0; }

.chat-colonne-conversation { width: 400px; flex: none; display: flex; flex-direction: column; min-height: 0; }
.chat-messages { flex: 1; overflow-y: auto; padding: 4px 4px 4px 0; display: flex; flex-direction: column; gap: 10px; }
.chat-message { padding: 10px 12px; border-radius: 10px; font-size: 0.85rem; line-height: 1.45; max-width: 92%; }
.chat-message.assistant { background: #f1f5f9; color: #0f172a; align-self: flex-start; }
.chat-message.user { background: #2563eb; color: white; align-self: flex-end; }
.chat-message.erreur { background: #fef2f2; color: #b91c1c; }
.chat-en-cours { color: #64748b; font-style: italic; }

.chat-importer-pdf {
  display: block; text-align: center; font-size: 0.78rem; color: #475569; cursor: pointer;
  background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 8px 10px;
  margin-top: 8px;
}
.chat-importer-pdf:hover { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.chat-importer-pdf.disabled { opacity: 0.6; cursor: default; pointer-events: none; }

.chat-saisie { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.chat-saisie textarea {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; font-size: 0.85rem;
  font-family: inherit; resize: vertical;
}
.chat-envoyer {
  background: #2563eb; border: none; color: white; padding: 10px; border-radius: 8px;
  cursor: pointer; font-weight: 700; font-size: 0.85rem;
}
.chat-envoyer:disabled { opacity: 0.6; cursor: default; }

.chat-colonne-apercu { flex: 1; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.apercu-cadre {
  flex: 1; background: #e2e8f0; border-radius: 10px; overflow: hidden; position: relative;
  display: flex; align-items: center; justify-content: center;
}
.apercu-iframe { width: 100%; height: 100%; border: none; }
.apercu-chargement { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #475569; font-size: 0.85rem; background: rgba(226,232,240,0.9); z-index: 1; }
.chat-valider {
  background: #16a34a; border: none; color: white; padding: 13px; border-radius: 10px;
  cursor: pointer; font-weight: 700; font-size: 0.95rem; box-shadow: 0 4px 12px rgba(22,163,74,0.25);
}
.chat-valider:disabled { opacity: 0.6; cursor: default; }
</style>
