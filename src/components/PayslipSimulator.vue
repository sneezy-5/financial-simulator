<script setup>
import { ref, computed } from 'vue'

// ══════════════════════════════════════════════
// DONNÉES DE L'EMPLOYÉ
// ══════════════════════════════════════════════
const emp = ref({
  // Entreprise
  nom_entreprise: "Mon Entreprise",
  adresse: "Abidjan, Côte d'Ivoire",
  siege_social: "BINGERVILLE-CITEE FDFP-VILLA 67",
  email_entreprise: "infos@monentreprise.ci",
  tel_entreprise: "+225 0758474646",
  numero_cnps: '0001122',
  numero_contribuable: '025555',
  // Employé
  matricule: '00001',
  nom: '',
  prenom: '',
  poste: '',
  date_naissance: '1977-01-01',
  num_secu: '1770718XXXX',
  ville: 'ABIDJAN',
  categorie: 'I1',
  situation_matrimoniale: 'celibataire',
  nombre_enfants: 0,
  date_embauche: '',
  // Règlement
  mode_reglement: 'Virement',
  banque_compte: '01001 1234567890 00',
  banque_nom: 'XXXX',
  // Rémunération
  salaire_base: 0,
  heures_mensuelles: 173.33,
  sursalaire: 0,
  prime_transport: 30000,
  autres_primes: 0,
  primes_non_imposables: 0, 
  heures_sup_nb: 0,
  heures_sup_taux: 0,
  acompte: 0,
  avance: 0,
  opposition: 0,
  autres_retenues: 0,
  // CNPS paramétrable
  taux_at: 0.02, // Taux Accident du Travail (2% à 5% selon le secteur)
  ayants_droit_cmu: 0, // Nombre d'ayants droit CMU (conjoint + enfants < 21 ans)
  // Régime
  regime: '2024',
  // Période
  mois: new Date().getMonth() + 1,
  annee: new Date().getFullYear(),
})

const moisLabels = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

const generating = ref(false)
const generated = ref(false)
const downloadUrl = ref(null)
const errorMsg = ref(null)
const activeTab = ref('employe') // 'entreprise' | 'employe' | 'remuneration'

// ══════════════════════════════════════════════
// CALCULS EN TEMPS RÉEL
// ══════════════════════════════════════════════
const calc = computed(() => {
  const salaireBaseMensuel = +emp.value.salaire_base || 0
  const heuresMensuelles = +emp.value.heures_mensuelles || 173.33
  
  // Calcul du salaire de base effectif au prorata des heures
  const salaireBase = Math.round((salaireBaseMensuel / 173.33) * heuresMensuelles)
  
  const sursalaire = +emp.value.sursalaire || 0
  const primeTransport = +emp.value.prime_transport || 0
  // Primes IMPOSABLES : avantages en nature, primes diverses taxables
  const autresPrimes = +emp.value.autres_primes || 0
  // Indemnités NON-IMPOSABLES : responsabilité, logement, représentation, etc.
  const primesNonImposables = +emp.value.primes_non_imposables || 0
  const nbHeuresSup = +emp.value.heures_sup_nb || 0
  const tauxHeuresSup = +emp.value.heures_sup_taux || 0
  const montantHeuresSup = Math.round(nbHeuresSup * tauxHeuresSup)

  // Le brut imposable N'INCLUT PAS les primes non-imposables ni le transport
  const salaireBrut = salaireBase + sursalaire + autresPrimes + montantHeuresSup
  const brutImposable = salaireBrut  // = ce sur quoi portent IS, CN, CNPS, IGR

  // Charges fiscales employeur (sur brut imposable)
  const baseFiscale = brutImposable
  const impotEmployeur = Math.round(baseFiscale * 0.012)
  const fdfpTA = Math.round(baseFiscale * 0.004)
  const fdfpFPC = Math.round(baseFiscale * 0.006)
  const totalFiscalEmployeur = impotEmployeur + fdfpTA + fdfpFPC

  // Charges sociales employeur - Normes 2024
  const plafondCNPS = 3375000
  const baseCNPS = Math.min(brutImposable, plafondCNPS)
  const baseCNPS_PfAtAm = Math.min(brutImposable, 75000) // Plafond SMIG 2023 = 75 000
  const tauxAT = +emp.value.taux_at || 0.02
  const cnpsPF = Math.round(baseCNPS_PfAtAm * 0.05)       // 5% Prestations Familiales
  const cnpsAM = Math.round(baseCNPS_PfAtAm * 0.0075)     // 0.75% Assurance Maternité
  const cnpsAT = Math.round(baseCNPS_PfAtAm * tauxAT)     // 2-5% Accident Travail
  const cnpsRetraitePat = Math.round(baseCNPS * 0.077)     // 7.7% Retraite Patronale
  
  // CMU avec ayants droit
  const nbAyantsDroitCMU = Math.max(0, +emp.value.ayants_droit_cmu || 0)
  const cmuPat = 500 * (1 + nbAyantsDroitCMU)
  const totalSocialEmployeur = cnpsPF + cnpsAM + cnpsAT + cnpsRetraitePat + cmuPat
  const totalPatronal = totalFiscalEmployeur + totalSocialEmployeur

  // 4. Calculs Charges Salariales
  const cnpsSal = Math.round(baseCNPS * 0.063)
  
  let itsFinal = 0, ricf = 0
  let is = 0, cn = 0, igr = 0

  let n = Math.min(Number(emp.value.nombre_enfants) || 0, 4)
  let parts = 1
  const sit = String(emp.value.situation_matrimoniale || '').toLowerCase()

  if (sit.includes('mari')) {
    // Marié : Base 2 + 0.5 par enfant
    parts = 2 + (n * 0.5)
  } else if (sit.includes('veuf') || sit.includes('veuv')) {
    // Veuf : 1 part si sans enfant, sinon Base 2 + 0.5 par enfant (comme marié)
    parts = (n > 0) ? (2 + (n * 0.5)) : 1
  } else {
    // Célibataire, Divorcé : 1 part si sans enfant, sinon Base 1.5 + 0.5 par enfant
    parts = (n > 0) ? (1.5 + (n * 0.5)) : 1
  }
  parts = Math.min(parts, 5.0)

    if (emp.value.regime !== 'ancien') {
      // ---- RÉFORME 2024 (ITS UNIQUE) ----
      // L'utilisateur précise : "L’ITS est calculé sur le salaire brut imposable"
      const salImposable = brutImposable
      
      const tranches = [
        { plafond: 75000, taux: 0.00 },
        { plafond: 240000, taux: 0.16 },
        { plafond: 800000, taux: 0.21 },
        { plafond: 2400000, taux: 0.24 },
        { plafond: 8000000, taux: 0.28 },
        { plafond: Infinity, taux: 0.32 }
      ]
      
      let impotBrut = 0
      let prec = 0
      for (const { plafond, taux } of tranches) {
        if (salImposable <= prec) break
        impotBrut += (Math.min(salImposable, plafond) - prec) * taux
        prec = plafond
      }

      const itsBrut = Math.round(impotBrut)
      ricf = Math.max(0, (parts - 1) * 11000)
      itsFinal = Math.max(0, itsBrut - ricf)
    } else {
    // ---- ANCIENNE LOI (IS, CN, IGR) ----
    // On utilise l'abattement de 20% sur (Brut - CNPS - 80%) sur certaines versions, 
    // ou la formule standard classique.
    is = Math.round(brutImposable * 0.012)
    if (brutImposable > 50000) {
      if (brutImposable <= 130000) cn = Math.round((brutImposable - 50000) * 0.015)
      else if (brutImposable <= 200000) cn = 1200 + Math.round((brutImposable - 130000) * 0.05)
      else cn = 4700 + Math.round((brutImposable - 200000) * 0.10)
    }

    const baseIGR = (brutImposable - is - cn - cnpsSal) * 0.85
    const quotientFamilial = baseIGR / parts

    let igrParPart = 0
    if (quotientFamilial > 25000) {
      if (quotientFamilial <= 45583) igrParPart = (quotientFamilial - 25000) * 0.10
      else if (quotientFamilial <= 81666) igrParPart = (quotientFamilial * 0.15) - 2292
      else if (quotientFamilial <= 126666) igrParPart = (quotientFamilial * 0.20) - 6375
      else if (quotientFamilial <= 220833) igrParPart = (quotientFamilial * 0.25) - 12708
      else if (quotientFamilial <= 389166) igrParPart = (quotientFamilial * 0.35) - 34792
      else igrParPart = (quotientFamilial * 0.45) - 73708
    }
    igr = Math.max(0, Math.round(igrParPart * parts))
  }

  // CMU salariale avec ayants droit
  const cmuSal = 500 * (1 + nbAyantsDroitCMU)
  const acompte = +emp.value.acompte || 0
  const avance = +emp.value.avance || 0
  const opposition = +emp.value.opposition || 0
  const autresRetenues = +emp.value.autres_retenues || 0
  
  const impots = emp.value.regime !== 'ancien' ? itsFinal : (is + cn + igr)
  const totalRetenues = impots + cnpsSal + cmuSal + acompte + avance + opposition + autresRetenues

  const netIntermediaire = salaireBrut - totalRetenues
  const netAPayer = netIntermediaire + primeTransport + primesNonImposables

  // Détail des tranches pour l'affichage
  const detailTranches = []
  if (emp.value.regime !== 'ancien') {
    const salImposable = brutImposable
    const tranches = [
      { plafond: 75000, taux: 0.00 },
      { plafond: 240000, taux: 0.16 },
      { plafond: 800000, taux: 0.21 },
      { plafond: 2400000, taux: 0.24 },
      { plafond: 8000000, taux: 0.28 },
      { plafond: Infinity, taux: 0.32 }
    ]
    let prec = 0
    for (const { plafond, taux } of tranches) {
      if (salImposable <= prec) break
      const baseTranche = Math.min(salImposable, plafond) - prec
      const montantTranche = Math.round(baseTranche * taux)
      if (montantTranche > 0 || (taux === 0 && baseTranche > 0)) {
          detailTranches.push({ label: `Tranche ${taux * 100}%`, base: baseTranche, taux, montant: montantTranche })
      }
      prec = plafond
    }
  }

  return {
    salaireBase, salaireBaseMensuel, heuresMensuelles, sursalaire, primeTransport, autresPrimes, primesNonImposables, montantHeuresSup,
    salaireBrut, brutImposable, baseFiscale, baseCNPS, baseCNPS_PfAtAm, tauxAT, nbAyantsDroitCMU,
    parts,
    detailTranches, // Pour la transparence du calcul
    patronal: {
      impotEmployeur, fdfpTA, fdfpFPC, totalFiscal: totalFiscalEmployeur,
      cnpsPF, cnpsAM, cnpsAT, cnpsRetraite: cnpsRetraitePat, cmu: cmuPat,
      totalSocial: totalSocialEmployeur, grandTotal: totalPatronal
    },
    salarial: { 
      its: itsFinal, ricf, is, cn, igr, cnps: cnpsSal, cmu: cmuSal, 
      acompte, avance, opposition, autres: autresRetenues, 
      total: totalRetenues, regime: emp.value.regime 
    },
    baseTaxableITS: emp.value.regime !== 'ancien' ? brutImposable : 0,
    netAPayer
  }
})

// Calcul Inversé (Net à Brut) - Magie Mathématique
const calculerBrutDepuisNet = () => {
  const targetNet = prompt("Quel est le NET À PAYER que vous souhaitez atteindre ? (ex: 350000)")
  if (!targetNet || isNaN(targetNet)) return

  const objectif = parseFloat(targetNet)
  let brutTest = objectif
  let ecart = 100000
  let iterations = 0

  // Recherche par dichotomie/approche progressive
  while (Math.abs(ecart) > 1 && iterations < 100) {
    // Simuler un calcul rapide pour ce brutTest
    const baseCNPS = Math.min(brutTest, 3375000)
    const cnpsSal = Math.round(baseCNPS * 0.063)
    const cmuSal = 1000
    let impots = 0

    let n = Math.min(Number(emp.value.nombre_enfants) || 0, 4)
    let parts = 1
    const sit = String(emp.value.situation_matrimoniale || '').toLowerCase()

    if (sit.includes('mari')) {
      parts = 2 + (n * 0.5)
    } else if (sit.includes('veuf') || sit.includes('veuv')) {
      parts = (n > 0) ? (2 + (n * 0.5)) : 1
    } else {
      parts = (n > 0) ? (1.5 + (n * 0.5)) : 1
    }
    parts = Math.min(parts, 5.0)

    if (emp.value.regime !== 'ancien') {
      const salImposable = Math.max(0, brutTest - cnpsSal - cmuSal)
      const tranches = [
        { plafond: 75000, taux: 0.00 },
        { plafond: 240000, taux: 0.16 },
        { plafond: 800000, taux: 0.21 },
        { plafond: 2400000, taux: 0.24 },
        { plafond: 8000000, taux: 0.28 },
        { plafond: Infinity, taux: 0.32 }
      ]
      
      let impotBrut = 0
      let prec = 0
      for (const { plafond, taux } of tranches) {
        if (salImposable <= prec) break
        impotBrut += (Math.min(salImposable, plafond) - prec) * taux
        prec = plafond
      }

      const itsBrut = Math.round(impotBrut)
      let ricf = Math.max(0, (parts - 1) * 11000)
      impots = Math.max(0, itsBrut - ricf)
    } else {
      const isTest = Math.round(brutTest * 0.012)
      let cnTest = 0
      if (brutTest > 50000) {
        if (brutTest <= 130000) cnTest = Math.round((brutTest - 50000) * 0.015)
        else if (brutTest <= 200000) cnTest = 1200 + Math.round((brutTest - 130000) * 0.05)
        else cnTest = 4700 + Math.round((brutTest - 200000) * 0.10)
      }
      const baseIGR = (brutTest - isTest - cnTest - cnpsSal) * 0.85
      const qf = baseIGR / parts
      let igrParPart = 0
      if (qf > 25000) {
        if (qf <= 45583) igrParPart = (qf - 25000) * 0.10
        else if (qf <= 81666) igrParPart = (qf * 0.15) - 2292
        else if (qf <= 126666) igrParPart = (qf * 0.20) - 6375
        else if (qf <= 220833) igrParPart = (qf * 0.25) - 12708
        else if (qf <= 389166) igrParPart = (qf * 0.35) - 34792
        else igrParPart = (qf * 0.45) - 73708
      }
      impots = isTest + cnTest + Math.max(0, Math.round(igrParPart * parts))
    }

    const netTest = brutTest - (cnpsSal + impots + cmuSal) + emp.value.prime_transport + emp.value.primes_non_imposables - emp.value.autres_retenues

    ecart = objectif - netTest
    brutTest += ecart // Ajustement auto
    iterations++
  }

  if (emp.value.sursalaire > 0 || String(emp.value.salaire_base) !== "0") {
      const brutActuelHorsSursalaire = (+emp.value.salaire_base || 0) + (+emp.value.autres_primes || 0) + (+emp.value.montant_heures_sup || 0)
      if (Math.round(brutTest) > brutActuelHorsSursalaire) {
          emp.value.sursalaire = Math.round(brutTest) - brutActuelHorsSursalaire
      } else {
          emp.value.salaire_base = Math.round(brutTest)
          emp.value.sursalaire = 0
          emp.value.autres_primes = 0
      }
  } else {
      emp.value.salaire_base = Math.round(brutTest)
  }
}

// Formatter
const fcfa = (v) => {
  if (!v && v !== 0) return '0'
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

// ══════════════════════════════════════════════
// GÉNÉRATION PDF
// ══════════════════════════════════════════════
const generatePDF = async () => {
  if (!emp.value.nom || !emp.value.salaire_base) {
    errorMsg.value = 'Veuillez renseigner au moins le nom et le salaire de base.'
    return
  }
  generating.value = true
  errorMsg.value = null
  generated.value = false
  downloadUrl.value = null

  try {
    const response = await fetch('/api/rh/generate-single-payslip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee: emp.value })
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Erreur serveur')
    }

    const blob = await response.blob()
    downloadUrl.value = URL.createObjectURL(blob)
    generated.value = true
  } catch (e) {
    errorMsg.value = e.message
  } finally {
    generating.value = false
  }
}

const reset = () => {
  generated.value = false
  downloadUrl.value = null
  errorMsg.value = null
}

const tabs = [
  { id: 'entreprise', label: 'Entreprise', icon: '🏢' },
  { id: 'employe', label: 'Employé', icon: '👤' },
  { id: 'remuneration', label: 'Rémunération', icon: '💰' },
]
</script>

<template>
  <div class="paysim-wrapper">

    <!-- HEADER -->
    <div class="paysim-header">
      <div class="paysim-header-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      </div>
      <div>
        <h3>Simulation de Bulletin de Paie</h3>
        <p>Saisissez les données et visualisez le résultat en temps réel (Loi ivoirienne)</p>
      </div>
    </div>

    <div class="paysim-body">

      <!-- COLONNE GAUCHE: Formulaire -->
      <div class="paysim-form">

        <!-- Onglets -->
        <div class="form-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="form-tab"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            {{ tab.icon }} {{ tab.label }}
          </button>
        </div>

        <!-- ONGLET ENTREPRISE -->
        <div v-show="activeTab === 'entreprise'" class="tab-content">
          <div class="field-group">
            <label>Nom de l'entreprise</label>
            <input v-model="emp.nom_entreprise" type="text" placeholder="Ex: Côte d'Ivoire PAIE" />
          </div>
          <div class="field-group">
            <label>Adresse</label>
            <input v-model="emp.adresse" type="text" placeholder="Ex: Abidjan, Plateau" />
          </div>
          <div class="field-group">
            <label>Siège Social</label>
            <input v-model="emp.siege_social" type="text" placeholder="Ex: BINGERVILLE-CITEE FDFP-VILLA 67" />
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>E-mail Entreprise</label>
              <input v-model="emp.email_entreprise" type="email" placeholder="infos@entreprise.ci" />
            </div>
            <div class="field-group">
              <label>Téléphone Employeur</label>
              <input v-model="emp.tel_entreprise" type="text" placeholder="+225 ..." />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>N° CNPS</label>
              <input v-model="emp.numero_cnps" type="text" placeholder="Numéro CNPS" />
            </div>
            <div class="field-group">
              <label>N° Contribuable</label>
              <input v-model="emp.numero_contribuable" type="text" placeholder="N° Contribuable" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Mois de paie</label>
              <select v-model.number="emp.mois">
                <option v-for="m in 12" :key="m" :value="m">{{ moisLabels[m] }}</option>
              </select>
            </div>
            <div class="field-group">
              <label>Année</label>
              <input v-model.number="emp.annee" type="number" :min="2020" :max="2030" />
            </div>
          </div>
        </div>

        <!-- ONGLET EMPLOYÉ -->
        <div v-show="activeTab === 'employe'" class="tab-content">
          <div class="field-row">
            <div class="field-group">
              <label>Matricule</label>
              <input v-model="emp.matricule" type="text" placeholder="00001" />
            </div>
            <div class="field-group">
              <label>Catégorie</label>
              <input v-model="emp.categorie" type="text" placeholder="Ex: I1, M2" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Ville</label>
              <input v-model="emp.ville" type="text" placeholder="Ex: ABIDJAN" />
            </div>
            <div class="field-group">
              <label>N° SECU (Sociale)</label>
              <input v-model="emp.num_secu" type="text" placeholder="N° Sécurité Sociale" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Nom <span class="required">*</span></label>
              <input v-model="emp.nom" type="text" placeholder="NOM" />
            </div>
            <div class="field-group">
              <label>Prénom(s)</label>
              <input v-model="emp.prenom" type="text" placeholder="Prénoms" />
            </div>
          </div>
          <div class="field-group">
            <label>Poste / Fonction</label>
            <input v-model="emp.poste" type="text" placeholder="Ex: Responsable Comptable" />
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Situation familiale</label>
              <select v-model="emp.situation_matrimoniale">
                <option value="celibataire">Célibataire</option>
                <option value="marie">Marié(e)</option>
                <option value="divorce">Divorcé(e)</option>
                <option value="veuf">Veuf/Veuve</option>
              </select>
            </div>
            <div class="field-group">
              <label>Nombre d'enfants</label>
              <input v-model.number="emp.nombre_enfants" type="number" min="0" max="20" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Date d'embauche</label>
              <input v-model="emp.date_embauche" type="date" />
            </div>
            <div class="field-group">
              <label>Date de naissance</label>
              <input v-model="emp.date_naissance" type="date" />
            </div>
          </div>
          <div class="parts-badge">
            <span class="parts-label">Parts fiscales calculées :</span>
            <span class="parts-value">{{ calc.parts.toFixed(2) }}</span>
          </div>
        </div>

        <!-- ONGLET RÉMUNÉRATION -->
        <div v-show="activeTab === 'remuneration'" class="tab-content">
          <div class="field-row">
            <div class="field-group">
              <label>Régime Fiscal</label>
              <select v-model="emp.regime">
                <option value="2024">Nouvelle Réforme 2024 (ITS UNIQUE)</option>
                <option value="ancien">Ancienne Loi (IS, CN, IGR)</option>
              </select>
            </div>
          </div>

          <div class="separator-label">1. Éléments Imposables (Cotisables)</div>
          <div class="field-row">
            <div class="field-group">
              <label class="flex justify-between w-full">
                <span>Salaire de base (mensuel) <span class="required">*</span></span>
                <span @click="calculerBrutDepuisNet" class="text-xs text-blue-600 cursor-pointer font-bold hover:underline bg-blue-50 px-2 py-0.5 rounded shadow-sm">🪄 Calculer brut depuis Net</span>
              </label>
              <input v-model.number="emp.salaire_base" type="number" min="0" step="1" placeholder="Ex: 121682" />
            </div>
            <div class="field-group">
              <label>Sursalaire</label>
              <input v-model.number="emp.sursalaire" type="number" min="0" step="1" placeholder="Ex: 95178" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Autres Primes Imposables</label>
              <input v-model.number="emp.autres_primes" type="number" min="0" step="1" placeholder="Ex: Gratification..." />
            </div>
            <div class="field-group">
              <label>Heures travaillées (standard: 173.33)</label>
              <input v-model.number="emp.heures_mensuelles" type="number" min="0" step="0.01" />
            </div>
          </div>

          <div class="separator-label">2. Heures Supplémentaires</div>
          <div class="field-row">
            <div class="field-group">
              <label>Nombre d'heures</label>
              <input v-model.number="emp.heures_sup_nb" type="number" min="0" />
            </div>
            <div class="field-group">
              <label>Taux horaire (FCFA)</label>
              <input v-model.number="emp.heures_sup_taux" type="number" min="0" step="100" />
            </div>
          </div>

          <div class="separator-label">3. CNPS / Cotisations Sociales</div>
          <div class="field-row">
            <div class="field-group">
              <label>Taux Accident du Travail (AT)
                <span class="field-hint">Variable selon le secteur d'activité</span>
              </label>
              <select v-model.number="emp.taux_at">
                <option :value="0.02">2% — Bureau / Administration</option>
                <option :value="0.03">3% — Commerce / Services</option>
                <option :value="0.04">4% — Industrie / Transport</option>
                <option :value="0.05">5% — BTP / Mines / Risque élevé</option>
              </select>
            </div>
            <div class="field-group">
              <label>Ayants droit CMU
                <span class="field-hint">Conjoint sans emploi + enfants &lt;21 ans (max 6)</span>
              </label>
              <input v-model.number="emp.ayants_droit_cmu" type="number" min="0" max="7" placeholder="0" />
            </div>
          </div>

          <div class="separator-label">4. Indemnités Exonérées (Non Imposables)</div>
          <div class="field-row">
            <div class="field-group">
              <label>Prime de Transport</label>
              <input v-model.number="emp.prime_transport" type="number" min="0" step="1" placeholder="30000" />
            </div>
            <div class="field-group">
              <label>Autres Indemnités Non-Taxables</label>
              <input v-model.number="emp.primes_non_imposables" type="number" min="0" step="1" placeholder="Ex: Logement éxo..." />
            </div>
          </div>

          <div class="separator-label">5. Retenues Diverses & Paiement</div>
          <div class="field-row">
            <div class="field-group">
              <label>Acomptes (N° 900)</label>
              <input v-model.number="emp.acompte" type="number" min="0" step="1" />
            </div>
            <div class="field-group">
              <label>Avances (N° 910)</label>
              <input v-model.number="emp.avance" type="number" min="0" step="1" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Oppositions / Saisies (N° 920)</label>
              <input v-model.number="emp.opposition" type="number" min="0" step="1" />
            </div>
            <div class="field-group">
              <label>Autres Retenues</label>
              <input v-model.number="emp.autres_retenues" type="number" min="0" step="1" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Mode de Règlement</label>
              <select v-model="emp.mode_reglement">
                <option value="Virement">Virement</option>
                <option value="Espèces">Espèces</option>
                <option value="Chèque">Chèque</option>
              </select>
            </div>
          </div>
          <div class="field-row" v-if="emp.mode_reglement === 'Virement'">
            <div class="field-group">
              <label>Nom de la Banque</label>
              <input v-model="emp.banque_nom" type="text" placeholder="Ex: ECOBANK" />
            </div>
            <div class="field-group">
              <label>N° Compte / RIB</label>
              <input v-model="emp.banque_compte" type="text" placeholder="RIB" />
            </div>
          </div>
        </div>

        <!-- Navigation onglets -->
        <div class="tab-nav">
          <button v-if="activeTab !== 'entreprise'" class="tab-prev" @click="activeTab = tabs[tabs.findIndex(t => t.id === activeTab) - 1].id">
            ← Précédent
          </button>
          <button v-if="activeTab !== 'remuneration'" class="tab-next" @click="activeTab = tabs[tabs.findIndex(t => t.id === activeTab) + 1].id">
            Suivant →
          </button>
        </div>

      </div>

      <!-- COLONNE DROITE: Prévisualisation -->
      <div class="paysim-preview">
        <div class="preview-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Aperçu en temps réel — {{ moisLabels[emp.mois] }} {{ emp.annee }}
        </div>

        <!-- Mini bulletin -->
        <div class="bulletin-preview">

          <!-- En-tête bulletin -->
          <div class="bulletin-header">
            <div class="bulletin-company">
              <div class="company-name">{{ emp.nom_entreprise || 'Mon Entreprise' }}</div>
              <div class="company-details"><strong>ADRESSE :</strong> {{ emp.adresse }}</div>
              <div class="company-details"><strong>SIEGE SOCIAL :</strong> {{ emp.siege_social }}</div>
              <div v-if="emp.numero_cnps" class="company-details"><strong>N° CNPS :</strong> {{ emp.numero_cnps }}</div>
              <div v-if="emp.numero_contribuable" class="company-details"><strong>N° CONTRIBUABLE :</strong> {{ emp.numero_contribuable }}</div>
              <div class="company-details"><strong>E-mail :</strong> {{ emp.email_entreprise }}</div>
              <div class="company-details"><strong>TELEPHONE :</strong> {{ emp.tel_entreprise }}</div>
            </div>
            <div class="bulletin-title-block">
              <div class="bulletin-title-text">BULLETIN DE PAIE</div>
              <div class="bulletin-period">{{ moisLabels[emp.mois] }} {{ emp.annee }}</div>
              <div class="emp-info-grid">
                <div class="emp-info-row">
                  <span class="ei-label">Matricule</span>
                  <span class="ei-value">{{ emp.matricule || '—' }}</span>
                </div>
                <div class="emp-info-row">
                  <span class="ei-label">Nom</span>
                  <span class="ei-value">{{ emp.nom ? emp.nom.toUpperCase() : '—' }}</span>
                </div>
                <div class="emp-info-row">
                  <span class="ei-label">Prénom(s)</span>
                  <span class="ei-value">{{ emp.prenom || '—' }}</span>
                </div>
                <div class="emp-info-row">
                  <span class="ei-label">Poste</span>
                  <span class="ei-value">{{ emp.poste || '—' }}</span>
                </div>
                <div class="emp-info-row">
                  <span class="ei-label">Nbre de Part:</span>
                  <span class="ei-value highlight">{{ calc.parts.toFixed(2) }}</span>
                </div>
                <div class="emp-info-row">
                  <span class="ei-label">Date d'Embauche:</span>
                  <span class="ei-value">{{ emp.date_embauche || '—' }}</span>
                </div>
                <div class="emp-info-row">
                  <span class="ei-label">Date de Naissance:</span>
                  <span class="ei-value">{{ emp.date_naissance || '—' }}</span>
                </div>
                <div class="emp-info-row">
                  <span class="ei-label">Ville:</span>
                  <span class="ei-value">{{ emp.ville || '—' }}</span>
                </div>
                <div class="emp-info-row">
                  <span class="ei-label">N° SECU:</span>
                  <span class="ei-value">{{ emp.num_secu || '—' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Tableau Professionnel 10 Colonnes -->
          <div class="table-container-responsive">
            <table class="bulletin-table professional-layout">
              <thead>
                <tr>
                  <th rowspan="2">N°</th>
                  <th rowspan="2">DÉSIGNATION</th>
                  <th rowspan="2">NBR</th>
                  <th rowspan="2">BASE</th>
                  <th colspan="2" class="text-center">GAINS</th>
                  <th colspan="2" class="text-center">SALARIAL</th>
                  <th colspan="2" class="text-center">PATRONAL</th>
                </tr>
                <tr>
                  <th class="text-right text-xs">Taux</th>
                  <th class="text-right text-xs">Montant</th>
                  <th class="text-right text-xs">Taux</th>
                  <th class="text-right text-xs">Retenue</th>
                  <th class="text-right text-xs">Taux</th>
                  <th class="text-right text-xs">Retenue</th>
                </tr>
              </thead>
              <tbody>
                <!-- Section Gains -->
                <tr v-if="calc.salaireBase > 0">
                  <td class="text-center">380</td>
                  <td>Salaire de base</td>
                  <td class="text-center">{{ calc.heuresMensuelles }}</td>
                  <td class="text-right">{{ fcfa(emp.salaire_base) }}</td>
                  <td class="text-right">100%</td>
                  <td class="text-right text-mono gain">{{ fcfa(calc.salaireBase) }}</td>
                  <td></td><td></td><td></td><td></td>
                </tr>
                <tr v-if="calc.sursalaire > 0">
                  <td class="text-center">385</td>
                  <td>Sursalaire</td>
                  <td></td><td></td><td></td>
                  <td class="text-right text-mono gain">{{ fcfa(calc.sursalaire) }}</td>
                  <td></td><td></td><td></td><td></td>
                </tr>
                <tr v-if="calc.autresPrimes > 0">
                  <td class="text-center">395</td>
                  <td>Primes imposables</td>
                  <td></td><td></td><td></td>
                  <td class="text-right text-mono gain">{{ fcfa(calc.autresPrimes) }}</td>
                  <td></td><td></td><td></td><td></td>
                </tr>
                <tr v-if="calc.montantHeuresSup > 0">
                  <td class="text-center">315</td>
                  <td>Heures Supplémentaires</td>
                  <td></td><td></td><td></td>
                  <td class="text-right text-mono gain">{{ fcfa(calc.montantHeuresSup) }}</td>
                  <td></td><td></td><td></td><td></td>
                </tr>
                <tr class="row-total bg-gray-50">
                  <td></td>
                  <td><strong>TOTAL BRUT</strong></td>
                  <td></td><td></td><td></td>
                  <td class="text-right text-mono"><strong>{{ fcfa(calc.salaireBrut) }}</strong></td>
                  <td></td><td></td><td></td><td></td>
                </tr>

                <!-- Section Impôts Salariaux (ITS 2024 ou Ancien) -->
                <template v-if="calc.salarial.regime !== 'ancien'">
                  <tr>
                    <td class="text-center">405</td>
                    <td>ITS (IMPÔT UNIQUE 2024)</td>
                    <td></td>
                    <td class="text-right">{{ fcfa(calc.baseTaxableITS) }}</td>
                    <td></td><td></td>
                    <td></td>
                    <td class="text-right text-mono retenue">{{ fcfa(calc.salarial.its + calc.salarial.ricf) }}</td>
                    <td></td><td></td>
                  </tr>
                  <tr v-if="calc.salarial.ricf > 0">
                    <td class="text-center">406</td>
                    <td class="italic text-green-600">Réduction RICF ({{ calc.parts }} parts)</td>
                    <td></td><td></td><td></td><td></td>
                    <td></td>
                    <td class="text-right text-mono text-green-600">- {{ fcfa(calc.salarial.ricf) }}</td>
                    <td></td><td></td>
                  </tr>
                  <tr class="bg-blue-50/30">
                    <td class="text-center">412</td>
                    <td>Impôts Patronaux (TA / FPC)</td>
                    <td></td>
                    <td class="text-right">{{ fcfa(calc.brutImposable) }}</td>
                    <td></td><td></td><td></td><td></td>
                    <td class="text-right">2.20%</td>
                    <td class="text-right text-mono patronal-val">{{ fcfa(calc.patronal.totalFiscal) }}</td>
                  </tr>
                </template>
                <template v-else>
                  <!-- Ancien modèle affiché dans le nouveau tableau -->
                  <tr>
                    <td class="text-center">405</td>
                    <td>Retenue I.S (Salarié + Patronal)</td>
                    <td></td>
                    <td class="text-right">{{ fcfa(calc.brutImposable) }}</td>
                    <td></td><td></td>
                    <td class="text-right">1.20%</td>
                    <td class="text-right text-mono retenue">{{ fcfa(calc.salarial.is) }}</td>
                    <td class="text-right">1.20%</td>
                    <td class="text-right text-mono patronal-val">{{ fcfa(calc.patronal.impotEmployeur) }}</td>
                  </tr>
                  <!-- ... autres lignes ancien modèle ... -->
                </template>

                <!-- Section Sociale -->
                <tr>
                  <td class="text-center">430</td>
                  <td>C.M.U (COUVERTURE MALADIE)</td>
                  <td class="text-center">{{ (1 + calc.nbAyantsDroitCMU) }}</td>
                  <td class="text-right">{{ fcfa((1 + calc.nbAyantsDroitCMU) * 1000) }}</td>
                  <td></td><td></td>
                  <td class="text-right">50.0%</td>
                  <td class="text-right text-mono retenue">{{ fcfa(calc.salarial.cmu) }}</td>
                  <td class="text-right">50.0%</td>
                  <td class="text-right text-mono patronal-val">{{ fcfa(calc.patronal.cmu) }}</td>
                </tr>
                <tr>
                  <td class="text-center">454</td>
                  <td>C.N.P.S (RETRAITE)</td>
                  <td></td>
                  <td class="text-right">{{ fcfa(calc.baseCNPS) }}</td>
                  <td></td><td></td>
                  <td class="text-right">6.30%</td>
                  <td class="text-right text-mono retenue">{{ fcfa(calc.salarial.cnps) }}</td>
                  <td class="text-right">7.70%</td>
                  <td class="text-right text-mono patronal-val">{{ fcfa(calc.patronal.cnpsRetraite) }}</td>
                </tr>
                <tr>
                  <td class="text-center">450</td>
                  <td>C.N.P.S (PREST. FAMILIALES)</td>
                  <td></td>
                  <td class="text-right">{{ fcfa(calc.baseCNPS_PfAtAm) }}</td>
                  <td></td><td></td><td></td><td></td>
                  <td class="text-right">5.00%</td>
                  <td class="text-right text-mono patronal-val">{{ fcfa(calc.patronal.cnpsPF) }}</td>
                </tr>
                <tr>
                  <td class="text-center">451</td>
                  <td>C.N.P.S (ASSURANCE MATERNITÉ)</td>
                  <td></td>
                  <td class="text-right">{{ fcfa(calc.baseCNPS_PfAtAm) }}</td>
                  <td></td><td></td><td></td><td></td>
                  <td class="text-right">0.75%</td>
                  <td class="text-right text-mono patronal-val">{{ fcfa(calc.patronal.cnpsAM) }}</td>
                </tr>
                <tr>
                  <td class="text-center">452</td>
                  <td>C.N.P.S (ACCIDENT TRAVAIL)</td>
                  <td></td>
                  <td class="text-right">{{ fcfa(calc.baseCNPS_PfAtAm) }}</td>
                  <td></td><td></td><td></td><td></td>
                  <td class="text-right">{{ (calc.tauxAT * 100).toFixed(2) }}%</td>
                  <td class="text-right text-mono patronal-val">{{ fcfa(calc.patronal.cnpsAT) }}</td>
                </tr>
                
                <tr v-if="calc.salarial.acompte > 0">
                  <td class="text-center">900</td>
                  <td>ACOMPTES SUR PAIE</td>
                  <td></td><td></td><td></td><td></td>
                  <td></td><td class="text-right text-mono retenue">{{ fcfa(calc.salarial.acompte) }}</td>
                  <td></td><td></td>
                </tr>
                <tr v-if="calc.salarial.avance > 0">
                  <td class="text-center">910</td>
                  <td>AVANCES / PRÊTS</td>
                  <td></td><td></td><td></td><td></td>
                  <td></td><td class="text-right text-mono retenue">{{ fcfa(calc.salarial.avance) }}</td>
                  <td></td><td></td>
                </tr>
                <tr v-if="calc.salarial.opposition > 0">
                  <td class="text-center">920</td>
                  <td>OPPOSITIONS / SAISIES</td>
                  <td></td><td></td><td></td><td></td>
                  <td></td><td class="text-right text-mono retenue">{{ fcfa(calc.salarial.opposition) }}</td>
                  <td></td><td></td>
                </tr>
                <tr v-if="calc.salarial.autres > 0">
                  <td class="text-center">950</td>
                  <td>AUTRES RETENUES DIVERSES</td>
                  <td></td><td></td><td></td><td></td>
                  <td></td><td class="text-right text-mono retenue">{{ fcfa(calc.salarial.autres) }}</td>
                  <td></td><td></td>
                </tr>

                <tr class="row-total bg-gray-100">
                  <td></td>
                  <td><strong>TOTAL DES COTISATIONS</strong></td>
                  <td></td><td></td><td></td><td></td>
                  <td></td><td class="text-right text-mono"><strong>{{ fcfa(calc.salarial.total) }}</strong></td>
                  <td></td><td class="text-right text-mono"><strong>{{ fcfa(calc.patronal.grandTotal) }}</strong></td>
                </tr>

                <!-- Indemnités Exo -->
                <tr v-if="calc.primeTransport > 0">
                  <td class="text-center">630</td>
                  <td>Indemnité de Transport (EXO)</td>
                  <td></td><td></td><td></td>
                  <td class="text-right text-mono gain">{{ fcfa(calc.primeTransport) }}</td>
                  <td></td><td></td><td></td><td></td>
                </tr>
                <tr v-if="calc.primesNonImposables > 0">
                  <td class="text-center">640</td>
                  <td>Indemnités non-imposables</td>
                  <td></td><td></td><td></td>
                  <td class="text-right text-mono gain">{{ fcfa(calc.primesNonImposables) }}</td>
                  <td></td><td></td><td></td><td></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pied bulletin -->
          <div class="bulletin-footer">
            <div class="footer-cumul">
              <div class="cumul-title">Cumul de paie</div>
              <div class="cumul-row">
                <span>C.N</span><span>{{ fcfa(calc.salarial.cn) }}</span>
              </div>
              <div class="cumul-row">
                <span>I.G.R</span><span>{{ fcfa(calc.salarial.igr) }}</span>
              </div>
              <div class="cumul-row">
                <span>C.N.P.S Salarié</span><span>{{ fcfa(calc.salarial.cnps) }}</span>
              </div>
              <div class="cumul-row">
                <span>Brut Imposable</span><span>{{ fcfa(calc.brutImposable) }}</span>
              </div>
              <div class="cumul-row patron-total">
                <span>Total Patronal</span><span>{{ fcfa(calc.patronal.grandTotal) }}</span>
              </div>
            </div>
            <div class="footer-net">
              <div class="net-row">
                <span>GAINS TOTAUX</span>
                <span>{{ fcfa(calc.salaireBrut + calc.primeTransport + calc.primesNonImposables) }}</span>
              </div>
              <div class="net-row">
                <span>RETENUES</span>
                <span>{{ fcfa(calc.salarial.total) }}</span>
              </div>
              <div class="net-final">
                <span>NET À PAYER</span>
                <span class="net-amount">{{ fcfa(calc.netAPayer) }} FCFA</span>
              </div>
              <div class="payment-info">
                <div class="payment-title">REGLEMENT : {{ emp.mode_reglement }}</div>
                <div class="payment-details">
                   <span class="bank-name">{{ emp.banque_nom }}</span>
                   <span class="bank-acc">{{ emp.banque_compte }}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- Bouton génération -->
        <div class="generate-section">
          <div v-if="errorMsg" class="error-alert">
            ⚠️ {{ errorMsg }}
          </div>

          <div v-if="generated" class="success-alert">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Bulletin généré avec succès !
            <a :href="downloadUrl" :download="`bulletin_${emp.nom || 'employe'}_${emp.mois}_${emp.annee}.pdf`" class="dl-link">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Télécharger le PDF
            </a>
            <button class="btn-reset-small" @click="reset">Nouveau bulletin</button>
          </div>

          <button v-else class="btn-generate" :disabled="generating" @click="generatePDF">
            <span v-if="generating">
              <svg class="spin-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Génération en cours...
            </span>
            <span v-else>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Générer le PDF
            </span>
          </button>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.paysim-wrapper {
  background: white;
  border-radius: 16px;
  overflow: hidden;
}

.paysim-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
  color: white;
}
.paysim-header-icon {
  width: 48px; height: 48px;
  background: rgba(255,255,255,0.15);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.paysim-header h3 { margin: 0; font-size: 1.1rem; font-weight: 700; }
.paysim-header p { margin: 0.2rem 0 0; font-size: 0.8rem; opacity: 0.8; }

.paysim-body {
  display: grid;
  grid-template-columns: minmax(300px, 360px) 1fr;
  min-height: 580px;
}

/* FORMULAIRE */
.paysim-form {
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
}

.form-tabs {
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  background: white;
}
.form-tab {
  flex: 1;
  padding: 0.75rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  border: none;
  background: none;
  cursor: pointer;
  color: #64748b;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.form-tab.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  background: #f0f7ff;
}

.tab-content {
  padding: 1.25rem;
  flex: 1;
  overflow-y: auto;
  max-height: 440px;
}

.field-group { margin-bottom: 0.9rem; }
.field-group label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.3rem;
}
.required { color: #ef4444; }
.field-group input,
.field-group select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.875rem;
  background: white;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.field-group input:focus,
.field-group select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
.field-hint {
  display: block;
  font-size: 0.7rem;
  color: #6b7280;
  margin-top: 0.2rem;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0;
}
.field-row .field-group { margin-bottom: 0.9rem; }

.separator-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0.75rem 0 0.5rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid #e2e8f0;
}

.hs-result {
  padding: 0.5rem 0.75rem;
  background: #eff6ff;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #1d4ed8;
  margin-top: -0.5rem;
}

.tax-info-box {
  margin-top: 0.5rem;
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 0.75rem;
  line-height: 1.4;
}
.tax-info-box.imposable { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.tax-info-box.non-imposable { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }

.tax-badge {
  display: inline-block;
  font-weight: 800;
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  margin-right: 0.4rem;
}
.tax-badge.imposable { background: #ef4444; color: white; }
.tax-badge.non-imposable { background: #22c55e; color: white; }

.badge-imposable, .badge-non-imposable {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  margin-left: 0.5rem;
  vertical-align: middle;
}
.badge-imposable { background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; }
.badge-non-imposable { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }

.parts-badge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.75rem;
  background: linear-gradient(135deg, #fef3c7, #fffbeb);
  border: 1px solid #fcd34d;
  border-radius: 8px;
  margin-top: 0.5rem;
}
.parts-label { font-size: 0.8rem; color: #92400e; font-weight: 600; }
.parts-value { font-size: 1.1rem; font-weight: 800; color: #d97706; }

.tab-nav {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid #e2e8f0;
  background: white;
  gap: 0.5rem;
}
.tab-prev, .tab-next {
  padding: 0.5rem 1rem;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1.5px solid #2563eb;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  flex: 1;
}
.tab-prev { background: white; color: #2563eb; }
.tab-prev:hover { background: #eff6ff; }
.tab-next { background: #2563eb; color: white; margin-left: auto; }
.tab-next:hover { background: #1d4ed8; }

/* PRÉVISUALISATION */
.paysim-preview {
  padding: 1.25rem;
  overflow-y: auto;
  background: white;
}

.preview-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #2563eb;
  margin-bottom: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* MINI BULLETIN */
.bulletin-preview {
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  font-size: 0.72rem;
  background: #fff;
  margin-bottom: 1rem;
}

.bulletin-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding: 0.75rem;
  border-bottom: 1.5px solid #e2e8f0;
  background: #f8fafc;
}
.company-name { font-weight: 800; font-size: 0.85rem; color: #1e40af; }
.company-details { color: #6b7280; font-size: 0.7rem; margin-top: 0.15rem; }

.bulletin-title-block { text-align: right; }
.bulletin-title-text {
  font-weight: 800;
  font-size: 0.85rem;
  background: #e2e8f0;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  display: inline-block;
}
.bulletin-period { color: #64748b; font-size: 0.7rem; margin-top: 0.25rem; margin-bottom: 0.5rem; }

.emp-info-grid { text-align: left; }
.emp-info-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.15rem;
}
.ei-label { color: #6b7280; min-width: 90px; font-size: 0.68rem; }
.ei-value { font-weight: 600; font-size: 0.72rem; }
.ei-value.highlight { background: #fef08a; padding: 0 2px; border-radius: 2px; }

/* Tableau bulletin */
.bulletin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  margin-bottom: 1.5rem;
}
.professional-layout th {
  background: #f1f5f9;
  color: #1e293b;
  font-weight: 800;
  text-transform: uppercase;
  font-size: 0.65rem;
  padding: 0.4rem 0.2rem;
  border: 1px solid #cbd5e1;
}
.professional-layout td {
  padding: 0.35rem 0.2rem;
  border: 1px solid #e2e8f0;
  font-size: 0.7rem;
}
.professional-layout .text-mono {
  font-family: 'Courier New', Courier, monospace;
}
.professional-layout .patronal-val {
  color: #64748b;
  font-style: italic;
}
.professional-layout .row-total {
  font-size: 0.75rem;
}
.table-container-responsive {
  width: 100%;
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  margin-bottom: 1rem;
}
.professional-layout {
  min-width: 650px; /* Force minimum width to prevent squashing */
}
.bulletin-table th {
  background: #e2e8f0;
  padding: 0.35rem 0.5rem;
  font-weight: 700;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 1px solid #cbd5e1;
}
.bulletin-table td {
  padding: 0.25rem 0.5rem;
  border: 1px solid #f1f5f9;
  font-size: 0.68rem;
}
.bulletin-table tr:hover td { background: #f8fafc; }
.text-right { text-align: right; }
.text-mono { font-family: 'Courier New', monospace; }
.text-muted { color: #94a3b8; }
.gain { color: #16a34a; font-weight: 600; }
.retenue { color: #dc2626; font-weight: 600; }

.row-total td {
  background: #fef9c3 !important;
  font-weight: 700;
  border-top: 1.5px solid #e2e8f0 !important;
  border-bottom: 1.5px solid #e2e8f0 !important;
}
.row-separator td { padding: 0.1rem; background: #f8fafc !important; }
.row-patron-header td {
  background: #f1f5f9 !important;
  color: #64748b;
  font-size: 0.65rem;
  font-style: italic;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

/* Footer bulletin */
.bulletin-footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  padding: 0.75rem;
  border-top: 1.5px solid #e2e8f0;
  background: #f8fafc;
}
.cumul-title {
  font-weight: 700;
  font-size: 0.7rem;
  text-transform: uppercase;
  color: #374151;
  margin-bottom: 0.35rem;
}
.cumul-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  padding: 0.15rem 0;
  border-bottom: 1px dashed #e2e8f0;
}
.patron-total { color: #7c3aed; font-weight: 700; }

.footer-net { display: flex; flex-direction: column; gap: 0.25rem; justify-content: center; }
.net-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  padding: 0.25rem 0.5rem;
  background: #f1f5f9;
  border-radius: 4px;
}
.net-final {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #ffff00;
  border: 1.5px solid #000;
  border-radius: 4px;
  font-weight: 800;
}
.net-amount { font-size: 0.9rem; color: #000; }

.payment-info {
  margin-top: 0.5rem;
  border: 1.5px solid #000;
  border-radius: 4px;
  background: #ffff00;
  padding: 0.3rem 0.5rem;
  color: #000;
}
.payment-title {
  text-align: center;
  font-weight: 800;
  border-bottom: 2px solid #000;
  padding-bottom: 0.2rem;
  margin-bottom: 0.2rem;
  font-size: 0.75rem;
}
.payment-details {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  font-weight: 700;
  padding-top: 0.2rem;
}
.bank-name { text-transform: uppercase; }
.bank-acc { font-family: monospace; }

/* Bouton génération */
.generate-section { margin-top: 0.75rem; }

.btn-generate {
  width: 100%;
  padding: 0.875rem;
  background: linear-gradient(135deg, #1e3a5f, #2563eb);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}
.btn-generate:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
}
.btn-generate:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

.error-alert {
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  border-radius: 8px;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
.success-alert {
  padding: 0.75rem 1rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  border-radius: 8px;
  font-size: 0.85rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.dl-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  background: #16a34a;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.8rem;
}
.dl-link:hover { background: #15803d; }
.btn-reset-small {
  background: none;
  border: none;
  text-decoration: underline;
  color: #166534;
  cursor: pointer;
  font-size: 0.8rem;
}

.spin-icon { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 800px) {
  .paysim-body { grid-template-columns: 1fr; }
  .paysim-form { border-right: none; border-bottom: 1px solid #e2e8f0; }
  .tab-content { max-height: 300px; }
}
</style>
