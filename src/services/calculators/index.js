import { calculateCIPayslip } from './ci'
import { calculateBJPayslip } from './bj'
import { calculateTGPayslip } from './tg'

export function calculatePayslip(emp, rules) {
  // Base calculations that are common to all countries
  const salaireBaseMensuel = +emp.salaire_base || 0
  const joursDansLeMois = 30 
  
  let diffMoisConge = 0
  let totalCongesAcquis = 0
  const dateRefStr = emp.date_dernier_conge || emp.date_embauche
  if (dateRefStr) {
    const d1 = new Date(dateRefStr)
    const d2 = new Date(emp.annee, emp.mois - 1, 1)
    diffMoisConge = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth())
    if (diffMoisConge > 0) {
      totalCongesAcquis = Math.round(Math.floor(diffMoisConge * 2.2) * 10) / 10
    }
  }

  // Jours de congés pris ce mois
  let joursConges = 0
  if (emp.prise_conges_mode === 'partiel' && parseFloat(emp.jours_conges_partiels) > 0) {
    joursConges = parseFloat(emp.jours_conges_partiels)
  } else if (emp.prise_conges_mode === 'total' || emp.bulletin_type === 'conges' || emp.auto_conges) {
    joursConges = totalCongesAcquis
  } else if (parseFloat(emp.jours_conges_pris) > 0) {
    joursConges = parseFloat(emp.jours_conges_pris)
  }

  // Déduction des jours travaillés
  const joursBase = +emp.jours_travailles || 30
  let joursTrav = 0
  if ((emp.bulletin_type === 'conges' || emp.prise_conges_mode === 'total') && totalCongesAcquis >= joursBase) {
    joursTrav = 0
  } else {
    joursTrav = Math.max(0, joursBase - (+emp.absences_jours || 0) - joursConges)
  }

  const baseProrata = (joursTrav / joursDansLeMois)
  const salaireBase = Math.round(salaireBaseMensuel * baseProrata)
  const sursalaire = Math.round((+emp.sursalaire || 0) * baseProrata)

  // Prime ancienneté (Adaptée selon le pays)
  let primeAnciennete = 0
  let ansAnciennete = 0
  let tauxAnciennete = 0
  let ancienneteTxt = ''
  if (emp.date_embauche) {
    const emb = new Date(emp.date_embauche)
    const paieDate = new Date(emp.annee, emp.mois - 1, 30)
    const diffTime = Math.abs(paieDate - emb)
    ansAnciennete = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365.25))

    if (rules.code === 'BJ') {
      // Bénin : 3% à 3 ans, 5% à 5 ans, +1%/an de 7 à 20 ans
      if (ansAnciennete >= 7) tauxAnciennete = Math.min(5 + (ansAnciennete - 6), 19)
      else if (ansAnciennete >= 5) tauxAnciennete = 5
      else if (ansAnciennete >= 3) tauxAnciennete = 3
    } else if (rules.code === 'TG') {
      // Togo CCIT : 5% à 2 ans, +2% tous les 3 ans supplémentaires (max 35%)
      if (ansAnciennete >= 2) {
        tauxAnciennete = Math.min(5 + Math.floor((ansAnciennete - 2) / 3) * 2, 35)
      }
    } else {
      // Côte d'Ivoire (CI) : 2% à 2 ans, +1%/an jusqu'à 25 ans
      if (ansAnciennete >= 2) {
        tauxAnciennete = Math.min(1 + ansAnciennete, 25)
      }
    }

    if (tauxAnciennete > 0) {
      primeAnciennete = Math.round(salaireBaseMensuel * (tauxAnciennete / 100))
    }
    ancienneteTxt = `${ansAnciennete} an(s)`
  }

  // Congés payés
  let allocationConges = 0
  if (joursConges > 0) {
    const total12Mois = (salaireBaseMensuel + (+emp.sursalaire || 0) + primeAnciennete) * 12
    allocationConges = Math.round((total12Mois / 12) * (joursConges / 30))
  }

  // Primes additionnelles
  const primeTransport = (+emp.prime_transport || 0)
  const primeLogement = (+emp.prime_logement || 0)
  
  let primesImposables = 0
  let primesNonImposablesRub = 0
  
  if (Array.isArray(emp.primes)) {
    emp.primes.forEach(p => {
      const montant = +p.montant || 0
      if (montant > 0) {
        if (p.imposable) primesImposables += montant
        else primesNonImposablesRub += montant
      }
    })
  }

  // Heures supplémentaires
  const nbHeuresSup = +emp.heures_sup_nb || 0
  const coefHS = +emp.heures_sup_coef || 1
  const tauxHoraire = Math.round(salaireBaseMensuel / 173.33)
  const montantHeuresSup = Math.round(tauxHoraire * nbHeuresSup * coefHS)

  const salaireBrut = salaireBase + sursalaire + primeAnciennete + allocationConges + montantHeuresSup + primesImposables
  
  const acompte = +emp.acompte || 0
  const avance = +emp.avance || 0
  const opposition = +emp.opposition || 0
  const autresRetenues = +emp.autres_retenues || 0
  const totalRetenuesDiverses = acompte + avance + opposition + autresRetenues

  const baseData = {
    salaireBaseMensuel, joursDansLeMois, joursTrav, joursCP: joursConges, totalCongesAcquis, diffMoisConge,
    salaireBase, sursalaire, primeAnciennete, ansAnciennete, tauxAnciennete, ancienneteTxt,
    allocationConges, primeTransport, primeLogement,
    primesImposables, primesNonImposablesRub,
    nbHeuresSup, coefHS, tauxHoraire, montantHeuresSup,
    salaireBrut,
    acompte, avance, opposition, autresRetenues, totalRetenuesDiverses
  }

  switch (rules.code) {
    case 'CI':
      return calculateCIPayslip(baseData, emp, rules)
    case 'BJ':
      return calculateBJPayslip(baseData, emp, rules)
    case 'TG':
      return calculateTGPayslip(baseData, emp, rules)
    default:
      return calculateCIPayslip(baseData, emp, rules)
  }
}
