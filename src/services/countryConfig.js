// ══════════════════════════════════════════════════════════════════════════
// RÈGLES FISCALES, SOCIALES ET TERMES OFFICIELS PAR PAYS (UEMOA & CEMAC)
// ══════════════════════════════════════════════════════════════════════════

export const COUNTRIES_CONFIG = {
  CI: {
    code: 'CI',
    name: 'Côte d\'Ivoire',
    preposition: 'en',
    adjectif: 'ivoirien',
    adjectifFem: 'ivoirienne',
    villeParDefaut: 'Abidjan, Côte d\'Ivoire',
    flagUrl: 'https://flagcdn.com/w40/ci.png',
    currency: 'FCFA',
    region: 'UEMOA',
    smig: 75000,
    organismeRetraite: 'CNPS (RGR)',
    organismeSante: 'CMU',
    plafondRetraite: 3375000,
    plafondPF: 75000,
    tauxRetraiteSal: 0.063,
    tauxRetraitePat: 0.077,
    tauxPFPat: 0.05,
    tauxATPat: 0.02,
    // Charges fiscales patronales DISSOCIÉES (à ne jamais agréger) :
    //   CN — Contribution Nationale : 1,2 % du brut imposable, personnel local ET expatrié.
    //   CE — Contribution Employeur : 0 % pour le local, 9,2 % pour les expatriés.
    // Le « 10,4 % » expatrié = CE 9,2 % + CN 1,2 % (deux rubriques). Le « 12 % »
    // (= 9,2 + 1,2 + TA 0,4 + FPC 1,2) n'est PAS utilisé ici : TA et FPC (FDFP)
    // sont déjà calculées dans leurs propres rubriques.
    tauxCnEmployeur: 0.012,
    tauxCeEmployeurLocal: 0,
    tauxCeEmployeurExpat: 0.092,
    // Conservés pour l'affichage agrégé (info-bulles, cartes pays) uniquement.
    tauxImpotEmployeurLocal: 0.012,
    tauxImpotEmployeurExpat: 0.104,
    libelleImpotEmployeur: 'CN / CE (Impôts Employeur)',
    libelleImpotSalarial: 'ITS (Impôt sur les Salaires)',
    hasFDFP: true,
    hasCMU: true,
    hasPartsFiscales: true,
    descriptionPaie: 'CNPS (RGR), ITS Unique, CMU & FDFP',
    descriptionImpots: 'Régimes Synthétique, Réel & Micro-Entreprise (CGI CI)'
  },
  BJ: {
    code: 'BJ',
    name: 'Bénin',
    preposition: 'au',
    adjectif: 'béninois',
    adjectifFem: 'béninoise',
    villeParDefaut: 'Cotonou, Bénin',
    flagUrl: 'https://flagcdn.com/w40/bj.png',
    currency: 'FCFA',
    region: 'UEMOA',
    smig: 52000,
    organismeRetraite: 'CNSS Bénin',
    organismeSante: 'CNSS',
    plafondRetraite: 1200000,
    plafondPF: 1200000,
    tauxRetraiteSal: 0.036,
    tauxRetraitePat: 0.064,
    tauxPFPat: 0.09,
    tauxATPat: 0.01,
    tauxImpotEmployeurLocal: 0.04,
    tauxImpotEmployeurExpat: 0.04,
    libelleImpotEmployeur: 'VPS (Versement Patronal sur Salaires)',
    libelleImpotSalarial: 'IRPP (Impôt sur le Revenu des Personnes Physiques)',
    hasFDFP: false,
    hasCMU: false,
    hasPartsFiscales: false,
    descriptionPaie: 'CNSS Bénin, ITS & VPS Patronal',
    descriptionImpots: 'TPS (Taxe Professionnelle Synthétique) & Réel (CGI Bénin)'
  },
  TG: {
    code: 'TG',
    name: 'Togo',
    preposition: 'au',
    adjectif: 'togolais',
    adjectifFem: 'togolaise',
    villeParDefaut: 'Lomé, Togo',
    flagUrl: 'https://flagcdn.com/w40/tg.png',
    currency: 'FCFA',
    region: 'UEMOA',
    smig: 52500,
    organismeRetraite: 'CNSS Togo',
    organismeSante: 'INAM / AMU',
    plafondRetraite: 1500000,
    plafondPF: 1500000,
    tauxRetraiteSal: 0.04,
    tauxSanteSal: 0.05,
    tauxRetraitePat: 0.175,
    tauxSantePat: 0.05,
    tauxImpotEmployeurLocal: 0.01,
    tauxImpotEmployeurExpat: 0.01,
    libelleImpotEmployeur: 'Cotisations Patronales',
    libelleImpotSalarial: 'IRPP (Impôt sur le Revenu)',
    hasFDFP: false,
    hasCMU: false,
    hasPartsFiscales: false,
    descriptionPaie: 'CNSS (4%), INAM (5%), Abattement 28% & IRPP (0-35%)',
    descriptionImpots: 'Régime TPME OTR & Réel (CGI Togo)'
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PAYS ACTIFS
//
// La version PRO (facturée) reste verrouillée sur la Côte d'Ivoire tant que
// les autres réglementations n'y sont pas éprouvées sur de vrais documents.
// Le build simulateur (VITE_APP_MODE=simulator), lui, propose tous les pays
// implémentés.
// ══════════════════════════════════════════════════════════════════════════
const isSimulatorMode = import.meta.env.VITE_APP_MODE === 'simulator'
export const ACTIVE_COUNTRIES = isSimulatorMode ? Object.keys(COUNTRIES_CONFIG) : ['CI']

export function isCountryActive(code) {
  return ACTIVE_COUNTRIES.includes(code)
}

/** Libellé affiché sur un pays encore indisponible. */
export const INACTIVE_LABEL = 'Bientôt disponible'

export function getCountryRules(countryCode = 'CI') {
  return COUNTRIES_CONFIG[countryCode] || COUNTRIES_CONFIG['CI']
}
