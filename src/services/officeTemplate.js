// ═══════════════════════════════════════════════════════
// MODÈLES WORD ET EXCEL — service client
//
// Le fichier reste dans le navigateur entre l'analyse et la validation : le
// serveur ne conserve rien. Réanalyser ne demande donc pas de le renvoyer, et
// rien n'est appliqué au modèle tant que l'utilisateur n'a pas validé.
// ═══════════════════════════════════════════════════════

const enTetes = () => {
  const token = localStorage.getItem('auth_token')
  if (!token) throw new Error("Vous devez être connecté pour analyser un modèle.")
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function appeler(url, corps) {
  const reponse = await fetch(url, { method: 'POST', headers: enTetes(), body: JSON.stringify(corps) })
  const resultat = await reponse.json().catch(() => ({}))
  if (!reponse.ok) throw new Error(resultat.error || "L'opération a échoué.")
  return resultat
}

/** Formats acceptés, et pourquoi ils sont préférables à un PDF. */
export const FORMATS_ACCEPTES = '.docx,.xlsx'

export function estFichierOffice(fichier) {
  return /\.(docx|xlsx)$/i.test(fichier?.name || '')
}

export function lireFichier(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onload = () => resolve(lecteur.result)
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    lecteur.readAsDataURL(fichier)
  })
}

/** Types de documents proposés dans les paramètres. */
export async function chargerTypesDocuments() {
  const token = localStorage.getItem('auth_token')
  const reponse = await fetch('/api/rh/office/types', {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  if (!reponse.ok) return []
  const resultat = await reponse.json().catch(() => ({}))
  return resultat.types || []
}

/**
 * Première étape : le moteur PROPOSE. Le modèle n'est pas modifié.
 * @returns {{ emplacements, variables, completude, apercu, resume, format }}
 */
export function analyserModeleOffice({ fileBase64, filename, docType }) {
  return appeler('/api/rh/office/analyser', { fileBase64, filename, docType })
}

/**
 * Seconde étape, après validation : les emplacements retenus deviennent des
 * variables dans le fichier d'origine.
 * @param emplacements  ceux que l'utilisateur a conservés
 */
export function produireGabaritOffice({ fileBase64, filename, emplacements }) {
  return appeler('/api/rh/office/gabarit', { fileBase64, filename, emplacements })
}

/** Convertit une base64 renvoyée par le serveur en fichier téléchargeable. */
export function versBlob(base64, format) {
  const binaire = atob(base64)
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  const type = format === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return new Blob([octets], { type })
}

// ═══════════════════════════════════════════════════════
// TYPES DE DOCUMENTS — table unique
//
// L'assistant raisonne avec les codes du moteur (bulletin_paie, contrat_travail…)
// tandis que le reste de l'application range les modèles par type applicatif
// (payslip, contract…). Faute de correspondance explicite, un modèle enregistré
// sous « contrat_travail » retombait sur l'étiquette par défaut « Bulletin de
// paie » : le type choisi par l'utilisateur était perdu à l'affichage.
//
// Un modèle porte donc les DEUX : `type` pour les recherches existantes,
// `docType` pour dire précisément ce qu'il est.
// ═══════════════════════════════════════════════════════
export const TYPES_DOCUMENT = {
  bulletin_paie:       { app: 'payslip',     libelle: 'Bulletin de paie' },
  solde_tout_compte:   { app: 'stc',         libelle: 'Solde de tout compte' },
  contrat_travail:     { app: 'contract',    libelle: 'Contrat de travail' },
  attestation_travail: { app: 'certificate', libelle: 'Attestation de travail' },
  certificat_travail:  { app: 'certificate', libelle: 'Certificat de travail' },
  autre:               { app: 'hr_document', libelle: 'Document RH' }
}

const LIBELLES_APP = {
  payslip: 'Bulletin de paie',
  stc: 'Solde de tout compte',
  contract: 'Contrat de travail',
  certificate: 'Attestation de travail',
  hr_document: 'Document RH'
}

/** Type applicatif correspondant à un code du moteur. */
export function typeApplicatif(docType) {
  return TYPES_DOCUMENT[docType]?.app || 'hr_document'
}

/** Étiquette à afficher pour un modèle enregistré, quel que soit son âge. */
export function libelleModele(modele) {
  if (!modele) return 'Document RH'
  if (modele.docType && TYPES_DOCUMENT[modele.docType]) return TYPES_DOCUMENT[modele.docType].libelle
  return LIBELLES_APP[modele.type || 'payslip'] || 'Document RH'
}

/** Un modèle issu de l'assistant Word / Excel (par opposition aux modèles PDF). */
export function estModeleOffice(modele) {
  return !!(modele && modele.source === 'office' && modele.officeBase64)
}

/**
 * Remplit un gabarit Word ou Excel avec les données d'un document.
 * Le fichier n'est jamais reconstruit : seuls les {placeholders} sont substitués.
 */
export function remplirModeleOffice({ gabaritBase64, format, donnees }) {
  return appeler('/api/rh/office/remplir', { gabaritBase64, format, donnees })
}
