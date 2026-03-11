<script setup>
import { ref, computed } from 'vue'

// ══════════════════════════════════════════════
// DONNÉES MINIMALES REQUISES
// ══════════════════════════════════════════════
const emp = ref({
  // Identité
  nom: '',
  prenom: '',
  poste: '',
  nom_entreprise: '',
  // Contrat
  type_contrat: 'cdi',
  statut_pro: 'employe_mensuel', // 'employe_horaire', 'employe_mensuel', 'cadre'
  motif_rupture: 'licenciement',
  date_embauche: '',
  // Salaire
  salaire_de_base: 0,
  sursalaire_primes: 0,
  // Congés
  date_dernier_retour_conge: '', // Pour calculer auto depuis quand il travaille non stop
  // Gratification (13e mois)
  droit_gratification: false,
  base_gratification: '100_base', // '100_base', '75_base', '100_brut', '75_net', 'forfait'
  nombre_mois_gratification: 1, // Jusqu'à 3 mois
  salaire_net_mensuel: 0,
  montant_forfait_gratification: 0,
  // Préavis
  preavis_mois_effectues: -1,  // -1 = not set yet (défaut = préavis complet effectué)
  preavis_mois_contrat: 0,     // Dépassement contractuel
  avances_impayees: 0,
  arrieres_salaire: 0,
})

// ══════════════════════════════════════════════
// CALCULS AUTOMATIQUES COMPLETS
// ══════════════════════════════════════════════
const calc = computed(() => {
  const de = emp.value.date_embauche ? new Date(emp.value.date_embauche) : null
  const ds = emp.value.date_sortie ? new Date(emp.value.date_sortie) : new Date()
  if (!de || (!emp.value.salaire_de_base && !emp.value.sursalaire_primes)) return null

  // Selon le Code du Travail CI, l'Indemnité de Licenciement et les Congés se calculent sur le Salaire Moyen Global (Brut)
  const brut = (+emp.value.salaire_de_base || 0) + (+emp.value.sursalaire_primes || 0);
  const salaireDeBase = +emp.value.salaire_de_base || 0;

  // ─── ANCIENNETÉ ────────────────────────────
  let moisTotal = (ds.getFullYear() - de.getFullYear()) * 12 + (ds.getMonth() - de.getMonth());
  if (ds.getDate() < de.getDate()) {
    moisTotal--;
  }
  moisTotal = Math.max(0, moisTotal);
  const ans = Math.floor(moisTotal / 12);
  const moisResto = moisTotal % 12;

  // ─── PREVIS ────────────────────────────────
  // Art. 16.11 : < 1 an = 8 jours, 1-5 ans = 1 mois, > 5 ans = 2 mois
  const motif = emp.value.motif_rupture
  const estLicenciement = ['licenciement', 'commun_accord', 'deces', 'force_majeure'].includes(motif)
  const estRetraite = motif === 'retraite'
  const estDemission = motif === 'demission'
  const estFinCDD = motif === 'fin_cdd' && emp.value.type_contrat === 'cdd'
  
  let preavisMois = 0; // On stocke en fraction de mois pour calculer * brut
  let preavisLabel = '';
  if (emp.value.type_contrat === 'cdi') {
    if (emp.value.statut_pro === 'cadre') {
        preavisMois = 3; preavisLabel = '3 mois'; // La CI donne 3 mois en standard pour cadres (parfois 4+ ou 6, mais 3 est la base)
    } 
    else if (emp.value.statut_pro === 'employe_mensuel') {
        if (ans < 6)       { preavisMois = 1; preavisLabel = '1 mois'; }
        else if (ans < 11) { preavisMois = 2; preavisLabel = '2 mois'; }
        else if (ans < 16) { preavisMois = 3; preavisLabel = '3 mois'; }
        else               { preavisMois = 4; preavisLabel = '4 mois'; }
    } 
    else if (emp.value.statut_pro === 'employe_horaire') {
        if (moisTotal < 6) { preavisMois = 8/30;  preavisLabel = '8 jours'; }
        else if (ans < 1)  { preavisMois = 15/30; preavisLabel = '15 jours'; }
        else if (ans < 6)  { preavisMois = 1;     preavisLabel = '1 mois'; }
        else if (ans < 11) { preavisMois = 2;     preavisLabel = '2 mois'; }
        else if (ans < 16) { preavisMois = 3;     preavisLabel = '3 mois'; }
        else               { preavisMois = 4;     preavisLabel = '4 mois'; }
    }
  }

  // Durée de préavis finale : max(legal, contrat)
  const preavisContractuel = +emp.value.preavis_mois_contrat || 0;
  if (preavisContractuel > preavisMois) {
    preavisMois = preavisContractuel;
    preavisLabel = `${preavisContractuel} mois`;
  }
  const preavisMoisTotal = preavisMois;

  // Mois effectués par le salarié (par défaut = total => pas de reliquat)
  const moisEffectues = emp.value.preavis_mois_effectues === -1 
    ? preavisMoisTotal   // Non encore touché : 100% effectué par défaut
    : Math.min(+emp.value.preavis_mois_effectues || 0, preavisMoisTotal);
  const preavisMoisReliquat = Math.max(0, preavisMoisTotal - moisEffectues);

  let preavisDeduction = false;
  let preavisPayable = false;

  if (preavisMoisReliquat > 0) {
      if (estLicenciement || estRetraite) preavisPayable = true;
      else if (estDemission) preavisDeduction = true;
  }

  const montantPreavis = Math.round(brut * preavisMoisReliquat);
  const preavisApplique = preavisPayable || preavisDeduction;

  // ─── CONGÉS PAYÉS (Calcul 100% Automatique) ─────────────
  // Droit local CI : 2.2 jours ouvrables par mois effectif
  // On calcule *exactement* depuis la date d'embauche ou du DERNIER RETOUR DE CONGÉ
  const dateDebutReferenceConge = emp.value.date_dernier_retour_conge 
    ? new Date(emp.value.date_dernier_retour_conge) 
    : new Date(de);

  // Sécurité si retour de congé > sortie
  if (dateDebutReferenceConge > ds) dateDebutReferenceConge.setTime(ds.getTime());

  let moisPeriode = (ds.getFullYear() - dateDebutReferenceConge.getFullYear()) * 12 + (ds.getMonth() - dateDebutReferenceConge.getMonth());
  let joursFractionConge = ds.getDate() - dateDebutReferenceConge.getDate();
  
  if (joursFractionConge < 0) {
      moisPeriode--;
      joursFractionConge += 30; // Approx pour la mensualisation
  }
  // En CI, plus de 15 jours travaillés le mois de rupture équivaut à un mois entier pour les congés
  if (joursFractionConge >= 15) moisPeriode++;
  moisPeriode = Math.max(0, moisPeriode);
  
  // Total des jours
  const totalJoursCP = Math.round(moisPeriode * 2.2 * 10) / 10;
  
  // Base 26.4 jours par an = 1 mois de salaire 
  const salJour = brut / 26.4; 
  const montantConges = Math.round(totalJoursCP * salJour);

  // ─── INDEMNITÉ DE LICENCIEMENT / RETRAITE ──
  // Décret N° 96-201 Code Travail CI
  // 1-5 ans: 30%, 6-10 ans: 35%, >10 ans: 40%
  let montantIndemnite = 0
  if (emp.value.type_contrat === 'cdi' && (estLicenciement || estRetraite) && moisTotal >= 12) {
    for (let a = 1; a <= ans; a++) {
      if (a <= 5)       montantIndemnite += brut * 0.30
      else if (a <= 10) montantIndemnite += brut * 0.35
      else              montantIndemnite += brut * 0.40
    }
    // Prorata mois partiels
    const tauxDernier = (ans + 1) <= 5 ? 0.30 : (ans + 1) <= 10 ? 0.35 : 0.40
    if (moisResto > 0) montantIndemnite += brut * tauxDernier * (moisResto / 12)
    montantIndemnite = Math.round(montantIndemnite)
  }

  // ─── INDEMNITÉ FIN DE CDD ──────────────────
  // Art. 14.5 : 3% du total des salaires versés
  let montantFinCDD = 0
  if (estFinCDD) {
    montantFinCDD = Math.round(brut * moisTotal * 0.03)
  }

  // ─── GRATIFICATION (13E MOIS) PRORATISÉE ─────────────
  // De janvier à la date de sortie
  const moisDepuis1erJanvier = ds.getMonth() + 1; // 1 à 12
  let montant13e = 0;
  let labelGratif = '';

  if (emp.value.droit_gratification) {
    let baseCalcul = salaireDeBase;
    
    if (emp.value.base_gratification === '100_base') {
        baseCalcul = salaireDeBase;
        labelGratif = '100% Salaire de Base';
    } else if (emp.value.base_gratification === '75_base') {
        baseCalcul = salaireDeBase * 0.75;
        labelGratif = '75% Salaire de Base';
    } else if (emp.value.base_gratification === '100_brut') {
        baseCalcul = brut;
        labelGratif = '100% Salaire Brut Global';
    } else if (emp.value.base_gratification === '75_net') {
        baseCalcul = (+emp.value.salaire_net_mensuel || 0) * 0.75;
        labelGratif = '75% du Salaire Net';
    } else if (emp.value.base_gratification === 'forfait') {
        baseCalcul = +emp.value.montant_forfait_gratification || 0;
        labelGratif = 'Forfait personnalisé';
    }
    
    let nbMois = (emp.value.base_gratification === 'forfait') ? 1 : (+emp.value.nombre_mois_gratification || 1);
    let baseAnnuelle = baseCalcul * nbMois;
    if (nbMois > 1) labelGratif += ` (×${nbMois} mois)`;

    // Prorata temporis (ex: part du 13e mois pour 3 mois)
    montant13e = Math.round(baseAnnuelle * (moisDepuis1erJanvier / 12));
  }

  // ─── ARRIÉRÉS DE SALAIRES ──────────────────
  const arrieres = Math.max(0, +emp.value.arrieres_salaire || 0);

  // ─── TOTAUX ────────────────────────────────
  let totalBrut = montantConges + montantIndemnite + montantFinCDD + montant13e + arrieres;
  if (preavisPayable) totalBrut += montantPreavis;

  const avances = Math.max(0, +emp.value.avances_impayees || 0);
  let totaleRetenues = avances;
  if (preavisDeduction) totaleRetenues += montantPreavis;
  
  const net = Math.max(0, totalBrut - totaleRetenues);

  // ─── LIGNES DÉTAILLÉES ─────────────────────
  const lignes = []

  const formatLoiPreavis = (mois) => mois === 8/30 ? 8 : (mois === 15/30 ? 15 : mois);

  if (preavisApplique) lignes.push({
    code: preavisDeduction ? 'PV_DED' : 'PV',
    libelle: preavisDeduction ? `Préavis non effectué (retenue) — ${preavisLabel}` : `Préavis non effectué — ${preavisLabel}`,
    calcul: `${fcfa(brut)} F × ${preavisMoisReliquat} mois`,
    montant: montantPreavis,
    type: preavisDeduction ? 'retenue' : 'gain',
    loi: 'Art. 16.11 CTCI / Décret N° 96-200 du 7 mars 1996 / CCI 1977 Art.34'
  })

  if (arrieres > 0) lignes.push({
    code: 'ARR',
    libelle: 'Arriérés de salaire',
    calcul: 'Forfait saisi',
    montant: arrieres,
    type: 'gain',
    loi: 'Art. 32.1 CTCI — Créances salariales exigibles'
  })

  if (montantConges > 0) lignes.push({
    code: 'CP',
    libelle: `Indemnité comp. de Congés Payés — ${totalJoursCP} jours`,
    calcul: `${totalJoursCP} jours × ${Math.round(salJour).toLocaleString('fr')} F/jr (Brut ÷ 26,4)`,
    montant: montantConges,
    type: 'gain',
    loi: 'Art. 25.1 CTCI — 2,2 jrs ouvr./mois — Loi n°2015-532'
  })

  if (montantIndemnite > 0) lignes.push({
    code: estRetraite ? 'IFR' : 'IL',
    libelle: estRetraite ? 'Ind. de fin de carrière (retraite)' : `Ind. de licenciement — ${ans} an${ans > 1 ? 's' : ''}`,
    calcul: ans <= 5
      ? `${ans} an${ans>1?'s':''} × 30% × ${fcfa(brut)} F`
      : (ans <= 10 ? `5×30% + ${ans-5}×35% + prorata` : `5×30% + 5×35% + ${ans-10}×40% + prorata`),
    montant: montantIndemnite,
    type: 'gain',
    loi: 'Décret N° 96-201 du 7 mars 1996 (Art. 1-3) — (30%/35%/40%)'
  })

  if (montantFinCDD > 0) lignes.push({
    code: 'ICDD',
    libelle: 'Indemnité de fin de CDD',
    calcul: `3% × ${moisTotal} mois × ${fcfa(brut)} F`,
    montant: montantFinCDD,
    type: 'gain',
    loi: 'Art. 14.5 CTCI — 3% des salaires bruts versés — Loi n°2015-532'
  })

  if (montant13e > 0) lignes.push({
    code: 'GRAT',
    libelle: `Gratification / 13e mois au prorata — ${moisDepuis1erJanvier}/12`,
    calcul: `Base : ${labelGratif} × ${moisDepuis1erJanvier}/12`,
    montant: montant13e,
    type: 'gain',
    loi: 'Contrat de travail / Conv. Collective (CCI 1977) / Décision d’entreprise'
  })

  if (avances > 0) lignes.push({
    code: 'AV',
    libelle: 'Avances / Acomptes à déduire',
    montant: avances,
    type: 'retenue',
    loi: 'Art. 32.5 CTCI — Récupération des acomptes sur salaire'
  })

  return {
    ans, moisTotal, moisResto,
    preavisLabel, preavisMoisTotal, preavisMoisReliquat, moisEffectues,
    preavisPayable, preavisDeduction, preavisApplique, montantPreavis,
    dateDebutReferenceConge, moisPeriode, totalJoursCP, montantConges,
    montantIndemnite,
    montantFinCDD,
    montant13e, moisDepuis1erJanvier, arrieres, labelGratif,
    brut, totalBrut, avances, totaleRetenues, net,
    lignes
  }
})

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
const fcfa = v => v ? Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '0'
const showRefs = ref(false)
const ancLabel = (a, m) => {
  const r = m % 12
  if (a === 0) return `${m} mois`
  return `${a} an${a > 1 ? 's' : ''}${r > 0 ? ` et ${r} mois` : ''}`
}

const motifLabels = {
  licenciement: 'Licenciement',
  demission: 'Démission',
  retraite: 'Retraite',
  commun_accord: 'Rupture d\'un commun accord',
  fin_cdd: 'Fin normale du CDD',
  deces: 'Décès du salarié',
  force_majeure: 'Force majeure',
}

// Généreration PDF
const generating = ref(false)
const downloadUrl = ref(null)
const generated = ref(false)
const errorMsg = ref(null)

const generatePDF = async () => {
  if (!emp.value.nom || !emp.value.date_embauche || (!emp.value.salaire_de_base && !emp.value.sursalaire_primes)) {
    errorMsg.value = 'Veuillez renseigner au moins le nom, la date d\'embauche et le salaire.'
    return
  }
  generating.value = true; errorMsg.value = null; generated.value = false; downloadUrl.value = null
  try {
    const res = await fetch('/api/rh/generate-stc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee: emp.value, calculs: calc.value })
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur serveur')
    downloadUrl.value = URL.createObjectURL(await res.blob())
    generated.value = true
  } catch(e) { errorMsg.value = e.message } finally { generating.value = false }
}
const reset = () => { generated.value = false; downloadUrl.value = null; errorMsg.value = null }
</script>

<template>
  <div class="stc-wrapper">

    <!-- HEADER -->
    <div class="stc-header">
      <div class="stc-header-icon">🧾</div>
      <div class="stc-header-text">
        <h3>Simulateur de Solde de Tout Compte</h3>
        <p>Remplissez les informations de base — tout est calculé automatiquement</p>
      </div>
      <div class="ci-badge">🇨🇮 Droit ivoirien</div>
    </div>

    <div class="stc-body">

      <!-- ══ FORMULAIRE SIMPLIFIÉ ══ -->
      <div class="stc-form">

        <!-- BLOC 1 : QUI ? -->
        <div class="form-bloc">
          <div class="bloc-title"><span class="bloc-num">1</span> Qui est l'employé ?</div>
          <div class="field-row">
            <div class="field-group">
              <label>Nom <span class="req">*</span></label>
              <input v-model="emp.nom" type="text" placeholder="NOM" class="inp" />
            </div>
            <div class="field-group">
              <label>Prénom(s)</label>
              <input v-model="emp.prenom" type="text" placeholder="Prénoms" class="inp" />
            </div>
          </div>
          <div class="field-row">
            <div class="field-group">
              <label>Poste / Fonction</label>
              <input v-model="emp.poste" type="text" placeholder="Ex: Comptable" class="inp" />
            </div>
            <div class="field-group">
              <label>Entreprise</label>
              <input v-model="emp.nom_entreprise" type="text" placeholder="Nom de l'entreprise" class="inp" />
            </div>
          </div>
        </div>

        <!-- BLOC 2 : DATES & CONTRAT -->
        <div class="form-bloc">
          <div class="bloc-title"><span class="bloc-num">2</span> Dates & Type de départ</div>
          <div class="field-row">
            <div class="field-group">
              <label>Date d'entrée <span class="req">*</span></label>
              <input v-model="emp.date_embauche" type="date" class="inp" />
            </div>
            <div class="field-group">
              <label>Date de sortie <span class="req">*</span></label>
              <input v-model="emp.date_sortie" type="date" class="inp" />
            </div>
          </div>

          <!-- Ancienneté calculée -->
          <div class="auto-badge" v-if="calc">
            <span class="badge-icon">⏱</span>
            <span>Ancienneté calculée automatiquement : </span>
            <strong>{{ ancLabel(calc.ans, calc.moisTotal) }}</strong>
          </div>

          <div class="field-row">
            <div class="field-group">
              <label>Type de contrat</label>
              <select v-model="emp.type_contrat" class="inp">
                <option value="cdi">CDI</option>
                <option value="cdd">CDD</option>
              </select>
            </div>
            <div class="field-group" v-if="emp.type_contrat === 'cdi'">
              <label>Statut professionnel</label>
              <select v-model="emp.statut_pro" class="inp">
                <option value="employe_mensuel">Employé qualifié (Mensuel)</option>
                <option value="cadre">Cadre / Supérieur</option>
                <option value="employe_horaire">Travailleur payé à l'heure / journée</option>
              </select>
            </div>
            <div class="field-group">
              <label>Raison du départ</label>
              <select v-model="emp.motif_rupture" class="inp">
                <option value="licenciement">Licenciement</option>
                <option value="retraite">Retraite</option>
                <option value="commun_accord">Accord commun</option>
                <option value="demission">Démission</option>
                <option value="fin_cdd">Fin normale de CDD</option>
                <option value="deces">Décès du salarié</option>
                <option value="force_majeure">Force majeure</option>
              </select>
            </div>
          </div>

        </div>

        <!-- BLOC 3 : SALAIRES (Base & Primes) -->
        <div class="form-bloc">
          <div class="bloc-title"><span class="bloc-num">3</span> Salaire et Rémunération</div>
          <div class="field-row">
            <div class="field-group">
              <label>Salaire de base (FCFA) <span class="req">*</span>
                <span class="hint">Salaire minimum catégoriel de l'employé</span>
              </label>
              <input v-model.number="emp.salaire_de_base" type="number" min="0" step="1000" placeholder="Ex: 250 000" class="inp inp-big" />
            </div>
            <div class="field-group">
              <label>Sursalaire & Primes fixes (FCFA)
                <span class="hint">Autres éléments mensuels soumis à cotisation</span>
              </label>
              <input v-model.number="emp.sursalaire_primes" type="number" min="0" step="1000" placeholder="Ex: 100 000" class="inp" />
            </div>
          </div>
          
          <div class="auto-badge" v-if="calc && calc.brut > 0">
            <span class="badge-icon">📊</span>
            <span>Salaire Mensuel Brut Global (Base STC Licensing/CP) : </span>
            <strong>{{ fcfa(calc.brut) }} FCFA</strong>
          </div>
        </div>

        <!-- BLOC 4 : PRÉAVIS -->
        <div class="form-bloc" v-if="calc && calc.preavisLabel">
          <div class="bloc-title"><span class="bloc-num">4</span> Durée légale / conventionnelle</div>
          
          <div class="preavis-toggle">
            <div class="preavis-info">
              <span class="preavis-icon">📋</span>
              <span>Durée légale / conventionnelle : 
                <strong>{{ calc.preavisMoisTotal < 1 ? Math.round(calc.preavisMoisTotal * 30) + ' jours' : calc.preavisLabel }}</strong>
              </span>
            </div>

            <div class="field-row mt-small">
              <div class="field-group">
                <label>Durée contractuelle de préavis
                  <span class="hint">Si votre contrat prévoit plus que le minimum légal (max 3 mois)</span>
                </label>
                <select v-model.number="emp.preavis_mois_contrat" class="inp">
                  <option value="0">0 – Minimum légal seulement</option>
                  <option value="1">1 mois</option>
                  <option value="2">2 mois</option>
                  <option value="3">3 mois</option>
                </select>
              </div>

              <div class="field-group">
                <label>Mois de préavis déjà effectués
                  <span class="hint">Indiquer ce qui a déjà été travaillé pendant le préavis</span>
                </label>
                <select v-model.number="emp.preavis_mois_effectues" class="inp">
                  <option value="-1">Préavis complet effectué</option>
                  <option value="0">0 mois — Aucun préavis n'a été effectué</option>
                  <option value="0.5">0,5 mois</option>
                  <option value="1">1 mois</option>
                  <option value="2">2 mois</option>
                </select>
              </div>
            </div>

            <div class="auto-badge" :class="calc.preavisReliquat > 0 ? (calc.preavisDeduction ? 'warn' : 'success') : 'info'" v-if="calc.preavisMoisTotal > 0">
              <span class="badge-icon">
                <svg v-if="calc.preavisMoisReliquat > 0 && calc.preavisDeduction" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                <svg v-else-if="calc.preavisMoisReliquat > 0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </span>
              <span v-if="calc.preavisMoisReliquat === 0">Préavis intégralement effectué — Aucun impact financier</span>
              <span v-else-if="calc.preavisDeduction">
                Reliquat à <strong>retenir</strong> : {{ calc.preavisMoisReliquat }} mois — 
                <strong>{{ fcfa(calc.montantPreavis) }} FCFA</strong>
              </span>
              <span v-else>
                Indemnité de préavis à <strong>verser</strong> : {{ calc.preavisMoisReliquat }} mois — 
                <strong>{{ fcfa(calc.montantPreavis) }} FCFA</strong>
              </span>
            </div>
          </div>
        </div>

        <!-- BLOC 5 : CONGÉS PAYÉS 100% AUTOMATIQUE -->
        <div class="form-bloc">
          <div class="bloc-title"><span class="bloc-num">5</span> Congés payés (Calcul automatique)</div>
          <div class="field-group">
            <label>Date du dernier retour de congé payé
              <span class="hint">Laissez vide si l'employé n'a JAMAIS pris de vrais congés payés.</span>
            </label>
            <input v-model="emp.date_dernier_retour_conge" type="date" class="inp" :max="emp.date_sortie" />
          </div>

          <div class="auto-badge info" v-if="calc">
            <span class="badge-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            </span>
            <strong>{{ calc.moisPeriode }} mois complets</strong>
            <span class="hint-inline">(Entre {{ emp.date_dernier_retour_conge ? 'retour de congé' : 'embauche' }} et sortie)</span>
          </div>
          
          <div class="auto-badge success" v-if="calc">
            <span class="badge-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </span>
            <strong>{{ calc.totalJoursCP }} jours à payer</strong>
          </div>
        </div>

        <!-- BLOC 6 : GRATIFICATION (13E MOIS) -->
        <div class="form-bloc">
          <div class="bloc-title"><span class="bloc-num">6</span> Gratification (13e mois) <span class="optional-lbl">Optionnel</span></div>
          <label class="yes-no-toggle">
            <input type="checkbox" v-model="emp.droit_gratification" />
            <span class="yn-box" :class="{ active: emp.droit_gratification }">
              <template v-if="emp.droit_gratification">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                L'employé a droit à ce bonus
              </template>
              <template v-else>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                Pas de droit à la gratification
              </template>
            </span>
          </label>

          <template v-if="emp.droit_gratification">
            <div class="field-row mt-small">
              <div class="field-group">
                <label>Règle de calcul applicable</label>
                <select v-model="emp.base_gratification" class="inp">
                  <option value="100_base">100% du Salaire de base</option>
                  <option value="75_base">75% du Salaire de base</option>
                  <option value="100_brut">100% du Salaire Brut Complet</option>
                  <option value="75_net">75% du Salaire Net Mensuel</option>
                  <option value="forfait">Forfait personnalisé / Montant Fixe</option>
                </select>
              </div>

              <div class="field-group" v-if="emp.base_gratification !== 'forfait'">
                <label>Volume annuel accordé
                  <span class="hint">Ex: 13e = 1 mois, 14e+ = 2-3 mois...</span>
                </label>
                <select v-model.number="emp.nombre_mois_gratification" class="inp">
                  <option value="1">1 mois de salaire</option>
                  <option value="2">2 mois de salaire</option>
                  <option value="3">3 mois de salaire</option>
                </select>
              </div>
            </div>
            
            <div class="field-group mt-small" v-if="emp.base_gratification === '75_net'">
                <label>Salaire Net Mensuel Estimé (FCFA)
                    <span class="hint">Nécessaire pour calculer 75% du net</span>
                </label>
                <input v-model.number="emp.salaire_net_mensuel" type="number" min="0" step="1000" placeholder="Ex: 210 000" class="inp" />
            </div>

            <div class="field-group mt-small" v-if="emp.base_gratification === 'forfait'">
                <label>Montant annuel de référence (FCFA)
                    <span class="hint">Quelle somme reçoit-il normalement fin décembre ?</span>
                </label>
                <input v-model.number="emp.montant_forfait_gratification" type="number" min="0" step="1000" placeholder="Ex: 500 000" class="inp" />
            </div>

            <div class="auto-badge success" v-if="calc">
              <span class="badge-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              </span>
              <strong>{{ fcfa(calc.montant13e) }} FCFA</strong>
            </div>
          </template>
        </div>

        <!-- BLOC 7 : RETENUES ET ARRIÉRÉS -->
        <div class="form-bloc">
          <div class="bloc-title"><span class="bloc-num">7</span> Autres droits & Déductions <span class="optional-lbl">Optionnel</span></div>
          <div class="field-row">
            <div class="field-group">
              <label>Arriérés de salaire (FCFA)
                <span class="hint">Salaires des mois précédents non payés</span>
              </label>
              <input v-model.number="emp.arrieres_salaire" type="number" min="0" step="1000" placeholder="Ex: 50 000" class="inp" />
            </div>
            <div class="field-group">
              <label>Avances à récupérer (FCFA)
                <span class="hint">Sommes dues par le salarié à l'entreprise</span>
              </label>
              <input v-model.number="emp.avances_impayees" type="number" min="0" step="1000" placeholder="Ex: 50 000" class="inp" />
            </div>
          </div>
        </div>

      </div>

      <!-- ══ APERÇU AUTOMATIQUE ══ -->
      <div class="stc-preview">

        <div class="preview-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Récapitulatif — Mis à jour automatiquement
        </div>

        <!-- Pas encore de données -->
        <div v-if="!calc" class="empty-state">
          <div class="empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
          </div>
          <p>Renseignez les informations à gauche pour voir le calcul apparaître ici automatiquement.</p>
        </div>

        <template v-else>
          <!-- Identité rapide -->
          <div class="id-card">
            <div class="id-name">{{ (emp.nom + ' ' + emp.prenom).trim() || 'Employé' }}</div>
            <div class="id-meta">
              <span>{{ emp.poste || 'Poste non renseigné' }}</span>
              <span class="sep">•</span>
              <span>{{ motifLabels[emp.motif_rupture] }}</span>
              <span class="sep">•</span>
              <span>Ancienneté : <strong>{{ ancLabel(calc.ans, calc.moisTotal) }}</strong></span>
            </div>
          </div>

          <!-- Lignes de calcul -->
          <div class="calcul-list">
            <div v-if="calc.lignes.filter(l => l.type === 'gain').length === 0" class="no-items">
              Aucune indemnité calculée pour ce motif de départ.
            </div>

            <div v-for="ligne in calc.lignes" :key="ligne.code"
                 class="calcul-item"
                 :class="ligne.type === 'retenue' ? 'item-retenue' : 'item-gain'">
              <div class="item-left">
                <div class="item-code">{{ ligne.code }}</div>
                <div class="item-info">
                  <div class="item-libelle">{{ ligne.libelle }}</div>
                  <div class="item-calcul" v-if="ligne.calcul">{{ ligne.calcul }}</div>
                  <div class="item-loi">{{ ligne.loi }}</div>
                </div>
              </div>
              <div class="item-montant" :class="ligne.type === 'retenue' ? 'neg' : 'pos'">
                {{ ligne.type === 'retenue' ? '−' : '+' }} {{ fcfa(ligne.montant) }}
                <span class="devise">FCFA</span>
              </div>
            </div>
          </div>

          <!-- Totaux -->
          <div class="totaux-bloc">
            <div class="total-ligne">
              <span>Total brut des indemnités</span>
              <span class="tl-val">{{ fcfa(calc.totalBrut) }} FCFA</span>
            </div>
            <div class="total-ligne ded" v-if="calc.totaleRetenues > 0">
              <span v-if="calc.preavisDeduction">Total des retenues (dont Préavis non effectué)</span>
              <span v-else>Total des retenues (Avances)</span>
              <span class="tl-val neg">− {{ fcfa(calc.totaleRetenues) }} FCFA</span>
            </div>
            <div class="total-net">
              <span class="tn-label">NET À PERCEVOIR</span>
              <span class="tn-val">{{ fcfa(calc.net) }} FCFA</span>
            </div>
          </div>

          <!-- Encart légal -->
          <div class="legal-bloc">
            <div class="legal-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16c0-3.31-2.69-6-6-6h-1V4.77a3.24 3.24 0 0 0-1.55-2.77 3.28 3.28 0 0 0-3.32 0 3.24 3.24 0 0 0-1.55 2.77V10H2a2 2 0 0 0-2 2v1h14v-1a2 2 0 0 0-2-2z"></path><path d="M17 21v-2a3 3 0 0 0-3-3H2a3 3 0 0 0-3 3v2h20z"></path><path d="M15 10c3.31 0 6 2.69 6 6v3h3v-3a6 6 0 0 0-6-6h-3z"></path></svg>
            </div>
            <div class="legal-text">
              Calcul conforme au <strong>Code du Travail CI (Loi n°2015-532 du 20 juillet 2015)</strong>.
              Le salarié dispose de <strong>6 mois</strong> pour contester le solde signé (Art. 32.6).
            </div>
          </div>

          <!-- Bouton références -->
          <button class="btn-refs" @click="showRefs = true">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            Voir les références juridiques applicables
          </button>

          <!-- Bouton PDF -->
          <div class="generate-bloc">
            <div v-if="errorMsg" class="error-msg">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              {{ errorMsg }}
            </div>
            <div v-if="generated" class="success-msg">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Document prêt !
              <a :href="downloadUrl" :download="`STC_${emp.nom}.pdf`" class="dl-link">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Télécharger le PDF
              </a>
              <button class="btn-link" @click="reset">Nouveau</button>
            </div>
            <button v-else class="btn-generate" :disabled="generating" @click="generatePDF">
              <span v-if="generating">⏳ Génération…</span>
              <template v-else>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                Générer le document officiel (PDF)
              </template>
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- MODAL RÉFÉRENCES JURIDIQUES -->
    <Teleport to="body">
      <div class="refs-modal-overlay" v-if="showRefs" @click.self="showRefs = false">
        <div class="refs-modal">
          <div class="refs-modal-head">
            <span style="display: flex; align-items: center; gap: 8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16c0-3.31-2.69-6-6-6h-1V4.77a3.24 3.24 0 0 0-1.55-2.77 3.28 3.28 0 0 0-3.32 0 3.24 3.24 0 0 0-1.55 2.77V10H2a2 2 0 0 0-2 2v1h14v-1a2 2 0 0 0-2-2z"></path><path d="M17 21v-2a3 3 0 0 0-3-3H2a3 3 0 0 0-3 3v2h20z"></path><path d="M15 10c3.31 0 6 2.69 6 6v3h3v-3a6 6 0 0 0-6-6h-3z"></path></svg>
              Références juridiques — Solde de Tout Compte CI
            </span>
            <button class="refs-close" @click="showRefs = false">✕</button>
          </div>
          <div class="refs-modal-body">
            <table class="refs-table">
              <thead>
                <tr><th>Rubrique</th><th>Texte de loi</th><th>Détails</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                      Préavis
                    </div>
                  </td>
                  <td>Décret N° 96-200 du 7 mars 1996<br>Art. 16.11 CTCI (Loi 2015-532)<br>CCI 1977 — Art. 34</td>
                  <td>Employés mensuels : 1 à 4 mois selon ancienneté. Cadres : 3 mois minimum. La convention d’entreprise peut étendre jusqu’à 6 mois. En cas de faute lourde, aucun préavis n’est dû.</td>
                </tr>
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>
                      Congés payés
                    </div>
                  </td>
                  <td>Art. 25.1 CTCI<br>Loi n°2015-532 du 20 juillet 2015</td>
                  <td>2,2 jours ouvrables par mois de travail effectif (soit 26,4 jours = 1 mois de salaire). L’indemnité compensatrice est calculée sur le salaire brut global ÷ 26,4 par jour.</td>
                </tr>
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                      Ind. Licenciement
                    </div>
                  </td>
                  <td>Décret N° 96-201 du 7 mars 1996<br>Art. 1 à 3</td>
                  <td>Calculé sur le <strong>salaire global mensuel moyen des 12 derniers mois</strong> :<br>• 30% par année pour les 5 premières années<br>• 35% pour les années 6 à 10<br>• 40% au-delà de 10 ans<br>Les fractions d’année (mois) sont prises en compte.</td>
                </tr>
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                      Ind. Retraite
                    </div>
                  </td>
                  <td>Décret N° 96-201 / Art. 21.2 CTCI</td>
                  <td>Mêmes taux progressifs que l’indemnité de licenciement (30%/35%/40%) appliqués sur le salaire global mensuel moyen.</td>
                </tr>
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                      Ind. Fin de CDD
                    </div>
                  </td>
                  <td>Art. 14.5 CTCI<br>Loi n°2015-532</td>
                  <td>3% de la totalité des salaires bruts versés durant le CDD. Appelée <em>« indemnité de précarité »</em>. Non cumulée avec l’indemnité de licenciement.</td>
                </tr>
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12l-8 8-8-8"></path><path d="M12 4v16"></path></svg>
                      Gratification
                    </div>
                  </td>
                  <td>Contrat de travail<br>CCI 1977 (recommande 75% base)<br>Décision d’entreprise</td>
                  <td>Pas de loi impérative, mais si versée pendant 3 années consecutives, elle devient un <strong>droit acquis</strong>. S’il n’y a pas de clause contractuelle, la CCI 1977 recommande 75% du salaire catégoriel comme base.</td>
                </tr>
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                      Arriérés de salaires
                    </div>
                  </td>
                  <td>Art. 32.1 CTCI<br>Art. 73.2 CTCI (prescription)</td>
                  <td>Toute somme due au titre du salaire est exigible immédiatement à la rupture. La créance salariale se prescrit par <strong>5 ans</strong>.</td>
                </tr>
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1V11a2 2 0 0 1-2-2 2 2 0 0 1 2-2v-.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2v.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                      Avances / Acomptes
                    </div>
                  </td>
                  <td>Art. 32.5 CTCI</td>
                  <td>L’employeur peut retenir les avances sur salaire accordées. Plafond : 1/5ème du salaire mensuel par retenue mensuelle. Sur le STC, la totalité du solde dû peut être retenue en une fois.</td>
                </tr>
                <tr class="ref-important">
                  <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                      Contestation
                    </div>
                  </td>
                  <td>Art. 32.6 CTCI<br>Loi n°2015-532</td>
                  <td>Le salarié dispose d’un délai de <strong>6 mois</strong> à compter de la signature pour contester le STC par voie judiciaire. <strong>Le STC ne vaut pas quittance libératoire</strong> en droit ivoirien.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }

.stc-wrapper {
  background: white;
  border-radius: 16px;
  overflow: hidden;
  font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
}

/* HEADER */
.stc-header {
  display: flex; align-items: center; gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: white;
}
.stc-header-icon { font-size: 2rem; }
.stc-header-text h3 { margin: 0; font-size: 1.05rem; font-weight: 800; }
.stc-header-text p { margin: 0.2rem 0 0; font-size: 0.78rem; opacity: 0.85; }
.ci-badge {
  margin-left: auto; background: rgba(255,255,255,0.2);
  border-radius: 8px; padding: 0.3rem 0.75rem;
  font-size: 0.8rem; font-weight: 700; white-space: nowrap;
}

/* LAYOUT */
.stc-body {
  display: grid;
  grid-template-columns: minmax(320px, 400px) 1fr;
  min-height: 600px;
}

/* FORMULAIRE */
.stc-form {
  border-right: 1px solid #e2e8f0;
  padding: 1.25rem;
  background: #f8fafc;
  overflow-y: auto;
  max-height: 680px;
}

.form-bloc {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem 1rem 0.75rem;
  margin-bottom: 0.75rem;
}

.bloc-title {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.8rem; font-weight: 800; color: #1e293b;
  margin-bottom: 0.75rem;
}
.bloc-num {
  width: 22px; height: 22px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.65rem; font-weight: 900; flex-shrink: 0;
}
.optional-lbl {
  font-size: 0.62rem; font-weight: 500; color: #94a3b8;
  background: #f1f5f9; padding: 0.1rem 0.4rem; border-radius: 8px;
  margin-left: 0.25rem;
}

.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.field-group { margin-bottom: 0.65rem; }
.field-group label {
  display: block; font-size: 0.71rem; font-weight: 600;
  color: #374151; margin-bottom: 0.2rem;
}
.hint { display: block; font-size: 0.63rem; color: #9ca3af; font-weight: 400; }
.hint-inline { font-size: 0.63rem; color: #9ca3af; margin-left: 0.3rem; }
.req { color: #ef4444; }

.inp {
  width: 100%; padding: 0.45rem 0.65rem;
  border: 1.5px solid #d1d5db; border-radius: 8px;
  font-size: 0.83rem; background: white;
  transition: border-color 0.2s; outline: none;
}
.inp:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }
.inp-big { font-size: 1.05rem; font-weight: 700; padding: 0.6rem 0.75rem; border-color: #a5b4fc; }
.mt-small { margin-top: 0.5rem; }

/* Badges auto-calculés */
.auto-badge {
  display: flex; align-items: center; flex-wrap: wrap; gap: 0.3rem;
  background: #eff6ff; border: 1px solid #bfdbfe;
  border-radius: 8px; padding: 0.4rem 0.65rem;
  font-size: 0.72rem; color: #1e40af;
  margin-bottom: 0.5rem;
}
.auto-badge.info { background: #fafafa; border-color: #e2e8f0; color: #374151; }
.auto-badge.success { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
.badge-icon { font-size: 0.9rem; }

/* Préavis toggle */
.preavis-toggle {
  background: #fafafa; border: 1px solid #e2e8f0;
  border-radius: 10px; padding: 0.6rem 0.75rem;
  margin-top: 0.5rem;
}
.preavis-info {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.75rem; color: #374151; margin-bottom: 0.4rem;
}
.preavis-icon { font-size: 0.9rem; }

.toggle-switch {
  display: flex; align-items: center; gap: 0.6rem; cursor: pointer;
}
.toggle-switch input { display: none; }
.slider {
  width: 38px; height: 20px; background: #d1d5db;
  border-radius: 20px; position: relative;
  transition: background 0.2s; flex-shrink: 0;
}
.slider::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; background: white;
  border-radius: 50%; transition: transform 0.2s;
}
.toggle-switch input:checked + .slider { background: #4f46e5; }
.toggle-switch input:checked + .slider::after { transform: translateX(18px); }
.toggle-label-text { font-size: 0.72rem; font-weight: 600; color: #374151; }

/* Yes/No toggle */
.yes-no-toggle { display: flex; cursor: pointer; }
.yes-no-toggle input { display: none; }
.yn-box {
  width: 100%; padding: 0.6rem 0.75rem;
  border: 2px dashed #d1d5db; border-radius: 10px;
  font-size: 0.8rem; font-weight: 600; color: #94a3b8;
  text-align: center; transition: all 0.2s;
}
.yn-box.active {
  background: #f0fdf4; border-color: #22c55e;
  color: #166534; border-style: solid;
}

/* ═══ APERÇU ═══ */
.stc-preview {
  padding: 1.25rem;
  overflow-y: auto;
  background: #fdfdfe;
  max-height: 680px;
}
.preview-header {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.75rem; font-weight: 700; color: #4f46e5;
  text-transform: uppercase; letter-spacing: 0.05em;
  margin-bottom: 1rem;
}

/* État vide */
.empty-state {
  text-align: center; padding: 3rem 1rem; color: #94a3b8;
}
.empty-icon { font-size: 3rem; margin-bottom: 0.75rem; }
.empty-state p { font-size: 0.85rem; line-height: 1.6; }

/* Carte identité */
.id-card {
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  border: 1px solid #c4b5fd; border-radius: 12px;
  padding: 0.75rem 1rem; margin-bottom: 1rem;
}
.id-name { font-size: 1rem; font-weight: 800; color: #1e1b4b; }
.id-meta {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: 0.3rem; font-size: 0.71rem; color: #6b7280; margin-top: 0.25rem;
}
.sep { color: #d1d5db; }

/* Lignes de calcul */
.calcul-list { margin-bottom: 0.75rem; }
.no-items {
  text-align: center; color: #94a3b8;
  font-size: 0.8rem; padding: 1rem; font-style: italic;
}
.calcul-item {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 0.75rem; padding: 0.65rem 0.75rem;
  border-radius: 10px; margin-bottom: 0.45rem;
  border: 1px solid #e2e8f0;
}
.item-gain { background: #f0fdf4; border-color: #bbf7d0; }
.item-retenue { background: #fff5f5; border-color: #fecaca; }

.item-left { display: flex; align-items: flex-start; gap: 0.5rem; flex: 1; }
.item-code {
  font-size: 0.6rem; font-family: monospace; font-weight: 800;
  color: white; background: #4f46e5; border-radius: 4px;
  padding: 0.1rem 0.3rem; white-space: nowrap; margin-top: 1px;
}
.item-retenue .item-code { background: #dc2626; }
.item-info { flex: 1; }
.item-libelle { font-size: 0.78rem; font-weight: 700; color: #1e293b; }
.item-calcul { font-size: 0.65rem; color: #6b7280; margin-top: 0.1rem; font-family: monospace; }
.item-loi { font-size: 0.6rem; color: #94a3b8; margin-top: 0.1rem; font-style: italic; }

.item-montant {
  font-size: 0.9rem; font-weight: 800; font-family: 'Courier New', monospace;
  white-space: nowrap; text-align: right;
}
.pos { color: #16a34a; }
.neg { color: #dc2626; }
.devise { font-size: 0.65rem; font-weight: 600; margin-left: 0.2rem; }

/* Totaux */
.totaux-bloc {
  background: white; border: 1.5px solid #e2e8f0;
  border-radius: 12px; padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
}
.total-ligne {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.78rem; padding: 0.25rem 0;
  border-bottom: 1px dashed #f1f5f9;
}
.total-ligne.ded { color: #dc2626; }
.tl-val { font-family: 'Courier New', monospace; font-weight: 700; }
.tl-val.neg { color: #dc2626; }
.total-net {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 0.6rem; padding: 0.65rem 0.75rem;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  border-radius: 10px; color: white;
}
.tn-label { font-size: 0.8rem; font-weight: 700; }
.tn-val { font-size: 1.15rem; font-weight: 900; font-family: 'Courier New', monospace; }

/* Encart légal */
.legal-bloc {
  display: flex; align-items: flex-start; gap: 0.5rem;
  background: #fffbeb; border: 1px solid #fcd34d;
  border-radius: 8px; padding: 0.6rem 0.75rem;
  font-size: 0.68rem; color: #92400e; margin-bottom: 0.75rem;
}
.legal-icon { font-size: 1rem; flex-shrink: 0; }
.legal-text { line-height: 1.5; }

/* Références Juridiques accordéon */
.refs-juridiques {
  border: 1.5px solid #c7d2fe; border-radius: 10px;
  margin-bottom: 0.75rem; overflow: hidden;
  background: #f8f7ff;
}
.refs-title {
  cursor: pointer; padding: 0.6rem 0.85rem;
  font-size: 0.78rem; font-weight: 700; color: #4338ca;
  background: #eef2ff;
  list-style: none; display: flex; align-items: center; gap: 0.4rem;
  user-select: none;
}
.refs-title:hover { background: #e0e7ff; }
.refs-table {
  width: 100%; border-collapse: collapse;
  font-size: 0.65rem;
}
.refs-table th {
  background: #4f46e5; color: white;
  padding: 0.3rem 0.5rem; text-align: left;
  font-size: 0.6rem; text-transform: uppercase;
}
.refs-table td {
  padding: 0.35rem 0.5rem; border-bottom: 1px solid #e0e7ff;
  vertical-align: top; line-height: 1.45; color: #374151;
}
.refs-table td:first-child { font-weight: 700; white-space: nowrap; }
.refs-table td:nth-child(2) { color: #4338ca; font-family: monospace; }
.refs-table tr:hover td { background: #eef2ff; }
.ref-important td {
  background: #fffbeb !important; color: #92400e !important;
  font-size: 0.63rem;
}

/* Bouton références */
.btn-refs {
  width: 100%; padding: 0.5rem 0.75rem;
  background: #eef2ff; color: #4338ca;
  border: 1.5px solid #c7d2fe; border-radius: 10px;
  font-size: 0.78rem; font-weight: 600; cursor: pointer;
  margin-bottom: 0.65rem; transition: background 0.15s;
  text-align: left;
}
.btn-refs:hover { background: #e0e7ff; }

/* Modal références juridiques — :global car téléporté vers body (scoped ne s’applique pas) */
:global(.refs-modal-overlay) {
  position: fixed; inset: 0;
  background: rgba(15,23,42,0.65); backdrop-filter: blur(5px);
  z-index: 20000; display: flex; align-items: center; justify-content: center;
  padding: 1rem;
  animation: g-fadeIn 0.15s ease;
}
@keyframes g-fadeIn { from { opacity: 0 } to { opacity: 1 } }
:global(.refs-modal) {
  background: white; border-radius: 16px;
  width: 100%; max-width: 860px; max-height: 90vh;
  display: flex; flex-direction: column;
  overflow: hidden; box-shadow: 0 25px 70px rgba(0,0,0,0.35);
  animation: g-slideUp 0.2s ease;
}
@keyframes g-slideUp { from { transform: translateY(30px); opacity:0 } to { transform: none; opacity:1 } }
:global(.refs-modal-head) {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1rem 1.25rem;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white; font-weight: 700; font-size: 0.95rem;
  flex-shrink: 0;
}
:global(.refs-close) {
  background: rgba(255,255,255,0.2); border: none; color: white;
  border-radius: 8px; cursor: pointer;
  font-size: 1rem; width: 2rem; height: 2rem;
  display: flex; align-items: center; justify-content: center;
}
:global(.refs-close:hover) { background: rgba(255,255,255,0.35); }
:global(.refs-modal-body) {
  overflow-y: auto; padding: 0; flex: 1;
}
:global(.refs-modal .refs-table) { width: 100%; border-collapse: collapse; font-size: 0.77rem; }
:global(.refs-modal .refs-table th) {
  background: #4f46e5; color: white;
  padding: 0.55rem 0.875rem; text-align: left;
  font-size: 0.7rem; text-transform: uppercase;
}
:global(.refs-modal .refs-table td) {
  padding: 0.65rem 0.875rem; border-bottom: 1px solid #e0e7ff;
  vertical-align: top; line-height: 1.5; color: #374151;
}
:global(.refs-modal .refs-table td:first-child) { font-weight: 700; white-space: nowrap; }
:global(.refs-modal .refs-table td:nth-child(2)) { color: #4338ca; font-family: monospace; font-size: 0.7rem; }
:global(.refs-modal .refs-table tr:hover td) { background: #eef2ff; }
:global(.refs-modal .ref-important td) {
  background: #fffbeb !important; color: #92400e !important;
}
.btn-generate {
  width: 100%; padding: 0.875rem;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white; border: none; border-radius: 12px;
  font-weight: 700; font-size: 0.9rem; cursor: pointer;
  transition: all 0.2s; box-shadow: 0 4px 14px rgba(79,70,229,0.3);
}
.btn-generate:hover:not(:disabled) {
  transform: translateY(-1px); box-shadow: 0 6px 20px rgba(79,70,229,0.4);
}
.btn-generate:disabled { opacity: 0.6; cursor: not-allowed; }
.error-msg {
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 8px; padding: 0.6rem 0.75rem;
  font-size: 0.8rem; margin-bottom: 0.5rem;
}
.success-msg {
  background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
  border-radius: 8px; padding: 0.6rem 0.75rem;
  font-size: 0.8rem; display: flex; align-items: center;
  flex-wrap: wrap; gap: 0.5rem;
}
.dl-link {
  background: #4f46e5; color: white; text-decoration: none;
  border-radius: 6px; padding: 0.3rem 0.75rem;
  font-weight: 700; font-size: 0.78rem;
}
.btn-link {
  background: none; border: none; text-decoration: underline;
  color: #166534; cursor: pointer; font-size: 0.78rem;
}

@media (max-width: 820px) {
  .stc-body { grid-template-columns: 1fr; }
  .stc-form { border-right: none; border-bottom: 1px solid #e2e8f0; max-height: none; }
}
</style>
