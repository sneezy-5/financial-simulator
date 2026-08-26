// ═══════════════════════════════════════════════════════
// NORMALISATION DES DONNÉES DE PAIE
//
// Trois sources alimentent un bulletin, et chacune a une responsabilité propre :
//
//   CONTRAT          → tout ce qui définit la rémunération : salaire de base,
//                      sursalaire, primes, poste, date de début.
//   FICHE EMPLOYÉ    → l'identité et la situation personnelle : nom, matricule,
//                      numéro CNPS/CNSS, situation matrimoniale, enfants.
//   SAISIE MENSUELLE → ce qui varie d'un mois sur l'autre : absences, heures
//                      supplémentaires, congés, acomptes.
//
// Ce module les fusionne en un enregistrement unique, au format attendu par le
// moteur de calcul.
//
// Pourquoi il existe : l'annuaire expose ses champs en camelCase (`salaireBase`),
// le moteur de paie lit du snake_case (`salaire_base`), et les contrats vivaient
// dans un stockage que la génération ne consultait jamais. Résultat : tous les
// montants arrivaient à zéro sur les bulletins.
// ═══════════════════════════════════════════════════════

const CONTRACTS_KEY = 'onda_contrats'

/** Contrats enregistrés localement. */
export function getContracts() {
  try {
    const raw = JSON.parse(localStorage.getItem(CONTRACTS_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch (e) {
    console.warn('Contrats illisibles :', e.message)
    return []
  }
}

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** Premier jour du mois de paie, et dernier. */
function periodBounds({ mois, annee }) {
  const m = parseInt(mois, 10) || (new Date().getMonth() + 1)
  const y = parseInt(annee, 10) || new Date().getFullYear()
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) }
}

/**
 * Contrat applicable à un salarié pour la période de paie.
 *
 * Un salarié peut avoir plusieurs contrats successifs (CDD renouvelé, avenant
 * saisi comme nouveau contrat). On retient celui qui couvre la période ; à
 * défaut, le plus récent qui a commencé avant la fin de la période — un contrat
 * sans date de fin reste en vigueur.
 */
export function findActiveContract(employeeId, contracts, period) {
  const { start, end } = periodBounds(period)
  const mine = contracts.filter(c => String(c.employeeId) === String(employeeId))
  if (!mine.length) return null

  const applicable = mine.filter(c => {
    const debut = c.dateDebut ? new Date(c.dateDebut) : null
    const fin = c.dateFin ? new Date(c.dateFin) : null
    if (debut && debut > end) return false
    if (fin && fin < start) return false
    return true
  })

  const pool = applicable.length ? applicable : mine
  // Le plus récemment entré en vigueur fait foi
  return pool.slice().sort((a, b) => {
    const da = a.dateDebut ? new Date(a.dateDebut).getTime() : 0
    const db = b.dateDebut ? new Date(b.dateDebut).getTime() : 0
    return db - da
  })[0]
}

/**
 * Certaines primes du contrat correspondent à des rubriques que le moteur sait
 * traiter spécifiquement (le transport est exonéré dans la limite légale, le
 * logement suit sa propre règle). On les extrait de la liste libre pour qu'elles
 * soient calculées correctement, plutôt que noyées dans un total générique.
 */
const NAMED_PRIMES = [
  { field: 'prime_transport', match: /transport|deplacement/i },
  { field: 'prime_logement', match: /logement|habitation/i },
  { field: 'gratification', match: /gratification|13e mois|treizieme/i }
]

export function splitPrimes(primes) {
  const named = {}
  const free = []
  for (const p of primes || []) {
    const libelle = (p.libelle || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    const hit = NAMED_PRIMES.find(n => n.match.test(libelle) && named[n.field] === undefined)
    if (hit) named[hit.field] = num(p.montant)
    else if (p.libelle || p.montant) free.push({
      libelle: p.libelle || '',
      montant: num(p.montant),
      // Une prime est imposable sauf mention contraire : c'est le régime de droit
      // commun, et le contrat le précise explicitement quand il en va autrement.
      imposable: p.imposable !== false
    })
  }
  return { named, free }
}

/**
 * Fusionne les trois sources en l'enregistrement attendu par le moteur de calcul.
 *
 * @param {object} employee  fiche de l'annuaire
 * @param {object} contract  contrat applicable, ou null
 * @param {object} monthly   saisie du mois (absences, heures sup…)
 * @param {object} period    { mois, annee }
 */
export function buildPayrollInput(employee, contract, monthly = {}, period = {}) {
  const { named, free } = splitPrimes(contract?.primes)

  // La rémunération vient du contrat. On ne retombe sur le salaire de la fiche
  // employé que pour les dossiers antérieurs à cette séparation, faute de quoi
  // ils cesseraient brutalement d'être payés.
  const salaireBase = contract && contract.salaireDeBase !== '' && contract.salaireDeBase != null
    ? num(contract.salaireDeBase)
    : num(employee.salaireBase)

  return {
    // ── Identité et situation : fiche employé ──
    id: employee.id,
    nom: employee.nom || '',
    prenom: employee.prenom || '',
    matricule: employee.matricule || '',
    numero_cnps: employee.numeroCnps || '',
    num_cnps: employee.numeroCnps || '',
    situation_matrimoniale: employee.situationMatrimoniale || '',
    nombre_enfants: num(employee.nombreEnfants),
    genre: employee.genre || '',
    email: employee.email || '',

    // ── Rémunération et poste : contrat ──
    poste: contract?.poste || employee.poste || '',
    date_embauche: contract?.dateDebut || employee.dateEmbauche || '',
    type_contrat: contract?.type || '',
    salaire_base: salaireBase,
    sursalaire: num(contract?.sursalaire),
    prime_transport: named.prime_transport || 0,
    prime_logement: named.prime_logement || 0,
    gratification: named.gratification || 0,
    primes: free,

    // ── Variable du mois : saisie mensuelle ──
    mois: period.mois,
    annee: period.annee,
    absences_jours: num(monthly.absences_jours),
    jours_conges_pris: num(monthly.jours_conges_pris),
    heures_sup_nb: num(monthly.heures_sup_nb),
    heures_sup_nuit: num(monthly.heures_sup_nuit),
    heures_sup_ferie_jour: num(monthly.heures_sup_ferie_jour),
    heures_sup_ferie_nuit: num(monthly.heures_sup_ferie_nuit),
    heures_sup_coef: monthly.heures_sup_coef != null && monthly.heures_sup_coef !== ''
      ? num(monthly.heures_sup_coef) : undefined,
    acompte: num(monthly.acompte),
    avance: num(monthly.avance),
    autres_retenues: num(monthly.autres_retenues),
    opposition: num(monthly.opposition),
    ...(monthly.jours_travailles !== undefined && monthly.jours_travailles !== ''
      ? { jours_travailles: num(monthly.jours_travailles) } : {}),

    // ── Traçabilité ──
    _contratId: contract?.id || null,
    _sansContrat: !contract
  }
}

/**
 * Prépare le lot complet envoyé à la génération.
 *
 * @returns {{ employees: Array, sansContrat: Array, sansRemuneration: Array }}
 *          Les deux dernières listes servent à prévenir l'utilisateur AVANT de
 *          générer : un salarié sans contrat produirait un bulletin à zéro, ce
 *          qu'il vaut mieux annoncer que découvrir sur le PDF.
 */
export function buildPayrollBatch(employees, monthlyById = {}, period = {}) {
  const contracts = getContracts()
  const out = []
  const sansContrat = []
  const sansRemuneration = []

  for (const employee of employees) {
    const contract = findActiveContract(employee.id, contracts, period)
    const record = buildPayrollInput(employee, contract, monthlyById[employee.id] || {}, period)
    if (!contract) sansContrat.push(record)
    if (!record.salaire_base) sansRemuneration.push(record)
    out.push(record)
  }

  return { employees: out, sansContrat, sansRemuneration }
}

/** Libellé lisible d'un salarié, pour les messages d'avertissement. */
export function employeeLabel(record) {
  return `${(record.nom || '').toUpperCase()} ${record.prenom || ''}`.trim() || record.matricule || 'Sans nom'
}
