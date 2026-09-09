// ═══════════════════════════════════════════════════════════════════════
// ANALYSE FINANCIÈRE OHADA/SYSCOHADA — service de calcul pur (sans Vue)
//
// ⚠️ À FAIRE AVANT MISE EN PRODUCTION : les intitulés de postes du Bilan/CR
// et les formules des soldes intermédiaires de gestion (SIG) ci-dessous sont
// reconstitués du référentiel SYSCOHADA révisé (Acte Uniforme AUDCIF 2017) et
// simplifiés à certains endroits (voir commentaires « simplifié »). Ils
// doivent être relus et validés par un comptable connaissant le SYSCOHADA
// avant toute utilisation réelle pour un dossier de financement — cf. plan de
// dev (Lot 1). Idem pour les seuils vert/orange/rouge de SEUILS_DEFAUT, qui
// sont des repères indicatifs et non des normes bancaires officielles.
// ═══════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// STRUCTURE DU BILAN (Système Normal)
// ─────────────────────────────────────────────────────────────────────────

export const BILAN_ACTIF_STRUCTURE = [
  {
    section: 'Actif immobilisé',
    postes: [
      { key: 'chargesImmobilisees', label: "Charges immobilisées (frais d'établissement, charges à répartir)" },
      { key: 'immobilisationsIncorporelles', label: 'Immobilisations incorporelles (brevets, licences, logiciels, fonds commercial)' },
      { key: 'terrains', label: 'Terrains' },
      { key: 'batiments', label: 'Bâtiments' },
      { key: 'installationsAgencements', label: 'Installations et agencements' },
      { key: 'materielMobilier', label: 'Matériel, mobilier et actifs biologiques' },
      { key: 'materielTransport', label: 'Matériel de transport' },
      { key: 'avancesImmobilisations', label: 'Avances et acomptes versés sur immobilisations' },
      { key: 'immobilisationsFinancieres', label: 'Immobilisations financières (titres de participation, autres)' },
    ]
  },
  {
    section: 'Actif circulant',
    postes: [
      { key: 'actifCirculantHAO', label: 'Actif circulant HAO (hors activités ordinaires)' },
      { key: 'stocks', label: 'Stocks et en-cours' },
      { key: 'fournisseursAvancesVersees', label: 'Fournisseurs, avances versées' },
      { key: 'clients', label: 'Clients' },
      { key: 'autresCreances', label: 'Autres créances' },
    ]
  },
  {
    section: 'Trésorerie-actif',
    postes: [
      { key: 'titresPlacement', label: 'Titres de placement' },
      { key: 'valeursAEncaisser', label: 'Valeurs à encaisser' },
      { key: 'banquesCaisses', label: 'Banques, chèques postaux, caisse' },
    ]
  },
  {
    section: 'Écart de conversion',
    postes: [
      { key: 'ecartConversionActif', label: 'Écart de conversion-actif' },
    ]
  }
]

export const BILAN_PASSIF_STRUCTURE = [
  {
    section: 'Capitaux propres et ressources assimilées',
    postes: [
      { key: 'capital', label: 'Capital' },
      { key: 'apporteursCapitalNonAppele', label: 'Apporteurs, capital non appelé (-)' },
      { key: 'primesEtReserves', label: "Primes et réserves (primes d'apport/fusion, réserves)" },
      { key: 'ecartsReevaluation', label: 'Écarts de réévaluation' },
      { key: 'reportANouveau', label: 'Report à nouveau (+/-)' },
      { key: 'resultatNetExercice', label: "Résultat net de l'exercice (+/-)" },
      { key: 'subventionsInvestissement', label: "Subventions d'investissement" },
      { key: 'provisionsReglementees', label: 'Provisions réglementées' },
    ]
  },
  {
    section: 'Dettes financières et ressources assimilées',
    postes: [
      { key: 'empruntsDettesFinancieres', label: 'Emprunts et dettes financières diverses' },
      { key: 'dettesLocationAcquisition', label: 'Dettes de location acquisition' },
      { key: 'provisionsRisquesCharges', label: 'Provisions pour risques et charges (long terme)' },
    ]
  },
  {
    section: 'Passif circulant',
    postes: [
      { key: 'dettesCirculantesHAO', label: 'Dettes circulantes HAO' },
      { key: 'clientsAvancesRecues', label: 'Clients, avances reçues' },
      { key: 'fournisseursExploitation', label: "Fournisseurs d'exploitation" },
      { key: 'dettesFiscalesSociales', label: 'Dettes fiscales et sociales' },
      { key: 'autresDettes', label: 'Autres dettes' },
      { key: 'provisionsRisquesCourtTerme', label: 'Provisions pour risques à court terme' },
    ]
  },
  {
    section: 'Trésorerie-passif',
    postes: [
      { key: 'banquesCreditsEscompte', label: "Banques, crédits d'escompte" },
      { key: 'banquesCreditsTresorerie', label: 'Banques, crédits de trésorerie' },
    ]
  },
  {
    section: 'Écart de conversion',
    postes: [
      { key: 'ecartConversionPassif', label: 'Écart de conversion-passif' },
    ]
  }
]

// ─────────────────────────────────────────────────────────────────────────
// STRUCTURE DU COMPTE DE RÉSULTAT (Système Normal)
// signe: 1 = produit (augmente le résultat), -1 = charge (le diminue)
// ─────────────────────────────────────────────────────────────────────────

export const CR_STRUCTURE = [
  {
    section: "Activité d'exploitation",
    postes: [
      { key: 'chiffreAffaires', label: "Chiffre d'affaires", signe: 1 },
      { key: 'productionStockee', label: 'Production stockée (+/-)', signe: 1 },
      { key: 'productionImmobilisee', label: 'Production immobilisée', signe: 1 },
      { key: 'produitsAccessoires', label: 'Produits accessoires', signe: 1 },
      { key: 'subventionsExploitation', label: "Subventions d'exploitation", signe: 1 },
      { key: 'autresProduits', label: 'Autres produits', signe: 1 },
      { key: 'achatsMarchandises', label: 'Achats de marchandises', signe: -1 },
      { key: 'variationStocksMarchandises', label: 'Variation de stocks de marchandises (+/-)', signe: -1 },
      { key: 'achatsMatieresPremieres', label: 'Achats de matières premières et fournitures liées', signe: -1 },
      { key: 'variationStocksMP', label: 'Variation de stocks de matières premières (+/-)', signe: -1 },
      { key: 'autresAchats', label: 'Autres achats', signe: -1 },
      { key: 'transports', label: 'Transports', signe: -1 },
      { key: 'servicesExterieurs', label: 'Services extérieurs', signe: -1 },
      { key: 'impotsTaxes', label: 'Impôts et taxes', signe: -1 },
      { key: 'autresCharges', label: 'Autres charges', signe: -1 },
      { key: 'chargesPersonnel', label: 'Charges de personnel', signe: -1 },
      { key: 'dotationsAmortissementsExploitation', label: "Dotations aux amortissements et provisions d'exploitation", signe: -1 },
      { key: 'reprisesAmortissementsExploitation', label: "Reprises d'amortissements et provisions d'exploitation", signe: 1 },
    ]
  },
  {
    section: 'Activité financière',
    postes: [
      { key: 'revenusFinanciers', label: 'Revenus financiers et assimilés', signe: 1 },
      { key: 'reprisesProvisionsFinancieres', label: 'Reprises de provisions financières', signe: 1 },
      { key: 'chargesFinancieres', label: 'Charges financières', signe: -1 },
      { key: 'dotationsProvisionsFinancieres', label: 'Dotations aux provisions financières', signe: -1 },
    ]
  },
  {
    section: 'Hors activités ordinaires (HAO)',
    postes: [
      { key: 'produitsHAO', label: "Produits des cessions d'immobilisations et autres produits HAO", signe: 1 },
      { key: 'chargesHAO', label: 'Valeurs comptables des cessions et autres charges HAO', signe: -1 },
    ]
  },
  {
    section: 'Participation et impôts',
    postes: [
      { key: 'participationTravailleurs', label: 'Participation des travailleurs', signe: -1 },
      { key: 'impotsResultat', label: 'Impôts sur le résultat', signe: -1 },
    ]
  }
]

// ─────────────────────────────────────────────────────────────────────────
// CRÉATION D'ÉTATS VIDES
// ─────────────────────────────────────────────────────────────────────────

function initValeurs(structure) {
  const obj = {}
  structure.forEach(section => section.postes.forEach(p => { obj[p.key] = 0 }))
  return obj
}

export function creerBilanVide() {
  return { actif: initValeurs(BILAN_ACTIF_STRUCTURE), passif: initValeurs(BILAN_PASSIF_STRUCTURE) }
}

export function creerCRVide() {
  return initValeurs(CR_STRUCTURE)
}

// ─────────────────────────────────────────────────────────────────────────
// AGRÉGATS DU BILAN
// ─────────────────────────────────────────────────────────────────────────

function n(v) { return Number(v) || 0 }
function sommeGroupe(valeurs, cles) { return cles.reduce((acc, k) => acc + n(valeurs[k]), 0) }

export function totalActifImmobilise(actif) {
  return sommeGroupe(actif, ['chargesImmobilisees', 'immobilisationsIncorporelles', 'terrains', 'batiments', 'installationsAgencements', 'materielMobilier', 'materielTransport', 'avancesImmobilisations', 'immobilisationsFinancieres'])
}
export function totalActifCirculant(actif) {
  return sommeGroupe(actif, ['actifCirculantHAO', 'stocks', 'fournisseursAvancesVersees', 'clients', 'autresCreances'])
}
export function totalTresorerieActif(actif) {
  return sommeGroupe(actif, ['titresPlacement', 'valeursAEncaisser', 'banquesCaisses'])
}
export function totalGeneralActif(actif) {
  return totalActifImmobilise(actif) + totalActifCirculant(actif) + totalTresorerieActif(actif) + n(actif.ecartConversionActif)
}
export function totalCapitauxPropres(passif) {
  return sommeGroupe(passif, ['capital', 'apporteursCapitalNonAppele', 'primesEtReserves', 'ecartsReevaluation', 'reportANouveau', 'resultatNetExercice', 'subventionsInvestissement', 'provisionsReglementees'])
}
export function totalDettesFinancieres(passif) {
  return sommeGroupe(passif, ['empruntsDettesFinancieres', 'dettesLocationAcquisition', 'provisionsRisquesCharges'])
}
export function totalRessourcesStables(passif) {
  return totalCapitauxPropres(passif) + totalDettesFinancieres(passif)
}
export function totalPassifCirculant(passif) {
  return sommeGroupe(passif, ['dettesCirculantesHAO', 'clientsAvancesRecues', 'fournisseursExploitation', 'dettesFiscalesSociales', 'autresDettes', 'provisionsRisquesCourtTerme'])
}
export function totalTresoreriePassif(passif) {
  return sommeGroupe(passif, ['banquesCreditsEscompte', 'banquesCreditsTresorerie'])
}
export function totalGeneralPassif(passif) {
  return totalRessourcesStables(passif) + totalPassifCirculant(passif) + totalTresoreriePassif(passif) + n(passif.ecartConversionPassif)
}

/** Vérifie l'équilibre Actif = Passif (tolérance 1 FCFA pour l'arrondi). */
export function verifierEquilibreBilan(bilan) {
  const totalActif = totalGeneralActif(bilan.actif)
  const totalPassif = totalGeneralPassif(bilan.passif)
  const ecart = Math.round((totalActif - totalPassif) * 100) / 100
  return { totalActif, totalPassif, ecart, equilibre: Math.abs(ecart) < 1 }
}

// ─────────────────────────────────────────────────────────────────────────
// SOLDES INTERMÉDIAIRES DE GESTION (Compte de Résultat)
// Simplifié : ne distingue pas marge commerciale (marchandises) de la
// production (biens/services) — le chiffre d'affaires est traité comme un
// seul bloc. À affiner si la ventilation négoce/production est nécessaire.
// ─────────────────────────────────────────────────────────────────────────

export function calculerSoldesIntermediaires(cr) {
  const productionExercice = n(cr.chiffreAffaires) + n(cr.productionStockee) + n(cr.productionImmobilisee)
  const consommations = n(cr.achatsMarchandises) + n(cr.variationStocksMarchandises) + n(cr.achatsMatieresPremieres) + n(cr.variationStocksMP) + n(cr.autresAchats) + n(cr.transports) + n(cr.servicesExterieurs)
  const valeurAjoutee = productionExercice + n(cr.produitsAccessoires) - consommations
  const ebe = valeurAjoutee + n(cr.subventionsExploitation) - n(cr.impotsTaxes) - n(cr.chargesPersonnel)
  const resultatExploitation = ebe + n(cr.autresProduits) + n(cr.reprisesAmortissementsExploitation) - n(cr.autresCharges) - n(cr.dotationsAmortissementsExploitation)
  const resultatFinancier = n(cr.revenusFinanciers) + n(cr.reprisesProvisionsFinancieres) - n(cr.chargesFinancieres) - n(cr.dotationsProvisionsFinancieres)
  const rao = resultatExploitation + resultatFinancier // Résultat des Activités Ordinaires
  const resultatHAO = n(cr.produitsHAO) - n(cr.chargesHAO)
  const resultatNet = rao + resultatHAO - n(cr.participationTravailleurs) - n(cr.impotsResultat)
  // CAFG simplifiée (méthode indirecte, sans retraiter les cessions HAO)
  const cafg = resultatNet + n(cr.dotationsAmortissementsExploitation) + n(cr.dotationsProvisionsFinancieres) - n(cr.reprisesAmortissementsExploitation) - n(cr.reprisesProvisionsFinancieres)
  return {
    chiffreAffaires: n(cr.chiffreAffaires),
    productionExercice, consommations, valeurAjoutee, ebe,
    resultatExploitation, resultatFinancier, rao, resultatHAO, resultatNet, cafg,
    chargesPersonnel: n(cr.chargesPersonnel),
    chargesFinancieres: n(cr.chargesFinancieres),
  }
}

/** Calcule tous les agrégats (bilan + CR) d'un exercice pour usage par les ratios. */
export function calculerAgregats(bilan, cr) {
  const actif = bilan.actif, passif = bilan.passif
  return {
    totalActifImmobilise: totalActifImmobilise(actif),
    totalActifCirculant: totalActifCirculant(actif),
    totalTresorerieActif: totalTresorerieActif(actif),
    totalGeneralActif: totalGeneralActif(actif),
    totalCapitauxPropres: totalCapitauxPropres(passif),
    totalDettesFinancieres: totalDettesFinancieres(passif),
    totalRessourcesStables: totalRessourcesStables(passif),
    totalPassifCirculant: totalPassifCirculant(passif),
    totalTresoreriePassif: totalTresoreriePassif(passif),
    totalGeneralPassif: totalGeneralPassif(passif),
    stocks: n(actif.stocks),
    clients: n(actif.clients),
    fournisseursExploitation: n(passif.fournisseursExploitation),
    ...calculerSoldesIntermediaires(cr),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// LES 26 RATIOS, EN 4 FAMILLES
// sens: 'haut' = plus c'est haut mieux c'est ; 'bas' = plus c'est bas mieux c'est
// ─────────────────────────────────────────────────────────────────────────

function diviser(num, den) { return den ? num / den : 0 }

export const FAMILLES = {
  STRUCTURE: 'Structure financière et liquidité',
  COUVERTURE_DETTE: 'Couverture de la dette',
  RENTABILITE: 'Rentabilité',
  ACTIVITE: 'Activité et pilotage',
}

/**
 * Chaque ratio : { id, label, famille, unite, sens, calcul(agg) }
 * `calcul` reçoit l'objet d'agrégats (calculerAgregats) d'UN exercice et
 * renvoie la valeur du ratio pour cet exercice.
 */
export const RATIOS_DEFINITIONS = [
  // ── Structure financière et liquidité ──
  { id: 'fondsDeRoulement', label: 'Fonds de roulement (FR)', famille: FAMILLES.STRUCTURE, unite: 'FCFA', sens: 'haut',
    calcul: a => a.totalRessourcesStables - a.totalActifImmobilise },
  { id: 'besoinFondsDeRoulement', label: 'Besoin en fonds de roulement (BFR)', famille: FAMILLES.STRUCTURE, unite: 'FCFA', sens: 'bas',
    calcul: a => a.totalActifCirculant - a.totalPassifCirculant },
  { id: 'tresorerieNette', label: 'Trésorerie nette', famille: FAMILLES.STRUCTURE, unite: 'FCFA', sens: 'haut',
    calcul: a => (a.totalRessourcesStables - a.totalActifImmobilise) - (a.totalActifCirculant - a.totalPassifCirculant) },
  { id: 'liquiditeGenerale', label: 'Ratio de liquidité générale', famille: FAMILLES.STRUCTURE, unite: 'x', sens: 'haut',
    calcul: a => diviser(a.totalActifCirculant + a.totalTresorerieActif, a.totalPassifCirculant + a.totalTresoreriePassif) },
  { id: 'liquiditeReduite', label: 'Ratio de liquidité réduite', famille: FAMILLES.STRUCTURE, unite: 'x', sens: 'haut',
    calcul: a => diviser(a.totalActifCirculant - a.stocks + a.totalTresorerieActif, a.totalPassifCirculant + a.totalTresoreriePassif) },
  { id: 'liquiditeImmediate', label: 'Ratio de liquidité immédiate', famille: FAMILLES.STRUCTURE, unite: 'x', sens: 'haut',
    calcul: a => diviser(a.totalTresorerieActif, a.totalPassifCirculant + a.totalTresoreriePassif) },
  { id: 'autonomieFinanciere', label: 'Autonomie financière', famille: FAMILLES.STRUCTURE, unite: '%', sens: 'haut',
    calcul: a => diviser(a.totalCapitauxPropres, a.totalGeneralActif) },
  { id: 'tauxEndettementGlobal', label: "Taux d'endettement global", famille: FAMILLES.STRUCTURE, unite: '%', sens: 'bas',
    calcul: a => diviser(a.totalDettesFinancieres + a.totalPassifCirculant + a.totalTresoreriePassif, a.totalGeneralActif) },

  // ── Couverture de la dette ──
  { id: 'capaciteRemboursement', label: 'Capacité de remboursement (dettes financières / CAFG)', famille: FAMILLES.COUVERTURE_DETTE, unite: 'années', sens: 'bas',
    calcul: a => diviser(a.totalDettesFinancieres, a.cafg) },
  { id: 'couvertureInterets', label: 'Couverture des intérêts (EBE / charges financières)', famille: FAMILLES.COUVERTURE_DETTE, unite: 'x', sens: 'haut',
    calcul: a => diviser(a.ebe, a.chargesFinancieres) },
  { id: 'gearing', label: 'Gearing (dettes financières / capitaux propres)', famille: FAMILLES.COUVERTURE_DETTE, unite: '%', sens: 'bas',
    calcul: a => diviser(a.totalDettesFinancieres, a.totalCapitauxPropres) },
  { id: 'financementImmobilisations', label: 'Financement des immobilisations (ressources stables / actif immobilisé)', famille: FAMILLES.COUVERTURE_DETTE, unite: 'x', sens: 'haut',
    calcul: a => diviser(a.totalRessourcesStables, a.totalActifImmobilise) },
  { id: 'independanceFinanciereTerme', label: 'Indépendance financière à terme (dettes financières / ressources stables)', famille: FAMILLES.COUVERTURE_DETTE, unite: '%', sens: 'bas',
    calcul: a => diviser(a.totalDettesFinancieres, a.totalRessourcesStables) },

  // ── Rentabilité ──
  { id: 'margeBrute', label: 'Marge brute d\'exploitation', famille: FAMILLES.RENTABILITE, unite: '%', sens: 'haut',
    calcul: a => diviser(a.productionExercice - a.consommations, a.chiffreAffaires) },
  { id: 'margeNette', label: 'Marge nette', famille: FAMILLES.RENTABILITE, unite: '%', sens: 'haut',
    calcul: a => diviser(a.resultatNet, a.chiffreAffaires) },
  { id: 'tauxEBE', label: "Taux d'EBE (EBE / CA)", famille: FAMILLES.RENTABILITE, unite: '%', sens: 'haut',
    calcul: a => diviser(a.ebe, a.chiffreAffaires) },
  { id: 'rentabiliteEconomique', label: 'Rentabilité économique — ROA (résultat exploitation / total bilan)', famille: FAMILLES.RENTABILITE, unite: '%', sens: 'haut',
    calcul: a => diviser(a.resultatExploitation, a.totalGeneralActif) },
  { id: 'rentabiliteFinanciere', label: 'Rentabilité financière — ROE (résultat net / capitaux propres)', famille: FAMILLES.RENTABILITE, unite: '%', sens: 'haut',
    calcul: a => diviser(a.resultatNet, a.totalCapitauxPropres) },
  { id: 'tauxValeurAjoutee', label: "Taux de valeur ajoutée (VA / CA)", famille: FAMILLES.RENTABILITE, unite: '%', sens: 'haut',
    calcul: a => diviser(a.valeurAjoutee, a.chiffreAffaires) },
  { id: 'poidsChargesPersonnel', label: 'Poids des charges de personnel (/ valeur ajoutée)', famille: FAMILLES.RENTABILITE, unite: '%', sens: 'bas',
    calcul: a => diviser(a.chargesPersonnel, a.valeurAjoutee) },

  // ── Activité et pilotage ──
  { id: 'rotationStocks', label: 'Rotation des stocks', famille: FAMILLES.ACTIVITE, unite: 'jours', sens: 'bas',
    calcul: a => diviser(a.stocks, a.consommations) * 360 },
  { id: 'delaiClients', label: 'Délai de recouvrement clients', famille: FAMILLES.ACTIVITE, unite: 'jours', sens: 'bas',
    calcul: a => diviser(a.clients, a.chiffreAffaires) * 360 },
  { id: 'delaiFournisseurs', label: 'Délai de règlement fournisseurs', famille: FAMILLES.ACTIVITE, unite: 'jours', sens: 'haut',
    calcul: a => diviser(a.fournisseursExploitation, a.consommations) * 360 },
  { id: 'rotationActif', label: "Rotation de l'actif (CA / total bilan)", famille: FAMILLES.ACTIVITE, unite: 'x', sens: 'haut',
    calcul: a => diviser(a.chiffreAffaires, a.totalGeneralActif) },
  { id: 'evolutionCA', label: "Croissance du chiffre d'affaires", famille: FAMILLES.ACTIVITE, unite: '%', sens: 'haut',
    calcul: null }, // calculé séparément (N vs N-1), voir calculerRatios
  { id: 'evolutionResultatNet', label: 'Croissance du résultat net', famille: FAMILLES.ACTIVITE, unite: '%', sens: 'haut',
    calcul: null },
]

// ─────────────────────────────────────────────────────────────────────────
// SEUILS PAR DÉFAUT (indicatifs — personnalisables par banque/secteur)
// ─────────────────────────────────────────────────────────────────────────

export const SEUILS_DEFAUT = {
  liquiditeGenerale: { bon: 1.5, moyen: 1 },
  liquiditeReduite: { bon: 1, moyen: 0.7 },
  liquiditeImmediate: { bon: 0.3, moyen: 0.15 },
  autonomieFinanciere: { bon: 0.3, moyen: 0.2 },
  tauxEndettementGlobal: { bon: 0.5, moyen: 0.65 },
  capaciteRemboursement: { bon: 3, moyen: 5 },
  couvertureInterets: { bon: 4, moyen: 2 },
  gearing: { bon: 1, moyen: 2 },
  financementImmobilisations: { bon: 1.2, moyen: 1 },
  independanceFinanciereTerme: { bon: 0.5, moyen: 0.65 },
  margeBrute: { bon: 0.3, moyen: 0.15 },
  margeNette: { bon: 0.05, moyen: 0.02 },
  tauxEBE: { bon: 0.15, moyen: 0.08 },
  rentabiliteEconomique: { bon: 0.08, moyen: 0.04 },
  rentabiliteFinanciere: { bon: 0.12, moyen: 0.06 },
  tauxValeurAjoutee: { bon: 0.3, moyen: 0.15 },
  poidsChargesPersonnel: { bon: 0.5, moyen: 0.65 },
  rotationStocks: { bon: 60, moyen: 90 },
  delaiClients: { bon: 45, moyen: 60 },
  delaiFournisseurs: { bon: 60, moyen: 45 },
  rotationActif: { bon: 1.5, moyen: 1 },
  evolutionCA: { bon: 0.05, moyen: 0 },
  evolutionResultatNet: { bon: 0.05, moyen: 0 },
}

/** Classe une valeur en 'bon' | 'moyen' | 'faible' selon le sens et les seuils. */
function classer(valeur, seuil, sens) {
  if (!seuil) return 'moyen'
  const { bon, moyen } = seuil
  if (sens === 'haut') {
    if (valeur >= bon) return 'bon'
    if (valeur >= moyen) return 'moyen'
    return 'faible'
  }
  // sens === 'bas' : plus petit est meilleur
  if (valeur <= bon) return 'bon'
  if (valeur <= moyen) return 'moyen'
  return 'faible'
}

/**
 * Calcule les 26 ratios pour l'exercice N (avec évolution vs N-1).
 * @returns {Array} liste de { id, label, famille, unite, sens, valeurN, valeurN1, evolution, niveau }
 */
export function calculerRatios(bilanN, bilanN1, crN, crN1, seuils = SEUILS_DEFAUT) {
  const aggN = calculerAgregats(bilanN, crN)
  const aggN1 = calculerAgregats(bilanN1, crN1)

  return RATIOS_DEFINITIONS.map(def => {
    let valeurN, valeurN1
    if (def.id === 'evolutionCA') {
      valeurN = diviser(aggN.chiffreAffaires - aggN1.chiffreAffaires, Math.abs(aggN1.chiffreAffaires))
      valeurN1 = null
    } else if (def.id === 'evolutionResultatNet') {
      valeurN = diviser(aggN.resultatNet - aggN1.resultatNet, Math.abs(aggN1.resultatNet))
      valeurN1 = null
    } else {
      valeurN = def.calcul(aggN)
      valeurN1 = def.calcul(aggN1)
    }
    const evolution = (valeurN1 !== null && valeurN1 !== 0) ? diviser(valeurN - valeurN1, Math.abs(valeurN1)) : null
    return {
      id: def.id, label: def.label, famille: def.famille, unite: def.unite, sens: def.sens,
      valeurN, valeurN1, evolution,
      niveau: classer(valeurN, seuils[def.id], def.sens),
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────
// SCORE DE FINANCEMENT BANCAIRE
// ─────────────────────────────────────────────────────────────────────────

/**
 * Synthétise les ratios en un score /100 et un verdict d'éligibilité.
 * Poids simplifié : chaque ratio compte pour 1 point, bon=1, moyen=0.5, faible=0.
 * @returns {{score:number, niveau:'eligible'|'sous-conditions'|'non-eligible', motifs:string[]}}
 */
export function calculerScoreFinancement(ratios) {
  const total = ratios.length
  const points = ratios.reduce((acc, r) => acc + (r.niveau === 'bon' ? 1 : r.niveau === 'moyen' ? 0.5 : 0), 0)
  const score = Math.round((points / total) * 100)

  const motifs = ratios
    .filter(r => r.niveau === 'faible')
    .slice(0, 5)
    .map(r => `${r.label} en zone de vigilance`)

  let niveau
  if (score >= 70) niveau = 'eligible'
  else if (score >= 45) niveau = 'sous-conditions'
  else niveau = 'non-eligible'

  if (niveau === 'eligible' && motifs.length === 0) {
    motifs.push('Tous les indicateurs clés sont dans les normes attendues.')
  }

  return { score, niveau, motifs }
}
