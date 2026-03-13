<script setup>
import { formatFCFA } from '../../services/taxService.js'

const props = defineProps({
  resultats: Object,
  projections: Array,
  params: Object,
  nom: String,
})

function imprimer() {
  window.print()
}

const anneeActuelle = new Date().getFullYear()

// Calendrier fiscal selon le régime
function getCalendrier(regimeId) {
  const cal = {
    entreprenant_tce: [
      { mois: 'Janvier', action: 'Déclaration du CA annuel ' + (anneeActuelle - 1) + ' à la DGI', important: true },
      { mois: 'Mars 31', action: 'Paiement de la patente annuelle', important: true },
      { mois: 'Décembre', action: 'Préparer votre déclaration ' + anneeActuelle, important: false },
    ],
    entreprenant_tee: [
      { mois: 'Janvier 31', action: 'Déclaration du CA annuel ' + (anneeActuelle - 1) + ' à la DGI', important: true },
      { mois: 'Mars 31', action: 'Paiement de la patente annuelle', important: true },
      { mois: 'Avril 30', action: '1er acompte impôt (si applicable)', important: false },
      { mois: 'Juillet 31', action: '2ème acompte impôt', important: false },
      { mois: 'Novembre', action: 'Vérification du CA cumulé — risque changement de régime ?', important: false },
    ],
    rme: [
      { mois: 'Janvier 31', action: 'Déclaration CA annuel ' + (anneeActuelle - 1), important: true },
      { mois: 'Mars 31', action: 'Paiement de la patente', important: true },
      { mois: 'Avril 30', action: '1er acompte impôt (33% de l\'impôt N-1)', important: true },
      { mois: 'Juillet 31', action: '2ème acompte (33%)', important: true },
      { mois: 'Décembre 15', action: '3ème acompte (34%)', important: true },
    ],
    rsi: [
      { mois: 'Mars 31', action: 'Dépôt bilan comptable + déclaration IS à la DGI', important: true },
      { mois: 'Avril 30', action: '1er acompte IS (25% de l\'IS de N-1)', important: true },
      { mois: 'Juillet 31', action: '2ème acompte IS (25%)', important: true },
      { mois: 'Octobre 31', action: '3ème acompte IS (25%)', important: true },
      { mois: 'Décembre 31', action: '4ème acompte IS (25%)', important: true },
    ],
  }
  return cal[regimeId] || cal.entreprenant_tee
}
</script>

<template>
  <div>
    <!-- Bouton déclencheur (visible à l'écran seulement) -->
    <div class="print-trigger no-print">
      <button class="btn-imprimer" @click="imprimer">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"/>
        </svg>
        Imprimer / Enregistrer en PDF
      </button>
      <p class="print-hint">Votre fiche fiscale complète — à conserver ou montrer à la DGI</p>
    </div>

    <!-- FICHE IMPRIMABLE -->
    <div class="fiche-print print-only">
      <!-- Tampon Simulation -->
      <div class="tampon-simulation">SIMULATION</div>

      <!-- En-tête -->
      <div class="fiche-entete">
        <div class="fe-brand">
          <img src="/logo.png?v=2" alt="Onda Logo" style="height: 32px; width: auto; object-fit: contain; margin-bottom: 4pt;">
          <div class="fiche-slogan">Finance & Fiscalité Simplifiée</div>
        </div>
        <div class="fiche-titre-bloc">
          <h1 class="fiche-titre">RAPPORT DE SIMULATION FISCALE</h1>
          <p class="fiche-annee">Exercice {{ anneeActuelle }}</p>
        </div>
        <div class="fiche-meta">
          <div>Réf: ONDA-{{ Math.random().toString(36).substring(7).toUpperCase() }}</div>
          <div>Date: {{ new Date().toLocaleDateString('fr-FR') }}</div>
        </div>
      </div>

      <div class="fiche-client-box">
        <div class="cb-item">
          <span class="cb-label">ENTREPRISE :</span>
          <span class="cb-val">{{ nom || 'NON RENSEIGNÉ' }}</span>
        </div>
        <div class="cb-item">
          <span class="cb-label">SECTEUR :</span>
          <span class="cb-val">{{ params.secteur?.toUpperCase() }}</span>
        </div>
      </div>

      <!-- Résumé Financier -->
      <div class="section">
        <div class="section-titre">1. SYNTHÈSE FINANCIÈRE ANNUELLE</div>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Chiffre d'Affaires</div>
            <div class="info-val">{{ formatFCFA(params.ca) }} FCFA</div>
          </div>
          <div class="info-item">
            <div class="info-label">Total des Charges</div>
            <div class="info-val">{{ formatFCFA(resultats.totalCharges) }} FCFA</div>
          </div>
          <div class="info-item highlight">
            <div class="info-label">Impôt Brut Estimé</div>
            <div class="info-val">{{ formatFCFA(resultats.impot) }} FCFA</div>
          </div>
          <div class="info-item highlight">
            <div class="info-label">Bénéfice Net Après Impôt</div>
            <div class="info-val">{{ formatFCFA(resultats.beneficeNet) }} FCFA</div>
          </div>
        </div>
      </div>

      <!-- Détails Régime -->
      <div class="section">
        <div class="section-titre">2. RÉGIME FISCAL & OBLIGATIONS</div>
        <div class="regime-box">
          <div class="rb-header">
            <strong>VOTRE RÉGIME : {{ resultats.regime.label }}</strong>
          </div>
          <div class="rb-body">
            <div class="rb-col">
              <div class="rb-sub">Modalités de calcul</div>
              <p>{{ resultats.detail }}</p>
              <p v-if="params.cga" class="cga-text">Bénéficie de la réduction CGA (50%)</p>
            </div>
            <div class="rb-col">
              <div class="rb-sub">Paiements prévisionnels</div>
              <p>Mensuel : <strong>{{ formatFCFA(Math.round(resultats.impot / 12)) }} FCFA</strong></p>
              <p>Journalier (base 26j) : <strong>{{ formatFCFA(Math.round(resultats.impot / (12 * 26))) }} FCFA</strong></p>
            </div>
          </div>
        </div>
      </div>

      <!-- Calendrier -->
      <div class="section">
        <div class="section-titre">3. ÉCHÉANCIER FISCAL {{ anneeActuelle }}</div>
        <table class="cal-table">
          <thead>
            <tr>
              <th style="width: 120px">MOIS / DATE</th>
              <th>OBLIGATION FISCALE / ACTION REQUISE</th>
              <th style="width: 80px">STATUT</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="evt in getCalendrier(resultats.regime.id)" :key="evt.mois" :class="{ 'row-important': evt.important }">
              <td class="cal-mois">{{ evt.mois }}</td>
              <td>{{ evt.action }}</td>
              <td class="cal-status">[ ] À faire</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Projections -->
      <div class="section">
        <div class="section-titre">4. PROJECTIONS ET CROISSANCE</div>
        <table class="proj-table">
          <thead>
            <tr>
              <th>ANNEE</th>
              <th>CA PRÉVISIONNEL</th>
              <th>IMPÔT ESTIMÉ</th>
              <th>BÉNÉFICE NET</th>
              <th>MARGE NETTE</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in (projections?.find(p => p.scenario === 'realiste')?.annees?.slice(0, 3) || [])">
              <td>{{ a.annee }}</td>
              <td>{{ formatFCFA(a.ca) }}</td>
              <td>{{ formatFCFA(a.impot) }}</td>
              <td>{{ formatFCFA(a.beneficeNet) }}</td>
              <td>{{ a.margeNette.toFixed(1) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Notes -->
      <div class="section">
        <div class="section-titre">NOTES PERSONNELLES</div>
        <div class="notes-box"></div>
      </div>

      <!-- Footer -->
      <div class="fiche-footer">
        <div class="ff-disclaimer">
          Ce document est une simulation générée par l'outil ONDA Lite. Il n'a pas de valeur juridique officielle
          auprès de la Direction Générale des Impôts (DGI) et doit être validé par un professionnel agréé.
        </div>
        <div class="ff-signature">
          <div class="sig-box">Cachet Entreprise</div>
          <div class="sig-box">Signature Gérant</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }

/* ÉCRAN — bouton déclencheur */
.print-trigger {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  font-family: 'Inter', system-ui, sans-serif;
}
.btn-imprimer {
  display: flex; align-items: center; gap: 0.5rem;
  background: #0f172a; color: white; border: none;
  border-radius: 8px; padding: 0.7rem 1.25rem;
  font-size: 0.875rem; font-weight: 600; cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.btn-imprimer:hover { background: #1e293b; box-shadow: 0 4px 12px rgba(15,23,42,0.2); }
.print-hint { font-size: 0.78rem; color: #6b7280; margin: 0; font-family: 'Inter', system-ui, sans-serif; }

/* IMPRESSION uniquement */
.print-only { display: none; }

@media print {
  .no-print { display: none !important; }
  .print-only { display: block !important; }

  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 11pt; color: #111; margin: 0; }

  .fiche-print { padding: 1.5cm; max-width: 100%; position: relative; }

  /* Tampon */
  .tampon-simulation {
    position: absolute; top: 10cm; right: 2cm;
    border: 4pt solid #dc2626; color: #dc2626;
    font-size: 40pt; font-weight: 900; padding: 10pt 20pt;
    transform: rotate(-25deg); opacity: 0.15;
    border-radius: 10pt; pointer-events: none;
  }

  /* En-tête */
  .fiche-entete { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 12pt; border-bottom: 2pt solid #0f172a; margin-bottom: 16pt; }
  .fiche-logo { font-weight: 900; font-size: 16pt; color: #0f766e; letter-spacing: -0.5px; }
  .fiche-slogan { font-size: 8pt; color: #64748b; font-weight: 600; }
  .fiche-titre { font-size: 16pt; font-weight: 800; color: #0f172a; margin: 0; text-align: center; }
  .fiche-annee { font-size: 11pt; color: #475569; margin: 2pt 0 0; text-align: center; }
  .fiche-meta { font-size: 8pt; color: #9ca3af; text-align: right; }

  /* Client Box */
  .fiche-client-box { display: flex; gap: 20pt; background: #f8fafc; padding: 10pt; border-radius: 6pt; border: 1pt solid #e2e8f0; margin-bottom: 16pt; }
  .cb-item { display: flex; gap: 6pt; align-items: center; }
  .cb-label { font-size: 8pt; font-weight: 700; color: #64748b; }
  .cb-val { font-size: 10pt; font-weight: 800; color: #0f172a; }

  /* Sections */
  .section { margin-bottom: 18pt; page-break-inside: avoid; }
  .section-titre { font-size: 9pt; font-weight: 800; color: #0f172a; border-left: 4pt solid #0f766e; padding-left: 8pt; margin-bottom: 10pt; background: #f1f5f9; padding-top: 4pt; padding-bottom: 4pt; }

  /* Grille info */
  .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10pt; }
  .info-item { background: white; padding: 10pt; border-radius: 4pt; border: 1pt solid #e2e8f0; }
  .info-item.highlight { background: #f0fdf4; border-color: #bbf7d0; }
  .info-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4pt; }
  .info-val { font-size: 11pt; font-weight: 800; color: #0f172a; }

  /* Régime Box */
  .regime-box { border: 1pt solid #bae6fd; border-radius: 6pt; overflow: hidden; }
  .rb-header { background: #bae6fd; padding: 6pt 10pt; font-size: 10pt; color: #0369a1; }
  .rb-body { display: grid; grid-template-columns: 1fr 1fr; gap: 20pt; padding: 10pt; }
  .rb-sub { font-size: 8pt; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4pt; }
  .rb-col p { font-size: 9pt; margin: 4pt 0; color: #334155; }
  .cga-text { color: #15803d; font-weight: 700; }

  /* Tableaux */
  .cal-table, .proj-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  .cal-table th, .proj-table th { background: #f8fafc; padding: 6pt 8pt; text-align: left; font-size: 7pt; text-transform: uppercase; color: #64748b; border-bottom: 2pt solid #e2e8f0; }
  .cal-table td, .proj-table td { padding: 6pt 8pt; border-bottom: 1pt solid #f1f5f9; }
  .cal-mois { font-weight: 700; color: #0f172a; }
  .cal-status { font-size: 7pt; color: #94a3b8; font-family: monospace; }
  .row-important { background: #fffbeb; }

  .proj-table th, .proj-table td { text-align: right; }
  .proj-table th:first-child, .proj-table td:first-child { text-align: left; }

  /* Notes */
  .notes-box { height: 2cm; border: 1pt dashed #cbd5e1; border-radius: 4pt; }

  /* Footer */
  .fiche-footer { margin-top: 20pt; }
  .ff-disclaimer { font-size: 7pt; color: #94a3b8; line-height: 1.4; font-style: italic; border-bottom: 1pt solid #f1f5f9; padding-bottom: 8pt; margin-bottom: 10pt; }
  .ff-signature { display: flex; justify-content: space-between; gap: 40pt; }
  .sig-box { flex: 1; height: 1.5cm; border: 1pt solid #e2e8f0; border-radius: 4pt; display: flex; align-items: flex-start; padding: 4pt; font-size: 6pt; color: #cbd5e1; text-transform: uppercase; }
}
</style>
