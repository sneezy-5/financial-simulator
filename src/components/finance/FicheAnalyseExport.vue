<script setup>
import {
  totalActifImmobilise, totalActifCirculant, totalTresorerieActif, totalGeneralActif,
  totalCapitauxPropres, totalDettesFinancieres, totalPassifCirculant, totalTresoreriePassif, totalGeneralPassif,
  calculerSoldesIntermediaires, verifierEquilibreBilan, FAMILLES,
} from '../../services/financialAnalysisService.js'
import { exporterClasseurExcel } from '../../services/financialExportService.js'

const props = defineProps({
  nom: { type: String, default: '' },
  bilanN: { type: Object, required: true },
  bilanN1: { type: Object, required: true },
  crN: { type: Object, required: true },
  crN1: { type: Object, required: true },
  ratios: { type: Array, required: true },
  scoreFinancement: { type: Object, required: true }, // { score, niveau, motifs }
})

function imprimer() { window.print() }

function exporterExcel() {
  exporterClasseurExcel({
    nom: props.nom, bilanN: props.bilanN, bilanN1: props.bilanN1,
    crN: props.crN, crN1: props.crN1, ratios: props.ratios, scoreFinancement: props.scoreFinancement,
  })
}

const anneeActuelle = new Date().getFullYear()
const fmt = (v) => new Intl.NumberFormat('fr-FR').format(Math.round(v || 0))

const LABEL_NIVEAU_SCORE = {
  'eligible': 'ÉLIGIBLE AU FINANCEMENT',
  'sous-conditions': 'ÉLIGIBLE SOUS CONDITIONS',
  'non-eligible': "NON ÉLIGIBLE EN L'ÉTAT",
}

function formatValeurRatio(r, valeur) {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return '—'
  switch (r.unite) {
    case '%': return (valeur * 100).toFixed(1).replace('.', ',') + ' %'
    case 'FCFA': return fmt(valeur) + ' FCFA'
    case 'x': return valeur.toFixed(2).replace('.', ',') + ' x'
    case 'jours': return Math.round(valeur) + ' j'
    case 'années': return valeur.toFixed(1).replace('.', ',') + ' ans'
    default: return valeur.toFixed(2)
  }
}

const LIGNES_SIG = [
  { key: 'chiffreAffaires', label: "Chiffre d'affaires" },
  { key: 'valeurAjoutee', label: 'Valeur ajoutée' },
  { key: 'ebe', label: 'EBE' },
  { key: 'resultatExploitation', label: "Résultat d'exploitation" },
  { key: 'resultatNet', label: 'Résultat net' },
]
</script>

<template>
  <div>
    <!-- Boutons déclencheurs (écran uniquement) -->
    <div class="print-trigger no-print">
      <div class="export-buttons">
        <button class="btn-imprimer" @click="imprimer">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"/>
          </svg>
          Imprimer / Enregistrer en PDF
        </button>
        <button class="btn-excel" @click="exporterExcel">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"/>
          </svg>
          Exporter en Excel
        </button>
      </div>
      <p class="print-hint">Votre fiche d'analyse financière complète — PDF pour un dossier de financement, Excel pour le détail ligne par ligne du bilan et des ratios</p>
    </div>

    <!-- FICHE IMPRIMABLE -->
    <div class="fiche-print print-only">
      <div class="tampon-simulation">SIMULATION</div>

      <div class="fiche-entete">
        <div class="fe-brand">
          <img src="/logo.png?v=2" alt="Onda Logo" style="height: 32px; width: auto; object-fit: contain; margin-bottom: 4pt;">
          <div class="fiche-slogan">Analyse Financière OHADA/SYSCOHADA</div>
        </div>
        <div class="fiche-titre-bloc">
          <h1 class="fiche-titre">RAPPORT D'ANALYSE FINANCIÈRE</h1>
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
          <span class="cb-label">RÉFÉRENTIEL :</span>
          <span class="cb-val">SYSCOHADA RÉVISÉ</span>
        </div>
      </div>

      <!-- Score de financement -->
      <div class="section">
        <div class="section-titre">1. VERDICT DE FINANCEMENT</div>
        <div class="score-box" :class="scoreFinancement.niveau">
          <div class="score-chiffre">{{ scoreFinancement.score }}<span>/100</span></div>
          <div class="score-texte">
            <strong>{{ LABEL_NIVEAU_SCORE[scoreFinancement.niveau] }}</strong>
            <ul>
              <li v-for="(m, i) in scoreFinancement.motifs" :key="i">{{ m }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Bilan résumé -->
      <div class="section">
        <div class="section-titre">2. BILAN — GRANDES MASSES</div>
        <table class="data-table">
          <thead><tr><th>ACTIF</th><th>N-1</th><th>N</th><th>PASSIF</th><th>N-1</th><th>N</th></tr></thead>
          <tbody>
            <tr>
              <td>Actif immobilisé</td><td>{{ fmt(totalActifImmobilise(bilanN1.actif)) }}</td><td>{{ fmt(totalActifImmobilise(bilanN.actif)) }}</td>
              <td>Capitaux propres</td><td>{{ fmt(totalCapitauxPropres(bilanN1.passif)) }}</td><td>{{ fmt(totalCapitauxPropres(bilanN.passif)) }}</td>
            </tr>
            <tr>
              <td>Actif circulant</td><td>{{ fmt(totalActifCirculant(bilanN1.actif)) }}</td><td>{{ fmt(totalActifCirculant(bilanN.actif)) }}</td>
              <td>Dettes financières</td><td>{{ fmt(totalDettesFinancieres(bilanN1.passif)) }}</td><td>{{ fmt(totalDettesFinancieres(bilanN.passif)) }}</td>
            </tr>
            <tr>
              <td>Trésorerie actif</td><td>{{ fmt(totalTresorerieActif(bilanN1.actif)) }}</td><td>{{ fmt(totalTresorerieActif(bilanN.actif)) }}</td>
              <td>Passif circulant</td><td>{{ fmt(totalPassifCirculant(bilanN1.passif)) }}</td><td>{{ fmt(totalPassifCirculant(bilanN.passif)) }}</td>
            </tr>
            <tr>
              <td></td><td></td><td></td>
              <td>Trésorerie passif</td><td>{{ fmt(totalTresoreriePassif(bilanN1.passif)) }}</td><td>{{ fmt(totalTresoreriePassif(bilanN.passif)) }}</td>
            </tr>
            <tr class="row-total">
              <td>TOTAL ACTIF</td><td>{{ fmt(totalGeneralActif(bilanN1.actif)) }}</td><td>{{ fmt(totalGeneralActif(bilanN.actif)) }}</td>
              <td>TOTAL PASSIF</td><td>{{ fmt(totalGeneralPassif(bilanN1.passif)) }}</td><td>{{ fmt(totalGeneralPassif(bilanN.passif)) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="equilibre-note" :class="{ ko: !verifierEquilibreBilan(bilanN).equilibre }">
          {{ verifierEquilibreBilan(bilanN).equilibre ? '✓ Bilan N équilibré' : "⚠ Écart de bilan à corriger avant dépôt du dossier" }}
        </p>
      </div>

      <!-- Soldes intermédiaires -->
      <div class="section">
        <div class="section-titre">3. SOLDES INTERMÉDIAIRES DE GESTION</div>
        <table class="data-table">
          <thead><tr><th></th><th>N-1</th><th>N</th></tr></thead>
          <tbody>
            <tr v-for="l in LIGNES_SIG" :key="l.key">
              <td>{{ l.label }}</td>
              <td>{{ fmt(calculerSoldesIntermediaires(crN1)[l.key]) }}</td>
              <td>{{ fmt(calculerSoldesIntermediaires(crN)[l.key]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Ratios -->
      <div class="section" v-for="famille in Object.values(FAMILLES)" :key="famille" style="page-break-inside: avoid;">
        <div class="section-titre">{{ famille.toUpperCase() }}</div>
        <table class="data-table">
          <thead><tr><th>INDICATEUR</th><th>N</th><th>N-1</th><th>NIVEAU</th></tr></thead>
          <tbody>
            <tr v-for="r in ratios.filter(x => x.famille === famille)" :key="r.id">
              <td>{{ r.label }}</td>
              <td>{{ formatValeurRatio(r, r.valeurN) }}</td>
              <td>{{ r.valeurN1 !== null ? formatValeurRatio(r, r.valeurN1) : '—' }}</td>
              <td class="niveau-cell" :class="r.niveau">{{ r.niveau === 'bon' ? 'Bon' : r.niveau === 'moyen' ? 'Moyen' : 'Faible' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer -->
      <div class="fiche-footer">
        <div class="ff-disclaimer">
          Ce document est une simulation générée par l'outil ONDA. Les intitulés de postes et seuils d'évaluation
          sont indicatifs et doivent être validés par un comptable ou expert-financier connaissant le référentiel
          SYSCOHADA révisé avant tout usage dans un dossier de financement officiel.
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

.print-trigger {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.export-buttons {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.btn-imprimer, .btn-excel {
  display: flex; align-items: center; gap: 0.5rem;
  border: none;
  border-radius: 8px; padding: 0.7rem 1.25rem;
  font-size: 0.875rem; font-weight: 600; cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.btn-imprimer { background: #0f172a; color: white; }
.btn-imprimer:hover { background: #1e293b; box-shadow: 0 4px 12px rgba(15,23,42,0.2); }
.btn-excel { background: #059669; color: white; }
.btn-excel:hover { background: #047857; box-shadow: 0 4px 12px rgba(5,150,105,0.25); }
.print-hint { font-size: 0.78rem; color: #6b7280; margin: 0; }

.print-only { display: none; }

@media print {
  .no-print { display: none !important; }
  .print-only { display: block !important; }

  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 11pt; color: #111; margin: 0; }

  .fiche-print { padding: 1.5cm; max-width: 100%; position: relative; }

  .tampon-simulation {
    position: absolute; top: 10cm; right: 2cm;
    border: 4pt solid #dc2626; color: #dc2626;
    font-size: 40pt; font-weight: 900; padding: 10pt 20pt;
    transform: rotate(-25deg); opacity: 0.15;
    border-radius: 10pt; pointer-events: none;
  }

  .fiche-entete { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 12pt; border-bottom: 2pt solid #0f172a; margin-bottom: 16pt; }
  .fiche-slogan { font-size: 8pt; color: #64748b; font-weight: 600; }
  .fiche-titre { font-size: 16pt; font-weight: 800; color: #0f172a; margin: 0; text-align: center; }
  .fiche-annee { font-size: 11pt; color: #475569; margin: 2pt 0 0; text-align: center; }
  .fiche-meta { font-size: 8pt; color: #9ca3af; text-align: right; }

  .fiche-client-box { display: flex; gap: 20pt; background: #f8fafc; padding: 10pt; border-radius: 6pt; border: 1pt solid #e2e8f0; margin-bottom: 16pt; }
  .cb-item { display: flex; gap: 6pt; align-items: center; }
  .cb-label { font-size: 8pt; font-weight: 700; color: #64748b; }
  .cb-val { font-size: 10pt; font-weight: 800; color: #0f172a; }

  .section { margin-bottom: 16pt; page-break-inside: avoid; }
  .section-titre { font-size: 9pt; font-weight: 800; color: #0f172a; border-left: 4pt solid #059669; padding-left: 8pt; margin-bottom: 8pt; background: #f1f5f9; padding-top: 4pt; padding-bottom: 4pt; }

  .score-box { display: flex; align-items: center; gap: 16pt; border-radius: 6pt; padding: 10pt; border: 1pt solid #e2e8f0; }
  .score-box.eligible { background: #f0fdf4; border-color: #bbf7d0; }
  .score-box.sous-conditions { background: #fffbeb; border-color: #fde68a; }
  .score-box.non-eligible { background: #fef2f2; border-color: #fecaca; }
  .score-chiffre { font-size: 22pt; font-weight: 900; color: #0f172a; flex-shrink: 0; }
  .score-chiffre span { font-size: 9pt; font-weight: 600; color: #64748b; }
  .score-texte strong { font-size: 10pt; }
  .score-texte ul { margin: 4pt 0 0; padding-left: 12pt; font-size: 8pt; color: #334155; }

  .data-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  .data-table th { background: #f8fafc; padding: 5pt 6pt; text-align: right; font-size: 7pt; text-transform: uppercase; color: #64748b; border-bottom: 2pt solid #e2e8f0; }
  .data-table th:first-child, .data-table th:nth-child(4) { text-align: left; }
  .data-table td { padding: 4pt 6pt; border-bottom: 1pt solid #f1f5f9; text-align: right; }
  .data-table td:first-child { text-align: left; font-weight: 600; color: #0f172a; }
  .row-total td { font-weight: 800; border-top: 1.5pt solid #0f172a; border-bottom: none; }

  .equilibre-note { font-size: 8pt; font-weight: 700; color: #047857; margin-top: 6pt; }
  .equilibre-note.ko { color: #b91c1c; }

  .niveau-cell { text-align: center !important; font-weight: 700; }
  .niveau-cell.bon { color: #047857; }
  .niveau-cell.moyen { color: #b45309; }
  .niveau-cell.faible { color: #b91c1c; }

  .fiche-footer { margin-top: 16pt; }
  .ff-disclaimer { font-size: 7pt; color: #94a3b8; line-height: 1.4; font-style: italic; border-bottom: 1pt solid #f1f5f9; padding-bottom: 8pt; margin-bottom: 10pt; }
  .ff-signature { display: flex; justify-content: space-between; gap: 40pt; }
  .sig-box { flex: 1; height: 1.5cm; border: 1pt solid #e2e8f0; border-radius: 4pt; display: flex; align-items: flex-start; padding: 4pt; font-size: 6pt; color: #cbd5e1; text-transform: uppercase; }
}
</style>
