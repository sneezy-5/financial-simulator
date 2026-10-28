// Cas de référence du moteur de paie CI.
//
// Chaque cas est un salarié complet (mêmes champs que la fiche / l'import) avec
// une période figée, pour que le résultat ne dépende pas de la date du jour.
// `attendu` ne contient que des montants vérifiés à la main (voir `calcul`) :
// c'est ce qu'un RH doit retrouver en refaisant le bulletin sur papier.

const PERIODE = { mois: 10, annee: 2026 };

module.exports = [
  {
    nom: 'Célibataire, 400 000, transport 30 000 (tout exonéré)',
    employe: { ...PERIODE, salaire_base: 400000, prime_transport: 30000, situation_matrimoniale: 'celibataire', nombre_enfants: 0 },
    calcul: 'ITS = (240 000-75 000)×16 % + (400 000-240 000)×21 % = 26 400 + 33 600 = 60 000 ; CNPS 6,3 % = 25 200 ; CMU 500 ; net = 430 000 - 85 700',
    attendu: { brutImposable: 400000, its: 60000, cnps: 25200, cmu: 500, netAPayer: 344300, primeTransport: 30000, primeTransportImposable: 0 }
  },
  {
    nom: 'Célibataire, 400 000, transport 50 000 (20 000 imposables)',
    employe: { ...PERIODE, salaire_base: 400000, prime_transport: 50000, situation_matrimoniale: 'celibataire', nombre_enfants: 0 },
    calcul: 'brut imposable 420 000 ; ITS = 26 400 + 180 000×21 % = 64 200 ; CNPS 26 460 ; net = 450 000 - 91 160',
    attendu: { brutImposable: 420000, its: 64200, cnps: 26460, cmu: 500, netAPayer: 358840, primeTransport: 30000, primeTransportImposable: 20000 }
  },
  {
    nom: 'Marié, 2 enfants, 400 000 (3 parts, RICF 22 000)',
    employe: { ...PERIODE, salaire_base: 400000, prime_transport: 30000, situation_matrimoniale: 'marie', nombre_enfants: 2 },
    calcul: 'parts = 2 + 2×0,5 = 3 ; RICF = (3-1)×11 000 = 22 000 ; ITS = 60 000 - 22 000 = 38 000 ; CMU 4 personnes × 500 = 2 000',
    attendu: { its: 38000, cnps: 25200, cmu: 2000, netAPayer: 364800 }
  },
  {
    nom: 'Salaire au SMIG, 75 000 (ITS nul)',
    employe: { ...PERIODE, salaire_base: 75000, prime_transport: 30000, situation_matrimoniale: 'celibataire' },
    calcul: '75 000 dans la tranche à 0 % ; CNPS 4 725 ; net = 105 000 - 5 225',
    attendu: { its: 0, cnps: 4725, netAPayer: 99775 }
  },
  {
    nom: 'Haut salaire, 4 000 000 (plafond CNPS 3 375 000)',
    employe: { ...PERIODE, salaire_base: 4000000, prime_transport: 30000, situation_matrimoniale: 'celibataire' },
    calcul: 'CNPS = 3 375 000 × 6,3 % = 212 625 ; ITS = 26 400 + 117 600 + 384 000 + 448 000 = 976 000',
    attendu: { baseCNPS: 3375000, cnps: 212625, its: 976000 }
  },
  {
    nom: 'Ancienneté 10 ans (10 %), sursalaire',
    employe: { ...PERIODE, salaire_base: 300000, sursalaire: 50000, prime_transport: 30000, date_embauche: '2016-03-01', situation_matrimoniale: 'celibataire' },
    calcul: '10 ans révolus au 01/10/2026 → 10 % × 300 000 = 30 000 ; brut = 300 000 + 50 000 + 30 000 = 380 000',
    attendu: { primeAnciennete: 30000, brutImposable: 380000 }
  },
  {
    nom: 'Ancienneté 2 ans pile (2 %)',
    employe: { ...PERIODE, salaire_base: 300000, prime_transport: 30000, date_embauche: '2024-10-01', situation_matrimoniale: 'celibataire' },
    calcul: 'convention collective : 2 % dès 2 ans → 6 000',
    attendu: { primeAnciennete: 6000 }
  },
  {
    nom: '2 jours d\'absence (base 26)',
    employe: { ...PERIODE, salaire_base: 400000, prime_transport: 30000, absences_jours: 2, situation_matrimoniale: 'celibataire' },
    calcul: '400 000 / 26 × 24 = 369 231 ; transport 30 000 / 26 × 24 = 27 692',
    attendu: { salaireBase: 369231, primeTransport: 27692 }
  },
  {
    nom: '10 heures sup. ordinaires (6 à 1,15 + 4 à 1,50)',
    employe: { ...PERIODE, salaire_base: 250000, prime_transport: 30000, heures_sup_nb: 10, situation_matrimoniale: 'celibataire' },
    calcul: 'taux horaire = 250 000 / 173,33 = 1 442 ; 6×1 442×1,15 = 9 950 ; 4×1 442×1,5 = 8 652',
    attendu: { tauxHoraire: 1442, montantHeuresSup: 18602 }
  },
  {
    nom: 'Bulletin de congés (12 mois acquis, ancienneté > 5 ans)',
    employe: { ...PERIODE, salaire_base: 390000, prime_transport: 30000, bulletin_type: 'conges', date_embauche: '2019-01-15', date_dernier_conge: '2025-10-01', situation_matrimoniale: 'celibataire' },
    calcul: '12 mois × 2,2 = 26 j + 1 j de majoration (7 ans) = 27 j ; ancienneté 7 % = 27 300 ; allocation = (390 000 + 27 300) / 30 × 27 = 375 570 ; pas de transport',
    attendu: { joursCP: 27, allocationConges: 375570, primeTransport: 0 }
  },
  {
    nom: 'Expatrié marié 1 enfant, logement, primes et acompte',
    employe: {
      ...PERIODE, salaire_base: 1500000, prime_transport: 30000, prime_logement: 100000, statut_salarie: 'expatrie',
      situation_matrimoniale: 'marie', nombre_enfants: 1, acompte: 50000,
      primes: [{ libelle: 'Prime de fonction', montant: 100000, imposable: true }, { libelle: 'Panier', montant: 20000, imposable: false }]
    },
    calcul: 'brut imposable 1 600 000 ; CE expatrié 9,2 % = 147 200 ; CN 1,2 % = 19 200',
    attendu: { brutImposable: 1600000, ceEmployeur: 147200, cnEmployeur: 19200 }
  },
  {
    nom: 'Veuf 3 enfants, ayants droit CMU saisis',
    employe: { ...PERIODE, salaire_base: 500000, prime_transport: 30000, situation_matrimoniale: 'veuf', nombre_enfants: 3, ayants_droit_cmu: 2 },
    calcul: 'parts veuf avec enfants = 2 + 1,5 = 3,5 ; CMU 3 personnes = 1 500',
    attendu: { parts: 3.5, cmu: 1500 }
  }
];
