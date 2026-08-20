<script setup>
import { ref, computed, onMounted } from 'vue'
import { localDb } from '../../services/localDatabase.js'
import { COUNTRIES_CONFIG } from '../../services/countryConfig.js'
import { showToast } from '../../services/toast.js'
import EmployeeSelect from './EmployeeSelect.vue'
import RichDocEditor from './RichDocEditor.vue'

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
  docData.value.lieu = countryInfo.value.villeParDefaut
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
})

// Pré-remplissage depuis l'employé sélectionné
const onEmployeeChange = () => {
  const emp = selectedEmployee.value
  if (!emp) return
  docData.value.salaireBrut = emp.salaireBrut || emp.salaire || ''
  docData.value.salaireDeBase = emp.salaire_base || ''
  docData.value.sursalaire = emp.sursalaire || ''
  docData.value.dateEntree = emp.dateEntree || emp.date_entree || ''
  docData.value.postePropose = emp.poste || ''
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
  if (!n && n !== 0) return '___________'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' ' + (countryInfo.value.currency || 'FCFA')
}

// ── Liste des templates (Défaut + Personnalisés)
const DEFAULT_TEMPLATES = [
  { id: 'stc', label: 'Solde de Tout Compte', color: '#f59e0b', content: '<div style="text-align: center; margin-bottom: 2rem;"><h2>SOLDE DE TOUT COMPTE</h2></div><p>Je soussigné(e) <strong>{{signataireNom}}</strong>, agissant en qualité de <strong>{{signatairePoste}}</strong> de l\'entreprise <strong>{{entreprise}}</strong>,</p><p>Reconnais par la présente remettre à <strong>{{nomComplet}}</strong>, employé(e) en tant que <strong>{{poste}}</strong> depuis le {{dateEntree}}, la somme de <strong>{{salaireAff}}</strong> au titre du règlement de son solde de tout compte.</p><p>Cette somme inclut :</p><ul><li>Le prorata du mois en cours</li><li>L\'indemnité compensatrice de congés payés</li><li>L\'indemnité de fin de contrat / licenciement</li></ul><p>Fait à {{lieu}}, le {{dateDoc}}.</p><br><br><p>Signature de l\'employeur :</p><br><br><br><p>Signature du salarié (Précédée de la mention "Pour solde de tout compte") :</p>' },
  { id: 'contrat_cdi', label: 'Contrat CDI', color: '#10b981', content: '<div style="text-align: center; margin-bottom: 2rem;"><h2>CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE (CDI)</h2></div><p>Entre <strong>{{entreprise}}</strong>, représentée par <strong>{{signataireNom}}</strong> en qualité de <strong>{{signatairePoste}}</strong>, d\'une part,</p><p>Et <strong>{{nomComplet}}</strong>, d\'autre part.</p><p><strong>Article 1 : Engagement</strong></p><p>L\'entreprise engage <strong>{{nomComplet}}</strong> en qualité de <strong>{{poste}}</strong> à compter du {{dateEntree}}.</p><p><strong>Article 2 : Rémunération</strong></p><p>En contrepartie de ses services, le salarié percevra une rémunération mensuelle brute de <strong>{{salaireAff}}</strong>.</p><p>Fait à {{lieu}}, le {{dateDoc}} en deux exemplaires originaux.</p>' },
  { id: 'attestation', label: 'Attestation de travail', color: '#3b82f6', content: '<div style="text-align: center; margin-bottom: 2rem;"><h2>ATTESTATION DE TRAVAIL</h2></div><p>Je soussigné(e) <strong>{{signataireNom}}</strong>, <strong>{{signatairePoste}}</strong> de l\'entreprise <strong>{{entreprise}}</strong>,</p><p>Certifie par la présente que <strong>{{nomComplet}}</strong> est employé(e) au sein de notre structure depuis le {{dateEntree}} en qualité de <strong>{{poste}}</strong>.</p><p>Cette attestation est délivrée pour servir et valoir ce que de droit.</p><br><br><p>Fait à {{lieu}}, le {{dateDoc}}.</p><br><br><p>La Direction</p>' }
]

const customTemplates = ref(JSON.parse(localStorage.getItem('onda_custom_templates') || '[]'))
const allTemplates = computed(() => [...DEFAULT_TEMPLATES, ...customTemplates.value])

// ── Éditeur de modèles personnalisés
const isEditingModel = ref(false)
const modelForm = ref({
  id: '',
  label: '',
  color: '#ec4899',
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
      content: 'Le soussigné, {{signataireNom}}, atteste que {{nomComplet}} est employé en qualité de {{poste}} depuis le {{dateEntree}}.\n\nFait à {{lieu}}, le {{dateDoc}}.'
    }
  }
  isEditingModel.value = true
}

const saveCustomTemplate = () => {
  if (!modelForm.value.label || !modelForm.value.content) {
    showToast('Le nom et le contenu sont requis', 'error')
    return
  }
  const idx = customTemplates.value.findIndex(t => t.id === modelForm.value.id)
  const entry = { ...modelForm.value, isCustom: true }
  if (idx !== -1) {
    customTemplates.value[idx] = entry
  } else {
    customTemplates.value.push(entry)
  }
  localStorage.setItem('onda_custom_templates', JSON.stringify(customTemplates.value))
  showToast('Modèle personnalisé sauvegardé', 'success')
  isEditingModel.value = false
  selectedTemplate.value = entry.id
}

const templateToDelete = ref(null)

const confirmDeleteCustomTemplate = (id) => {
  templateToDelete.value = id
}

const confirmDelete = () => {
  if (templateToDelete.value) {
    const id = templateToDelete.value
    customTemplates.value = customTemplates.value.filter(t => t.id !== id)
    localStorage.setItem('onda_custom_templates', JSON.stringify(customTemplates.value))
    if (selectedTemplate.value === id) selectedTemplate.value = ''
    showToast('Modèle supprimé.', 'success')
    templateToDelete.value = null
  }
}

const cancelDelete = () => {
  templateToDelete.value = null
}

// ── Impression et Téléchargement PDF
const printDocument = () => {
  const content = documentContent.value
  if (!content) return
  
  const printWindow = window.open('', '_blank')
  printWindow.document.write(`
    <html>
      <head>
        <title>Impression Document<\\/title>
        <script src="https://cdn.tailwindcss.com"><\\/script>
        <style>
          body { padding: 2rem; font-family: Georgia, serif; color: black; }
          @media print { 
            body { padding: 0; }
            @page { margin: 1.5cm; }
          }
        <\\/style>
      <\\/head>
      <body>
        <div style="white-space: pre-wrap;">
          ${content}
        <\\/div>
        <script>
          // Attendre que Tailwind soit chargé avant d'imprimer
          setTimeout(() => { 
            window.print(); 
            window.close(); 
          }, 800);
        <\\/script>
      <\\/body>
    <\\/html>
  `)
  printWindow.document.close()
}
// ── Extract Template from PDF/Image via AI
const pdfCanvas = ref(null)
const aiMappingLoading = ref(false)
const lastUploadedFileName = ref('')

const triggerTemplateUpload = () => {
  const el = document.getElementById('template-upload-input')
  if (el) el.click()
}

const handleTemplateUpload = (e) => {
  const file = e.target.files[0]
  if (!file) return
  
  // Extraire le nom du fichier sans extension
  let baseName = file.name.split('.').slice(0, -1).join('.') || file.name
  baseName = baseName.replace(/[-_]/g, ' ')
  lastUploadedFileName.value = baseName.charAt(0).toUpperCase() + baseName.slice(1)
  
  if (file.name.toLowerCase().endsWith('.pdf')) {
    setTimeout(() => renderPdfCanvas(file), 100)
  } else if (file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = pdfCanvas.value
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)
        autoMapPdf()
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  } else {
    showToast("Format non supporté. Veuillez utiliser PDF, JPG ou PNG.", 'error')
  }
}

const renderPdfCanvas = (file) => {
  if (!window.pdfjsLib) {
    showToast("La librairie PDF est en cours de chargement, réessayez dans un instant.", 'error')
    return
  }
  const fileReader = new FileReader()
  fileReader.onload = async function() {
    try {
      const typedarray = new Uint8Array(this.result)
      const pdf = await window.pdfjsLib.getDocument(typedarray).promise
      const page = await pdf.getPage(1)
      
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = pdfCanvas.value
      if (!canvas) return
      const context = canvas.getContext('2d')
      canvas.height = viewport.height
      canvas.width = viewport.width
      
      await page.render({ canvasContext: context, viewport: viewport }).promise
      
      autoMapPdf()
    } catch(err) {
      showToast("Erreur lors de la lecture du PDF", 'error')
    }
  }
  fileReader.readAsArrayBuffer(file)
}

const autoMapPdf = async () => {
  if (!pdfCanvas.value) return
  
  aiMappingLoading.value = true
  
  try {
    const token = localStorage.getItem('auth_token')
    if (!token) throw new Error("Vous devez être connecté pour utiliser l'Intelligence Artificielle.")

    const imageBase64 = pdfCanvas.value.toDataURL('image/jpeg', 0.8)

    const response = await fetch('/api/rh/analyze-pdf-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ imageBase64 })
    })
    
    const result = await response.json()
    
    if (!response.ok) {
      if (response.status === 402) throw new Error("Crédits insuffisants. Veuillez recharger votre compte.")
      throw new Error(result.error || "Erreur lors de l'analyse IA")
    }

    if (result.htmlTemplate) {
      // Nettoyage et insertion des variables
      let html = result.htmlTemplate
      // Remplacer les placeholders génériques IA par nos variables
      html = html.replace(/\{prenom\}\s*\{nom\}|\{nom\}\s*\{prenom\}|\[Nom Complet\]|\[Nom du salarié\]|\{nom\}|\{prenom\}/gi, '{{nomComplet}}')
      html = html.replace(/\[Poste\]|\[Fonction\]|\{poste\}/gi, '{{poste}}')
      html = html.replace(/\[Date d'entrée\]|\[Date d'embauche\]/gi, '{{dateEntree}}')
      html = html.replace(/\[Salaire\]|\[Rémunération\]|\{brut\}|\{salaireBase\}/gi, '{{salaireAff}}')
      html = html.replace(/\[Nom de l'entreprise\]|\[Société\]|\{nom_entreprise\}/gi, '{{entreprise}}')
      html = html.replace(/\[Lieu\]|\[Ville\]/gi, '{{lieu}}')
      html = html.replace(/\[Adresse\]|\[Adresse de l'entreprise\]/gi, '{{adresse}}')
      html = html.replace(/\[Date\]|\{date_jour\}/gi, '{{dateDoc}}')
      
      modelForm.value = {
        id: 'custom_' + Date.now(),
        label: lastUploadedFileName.value || 'Nouveau modèle',
        color: '#ec4899',
        content: html
      }
      isEditingModel.value = true
      showToast("Modèle extrait avec succès par l'IA !", "success")
    }
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    aiMappingLoading.value = false
    const input = document.getElementById('template-upload-input')
    if (input) input.value = ''
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

  const header = `${entreprise}\n${adresse}\n\n${d.lieu}, le ${d.dateDoc}\n\n`
  const footer = `\n\n${d.formule}\n\n${d.signataireNom || '_____________________'}\n${d.signatairePoste}\n${entreprise}`

  const selectedCustom = customTemplates.value.find(t => t.id === selectedTemplate.value)

  if (selectedCustom) {
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
    return content
  }

  // Modèles par défaut
  switch (selectedTemplate.value) {
    case 'attestation_travail':
      return `${header}ATTESTATION DE TRAVAIL\n\nLe soussigné, ${d.signataireNom || '_____________________'}, ${d.signatairePoste} de la société ${entreprise},\n\natteste par la présente que ${nomComplet} est employé(e) au sein de notre établissement depuis le ${dateEntree}, en qualité de ${poste}.\n\nLe contrat de travail liant ${nomComplet} à notre société est un contrat à durée indéterminée (CDI) régi par les dispositions du Code du Travail ${country.preposition} ${country.name}.\n\n${anciennete ? `L'intéressé(e) justifie d'une ancienneté de ${anciennete} au sein de notre structure.` : ''}\n\nLa présente attestation est délivrée à l'intéressé(e) à sa demande, pour servir et valoir ce que de droit.${footer}`
    case 'attestation_revenus':
      return `${header}ATTESTATION DE REVENUS\n\nLe soussigné, ${d.signataireNom || '_____________________'}, ${d.signatairePoste} de la société ${entreprise},\n\ncertifie que ${nomComplet}, occupant le poste de ${poste} au sein de notre structure depuis le ${dateEntree},\n\nperçoit une rémunération mensuelle brute de ${salaireAff}.\n\n${anciennete ? `L'intéressé(e) justifie d'une ancienneté de ${anciennete} dans notre société.` : ''}\n\nLa présente attestation est établie à la demande de l'intéressé(e), pour servir et valoir ce que de droit.${footer}`
    case 'avertissement':
      return `${header}LETTRE D'AVERTISSEMENT\n\nÀ l'attention de : ${nomComplet}\nPoste : ${poste}\n\nMadame, Monsieur,\n\nNous vous notifions par la présente un avertissement disciplinaire pour le motif suivant :\n\n${d.motifAvertissement || '(Décrire précisément les faits reprochés)'}\n\nCes faits sont contraires aux obligations professionnelles et disciplinaires qui vous incombent en vertu de votre contrat de travail et du règlement intérieur de notre société.\n\nNous vous demandons instamment de mettre fin à ces agissements et de vous conformer strictement à vos obligations contractuelles.\n\nDans le cas où ces faits se reproduiraient, nous serions contraints de prendre des mesures disciplinaires plus sévères, pouvant aller jusqu'au licenciement.\n\nVeuillez nous accuser réception de ce courrier en le signant et en en conservant un exemplaire.${footer}`
    case 'avenant':
      return `${header}AVENANT AU CONTRAT DE TRAVAIL\n\nEntre la société ${entreprise}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste},\net ${nomComplet}, employé(e) depuis le ${dateEntree} en qualité de ${poste}.\n\nIl est convenu ce qui suit :\n\nArticle 1 — Modification(s) apportée(s) au contrat :\n${d.postePropose ? `- Nouveau poste : ${d.postePropose}` : ''}\n${d.nouveauSalaire ? `- Nouvelle rémunération brute mensuelle : ${fmt(parseFloat(d.nouveauSalaire))}` : ''}\n${d.dateDebutContrat ? `- Prise d'effet : ${d.dateDebutContrat}` : ''}\n\nArticle 2 — Maintien des autres clauses\nToutes les autres clauses et conditions du contrat de travail initial demeurent inchangées.\n\nFait en deux exemplaires originaux, à ${d.lieu}, le ${d.dateDoc}.\n\nL'Employeur                        Le Salarié\n${d.signataireNom || '_____________________'}          ${nomComplet}\n                                   (Lu et approuvé)`
    case 'contrat_cdi':
      return `${header}CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE (CDI)\nRégi par le Code du Travail ${country.preposition} ${country.name}\n\nENTRE LES SOUSSIGNÉS :\n\nL'EMPLOYEUR : La société ${entreprise}, dont le siège est à ${adresse}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste},\n\nET :\n\nLE SALARIÉ : ${nomComplet},\n\nIL A ÉTÉ CONVENU CE QUI SUIT :\n\nArticle 1 — Engagement\nL'Employeur engage le Salarié à compter du ${d.dateDebutContrat || d.dateDoc}, en qualité de ${d.postePropose || poste}.\n\nArticle 2 — Durée\nLe présent contrat est conclu pour une durée indéterminée. Il comporte une période d'essai de ___ mois renouvelable une fois.\n\nArticle 3 — Rémunération\nLe Salarié percevra une rémunération mensuelle brute de ${fmt(docTotalBrut.value)}, décomposée comme suit :\n${remunerationClause(d)}\n\nCette rémunération est soumise aux cotisations sociales (${country.organismeRetraite}).\n\nArticle 4 — Horaires & Lieu de travail\nLe Salarié exercera ses fonctions à ${adresse}, selon les horaires définis par le règlement intérieur.\n\nArticle 5 — Congés payés\nLe Salarié bénéficiera de congés payés conformément au Code du Travail ${country.preposition} ${country.name}.\n\nArticle 6 — Droit applicable\nLe présent contrat est soumis au Code du Travail ${country.preposition} ${country.name} et à la Convention Collective applicable.\n\nFait à ${d.lieu}, le ${d.dateDoc}, en deux exemplaires originaux.\n\nL'Employeur                        Le Salarié\n${d.signataireNom || '_____________________'}          ${nomComplet}\n                                   (Lu et approuvé)`
    case 'contrat_cdd':
      return `${header}CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE (CDD)\nRégi par le Code du Travail ${country.preposition} ${country.name}\n\nENTRE LES SOUSSIGNÉS :\n\nL'EMPLOYEUR : La société ${entreprise}, dont le siège est à ${adresse}, représentée par ${d.signataireNom || '_____________________'}, ${d.signatairePoste},\n\nET :\n\nLE SALARIÉ : ${nomComplet},\n\nIL A ÉTÉ CONVENU CE QUI SUIT :\n\nArticle 1 — Objet du contrat\nLe présent CDD est conclu pour le motif suivant : ___________ (accroissement temporaire d'activité / remplacement / projet déterminé).\n\nArticle 2 — Durée\nLe contrat prend effet le ${d.dateDebutContrat || '___________'} et prend fin le ${d.dateFinContrat || '___________'}.\n\nArticle 3 — Poste & Rémunération\nPoste : ${d.postePropose || poste}\nRémunération brute mensuelle : ${fmt(docTotalBrut.value)}, décomposée comme suit :\n${remunerationClause(d)}\n\nArticle 4 — Cotisations sociales\nLes cotisations sociales (${country.organismeRetraite}) seront prélevées conformément à la réglementation en vigueur ${country.preposition} ${country.name}.\n\nFait à ${d.lieu}, le ${d.dateDoc}, en deux exemplaires originaux.\n\nL'Employeur                        Le Salarié\n${d.signataireNom || '_____________________'}          ${nomComplet}\n                                   (Lu et approuvé)`
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
  if (!selectedTemplate.value || !documentContent.value) return
  const tmpl = allTemplates.value.find(t => t.id === selectedTemplate.value)
  const entry = {
    id: Date.now(),
    template: tmpl?.label || selectedTemplate.value,
    employe: selectedEmployee.value ? `${selectedEmployee.value.prenom || ''} ${selectedEmployee.value.nom || ''}`.trim() : 'Non spécifié',
    date: docData.value.dateDoc,
  }
  history.value.unshift(entry)
  if (history.value.length > 20) history.value = history.value.slice(0, 20)
  localStorage.setItem('onda_documents_history', JSON.stringify(history.value))
}

const templateFields = computed(() => {
  const custom = customTemplates.value.find(t => t.id === selectedTemplate.value)
  if (custom) return ['nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc'] // Champs génériques pour les custom
  
  switch (selectedTemplate.value) {
    case 'attestation_travail': return ['dateEntree','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'attestation_revenus': return ['dateEntree','salaireBrut','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'avertissement': return ['motifAvertissement','nomEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'avenant': return ['postePropose','nouveauSalaire','dateDebutContrat','nomEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'contrat_cdi': return ['postePropose','salaireDeBase','sursalaire','dateDebutContrat','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'contrat_cdd': return ['postePropose','salaireDeBase','sursalaire','dateDebutContrat','dateFinContrat','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    case 'licenciement': return ['motifLicenciement','dateEntree','salaireBrut','dateSortie','nomEntreprise','adresseEntreprise','signataireNom','signatairePoste','lieu','dateDoc']
    default: return []
  }
})

const FIELD_LABELS = {
  dateEntree:"Date d'entrée",salaireBrut:'Salaire brut mensuel',salaireDeBase:'Salaire de base',sursalaire:'Sursalaire',motifAvertissement:"Motif de l'avertissement",
  motifLicenciement:'Motif du licenciement',postePropose:'Nouveau poste / Poste proposé',nouveauSalaire:'Nouveau salaire brut',
  dateDebutContrat:'Date de début',dateFinContrat:'Date de fin de contrat',dateSortie:'Date de sortie',
  nomEntreprise:"Nom de l'entreprise",adresseEntreprise:'Adresse / Ville',signataireNom:'Nom du signataire',
  signatairePoste:'Poste du signataire',lieu:'Lieu d\'émission',dateDoc:'Date du document'
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
      <div style="display: flex; gap: 0.5rem; align-items: center; margin-left: auto;">
        <button class="add-model-btn" style="background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2);" @click="openModelEditor()">
          Créer un modèle vierge
        </button>
        <button v-if="!isElectron" class="add-model-btn" @click="triggerTemplateUpload()" :disabled="aiMappingLoading" style="background: white; color: #7c3aed; border: none;">
          <svg v-if="!aiMappingLoading" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span v-else class="loader-spinner" style="border-top-color: #7c3aed;"></span>
          {{ aiMappingLoading ? 'Analyse...' : 'Importer un modèle' }}
        </button>
        <input type="file" id="template-upload-input" accept=".pdf, image/*" style="display:none;" @change="handleTemplateUpload" />
        <!-- Canvas invisible utilisé pour le rendu PDF/Image vers IA (Doit être en dehors du v-if) -->
        <canvas ref="pdfCanvas" style="display:none;"></canvas>
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
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
            <label class="docs-label" style="margin-bottom:0;">
              Contenu du document (Éditeur complet)
              <span v-pre style="font-weight:normal; color:#64748b; font-size:0.7rem; margin-left:0.5rem;">
                Variables : {{nomComplet}}, {{poste}}, {{dateEntree}}, {{salaireAff}}, {{entreprise}}, {{adresse}}, {{lieu}}, {{dateDoc}}, {{signataireNom}}
              </span>
            </label>
          </div>
          <RichDocEditor v-model="modelForm.content" placeholder="Rédigez votre document ici... Utilisez les variables {{nomComplet}}, {{poste}}, etc." />
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
          <h3 class="docs-section-title">1. Choisir le type de document</h3>
          <div class="template-grid">
            <div v-for="t in allTemplates" :key="t.id" style="display:flex; gap:0.5rem; align-items:center;">
              <button
                class="template-btn"
                :class="{ active: selectedTemplate === t.id }"
                @click="selectedTemplate = t.id"
                :style="[selectedTemplate === t.id ? `border-color:${t.color}; background:${t.color}18; color:${t.color}` : '', {flex: 1}]"
              >
                <span class="template-dot" :style="{ background: t.color }"></span>
                {{ t.label }}
              </button>
              
              <!-- Actions pour les modèles personnalisés -->
              <div v-if="t.isCustom" style="display:flex; gap:0.25rem;">
                <button class="docs-copy-btn" style="padding:0.3rem;" @click="openModelEditor(t)" title="Modifier">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="docs-copy-btn" style="padding:0.3rem; color:#ef4444; border-color:#fca5a5;" @click="confirmDeleteCustomTemplate(t.id)" title="Supprimer">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
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
            </div>
          </div>

          <!-- Champs dynamiques -->
          <div class="docs-section">
            <h3 class="docs-section-title">3. Compléter les informations</h3>
            <div class="docs-fields">
              <div v-for="field in templateFields" :key="field" class="docs-field">
                <label class="docs-label">{{ FIELD_LABELS[field] || field }}</label>
                <textarea v-if="field==='motifAvertissement'||field==='motifLicenciement'" class="docs-input docs-textarea" v-model="docData[field]" :placeholder="FIELD_LABELS[field]" rows="3"></textarea>
                <input v-else class="docs-input" :type="field.toLowerCase().includes('salaire')?'number':'text'" v-model="docData[field]" :placeholder="FIELD_LABELS[field]||field" />
              </div>
            </div>
          </div>

          <!-- Primes du contrat (CDI/CDD uniquement) -->
          <div v-if="selectedTemplate==='contrat_cdi' || selectedTemplate==='contrat_cdd'" class="docs-section">
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
          <div style="display:flex;gap:0.5rem;">
            <button class="docs-copy-btn" @click="printDocument" :disabled="!documentContent" title="Imprimer ou Sauvegarder en PDF" style="background:#f1f5f9; border-color:#e2e8f0; color:#334155;">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              Imprimer / PDF
            </button>
            <button class="docs-copy-btn" @click="copyDocument" :disabled="!documentContent" :class="{success:copied}">
              <svg v-if="!copied" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              {{ copied ? 'Copié !' : 'Copier' }}
            </button>
            <button class="docs-save-btn" @click="saveToHistory" :disabled="!documentContent">
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
          <div v-else class="docs-preview-text" style="white-space: pre-wrap; font-family: inherit;" v-html="documentContent"></div>
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
    <div v-if="templateToDelete" class="modal-overlay">
      <div class="modal-content" style="max-width: 400px; text-align: center;">
        <div style="width: 50px; height: 50px; background: #fee2e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <h3 style="font-size: 1.1rem; font-weight: 700; color: #1e293b; margin-bottom: 0.5rem;">Confirmer la suppression</h3>
        <p style="font-size: 0.85rem; color: #475569; margin-bottom: 1.5rem;">Êtes-vous sûr de vouloir supprimer ce modèle ? Cette action est irréversible.</p>
        <div style="display: flex; gap: 0.8rem; justify-content: center;">
          <button @click="cancelDelete" style="padding: 0.6rem 1.2rem; font-size: 0.85rem; border-radius: 8px; border: 1px solid #cbd5e1; background: white; color: #475569; cursor: pointer; font-weight: 500;">Annuler</button>
          <button @click="confirmDelete" style="padding: 0.6rem 1.2rem; font-size: 0.85rem; border-radius: 8px; border: none; background: #ef4444; color: white; cursor: pointer; font-weight: 600;">Oui, supprimer</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.docs-wrapper { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }

.docs-header {
  display: flex; align-items: center; gap: 1rem;
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
  display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start;
}
@media (max-width: 768px) { .docs-layout { grid-template-columns: 1fr; } }

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
.template-btn {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.85rem; border: 1.5px solid #e2e8f0;
  border-radius: 9px; background: white; cursor: pointer;
  transition: all 0.15s ease; font-size: 0.84rem; font-weight: 600; color: #334155;
  text-align: left;
}
.template-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
.template-btn.active { font-weight: 800; }
.template-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.docs-input {
  width: 100%; padding: 0.65rem 0.8rem; border: 1px solid #e2e8f0;
  border-radius: 8px; font-size: 0.84rem; font-family: inherit;
  transition: all 0.15s; box-sizing: border-box;
}
.docs-input:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }
.docs-textarea { resize: vertical; min-height: 80px; }

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
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.8rem 1rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
}
.docs-preview-body { padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1; background: #fefefe; }
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
