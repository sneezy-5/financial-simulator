<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { localDb } from '../services/localDatabase.js'
import { showToast } from '../services/toast.js'
import { showConfirm } from '../services/confirmModal.js'
import { user, updateProfile } from '../services/auth.js'
import { loadPdfJs, prepareTemplateSource, requestTemplateReconstruction, fillTemplatePlaceholders, wrapPreviewHtml, injectLogoSlot } from '../services/templateExtractor.js'
import { isCountryActive, INACTIVE_LABEL } from '../services/countryConfig.js'
import OfficeTemplateWizard from './OfficeTemplateWizard.vue'
import BulletinCanvasEditor from './BulletinCanvasEditor.vue'
import { typeApplicatif, libelleModele } from '../services/officeTemplate.js'

const props = defineProps({
  country: {
    type: String,
    default: 'CI'
  }
})

const emit = defineEmits(['change-country'])

const templates = ref([])
const activeTab = ref('general') // general | templates | schedule
const selectedCountry = ref(props.country)

watch(() => props.country, (newVal) => {
  selectedCountry.value = newVal
})

watch(user, () => { syncCompanyProfile(); reinitialiserFormulaireCodes() })

const countries = [
  { code: 'CI', flagUrl: 'https://flagcdn.com/w40/ci.png', name: 'Côte d\'Ivoire', desc: 'Réglementation fiscale UEMOA (ITS, CNSS, IGR...)' },
  { code: 'BJ', flagUrl: 'https://flagcdn.com/w40/bj.png', name: 'Bénin', desc: 'Réglementation fiscale Bénin (AIB, CNSS, VPS...)' },
  { code: 'TG', flagUrl: 'https://flagcdn.com/w40/tg.png', name: 'Togo', desc: 'Réglementation fiscale Togo (CNSS, IRPP...)' }
]

const selectCountry = (code) => {
  // Le moteur est mis au point sur la réglementation ivoirienne. Tant qu'un pays
  // n'a pas été éprouvé sur de vrais bulletins, le proposer reviendrait à
  // appliquer des règles non validées à des documents officiels.
  if (!isCountryActive(code)) {
    showToast(`${countries.find(c => c.code === code).name} : ${INACTIVE_LABEL.toLowerCase()}.`, 'info')
    return
  }
  selectedCountry.value = code
  emit('change-country', code)
  showToast(`Réglementation mise à jour : ${countries.find(c => c.code === code).name}`, 'success')
}

const scheduleSettings = ref({
  autoGenerate: false,
  generationDay: 25,
  defaultTemplateId: null,
  emailRemindersContracts: false
})

// Profil entreprise (numéros CNPS/contribuable employeur, logo) — persistant côté
// serveur, nécessaire pour l'historique de paie et les futures déclarations
// réglementaires. Le logo est optionnel : absent, le bulletin générique se rend
// simplement sans lui — pas de bloc vide, pas d'erreur.
const companyProfileForm = ref({
  companyName: '',
  companyAdresse: '',
  companyVille: '',
  companyTelephone: '',
  companyEmail: '',
  companyNumeroCnps: '',
  companyNumeroContribuable: '',
  companyNumeroEmployeur: '',
  companySignataireNom: '',
  companySignataireFonction: '',
  companyTauxAtMp: '',
  companyCnpsVersementMensuel: '',
  companyLogo: ''
})
const companyProfileSaving = ref(false)
const logoUploadError = ref('')

const syncCompanyProfile = () => {
  if (user.value) {
    companyProfileForm.value.companyName = user.value.companyName || ''
    companyProfileForm.value.companyAdresse = user.value.companyAdresse || ''
    companyProfileForm.value.companyVille = user.value.companyVille || ''
    companyProfileForm.value.companyTelephone = user.value.companyTelephone || ''
    companyProfileForm.value.companyEmail = user.value.companyEmail || ''
    companyProfileForm.value.companyNumeroCnps = user.value.companyNumeroCnps || ''
    companyProfileForm.value.companyNumeroContribuable = user.value.companyNumeroContribuable || ''
    companyProfileForm.value.companyNumeroEmployeur = user.value.companyNumeroEmployeur || ''
    companyProfileForm.value.companySignataireNom = user.value.companySignataireNom || ''
    companyProfileForm.value.companySignataireFonction = user.value.companySignataireFonction || ''
    companyProfileForm.value.companyTauxAtMp = (user.value.companyTauxAtMp ?? '') === '' ? '' : String(user.value.companyTauxAtMp)
    companyProfileForm.value.companyCnpsVersementMensuel =
      user.value.companyCnpsVersementMensuel === true ? 'mensuel'
        : user.value.companyCnpsVersementMensuel === false ? 'trimestriel' : ''
    companyProfileForm.value.companyLogo = user.value.companyLogo || ''
  }
}

// Limite volontairement modeste : le logo part en base64 dans le profil (colonne
// texte, renvoyée à chaque connexion) et dans chaque bulletin généré — pas la
// place d'y loger une photo haute résolution.
const LOGO_TAILLE_MAX = 1.5 * 1024 * 1024

const onLogoFileChange = async (event) => {
  const fichier = event.target.files[0]
  event.target.value = ''
  if (!fichier) return
  logoUploadError.value = ''
  if (!fichier.type.startsWith('image/')) {
    logoUploadError.value = 'Le logo doit être une image (PNG, JPG...).'
    return
  }
  if (fichier.size > LOGO_TAILLE_MAX) {
    logoUploadError.value = `Image trop lourde (max ${(LOGO_TAILLE_MAX / 1024 / 1024).toFixed(1)} Mo).`
    return
  }
  try {
    // Reconverti en PNG quel que soit le format d'origine : le moteur PDF
    // (pdfmake/pdfkit) ne sait embarquer que du JPEG ou du PNG — un logo en
    // WebP (fréquent depuis un export macOS/Chrome) faisait échouer TOUTE
    // génération de bulletin, sans qu'on le voie tant qu'on ne testait pas
    // avec un vrai logo configuré.
    const dataUrlOriginal = await new Promise((resolve, reject) => {
      const lecteur = new FileReader()
      lecteur.onload = () => resolve(lecteur.result)
      lecteur.onerror = () => reject(new Error('Lecture du fichier impossible.'))
      lecteur.readAsDataURL(fichier)
    })
    const image = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Image illisible.'))
      el.src = dataUrlOriginal
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d').drawImage(image, 0, 0)
    companyProfileForm.value.companyLogo = canvas.toDataURL('image/png')
  } catch (e) {
    logoUploadError.value = e.message || 'Lecture du fichier impossible.'
  }
}

const removeLogo = () => { companyProfileForm.value.companyLogo = '' }

const saveCompanyProfile = async () => {
  try {
    companyProfileSaving.value = true
    await updateProfile({
      companyName: companyProfileForm.value.companyName,
      companyAdresse: companyProfileForm.value.companyAdresse,
      companyVille: companyProfileForm.value.companyVille,
      companyTelephone: companyProfileForm.value.companyTelephone,
      companyEmail: companyProfileForm.value.companyEmail,
      companyNumeroCnps: companyProfileForm.value.companyNumeroCnps,
      companyNumeroContribuable: companyProfileForm.value.companyNumeroContribuable,
      companyNumeroEmployeur: companyProfileForm.value.companyNumeroEmployeur,
      companySignataireNom: companyProfileForm.value.companySignataireNom,
      companySignataireFonction: companyProfileForm.value.companySignataireFonction,
      companyTauxAtMp: companyProfileForm.value.companyTauxAtMp === '' ? null : parseFloat(companyProfileForm.value.companyTauxAtMp),
      companyCnpsVersementMensuel: companyProfileForm.value.companyCnpsVersementMensuel === 'mensuel' ? true
        : companyProfileForm.value.companyCnpsVersementMensuel === 'trimestriel' ? false : null,
      companyLogo: companyProfileForm.value.companyLogo
    })
    showToast('Profil entreprise enregistré.', 'success')
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error')
  } finally {
    companyProfileSaving.value = false
  }
}

// ── Modèles de bulletin ONDA intégrés ──
// Deux mises en page proposées d'office (voir payrollService.js) : on peut en
// choisir une par défaut sans jamais avoir à importer de fichier.
const BULLETIN_STYLES = [
  { code: 'classique', nom: 'Classique', description: "Tableau Base / Taux, une ligne par rubrique, part salariale et patronale côte à côte." },
  { code: 'grille', nom: 'Grille numérotée', description: "Rubriques numérotées (010, 020… 500, 511…), colonnes Retenue P.S / P.P séparées — inspiré des bulletins ivoiriens courants." },
  { code: 'compact', nom: 'Compact', description: "Une seule colonne de montants, gains puis retenues à la suite — le plus dense, tient sur une demi-page." },
  { code: 'ondaclassic', nom: 'ONDACLASSIC', description: "Bloc salarié en grille, puis un tableau de charges patronales séparé en bas de page — comme sur les bulletins." },
  { code: 'bancaire', nom: 'Reçu bancaire', description: "Gains et retenues côte à côte dans deux tableaux, mode de règlement mis en avant — courant chez les banques et assurances." },
  { code: 'moderne', nom: 'Moderne', description: "Sections en blocs colorés (cartes) plutôt qu'un grand tableau — présentation plus contemporaine." },
  { code: 'lavandiere', nom: 'Congés détaillés', description: "Boîte Absences/Congés et suivi Acquis/Reste à prendre/Pris, colonne Nombre séparée de Base (jours × taux journalier)." },
  { code: 'adArchitecture', nom: 'Cumuls annuels', description: "Boîtes Période/Date/Type de paie en en-tête, cumuls annuels détaillés, résumé Gains/Retenues/Net et billetage en espèces." },
  { code: 'tcmLogistic', nom: 'Grille patronale détaillée', description: "En-tête Niveau/Coefficient/Indice/CCN, congés Acquis/Reste/Pris, part patronale scindée en Retenue(+)/Retenue(-)." },
  { code: 'scaso', nom: 'SCASO', description: "Bandeau Période de paie pleine largeur, bloc Direction/Ville/Fonction, encart Cachet et signature — sobre, noir et blanc." },
  { code: 'personnalise', nom: 'Personnalisé (couleur)', description: "Même structure que Classique, mais dans la couleur de votre choix (ci-dessous) plutôt qu'une couleur figée. Rapide, sans rien déplacer." }
  // « Sur-mesure (avec l'IA) » (code 'surMesure') désactivé pour le moment —
  // trop peu fiable en pratique. Le moteur reste en place côté serveur
  // (payrollService.js, MODELES_CI_SUPPLEMENTAIRES.surMesure) et le composant
  // BulletinCanvasEditor.vue aussi : il suffit de rajouter cette entrée pour
  // le remettre visible, pas de le reconstruire.
]
const previewingStyle = ref(null)
const settingDefaultStyle = ref(null)
const showCanvasEditor = ref(false)

const previewBulletinStyle = async (code, rubriqueCodesDraft = null) => {
  previewingStyle.value = code
  try {
    const token = localStorage.getItem('auth_token')
    const res = await fetch('/api/rh/preview-bulletin-style', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ templateStyle: code, rubriqueCodes: rubriqueCodesDraft, bulletinCouleur: bulletinCouleurForm.value })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || "Erreur lors de l'aperçu")
    }
    const blob = await res.blob()
    window.open(URL.createObjectURL(blob), '_blank')
  } catch (e) {
    showToast(e.message || "Erreur lors de l'aperçu", 'error')
  } finally {
    previewingStyle.value = null
  }
}

const setDefaultBulletinStyle = async (code) => {
  settingDefaultStyle.value = code
  try {
    await updateProfile({ defaultBulletinStyle: code })
    showToast(`Modèle « ${BULLETIN_STYLES.find(s => s.code === code)?.nom} » défini par défaut.`, 'success')
  } catch (e) {
    showToast(e.message || 'Erreur', 'error')
  } finally {
    settingDefaultStyle.value = null
  }
}

// ── Numérotation des rubriques ──
// Il n'existe pas de code universel entre logiciels de paie (chaque bulletin
// réel vu a les siens) : chaque compte redéfinit ici les siens, plutôt que de
// subir un choix arbitraire d'ONDA.
const catalogueRubriques = ref([])
const codesRubriquesDefaut = ref({})
const codesRubriquesForm = ref({})
const stylePourApercuCodes = ref('classique')
const savingCodes = ref(false)

const chargerCatalogueRubriques = async () => {
  try {
    const token = localStorage.getItem('auth_token')
    const res = await fetch('/api/rh/rubrique-codes-catalogue', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const data = await res.json()
    catalogueRubriques.value = data.catalogue || []
    codesRubriquesDefaut.value = data.defauts || {}
    reinitialiserFormulaireCodes()
  } catch (e) {
    console.warn('Catalogue des rubriques indisponible', e)
  }
}

const reinitialiserFormulaireCodes = () => {
  const sauvegardes = user.value?.rubriqueCodes || {}
  const form = {}
  for (const r of catalogueRubriques.value) form[r.cle] = sauvegardes[r.cle] || codesRubriquesDefaut.value[r.cle] || ''
  codesRubriquesForm.value = form
}

const groupesRubriques = computed(() => {
  const groupes = []
  for (const r of catalogueRubriques.value) {
    let g = groupes.find(g => g.nom === r.groupe)
    if (!g) { g = { nom: r.groupe, items: [] }; groupes.push(g) }
    g.items.push(r)
  }
  return groupes
})

const enregistrerCodesRubriques = async () => {
  savingCodes.value = true
  try {
    await updateProfile({ rubriqueCodes: codesRubriquesForm.value })
    showToast('Numérotation des rubriques enregistrée.', 'success')
  } catch (e) {
    showToast(e.message || 'Erreur', 'error')
  } finally {
    savingCodes.value = false
  }
}

// ── Couleur du modèle « Personnalisé » ──
// Le seul modèle ONDA dont la couleur n'est pas fixée dans le code : un
// calque de couleur sur un gabarit neutre (voir generatePdfDefinitionPersonnalise),
// pour les comptes qui veulent leur propre teinte sans attendre un nouveau modèle codé en dur.
const bulletinCouleurForm = ref('#1e3a8a')
const savingCouleur = ref(false)
watch(user, (u) => { if (u?.bulletinCouleur) bulletinCouleurForm.value = u.bulletinCouleur }, { immediate: true })

const enregistrerBulletinCouleur = async () => {
  savingCouleur.value = true
  try {
    await updateProfile({ bulletinCouleur: bulletinCouleurForm.value })
    showToast('Couleur du modèle Personnalisé enregistrée.', 'success')
  } catch (e) {
    showToast(e.message || 'Erreur', 'error')
  } finally {
    savingCouleur.value = false
  }
}

// Voie Word / Excel : le modèle du client n'est jamais reconstruit, seul son
// texte est substitué. C'est la voie à privilégier quand le client peut
// fournir un gabarit ; le PDF reste pour ceux qui n'ont qu'un scan.
const showOfficeWizard = ref(false)

// Voie PDF : pour un bulletin, on ne reconstruit pas le contenu, on capture la
// mise en page exacte du PDF fourni et on la remplit avec nos propres variables
// (référentiel LOGIPAIE) — jamais de nom de variable deviné par une IA.
const showPdfWizard = ref(false)
const pdfTemplateFile = ref(null)
const pdfPreparing = ref(false)
const pdfAnalyzing = ref(false)
const pdfAnalysisError = ref('')
const pdfAnalysisResult = ref(null)

// Échap ferme l'assistant : c'est le réflexe attendu d'une fenêtre modale, et
// la seule sortie disponible au clavier.
const fermerAssistantSurEchap = (evenement) => {
  if (evenement.key !== 'Escape') return
  if (showPdfWizard.value) fermerPdfWizard()
  showOfficeWizard.value = false
}
watch([showOfficeWizard, showPdfWizard], ([office, pdf]) => {
  if (office || pdf) window.addEventListener('keydown', fermerAssistantSurEchap)
  else window.removeEventListener('keydown', fermerAssistantSurEchap)
})
onUnmounted(() => window.removeEventListener('keydown', fermerAssistantSurEchap))

const handlePdfTemplateUpload = (evenement) => {
  const fichier = evenement.target.files[0]
  if (!fichier) return
  pdfTemplateFile.value = fichier
  templateSource.value = null
  pdfAnalysisResult.value = null
  pdfAnalysisError.value = ''
  pdfPreparing.value = true
  nextTick(async () => {
    try {
      templateSource.value = await prepareTemplateSource(fichier, pdfCanvas.value)
    } catch (e) {
      pdfAnalysisError.value = e.message || "Ce fichier n'a pas pu être lu."
    } finally {
      pdfPreparing.value = false
    }
  })
}

const analyserModelePdf = async () => {
  if (!templateSource.value) {
    pdfAnalysisError.value = 'Le modèle est encore en cours de lecture, patientez un instant.'
    return
  }
  pdfAnalyzing.value = true
  pdfAnalysisError.value = ''
  try {
    pdfAnalysisResult.value = await requestTemplateReconstruction(templateSource.value, 'payslip', 1)
  } catch (e) {
    pdfAnalysisError.value = e.message || "Erreur lors de l'analyse du modèle."
  } finally {
    pdfAnalyzing.value = false
  }
}

const enregistrerGabaritPdf = async () => {
  if (!pdfAnalysisResult.value?.htmlTemplate) return
  await localDb.saveTemplate({
    name: (pdfTemplateFile.value?.name || 'Bulletin').replace(/\.(pdf|jpe?g|png)$/i, ''),
    type: 'payslip',
    source: 'pdf-capture',
    htmlTemplate: pdfAnalysisResult.value.htmlTemplate,
    isDefault: templates.value.filter(t => (t.type || 'payslip') === 'payslip').length === 0,
    createdAt: new Date().toISOString()
  })
  fermerPdfWizard()
  await loadData()
  if (pdfAnalysisResult.value?.unmapped?.length) {
    showToast(`${pdfAnalysisResult.value.unmapped.length} champ(s) repéré(s) sans donnée associée : ils resteront vides.`, 'info')
  }
}

const fermerPdfWizard = () => {
  showPdfWizard.value = false
  pdfTemplateFile.value = null
  templateSource.value = null
  pdfAnalysisResult.value = null
  pdfAnalysisError.value = ''
  pdfPreparing.value = false
  pdfAnalyzing.value = false
}

// Données fictives, sous les deux nomenclatures (ancienne et référentiel
// LOGIPAIE), pour que la comparaison visuelle montre quelque chose de réaliste
// quels que soient les noms de variable détectés dans le PDF.
const DONNEES_EXEMPLE = {
  nom: 'YAO', prenom: 'Kouadio', salarie_nom: 'YAO', salarie_prenoms: 'Kouadio',
  matricule: 'EMP-001', salarie_matricule: 'EMP-001',
  poste: 'Développeur', salarie_emploi: 'Développeur',
  categorie: 'I1', salarie_categorie: 'I1',
  numero_cnps: '0123456', num_cnps: '0123456', salarie_numero_cnps: '0123456',
  date_embauche: '01/09/2022', salarie_date_embauche: '01/09/2022',
  nom_entreprise: 'VOTRE ENTREPRISE', employeur_nom: 'VOTRE ENTREPRISE', employeur_raison_sociale: 'VOTRE ENTREPRISE',
  adresse: "Abidjan, Côte d'Ivoire", employeur_adresse: "Abidjan, Côte d'Ivoire",
  periode: 'Août 2026', mois_paie: 'Août 2026', mois: '8', annee: '2026', date_jour: '22/08/2026',
  salaire_base: 250000, salaire_base_mensuel: 250000, salaire_base_mensuel_base: 250000, salaire_base_base: 250000,
  sursalaire: 0, prime_anciennete: 12500, prime_anciennete_base: 12500,
  prime_transport: 30000, prime_transport_base: 30000, indemnite_transport_non_imposable: 30000,
  indemnite_logement: 0, prime_treizieme_mois: 0,
  heures_sup: 0, heures_supplementaires: 0, jours_travailles: 26,
  brut: 292500, gains_totaux: 292500, total_gains_bruts: 292500,
  brut_imposable: 262500, net_imposable: 262500, brut_imposable_its: 262500, brut_social: 292500,
  salarial: { its: 12500, cn: 0, cnps: 18428, cmu: 1000, ricf: 0, total: 31928, cnps_base: 292500, its_base: 262500, cmu_base: 1000, total_base: 262500 },
  cnps_salariale: 18428, cnps_salariale_montant: 18428, cnps_salariale_base: 292500,
  cmu_salariale: 1000, its_net: 12500, its_net_montant: 12500, its_net_base: 262500,
  patronal: { cnps: 21038, retraite: 21038, prestations_familiales: 14625, accident_travail: 5850, maternite: 2194, cmu: 1000, impot: 3510, fdfp_ta: 1170, fdfp_fpc: 1755, total: 51142 },
  cnps_retraite_patronale: 21038, cnps_prestations_familiales_patronale: 14625, cnps_accident_travail_patronale: 5850,
  cnps_maternite_patronale: 2194, cmu_patronale: 1000, impot_employeur_patronale: 3510,
  taxe_apprentissage_patronale: 1170, formation_professionnelle_patronale: 1755, total_charges_patronales: 51142,
  netAPayer: 260572, net_a_payer: 260572, total_retenues_salariales: 31928,
  devise: 'FCFA', anciennete: '3 ans 11 mois', anciennete_mois: '3 ans 11 mois', type_contrat: 'CDI'
}

const comparisonPreviewSrcdoc = computed(() => {
  if (!pdfAnalysisResult.value?.htmlTemplate) return ''
  const rempli = fillTemplatePlaceholders(pdfAnalysisResult.value.htmlTemplate, DONNEES_EXEMPLE)
  return wrapPreviewHtml(injectLogoSlot(rempli, user.value?.companyLogo || null))
})


const enregistrerGabaritOffice = async (gabarit) => {
  await localDb.saveTemplate({
    name: gabarit.nom.replace(/\.(docx|xlsx)$/i, ''),
    // `type` sert aux recherches existantes, `docType` dit precisement ce que
    // c'est. Sans les deux, un contrat retombait sur l'etiquette « Bulletin de paie ».
    type: typeApplicatif(gabarit.docType),
    docType: gabarit.docType,
    source: 'office',
    format: gabarit.format,
    officeBase64: gabarit.gabaritBase64,
    variables: gabarit.variables,
    isDefault: templates.value.filter(t => (t.type || 'payslip') === typeApplicatif(gabarit.docType)).length === 0,
    createdAt: new Date().toISOString()
  })
  showOfficeWizard.value = false
  await loadData()
  if (gabarit.introuvables && gabarit.introuvables.length) {
    showToast(`${gabarit.introuvables.length} valeur(s) n'ont pas été retrouvées dans le fichier.`, 'info')
  }
}


const loadData = async () => {
  try {
    templates.value = await localDb.getTemplates()
    const autoGen = await localDb.getSetting('autoGenerate', false)
    const genDay = await localDb.getSetting('generationDay', 25)
    const emailReminders = await localDb.getSetting('emailRemindersContracts', false)
    scheduleSettings.value = {
      autoGenerate: autoGen,
      generationDay: genDay,
      emailRemindersContracts: emailReminders
    }
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  loadData()
  syncCompanyProfile()
  chargerCatalogueRubriques()
  loadPdfJs().catch(e => console.warn('pdf.js indisponible:', e.message))
})

const pdfCanvas = ref(null)

const templateSource = ref(null)



const deleteTemplate = async (id) => {
  const ok = await showConfirm('Voulez-vous supprimer ce modèle ?', {
    title: 'Supprimer le modèle',
    confirmLabel: 'Supprimer',
    cancelLabel: 'Annuler',
    type: 'danger'
  })
  if (ok) {
    await localDb.deleteTemplate(id)
    await loadData()
  }
}

const setDefaultTemplate = async (template) => {
  const t = { ...template, isDefault: true }
  await localDb.saveTemplate(t)
  await loadData()
}

const saveScheduleSettings = async () => {
  try {
    await localDb.saveSetting('autoGenerate', scheduleSettings.value.autoGenerate)
    await localDb.saveSetting('generationDay', scheduleSettings.value.generationDay)
    await localDb.saveSetting('emailRemindersContracts', scheduleSettings.value.emailRemindersContracts)
    showToast("Paramètres de planification sauvegardés avec succès !", 'success')
  } catch (e) {
    showToast("Erreur lors de la sauvegarde", 'error')
  }
}
</script>

<template>
  <div class="settings-wrapper">
    <div class="hr-home-intro" style="margin-bottom: 24px;">
      <h2 style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px; color: #0f172a;">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        Paramètres & Modèles
      </h2>
      <p style="color: #64748b;">Configurez les modèles PDF personnalisés et l'automatisation de la paie.</p>
    </div>

    <!-- TABS -->
    <div class="tabs-header" style="display: flex; gap: 16px; border-bottom: 1px solid #e2e8f0; margin-bottom: 24px;">
      <button @click="activeTab = 'general'" :style="{ borderBottom: activeTab === 'general' ? '2px solid #3b82f6' : 'none', color: activeTab === 'general' ? '#0f172a' : '#64748b', fontWeight: activeTab === 'general' ? '600' : '400', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '12px 16px', cursor: 'pointer', fontSize: '1rem' }">
        Général
      </button>
      <button @click="activeTab = 'templates'" :style="{ borderBottom: activeTab === 'templates' ? '2px solid #3b82f6' : 'none', color: activeTab === 'templates' ? '#0f172a' : '#64748b', fontWeight: activeTab === 'templates' ? '600' : '400', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '12px 16px', cursor: 'pointer', fontSize: '1rem' }">
        Modèles PDF
      </button>
      <button @click="activeTab = 'schedule'" :style="{ borderBottom: activeTab === 'schedule' ? '2px solid #3b82f6' : 'none', color: activeTab === 'schedule' ? '#0f172a' : '#64748b', fontWeight: activeTab === 'schedule' ? '600' : '400', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '12px 16px', cursor: 'pointer', fontSize: '1rem' }">
        Planification
      </button>
    </div>

    <!-- TAB: GENERAL -->
    <div v-if="activeTab === 'general'" class="animate-in">
      <h3 style="margin: 0 0 16px 0; color: #0f172a;">Réglementation & Pays</h3>
      <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 24px;">
        Sélectionnez le pays d'application pour les calculs de salaire, cotisations sociales (CNSS/VPS) et barèmes fiscaux de paie.
      </p>
      <p style="background: #f1f5f9; border-left: 3px solid #94a3b8; padding: 10px 14px; border-radius: 6px; color: #475569; font-size: 0.82rem; line-height: 1.5; margin-bottom: 24px;">
        Le moteur de reproduction de documents est actuellement mis au point sur la
        réglementation <strong>ivoirienne</strong>. Les autres pays restent implémentés,
        mais ne seront réactivés qu'une fois éprouvés sur de vrais bulletins.
      </p>

      <div class="countries-settings-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <div 
          v-for="c in countries" 
          :key="c.code" 
          @click="selectCountry(c.code)"
          style="border: 2px solid; border-radius: 12px; padding: 20px; display: flex; align-items: flex-start; gap: 16px; transition: all 0.2s;"
          :style="{ 
            borderColor: selectedCountry === c.code ? '#3b82f6' : '#e2e8f0', 
            background: selectedCountry === c.code ? '#eff6ff' : '#ffffff',
            boxShadow: selectedCountry === c.code ? '0 4px 12px rgba(59, 130, 246, 0.15)' : 'none',
            cursor: isCountryActive(c.code) ? 'pointer' : 'not-allowed',
            opacity: isCountryActive(c.code) ? 1 : 0.5,
            filter: isCountryActive(c.code) ? 'none' : 'grayscale(1)'
          }"
        >
          <img :src="c.flagUrl" :alt="c.name" style="width: 32px; height: 24px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); object-fit: cover;" />
          <div style="flex: 1;">
            <h4 style="margin: 0 0 4px 0; color: #0f172a; font-weight: 700;">
              {{ c.name }}
              <span v-if="!isCountryActive(c.code)" style="margin-left: 8px; padding: 2px 8px; border-radius: 10px; background: #e2e8f0; color: #475569; font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em;">{{ INACTIVE_LABEL }}</span>
            </h4>
            <p style="margin: 0; font-size: 0.8rem; color: #64748b; line-height: 1.4;">{{ c.desc }}</p>
          </div>
          <div v-if="selectedCountry === c.code" style="width: 20px; height: 20px; border-radius: 50%; background: #3b82f6; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold;">✓</div>
        </div>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 24px;">
        <h3 style="margin: 0 0 8px 0; color: #0f172a;">Profil Entreprise</h3>
        <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 16px;">
          Ces informations seront utilisées pour l'historique de paie et les futures déclarations réglementaires (CNPS, DGI, CMU).
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; max-width: 900px;">
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Nom de l'entreprise / Raison sociale</label>
            <input v-model="companyProfileForm.companyName" type="text" placeholder="ex. MA SOCIETE SARL" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Adresse / Siège social</label>
            <input v-model="companyProfileForm.companyAdresse" type="text" placeholder="ex. Abidjan, Cocody Riviera" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Ville</label>
            <input v-model="companyProfileForm.companyVille" type="text" placeholder="ex. Abidjan" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Téléphone</label>
            <input v-model="companyProfileForm.companyTelephone" type="text" placeholder="ex. +225 07 00 00 00" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">E-mail</label>
            <input v-model="companyProfileForm.companyEmail" type="email" placeholder="ex. contact@masociete.ci" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Numéro CNPS Employeur</label>
            <input v-model="companyProfileForm.companyNumeroCnps" type="text" placeholder="ex. 987654-B" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Numéro Contribuable / NIF</label>
            <input v-model="companyProfileForm.companyNumeroContribuable" type="text" placeholder="ex. CI-2024-123456A" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Numéro Employeur CNPS <span style="font-weight: 400; color: #94a3b8;">(entête des déclarations)</span></label>
            <input v-model="companyProfileForm.companyNumeroEmployeur" type="text" placeholder="ex. 123456" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Taux CNPS Accident du Travail / Maladie Pro <span style="font-weight: 400; color: #94a3b8;">(2 à 5 % selon le secteur — vide = 2 %)</span></label>
            <input v-model="companyProfileForm.companyTauxAtMp" type="number" step="0.001" min="0.02" max="0.05" placeholder="ex. 0.02" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Périodicité de versement CNPS</label>
            <select v-model="companyProfileForm.companyCnpsVersementMensuel" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;">
              <option value="">Automatique (selon l'effectif)</option>
              <option value="mensuel">Mensuel (≥ 20 salariés)</option>
              <option value="trimestriel">Trimestriel (&lt; 20 salariés)</option>
            </select>
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Signataire — Nom</label>
            <input v-model="companyProfileForm.companySignataireNom" type="text" placeholder="ex. TRAORE Awa" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Signataire — Fonction</label>
            <input v-model="companyProfileForm.companySignataireFonction" type="text" placeholder="ex. Directrice générale" style="width: 100%; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;" />
          </div>
        </div>
        <p style="color: #94a3b8; font-size: 0.78rem; margin: 10px 0 0;">
          Ce sont les mêmes champs que la feuille « ENTREPRISE » du modèle Excel à télécharger — les renseigner ici évite de les ressaisir à chaque import.
        </p>

        <div class="form-group" style="margin-top: 16px; max-width: 640px;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">Logo (facultatif)</label>
          <p style="color: #64748b; font-size: 0.8rem; margin: 0 0 10px;">
            Affiché sur les bulletins générés. Sans logo, le bulletin se génère normalement — il n'y a rien à faire.
          </p>
          <div style="display: flex; align-items: center; gap: 14px;">
            <div v-if="companyProfileForm.companyLogo" style="width: 64px; height: 64px; border: 1px solid #e2e8f0; border-radius: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: white; flex-shrink: 0;">
              <img :src="companyProfileForm.companyLogo" alt="Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="display: inline-flex; align-items: center; gap: 6px; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.85rem; width: fit-content;">
                {{ companyProfileForm.companyLogo ? 'Changer le logo' : 'Importer un logo' }}
                <input type="file" accept="image/*" @change="onLogoFileChange" style="display: none;" />
              </label>
              <button v-if="companyProfileForm.companyLogo" @click="removeLogo" style="background: none; border: none; color: #ef4444; font-size: 0.78rem; cursor: pointer; text-decoration: underline; width: fit-content;">Retirer le logo</button>
              <span v-if="logoUploadError" style="color: #ef4444; font-size: 0.78rem;">{{ logoUploadError }}</span>
            </div>
          </div>
        </div>

        <button @click="saveCompanyProfile" :disabled="companyProfileSaving" style="margin-top: 16px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 700; box-shadow: 0 4px 12px rgba(59,130,246,0.25);">
          {{ companyProfileSaving ? 'Enregistrement...' : 'Enregistrer le profil entreprise' }}
        </button>
      </div>
    </div>

    <!-- TAB: TEMPLATES -->
    <div v-if="activeTab === 'templates'">
      <div style="margin-bottom: 28px;">
        <h3 style="margin: 0 0 4px; color: #0f172a;">Modèles de bulletin ONDA</h3>
        <p style="color: #64748b; font-size: 0.85rem; margin: 0 0 14px;">
          Deux mises en page intégrées, sans rien à importer. Comparez-les puis choisissez celle utilisée par défaut pour tous vos bulletins.
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; max-width: 1080px;">
          <div v-for="style in BULLETIN_STYLES" :key="style.code" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;" :style="{ borderColor: user?.defaultBulletinStyle === style.code || (!user?.defaultBulletinStyle && style.code === 'classique') ? '#3b82f6' : '#e2e8f0' }">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <strong style="color: #0f172a;">{{ style.nom }}</strong>
              <span v-if="user?.defaultBulletinStyle === style.code || (!user?.defaultBulletinStyle && style.code === 'classique')" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 1px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 700;">Par défaut</span>
            </div>
            <p style="color: #64748b; font-size: 0.8rem; margin: 0 0 12px; line-height: 1.4;">{{ style.description }}</p>
            <div style="display: flex; gap: 8px;">
              <button v-if="style.code === 'surMesure'" @click="showCanvasEditor = true" style="flex: 1; background: #eef2ff; border: 1px solid #c7d2fe; color: #4338ca; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 700;">
                Concevoir avec l'IA
              </button>
              <button @click="previewBulletinStyle(style.code)" :disabled="previewingStyle === style.code" style="flex: 1; background: #f1f5f9; border: 1px solid #e2e8f0; color: #334155; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">
                {{ previewingStyle === style.code ? 'Génération…' : 'Aperçu (PDF)' }}
              </button>
              <button
                v-if="!(user?.defaultBulletinStyle === style.code || (!user?.defaultBulletinStyle && style.code === 'classique'))"
                @click="setDefaultBulletinStyle(style.code)" :disabled="settingDefaultStyle === style.code"
                style="flex: 1; background: #2563eb; border: none; color: white; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">
                {{ settingDefaultStyle === style.code ? '...' : 'Définir par défaut' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 28px;">
        <h3 style="margin: 0 0 4px; color: #0f172a;">Numérotation des rubriques</h3>
        <p style="color: #64748b; font-size: 0.85rem; margin: 0 0 14px; max-width: 760px;">
          Chaque logiciel de paie a ses propres codes devant chaque ligne (« 10 » ou « 502 » face à « Salaire de base ») — il n'existe pas de standard commun. Redéfinissez ici ceux que vous voulez retrouver ; les autres gardent leur valeur ONDA par défaut. S'applique à tous les modèles ci-dessus.
        </p>
        <div v-for="groupe in groupesRubriques" :key="groupe.nom" style="margin-bottom: 16px;">
          <div style="font-size: 0.78rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 6px;">{{ groupe.nom }}</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px 16px; max-width: 1080px;">
            <div v-for="r in groupe.items" :key="r.cle" style="display: flex; align-items: center; gap: 8px;">
              <span style="flex: 1; font-size: 0.82rem; color: #334155;">{{ r.libelle }}</span>
              <input v-model="codesRubriquesForm[r.cle]" type="text" :placeholder="codesRubriquesDefaut[r.cle]" style="width: 64px; padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 0.82rem; text-align: center;" />
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px;">
          <button @click="enregistrerCodesRubriques" :disabled="savingCodes" style="background: #2563eb; border: none; color: white; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 0.85rem;">
            {{ savingCodes ? 'Enregistrement…' : 'Enregistrer la numérotation' }}
          </button>
          <button @click="reinitialiserFormulaireCodes" style="background: white; border: 1px solid #e2e8f0; color: #475569; padding: 9px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.85rem;">
            Annuler mes modifications
          </button>
          <select v-model="stylePourApercuCodes" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; font-size: 0.82rem; margin-left: auto;">
            <option v-for="style in BULLETIN_STYLES" :key="style.code" :value="style.code">{{ style.nom }}</option>
          </select>
          <button @click="previewBulletinStyle(stylePourApercuCodes, codesRubriquesForm)" :disabled="previewingStyle === stylePourApercuCodes" style="background: #f1f5f9; border: 1px solid #e2e8f0; color: #334155; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.82rem;">
            {{ previewingStyle === stylePourApercuCodes ? 'Génération…' : 'Aperçu avec ces codes' }}
          </button>
        </div>
      </div>

      <div style="margin-bottom: 28px;">
        <h3 style="margin: 0 0 4px; color: #0f172a;">Couleur du modèle « Personnalisé »</h3>
        <p style="color: #64748b; font-size: 0.85rem; margin: 0 0 14px; max-width: 760px;">
          Le modèle « Personnalisé » reprend la mise en page du modèle Classique mais dans la couleur de votre choix, plutôt qu'une couleur figée comme les autres modèles. Choisissez-la ici, elle s'applique immédiatement au prochain bulletin généré avec ce style.
        </p>
        <div style="display: flex; align-items: center; gap: 12px;">
          <input v-model="bulletinCouleurForm" type="color" style="width: 48px; height: 40px; padding: 2px; border-radius: 8px; border: 1px solid #e2e8f0; cursor: pointer;" />
          <span style="font-size: 0.82rem; color: #334155; font-family: monospace;">{{ bulletinCouleurForm }}</span>
          <button @click="enregistrerBulletinCouleur" :disabled="savingCouleur" style="background: #2563eb; border: none; color: white; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 0.85rem;">
            {{ savingCouleur ? 'Enregistrement…' : 'Enregistrer la couleur' }}
          </button>
          <button @click="previewBulletinStyle('personnalise')" :disabled="previewingStyle === 'personnalise'" style="background: #f1f5f9; border: 1px solid #e2e8f0; color: #334155; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.82rem;">
            {{ previewingStyle === 'personnalise' ? 'Génération…' : 'Aperçu avec cette couleur' }}
          </button>
        </div>
      </div>

      <div class="templates-tab-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #0f172a;">Vos modèles personnalisés</h3>
        <div style="display: flex; gap: 10px;">
          <button @click="showPdfWizard = true" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 700; box-shadow: 0 4px 12px rgba(239,68,68,0.25);" title="Bulletin de paie en PDF : la mise en page est reproduite à l'identique">+ Modèle Bulletin (PDF)</button>
          <button @click="showOfficeWizard = true" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 700; box-shadow: 0 4px 12px rgba(16,185,129,0.25);" title="Word ou Excel : votre mise en page est conservée telle quelle">+ Modèle Word / Excel</button>
        </div>
      </div>
      
      <div v-if="templates.length === 0" style="padding: 60px 20px; text-align: center; background: #f8fafc; border-radius: 16px; border: 1px dashed #e2e8f0;">
        <h3 style="color: #0f172a; margin-bottom: 8px;">Aucun modèle personnalisé</h3>
        <p style="color: #64748b; font-size: 0.9rem;">Le système utilise le modèle par défaut (généré dynamiquement).</p>
      </div>

      <div v-else class="templates-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
        <div v-for="t in templates" :key="t.id" class="template-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; background: #fef2f2; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #ef4444;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              </div>
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <h4 style="margin: 0; font-size: 1rem; color: #0f172a;">{{ t.name }}</h4>
                  <span v-if="t.isDefault" style="background: #fef9c3; color: #d97706; border: 1px solid #fde047; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Défaut</span>
                  <span style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">
                    {{ libelleModele(t) }}
                  </span>
                </div>
                <p style="margin: 4px 0 0; color: #64748b; font-size: 0.85rem;">Ajouté le {{ new Date(t.createdAt).toLocaleDateString() }}</p>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            <button v-if="!t.isDefault" @click="setDefaultTemplate(t)" style="flex: 1; background: #ffffff; border: 1px solid #e2e8f0; color: #475569; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; transition: background 0.2s;">Utiliser par défaut</button>
            <button @click="deleteTemplate(t.id)" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; transition: background 0.2s;">Supprimer</button>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB: SCHEDULE -->
    <div v-if="activeTab === 'schedule'" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; max-width: 600px; color: #0f172a;">
      <h3 style="margin-top: 0; margin-bottom: 24px; color: #0f172a;">Planification de la paie</h3>
      
      <div style="margin-bottom: 20px;">
        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
          <input type="checkbox" v-model="scheduleSettings.autoGenerate" style="width: 20px; height: 20px; accent-color: #3b82f6;" />
          <span style="font-weight: 600; color: #0f172a;">Activer l'alerte de génération automatique</span>
        </label>
        <p style="margin-top: 8px; margin-left: 32px; color: #64748b; font-size: 0.9rem; line-height: 1.5;">
          Lorsque cette option est activée, le système vérifiera chaque mois à la date spécifiée si la paie a été générée. Si ce n'est pas le cas, une alerte s'affichera à l'ouverture de l'application pour vous proposer de générer la paie en 1 clic pour tous vos employés.
        </p>
      </div>

      <div style="margin-bottom: 32px; padding-left: 32px;" v-if="scheduleSettings.autoGenerate">
        <label style="display: block; font-weight: 600; color: #475569; margin-bottom: 8px;">Jour de génération (chaque mois)</label>
        <div style="display: flex; align-items: center; gap: 12px;">
          Le 
          <input type="number" v-model="scheduleSettings.generationDay" min="1" max="31" style="width: 70px; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; font-weight: bold; color: #0f172a;" />
          du mois
        </div>
      </div>
      
      <div style="margin-bottom: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <h4 style="margin: 0 0 16px 0; color: #0f172a;">Rappels & Expiration</h4>
        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
          <input type="checkbox" v-model="scheduleSettings.emailRemindersContracts" style="width: 20px; height: 20px; accent-color: #3b82f6;" />
          <span style="font-weight: 600; color: #0f172a;">M'envoyer des rappels par e-mail</span>
        </label>
        <p style="margin-top: 8px; margin-left: 32px; color: #64748b; font-size: 0.9rem; line-height: 1.5;">
          ONDA RH Pro vous alertera directement par e-mail en cas de contrats CDD ou périodes d'essai arrivant à échéance (J-30, J-15 et J-7) pour ne manquer aucune date critique.
        </p>
      </div>


      <button @click="saveScheduleSettings" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 700; width: 100%; box-shadow: 0 4px 12px rgba(59,130,246,0.25);">
        Sauvegarder la planification
      </button>
    </div>

    <!-- ÉDITEUR VISUEL DU MODÈLE « SUR-MESURE » -->
    <BulletinCanvasEditor v-if="showCanvasEditor" @fermer="showCanvasEditor = false" @enregistre="showCanvasEditor = false" />

    <!-- MODAL UPLOAD TEMPLATE -->
    <!-- Trois façons de sortir : la croix, le fond, la touche Échap. -->
    <div v-if="showOfficeWizard" class="wizard-overlay" @click.self="showOfficeWizard = false">
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

    <!-- MODAL UPLOAD MODÈLE BULLETIN PDF -->
    <div v-if="showPdfWizard" class="wizard-overlay" @click.self="fermerPdfWizard">
      <div class="wizard-panel" :class="{ 'wizard-panel-wide': pdfAnalysisResult }">
        <div class="wizard-entete">
          <div>
            <h3 class="wizard-titre">Modèle de bulletin (PDF)</h3>
            <p class="wizard-sous-titre">
              La mise en page de votre PDF est reproduite à l'identique. Seuls les champs que
              nous reconnaissons (les mêmes que sur nos bulletins par défaut) sont remplacés par
              vos données — les noms de variable ne sont jamais devinés au hasard. Le reste du
              modèle reste tel quel.
            </p>
          </div>
          <button type="button" class="wizard-fermer" title="Fermer" aria-label="Fermer" @click="fermerPdfWizard">&times;</button>
        </div>

        <div style="padding: 24px;">
          <label style="display: flex; flex-direction: column; align-items: center; gap: 8px; border: 2px dashed #e2e8f0; border-radius: 12px; padding: 32px; cursor: pointer; text-align: center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style="color: #475569; font-weight: 600;">{{ pdfTemplateFile ? pdfTemplateFile.name : 'Choisir un bulletin PDF' }}</span>
            <input type="file" accept=".pdf" @change="handlePdfTemplateUpload" style="display: none;" />
          </label>

          <p v-if="pdfAnalysisError" style="color: #dc2626; margin-top: 12px;">{{ pdfAnalysisError }}</p>

          <div v-if="pdfAnalysisResult" style="margin-top: 16px; background: #ecfdf5; border: 1px solid #10b981; color: #059669; padding: 12px 16px; border-radius: 8px;">
            <span v-if="pdfAnalysisResult.engine === 'ai-vision'">Reconstruction approximative (aucune couche texte exploitable dans ce PDF — probablement un scan).</span>
            <span v-else>Reproduit à l'identique depuis la géométrie du PDF.</span>
            <span v-if="pdfAnalysisResult.variables?.length"> {{ pdfAnalysisResult.variables.length }} champ(s) détecté(s).</span>
            <span v-if="pdfAnalysisResult.unmapped?.length"> {{ pdfAnalysisResult.unmapped.length }} champ(s) sans donnée associée resteront vides.</span>
          </div>
          <p v-if="pdfAnalysisResult?.htmlTemplate?.includes('data-onda-logo') && !user?.companyLogo" style="color: #b45309; background: #fffbeb; border: 1px solid #fde68a; padding: 10px 14px; border-radius: 8px; margin-top: 8px;">
            Un emplacement de logo a été repéré dans ce PDF, mais aucun logo n'est configuré sur votre compte : il restera vide. Importez-en un dans <strong>Profil Entreprise</strong> (onglet Général) pour qu'il apparaisse ici.
          </p>
          <p v-if="pdfAnalysisResult && !pdfAnalysisResult.htmlTemplate?.trim()" style="color: #dc2626; margin-top: 8px;">
            L'analyse n'a produit aucun contenu exploitable pour ce PDF — réessayez, ou contactez le support avec ce fichier.
          </p>

          <!-- Comparaison visuelle : ce que le moteur juge conforme, jugez-le vous-même -->
          <div v-if="pdfAnalysisResult && templateSource?.imageBase64" style="margin-top: 20px;">
            <p style="color: #475569; font-size: 0.85rem; margin-bottom: 8px; font-weight: 600;">
              Comparez : votre PDF à gauche, la reproduction à droite (remplie avec des données d'exemple, pour comparer la mise en page — pas les valeurs).
            </p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 4px; text-align: center;">VOTRE PDF (ORIGINAL)</div>
                <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; height: 420px; overflow-y: auto; background: #f8fafc;">
                  <img :src="templateSource.imageBase64" style="width: 100%; display: block;" alt="PDF original" />
                </div>
              </div>
              <div>
                <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 4px; text-align: center;">REPRODUCTION (DONNÉES D'EXEMPLE)</div>
                <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; height: 420px; background: white;">
                  <iframe :srcdoc="comparisonPreviewSrcdoc" style="width: 100%; height: 100%; border: none;" scrolling="yes"></iframe>
                </div>
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button
              v-if="!pdfAnalysisResult"
              @click="analyserModelePdf"
              :disabled="!pdfTemplateFile || pdfPreparing || pdfAnalyzing"
              style="flex: 1; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 700;">
              {{ pdfAnalyzing ? 'Analyse en cours…' : (pdfPreparing ? 'Lecture du PDF…' : 'Analyser le modèle') }}
            </button>
            <template v-else>
              <button @click="enregistrerGabaritPdf" style="flex: 1; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 700;">
                Enregistrer ce modèle
              </button>
              <button @click="analyserModelePdf" :disabled="pdfAnalyzing" style="background: white; border: 1px solid #e2e8f0; color: #475569; padding: 12px 16px; border-radius: 8px; cursor: pointer; font-weight: 600;">Réanalyser</button>
            </template>
          </div>
        </div>
      </div>
    </div>
    <canvas ref="pdfCanvas" style="display: none;"></canvas>

  </div>
</template>

<style scoped>
.wizard-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(4px); display: flex; align-items: center;
  justify-content: center; z-index: 100; padding: 20px;
}
.wizard-panel {
  background: #fff; border-radius: 16px; padding: 24px; width: 100%;
  max-width: 720px; max-height: 90vh; overflow-y: auto;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}
.wizard-panel-wide { max-width: 1080px; }
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
.settings-wrapper {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}

.tabs-header {
  display: flex !important;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 24px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.tabs-header::-webkit-scrollbar {
  display: none;
}

.tabs-header button {
  flex-shrink: 0 !important;
  white-space: nowrap !important;
}

@media (max-width: 640px) {
  .settings-wrapper {
    padding: 8px 6px !important;
  }
  
  .tabs-header {
    gap: 4px;
  }
  
  .tabs-header button {
    padding: 8px 10px !important;
    font-size: 0.85rem !important;
  }
  
  .countries-settings-grid {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
  }
  
  /* Templates Tab Mobile adjustments */
  .templates-tab-header {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 12px !important;
    text-align: center;
  }
  
  .templates-tab-header h3 {
    font-size: 1.2rem;
  }
  
  .templates-tab-header button {
    width: 100%;
    justify-content: center;
    padding: 12px !important;
  }
  
  .templates-grid {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
  
  .template-card {
    padding: 12px !important;
  }
  
  /* Schedule Tab Mobile adjustments */
  .settings-wrapper p {
    margin-left: 12px !important;
    font-size: 0.85rem !important;
  }
  
  .settings-wrapper div[style*="padding-left: 32px"] {
    padding-left: 12px !important;
  }
}
</style>
