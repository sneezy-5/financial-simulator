// ═══════════════════════════════════════════════════════
// SOLDE DE TOUT COMPTE — CÔTE D'IVOIRE
//
//   Net = (salaire dû + congés non pris + primes acquises + indemnités de
//          rupture) − retenues autorisées
//
// DEUX PRINCIPES QUI GOUVERNENT TOUT CE FICHIER :
//
// 1. Aucune retenue sans base. On ne déduit jamais une somme au seul motif que
//    le salarié s'en va. Chaque retenue doit reposer sur une base légale ou
//    contractuelle, ou correspondre à une avance, un prêt ou une saisie
//    réellement constatés. Les retenues sont donc des ENTRÉES explicites,
//    jamais des déductions déduites d'un motif de rupture.
//
// 2. Les minima ne sont pas des maxima. Le contrat et la convention collective
//    peuvent prévoir des droits plus favorables. Tout barème est donc un
//    paramètre surchargeable, jamais une constante figée dans le code.
// ═══════════════════════════════════════════════════════

// ── Paramètres, surchargeables par entreprise ou convention ──────────────────
export const PARAMS_STC_CI = {
  // Congés : base légale générale de 2,2 jours ouvrables par mois de service
  // effectif. Peut être plus élevée selon l'ancienneté, le contrat ou la
  // convention applicable.
  joursCongesParMois: 2.2,

  // Diviseur mensuel servant à convertir un salaire en valeur journalière de
  // congé. 26,4 correspond à 12 × 2,2. D'autres méthodes existent : c'est un
  // choix de convention, pas une règle universelle.
  diviseurJourConge: 26.4,

  // Majoration légale de la durée du congé selon l'ancienneté (Code du
  // Travail) : des jours supplémentaires s'ajoutent par palier, au-delà de la
  // base de 2,2 jours/mois — jamais à sa place.
  baremeMajorationConges: [
    { deAnnees: 5, aAnnees: 10, jours: 1 },
    { deAnnees: 10, aAnnees: 15, jours: 2 },
    { deAnnees: 15, aAnnees: 20, jours: 3 },
    { deAnnees: 20, aAnnees: 25, jours: 5 },
    { deAnnees: 25, aAnnees: Infinity, jours: 7 }
  ],

  // Barème de l'indemnité de licenciement, en fraction du salaire de référence
  // par année d'ancienneté retenue.
  baremeLicenciement: [
    { jusquA: 5, taux: 0.30 },   // de la 1re à la 5e année incluse
    { jusquA: 10, taux: 0.35 },  // de la 6e à la 10e
    { jusquA: Infinity, taux: 0.40 }
  ],

  // Ancienneté minimale ouvrant droit à l'indemnité de licenciement.
  ancienneteMinimaleLicenciementMois: 12,

  // Indemnité de fin de CDD : pourcentage du total des salaires bruts de la
  // durée du contrat.
  tauxIndemniteFinCDD: 0.03,

  // Nombre de mois d'historique servant à établir le salaire de référence.
  moisReferenceSalaire: 12
}

// ── Motifs de rupture et droits associés ────────────────────────────────────
/**
 * Traduction de la grille des circonstances. `null` signifie « à apprécier »,
 * pas « exclu » : le cas dépend de faits que le calcul ne connaît pas.
 */
export const MOTIFS = {
  demission: {
    libelle: 'Démission',
    indemniteLicenciement: false,
    preavisDuAuSalarie: false,
    // Le préavis non exécuté peut être dû À L'EMPLOYEUR, mais seulement s'il y
    // a droit. On ne le retient donc jamais d'office.
    preavisPeutEtreDuAEmployeur: true,
    indemniteFinCDD: false
  },
  licenciement: {
    libelle: 'Licenciement (hors faute lourde)',
    indemniteLicenciement: true,
    preavisDuAuSalarie: true,
    indemniteFinCDD: false
  },
  licenciement_faute_lourde: {
    libelle: 'Licenciement pour faute lourde',
    // Pas d'indemnité légale de licenciement, et le préavis peut ne pas être dû.
    indemniteLicenciement: false,
    preavisDuAuSalarie: false,
    indemniteFinCDD: false,
    conserveDroitsAcquis: true
  },
  retraite: {
    libelle: 'Départ à la retraite',
    // Même base et même barème que l'indemnité de licenciement.
    indemniteLicenciement: true,
    preavisDuAuSalarie: true,
    indemniteFinCDD: false
  },
  deces: {
    libelle: 'Décès du salarié',
    // Une indemnité équivalente PEUT être due, dans les conditions prévues :
    // c'est une appréciation, pas un automatisme.
    indemniteLicenciement: null,
    preavisDuAuSalarie: false,
    indemniteFinCDD: false
  },
  fin_cdd: {
    libelle: 'Fin normale d\'un CDD',
    indemniteLicenciement: false,
    preavisDuAuSalarie: false,
    indemniteFinCDD: true
  },
  cdd_rupture_employeur: {
    libelle: 'Rupture anticipée du CDD par l\'employeur',
    indemniteLicenciement: false,
    preavisDuAuSalarie: false,
    indemniteFinCDD: true,
    dommagesInterets: 'salaires_restants'
  },
  cdd_rupture_salarie: {
    libelle: 'Rupture anticipée du CDD par le salarié',
    indemniteLicenciement: false,
    preavisDuAuSalarie: false,
    // L'indemnité de 3 % n'est pas due lorsque la rupture lui est imputable.
    indemniteFinCDD: false
  },
  cdd_refus_cdi: {
    libelle: 'Fin de CDD, CDI équivalent refusé',
    indemniteLicenciement: false,
    preavisDuAuSalarie: false,
    // Pas d'indemnité de fin de CDD si le CDI proposé porte sur le même emploi
    // ou un emploi similaire, à rémunération au moins équivalente.
    indemniteFinCDD: false
  },
  commun_accord: {
    libelle: 'Rupture d\'un commun accord',
    indemniteLicenciement: null,
    preavisDuAuSalarie: null,
    indemniteFinCDD: false
  }
}

const arrondi = (v) => Math.round(v || 0)
const nombre = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// ── Ancienneté ───────────────────────────────────────────────────────────────
/**
 * Ancienneté entre deux dates.
 * Les fractions d'année sont exprimées en mois entiers : une année entamée ne
 * compte que pour les mois révolus, jamais arrondie au supérieur.
 */
export function calculerAnciennete(dateEmbauche, dateSortie) {
  const de = new Date(dateEmbauche)
  const ds = new Date(dateSortie)
  if (isNaN(de) || isNaN(ds) || ds < de) return { ans: 0, mois: 0, moisTotal: 0, annees: 0 }

  let ans = ds.getFullYear() - de.getFullYear()
  let mois = ds.getMonth() - de.getMonth()
  if (ds.getDate() < de.getDate()) mois--
  if (mois < 0) { ans--; mois += 12 }

  const moisTotal = Math.max(0, ans * 12 + mois)
  return { ans: Math.max(0, ans), mois: Math.max(0, mois), moisTotal, annees: moisTotal / 12 }
}

// ── Salaire de référence ─────────────────────────────────────────────────────
/**
 * Moyenne des rémunérations globales des mois précédant la rupture.
 *
 * La rémunération globale comprend ce qui rémunère le travail — salaire et
 * primes habituelles. Les remboursements de frais professionnels en sont exclus :
 * ils compensent une dépense, ils ne rémunèrent rien.
 *
 * @param {Array<number|object>} historique  montants mensuels, ou objets
 *        { salaire, primes, fraisProfessionnels }
 * @param {number} fallback  rémunération courante, si l'historique est absent
 */
export function salaireReference(historique, fallback, params = PARAMS_STC_CI) {
  const lignes = Array.isArray(historique) ? historique.filter(Boolean) : []
  if (!lignes.length) return nombre(fallback)

  const retenues = lignes.slice(-params.moisReferenceSalaire)
  const total = retenues.reduce((somme, ligne) => {
    if (typeof ligne === 'number') return somme + ligne
    // Les frais professionnels sont retranchés : ils ne rémunèrent pas le travail.
    return somme + nombre(ligne.salaire) + nombre(ligne.primes) - nombre(ligne.fraisProfessionnels)
  }, 0)
  return total / retenues.length
}

// ── Indemnité de licenciement ────────────────────────────────────────────────
/**
 * Barème par tranches d'ancienneté, appliqué au salaire de référence.
 *
 * @returns {{ montant, tranches, du, motifExclusion }}
 */
export function indemniteLicenciement({ salaireRef, anciennete, motif, params = PARAMS_STC_CI }) {
  const regle = MOTIFS[motif]
  const detail = { montant: 0, tranches: [], du: false, motifExclusion: null }

  if (!regle) { detail.motifExclusion = 'motif inconnu'; return detail }
  if (regle.indemniteLicenciement === false) {
    detail.motifExclusion = `non due pour « ${regle.libelle} »`
    return detail
  }
  if (anciennete.moisTotal < params.ancienneteMinimaleLicenciementMois) {
    detail.motifExclusion = `ancienneté inférieure à ${params.ancienneteMinimaleLicenciementMois} mois`
    return detail
  }

  // Années retenues, fractions comprises au mois révolu.
  let restant = anciennete.moisTotal / 12
  let plancher = 0
  let montant = 0

  for (const tranche of params.baremeLicenciement) {
    if (restant <= 0) break
    const largeur = tranche.jusquA - plancher
    const prise = Math.min(restant, largeur)
    if (prise > 0) {
      const part = salaireRef * tranche.taux * prise
      montant += part
      detail.tranches.push({
        de: plancher + 1,
        a: Number.isFinite(tranche.jusquA) ? tranche.jusquA : null,
        annees: Math.round(prise * 10000) / 10000,
        taux: tranche.taux,
        montant: arrondi(part)
      })
      restant -= prise
    }
    plancher = tranche.jusquA
  }

  detail.montant = arrondi(montant)
  // `null` signifie « à apprécier » : on calcule le montant, mais on signale
  // que l'ouverture du droit relève d'un examen des circonstances.
  detail.du = regle.indemniteLicenciement === true
  if (regle.indemniteLicenciement === null) detail.motifExclusion = 'droit à apprécier selon les circonstances'
  return detail
}

// ── Indemnité compensatrice de préavis ───────────────────────────────────────
/**
 * Ce que le salarié aurait perçu sur la durée de préavis non exécutée :
 * rémunération brute habituelle ET avantages habituels correspondants.
 *
 * Le sens du versement dépend de la partie défaillante. Rien n'est retenu au
 * salarié d'office : `duParSalarie` signale seulement que l'employeur pourrait
 * y avoir droit, à lui de l'établir.
 */
export function indemnitePreavis({ brutHabituel, avantagesHabituels = 0, dureeMois, moisExecutes = 0, motif }) {
  const regle = MOTIFS[motif] || {}
  const reliquat = Math.max(0, nombre(dureeMois) - nombre(moisExecutes))
  const mensuel = nombre(brutHabituel) + nombre(avantagesHabituels)
  const montant = arrondi(mensuel * reliquat)

  return {
    montant,
    reliquatMois: reliquat,
    duAuSalarie: regle.preavisDuAuSalarie === true && reliquat > 0,
    duParSalarie: regle.preavisPeutEtreDuAEmployeur === true && reliquat > 0,
    aApprecier: regle.preavisDuAuSalarie === null
  }
}

/** Jours de majoration légale acquis pour une ancienneté donnée (en années). */
function majorationConges(anneesAnciennete, bareme) {
  const annees = nombre(anneesAnciennete)
  return bareme.reduce((total, tranche) =>
    total + (annees > tranche.deAnnees && annees <= tranche.aAnnees ? tranche.jours : 0), 0)
}

// ── Congés ───────────────────────────────────────────────────────────────────
export function droitsConges({ moisService, anneesAnciennete = 0, joursDejaPris = 0, salaireRef, params = PARAMS_STC_CI, valeurJourConge = null }) {
  const base = Math.round(nombre(moisService) * params.joursCongesParMois * 10) / 10
  const majoration = majorationConges(anneesAnciennete, params.baremeMajorationConges)
  const acquis = base + majoration
  const nonPris = Math.max(0, acquis - nombre(joursDejaPris))
  // La valeur du jour de congé peut être imposée par la convention : on accepte
  // qu'elle soit fournie plutôt que dérivée.
  const valeurJour = valeurJourConge !== null
    ? nombre(valeurJourConge)
    : nombre(salaireRef) / params.diviseurJourConge

  return {
    joursAcquis: acquis,
    joursBase: base,
    joursMajoration: majoration,
    joursPris: nombre(joursDejaPris),
    joursNonPris: nonPris,
    valeurJour: Math.round(valeurJour * 100) / 100,
    montant: arrondi(nonPris * valeurJour)
  }
}

// ── Indemnité de fin de CDD ──────────────────────────────────────────────────
/**
 * Pourcentage du total des salaires bruts de TOUTE la durée du contrat.
 * Quand ce cumul n'est pas connu, on l'approxime par le salaire courant × durée,
 * et on le signale : l'approximation est fausse dès qu'il y a eu une évolution
 * de salaire ou des primes variables.
 */
export function indemniteFinCDD({ salairesBrutsCumules = null, salaireMensuel = 0, dureeMois = 0, motif, params = PARAMS_STC_CI }) {
  const regle = MOTIFS[motif] || {}
  if (regle.indemniteFinCDD !== true) {
    return { montant: 0, du: false, motifExclusion: `non due pour « ${regle.libelle || motif} »`, approxime: false }
  }
  const approxime = salairesBrutsCumules === null
  const assiette = approxime ? nombre(salaireMensuel) * nombre(dureeMois) : nombre(salairesBrutsCumules)
  return {
    montant: arrondi(assiette * params.tauxIndemniteFinCDD),
    du: true,
    assiette: arrondi(assiette),
    taux: params.tauxIndemniteFinCDD,
    approxime,
    motifExclusion: null
  }
}

// ── Dommages-intérêts pour rupture anticipée illégale ────────────────────────
/**
 * Valeur des salaires et avantages que le salarié aurait perçus jusqu'au terme
 * du contrat.
 */
export function dommagesInteretsRuptureAnticipee({ salaireMensuel, avantagesMensuels = 0, moisRestants, motif }) {
  const regle = MOTIFS[motif] || {}
  if (regle.dommagesInterets !== 'salaires_restants') return { montant: 0, du: false }
  const montant = arrondi((nombre(salaireMensuel) + nombre(avantagesMensuels)) * Math.max(0, nombre(moisRestants)))
  return { montant, du: montant > 0, moisRestants: Math.max(0, nombre(moisRestants)) }
}

// ── Assemblage ───────────────────────────────────────────────────────────────
/**
 * Solde de tout compte complet.
 *
 * Les RETENUES sont des entrées explicites et justifiées. Le préavis non
 * exécuté par un démissionnaire n'est PAS déduit automatiquement : il est
 * signalé comme potentiellement dû à l'employeur, à charge pour lui de
 * l'établir, puis de le saisir comme retenue s'il y a droit.
 */
export function calculerSoldeToutCompte(entree) {
  const params = { ...PARAMS_STC_CI, ...(entree.params || {}) }
  const anciennete = calculerAnciennete(entree.dateEmbauche, entree.dateSortie)
  const salaireRef = salaireReference(entree.historiqueRemunerations, entree.brutMensuel, params)

  const conges = droitsConges({
    moisService: entree.moisServiceConges ?? anciennete.moisTotal,
    anneesAnciennete: anciennete.annees,
    joursDejaPris: entree.joursCongesPris,
    salaireRef,
    valeurJourConge: entree.valeurJourConge ?? null,
    params
  })

  const licenciement = indemniteLicenciement({ salaireRef, anciennete, motif: entree.motif, params })
  const preavis = indemnitePreavis({
    brutHabituel: entree.brutMensuel,
    avantagesHabituels: entree.avantagesMensuels,
    dureeMois: entree.preavisDureeMois,
    moisExecutes: entree.preavisMoisExecutes,
    motif: entree.motif
  })
  const finCDD = indemniteFinCDD({
    salairesBrutsCumules: entree.salairesBrutsCumulesCDD ?? null,
    salaireMensuel: entree.brutMensuel,
    dureeMois: anciennete.moisTotal,
    motif: entree.motif,
    params
  })
  const dommages = dommagesInteretsRuptureAnticipee({
    salaireMensuel: entree.brutMensuel,
    avantagesMensuels: entree.avantagesMensuels,
    moisRestants: entree.moisRestantsCDD,
    motif: entree.motif
  })

  const gains = [
    { code: 'salaire_dernier_mois', libelle: 'Salaire dû du dernier mois', montant: arrondi(entree.salaireDernierMois) },
    { code: 'rappel_salaire', libelle: 'Rappels de salaire', montant: arrondi(entree.rappelSalaire) },
    { code: 'heures_supplementaires_dues', libelle: 'Heures supplémentaires dues', montant: arrondi(entree.heuresSupDues) },
    { code: 'primes_deja_acquises', libelle: 'Primes déjà acquises', montant: arrondi(entree.primesAcquises) },
    { code: 'indemnite_conges_non_pris', libelle: `Congés non pris (${conges.joursNonPris} j)`, montant: conges.montant },
    { code: 'indemnite_preavis', libelle: 'Indemnité compensatrice de préavis', montant: preavis.duAuSalarie ? preavis.montant : 0 },
    { code: 'indemnite_licenciement', libelle: 'Indemnité de licenciement', montant: licenciement.du ? licenciement.montant : 0 },
    { code: 'indemnite_fin_cdd', libelle: 'Indemnité de fin de CDD', montant: finCDD.du ? finCDD.montant : 0 },
    { code: 'indemnite_depart_retraite', libelle: 'Indemnité de départ à la retraite', montant: entree.motif === 'retraite' && licenciement.du ? 0 : 0 },
    { code: 'dommages_interets_eventuels', libelle: 'Dommages et intérêts', montant: dommages.du ? dommages.montant : arrondi(entree.dommagesInterets) }
  ].filter(l => l.montant > 0)

  // Chaque retenue est fournie avec sa justification. Une retenue sans base ne
  // doit pas exister : on l'écarte plutôt que de la porter au débit du salarié.
  const retenues = (entree.retenues || [])
    .map(r => ({
      code: r.code || 'retenue',
      libelle: r.libelle || 'Retenue',
      montant: arrondi(r.montant),
      base: r.base || null
    }))
    .filter(r => r.montant > 0 && r.base)

  const soldeBrut = gains.reduce((s, l) => s + l.montant, 0)
  const totalRetenues = retenues.reduce((s, l) => s + l.montant, 0)

  // Signalements : ce que le calcul ne peut pas trancher seul.
  const aVerifier = []
  if (licenciement.motifExclusion) aVerifier.push(`Indemnité de licenciement : ${licenciement.motifExclusion}.`)
  if (preavis.duParSalarie) {
    aVerifier.push(
      `Préavis non exécuté (${preavis.reliquatMois} mois, soit ${preavis.montant.toLocaleString('fr-FR')}) : ` +
      `potentiellement dû à l'employeur. Non déduit d'office — à saisir en retenue justifiée s'il y a droit.`
    )
  }
  if (preavis.aApprecier) aVerifier.push('Préavis : le droit dépend des circonstances de la rupture.')
  if (finCDD.approxime && finCDD.du) {
    aVerifier.push("Indemnité de fin de CDD estimée sur le salaire courant : fournir le cumul réel des salaires bruts du contrat pour un montant exact.")
  }
  const rejetees = (entree.retenues || []).filter(r => nombre(r.montant) > 0 && !r.base)
  if (rejetees.length) {
    aVerifier.push(`${rejetees.length} retenue(s) écartée(s) faute de base légale ou contractuelle indiquée.`)
  }

  return {
    anciennete,
    salaireReference: arrondi(salaireRef),
    conges,
    licenciement,
    preavis,
    finCDD,
    dommages,
    gains,
    retenues,
    soldeBrut,
    totalRetenues,
    netSoldeToutCompte: soldeBrut - totalRetenues,
    aVerifier
  }
}
