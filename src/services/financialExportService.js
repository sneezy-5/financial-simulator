// ═══════════════════════════════════════════════════════════════════════
// ANALYSE FINANCIÈRE OHADA — export Excel (.xlsx), 100% côté navigateur.
// Même logique que server/declarations/declarationsXlsx.js (tableaux AOA →
// feuille XLSX) mais exécutée dans le client, sans aller-retour serveur —
// cohérent avec l'export PDF de FicheAnalyseExport.vue (window.print(), pas
// de backend non plus).
// ═══════════════════════════════════════════════════════════════════════

import * as XLSX from 'xlsx'
import {
  BILAN_ACTIF_STRUCTURE, BILAN_PASSIF_STRUCTURE, CR_STRUCTURE,
  totalActifImmobilise, totalActifCirculant, totalTresorerieActif, totalGeneralActif,
  totalCapitauxPropres, totalDettesFinancieres, totalPassifCirculant, totalTresoreriePassif, totalGeneralPassif,
  calculerSoldesIntermediaires, verifierEquilibreBilan, FAMILLES,
  creerBilanVide, creerCRVide,
} from './financialAnalysisService.js'

const LABEL_NIVEAU_SCORE = {
  'eligible': 'Éligible au financement',
  'sous-conditions': 'Éligible sous conditions',
  'non-eligible': "Non éligible en l'état",
}

function feuilleDepuisAoa(aoa, largeurs) {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = (largeurs || aoa[0].map(() => 22)).map(w => ({ wch: w }))
  return ws
}

function formatValeurRatio(r, valeur) {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return ''
  switch (r.unite) {
    case '%': return Number((valeur * 100).toFixed(2))
    case 'jours': return Math.round(valeur)
    default: return Number(valeur.toFixed(2))
  }
}
function uniteLabel(u) {
  return { '%': '%', 'FCFA': 'FCFA', 'x': 'x', 'jours': 'jours', 'années': 'années' }[u] || ''
}

/** Feuille "Résumé" : entreprise + score de financement. */
function feuilleResume(nom, scoreFinancement) {
  const aoa = [
    ["RAPPORT D'ANALYSE FINANCIÈRE OHADA/SYSCOHADA"],
    [`Entreprise : ${nom || 'Non renseigné'}`],
    [`Date : ${new Date().toLocaleDateString('fr-FR')}`],
    [],
    ['SCORE DE FINANCEMENT'],
    ['Score / 100', scoreFinancement.score],
    ['Verdict', LABEL_NIVEAU_SCORE[scoreFinancement.niveau] || scoreFinancement.niveau],
    [],
    ['Points de vigilance'],
    ...scoreFinancement.motifs.map(m => [m]),
  ]
  return feuilleDepuisAoa(aoa, [50, 20])
}

/** Lignes de postes brutes (sans totaux ni soldes calculés) pour le Bilan Actif+Passif. */
function lignesBilanPostes(bilanN, bilanN1) {
  const aoa = [
    ['BILAN — ACTIF', '', 'N-1', 'N'],
  ]
  BILAN_ACTIF_STRUCTURE.forEach(section => {
    aoa.push([section.section.toUpperCase()])
    section.postes.forEach(p => aoa.push(['', p.label, bilanN1.actif[p.key] || 0, bilanN.actif[p.key] || 0]))
  })
  aoa.push([])
  aoa.push(['BILAN — PASSIF', '', 'N-1', 'N'])
  BILAN_PASSIF_STRUCTURE.forEach(section => {
    aoa.push([section.section.toUpperCase()])
    section.postes.forEach(p => aoa.push(['', p.label, bilanN1.passif[p.key] || 0, bilanN.passif[p.key] || 0]))
  })
  return aoa
}

/** Lignes de postes brutes (sans soldes intermédiaires calculés) pour le Compte de Résultat. */
function lignesCRPostes(crN, crN1) {
  const aoa = [
    ['COMPTE DE RÉSULTAT', '', 'N-1', 'N'],
  ]
  CR_STRUCTURE.forEach(section => {
    aoa.push([section.section.toUpperCase()])
    section.postes.forEach(p => aoa.push(['', (p.signe > 0 ? '+ ' : '− ') + p.label, crN1[p.key] || 0, crN[p.key] || 0]))
  })
  return aoa
}

/** Feuille "Bilan" (export) : détail complet Actif/Passif + totaux + équilibre. */
function feuilleBilan(bilanN, bilanN1) {
  const eqN = verifierEquilibreBilan(bilanN)
  const eqN1 = verifierEquilibreBilan(bilanN1)
  const aoa = lignesBilanPostes(bilanN, bilanN1)
  // Insère le total actif juste avant la ligne vide qui précède "BILAN — PASSIF"
  const sepIndex = aoa.findIndex(row => row.length === 0)
  aoa.splice(sepIndex, 0, ['', 'TOTAL GÉNÉRAL ACTIF', totalGeneralActif(bilanN1.actif), totalGeneralActif(bilanN.actif)])
  aoa.push(['', 'TOTAL GÉNÉRAL PASSIF', totalGeneralPassif(bilanN1.passif), totalGeneralPassif(bilanN.passif)])
  aoa.push([])
  aoa.push(['Équilibre N-1', eqN1.equilibre ? 'OK' : `Écart de ${eqN1.ecart}`])
  aoa.push(['Équilibre N', eqN.equilibre ? 'OK' : `Écart de ${eqN.ecart}`])
  return feuilleDepuisAoa(aoa, [4, 55, 18, 18])
}

/** Feuille "Compte de Résultat" (export) : détail complet + soldes intermédiaires. */
function feuilleCR(crN, crN1) {
  const sigN = calculerSoldesIntermediaires(crN)
  const sigN1 = calculerSoldesIntermediaires(crN1)
  const aoa = lignesCRPostes(crN, crN1)
  aoa.push([])
  aoa.push(['SOLDES INTERMÉDIAIRES DE GESTION', '', 'N-1', 'N'])
  aoa.push(['', 'Valeur ajoutée', sigN1.valeurAjoutee, sigN.valeurAjoutee])
  aoa.push(['', "Excédent brut d'exploitation (EBE)", sigN1.ebe, sigN.ebe])
  aoa.push(['', "Résultat d'exploitation", sigN1.resultatExploitation, sigN.resultatExploitation])
  aoa.push(['', 'Résultat financier', sigN1.resultatFinancier, sigN.resultatFinancier])
  aoa.push(['', 'Résultat des activités ordinaires (RAO)', sigN1.rao, sigN.rao])
  aoa.push(['', 'Résultat HAO', sigN1.resultatHAO, sigN.resultatHAO])
  aoa.push(['', 'Résultat net', sigN1.resultatNet, sigN.resultatNet])
  aoa.push(["", "Capacité d'autofinancement globale (CAFG)", sigN1.cafg, sigN.cafg])
  return feuilleDepuisAoa(aoa, [4, 55, 18, 18])
}

/** Feuille "Ratios" : les 26 ratios, groupés par famille. */
function feuilleRatios(ratios) {
  const aoa = [
    ['Famille', 'Indicateur', 'Valeur N', 'Valeur N-1', 'Unité', 'Évolution (%)', 'Niveau'],
  ]
  Object.values(FAMILLES).forEach(famille => {
    ratios.filter(r => r.famille === famille).forEach(r => {
      aoa.push([
        famille,
        r.label,
        formatValeurRatio(r, r.valeurN),
        r.valeurN1 !== null ? formatValeurRatio(r, r.valeurN1) : '',
        uniteLabel(r.unite),
        r.evolution !== null ? Number((r.evolution * 100).toFixed(1)) : '',
        r.niveau === 'bon' ? 'Bon' : r.niveau === 'moyen' ? 'Moyen' : 'Faible',
      ])
    })
  })
  return feuilleDepuisAoa(aoa, [26, 46, 12, 12, 10, 14, 10])
}

/**
 * Génère et télécharge le classeur Excel complet (4 feuilles).
 * @param {{nom, bilanN, bilanN1, crN, crN1, ratios, scoreFinancement}} data
 */
export function exporterClasseurExcel({ nom, bilanN, bilanN1, crN, crN1, ratios, scoreFinancement }) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, feuilleResume(nom, scoreFinancement), 'Résumé')
  XLSX.utils.book_append_sheet(wb, feuilleBilan(bilanN, bilanN1), 'Bilan')
  XLSX.utils.book_append_sheet(wb, feuilleCR(crN, crN1), 'Compte de Résultat')
  XLSX.utils.book_append_sheet(wb, feuilleRatios(ratios), 'Ratios')

  const nomFichier = `Analyse-Financiere-${(nom || 'entreprise').replace(/[^a-z0-9]+/gi, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, nomFichier)
}

// ─────────────────────────────────────────────────────────────────────────
// MODÈLE VIERGE À REMPLIR ET RÉIMPORTER
// ─────────────────────────────────────────────────────────────────────────

function feuilleInstructions() {
  const aoa = [
    ['MODÈLE BILAN & COMPTE DE RÉSULTAT — ANALYSE FINANCIÈRE OHADA'],
    [],
    ["Comment remplir ce fichier :"],
    ["1. Complétez les colonnes N-1 et N sur les feuilles \"Bilan\" et \"Compte de Résultat\"."],
    ["2. Ne renommez pas les libellés (colonne B) et n'ajoutez pas de nouvelle ligne — la ré-importation retrouve chaque poste par son libellé exact."],
    ["3. Vous pouvez laisser à 0 les postes qui ne vous concernent pas."],
    ["4. Une fois rempli, réimportez ce fichier depuis l'écran \"Analyse Financière\" de l'application."],
  ]
  return feuilleDepuisAoa(aoa, [90])
}

/** Génère et télécharge un modèle vierge (mêmes libellés que l'export, sans les
 *  lignes calculées — totaux, équilibre, soldes intermédiaires) à remplir puis réimporter. */
export function genererModeleImport() {
  const bilanVide = creerBilanVide()
  const crVide = creerCRVide()
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, feuilleInstructions(), 'Instructions')
  XLSX.utils.book_append_sheet(wb, feuilleDepuisAoa(lignesBilanPostes(bilanVide, bilanVide), [4, 55, 18, 18]), 'Bilan')
  XLSX.utils.book_append_sheet(wb, feuilleDepuisAoa(lignesCRPostes(crVide, crVide), [4, 55, 18, 18]), 'Compte de Résultat')
  XLSX.writeFile(wb, 'Modele-Analyse-Financiere-OHADA.xlsx')
}

// ─────────────────────────────────────────────────────────────────────────
// RÉIMPORT DU MODÈLE REMPLI
// ─────────────────────────────────────────────────────────────────────────

/** Construit un index libellé → clé de poste pour une structure Bilan/CR donnée. */
function indexParLabel(structure, options = {}) {
  const index = new Map()
  structure.forEach(section => section.postes.forEach(p => {
    const label = options.crSigne ? (p.signe > 0 ? '+ ' : '− ') + p.label : p.label
    index.set(label, p.key)
  }))
  return index
}

function n(v) { return Number(v) || 0 }

/** Libellés de titres de section / lignes calculées à ignorer sans les compter en "non reconnus". */
const LIGNES_BILAN_IGNOREES = new Set([
  'BILAN — ACTIF', 'BILAN — PASSIF', 'TOTAL GÉNÉRAL ACTIF', 'TOTAL GÉNÉRAL PASSIF',
  'Équilibre N-1', 'Équilibre N',
  ...BILAN_ACTIF_STRUCTURE.map(s => s.section.toUpperCase()),
  ...BILAN_PASSIF_STRUCTURE.map(s => s.section.toUpperCase()),
])
const LIGNES_CR_IGNOREES = new Set([
  'COMPTE DE RÉSULTAT', 'SOLDES INTERMÉDIAIRES DE GESTION',
  'Valeur ajoutée', "Excédent brut d'exploitation (EBE)", "Résultat d'exploitation",
  'Résultat financier', 'Résultat des activités ordinaires (RAO)', 'Résultat HAO',
  'Résultat net', "Capacité d'autofinancement globale (CAFG)",
  ...CR_STRUCTURE.map(s => s.section.toUpperCase()),
])

/** Lit un File (input[type=file]) et retourne son ArrayBuffer. */
function lireFichierArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Lecture du fichier impossible'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Lit un classeur Excel généré par `genererModeleImport()` (ou l'export complet,
 * qui a la même forme) et reconstruit bilanN/bilanN1/crN/crN1.
 * Un poste dont le libellé ne correspond à rien (ligne renommée/supprimée) reste
 * à 0 et remonte dans `postesNonReconnus` plutôt que d'être deviné.
 * @returns {Promise<{bilanN, bilanN1, crN, crN1, postesReconnus:number, postesTotal:number, postesNonReconnus:string[]}>}
 */
export async function importerClasseurExcel(file) {
  const buffer = await lireFichierArrayBuffer(file)
  const wb = XLSX.read(buffer, { type: 'array' })

  const bilanN = creerBilanVide()
  const bilanN1 = creerBilanVide()
  const crN = creerCRVide()
  const crN1 = creerCRVide()

  let postesReconnus = 0
  let postesTotal = 0
  const postesNonReconnus = []

  function appliquerFeuille(nomFeuille, remplir) {
    const sheet = wb.Sheets[nomFeuille]
    if (!sheet) return
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    rows.forEach(row => remplir(row))
  }

  const indexActif = indexParLabel(BILAN_ACTIF_STRUCTURE)
  const indexPassif = indexParLabel(BILAN_PASSIF_STRUCTURE)
  postesTotal += indexActif.size + indexPassif.size
  appliquerFeuille('Bilan', (row) => {
    const [, label, valN1, valN] = row
    if (!label) return
    if (indexActif.has(label)) {
      postesReconnus++
      bilanN.actif[indexActif.get(label)] = n(valN)
      bilanN1.actif[indexActif.get(label)] = n(valN1)
    } else if (indexPassif.has(label)) {
      postesReconnus++
      bilanN.passif[indexPassif.get(label)] = n(valN)
      bilanN1.passif[indexPassif.get(label)] = n(valN1)
    } else if (LIGNES_BILAN_IGNOREES.has(String(label))) {
      // titre de section / total / équilibre : ligne calculée, pas un poste à importer
    } else {
      postesNonReconnus.push(label)
    }
  })

  const indexCR = indexParLabel(CR_STRUCTURE, { crSigne: true })
  postesTotal += indexCR.size
  appliquerFeuille('Compte de Résultat', (row) => {
    const [, label, valN1, valN] = row
    if (!label) return
    if (indexCR.has(label)) {
      postesReconnus++
      crN[indexCR.get(label)] = n(valN)
      crN1[indexCR.get(label)] = n(valN1)
    } else if (LIGNES_CR_IGNOREES.has(String(label))) {
      // titre de section / soldes intermédiaires : ligne calculée, pas un poste à importer
    } else {
      postesNonReconnus.push(label)
    }
  })

  return { bilanN, bilanN1, crN, crN1, postesReconnus, postesTotal, postesNonReconnus }
}
