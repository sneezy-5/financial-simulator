// Explication ligne par ligne d'un bulletin CI, avec les chiffres du salarié.
// Tout est dérivé du barème du moteur (server/moteur/paieCI.mjs) : l'explication
// ne peut pas diverger du calcul affiché.

import { baremeCI, ZONES_TRANSPORT } from '../../server/moteur/paieCI.mjs'

const f = (v) => Math.round(v || 0).toLocaleString('fr-FR')
const pct = (t) => (Math.round(t * 10000) / 100).toLocaleString('fr-FR') + ' %'

/**
 * @param {object} c    résultat de calculerBulletinCI
 * @param {object} emp  saisie du simulateur
 * @returns {{cle:string, libelle:string, montant:number, sens:string, etapes:string[], regle:string}[]}
 */
export function expliquerBulletin(c, emp) {
  const B = baremeCI(emp.annee, emp.mois)
  const lignes = []
  const ajouter = (cle, libelle, montant, sens, etapes, regle) => lignes.push({ cle, libelle, montant, sens, etapes, regle })

  // ── Gains
  ajouter('salaire_base', 'Salaire de base', c.salaireBase, 'gain',
    c.joursTrav === c.baseJoursPaie
      ? [`Mois complet : ${f(c.salaireBaseMensuel)} FCFA versés en entier.`]
      : [`${f(c.salaireBaseMensuel)} FCFA ÷ ${c.baseJoursPaie} jours × ${c.joursTrav} jours payés = ${f(c.salaireBase)} FCFA.`,
         `Les jours d'absence ou de congé sont retirés au prorata (base ${c.baseJoursPaie} jours).`],
    'Salaire fixé au contrat, pour 173,33 heures par mois.')

  if (c.primeAnciennete > 0) {
    ajouter('anciennete', "Prime d'ancienneté", c.primeAnciennete, 'gain',
      [`${c.ansAnciennete} ans de service → taux de ${c.tauxAnciennete} %.`,
       `${c.tauxAnciennete} % × ${f(c.salaireBaseMensuel)} FCFA = ${f(c.primeAnciennete)} FCFA.`],
      `Convention collective : ${B.anciennete.seuilAns} % dès ${B.anciennete.seuilAns} ans de service, +1 % par année, plafonné à ${B.anciennete.tauxMax} %.`)
  }

  if (c.montantHeuresSup > 0) {
    ajouter('heures_sup', 'Heures supplémentaires', c.montantHeuresSup, 'gain',
      [`Taux horaire : ${f(c.salaireBaseMensuel)} ÷ ${B.heuresMensuelles} h = ${f(c.tauxHoraire)} FCFA.`,
       ...(c.heuresSupTranches || []).map(t => `${t.label} : ${t.heures} h × ${f(c.tauxHoraire)} × ${String(t.coef).replace('.', ',')} = ${f(t.montant)} FCFA.`)],
      'Majorations légales : +15 % de la 41e à la 46e heure, +50 % au-delà, +75 % la nuit ou le dimanche, +100 % la nuit un jour férié.')
  }

  if (c.allocationConges > 0) {
    ajouter('conges', 'Allocation de congés payés', c.allocationConges, 'gain',
      [`${c.joursCP} jours de congé (2,2 jours acquis par mois travaillé).`,
       `Salaire de référence ÷ 30 × ${c.joursCP} jours = ${f(c.allocationConges)} FCFA.`],
      "Code du travail : l'allocation remplace le salaire des jours de congé ; elle est imposable.")
  }

  const transportVerse = (c.primeTransport || 0) + (c.primeTransportImposable || 0)
  if (transportVerse > 0) {
    const zone = (ZONES_TRANSPORT.find(z => z.code === emp.zone_transport) || ZONES_TRANSPORT[0]).libelle
    ajouter('transport', 'Prime de transport', transportVerse, 'gain',
      [`Exonérée d'ITS et de CNPS jusqu'à ${f(c.plafondTransport)} FCFA par mois (zone : ${zone}).`,
       c.primeTransportImposable > 0
         ? `${f(transportVerse)} versés → ${f(c.primeTransport)} exonérés + ${f(c.primeTransportImposable)} imposés comme du salaire.`
         : `${f(transportVerse)} FCFA versés, entièrement exonérés.`],
      'Arrêté du 30/01/2020 (secteur privé) : au-delà du plafond, l’excédent supporte l’ITS et la CNPS.')
  }

  // ── Bases
  ajouter('brut_imposable', 'Brut imposable', c.brutImposable, 'total',
    ['Somme des éléments imposables : salaire, ancienneté, heures sup., primes imposables, congés, excédent de transport.',
     `Total : ${f(c.brutImposable)} FCFA. Les indemnités exonérées (transport sous le plafond, logement…) n'en font pas partie.`],
    "C'est la base de l'ITS et des cotisations CNPS.")

  // ── Retenues
  const etapesIts = []
  let prec = 0
  for (const { plafond, taux } of B.itsTranches) {
    if (c.brutImposable <= prec) break
    const haut = Math.min(c.brutImposable, plafond)
    etapesIts.push(`De ${f(prec)} à ${f(haut)} : ${pct(taux)} → ${f((haut - prec) * taux)} FCFA.`)
    prec = plafond
  }
  const itsBrut = c.salarial.its + c.salarial.ricf
  etapesIts.push(`Impôt avant réduction : ${f(itsBrut)} FCFA.`)
  if (c.salarial.ricf > 0) {
    const parts = String(c.parts).replace('.', ',')
    etapesIts.push(`Réduction pour charges de famille : ${parts} parts → (${parts} − 1) × ${f(B.ricfParDemiPart)} = ${f(c.salarial.ricf)} FCFA.`)
  }
  etapesIts.push(`ITS retenu : ${f(c.salarial.its)} FCFA.`)
  ajouter('its', 'ITS (impôt sur les salaires)', c.salarial.its, 'retenue', etapesIts,
    'Impôt unique sur les traitements et salaires (réforme 2024) : barème progressif par tranches, puis réduction selon la situation de famille.')

  ajouter('cnps', 'CNPS — retraite', c.salarial.cnps, 'retenue',
    [`Base : brut imposable plafonné à ${f(B.cnps.plafondRetraite)} FCFA → ${f(c.baseCNPS)} FCFA.`,
     `${pct(B.cnps.tauxRetraiteSal)} × ${f(c.baseCNPS)} = ${f(c.salarial.cnps)} FCFA.`,
     `L'employeur paie en plus ${pct(B.cnps.tauxRetraitePat)} pour votre retraite.`],
    'Régime général de retraite CNPS : 14 % au total, dont 6,3 % à la charge du salarié.')

  if (c.salarial.cmu > 0) {
    ajouter('cmu', 'CMU — couverture maladie', c.salarial.cmu, 'retenue',
      [`${c.totalPersonnesCMU} personne(s) couverte(s) (vous et vos ayants droit) × ${f(B.cmuParPersonne)} FCFA = ${f(c.salarial.cmu)} FCFA.`,
       `L'employeur verse le même montant de son côté.`],
      'Couverture maladie universelle : forfait mensuel par personne couverte.')
  }

  const autres = (c.totalRetenuesDiverses || 0)
  if (autres > 0) {
    ajouter('autres', 'Acomptes et autres retenues', autres, 'retenue',
      ['Sommes déjà versées (acompte, avance) ou retenues convenues : elles diminuent le net, pas le brut.'],
      'Retenues hors impôts et cotisations.')
  }

  ajouter('net', 'Net à payer', c.netAPayer, 'total',
    [`Total des gains : ${f(c.gainsTotaux)} FCFA.`,
     `− retenues : ${f(c.salarial.total)} FCFA (ITS ${f(c.salarial.its)}, CNPS ${f(c.salarial.cnps)}, CMU ${f(c.salarial.cmu)}${autres ? `, autres ${f(autres)}` : ''}).`,
     `= ${f(c.netAPayer)} FCFA versés au salarié.`],
    'Le net est ce que le salarié reçoit réellement.')

  // ── Côté employeur
  const p = c.patronal
  ajouter('cout_employeur', 'Coût total pour l’employeur', c.gainsTotaux + p.grandTotal, 'employeur',
    [`Total des gains : ${f(c.gainsTotaux)} FCFA.`,
     `+ CNPS patronale : ${f(p.cnpsRetraite + p.cnpsPF + p.cnpsAM + p.cnpsAT)} FCFA (retraite, prestations familiales, maternité, accident du travail).`,
     `+ CMU patronale : ${f(p.cmu)} FCFA.`,
     `+ impôts employeur : ${f(p.totalFiscal)} FCFA (CN ${f(p.cnEmployeur)}${p.ceEmployeur ? `, CE ${f(p.ceEmployeur)}` : ''}, FDFP ${f(p.fdfpTA + p.fdfpFPC)}).`,
     `= ${f(c.gainsTotaux + p.grandTotal)} FCFA, soit ${pct((c.gainsTotaux + p.grandTotal) / Math.max(1, c.netAPayer) - 1)} de plus que le net.`],
    'Ce que coûte réellement le poste à l’entreprise.')

  return lignes
}
