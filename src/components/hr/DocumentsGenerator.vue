<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { localDb } from '../../services/localDatabase.js'
import { COUNTRIES_CONFIG } from '../../services/countryConfig.js'
import { showToast } from '../../services/toast.js'
import { showConfirm } from '../../services/confirmModal.js'
import EmployeeSelect from './EmployeeSelect.vue'
import RichDocEditor from './RichDocEditor.vue'
import OfficeTemplateWizard from '../OfficeTemplateWizard.vue'
import { estModeleOffice, libelleModele, typeApplicatif, remplirModeleOffice } from '../../services/officeTemplate.js'
import { getContracts, findActiveContract } from '../../services/payrollInput.js'

const props = defineProps({
  country: { type: String, default: 'CI' }
})

const countryInfo = computed(() => COUNTRIES_CONFIG[props.country] || COUNTRIES_CONFIG['CI'])

const isElectron = /electron/i.test(navigator.userAgent)

// ── Employés de l'annuaire local
const employees = ref([])
const selectedEmployeeId = ref('')
const selectedEmployee = computed(() => employees.value.find(e => e.id === selectedEmployeeId.value) || null)

const handleEmployeeSelect = (e) => {
  if (e && e.id) {
    selectedEmployeeId.value = e.id
  } else {
    selectedEmployeeId.value = ''
  }
  onEmployeeChange()
}

onMounted(async () => {
  try {
    employees.value = await localDb.getEmployees()
  } catch (e) {
    employees.value = []
  }
  contrats.value = getContracts()

  // Profil entreprise issu du classeur d'import : il évite de resaisir la
  // raison sociale, l'adresse et le signataire à chaque document.
  try {
    const entreprise = await localDb.getSetting('entreprise', null)
    if (entreprise) {
      profilEntreprise.value = entreprise
      docData.value.nomEntreprise = entreprise.raisonSociale || docData.value.nomEntreprise
      docData.value.adresseEntreprise = entreprise.adresse || docData.value.adresseEntreprise
      docData.value.signataireNom = entreprise.signataireNom || docData.value.signataireNom
      docData.value.signatairePoste = entreprise.signataireFonction || docData.value.signatairePoste
      docData.value.lieu = entreprise.ville || docData.value.lieu
      docData.value.numeroContribuable = entreprise.numeroContribuable || docData.value.numeroContribuable
      docData.value.numeroCnpsEmployeur = entreprise.numeroCnpsEmployeur || docData.value.numeroCnpsEmployeur
      docData.value.telephoneEntreprise = entreprise.telephone || docData.value.telephoneEntreprise
      docData.value.emailEntreprise = entreprise.email || docData.value.emailEntreprise
    }
  } catch (e) { /* profil absent : les champs restent à saisir */ }

  if (!docData.value.lieu) docData.value.lieu = countryInfo.value.villeParDefaut
})

// ── Sélection du modèle
const selectedTemplate = ref('')

// ── Données complémentaires du document
const docData = ref({
  dateDoc: new Date().toLocaleDateString('fr-FR'),
  lieu: '',
  motifAvertissement: '',
  motifLicenciement: '',
  dateEntree: '',
  dateSortie: '',
  dateDebutContrat: '',
  dateFinContrat: '',
  postePropose: '',
  nouveauSalaire: '',
  salaireBrut: '',
  // Décomposition de la rémunération pour les contrats CDI/CDD (salaire de base, sursalaire,
  // primes nommées) — les autres modèles (avenant, licenciement...) continuent d'utiliser
  // nouveauSalaire/salaireBrut en montant global.
  salaireDeBase: '',
  sursalaire: '',
  primes: [],
  formule: "Veuillez agréer, Madame/Monsieur, l'expression de nos salutations distinguées.",
  signataireNom: '',
  signatairePoste: 'Directeur des Ressources Humaines',
  nomEntreprise: '',
  adresseEntreprise: '',
  // Identité légale de l'employeur — aucune de ces informations n'existait
  // avant sur les documents générés ici (RCCM notamment : le profil
  // entreprise importé n'en tient pas trace, il n'y a donc pas de source à
  // reprendre automatiquement, contrairement au numéro contribuable/CNPS).
  numeroRc: '',
  numeroContribuable: '',
  numeroCnpsEmployeur: '',
  telephoneEntreprise: '',
  emailEntreprise: '',
})

// Pré-remplissage depuis l'employé sélectionné
// Contrats enregistrés localement, chargés au montage.
const contrats = ref([])

/**
 * Contrat applicable au salarié sélectionné, à la date du jour.
 *
 * Un salarié peut en avoir plusieurs (CDD renouvelé, avenant saisi comme
 * nouveau contrat) : on retient celui qui est en vigueur.
 */
const contratCourant = computed(() => {
  const emp = selectedEmployee.value
  if (!emp || !contrats.value.length) return null
  const maintenant = new Date()
  return findActiveContract(emp.id, contrats.value, {
    mois: maintenant.getMonth() + 1,
    annee: maintenant.getFullYear()
  })
})

const premier = (...valeurs) => {
  for (const v of valeurs) if (v !== undefined && v !== null && v !== '') return v
  return ''
}

/**
 * Pré-remplissage à la sélection d'un salarié.
 *
 * Le contrat fait foi sur la rémunération, le poste et les dates : c'est la
 * pièce signée. La fiche de l'annuaire ne sert que de recours quand le contrat
 * est muet ou absent, et pour l'identité.
 */
const onEmployeeChange = () => {
  const emp = selectedEmployee.value
  if (!emp) return
  const c = contratCourant.value

  // Le contrat fait foi sur la composition du salaire ; à défaut de contrat en
  // cours, `salaire_net` est le seul champ que l'annuaire garantit réellement
  // (voir la fiche employé) — `salaire_base`/`salaireDeBase` n'existent pas sur
  // une fiche employé, donc sans ce repli le champ restait vide dès qu'aucun
  // contrat actif n'était trouvé.
  docData.value.salaireDeBase = premier(c?.salaireDeBase, emp.salaire_net, emp.salaire_base, emp.salaireDeBase)
  docData.value.sursalaire = premier(c?.sursalaire, emp.sursalaire)
  docData.value.postePropose = premier(c?.poste, emp.poste)
  // Idem : le champ de l'annuaire est `date_embauche`, pas `dateEntree`/`date_entree`.
  docData.value.dateEntree = premier(emp.date_embauche, emp.dateEntree, emp.date_entree, c?.dateDebut)

  if (c) {
    docData.value.dateDebutContrat = premier(c.dateDebut, docData.value.dateDebutContrat)
    docData.value.dateFinContrat = c.type === 'CDD' ? premier(c.dateFin, '') : ''
    // Les primes du contrat sont recopiées telles quelles : ce sont elles qui
    // composent le brut, et elles doivent apparaître au contrat généré.
    if (Array.isArray(c.primes) && c.primes.length) {
      docData.value.primes = c.primes.map(p => ({
        libelle: p.libelle || '',
        montant: p.montant ?? '',
        imposable: p.imposable !== false
      }))
    }
  }

  // Le brut global reste utile aux modèles qui ne détaillent pas la rémunération.
  const totalContrat = c
    ? (parseFloat(c.salaireDeBase) || 0) + (parseFloat(c.sursalaire) || 0) +
      (c.primes || []).reduce((somme, p) => somme + (parseFloat(p.montant) || 0), 0)
    : 0
  docData.value.salaireBrut = totalContrat > 0 ? totalContrat : premier(emp.salaireBrut, emp.salaire, emp.salaire_net, '')

  if (emp.employeur || emp.nomEntreprise) {
    docData.value.nomEntreprise = emp.employeur || emp.nomEntreprise || ''
  }
}

// ── Primes du contrat (CDI/CDD) — non rattachées à l'annuaire, saisies par contrat
const addDocPrime = () => docData.value.primes.push({ libelle: '', montant: '' })
const removeDocPrime = (idx) => docData.value.primes.splice(idx, 1)

const docTotalBrut = computed(() =>
  (+docData.value.salaireDeBase || 0) +
  (+docData.value.sursalaire || 0) +
  docData.value.primes.reduce((sum, p) => sum + (+p.montant || 0), 0)
)

// ── Calcul de l'ancienneté
const calcAnciennete = (dateEntree, dateSortie) => {
  if (!dateEntree) return ''
  const parts = dateEntree.split('/')
  const d1 = parts.length === 3 ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}`) : new Date(dateEntree)
  const d2 = dateSortie ? (() => { const p2 = dateSortie.split('/'); return p2.length===3?new Date(`${p2[2]}-${p2[1]}-${p2[0]}`):new Date(dateSortie) })() : new Date()
  if (isNaN(d1.getTime())) return ''
  const mois = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth())
  const annees = Math.floor(mois / 12)
  const moisRest = mois % 12
  if (annees === 0) return `${moisRest} mois`
  return `${annees} an${annees > 1 ? 's' : ''}${moisRest > 0 ? ` et ${moisRest} mois` : ''}`
}

// ── Calcul des indemnités de licenciement (OHADA / UEMOA)
const calcIndemnites = computed(() => {
  const emp = selectedEmployee.value
  const brut = parseFloat(docData.value.salaireBrut) || parseFloat(emp?.salaireBrut) || 0
  const dateEntree = docData.value.dateEntree || emp?.dateEntree || emp?.date_entree
  if (!brut || !dateEntree) return null
  const parts = dateEntree.split('/')
  const d1 = parts.length === 3 ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}`) : new Date(dateEntree)
  if (isNaN(d1.getTime())) return null
  const d2 = new Date()
  const totalMois = Math.max(0, (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()))
  const annees = totalMois / 12
  let coeff = annees <= 5 ? 0.30 : annees <= 10 ? 0.35 : 0.40
  const indemnite = Math.round(brut * annees * coeff)
  const moisPreavis = annees >= 5 ? 3 : annees >= 1 ? 2 : 1
  const preavis = brut * moisPreavis
  return { indemnite, preavis, moisPreavis, annees: annees.toFixed(1) }
})

// ── Formatage des nombres
const fmt = (n) => {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' ' + (countryInfo.value.currency || 'FCFA')
}

// ── Liste des templates — personnalisés uniquement : chaque utilisateur
// importe ses propres modèles plutôt que de partir sur des modèles standard
// codés en dur. La génération de texte pour d'anciens ids fixes (contrat_cdi,
// attestation_travail…) reste plus bas dans `documentContent`, inerte tant
// qu'aucun modèle de la liste n'y correspond plus.
const customTemplates = ref([])
const allTemplates = computed(() => [...customTemplates.value])
// Un modele issu de l'assistant Word / Excel n'a pas de contenu HTML : son
// apercu et son telechargement passent par le gabarit, pas par le texte.
const modeleCourant = computed(() => allTemplates.value.find(t => t.id === selectedTemplate.value) || null)
const isCurrentTemplateDocx = computed(() => {
  const t = modeleCourant.value
  return !!t && (estModeleOffice(t) || !!t.isDocx)
})

/**
 * Modele enregistre par l'ancienne voie « auto-tag », dont le fichier stocke
 * n'est pas un vrai document : toute generation echouait dessus. On le signale
 * plutot que de laisser l'utilisateur buter sur une erreur incomprehensible.
 */
const modeleAReimporter = (t) => !!(t && t.isDocx && (!t.fileBase64 || String(t.fileBase64).length < 200))


onMounted(async () => {
  try {
    customTemplates.value = await localDb.getTemplates()
  } catch (err) {
    console.error("Erreur chargement modèles:", err)
  }
})

// ── Éditeur de modèles personnalisés
const isEditingModel = ref(false)
const modelForm = ref({
  id: '',
  label: '',
  color: '#ec4899',
  type: 'hr_document',
  content: ''
})

const openModelEditor = (tmpl = null) => {
  if (tmpl) {
    modelForm.value = { ...tmpl }
  } else {
    modelForm.value = {
      id: 'custom_' + Date.now(),
      label: 'Nouveau Modèle',
      color: '#ec4899',
      type: 'hr_document',
      content: 'Le soussigné, {{signataireNom}}, atteste que {{nomComplet}} est employé en qualité de {{poste}} depuis le {{dateEntree}}.\n\nFait à {{lieu}}, le {{dateDoc}}.'
    }
  }
  isEditingModel.value = true
}

// Variables reconnues par la substitution des modèles personnalisés (voir
// `documentContent` plus bas, lignes qui font `content.replace(/\{\{cle\}\}/g, ...)`)
// — liste tenue à jour avec ce remplacement, sinon une variable glissée dans
// l'éditeur resterait affichée telle quelle sur le document généré.
const VARIABLES_DISPONIBLES = [
  {
    groupe: 'Salarié',
    variables: [
      { cle: 'civilite', label: 'Civilité (M. / Mme, déduite du sexe de la fiche)' },
      { cle: 'nomComplet', label: 'Nom complet du salarié' },
      { cle: 'matricule', label: 'Matricule du salarié' },
      { cle: 'numeroCnpsSalarie', label: 'N° CNPS du salarié' },
      { cle: 'poste', label: 'Poste occupé (actuel)' },
      { cle: 'dateEntree', label: "Date d'entrée" },
      { cle: 'anciennete', label: 'Ancienneté calculée' },
      { cle: 'salaireAff', label: 'Salaire affiché' },
    ]
  },
  {
    groupe: 'Employeur',
    variables: [
      { cle: 'entreprise', label: "Nom de l'entreprise" },
      { cle: 'adresse', label: "Adresse de l'entreprise" },
      { cle: 'numeroRc', label: "N° RCCM de l'entreprise" },
      { cle: 'numeroContribuable', label: 'N° Contribuable' },
      { cle: 'numeroCnpsEmployeur', label: 'N° CNPS employeur' },
      { cle: 'telephoneEntreprise', label: "Téléphone de l'entreprise" },
      { cle: 'emailEntreprise', label: "E-mail de l'entreprise" },
      { cle: 'signataireNom', label: 'Nom du signataire' },
      { cle: 'signatairePoste', label: 'Poste du signataire' },
    ]
  },
  {
    groupe: 'Termes du contrat',
    variables: [
      { cle: 'postePropose', label: 'Poste proposé sur ce contrat' },
      { cle: 'salaireDeBase', label: 'Salaire de base du contrat' },
      { cle: 'sursalaire', label: 'Sursalaire du contrat' },
      { cle: 'remuneration', label: 'Détail complet de la rémunération (base + sursalaire + primes)' },
      { cle: 'dateDebutContrat', label: 'Date de début du contrat' },
      { cle: 'dateFinContrat', label: 'Date de fin du contrat (CDD)' },
    ]
  },
  {
    groupe: 'Document',
    variables: [
      { cle: 'lieu', label: 'Lieu de signature' },
      { cle: 'dateDoc', label: 'Date du document' },
    ]
  }
]

const onDragStartVariable = (event, cle) => {
  event.dataTransfer.setData('text/plain', `{{${cle}}}`)
  event.dataTransfer.effectAllowed = 'copy'
}
// Fonction plutôt que littéral `{{cle}}` dans le template : des accolades
// doubles écrites en dur dans une interpolation Vue cassent son tokenizer
// (il les lit comme un mustache imbriqué).
const varToken = (cle) => '{{' + cle + '}}'

const saveCustomTemplate = async () => {
  if (!modelForm.value.label || !modelForm.value.content) {
    showToast('Le nom et le contenu sont requis', 'error')
    return
  }
  const entry = { ...modelForm.value, isCustom: true, createdAt: new Date().toISOString() }
  await localDb.saveTemplate(entry)
  customTemplates.value = await localDb.getTemplates()
  showToast('Modèle personnalisé sauvegardé', 'success')
  isEditingModel.value = false
  selectedTemplate.value = entry.id
}


const deleteUploadedTemplate = async (id, event) => {
  event.stopPropagation()
  // window.confirm est réécrit par confirmModal.js et rend toujours false :
  // la réponse arrive par une promesse, il faut donc showConfirm.
  const modele = customTemplates.value.find(t => t.id === id)
  const ok = await showConfirm(
    modele ? `Supprimer le modèle « ${modele.name || modele.label} » ?` : 'Supprimer ce modèle ?',
    {
      title: 'Supprimer le modèle',
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      type: 'danger'
    }
  )
  if (!ok) return

  await localDb.deleteTemplate(id)
  customTemplates.value = await localDb.getTemplates()
  if (selectedTemplate.value === id) selectedTemplate.value = ''
  showToast('Modèle supprimé.', 'success')
}

// ── Renommer un modèle (importé ou créé) sans rouvrir tout l'éditeur
const renamingId = ref(null)
const renameValue = ref('')
// Directive locale : focus le champ dès qu'il apparaît (bascule en mode renommage)
const vFocus = { mounted: (el) => el.focus() }

const startRename = (t, event) => {
  event.stopPropagation()
  renamingId.value = t.id
  renameValue.value = t.name || t.label || ''
}

const cancelRename = () => {
  renamingId.value = null
  renameValue.value = ''
}

const confirmRename = async (t) => {
  if (renamingId.value !== t.id) return // déjà annulé (Échap) avant que le blur ne se déclenche
  const nom = renameValue.value.trim()
  if (!nom) { cancelRename(); return }
  // Un modèle importé (Word/Excel) porte son nom sur `name`, un modèle texte
  // créé ici sur `label` — on met à jour celui que le modèle utilise déjà.
  const champ = t.name !== undefined ? 'name' : 'label'
  await localDb.saveTemplate({ ...t, [champ]: nom })
  customTemplates.value = await localDb.getTemplates()
  renamingId.value = null
  showToast('Modèle renommé.', 'success')
}

// ── Impression et Téléchargement PDF
const printDocument = () => {
  const content = documentContent.value
  if (!content) return
  
  const printWindow = window.open('', '_blank')
  printWindow.document.write(`
    <html>
      <head>
        <title>Impression Document</title>
        <script src="https://cdn.tailwindcss.com"><\/script>
        <style>
          body { padding: 2rem; font-family: Georgia, serif; color: black; }
          @media print { 
            body { padding: 0; }
            @page { margin: 1.5cm; }
          }
        </style>
      </head>
      <body>
        <div style="white-space: pre-wrap;">
          ${content}
        </div>
        <script>
          // Attendre que Tailwind soit chargé avant d'imprimer
          setTimeout(() => { 
            window.print(); 
            window.close(); 
          }, 800);
        <\/script>
      </body>
    </html>
  `)
  printWindow.document.close()
}

// ── Assistant Word / Excel
const showOfficeWizard = ref(false)

// Échap ferme l'assistant : c'est le réflexe attendu d'une fenêtre modale, et
// la seule sortie disponible au clavier.
const fermerAssistantSurEchap = (evenement) => {
  if (evenement.key === 'Escape') showOfficeWizard.value = false
}
watch(showOfficeWizard, (ouvert) => {
  if (ouvert) window.addEventListener('keydown', fermerAssistantSurEchap)
  else window.removeEventListener('keydown', fermerAssistantSurEchap)
})
onUnmounted(() => window.removeEventListener('keydown', fermerAssistantSurEchap))


const enregistrerGabaritOffice = async (gabarit) => {
  const enregistre = await localDb.saveTemplate({
    name: gabarit.nom.replace(/.(docx|xlsx)$/i, ''),
    // `type` sert aux recherches existantes, `docType` dit precisement ce que
    // c'est. Sans les deux, un contrat retombait sur « Bulletin de paie ».
    type: typeApplicatif(gabarit.docType),
    docType: gabarit.docType,
    source: 'office',
    format: gabarit.format,
    officeBase64: gabarit.gabaritBase64,
    variables: gabarit.variables,
    isDefault: false,
    createdAt: new Date().toISOString()
  })
  customTemplates.value = await localDb.getTemplates()
  selectedTemplate.value = enregistre.id
  showOfficeWizard.value = false
  if (gabarit.introuvables && gabarit.introuvables.length) {
    showToast(`${gabarit.introuvables.length} valeur(s) n'ont pas été retrouvées dans le fichier.`, 'info')
  }
}

/**
 * Donnees offertes a un gabarit.
 *
 * Les deux nommages coexistent : le camelCase des modeles herites et les noms
 * canoniques du moteur. Un gabarit n'utilise que ce qu'il connait, et une
 * variable sans donnee reste vide plutot que de recevoir une valeur inventee.
 */
const donneesPourGabarit = () => {
  const emp = selectedEmployee.value
  const d = docData.value
  const nomComplet = emp ? `${emp.prenom || ''} ${emp.nom || ''}`.trim() : ''
  const poste = emp?.poste || d.postePropose || ''
  const dateEntree = emp?.dateEntree || emp?.date_entree || d.dateEntree || ''
  const brut = parseFloat(d.salaireBrut) || parseFloat(emp?.salaireBrut) || parseFloat(emp?.salaire) || 0
  const entreprise = d.nomEntreprise || emp?.employeur || ''
  const adresse = d.adresseEntreprise || countryInfo.value.villeParDefaut

  return {
    nomComplet, poste, dateEntree, entreprise, adresse,
    // Le nombre brut, sans devise : le gabarit conserve son propre « FCFA »
    // comme texte fixe, et le moteur ajoute les séparateurs de milliers.
    salaireAff: brut || null,
    anciennete: calcAnciennete(dateEntree, d.dateSortie || null),
    lieu: d.lieu || '', dateDoc: d.dateDoc || '',
    signataireNom: d.signataireNom || '', signatairePoste: d.signatairePoste || '',

    salarie_nom: emp?.nom || '',
    salarie_prenoms: emp?.prenom || '',
    salarie_nom_complet: nomComplet,
    salarie_matricule: emp?.matricule || '',
    salarie_emploi: poste,
    salarie_date_embauche: dateEntree,
    salaire_base: brut || null,
    salaire_base_mensuel: brut || null,
    employeur_raison_sociale: entreprise,
    employeur_adresse: adresse,
    lieu_document: d.lieu || '',
    date_document: d.dateDoc || '',
    signataire_nom: d.signataireNom || '',
    signataire_fonction: d.signatairePoste || '',

    contrat_type: contratCourant.value?.type || '',
    contrat_date_debut: d.dateDebutContrat || '',
    contrat_date_fin: d.dateFinContrat || '',
    salaire_brut: brut || null,
    sursalaire: parseFloat(d.sursalaire) || null
  }
}

/** Rend un gabarit Office et renvoie le Blob correspondant. */
const rendreGabaritOffice = async (modele) => {
  const resultat = await remplirModeleOffice({
    gabaritBase64: modele.officeBase64,
    format: modele.format,
    donnees: donneesPourGabarit()
  })
  const binaire = atob(resultat.fileBase64)
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  const type = resultat.format === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return { blob: new Blob([octets], { type }), format: resultat.format, nonResolues: resultat.nonResolues || [] }
}

// ── Téléchargement du DOCX généré
const isGeneratingDocx = ref(false)
const downloadDocx = async () => {
  const custom = modeleCourant.value
  if (!custom) return

  isGeneratingDocx.value = true
  try {
    // Voie Word / Excel : le gabarit du client est rendu tel quel.
    if (estModeleOffice(custom)) {
      const { blob, format, nonResolues } = await rendreGabaritOffice(custom)
      const nom = (donneesPourGabarit().nomComplet || 'document').replace(/s+/g, '_')
      const lien = document.createElement('a')
      lien.href = window.URL.createObjectURL(blob)
      lien.download = `${custom.name || custom.label}_${nom}.${format}`
      lien.click()
      window.URL.revokeObjectURL(lien.href)
      if (nonResolues.length) {
        showToast(`${nonResolues.length} variable(s) sans donnée : ${nonResolues.slice(0, 4).join(', ')}`, 'info')
      }
      showToast("Le document a été généré et téléchargé.", "success")
      saveToHistory()
      return
    }
    if (modeleAReimporter(custom)) {
      throw new Error("Ce modèle a été enregistré par l'ancienne voie et son fichier est illisible. Réimportez-le avec « Importer un modèle Word / Excel ».")
    }
    if (!custom.isDocx) return
    const token = localStorage.getItem('auth_token')
    // Construire le dictionnaire de variables
    const emp = selectedEmployee.value
    const d = docData.value
    const payload = {
      fileBase64: custom.fileBase64,
      docData: {
        nomComplet: emp ? `${emp.prenom || ''} ${emp.nom || ''}`.trim() : '',
        poste: emp?.poste || d.postePropose || '',
        dateEntree: emp?.dateEntree || emp?.date_entree || d.dateEntree || '',
        salaireAff: fmt(parseFloat(d.salaireBrut) || parseFloat(emp?.salaireBrut) || parseFloat(emp?.salaire) || 0),
        anciennete: calcAnciennete(emp?.dateEntree || emp?.date_entree || d.dateEntree, d.dateSortie || null),
        entreprise: d.nomEntreprise || emp?.employeur || '',
        adresse: d.adresseEntreprise || countryInfo.value.villeParDefaut,
        lieu: d.lieu || '',
        dateDoc: d.dateDoc || '',
        signataireNom: d.signataireNom || '',
        signatairePoste: d.signatairePoste || ''
      }
    }

    const res = await fetch('/api/rh/fill-docx', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    })
    
    const result = await res.json()
    if (!result.success) throw new Error(result.error)

    const byteCharacters = atob(result.fileBase64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    const link = document.createElement('a')
    link.href = window.URL.createObjectURL(blob)
    link.download = `Document_${(payload.docData.nomComplet || 'RH').replace(/\s+/g, '_')}_${Date.now()}.docx`
    link.click()
    
    showToast("Le document a été généré et téléchargé.", "success")
    saveToHistory()
  } catch (err) {
    showToast(err.message || "Erreur de génération DOCX", "error")
  } finally {
    isGeneratingDocx.value = false
  }
}

const isPreviewingDocx = ref(false)
const docxPreviewContainer = ref(null)

const generateDocxPreview = async () => {
  const custom = modeleCourant.value
  if (!custom) return

  isPreviewingDocx.value = true
  try {
    if (estModeleOffice(custom)) {
      const { blob, format } = await rendreGabaritOffice(custom)
      if (format === 'xlsx') {
        showToast("Un classeur Excel ne s'affiche pas ici : téléchargez-le pour le vérifier.", "info")
        return
      }
      if (window.docx && docxPreviewContainer.value) {
        docxPreviewContainer.value.innerHTML = ''
        await window.docx.renderAsync(blob, docxPreviewContainer.value)
      } else {
        showToast("La librairie d'aperçu n'est pas chargée.", "error")
      }
      return
    }
    if (modeleAReimporter(custom)) {
      throw new Error("Ce modèle a été enregistré par l'ancienne voie et son fichier est illisible. Réimportez-le.")
    }
    if (!custom.isDocx) return
    const token = localStorage.getItem('auth_token')
    const emp = selectedEmployee.value
    const d = docData.value
    const payload = {
      fileBase64: custom.fileBase64,
      docData: {
        nomComplet: emp ? `${emp.prenom || ''} ${emp.nom || ''}`.trim() : '',
        poste: emp?.poste || d.postePropose || '',
        dateEntree: emp?.dateEntree || emp?.date_entree || d.dateEntree || '',
        salaireAff: fmt(parseFloat(d.salaireBrut) || parseFloat(emp?.salaireBrut) || parseFloat(emp?.salaire) || 0),
        anciennete: calcAnciennete(emp?.dateEntree || emp?.date_entree || d.dateEntree, d.dateSortie || null),
        entreprise: d.nomEntreprise || emp?.employeur || '',
        adresse: d.adresseEntreprise || countryInfo.value.villeParDefaut,
        lieu: d.lieu || '',
        dateDoc: d.dateDoc || '',
        signataireNom: d.signataireNom || '',
        signatairePoste: d.signatairePoste || ''
      }
    }

    const res = await fetch('/api/rh/fill-docx', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    })
    
    const result = await res.json()
    if (!result.success) throw new Error(result.error)

    const byteCharacters = atob(result.fileBase64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    
    // Rendu via docx-preview
    if (window.docx && docxPreviewContainer.value) {
      // Vider le conteneur avant de re-rendre
      docxPreviewContainer.value.innerHTML = ''
      await window.docx.renderAsync(blob, docxPreviewContainer.value)
    } else {
      showToast("La librairie d'aperçu n'est pas chargée.", "error")
    }
  } catch (err) {
    showToast(err.message || "Erreur lors de l'aperçu", "error")
  } finally {
    isPreviewingDocx.value = false
  }
}


// ── Clause de rémunération détaillée (salaire de base / sursalaire / primes) pour les contrats
const remunerationClause = (d) => {
  const lignes = [`- Salaire de base : ${fmt(parseFloat(d.salaireDeBase) || 0)}`]
  if (parseFloat(d.sursalaire) > 0) lignes.push(`- Sursalaire : ${fmt(parseFloat(d.sursalaire))}`)
  d.primes.filter(p => p.libelle && parseFloat(p.montant) > 0).forEach(p => {
    lignes.push(`- ${p.libelle} : ${fmt(parseFloat(p.montant))}`)
  })
  return lignes.join('\n')
}

// ── Génération du contenu du document
const documentContent = computed(() => {
  const emp = selectedEmployee.value
  const d = docData.value
  const country = countryInfo.value
  const nomComplet = emp ? `${emp.prenom || ''} ${emp.nom || ''}`.trim() : '___________'
  const poste = emp?.poste || d.postePropose || '___________'
  const dateEntree = emp?.dateEntree || emp?.date_entree || d.dateEntree || '___________'
  const salaireAff = fmt(parseFloat(d.salaireBrut) || parseFloat(emp?.salaireBrut) || parseFloat(emp?.salaire) || 0)
  const anciennete = calcAnciennete(emp?.dateEntree || emp?.date_entree || d.dateEntree, d.dateSortie || null)
  const entreprise = d.nomEntreprise || emp?.employeur || '___________'
  const adresse = d.adresseEntreprise || country.villeParDefaut
  // Dérivée du genre de la fiche salarié — jamais saisie à part, pour ne pas
  // désynchroniser une civilité tapée à la main du champ "Sexe" de la fiche.
  const civilite = emp?.genre === 'M' ? 'M.' : emp?.genre === 'F' ? 'Mme' : ''
  const matricule = emp?.matricule || '___________'
  const numeroCnpsSalarie = emp?.numero_cnps || '___________'

  const header = `${entreprise}\n${adresse}\n\n${d.lieu}, le ${d.dateDoc}\n\n`
  const footer = `\n\n${d.formule}\n\n${d.signataireNom || '_____________________'}\n${d.signatairePoste}\n${entreprise}`

  const selectedCustom = customTemplates.value.find(t => t.id === selectedTemplate.value)

  if (selectedCustom) {
    // Un gabarit Word / Excel n'a pas de contenu texte : son rendu passe par le
    // fichier lui-même, pas par cette chaîne.
    if (!selectedCustom.content) return ''
    // Remplacement des variables pour les modèles personnalisés
    let content = selectedCustom.content
    content = content.replace(/\{\{nomComplet\}\}/g, nomComplet)
    content = content.replace(/\{\{poste\}\}/g, poste)
    content = content.replace(/\{\{dateEntree\}\}/g, dateEntree)
    content = content.replace(/\{\{salaireAff\}\}/g, salaireAff)
    content = content.replace(/\{\{anciennete\}\}/g, anciennete || '')
    content = content.replace(/\{\{entreprise\}\}/g, entreprise)
    content = content.replace(/\{\{adresse\}\}/g, adresse)
    content = content.replace(/\{\{lieu\}\}/g, d.lieu || '___________')
    content = content.replace(/\{\{dateDoc\}\}/g, d.dateDoc || '___________')
    content = content.replace(/\{\{signataireNom\}\}/g, d.signataireNom || '___________')
    content = content.replace(/\{\{signatairePoste\}\}/g, d.signatairePoste || '___________')
    // Salarié
    content = content.replace(/\{\{civilite\}\}/g, civilite)
    content = content.replace(/\{\{matricule\}\}/g, matricule)
    content = content.replace(/\{\{numeroCnpsSalarie\}\}/g, numeroCnpsSalarie)
    // Employeur — identité légale
    content = content.replace(/\{\{numeroRc\}\}/g, d.numeroRc || '___________')
    content = content.replace(/\{\{numeroContribuable\}\}/g, d.numeroContribuable || '___________')
    content = content.replace(/\{\{numeroCnpsEmployeur\}\}/g, d.numeroCnpsEmployeur || '___________')
    content = content.replace(/\{\{telephoneEntreprise\}\}/g, d.telephoneEntreprise || '___________')
    content = content.replace(/\{\{emailEntreprise\}\}/g, d.emailEntreprise || '___________')
    // Termes du contrat
    content = content.replace(/\{\{postePropose\}\}/g, d.postePropose || poste)
    content = content.replace(/\{\{salaireDeBase\}\}/g, fmt(parseFloat(d.salaireDeBase) || 0))
    content = content.replace(/\{\{sursalaire\}\}/g, fmt(parseFloat(d.sursalaire) || 0))
    content = content.replace(/\{\{dateDebutContrat\}\}/g, d.dateDebutContrat || '___________')
    content = content.replace(/\{\{dateFinContrat\}\}/g, d.dateFinContrat || '___________')
    content = content.replace(/\{\{remuneration\}\}/g, remunerationClause(d))
    return content
  }

  // Modèles par défaut
  switch (selectedTemplate.value) {
    case 'attestation_travail': {
      if (props.country !== 'CI') {
        return `${header}ATTESTATION DE TRAVAIL\n\nLe soussigné, ${d.signataireNom || '_____________________'}, ${d.signatairePoste} de la société ${entreprise},\n\natteste par la présente que ${nomComplet} est employé(e) au sein de notre établissement depuis le ${dateEntree}, en qualité de ${poste}.\n\nLe contrat de travail liant ${nomComplet} à notre société est un contrat à durée indéterminée (CDI) régi par les dispositions du Code du Travail ${country.preposition} ${country.name}.\n\n${anciennete ? `L'intéressé(e) justifie d'une ancienneté de ${anciennete} au sein de notre structure.` : ''}\n\nLa présente attestation est délivrée à l'intéressé(e) à sa demande, pour servir et valoir ce que de droit.${footer}`
      }
      const matricule = emp?.matricule || '___________'
      const numeroCnpsSalarie = emp?.numero_cnps || '___________'
      return `${entreprise}\n${adresse}\n\nATTESTATION DE TRAVAIL\n\nNous soussignés, ${entreprise}, sise à ${adresse}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste || '_____________________'},\n\nAttestons que ${nomComplet}, matricule ${matricule}, numéro CNPS : ${numeroCnpsSalarie}, est employé(e) dans notre société en qualité de ${poste}, depuis le ${dateEntree}.\n\nEn foi de quoi, nous lui délivrons la présente attestation, pour servir et valoir ce que de droit.\n\nFait à ${d.lieu || 'Abidjan'}, le ${d.dateDoc}.\n\n${d.signatairePoste || '_____________________'}\n${d.signataireNom || '_____________________'}`
    }
    // Absent jusqu'ici : le certificat (période RÉVOLUE, date de sortie) n'existait
    // pas, seule l'attestation (en cours d'emploi) était proposée. Texte calé sur
    // la même référence LOGIPAIE que l'attestation, adapté à une sortie effective.
    case 'certificat_travail': {
      const matricule = emp?.matricule || '___________'
      const numeroCnpsSalarie = emp?.numero_cnps || '___________'
      const dateSortie = d.dateSortie || '___________'
      if (props.country !== 'CI') {
        return `${header}CERTIFICAT DE TRAVAIL\n\nLe soussigné, ${d.signataireNom || '_____________________'}, ${d.signatairePoste} de la société ${entreprise},\n\ncertifie que ${nomComplet} a été employé(e) au sein de notre établissement du ${dateEntree} au ${dateSortie}, en qualité de ${poste}.\n\nLe présent certificat est délivré à l'intéressé(e) à sa demande, pour servir et valoir ce que de droit.${footer}`
      }
      return `${entreprise}\n${adresse}\n\nCERTIFICAT DE TRAVAIL\n\nNous soussignés, ${entreprise}, sise à ${adresse}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste || '_____________________'},\n\nCertifions que ${nomComplet}, matricule ${matricule}, numéro CNPS : ${numeroCnpsSalarie}, a été employé(e) dans notre société en qualité de ${poste}, du ${dateEntree} au ${dateSortie}.\n\nEn foi de quoi, nous lui délivrons le présent certificat, pour servir et valoir ce que de droit.\n\nFait à ${d.lieu || 'Abidjan'}, le ${d.dateDoc}.\n\n${d.signatairePoste || '_____________________'}\n${d.signataireNom || '_____________________'}`
    }
    case 'attestation_revenus':
      return `${header}ATTESTATION DE REVENUS\n\nLe soussigné, ${d.signataireNom || '_____________________'}, ${d.signatairePoste} de la société ${entreprise},\n\ncertifie que ${nomComplet}, occupant le poste de ${poste} au sein de notre structure depuis le ${dateEntree},\n\nperçoit une rémunération mensuelle brute de ${salaireAff}.\n\n${anciennete ? `L'intéressé(e) justifie d'une ancienneté de ${anciennete} dans notre société.` : ''}\n\nLa présente attestation est établie à la demande de l'intéressé(e), pour servir et valoir ce que de droit.${footer}`
    case 'avertissement':
      return `${header}LETTRE D'AVERTISSEMENT\n\nÀ l'attention de : ${nomComplet}\nPoste : ${poste}\n\nMadame, Monsieur,\n\nNous vous notifions par la présente un avertissement disciplinaire pour le motif suivant :\n\n${d.motifAvertissement || '(Décrire précisément les faits reprochés)'}\n\nCes faits sont contraires aux obligations professionnelles et disciplinaires qui vous incombent en vertu de votre contrat de travail et du règlement intérieur de notre société.\n\nNous vous demandons instamment de mettre fin à ces agissements et de vous conformer strictement à vos obligations contractuelles.\n\nDans le cas où ces faits se reproduiraient, nous serions contraints de prendre des mesures disciplinaires plus sévères, pouvant aller jusqu'au licenciement.\n\nVeuillez nous accuser réception de ce courrier en le signant et en en conservant un exemplaire.${footer}`
    case 'avenant':
      return `${header}AVENANT AU CONTRAT DE TRAVAIL\n\nEntre la société ${entreprise}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste},\net ${nomComplet}, employé(e) depuis le ${dateEntree} en qualité de ${poste}.\n\nIl est convenu ce qui suit :\n\nArticle 1 — Modification(s) apportée(s) au contrat :\n${d.postePropose ? `- Nouveau poste : ${d.postePropose}` : ''}\n${d.nouveauSalaire ? `- Nouvelle rémunération brute mensuelle : ${fmt(parseFloat(d.nouveauSalaire))}` : ''}\n${d.dateDebutContrat ? `- Prise d'effet : ${d.dateDebutContrat}` : ''}\n\nArticle 2 — Maintien des autres clauses\nToutes les autres clauses et conditions du contrat de travail initial demeurent inchangées.\n\nFait en deux exemplaires originaux, à ${d.lieu}, le ${d.dateDoc}.\n\nL'Employeur                        Le Salarié\n${d.signataireNom || '_____________________'}          ${nomComplet}\n                                   (Lu et approuvé)`
    case 'contrat_cdi': {
      if (props.country !== 'CI') {
        return `${header}CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE (CDI)\nRégi par le Code du Travail ${country.preposition} ${country.name}\n\nENTRE LES SOUSSIGNÉS :\n\nL'EMPLOYEUR : La société ${entreprise}, dont le siège est à ${adresse}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste},\n\nET :\n\nLE SALARIÉ : ${nomComplet},\n\nIL A ÉTÉ CONVENU CE QUI SUIT :\n\nArticle 1 — Engagement\nL'Employeur engage le Salarié à compter du ${d.dateDebutContrat || d.dateDoc}, en qualité de ${d.postePropose || poste}.\n\nArticle 2 — Durée\nLe présent contrat est conclu pour une durée indéterminée. Il comporte une période d'essai de ___ mois renouvelable une fois.\n\nArticle 3 — Rémunération\nLe Salarié percevra une rémunération mensuelle brute de ${fmt(docTotalBrut.value)}, décomposée comme suit :\n${remunerationClause(d)}\n\nCette rémunération est soumise aux cotisations sociales (${country.organismeRetraite}).\n\nArticle 4 — Horaires & Lieu de travail\nLe Salarié exercera ses fonctions à ${adresse}, selon les horaires définis par le règlement intérieur.\n\nArticle 5 — Congés payés\nLe Salarié bénéficiera de congés payés conformément au Code du Travail ${country.preposition} ${country.name}.\n\nArticle 6 — Droit applicable\nLe présent contrat est soumis au Code du Travail ${country.preposition} ${country.name} et à la Convention Collective applicable.\n\nFait à ${d.lieu}, le ${d.dateDoc}, en deux exemplaires originaux.\n\nL'Employeur                        Le Salarié\n${d.signataireNom || '_____________________'}          ${nomComplet}\n                                   (Lu et approuvé)`
      }
      // Référence LOGIPAIE : articles conformes au Code du Travail ivoirien et à
      // l'annexe CCI du 20/07/1977 — voir le commentaire sur MODELES_STANDARD.
      const numeroCnps = profilEntreprise.value?.numeroCnpsEmployeur || '___________'
      return `${entreprise}\n${adresse}\n\nCONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE\n\nEntre les soussignés, l'entité dénommée ${entreprise} sise à ${adresse}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste || '_____________________'},\nCi-après désigné « l'employeur »,\nD'une part,\n\nEt\n${nomComplet}, né(e) le ___________ à ___________, de nationalité ___________, titulaire de la pièce d'identité n° ___________, demeurant à ___________,\nCi-après désigné(e) « l'employé(e) ».\n\nIL A ÉTÉ ARRÊTÉ ET CONVENU CE QUI SUIT :\n\nArticle 1er — Engagement\n${entreprise} engage ${nomComplet} à compter du ${dateEntree}, au poste de ${d.postePropose || poste}, correspondant à la catégorie professionnelle ___________, conformément à l'annexe à la Convention Collective Interprofessionnelle (CCI) du 20/07/1977 relative aux barèmes des salaires et aux catégories professionnelles.\n\nArticle 2 — Rupture du contrat\nLe présent contrat prend fin sur décision unilatérale de l'une ou l'autre des parties. Conformément à l'article 16.3 du Code du Travail, l'employeur ne peut toutefois y mettre fin que s'il dispose d'un motif légitime. Toute rupture jugée abusive ou irrégulière ouvre droit à des dommages et intérêts contre la partie responsable de cette irrégularité.\n\nArticle 3 — Rémunération\n${nomComplet} percevra une rémunération mensuelle brute de ${fmt(docTotalBrut.value)}, décomposée comme suit :\n${remunerationClause(d)}\n\nArticle 4 — Congés et gratification\nLe salarié aura droit à un congé payé et une gratification déterminés suivant les dispositions légales en vigueur.\n\nArticle 5 — Règlement intérieur\n${nomComplet} déclare avoir pris connaissance du règlement intérieur de l'entreprise.\n\nArticle 6 — Affiliation CNPS\nL'employeur est affilié à la Caisse Nationale de Prévoyance Sociale (CNPS) sous le numéro ${numeroCnps}. Le salarié y sera affilié dans les conditions prévues par la réglementation en vigueur.\n\nArticle 7 — Absence d'engagement antérieur\n${nomComplet} affirme être, à la date de son entrée en fonction, libre de tout engagement, tant à l'égard de la législation du travail qu'à l'égard d'autres employeurs.\n\nFait à ${d.lieu || 'Abidjan'} en deux (2) exemplaires, le ${d.dateDoc}.\n\nL'Employeur                        Le Salarié\n${d.signataireNom || '_____________________'}          ${nomComplet}\n(Noms, cachets et signatures précédés de la mention manuscrite « lu et approuvé »)`
    }
    case 'contrat_cdd': {
      if (props.country !== 'CI') {
        return `${header}CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE (CDD)\nRégi par le Code du Travail ${country.preposition} ${country.name}\n\nENTRE LES SOUSSIGNÉS :\n\nL'EMPLOYEUR : La société ${entreprise}, dont le siège est à ${adresse}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste},\n\nET :\n\nLE SALARIÉ : ${nomComplet},\n\nIL A ÉTÉ CONVENU CE QUI SUIT :\n\nArticle 1 — Objet du contrat\nLe présent CDD est conclu pour le motif suivant : ___________ (accroissement temporaire d'activité / remplacement / projet déterminé).\n\nArticle 2 — Durée\nLe contrat prend effet le ${d.dateDebutContrat || '___________'} et prend fin le ${d.dateFinContrat || '___________'}.\n\nArticle 3 — Poste & Rémunération\nPoste : ${d.postePropose || poste}\nRémunération brute mensuelle : ${fmt(docTotalBrut.value)}, décomposée comme suit :\n${remunerationClause(d)}\n\nArticle 4 — Cotisations sociales\nLes cotisations sociales (${country.organismeRetraite}) seront prélevées conformément à la réglementation en vigueur ${country.preposition} ${country.name}.\n\nFait à ${d.lieu}, le ${d.dateDoc}, en deux exemplaires originaux.\n\nL'Employeur                        Le Salarié\n${d.signataireNom || '_____________________'}          ${nomComplet}\n                                   (Lu et approuvé)`
      }
      const numeroCnps = profilEntreprise.value?.numeroCnpsEmployeur || '___________'
      const dateDebut = d.dateDebutContrat || dateEntree
      const dateFin = d.dateFinContrat || '___________'
      return `${entreprise}\n${adresse}\n\nCONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE\n\nEntre les soussignés, l'entité dénommée ${entreprise} sise à ${adresse}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste || '_____________________'},\nCi-après désigné « l'employeur »,\nD'une part,\n\nEt\n${nomComplet}, né(e) le ___________ à ___________, de nationalité ___________, titulaire de la pièce d'identité n° ___________, demeurant à ___________,\nCi-après désigné(e) « l'employé(e) ».\n\nIL A ÉTÉ ARRÊTÉ ET CONVENU CE QUI SUIT :\n\nArticle 1er — Engagement et durée\n${entreprise} engage ${nomComplet}, allant du ${dateDebut} au ${dateFin}, au poste de ${d.postePropose || poste}, correspondant à la catégorie professionnelle ___________, conformément à l'annexe à la Convention Collective Interprofessionnelle (CCI) du 20/07/1977 relative aux barèmes des salaires et aux catégories professionnelles.\n\nArticle 2 — Rupture anticipée\nLe présent contrat ne peut être rompu avant terme que pour force majeure, accord commun ou faute lourde de l'une des parties.\n\nArticle 3 — Rémunération\n${nomComplet} percevra une rémunération mensuelle brute de ${fmt(docTotalBrut.value)}, décomposée comme suit :\n${remunerationClause(d)}\n\nArticle 4 — Congés et gratification\nLe salarié aura droit à un congé payé et une gratification déterminés suivant les dispositions légales en vigueur.\n\nArticle 5 — Règlement intérieur\n${nomComplet} déclare avoir pris connaissance du règlement intérieur de l'entreprise.\n\nArticle 6 — Affiliation CNPS\nL'employeur est affilié à la Caisse Nationale de Prévoyance Sociale (CNPS) sous le numéro ${numeroCnps}. Le salarié y sera affilié dans les conditions prévues par la réglementation en vigueur.\n\nArticle 7 — Absence d'engagement antérieur\n${nomComplet} affirme être, à la date de son entrée en fonction, libre de tout engagement, tant à l'égard de la législation du travail qu'à l'égard d'autres employeurs.\n\nFait à ${d.lieu || 'Abidjan'} en deux (2) exemplaires, le ${d.dateDoc}.\n\nL'Employeur                        Le Salarié\n${d.signataireNom || '_____________________'}          ${nomComplet}\n(Noms, cachets et signatures précédés de la mention manuscrite « lu et approuvé »)`
    }
    case 'contrat_stage': {
      const dateDebutStage = d.dateDebutContrat || dateEntree
      const dateFinStage = d.dateFinContrat || '___________'
      if (props.country !== 'CI') {
        return `${header}CONVENTION DE STAGE\nRégi par le Code du Travail ${country.preposition} ${country.name}\n\nENTRE LES SOUSSIGNÉS :\n\nL'ENTREPRISE D'ACCUEIL : La société ${entreprise}, dont le siège est à ${adresse}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste},\n\nET :\n\nLE / LA STAGIAIRE : ${nomComplet},\n\nIL A ÉTÉ CONVENU CE QUI SUIT :\n\nArticle 1 — Objet\nLa présente convention a pour objet d'organiser le stage de ${nomComplet} au sein de ${entreprise}, à des fins de formation et d'insertion professionnelle. Elle ne constitue pas un contrat de travail et ne crée aucun lien de subordination salariale.\n\nArticle 2 — Durée\nLe stage se déroule du ${dateDebutStage} au ${dateFinStage}.\n\nArticle 3 — Missions & indemnité\nMissions : ${d.postePropose || poste}.\nIndemnité de stage mensuelle : ${fmt(docTotalBrut.value)}.\n\nArticle 4 — Encadrement\nLe/la stagiaire est placé(e) sous la responsabilité de ${d.signataireNom || '_____________________'}, ${d.signatairePoste}, au sein de l'entreprise.\n\nFait à ${d.lieu}, le ${d.dateDoc}, en deux exemplaires originaux.\n\nL'Entreprise d'accueil                        Le / La Stagiaire\n${d.signataireNom || '_____________________'}          ${nomComplet}\n                                   (Lu et approuvé)`
      }
      // Une convention de stage n'est pas un contrat de travail : pas d'article
      // de rupture (démission/licenciement) ni d'affiliation CNPS au titre d'un
      // emploi salarié — c'est ce qui la distingue juridiquement du CDI/CDD.
      return `${entreprise}\n${adresse}\n\nCONVENTION DE STAGE\n\nEntre les soussignés, l'entité dénommée ${entreprise} sise à ${adresse}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste || '_____________________'},\nCi-après désignée « l'entreprise d'accueil »,\nD'une part,\n\nEt\n${nomComplet}, né(e) le ___________ à ___________, de nationalité ___________, titulaire de la pièce d'identité n° ___________, demeurant à ___________,\nCi-après désigné(e) « le/la stagiaire ».\n\nIL A ÉTÉ ARRÊTÉ ET CONVENU CE QUI SUIT :\n\nArticle 1er — Objet\nLa présente convention organise le stage de ${nomComplet} au sein de ${entreprise}, du ${dateDebutStage} au ${dateFinStage}, aux fins de formation et de mise en pratique professionnelle. Elle ne constitue pas un contrat de travail au sens du Code du Travail et n'ouvre droit à aucune affiliation CNPS au titre d'un emploi salarié.\n\nArticle 2 — Missions\n${nomComplet} exercera les missions suivantes, sous l'encadrement de ${d.signataireNom || '_____________________'}, ${d.signatairePoste || '_____________________'} : ${d.postePropose || poste}.\n\nArticle 3 — Indemnité de stage\nUne indemnité de stage mensuelle de ${fmt(docTotalBrut.value)} sera versée au/à la stagiaire, à titre de dédommagement, et non de salaire.\n\nArticle 4 — Discipline et confidentialité\nLe/la stagiaire s'engage à respecter le règlement intérieur de l'entreprise ainsi que la confidentialité des informations auxquelles il/elle aura accès durant le stage.\n\nArticle 5 — Fin de la convention\nÀ l'issue du stage, une attestation de stage sera délivrée au/à la stagiaire. La présente convention ne crée aucun droit à une embauche ultérieure.\n\nFait à ${d.lieu || 'Abidjan'} en deux (2) exemplaires, le ${d.dateDoc}.\n\nL'Entreprise d'accueil                        Le / La Stagiaire\n${d.signataireNom || '_____________________'}          ${nomComplet}\n(Noms, cachets et signatures précédés de la mention manuscrite « lu et approuvé »)`
    }
    case 'licenciement': {
      const ind = calcIndemnites.value
      return `${header}LETTRE DE LICENCIEMENT\n\nÀ l'attention de : ${nomComplet}\nPoste : ${poste}\n\nMadame, Monsieur,\n\nNous avons l'honneur de vous informer de la décision de mettre fin à votre contrat de travail qui nous lie depuis le ${dateEntree}.\n\nMotif du licenciement :\n${d.motifLicenciement || '(Décrire précisément les motifs : faute grave / motif économique / insuffisance professionnelle)'}\n\nConformément aux dispositions du Code du Travail ${country.preposition} ${country.name}, vous bénéficierez des indemnités suivantes :\n\n- Préavis : ${ind ? `${fmt(ind.preavis)} (${ind.moisPreavis} mois)` : '___________'}\n- Indemnité de licenciement : ${ind ? `${fmt(ind.indemnite)} (ancienneté : ${ind.annees} ans, barème OHADA 30-40%)` : '___________'}\n- Congés non pris : à calculer selon votre solde de congés restant\n\nLes documents de fin de contrat vous seront remis lors de votre départ.${footer}`
    }
    default: return ''
  }
})

// ── Copier dans le presse-papier
const copied = ref(false)
const copyDocument = async () => {
  try {
    await navigator.clipboard.writeText(documentContent.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2500)
  } catch (e) {
    alert('Impossible de copier automatiquement. Sélectionnez le texte manuellement.')
  }
}

// ── Historique local
const history = ref(JSON.parse(localStorage.getItem('onda_documents_history') || '[]'))
const saveToHistory = () => {
  if (!selectedTemplate.value) return
  const tmpl = allTemplates.value.find(t => t.id === selectedTemplate.value)
  const entry = {
    id: Date.now(),
    template: tmpl?.name || tmpl?.label || selectedTemplate.value,
    employe: selectedEmployee.value ? `${selectedEmployee.value.prenom || ''} ${selectedEmployee.value.nom || ''}`.trim() : 'Non spécifié',
    date: docData.value.dateDoc,
  }
  history.value.unshift(entry)
  if (history.value.length > 20) history.value = history.value.slice(0, 20)
  localStorage.setItem('onda_documents_history', JSON.stringify(history.value))
}

const templateFields = computed(() => {
  const custom = customTemplates.value.find(t => t.id === selectedTemplate.value)
  // Champs génériques pour les modèles texte personnalisés : identité de
  // l'employeur (y compris RCCM, sans source auto), plus les termes de
  // contrat courants (poste, rémunération, dates) — tout ce que couvre la
  // liste de variables {{...}} de l'éditeur (voir VARIABLES_DISPONIBLES).
  if (custom) return [
    'nomEntreprise', 'adresseEntreprise', 'numeroRc', 'numeroContribuable', 'numeroCnpsEmployeur',
    'telephoneEntreprise', 'emailEntreprise',
    'postePropose', 'salaireDeBase', 'sursalaire', 'dateDebutContrat', 'dateFinContrat',
    'signataireNom', 'signatairePoste', 'lieu', 'dateDoc'
  ]

  switch (selectedTemplate.value) {
    case 'attestation_travail': return ['dateEntree','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'certificat_travail': return ['dateEntree','dateSortie','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'attestation_revenus': return ['dateEntree','salaireBrut','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'avertissement': return ['motifAvertissement','nomEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'avenant': return ['postePropose','nouveauSalaire','dateDebutContrat','nomEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'contrat_cdi': return ['postePropose','salaireDeBase','sursalaire','dateDebutContrat','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'contrat_cdd': return ['postePropose','salaireDeBase','sursalaire','dateDebutContrat','dateFinContrat','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'contrat_stage': return ['postePropose','salaireDeBase','dateDebutContrat','dateFinContrat','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'licenciement': return ['motifLicenciement','dateEntree','salaireBrut','dateSortie','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    default: return []
  }
})

// Profil entreprise, chargé au montage.
const profilEntreprise = ref(null)

/**
 * Ce qui est déjà connu n'a pas à être ressaisi.
 *
 * Les valeurs viennent de trois sources — profil entreprise, fiche salarié,
 * contrat en vigueur. On ne présente en saisie que ce qu'aucune ne fournit :
 * un motif d'avertissement, par exemple, n'existe dans aucun enregistrement.
 */
const estMotif = (champ) => champ === 'motifAvertissement' || champ === 'motifLicenciement'
const estMontant = (champ) => champ.toLowerCase().includes('salaire')

const estRenseigne = (champ) => {
  const v = docData.value[champ]
  return v !== undefined && v !== null && String(v).trim() !== ''
}
const champsRepris = computed(() => templateFields.value.filter(estRenseigne))
const champsASaisir = computed(() => templateFields.value.filter(f => !estRenseigne(f)))
const modifierRepris = ref(false)

const FIELD_LABELS = {
  dateEntree:"Date d'entrée",salaireBrut:'Salaire brut mensuel',salaireDeBase:'Salaire de base',sursalaire:'Sursalaire',motifAvertissement:"Motif de l'avertissement",
  motifLicenciement:'Motif du licenciement',postePropose:'Nouveau poste / Poste proposé',nouveauSalaire:'Nouveau salaire brut',
  dateDebutContrat:'Date de début',dateFinContrat:'Date de fin de contrat',dateSortie:'Date de sortie',
  nomEntreprise:"Nom de l'entreprise",adresseEntreprise:'Adresse / Ville',signataireNom:'Nom du signataire',
  signatairePoste:'Poste du signataire',lieu:'Lieu d\'émission',dateDoc:'Date du document',
  numeroRc:'N° RCCM',numeroContribuable:'N° Contribuable',numeroCnpsEmployeur:'N° CNPS employeur',
  telephoneEntreprise:"Téléphone de l'entreprise",emailEntreprise:"E-mail de l'entreprise"
}


</script>

<template>
  <div class="docs-wrapper">

    <!-- Header -->
    <div class="docs-header">
      <div class="docs-header-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </div>
      <div>
        <h2 class="docs-title">Générateur de Documents RH</h2>
        <p class="docs-subtitle">Contrats, attestations, lettres — Auto-remplis depuis l'annuaire · {{ countryInfo.name }}</p>
      </div>
      <div class="docs-header-actions">

        <button class="add-model-btn" style="background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2);" @click="openModelEditor()">
          Créer un modèle vierge
        </button>
        <button class="add-model-btn" @click="showOfficeWizard = true" style="background: white; color: #059669; border: none;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Importer un modèle Word / Excel
        </button>
      </div>
    </div>

    <div v-if="isEditingModel" class="docs-section" style="margin-bottom: 1.5rem; border-color: #ec4899;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <h3 class="docs-section-title" style="margin:0; color:#ec4899;">Éditeur de modèle personnalisé</h3>
        <button class="docs-save-btn" style="border:none; color:#64748b;" @click="isEditingModel = false">Fermer</button>
      </div>
      <div class="docs-fields" style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div class="docs-field">
          <label class="docs-label">Nom du modèle</label>
          <input class="docs-input" v-model="modelForm.label" placeholder="Ex: Attestation spéciale" />
        </div>
        <div class="docs-field">
          <label class="docs-label">Couleur de l'étiquette</label>
          <input type="color" class="docs-input" style="padding:0; height:36px;" v-model="modelForm.color" />
        </div>
        <div class="docs-field" style="grid-column: 1 / -1;">
          <label class="docs-label">Contenu du document (Éditeur complet)</label>
          <div class="docs-vars-hint">
            <div class="docs-vars-label">Variables disponibles — glissez-les dans le texte :</div>
            <div v-for="groupe in VARIABLES_DISPONIBLES" :key="groupe.groupe" class="docs-vars-groupe">
              <span class="docs-vars-groupe-label">{{ groupe.groupe }}</span>
              <span
                v-for="v in groupe.variables"
                :key="v.cle"
                class="docs-var-chip"
                draggable="true"
                @dragstart="onDragStartVariable($event, v.cle)"
                :title="v.label"
              >{{ varToken(v.cle) }}</span>
            </div>
          </div>
          <RichDocEditor v-model="modelForm.content" placeholder="Rédigez votre document ici... Glissez une variable ci-dessus, ou tapez {{nomComplet}}, etc." />
        </div>
      </div>

      <div style="margin-top:1rem; display:flex; justify-content:flex-end;">
        <button class="docs-save-btn" style="background:#ec4899; color:white; border:none;" @click="saveCustomTemplate">
          Enregistrer le modèle
        </button>
      </div>
    </div>

    <div class="docs-layout">
      <!-- Left: Compose panel -->
      <div class="docs-compose">
        <!-- Template Selector -->
        <div class="docs-section">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="docs-section-title" style="margin: 0;">1. Choisir le type de document</h3>
          </div>
          <div v-if="allTemplates.length === 0" style="padding: 20px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; color: #475569;">
            <strong>Aucun modèle disponible.</strong>
            <p style="margin: 6px 0 12px; font-size: 0.85rem; color: #64748b;">
              Importez votre propre document Word ou Excel : sa mise en page sera conservée à l'identique.
            </p>
            <button @click="showOfficeWizard = true" class="docs-import-btn">Importer un modèle Word / Excel</button>
          </div>
          <div class="template-grid" v-else>
            <div v-for="t in allTemplates" :key="t.id" class="template-row">
              <input
                v-if="renamingId === t.id"
                class="docs-input"
                v-model="renameValue"
                style="flex:1; padding:0.55rem 0.85rem;"
                @keyup.enter="confirmRename(t)"
                @keyup.escape="cancelRename"
                @blur="confirmRename(t)"
                @click.stop
                v-focus
              />
              <template v-else>
                <button
                  class="template-btn"
                  :class="{ active: selectedTemplate === t.id }"
                  @click="selectedTemplate = t.id"
                  :style="[selectedTemplate === t.id ? `border-color:#3b82f6; background:#3b82f618; color:#3b82f6` : '', {flex: 1}]"
                  :title="t.name || t.label"
                >
                  <span class="template-dot" style="background: #3b82f6"></span>
                  <span class="template-nom">{{ t.name || t.label }}</span>
                  <span class="template-type">{{ libelleModele(t) }}</span>
                  <span v-if="estModeleOffice(t)" class="template-format">{{ t.format === 'xlsx' ? 'Excel' : 'Word' }}</span>
                  <span v-else-if="modeleAReimporter(t)" class="template-alerte" title="Ce modèle a été enregistré par l'ancienne voie et son fichier est illisible. Réimportez-le.">à réimporter</span>
                </button>
                <button
                  class="docs-copy-btn template-row-btn"
                  style="padding: 0.55rem; color: #3b82f6; border-color: #bfdbfe; background: white;"
                  @click="startRename(t, $event)"
                  title="Renommer ce document"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button
                  class="docs-copy-btn template-row-btn"
                  style="padding: 0.55rem; color: #ef4444; border-color: #fca5a5; background: white;"
                  @click="deleteUploadedTemplate(t.id, $event)"
                  title="Supprimer ce document"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </template>
            </div>
          </div>
        </div>

        <div v-if="selectedTemplate">
          <!-- Employé -->
          <div class="docs-section">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h3 class="docs-section-title" style="margin: 0;">2. Sélectionner l'employé (facultatif)</h3>
              <button v-if="selectedEmployeeId" @click="handleEmployeeSelect(null)" style="font-size: 0.75rem; color: #64748b; background: none; border: none; cursor: pointer; text-decoration: underline;">
                Vider la sélection
              </button>
            </div>
            <div style="margin-top: 0.5rem; position: relative;">
              <EmployeeSelect :employees="employees" @select="handleEmployeeSelect" placeholder="Rechercher par nom, prénom ou matricule..." />
            </div>
            <p v-if="employees.length === 0" style="color:#94a3b8;font-size:0.78rem;margin:4px 0 0;">Annuaire vide — remplissez manuellement ci-dessous.</p>
            <div v-else-if="selectedEmployee" style="margin-top: 0.5rem; padding: 0.5rem; background: #f8fafc; border-radius: 6px; font-size: 0.8rem; color: #334155; border: 1px solid #e2e8f0;">
              Employé sélectionné : <strong>{{ selectedEmployee.prenom }} {{ selectedEmployee.nom }}</strong>
              <div v-if="contratCourant" style="margin-top: 4px; color: #059669; font-size: 0.76rem;">
                Contrat {{ contratCourant.type }}
                <span v-if="contratCourant.dateDebut">du {{ contratCourant.dateDebut }}</span>
                <span v-if="contratCourant.dateFin">au {{ contratCourant.dateFin }}</span>
                — champs pré-remplis depuis le contrat.
              </div>
              <div v-else style="margin-top: 4px; color: #b45309; font-size: 0.76rem;">
                Aucun contrat enregistré pour ce salarié — les champs viennent de sa fiche.
              </div>
            </div>
          </div>

          <!-- Champs dynamiques -->
          <div v-if="templateFields.length" class="docs-section">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.6rem;">
              <h3 class="docs-section-title" style="margin:0;">3. Informations du document</h3>
              <button v-if="champsRepris.length" type="button" class="lien-modifier"
                      @click="modifierRepris = !modifierRepris">
                {{ modifierRepris ? 'Terminer' : 'Modifier les valeurs reprises' }}
              </button>
            </div>

            <div v-if="champsRepris.length && !modifierRepris" class="repris">
              <p class="repris-titre">Repris de la fiche salarié, du contrat et du profil entreprise :</p>
              <div class="repris-liste">
                <span v-for="field in champsRepris" :key="field" class="repris-jeton">
                  <span class="repris-cle">{{ FIELD_LABELS[field] || field }}</span>
                  <span class="repris-valeur">{{ docData[field] }}</span>
                </span>
              </div>
            </div>

            <div class="docs-fields">
              <div v-for="field in (modifierRepris ? templateFields : champsASaisir)" :key="field" class="docs-field">
                <label class="docs-label">{{ FIELD_LABELS[field] || field }}</label>
                <textarea v-if="estMotif(field)" class="docs-input docs-textarea" v-model="docData[field]" :placeholder="FIELD_LABELS[field]" rows="3"></textarea>
                <input v-else class="docs-input" :type="estMontant(field) ? 'number' : 'text'" v-model="docData[field]" :placeholder="FIELD_LABELS[field] || field" />
              </div>
            </div>

            <p v-if="!champsASaisir.length && !modifierRepris" class="repris-complet">
              Rien à saisir : tout est repris de vos données.
            </p>
          </div>

          <!-- Primes du contrat (CDI/CDD/Stage uniquement) -->
          <div v-if="selectedTemplate==='contrat_cdi' || selectedTemplate==='contrat_cdd' || selectedTemplate==='contrat_stage'" class="docs-section">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.85rem;">
              <h3 class="docs-section-title" style="margin:0;">Primes</h3>
              <button type="button" class="docs-copy-btn" style="border:none; color:#7c3aed; text-decoration:underline;" @click="addDocPrime">+ Ajouter une prime</button>
            </div>
            <p v-if="docData.primes.length === 0" style="font-size:0.78rem;color:#94a3b8;margin:0;">Aucune prime ajoutée.</p>
            <div v-for="(p, idx) in docData.primes" :key="idx" style="display:grid;grid-template-columns:2fr 1fr auto;gap:0.5rem;margin-top:0.5rem;align-items:center;">
              <input class="docs-input" type="text" v-model="p.libelle" placeholder="Ex: Prime de transport" />
              <input class="docs-input" type="number" v-model="p.montant" placeholder="0" />
              <button type="button" class="docs-copy-btn" style="padding:0.35rem; color:#ef4444; border-color:#fca5a5;" @click="removeDocPrime(idx)" title="Supprimer">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
            <div style="margin-top:0.85rem; padding:0.6rem 0.85rem; background:#faf5ff; border:1px solid #e9d5ff; border-radius:8px; font-size:0.84rem; color:#6b21a8;">
              Total brut mensuel : <strong>{{ docTotalBrut.toLocaleString('fr-FR') }} {{ countryInfo.currency || 'FCFA' }}</strong>
            </div>
          </div>

          <!-- Indemnités auto pour licenciement -->
          <div v-if="selectedTemplate==='licenciement' && calcIndemnites" class="docs-section" style="border-color:#fca5a5;background:#fff5f5;">
            <h3 class="docs-section-title" style="color:#dc2626;">Calcul automatique des indemnités (OHADA)</h3>
            <div class="indemnite-grid">
              <div class="stat-mini"><span class="sm-label">Ancienneté</span><span class="sm-value">{{ calcIndemnites.annees }} ans</span></div>
              <div class="stat-mini"><span class="sm-label">Indemnité légale</span><span class="sm-value" style="color:#dc2626;">{{ fmt(calcIndemnites.indemnite) }}</span></div>
              <div class="stat-mini"><span class="sm-label">Préavis ({{ calcIndemnites.moisPreavis }} mois)</span><span class="sm-value">{{ fmt(calcIndemnites.preavis) }}</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Preview panel -->
      <div class="docs-preview-panel">
        <div class="docs-preview-header">
          <span style="font-weight:700;color:#1e293b;font-size:0.88rem;">Aperçu du document</span>
          <div class="docs-preview-actions">
            <!-- Bouton pour HTML -->
            <button v-if="!isCurrentTemplateDocx" class="docs-copy-btn" @click="printDocument" :disabled="!documentContent" title="Imprimer ou Sauvegarder en PDF" style="background:#f1f5f9; border-color:#e2e8f0; color:#334155;">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              Imprimer / PDF
            </button>
            <button v-if="!isCurrentTemplateDocx" class="docs-copy-btn" @click="copyDocument" :disabled="!documentContent" :class="{success:copied}">
              <svg v-if="!copied" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              {{ copied ? 'Copié !' : 'Copier' }}
            </button>

            <!-- Bouton pour DOCX (Aperçu) -->
            <button v-if="isCurrentTemplateDocx" class="docs-copy-btn" @click="generateDocxPreview" :disabled="isPreviewingDocx" style="background:#f0fdf4; border-color:#bbf7d0; color:#166534;">
              <svg v-if="!isPreviewingDocx" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>
              Actualiser l'aperçu
            </button>

            <!-- Bouton pour DOCX (Télécharger) -->
            <button v-if="isCurrentTemplateDocx" class="docs-copy-btn" @click="downloadDocx" :disabled="isGeneratingDocx" style="background:#eef2ff; border-color:#c7d2fe; color:#4338ca;">
              <svg v-if="!isGeneratingDocx" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>
              {{ isGeneratingDocx ? 'Génération...' : 'Télécharger le Word' }}
            </button>

            <!-- Enregistrer Historique (Commun) -->
            <button class="docs-save-btn" @click="saveToHistory" :disabled="!isCurrentTemplateDocx && !documentContent">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Enregistrer
            </button>
          </div>
        </div>
        <div class="docs-preview-body">
          <div v-if="!selectedTemplate" class="docs-empty">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <p>Sélectionnez un type de document pour voir l'aperçu</p>
          </div>
          
          <!-- Conteneur d'aperçu DOCX (invisible si ce n'est pas un docx) -->
          <div v-show="isCurrentTemplateDocx" class="docs-preview-text" style="padding: 0; background: #f8fafc; overflow: auto; display: flex; flex-direction: column; align-items: center;">
            <div ref="docxPreviewContainer" style="width: 100%; min-height: 400px; display: flex; justify-content: center; align-items: center; color: #94a3b8; font-size: 0.9rem;">
              Cliquez sur "Actualiser l'aperçu" pour générer la prévisualisation du document Word.
            </div>
          </div>

          <div v-if="!isCurrentTemplateDocx && selectedTemplate" class="docs-preview-text" style="white-space: pre-wrap; font-family: inherit;" v-html="documentContent"></div>
        </div>
      </div>
    </div>

    <!-- Historique -->
    <div v-if="history.length > 0" class="docs-section" style="margin-top:1.5rem;">
      <h3 class="docs-section-title">Derniers documents générés</h3>
      <div class="history-list">
        <div v-for="entry in history.slice(0,10)" :key="entry.id" class="history-item">
          <div style="display:flex;align-items:center;gap:0.6rem;">
            <span class="history-template">{{ entry.template }}</span>
            <span class="history-employe">{{ entry.employe }}</span>
          </div>
          <span class="history-date">{{ entry.date }}</span>
        </div>
      </div>
    </div>
    <!-- Modal de confirmation de suppression -->
    
    <!-- Trois façons de sortir : la croix, le fond, la touche Échap. -->
    <div v-if="showOfficeWizard" class="wizard-overlay"
         @click.self="showOfficeWizard = false">
      <div class="wizard-panel">
        <div class="wizard-entete">
          <div>
            <h3 class="wizard-titre">Modèle Word ou Excel</h3>
            <p class="wizard-sous-titre">
              Le fichier n'est pas reconstruit : seules les valeurs repérées y sont remplacées
              par des variables. Votre mise en page reste identique, à l'octet près.
            </p>
          </div>
          <button type="button" class="wizard-fermer" title="Fermer" aria-label="Fermer"
                  @click="showOfficeWizard = false">&times;</button>
        </div>
        <OfficeTemplateWizard
          @gabarit-valide="enregistrerGabaritOffice"
          @annuler="showOfficeWizard = false" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.lien-modifier {
  background: none; border: none; padding: 0; cursor: pointer;
  color: #7c3aed; text-decoration: underline; font-size: 0.78rem; font-weight: 600;
}
.repris {
  margin-bottom: 0.9rem; padding: 0.7rem 0.85rem;
  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;
}
.repris-titre { margin: 0 0 0.5rem; font-size: 0.76rem; color: #166534; }
.repris-liste { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.repris-jeton {
  display: inline-flex; gap: 0.35rem; align-items: baseline;
  background: #fff; border: 1px solid #d1fae5; border-radius: 999px;
  padding: 2px 10px; font-size: 0.75rem;
}
.repris-cle { color: #64748b; }
.repris-valeur { color: #0f172a; font-weight: 600; }
.repris-complet { margin: 0; font-size: 0.78rem; color: #64748b; font-style: italic; }
.docs-import-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff; border: none; padding: 7px 14px; border-radius: 8px;
  cursor: pointer; font-size: 0.75rem; font-weight: 700;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
}
.template-nom {
  font-weight: 600;
  /* Un nom de modèle long (import Word/Excel reprend le nom du fichier) ne
     doit pas pousser les boutons renommer/supprimer hors de la colonne
     étroite du panneau — il se tronque, eux restent toujours joignables. */
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0; flex: 1 1 auto;
}
.template-type {
  font-size: 0.7em; margin-left: 6px; background: #f1f5f9; color: #475569;
  border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 10px; font-weight: 600;
  flex-shrink: 0; white-space: nowrap;
}
.template-format {
  font-size: 0.7em; margin-left: 4px; background: #e0f2fe; color: #0369a1;
  padding: 2px 6px; border-radius: 10px; font-weight: 600;
  flex-shrink: 0; white-space: nowrap;
}
.template-alerte {
  font-size: 0.7em; margin-left: 4px; background: #fef3c7; color: #92400e;
  padding: 2px 6px; border-radius: 10px; font-weight: 600;
  flex-shrink: 0; white-space: nowrap;
}
.wizard-entete {
  display: flex; align-items: flex-start; gap: 16px; margin-bottom: 18px;
}
.wizard-titre { margin: 0 0 6px; color: #0f172a; font-size: 1rem; }
.wizard-sous-titre {
  margin: 0; color: #64748b; font-size: 0.85rem; line-height: 1.5;
}
.wizard-fermer {
  margin-left: auto; flex: none; width: 32px; height: 32px; line-height: 1;
  border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;
  color: #64748b; font-size: 1.35rem; cursor: pointer;
}
.wizard-fermer:hover { background: #f1f5f9; color: #0f172a; }
.wizard-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(4px); display: flex; align-items: center;
  justify-content: center; z-index: 9999; padding: 20px;
}
.wizard-panel {
  background: #fff; border-radius: 16px; padding: 24px; width: 100%;
  max-width: 960px; max-height: 90vh; overflow-y: auto;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}
.docs-wrapper { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }

.docs-header {
  display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
  margin-bottom: 1.5rem; padding: 1.25rem 1.5rem;
  background: linear-gradient(135deg, #312e81 0%, #7c3aed 100%);
  border-radius: 14px; color: white;
}
.docs-header-icon {
  width: 44px; height: 44px; background: rgba(255,255,255,0.15);
  border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.docs-title { margin: 0; font-size: 1.1rem; font-weight: 800; }
.docs-subtitle { margin: 0; font-size: 0.8rem; opacity: 0.8; }

.docs-header-actions { display: flex; gap: 0.5rem; align-items: center; margin-left: auto; flex-wrap: wrap; }

.ai-upload-btn {
  display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.6rem;
  font-size: 0.72rem; font-weight: 700; color: #ec4899; background: #fdf2f8;
  border: 1px solid #fbcfe8; border-radius: 6px; cursor: pointer; transition: all 0.15s;
}
.ai-upload-btn:hover:not(:disabled) { background: #fce7f3; }
.ai-upload-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.loader-spinner {
  width: 12px; height: 12px;
  border: 2px solid rgba(236, 72, 153, 0.3);
  border-top-color: #ec4899; border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }

.add-model-btn {
  margin-left: auto; display: flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 1rem; background: rgba(255,255,255,0.2); color: white;
  border: 1.5px solid rgba(255,255,255,0.3); border-radius: 9px; cursor: pointer;
  font-weight: 700; font-size: 0.82rem; transition: all 0.15s;
}
.add-model-btn:hover { background: rgba(255,255,255,0.3); }

.docs-layout {
  display: grid; grid-template-columns: 380px 1fr; gap: 1.5rem; align-items: start;
}
@media (max-width: 1100px) { .docs-layout { grid-template-columns: 1fr; } }

@media (max-width: 600px) {
  .docs-wrapper { padding: 1rem; }
  .docs-header { padding: 1rem; gap: 0.75rem; }
  .docs-title { font-size: 1rem; }
  .docs-subtitle { font-size: 0.75rem; }
  .docs-header-actions { margin-left: 0; width: 100%; }
  .add-model-btn { flex: 1 1 auto; justify-content: center; font-size: 0.78rem; padding: 0.55rem 0.6rem; white-space: normal; }
  .docs-preview-header { justify-content: flex-start; }
  .docs-preview-actions { width: 100%; }
  .docs-copy-btn, .docs-save-btn { flex: 1 1 auto; justify-content: center; }
}

.docs-compose { display: flex; flex-direction: column; gap: 0; }

.docs-section {
  background: white; border: 1px solid #e2e8f0; border-radius: 12px;
  padding: 1.1rem 1.25rem; margin-bottom: 0.85rem;
}
.docs-section-title {
  margin: 0 0 0.85rem; font-size: 0.78rem; font-weight: 700;
  color: #475569; text-transform: uppercase; letter-spacing: 0.05em;
}

.template-grid { display: flex; flex-direction: column; gap: 0.4rem; }
.template-row { display: flex; gap: 0.5rem; align-items: center; min-width: 0; }
.template-btn {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.85rem; border: 1.5px solid #e2e8f0;
  border-radius: 9px; background: white; cursor: pointer;
  transition: all 0.15s ease; font-size: 0.84rem; font-weight: 600; color: #334155;
  text-align: left;
  min-width: 0; /* laisse le bouton (et son nom) rétrécir sous sa largeur naturelle */
}
.template-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
.template-btn.active { font-weight: 800; }
.template-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.template-row-btn { flex-shrink: 0; }

.docs-input {
  width: 100%; padding: 0.65rem 0.8rem; border: 1px solid #e2e8f0;
  border-radius: 8px; font-size: 0.84rem; font-family: inherit;
  transition: all 0.15s; box-sizing: border-box;
}
.docs-input:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }
.docs-textarea { resize: vertical; min-height: 80px; }

.docs-vars-hint {
  margin-bottom: 0.6rem; padding: 0.6rem 0.75rem;
  background: #faf5ff; border: 1px dashed #d8b4fe; border-radius: 8px;
}
.docs-vars-label { font-size: 0.72rem; color: #7c3aed; font-weight: 700; margin-bottom: 0.45rem; }
.docs-vars-groupe { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; margin-top: 0.4rem; }
.docs-vars-groupe:first-of-type { margin-top: 0; }
.docs-vars-groupe-label {
  font-size: 0.68rem; font-weight: 700; color: #a855f7; text-transform: uppercase;
  letter-spacing: 0.03em; width: 100%; margin-bottom: 0.1rem;
}
.docs-var-chip {
  font-family: 'Courier New', monospace; font-size: 0.72rem; font-weight: 700;
  color: #7c3aed; background: white; border: 1px solid #d8b4fe; border-radius: 6px;
  padding: 0.2rem 0.5rem; cursor: grab; user-select: none; transition: all 0.15s;
}
.docs-var-chip:hover { background: #ec4899; border-color: #ec4899; color: white; }
.docs-var-chip:active { cursor: grabbing; }

.employee-list-scroll {
  display: flex; flex-direction: column;
}
.emp-item {
  padding: 0.55rem 0.85rem; font-size: 0.84rem; cursor: pointer;
  border-bottom: 1px solid #f1f5f9; transition: all 0.1s;
}
.emp-item:hover { background: #f8fafc; }
.emp-item.active { background: #f3f4f6; border-left: 3px solid #7c3aed; font-weight: 500; }

.docs-fields { display: flex; flex-direction: column; gap: 0.65rem; }
.docs-label { display: block; font-size: 0.76rem; font-weight: 600; color: #475569; margin-bottom: 3px; }

.indemnite-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }
.stat-mini {
  background: white; border: 1px solid #fca5a5; border-radius: 8px;
  padding: 0.55rem 0.75rem; display: flex; flex-direction: column; gap: 0.15rem;
}
.sm-label { font-size: 0.7rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; }
.sm-value { font-size: 0.9rem; font-weight: 800; color: #1e293b; }

.docs-preview-panel {
  background: white; border: 1px solid #e2e8f0; border-radius: 12px;
  overflow: hidden; position: sticky; top: 1rem; max-height: 85vh; display: flex; flex-direction: column;
}
.docs-preview-header {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;
  padding: 0.8rem 1rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
}
.docs-preview-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.docs-preview-body { padding: 1.25rem 1.5rem; overflow: auto; flex: 1; background: #fefefe; }
.docs-preview-text {
  white-space: pre-wrap; font-family: 'Georgia', serif;
  font-size: 0.82rem; line-height: 1.75; color: #1e293b; margin: 0;
}
.docs-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 0.6rem; padding: 3rem 1rem; color: #94a3b8; font-size: 0.84rem;
}

.docs-copy-btn, .docs-save-btn {
  display: flex; align-items: center; gap: 0.3rem;
  padding: 0.35rem 0.8rem; border-radius: 7px; font-size: 0.76rem; font-weight: 700;
  cursor: pointer; border: 1px solid #e2e8f0; background: white; color: #475569; transition: all 0.15s;
}
.docs-copy-btn:hover { border-color: #7c3aed; color: #7c3aed; }
.docs-copy-btn.success { background: #f0fdf4; border-color: #10b981; color: #10b981; }
.docs-save-btn:hover { background: #f1f5f9; }
.docs-copy-btn:disabled, .docs-save-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.history-list { display: flex; flex-direction: column; gap: 0.4rem; }
.history-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 0.8rem; background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 8px; font-size: 0.8rem;
}
.history-template { font-weight: 700; color: #334155; }
.history-employe { color: #64748b; font-size: 0.78rem; }
.history-date { color: #94a3b8; font-size: 0.74rem; flex-shrink: 0; }

.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
}
.modal-content {
  background: white; padding: 2rem;
  border-radius: 16px; width: 100%;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
</style>
