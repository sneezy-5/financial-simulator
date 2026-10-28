// FICHIER GÉNÉRÉ par scripts/sync-moteur.cjs à partir de paieCI.mjs — NE PAS MODIFIER.
'use strict';

// Moteur de paie Côte d'Ivoire — SOURCE UNIQUE.
//
// Ce fichier est lu tel quel par le simulateur (Vite, ESM) et sert de source à
// `paieCI.cjs`, la copie CommonJS utilisée par le serveur. Ne jamais modifier
// `paieCI.cjs` à la main : après toute modification ici, lancer
//     node scripts/sync-moteur.cjs
// (tests/paie/moteur.test.cjs échoue si la copie n'est plus à jour).
//
// Contraintes pour que la conversion reste triviale : aucun import, uniquement
// des `export const` / `export function` en début de ligne.

// ─── Barèmes datés ───────────────────────────────────────────────────────────
// Un bulletin utilise la version en vigueur au 1er jour de son mois : quand un
// taux change, on AJOUTE une version avec sa date d'effet, on ne modifie pas
// l'ancienne — les bulletins passés restent recalculables à l'identique.
const BAREMES_CI = [
  {
    dateEffet: '2024-01-01',
    sources: [
      'ITS : impôt unique sur les salaires, réforme fiscale 2024',
      'CNPS : plafonds en vigueur depuis 2023',
      'Transport : arrêté du 30/01/2020 (secteur privé)'
    ],
    itsTranches: [
      { plafond: 75000, taux: 0 },
      { plafond: 240000, taux: 0.16 },
      { plafond: 800000, taux: 0.21 },
      { plafond: 2400000, taux: 0.24 },
      { plafond: 8000000, taux: 0.28 },
      { plafond: Infinity, taux: 0.32 }
    ],
    smig: 75000,
    ricfParDemiPart: 11000,
    partsMax: 5,
    enfantsMaxParts: 4,
    cnps: {
      plafondRetraite: 3375000,
      plafondPfAtAm: 75000,
      tauxRetraiteSal: 0.063,
      tauxRetraitePat: 0.077,
      tauxPF: 0.05,
      tauxAM: 0.0075,
      tauxATDefaut: 0.02
    },
    cmuParPersonne: 500,
    // CN 1,2 % local ET expatrié ; CE 0 % local, 9,2 % expatrié ; TA/FPC = FDFP.
    fiscalEmployeur: { tauxCN: 0.012, tauxCELocal: 0, tauxCEExpat: 0.092, tauxFdfpTA: 0.004, tauxFdfpFPC: 0.006 },
    // Exonération ITS + CNPS de l'indemnité de transport, par zone. Abidjan est
    // sûr (30 000) ; Bouaké / intérieur suivent l'arrêté tel que rapporté par la
    // presse — à confirmer sur le texte officiel.
    transportExonere: { abidjan: 30000, bouake: 24000, interieur: 20000 },
    anciennete: { seuilAns: 2, tauxMax: 25 },
    heuresSup: { seuilPalier1: 6, palier1: 1.15, palier2: 1.5, nuit: 1.75, ferieJour: 1.75, ferieNuit: 2 },
    heuresMensuelles: 173.33,
    congesJoursParMois: 2.2
  }
];

const ZONES_TRANSPORT = [
  { code: 'abidjan', libelle: 'Abidjan' },
  { code: 'bouake', libelle: 'Bouaké' },
  { code: 'interieur', libelle: 'Autres villes (intérieur)' }
];

// Base de proratisation du temps de travail, réglable par entreprise.
const BASES_JOURS_PAIE = [26, 30];
const BASE_JOURS_PAIE_DEFAUT = 26;

function baremeCI(annee, mois) {
  const a = parseInt(annee) || new Date().getFullYear();
  const m = parseInt(mois) || (new Date().getMonth() + 1);
  const debutMois = `${a}-${String(m).padStart(2, '0')}-01`;
  let retenu = BAREMES_CI[0];
  for (const b of BAREMES_CI) if (b.dateEffet <= debutMois) retenu = b;
  return retenu;
}

function plafondTransportExonere(employee, bareme) {
  const saisi = parseFloat(employee.plafond_transport_exonere);
  if (saisi > 0) return saisi;
  const zone = String(employee.zone_transport || '').toLowerCase();
  return bareme.transportExonere[zone] ?? bareme.transportExonere.abidjan;
}

/**
 * Heures supplémentaires — barème légal ivoirien (Code du Travail, CCI du
 * 20/07/1977) : 41e à 46e heure de la semaine à 1,15 ; au-delà de la 46e à
 * 1,50 ; heures de nuit à 1,75 ; heures de jour un dimanche ou jour férié à
 * 1,75 ; heures de nuit un dimanche ou jour férié à 2,00.
 *
 * `heures_sup_nb` reste le point d'entrée simple : ces heures « ordinaires »
 * sont réparties automatiquement sur les deux premiers paliers. Un coefficient
 * explicitement différent du palier 1 est traité comme une classification
 * volontaire et s'applique tel quel plutôt que d'être réparti.
 */
function calculerHeuresSupplementaires(employee, tauxHoraire, bareme) {
  const hs = bareme.heuresSup;
  const nbSimple = parseFloat(employee.heures_sup_nb || 0);
  const nbNuit = parseFloat(employee.heures_sup_nuit || 0);
  const nbFerieJour = parseFloat(employee.heures_sup_ferie_jour || 0);
  const nbFerieNuit = parseFloat(employee.heures_sup_ferie_nuit || 0);
  const coefBrut = employee.heures_sup_coef;
  const coefExplicite = (coefBrut !== undefined && coefBrut !== null && coefBrut !== '') ? parseFloat(coefBrut) : null;

  const tranches = [];
  let montant = 0;
  const ajouter = (label, heures, coef) => {
    const m = Math.round(heures * tauxHoraire * coef);
    montant += m;
    tranches.push({ label, heures, coef, montant: m });
  };

  if (coefExplicite !== null && coefExplicite !== hs.palier1) {
    if (nbSimple > 0) ajouter(`Heures supplémentaires (×${coefExplicite})`, nbSimple, coefExplicite);
  } else if (nbSimple > 0) {
    const h1 = Math.min(nbSimple, hs.seuilPalier1);
    const h2 = Math.max(0, nbSimple - hs.seuilPalier1);
    if (h1 > 0) ajouter('De la 41e à la 46e heure', h1, hs.palier1);
    if (h2 > 0) ajouter('Au-delà de la 46e heure', h2, hs.palier2);
  }
  if (nbNuit > 0) ajouter('Heures de nuit', nbNuit, hs.nuit);
  if (nbFerieJour > 0) ajouter('Heures de jour, dimanche ou jour férié', nbFerieJour, hs.ferieJour);
  if (nbFerieNuit > 0) ajouter('Heures de nuit, dimanche ou jour férié', nbFerieNuit, hs.ferieNuit);

  const nbHeuresSup = nbSimple + nbNuit + nbFerieJour + nbFerieNuit;
  // coefHS : coefficient affiché quand une seule tranche est active — sinon `tranches` fait foi.
  const coefHS = tranches.length === 1 ? tranches[0].coef : (coefExplicite ?? hs.palier1);
  return { nbHeuresSup, coefHS, montantHeuresSup: montant, tranches };
}

function calculerITS(brutImposable, parts, bareme) {
  let impotBrut = 0;
  let prec = 0;
  for (const { plafond, taux } of bareme.itsTranches) {
    if (brutImposable <= prec) break;
    impotBrut += (Math.min(brutImposable, plafond) - prec) * taux;
    prec = plafond;
  }
  const ricf = Math.max(0, (parts - 1) * bareme.ricfParDemiPart);
  return { impotBrut: Math.round(impotBrut), ricf, its: Math.max(0, Math.round(impotBrut) - ricf) };
}

function partsFiscales(employee, bareme) {
  const n = Math.min(parseFloat(employee.nombre_enfants || 0), bareme.enfantsMaxParts);
  const situation = String(employee.situation_matrimoniale || '').toLowerCase();
  let parts;
  if (situation.includes('mari')) parts = 2 + (n * 0.5);
  else if (situation.includes('veuf') || situation.includes('veuv')) parts = (n > 0) ? (2 + (n * 0.5)) : 1;
  else parts = (n > 0) ? (1.5 + (n * 0.5)) : 1;
  return Math.min(parts, bareme.partsMax);
}

/**
 * Bulletin de paie CI complet à partir d'une fiche salarié « à plat » (champs
 * snake_case du formulaire, de l'import Excel et du simulateur).
 */
function calculerBulletinCI(employee) {
  const paieMois = parseInt(employee.mois || new Date().getMonth() + 1);
  const paieAnnee = parseInt(employee.annee || new Date().getFullYear());
  const B = baremeCI(paieAnnee, paieMois);

  const salaireBaseMensuel = parseFloat(employee.salaire_base || 0);
  // Jours calendaires : sert uniquement à l'allocation de congés, qui se
  // compte en trentièmes (2,2 jours acquis par mois).
  const joursDansLeMois = 30;
  // Base de proratisation du temps de travail (salaire, sursalaire, transport) :
  // 26 jours ouvrables par défaut, ou 30 jours calendaires si l'entreprise l'a choisi.
  const baseJoursPaie = BASES_JOURS_PAIE.includes(parseInt(employee.base_jours_paie))
    ? parseInt(employee.base_jours_paie) : BASE_JOURS_PAIE_DEFAUT;
  const joursAbsences = parseFloat(employee.absences_jours || 0);
  const joursTravailleExplicite = (employee.jours_travailles !== undefined && employee.jours_travailles !== null && employee.jours_travailles !== '')
    ? parseFloat(employee.jours_travailles)
    : null;

  // ── Ancienneté : 2 % dès 2 ans révolus, +1 % par an, plafonnée à 25 % ──
  const dateEmbaucheStr = employee.date_embauche || employee['Date Embauche'];
  let primeAnciennete = 0;
  let ansAnciennete = 0;
  let tauxAnciennete = 0;
  let ancienneteAnneesExactes = 0;
  let ancienneteTxt = '0 ans 00 mois';
  if (dateEmbaucheStr) {
    const embauche = new Date(dateEmbaucheStr);
    const refDate = new Date(paieAnnee, paieMois - 1, 1);
    let diffAns = refDate.getFullYear() - embauche.getFullYear();
    let diffMois = refDate.getMonth() - embauche.getMonth();
    if (diffMois < 0) {
      diffAns--;
      diffMois += 12;
    }
    ansAnciennete = Math.max(0, diffAns);
    ancienneteAnneesExactes = Math.max(0, (refDate - embauche) / (365 * 24 * 3600 * 1000));
    ancienneteTxt = `${ansAnciennete} ans ${String(Math.max(0, diffMois)).padStart(2, '0')} mois`;
    if (ansAnciennete >= B.anciennete.seuilAns) {
      tauxAnciennete = Math.min(B.anciennete.tauxMax, ansAnciennete);
      primeAnciennete = Math.round(salaireBaseMensuel * (tauxAnciennete / 100));
    }
  }

  // ── Congés : droits acquis depuis le dernier retour (ou l'embauche) ──
  // 2,2 jours par mois + majoration légale selon l'ancienneté.
  let totalCongesAcquis = 0;
  let diffMoisConge = 0;
  const dateRefConges = employee.date_dernier_conge || employee.date_embauche;
  if (dateRefConges) {
    const dRef = new Date(dateRefConges);
    const dNow = new Date(paieAnnee, paieMois - 1, 1);
    diffMoisConge = (dNow.getFullYear() - dRef.getFullYear()) * 12 + (dNow.getMonth() - dRef.getMonth());
    if (diffMoisConge > 0) {
      const majoration =
        (ancienneteAnneesExactes > 5 && ancienneteAnneesExactes <= 10 ? 1 : 0) +
        (ancienneteAnneesExactes > 10 && ancienneteAnneesExactes <= 15 ? 2 : 0) +
        (ancienneteAnneesExactes > 15 && ancienneteAnneesExactes <= 20 ? 3 : 0) +
        (ancienneteAnneesExactes > 20 && ancienneteAnneesExactes <= 25 ? 5 : 0) +
        (ancienneteAnneesExactes > 25 ? 7 : 0);
      totalCongesAcquis = Math.floor(diffMoisConge * B.congesJoursParMois) + majoration;
    }
  }

  // Congés pris ce mois :
  // 1. prise partielle explicite (jours saisis)
  // 2. prise totale / bulletin de congés (totalité des droits acquis)
  // 3. saisie directe (jours_conges_pris)
  let joursConges = 0;
  if (employee.prise_conges_mode === 'partiel' && parseFloat(employee.jours_conges_partiels) > 0) {
    joursConges = parseFloat(employee.jours_conges_partiels);
  } else if (employee.prise_conges_mode === 'total' || employee.bulletin_type === 'conges' || !!employee.auto_conges || !!employee.isLeavePayslip) {
    joursConges = totalCongesAcquis;
  } else if (parseFloat(employee.jours_conges_pris) > 0) {
    joursConges = parseFloat(employee.jours_conges_pris);
  }

  // `jours_travailles` = BASE d'un mois complet (formulaire, import Excel), pas
  // le résultat après absences : on en déduit toujours absences et congés.
  // `jours_travailles_net` (import pointage externe) donne directement le net.
  const joursNetExterne = (employee.jours_travailles_net !== undefined && employee.jours_travailles_net !== null && employee.jours_travailles_net !== '')
    ? parseFloat(employee.jours_travailles_net)
    : null;
  // Borné à la base : saisir 30 avec une base 26 payait 30/26 = 115 % du
  // salaire (les heures en plus passent par les heures supplémentaires).
  const joursBaseMois = (joursTravailleExplicite !== null) ? Math.min(joursTravailleExplicite, baseJoursPaie) : baseJoursPaie;
  const joursTrav = Math.max(0, (joursNetExterne !== null ? joursNetExterne : (joursBaseMois - joursAbsences)) - joursConges);
  const joursCP = joursConges;

  const salaireBase = Math.round((salaireBaseMensuel / baseJoursPaie) * joursTrav);
  const sursalaireTotal = parseFloat(employee.sursalaire || 0);
  const sursalaire = Math.round((sursalaireTotal / baseJoursPaie) * joursTrav);

  // Transport : lié à la présence (nul sur un bulletin de congés), exonéré dans
  // la limite du plafond de la zone ; l'excédent est du salaire imposable.
  const primeTransportMensuel = parseFloat(employee.prime_transport || 0);
  const bulletinType = employee.bulletin_type || 'habituel';
  const primeTransportVersee = bulletinType === 'conges' ? 0 : Math.round((primeTransportMensuel / baseJoursPaie) * joursTrav);
  const plafondTransport = plafondTransportExonere(employee, B);
  const primeTransport = Math.min(primeTransportVersee, plafondTransport);
  const primeTransportImposable = primeTransportVersee - primeTransport;
  const primeLogement = parseFloat(employee.prime_logement || 0);

  const tauxHoraire = salaireBaseMensuel > 0 ? Math.round(salaireBaseMensuel / B.heuresMensuelles) : 0;
  const heuresSup = calculerHeuresSupplementaires(employee, tauxHoraire, B);
  const { nbHeuresSup, coefHS, montantHeuresSup } = heuresSup;

  let allocationConges = 0;
  if (joursCP > 0) {
    const baseCP = salaireBaseMensuel + sursalaireTotal + primeAnciennete;
    allocationConges = Math.round((baseCP / joursDansLeMois) * joursCP);
  }

  const primesList = Array.isArray(employee.primes) ? employee.primes : [];
  const primesImposables = primesList.filter(p => p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);
  const primesNonImposablesRub = primesList.filter(p => !p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);

  const gratification = parseFloat(employee.gratification || 0);
  const preavisVal = parseFloat(employee.preavis || 0);
  const indemLicenciement = parseFloat(employee.indemnite_licenciement || 0);
  const indemTransac = parseFloat(employee.indemnite_transactionnelle || 0);
  const fraisFuneraires = parseFloat(employee.frais_funeraires || 0);

  const salaireBrut = salaireBase + sursalaire + primeAnciennete + allocationConges + montantHeuresSup + primesImposables + primeTransportImposable + gratification + preavisVal;
  const brutImposable = salaireBrut;
  const gainsTotaux = salaireBrut + primeTransport + primeLogement + primesNonImposablesRub + indemLicenciement + indemTransac + fraisFuneraires;

  // ── Charges fiscales patronales (rubriques dissociées) ──
  const F = B.fiscalEmployeur;
  const baseFiscale = brutImposable;
  const estExpatrie = String(employee.statut_salarie || '').toLowerCase().includes('expat');
  const tauxCeEmployeur = estExpatrie ? F.tauxCEExpat : F.tauxCELocal;
  const cnEmployeur = Math.round(baseFiscale * F.tauxCN);
  const ceEmployeur = Math.round(baseFiscale * tauxCeEmployeur);
  // Agrégat conservé pour les gabarits qui affichent une seule ligne « impôt employeur ».
  const impotEmployeur = cnEmployeur + ceEmployeur;
  const fdfpTA = Math.round(baseFiscale * F.tauxFdfpTA);
  const fdfpFPC = Math.round(baseFiscale * F.tauxFdfpFPC);
  const totalFiscalEmployeur = impotEmployeur + fdfpTA + fdfpFPC;

  // ── CNPS ──
  const C = B.cnps;
  const baseCNPS = Math.min(brutImposable, C.plafondRetraite);
  const baseCNPS_PfAtAm = Math.min(brutImposable, C.plafondPfAtAm);
  // AT/MP : 2 à 5 % selon le secteur — paramètre entreprise (taux_at_mp), repli taux_at.
  const tauxAT = parseFloat(employee.taux_at_mp || employee.taux_at || C.tauxATDefaut);
  const cnpsPF = Math.round(baseCNPS_PfAtAm * C.tauxPF);
  const cnpsAM = Math.round(baseCNPS_PfAtAm * C.tauxAM);
  const cnpsAT = Math.round(baseCNPS_PfAtAm * tauxAT);
  const cnpsRetraitePat = Math.round(baseCNPS * C.tauxRetraitePat);
  const cnpsSal = Math.round(baseCNPS * C.tauxRetraiteSal);

  // ── CMU : 500 F par personne couverte, part salariale et part patronale ──
  const sitCmu = String(employee.situation_matrimoniale || '').toLowerCase();
  const conjointCmu = sitCmu.includes('mari') ? 1 : 0;
  const enfantsCmu = Number(employee.nombre_enfants) || 0;
  const nbAyantsDroitCMU = Math.max(0, parseInt(employee.ayants_droit_cmu) > 0 ? parseInt(employee.ayants_droit_cmu) : (conjointCmu + enfantsCmu));
  const totalPersonnesCMU = 1 + nbAyantsDroitCMU;
  const cmuPat = B.cmuParPersonne * totalPersonnesCMU;
  const cmuSal = B.cmuParPersonne * totalPersonnesCMU;

  const totalSocialEmployeur = cnpsPF + cnpsAM + cnpsAT + cnpsRetraitePat + cmuPat;
  const totalPatronal = totalFiscalEmployeur + totalSocialEmployeur;

  // ── ITS ──
  const parts = partsFiscales(employee, B);
  const { ricf, its: itsFinal } = calculerITS(brutImposable, parts, B);

  const acompte = parseFloat(employee.acompte || 0);
  const avance = parseFloat(employee.avance || 0);
  const opposition = parseFloat(employee.opposition || 0);
  const autres = parseFloat(employee.autres_retenues || 0);
  const totalRetenuesDiverses = acompte + avance + opposition + autres;
  const totalRetenues = itsFinal + cnpsSal + cmuSal + totalRetenuesDiverses;

  return {
    dateEffetBareme: B.dateEffet, baseJoursPaie, joursDansLeMois,
    brut: salaireBrut, salaireBrut, salaireBase, salaireBaseMensuel, sursalaire,
    primeAnciennete, ansAnciennete, tauxAnciennete, ancienneteTxt, allocationConges, joursCP,
    totalCongesAcquis, diffMoisConge,
    gratification, preavisVal, indemLicenciement, indemTransac, fraisFuneraires,
    primesImposables, primesNonImposablesRub, montantHeuresSup, nbHeuresSup, coefHS, tauxHoraire,
    heuresSupTranches: heuresSup.tranches,
    primeTransport, primeTransportImposable, plafondTransport, primeLogement,
    brutImposable, gainsTotaux, baseFiscale, baseCNPS, baseCNPS_PfAtAm, parts, totalPersonnesCMU, nbAyantsDroitCMU, joursTrav,
    tauxAT, estExpatrie, totalRetenuesDiverses,
    acompte, avance, opposition, autresRetenues: autres,
    patronal: {
      cnEmployeur, ceEmployeur, tauxCe: tauxCeEmployeur, estExpatrie,
      impotEmployeur, fdfpTA, fdfpFPC, totalFiscal: totalFiscalEmployeur,
      cnpsPF, cnpsAM, cnpsAT, tauxAt: tauxAT, cnpsRetraite: cnpsRetraitePat, cmu: cmuPat,
      totalSocial: totalSocialEmployeur, grandTotal: totalPatronal,
      autresTaxes: [
        { code: '610', label: 'FDFP - APPRENTISSAGE', taux: F.tauxFdfpTA, base: baseFiscale, montant: fdfpTA },
        { code: '612', label: 'FDFP - FORMATION CONTINUE', taux: F.tauxFdfpFPC, base: baseFiscale, montant: fdfpFPC }
      ]
    },
    salarial: {
      its: itsFinal, ricf, cnps: cnpsSal, cmu: cmuSal,
      acompte, avance, opposition, autres, total: totalRetenues,
      autresTaxes: []
    },
    netAPayer: gainsTotaux - totalRetenues,
    netAPayerRaw: gainsTotaux - totalRetenues
  };
}

module.exports = { BAREMES_CI, ZONES_TRANSPORT, BASES_JOURS_PAIE, BASE_JOURS_PAIE_DEFAUT, baremeCI, plafondTransportExonere, calculerHeuresSupplementaires, calculerITS, partsFiscales, calculerBulletinCI };
