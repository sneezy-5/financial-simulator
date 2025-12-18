// ══════════════════════════════════════════════════════════════════════════
// DONNÉES DES BANQUES ET PRÊTS - CÔTE D'IVOIRE
// Données officielles récupérées des sites des banques
// ══════════════════════════════════════════════════════════════════════════

import bniLogo from '../assets/logos/bni.jpg'
import sgciLogo from '../assets/logos/sgci.png'
import nsiaLogo from '../assets/logos/nsia.jpg'
import ecobankLogo from '../assets/logos/ecobank.png'
import ubaLogo from '../assets/logos/uba.png'
import bsicLogo from '../assets/logos/bsic.png'
import biciciLogo from '../assets/logos/bicici.jpg'
import sibLogo from '../assets/logos/sib.png'
import bbgLogo from '../assets/logos/bbg.png'
import autreBanqueLogo from '../assets/logos/autre_banque.png'

export const BANQUES = [
  {
    id: 1,
    nom: "BNI",
    pays: "CI",
    logo: bniLogo,
    description: "Banque Nationale d'Investissement"
  },
  {
    id: 2,
    nom: "SGCI",
    pays: "CI",
    logo: sgciLogo,
    description: "Société Générale Côte d'Ivoire"
  },
  {
    id: 3,
    nom: "NSIA Banque",
    pays: "CI",
    logo: nsiaLogo,
    description: "NSIA Banque"
  },
  {
    id: 4,
    nom: "Ecobank",
    pays: "CI",
    logo: ecobankLogo,
    description: "La banque panafricaine"
  },
  {
    id: 5,
    nom: "UBA",
    pays: "CI",
    logo: ubaLogo,
    description: "United Bank for Africa"
  },
  {
    id: 6,
    nom: "BSIC",
    pays: "CI",
    logo: bsicLogo,
    description: "Banque Sahélo-Saharienne pour l'Investissement et le Commerce"
  },
  {
    id: 7,
    nom: "BICICI",
    pays: "CI",
    logo: biciciLogo,
    description: "Banque Internationale pour le Commerce et l'Industrie de la Côte d'Ivoire"
  },
  {
    id: 8,
    nom: "SIB",
    pays: "CI",
    logo: sibLogo,
    description: "Société Ivoirienne de Banque"
  },
  {
    id: 9,
    nom: "Bridge Bank Group",
    pays: "CI",
    logo: bbgLogo,
    description: "BBG - The Bridge to your success"
  },
  {
    id: 99,
    nom: "Autre Banque",
    pays: "CI",
    logo: autreBanqueLogo,
    description: "Simulation générique pour toute autre banque"
  }
];


// ══════════════════════════════════════════════════════════════════
// QUOTITÉS CESSIBLES PAR BANQUE ET PAR TRANCHE DE REVENUS
// La quotité cessible = part maximale du salaire pouvant être prélevée
// ══════════════════════════════════════════════════════════════════
export const QUOTITES_CESSIBLES = {
  // Quotité standard UEMOA (par défaut)
  standard: {
    description: "Quotité légale UEMOA",
    taux_max: 33.33, // 1/3 du salaire
    tranches: [
      { revenu_max: 500000, taux: 33.33 },
      { revenu_min: 500001, taux: 33.33 }
    ]
  },

  // BSIC - Quotités variables selon revenus
  bsic: {
    description: "Grille BSIC Côte d'Ivoire",
    tranches: [
      { revenu_min: 80000, revenu_max: 200000, taux: 35 },
      { revenu_min: 200001, revenu_max: 400000, taux: 38 },
      { revenu_min: 400001, revenu_max: 600000, taux: 42 },
      { revenu_min: 600001, revenu_max: 800000, taux: 45 },
      { revenu_min: 800001, revenu_max: 1000000, taux: 48 },
      { revenu_min: 1000001, revenu_max: 1500000, taux: 52 },
      { revenu_min: 1500001, revenu_max: 2000000, taux: 55 },
      { revenu_min: 2000001, taux: 57 }
    ]
  },

  // Grille étendue pour hauts revenus
  etendue: {
    description: "Quotité étendue (hauts revenus)",
    tranches: [
      { revenu_max: 300000, taux: 33.33 },
      { revenu_min: 300001, revenu_max: 600000, taux: 40 },
      { revenu_min: 600001, revenu_max: 1000000, taux: 45 },
      { revenu_min: 1000001, revenu_max: 2000000, taux: 50 },
      { revenu_min: 2000001, taux: 55 }
    ]
  }
};

// Mapping banque -> type de quotité
export const BANQUE_QUOTITE_MAP = {
  1: "standard",  // BNI
  2: "standard",  // SGCI
  3: "standard",  // NSIA
  4: "standard",  // Ecobank
  5: "standard",  // UBA
  6: "bsic",      // BSIC (grille spécifique)
  7: "standard",  // BICICI
  8: "etendue",   // SIB (jusqu'à 60% du salaire)
  9: "standard",  // BBG (Bridge Bank Group)
  99: "standard"  // Autre
};

export const TYPES_PRETS = [
  // ═══════════════════════════════════════════════════════════════
  // BRIDGE BANK GROUP (BBG)
  // ═══════════════════════════════════════════════════════════════

  // BRIDGE PRÊT CONSO
  {
    id: 901,
    banque_id: 9,
    nom: "Bridge Prêt Conso",
    taux: 8.5,
    taux_min: 8.5,
    montant_min: 500000,
    montant_max: 40000000,
    duree_min: 6,
    duree_max: 72,
    frais_dossier: 1, // Standard estimé
    assurance: 0.35, // Standard estimé
    description: "Solution pour financer divers besoins personnels (rénovations, équipements, imprévus) sans puiser dans votre épargne.",
    avantages: [
      "Montant jusqu'à 40 millions FCFA",
      "Durée jusqu'à 72 mois (6 ans)",
      "Possibilité de rachat de crédit"
    ],
    documents: [
      "Demande de prêt",
      "Justificatifs de revenus",
      "Facture proforma (si applicable)",
      "Relevés bancaires"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      revenus_min: 100000, // Estimé
      types_contrat: ["cdi", "fonctionnaire"],
      domiciliation_obligatoire: true,
      compte_cheque_obligatoire: true
    }
  },

  // BRIDGE PRÊT IMMO
  {
    id: 902,
    banque_id: 9,
    nom: "Bridge Prêt Immo",
    taux: 8.5,
    montant_min: 5000000,
    montant_max: 150000000, // Max absolu (Acquisition/Refinancement)
    duree_min: 60,
    duree_max: 240, // 20 ans
    frais_dossier: 1,
    assurance: 0.35,
    description: "Formule pour l'acquisition, l'aménagement, la construction ou le refinancement d'un bien immobilier.",
    avantages: [
      "Durée jusqu'à 20 ans",
      "Option de différé possible",
      "Taux avantageux avec PEL",
      "Financement Acquisition (150M), Construction (125M), Rénovation (100M)"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      revenus_min: 500000,
      types_contrat: ["cdi", "fonctionnaire"],
      garantie_requise: true,
      types_garantie_acceptes: ["hypotheque"],
      domiciliation_obligatoire: true,
      zone_geographique: ["Abidjan", "Grand Abidjan", "San Pedro"]
    }
  },

  // BRIDGE PRÊT EXPRESS (Urgence)
  {
    id: 903,
    banque_id: 9,
    nom: "Bridge Prêt Express",
    taux: 12.0,
    montant_min: 50000,
    montant_max: 1000000, // Sera plafonné dynamiquement à 1 mois de salaire
    duree_min: 1,
    duree_max: 6,
    frais_dossier: 10000, // Forfait estimé ou %
    assurance: 0.35,
    description: "Prêt d'urgence pour besoins courants, sans justificatifs particuliers (factures).",
    avantages: [
      "Réponse rapide pour urgences",
      "Pas de justificatifs d'utilisation requis",
      "Jusqu'à 100% du salaire net domicilié"
    ],
    conditions: {
      age_min: 21,
      revenus_min: 100000,
      types_contrat: ["cdi", "fonctionnaire", "cdd"],
      domiciliation_obligatoire: true,
      plafond_salaire: 1 // 1 mois de salaire max
    }
  },

  // AVANCE SUR SALAIRE (Découvert)
  {
    id: 904,
    banque_id: 9,
    nom: "Avance sur Salaire (Découvert)",
    type: "decouvert",
    taux: 12.0, // Taux annuel
    taux_mensuel: 1.0, // ~1% par mois
    montant_min: 150000, // 30% de 500k
    montant_max: 5000000, // Plafonné à 30% du salaire
    duree_min: 12, // Durée du contrat (renouvelable)
    duree_max: 12,
    frais_dossier: 2, // 2% HT
    assurance: 10000, // Forfait min (varie 10k-40k)
    description: "Découvert permanent renouvelable pour faire face aux dépenses imprévues. Utilisable par chèque ou carte.",
    avantages: [
      "Découvert autorisé de 30% du salaire net",
      "Pas d'intérêts si non utilisé",
      "Renouvellement par tacite reconduction",
      "Assurance Décès/Invalidité incluse"
    ],
    conditions: {
      salaire_min: 500000,
      anciennete_min: 6,
      types_contrat: ["cdi", "fonctionnaire"],
      domiciliation_obligatoire: true,
      employeur_agree: true, // Employeur doit être agréé par BBG
      plafond_salaire_pct: 30 // 30% du salaire
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // BNI - BANQUE NATIONALE D'INVESTISSEMENT (Données officielles bni.ci)
  // ═══════════════════════════════════════════════════════════════

  // PRÊT À LA CONSOMMATION BNI
  {
    id: 101,
    banque_id: 1,
    nom: "Prêt à la Consommation BNI",
    taux: 8.5, // TBB - 2,5% = 8,5% HT (ou TBB - 3,5% = 7,5% HT)
    taux_min: 7.5,
    taux_max: 8.5,
    montant_min: 500000,
    montant_max: 40000000,
    duree_min: 6,
    duree_max: 84, // 84 mois max
    frais_dossier: 1,
    assurance: 0.05, // 0,05%
    tob: 10, // Taxe sur Opération Bancaire : 10%
    description: "Financement à court/moyen terme pour satisfaire vos besoins courants en acquisition de biens d'équipements ou de consommation.",
    avantages: [
      "Taux à partir de 7,5% HT (selon profil)",
      "Durée jusqu'à 84 mois (7 ans)",
      "Plafond selon quotité cessible",
      "Accessible salariés public/privé et corps habillés"
    ],
    documents: [
      "Demande manuscrite de prêt",
      "Engagement de domiciliation irrévocable de salaire",
      "Reconnaissance de dette",
      "3 derniers bulletins de salaire",
      "Formulaire d'assurance renseigné",
      "Attestation de non redevance (si compte dans autre banque)",
      "2 photos d'identité de même tirage",
      "Facture élect./eau/téléphone < 3 mois ou certificat résidence",
      "Attestation de présence au corps (militaires, policiers)",
      "Attestation de travail (salariés)",
      "Attestation de non révocation de domiciliation (fonctionnaires)",
      "Attestation administrative pour prêt bancaire (fonctionnaires)"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 12,
      revenus_min: 150000,
      types_contrat: ["fonctionnaire", "cdi", "cdd"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      assurance_vie_obligatoire: true,
      compte_cheque_obligatoire: true
    }
  },

  // PRÊT VÉHICULE
  {
    id: 102,
    banque_id: 1,
    nom: "Prêt Véhicule BNI",
    taux: 7.0, // Taux fixe
    montant_min: 5000000,
    montant_max: 50000000,
    duree_min: 36, // 3 ans
    duree_max: 48, // 4 ans max
    frais_dossier: 1,
    assurance: 0.05,
    description: "Prêt pour l'acquisition d'un véhicule NEUF uniquement. Le véhicule sera gagé à 100% au profit de la BNI.",
    avantages: [
      "Taux préférentiel de 7%",
      "Durée 3 à 4 ans",
      "Assurance tout risque incluse possible",
      "Règlement direct au concessionnaire"
    ],
    documents: [
      "Documents usuels du PPO",
      "Facture pro-forma du concessionnaire",
      "Engagement domiciliation salaire (partiel ou total)"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 12,
      revenus_min: 300000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: true,
      types_garantie_acceptes: ["gage_vehicule"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      vehicule_neuf_uniquement: true,
      assurance_tous_risques_obligatoire: true
    }
  },

  // PRÊT DE FIN D'ANNÉE
  {
    id: 103,
    banque_id: 1,
    nom: "Prêt de Fin d'Année BNI",
    taux: 7.0,
    montant_min: 200000,
    montant_max: 40000000,
    duree_min: 6,
    duree_max: 24, // 24 mois max
    frais_dossier: 1.5, // 1,5% du montant
    assurance: 0.05,
    delai_mise_en_place: "72h",
    description: "Prêt pour financer les fêtes de fin d'année, célébrations familiales, voyages d'agrément, équipements et étrennes.",
    avantages: [
      "Taux attractif de 7%",
      "Mise en place à partir de 72h",
      "Durée jusqu'à 24 mois",
      "Accessible retraités, corps habillés"
    ],
    documents: [
      "Demande manuscrite de prêt",
      "3 derniers bulletins de salaire",
      "Formulaire d'assurance renseigné",
      "Attestation de non redevance",
      "Facture élect./eau/téléphone < 3 mois ou certificat résidence",
      "Engagement domiciliation irrévocable (salariés)",
      "Attestation de travail (salariés)",
      "Attestation de présence au corps (militaires, policiers)",
      "Attestation de non révocation domiciliation (fonctionnaires)",
      "Attestation administrative pour prêt bancaire (fonctionnaires)"
    ],
    conditions: {
      age_min: 21,
      age_max: 65,
      anciennete_min: 6,
      revenus_min: 100000,
      types_contrat: ["fonctionnaire", "cdi", "cdd", "retraite"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      package_prioritaire_requis: true,
      bancassurance_obligatoire: true,
      assurance_vie_obligatoire: true
    }
  },

  // BONNE ANNÉE CRÉDIT
  {
    id: 104,
    banque_id: 1,
    nom: "Bonne Année Crédit BNI",
    taux: 7.0,
    montant_min: 200000,
    montant_max: 40000000,
    duree_min: 6,
    duree_max: 60, // 60 mois pour retraités
    frais_dossier: 1,
    assurance: 0.05,
    description: "Prêt post-fêtes pour financer les dépenses après les célébrations de fin d'année. Idéal pour repartir sereinement.",
    avantages: [
      "Taux attractif de 7% HT",
      "Plafond 40 millions FCFA",
      "Durée jusqu'à 60 mois (retraités)",
      "Nantissement PEC/PEL possible"
    ],
    documents: [
      "Demande manuscrite de prêt",
      "3 derniers bulletins de salaire",
      "Formulaire d'assurance renseigné",
      "Attestation de non redevance (ou redevance si rachat externe)",
      "Facture élect./eau/téléphone < 3 mois ou certificat résidence",
      "Engagement domiciliation irrévocable (salariés)",
      "Attestation de travail (salariés)",
      "Attestation de présence au corps (militaires, policiers)",
      "Attestation de non révocation domiciliation (fonctionnaires)",
      "Attestation administrative pour prêt bancaire (fonctionnaires)"
    ],
    conditions: {
      age_min: 21,
      age_max: 70,
      anciennete_min: 6,
      revenus_min: 100000,
      types_contrat: ["fonctionnaire", "cdi", "cdd", "retraite"],
      garantie_requise: true,
      types_garantie_acceptes: ["nantissement", "domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      package_prioritaire_requis: true,
      nantissement_pec_pel_obligatoire: true,
      assurance_perte_emploi_obligatoire_prive: true,
      assurance_vie_obligatoire: true
    }
  },

  // BNI FAST LEASING (Crédit-bail auto)
  {
    id: 108,
    banque_id: 1,
    nom: "BNI Fast Leasing (Crédit-bail Auto)",
    type: "leasing",
    taux: 8.5, // Variable selon durée et apport
    montant_min: 5000000,
    montant_max: 100000000,
    duree_min: 12,
    duree_max: 84,
    frais_dossier: 1,
    assurance: 0, // Assurance tous risques obligatoire séparée
    description: "Crédit-bail pour acquérir un véhicule NEUF auprès de concessionnaires agréés. Payez un loyer mensuel et devenez propriétaire en fin de contrat.",
    avantages: [
      "Véhicule neuf = moins de coûts d'entretien",
      "Délai d'étude réduit",
      "Loyer mensuel, trimestriel...",
      "Propriété en fin de contrat après valeur résiduelle",
      "Concessionnaires agréés partenaires"
    ],
    documents: [
      "Demande de financement",
      "Photocopie CNI",
      "Justificatif de domicile < 3 mois",
      "Relevés de compte des 6 derniers mois (si prospect)",
      "3 derniers bulletins de salaire",
      "Attestation de travail",
      "Engagement de domiciliation totale des revenus",
      "Facture proforma du concessionnaire agréé"
    ],
    conditions: {
      age_min: 18,
      age_max: 65,
      anciennete_min: 12,
      revenus_min: 300000,
      types_contrat: ["fonctionnaire", "cdi", "independant"],
      garantie_requise: true,
      types_garantie_acceptes: ["gage_vehicule", "geolocalisation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      vehicule_neuf_uniquement: true,
      assurance_tous_risques_obligatoire: true,
      concessionnaire_agree_obligatoire: true,
      absence_impayes_requise: true,
      quotite_cessible_doit_couvrir_loyer: true
    },
    info_leasing: {
      type_paiement: "loyer périodique (mensuel, trimestriel)",
      cession_anticipee: "Possible après période irrévocable (voir contrat)",
      cession_normale: "Après règlement valeur résiduelle + signature contrat cession",
      geolocalisation: true,
      interets_intercalaires: "Facturés du paiement fournisseur à la livraison"
    }
  },
  {
    id: 109,
    banque_id: 1,
    nom: "Prêt Scolaire BNI",
    taux: 0, // TBB - 10% = 0% HT
    montant_min: 100000,
    montant_max: 10000000,
    duree_min: 3,
    duree_max: 12, // 12 mois max
    frais_dossier: 0,
    assurance: 0.0553, // 0,0553%
    tob: 10, // Taxe sur Opération Bancaire : 10%
    delai_mise_en_place: "72h",
    campagne: "22/07 au 31/10 (annuel)",
    description: "Prêt spécial rentrée scolaire pour financer les dépenses scolaires : inscription, fournitures, uniformes, équipements.",
    avantages: [
      "TAUX 0% HT !",
      "Plafond 10 millions FCFA",
      "Mise en place sous 72h",
      "Durée max 12 mois"
    ],
    documents: [
      "Demande manuscrite de prêt",
      "Engagement de domiciliation irrévocable de salaire",
      "Reconnaissance de dette",
      "3 derniers bulletins de salaire",
      "Formulaire d'assurance renseigné",
      "Attestation de non redevance",
      "2 photos d'identité de même tirage",
      "Facture élect./eau/téléphone < 3 mois ou certificat résidence",
      "Attestation de présence au corps (militaires, policiers)",
      "Attestation de travail (salariés)",
      "Attestation de non révocation de domiciliation (fonctionnaires)",
      "Attestation administrative pour prêt bancaire (fonctionnaires)"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 6,
      revenus_min: 100000,
      types_contrat: ["fonctionnaire", "cdi", "cdd"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      assurance_vie_obligatoire: true,
      bancassurance_obligatoire: true,
      compte_cheque_obligatoire: true
    }
  },
  // CRÉDIT IMMOBILIER BNI - 3 variantes selon le type de promoteur
  {
    id: 105,
    banque_id: 1,
    nom: "Crédit Immobilier BNI (CDMH)",
    taux: 5.5,
    montant_min: 5000000,
    montant_max: 150000000,
    duree_min: 60,
    duree_max: 300,
    frais_dossier: 1,
    assurance: 0.3,
    description: "Prêt immobilier via le Compte de Mobilisation pour l'Habitat (CDMH). Le taux le plus avantageux pour l'acquisition, le rachat ou la construction de logement.",
    avantages: [
      "Taux exceptionnel de 5,5%",
      "Financement jusqu'à 100% possible",
      "Durée jusqu'à 25 ans",
      "Les frais notariés peuvent être inclus si quotité suffisante",
      "Possibilité de crédit consommation 10% + crédit immo 90%"
    ],
    documents: [
      "Demande manuscrite de prêt",
      "Photocopie pièce d'identité (CNI, attestation ou passeport)",
      "Quittance SODECI/CIE ou Certificat de résidence < 3 mois",
      "ACD ou titre de propriété du terrain",
      "Autorisation de construire ou arrêté de concession provisoire",
      "Devis estimatif global des travaux",
      "Plan topographique",
      "Réquisition foncière ou état foncier",
      "Expertise du terrain/maison (MOBTP)",
      "Descriptif du bien",
      "Références du constructeur",
      "Assurance vie, multirisques et dégâts des eaux",
      "Visite médicale gratuite chez WAFA ou SUNU"
    ],
    documents_salaries_prives: [
      "Engagement de domiciliation du salaire",
      "3 derniers bulletins de salaire"
    ],
    documents_fonctionnaires: [
      "Attestation de travail ou décret de nomination",
      "Attestation de non révocation de domiciliation",
      "Attestation administrative pour prêt bancaire",
      "Attestation de présence au poste < 6 mois"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 12,
      revenus_min: 300000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: true,
      types_garantie_acceptes: ["hypotheque"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      type_promoteur: "CDMH"
    }
  },
  {
    id: 106,
    banque_id: 1,
    nom: "Crédit Immobilier BNI (Promoteur Agréé)",
    taux: 8.0,
    montant_min: 5000000,
    montant_max: 150000000,
    duree_min: 60,
    duree_max: 240,
    frais_dossier: 1,
    assurance: 0.3,
    description: "Prêt immobilier pour achat auprès d'une entreprise de promotion immobilière agréée par la BNI.",
    avantages: [
      "Taux préférentiel de 8% HT",
      "Promoteurs partenaires de confiance",
      "Attestation de réservation avec montant apport + coût total",
      "Expertise immobilière incluse"
    ],
    documents: [
      "Demande manuscrite de prêt",
      "Photocopie pièce d'identité",
      "Justificatif de domicile < 3 mois",
      "Attestation de réservation du bien",
      "Contrat de réservation (copie)",
      "Assurance vie et multirisques"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 12,
      revenus_min: 400000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: true,
      types_garantie_acceptes: ["hypotheque"],
      domiciliation_obligatoire: true,
      apport_personnel: 10,
      type_promoteur: "agréé"
    }
  },
  {
    id: 107,
    banque_id: 1,
    nom: "Crédit Immobilier BNI (Promoteur Non Agréé)",
    taux: 9.0,
    montant_min: 5000000,
    montant_max: 100000000,
    duree_min: 60,
    duree_max: 240,
    frais_dossier: 1.5,
    assurance: 0.3,
    description: "Prêt immobilier pour achat auprès d'un constructeur ou promoteur non agréé par la BNI.",
    avantages: [
      "Accessible pour tout type de promoteur",
      "Flexibilité dans le choix du constructeur",
      "Durée jusqu'à 20 ans"
    ],
    documents: [
      "Demande manuscrite de prêt",
      "Photocopie pièce d'identité",
      "Justificatif de domicile < 3 mois",
      "Titre de propriété ou promesse de vente",
      "Devis des travaux",
      "Références du constructeur/architecte",
      "Assurance vie et multirisques"
    ],
    conditions: {
      age_min: 25,
      age_max: 55,
      anciennete_min: 24,
      revenus_min: 500000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: true,
      types_garantie_acceptes: ["hypotheque"],
      domiciliation_obligatoire: true,
      apport_personnel: 20,
      type_promoteur: "non_agréé"
    }
  },
  // ═══════════════════════════════════════════════════════════════
  // SGCI - SOCIÉTÉ GÉNÉRALE CÔTE D'IVOIRE (Données officielles)
  // ═══════════════════════════════════════════════════════════════

  // PRÊT PERSONNEL IMMOBILIER SGCI
  {
    id: 201,
    banque_id: 2,
    nom: "Prêt Personnel Immobilier SGCI",
    taux: 7.5, // Variable selon durée
    montant_min: 5000000,
    montant_max: 200000000,
    duree_min: 36, // 3 ans
    duree_max: 240, // 20 ans
    frais_dossier: 1.5,
    assurance: 0.3,
    description: "Financement de tous vos projets immobiliers : logement neuf, ancien, construction ou travaux d'aménagement.",
    avantages: [
      "Durée jusqu'à 20 ans",
      "Financement logement neuf ou ancien",
      "Construction et travaux inclus",
      "Accompagnement personnalisé"
    ],
    frais_dossier_detail: [
      { palier: "5M - 25M", taux: 1.5, max: 200000 },
      { palier: "25M - 50M", taux: 1.5, max: 300000 },
      { palier: "50M - 100M", taux: 1.5, max: 500000 },
      { palier: "> 100M", taux: 0.75, min: 750000, max: 3000000 }
    ],
    documents_etat_civil: [
      "Pièce d'identité valide",
      "Extrait de naissance",
      "Certificat de mariage / acte de divorce / acte de décès conjoint",
      "Quittance CIE/SODECI"
    ],
    documents_revenus: [
      "Bulletins de salaire",
      "Contrat de travail",
      "Attestation de travail",
      "Domiciliation de revenus",
      "Contrat de bail (si applicable)"
    ],
    documents_logement_neuf: [
      "Attestation ou contrat de réservation",
      "Copie des reçus de paiement ou attestation de versement"
    ],
    documents_logement_ancien: [
      "Certificat de propriété foncière (CPF) ou ACD",
      "État foncier < 3 mois (conservation foncière)",
      "Promesse/compromis/attestation de vente (notaire)"
    ],
    documents_construction: [
      "Certificat de propriété foncière (CPF) ou ACD",
      "État foncier < 3 mois",
      "Permis de construire",
      "Devis des travaux"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 12,
      revenus_min: 400000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: true,
      types_garantie_acceptes: ["hypotheque"],
      domiciliation_obligatoire: true,
      apport_personnel: 10,
      compte_cheque_obligatoire: true
    }
  },

  // PRÊT PERSONNEL ORDINAIRE SGCI (Données officielles)
  {
    id: 202,
    banque_id: 2,
    nom: "Prêt Personnel Ordinaire SGCI",
    taux: 10.5,
    montant_min: 500000, // 500 000 FCFA minimum
    montant_max: 50000000, // Selon capacité d'endettement
    duree_min: 18, // 18 mois
    duree_max: 60, // 60 mois
    frais_dossier: 1.5,
    assurance: 0.4,
    description: "Crédit à la consommation pour couvrir tous vos besoins personnels. Montant selon capacité d'endettement.",
    avantages: [
      "Montant minimum 500 000 FCFA",
      "Maximum selon capacité d'endettement",
      "Durée de 18 à 60 mois"
    ],
    documents: [
      "Pièce d'identité ou attestation d'identité valide",
      "Quittance CIE/SODECI au nom du client OU attestation de domicile sur l'honneur + plan d'accès",
      "Justificatif de revenus"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 6,
      revenus_min: 150000,
      types_contrat: ["fonctionnaire", "cdi", "cdd", "independant"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      compte_cheque_ou_vie_domestique: true
    }
  },

  // PRÊT SCOLAIRE SGCI (Données officielles)
  {
    id: 203,
    banque_id: 2,
    nom: "Prêt Scolaire SGCI",
    taux: 6.5,
    montant_min: 250000,
    montant_max: 4000000,
    duree_min: 12,
    duree_max: 18,
    frais_dossier: 1,
    assurance: 0.3,
    description: "Financement des frais scolaires : inscription, fournitures, uniforme, équipements.",
    avantages: [
      "Montant 250 000 à 4 millions FCFA",
      "Durée 12 à 18 mois",
      "Accessible aux particuliers et professionnels"
    ],
    documents: [
      "Pièce d'identité ou attestation d'identité valide",
      "Quittance CIE/SODECI au nom du client OU attestation de domicile sur l'honneur + plan d'accès",
      "Justificatif de revenus"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 6,
      revenus_min: 100000,
      types_contrat: ["fonctionnaire", "cdi", "cdd", "independant"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: false,
      apport_personnel: 0,
      compte_cheque_ou_vie_domestique: true
    }
  },

  // RAPPEL PLUS SGCI (Données officielles)
  {
    id: 204,
    banque_id: 2,
    nom: "Rappel Plus SGCI",
    taux: 9.5,
    montant_min: 600000, // 600 000 FCFA
    montant_max: 3000000, // 3 000 000 FCFA
    duree_min: 24, // Durée fixe
    duree_max: 24, // 24 mois
    frais_dossier: 1,
    assurance: 0.3,
    description: "Crédit spécial pour nouvelles recrues de la fonction publique n'ayant pas encore perçu leur premier salaire ou rappel de salaire.",
    avantages: [
      "Montant 600 000 à 3 millions FCFA",
      "Durée 24 mois",
      "Spécial nouvelles recrues fonction publique"
    ],
    documents: [
      "Pièce d'identité, attestation d'identité, titre provisoire de séjour ou carte consulaire valide",
      "Quittance CIE/SODECI et/ou attestation de domicile sur l'honneur",
      "Certificat de première prise de service ou attestation de présence au corps",
      "Fiche espace fonctionnaire SIGFAE",
      "Avis d'affectation (enseignants primaire/secondaire)",
      "Procès-verbal de recrutement (enseignants supérieur)"
    ],
    conditions: {
      age_min: 18,
      age_max: 60,
      anciennete_min: 0, // Nouvelle recrue, pas d'ancienneté requise
      revenus_min: 0, // Pas encore de salaire
      types_contrat: ["fonctionnaire"],
      garantie_requise: false,
      types_garantie_acceptes: [],
      domiciliation_obligatoire: false,
      apport_personnel: 0,
      nouvelle_recrue_fonction_publique: true
    }
  },

  // AVANCE CONVENTIONNELLE DE TRÉSORERIE SGCI (Données officielles)
  {
    id: 205,
    banque_id: 2,
    nom: "Avance Conventionnelle Trésorerie SGCI",
    type: "avance_tresorerie",
    taux: 8.0,
    montant_min: 75000, // 50% de 150 000 min
    montant_max: 3000000, // 50% du salaire, palier max
    duree_min: 1, // 30 jours max d'utilisation
    duree_max: 1, // 1 mois
    duree_contrat: 12, // Contrat 1 an renouvelable
    frais_dossier: 0,
    assurance: 0, // Assurance CERTICOMPTE obligatoire selon palier
    description: "Avance de trésorerie pour aborder sereinement vos fins de mois. 50% max du salaire domicilié, utilisable 30 jours.",
    avantages: [
      "50% maximum du salaire domicilié",
      "Utilisation sur 30 jours max",
      "Contrat 1 an renouvelable tacitement",
      "Idéal pour fins de mois difficiles"
    ],
    documents: [
      "Être client avec salaire domicilié depuis 3 mois minimum",
      "Salaire minimum de 150 000 FCFA"
    ],
    assurance_certicompte: [
      { palier: "ACT ≤ 1 000 000", formule: "CERTICOMPTE 1" },
      { palier: "1 000 001 ≤ ACT ≤ 2 000 000", formule: "CERTICOMPTE 2" },
      { palier: "2 000 001 ≤ ACT ≤ 3 000 000", formule: "CERTICOMPTE 3" }
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 3, // 3 mois de domiciliation minimum
      revenus_min: 150000, // Salaire minimum 150 000 FCFA
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: true,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      compte_cheque_obligatoire: true,
      montant_max_pct_salaire: 50
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // NSIA BANQUE (Données officielles nsiabanque.ci)
  // ═══════════════════════════════════════════════════════════════

  // PRÊT ECLAIR NSIA
  {
    id: 301,
    banque_id: 3,
    nom: "Prêt Eclair NSIA",
    taux: 9.0, // TBB - 1,7% HT = 9% HT
    montant_min: 100000,
    montant_max: 2000000, // 2 millions max
    duree_min: 3,
    duree_max: 24, // 24 mois max
    frais_dossier: 2,
    assurance: 0.43,
    description: "Pour vos petits projets : besoins urgents, imprévus, petites dépenses. Déblocage rapide.",
    avantages: [
      "Montant jusqu'à 2 millions FCFA",
      "Taux attractif de 9% HT",
      "Durée max 24 mois",
      "Procédure simplifiée"
    ],
    documents: [
      "Bulletin de salaire (1 pour anciens clients, 3 pour nouveaux)",
      "Demande manuscrite",
      "Photocopie pièce d'identité",
      "Attestation pour prêt bancaire (fonctionnaires)",
      "Domiciliation de salaire (nouveaux clients)",
      "Attestation de travail (secteur privé)"
    ],
    conditions: {
      age_min: 18,
      age_max: 60,
      anciennete_min: 3,
      revenus_min: 80000,
      types_contrat: ["fonctionnaire", "cdi", "cdd"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: false,
      apport_personnel: 0,
      produit_obligatoire: ["PEC", "PEL"]
    }
  },

  // PPO CLASSIQUE NSIA
  {
    id: 302,
    banque_id: 3,
    nom: "PPO Classique NSIA",
    taux: 11.0, // Variable selon durée: 10.5% (<36), 11% (37-48), 12% (49-72)
    taux_par_duree: [
      { duree_max: 36, taux: 10.5 },
      { duree_min: 37, duree_max: 48, taux: 11.0 },
      { duree_min: 49, duree_max: 72, taux: 12.0 }
    ],
    montant_min: 100000,
    montant_max: 20000000, // 20 millions max
    duree_min: 6,
    duree_max: 72, // 72 mois max
    frais_dossier: 3, // 3% HT (min 15K, max 200K)
    frais_dossier_detail: [
      { seuil: 500000, taux: 2, min: 5000, max: 15000 },
      { seuil: 500001, taux: 3, min: 15000, max: 200000 }
    ],
    assurance: 0.43, // 0.43% HT par an (ou 5000 si < 500K)
    description: "Pour tous vos projets, petits comme grands. Montant selon quotité cessible.",
    avantages: [
      "Montant jusqu'à 20 millions FCFA",
      "Durée jusqu'à 72 mois (6 ans)",
      "Taux à partir de 10,5% HT",
      "Selon quotité cessible"
    ],
    documents: [
      "Bulletin de salaire (1 pour anciens clients, 3 pour nouveaux)",
      "Demande manuscrite",
      "Photocopie pièce d'identité",
      "Attestation pour prêt bancaire (fonctionnaires)",
      "Attestation de non révocation de domiciliation (fonctionnaires)",
      "Certificat de présence au corps + attestation individuelle de solde (FRCI)",
      "Extrait de compte des 3 derniers mois"
    ],
    conditions: {
      age_min: 18,
      age_max: 60,
      anciennete_min: 6,
      revenus_min: 100000,
      types_contrat: ["fonctionnaire", "cdi", "cdd"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: false,
      apport_personnel: 0,
      produit_obligatoire: ["PEC", "PEL"]
    }
  },

  // PRÊT ÉQUIPEMENT NSIA
  {
    id: 303,
    banque_id: 3,
    nom: "Prêt Équipement NSIA",
    taux: 10.0, // Variable selon fournisseur
    montant_min: 100000,
    montant_max: 10000000,
    duree_min: 6,
    duree_max: 48,
    frais_dossier: 2,
    assurance: 0.43,
    description: "Meubles, électroménager… équipez votre maison en toute sérénité. Conditions selon fournisseur partenaire.",
    avantages: [
      "Financement équipement maison",
      "Partenariat avec fournisseurs",
      "Conditions adaptées"
    ],
    documents: [
      "Courrier indiquant le type de prêt",
      "Facture pro-forma du fournisseur",
      "Documents usuels (pièce d'identité, bulletins, etc.)"
    ],
    conditions: {
      age_min: 18,
      age_max: 60,
      anciennete_min: 6,
      revenus_min: 100000,
      types_contrat: ["fonctionnaire", "cdi", "cdd"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: false,
      apport_personnel: 0
    }
  },

  // PRÊT PERSONNEL IMMOBILIER NSIA (Taux officiels par durée)
  {
    id: 304,
    banque_id: 3,
    nom: "Prêt Personnel Immobilier NSIA",
    taux: 11.0, // Taux de base (3-7 ans)
    montant_min: 5000000,
    montant_max: 150000000, // 150 millions max
    duree_min: 36, // 3 ans
    duree_max: 240, // 20 ans (240 mois)
    frais_dossier: 1.5,
    assurance: 0.4,
    description: "Financement pour acquisition, construction, rénovation ou aménagement immobilier. Durée jusqu'à 20 ans.",
    taux_par_duree: [
      { duree_min: 36, duree_max: 84, taux: 11.0, label: "3-7 ans (TBB + 0,3%)" },
      { duree_min: 96, duree_max: 144, taux: 11.5, label: "8-12 ans (TBB + 0,8%)" },
      { duree_min: 156, duree_max: 180, taux: 11.75, label: "13-15 ans (TBB + 1,05%)" },
      { duree_min: 192, duree_max: 240, taux: 12.0, label: "16-20 ans (TBB + 1,3%)" }
    ],
    avantages: [
      "Durée jusqu'à 20 ans (240 mois)",
      "Montant jusqu'à 150 millions FCFA",
      "Taux préférentiel si PEL constitué",
      "Tous projets : achat, construction, rénovation"
    ],
    apport_personnel_detail: [
      { type: "Promotions immobilières", apport: 10 },
      { type: "Montant > 150M", apport: 25, expertise_requise: true },
      { type: "Autres acquisitions", apport: 20, expertise_requise: true },
      { type: "Travaux, rénovations, locatif", apport: 30, expertise_requise: true }
    ],
    garanties: [
      "Assurance décès/Invalidité",
      "Assurance Multirisques Habitation",
      "Assurance Incendie et Autres Risques",
      "Domiciliation irrévocable des revenus",
      "Cession de loyers",
      "Hypothèque de premier rang sur titre",
      "Gage sur produits associés"
    ],
    documents_construction: [
      "Demande de crédit",
      "Reconnaissance de dette (2 exemplaires)",
      "Copie pièce d'identité valide",
      "Acte de mariage (si marié)",
      "3 derniers bulletins de salaire (+ conjoint si applicable)",
      "Relevés de compte 3 derniers mois",
      "Titre de propriété du terrain",
      "Extrait topographique",
      "Permis de construire",
      "Plan de la maison",
      "Devis estimatif des travaux",
      "Attestation de travail ou administrative",
      "Convention de crédit avec hypothèque 1er rang",
      "Facture CIE/SODECI < 3 mois",
      "Preuve apport personnel"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 24,
      revenus_min: 400000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: true,
      types_garantie_acceptes: ["hypotheque", "nantissement", "cession_loyers"],
      domiciliation_obligatoire: true,
      apport_personnel: 10, // 10% minimum (promotions)
      compte_nsia_obligatoire: true,
      taux_preferentiel_si_pel: true
    }
  },

  // AVANCE SUR ÉPARGNE NSIA
  {
    id: 308,
    banque_id: 3,
    nom: "Avance sur Épargne NSIA",
    type: "avance_epargne",
    taux: 5.0, // 5% pour Épargne, 5.25% pour Épargne Prestige
    taux_decouvert: 8.5, // TBB - 2,2% = 8,5%
    montant_min: 100000,
    montant_max: 1000000000, // Programme global 1 milliard
    montant_max_pct_epargne: 90, // 90% du montant épargné
    duree_min: 1,
    duree_max: 36, // 36 mois max (ou 12 mois découvert)
    delai_mise_en_place: "48h-5j ouvrés",
    frais_dossier: 0.1, // 0,1% min 5 000 FCFA
    frais_enregistrement: 18000, // 18 000 FCFA HT + 500/page
    frais_main_levee: 5000, // 5 000 FCFA HT
    assurance: 0,
    description: "Obtenez un crédit à court terme en mettant en gage votre épargne. Taux avantageux à partir de 4,5% HT.",
    avantages: [
      "Taux à partir de 4,5% HT",
      "Mise en place en 48h",
      "Épargne sécurisée (pas de rupture)",
      "Jusqu'à 90% de l'épargne"
    ],
    types_avance: [
      { type: "decouvert", duree: 12, taux: 8.5, description: "Découvert sur 12 mois" },
      { type: "avance_epargne", taux: 5.0, description: "Avance sur Compte Épargne" },
      { type: "avance_prestige", taux: 5.25, description: "Avance sur Épargne Prestige" },
      { type: "avance_dat", taux_add: 1, description: "Avance sur DAT (taux DAT + 1%)" }
    ],
    garantie: "Gage de l'épargne (min 110% du montant prêté)",
    comptes_eligibles: ["Épargne", "Épargne Prestige", "Dépôt à Terme (DAT)"],
    conditions: {
      age_min: 18,
      age_max: 70,
      anciennete_min: 3,
      revenus_min: 0, // Pas de revenus min, basé sur épargne
      types_contrat: ["fonctionnaire", "cdi", "cdd", "independant", "retraite"],
      garantie_requise: true,
      types_garantie_acceptes: ["nantissement"],
      domiciliation_obligatoire: false,
      apport_personnel: 0,
      compte_epargne_nsia_obligatoire: true
    }
  },

  {
    id: 305,
    banque_id: 3,
    nom: "Facilité de Caisse NSIA",
    type: "decouvert",
    taux: 13.63, // 13,63% HT par mois
    montant_min: 40000, // 20% de 200 000
    montant_max: 1000000, // Max 1 million
    duree_min: 1,
    duree_max: 1, // Mensuel
    frais_dossier: 0,
    assurance: 0,
    description: "Rallonge budgétaire pour faire face aux imprévus. Découvert disponible du 10 au 20 de chaque mois.",
    avantages: [
      "Max 1 million FCFA",
      "Sans frais de dossier",
      "Taux uniquement sur somme utilisée",
      "Disponible dès le 10 du mois"
    ],
    grille_montant: [
      { revenus_max: 200000, pct: 20 },
      { revenus_min: 200001, revenus_max: 800000, pct: 30 },
      { revenus_min: 800001, revenus_max: 2000000, pct: 32 },
      { revenus_min: 2000001, pct: 35, max: 1000000 }
    ],
    conditions: {
      age_min: 18,
      age_max: 60,
      anciennete_min: 3,
      revenus_min: 100000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: false,
      types_garantie_acceptes: [],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      compte_nsia_obligatoire: true
    }
  },

  // CRÉDIT VERT NSIA
  {
    id: 306,
    banque_id: 3,
    nom: "Crédit Vert NSIA",
    type: "credit_vert",
    taux: 7.5, // Taux bonifié par rapport au marché
    montant_min: 5000000,
    montant_max: 2000000000, // 2 milliards FCFA max par projet
    duree_min: 36, // 3 ans min (efficacité énergétique)
    duree_max: 120, // 5 ans min pour énergies renouvelables
    frais_dossier: 1,
    assurance: 0.3,
    description: "Financement de projets d'énergies renouvelables et d'efficacité énergétique. Taux bonifié par rapport au marché.",
    avantages: [
      "Montant jusqu'à 2 milliards FCFA par projet",
      "Taux bonifié par rapport au marché",
      "Durée 5 ans min (renouvelable) / 3 ans min (efficacité)",
      "Financement équipements, études, travaux"
    ],
    projets_eligibles: {
      energies_renouvelables: [
        "Biomasse énergie",
        "Petite installation hydro-électrique",
        "Solaire photovoltaïque et thermique",
        "Chauffe-eau solaire",
        "Petites fermes éoliennes",
        "Technologies hybrides"
      ],
      efficacite_energetique: [
        "Remplacement équipements forte intensité énergétique",
        "Remplacement chaudières/refroidisseurs/compresseurs",
        "Cogénération chaleur/électricité",
        "Récupération de chaleur",
        "Isolation thermique bâtiments",
        "Systèmes ventilation/climatisation haute efficacité",
        "Éclairage haut rendement"
      ]
    },
    couts_eligibles: [
      "Équipements et matériels",
      "Études d'ingénierie",
      "Travaux d'installation",
      "Frais de transaction",
      "Honoraires juridiques",
      "Assurance liée aux investissements",
      "Mesurage de performance",
      "Pièces de rechange"
    ],
    conditions: {
      age_min: 18,
      age_max: 70,
      anciennete_min: 12,
      revenus_min: 500000,
      types_contrat: ["fonctionnaire", "cdi", "independant", "entreprise"],
      garantie_requise: true,
      types_garantie_acceptes: ["hypotheque", "nantissement", "caution"],
      domiciliation_obligatoire: true,
      apport_personnel: 20,
      autorisations_administratives_requises: true,
      projet_en_cote_ivoire: true
    }
  },

  // ASSUR CRÉDIT NSIA
  {
    id: 309,
    banque_id: 3,
    nom: "Assur Crédit NSIA",
    type: "assurance",
    taux: 14.0, // 14% TTC
    montant_min: 100000, // 100 000 FCFA min
    montant_max: 50000000, // Selon quotité cessible
    duree_min: 3,
    duree_max: 10, // 10 mois max
    delai_traitement: "5 jours ouvrés",
    frais_dossier: 1,
    assurance: 0,
    description: "Prêt à court terme pour payer vos primes d'assurance : Habitation, Auto, Santé...",
    avantages: [
      "Toutes assurances couvertes",
      "Durée 3 à 10 mois",
      "Traitement en 5 jours",
      "Offre souple et adaptée"
    ],
    documents: [
      "Dernier bulletin de salaire (3 pour nouveaux clients)",
      "Demande manuscrite",
      "Photocopie pièce d'identité",
      "Attestation administrative pour prêt bancaire (fonctionnaires)",
      "Domiciliation de salaire (secteur privé)"
    ],
    conditions: {
      age_min: 18,
      age_max: 65,
      anciennete_min: 3,
      revenus_min: 80000,
      types_contrat: ["fonctionnaire", "cdi", "cdd", "independant"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: false,
      apport_personnel: 0,
      compte_nsia_obligatoire: true
    }
  },

  // RACHAT DE CRÉDIT NSIA
  {
    id: 310,
    banque_id: 3,
    nom: "Rachat de Crédit NSIA",
    type: "rachat_credit",
    taux: 8.0, // 8% HT (TBB - 2,7%) ou taux convention
    montant_min: 500000,
    montant_max: 50000000, // Selon quotité cessible
    duree_min: 12,
    duree_max: 72, // 6 ans max
    frais_dossier: 1.5, // 1,5% HT (min 5 000, max 200 000 FCFA)
    frais_dossier_min: 5000,
    frais_dossier_max: 200000,
    assurance: 0.43, // 0,43% HT du montant
    description: "Regroupez tous vos crédits en un seul. Allégez vos mensualités avec un échéancier plus souple.",
    avantages: [
      "Taux attractif 8% HT",
      "Durée jusqu'à 6 ans",
      "Une seule mensualité",
      "Remboursement anticipé sans frais",
      "Échéancier réadapté"
    ],
    documents: [
      "Bulletin de salaire (3 derniers)",
      "Demande manuscrite",
      "Photocopie pièce d'identité",
      "Attestation administrative pour prêt bancaire (fonctionnaires)",
      "Tableaux d'amortissement des crédits en cours",
      "Relevés de compte"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 12,
      revenus_min: 150000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      credits_en_cours_minimum: 2
    }
  },

  // CONSOLIDATION DE CRÉDIT NSIA
  {
    id: 311,
    banque_id: 3,
    nom: "Consolidation de Crédit NSIA",
    type: "consolidation_credit",
    taux: 9.0, // Variable selon profil
    montant_min: 500000,
    montant_max: 50000000, // Selon quotité cessible
    duree_min: 12,
    duree_max: 72, // 6 ans max
    frais_dossier: 1.5, // 1,5% HT (min 5 000, max 200 000 FCFA)
    frais_dossier_min: 5000,
    frais_dossier_max: 200000,
    assurance: 0.43, // 0,43% HT du montant
    description: "Fusionnez tous vos crédits NSIA en un seul prêt. Mensualités allégées et durée plus souple.",
    avantages: [
      "Un seul crédit global",
      "Mensualités allégées",
      "Durée jusqu'à 6 ans",
      "Une seule ligne de remboursement",
      "Remboursement anticipé sans frais"
    ],
    conditions_specifiques: [
      "Consolidation possible après 1 an de remboursement",
      "Uniquement pour crédits NSIA en cours"
    ],
    documents: [
      "Bulletin de salaire (3 derniers)",
      "Demande manuscrite",
      "Photocopie pièce d'identité",
      "Attestation administrative pour prêt bancaire (fonctionnaires)",
      "Tableaux d'amortissement des crédits NSIA en cours"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 12,
      revenus_min: 150000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      credits_nsia_en_cours_minimum: 2,
      delai_remboursement_minimum: 12 // 1 an de remboursement avant consolidation
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // ECOBANK (à compléter)
  {
    id: 401,
    banque_id: 4,
    nom: "Crédit Personnel Ecobank",
    taux: 11.5,
    montant_min: 500000,
    montant_max: 25000000,
    duree_min: 6,
    duree_max: 60,
    frais_dossier: 1,
    assurance: 0.4,
    description: "Financez vos projets avec un réseau panafricain.",
    avantages: ["Réseau 33 pays", "App mobile", "Service 24/7"],
    documents: ["À préciser"],
    conditions: {
      age_min: 21,
      age_max: 58,
      anciennete_min: 12,
      revenus_min: 200000,
      types_contrat: ["fonctionnaire", "cdi", "cdd"],
      garantie_requise: false,
      types_garantie_acceptes: ["caution_salariale", "nantissement"],
      domiciliation_obligatoire: true,
      apport_personnel: 0
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // UBA - UNITED BANK FOR AFRICA (Données officielles ubagroup.com/ci)
  // ═══════════════════════════════════════════════════════════════

  // PRÊT PERSONNEL UBA
  {
    id: 501,
    banque_id: 5,
    nom: "Prêt Personnel UBA",
    taux: 10.0,
    montant_min: 500000,
    montant_max: 30000000, // 30 000 000 FCFA
    duree_min: 12,
    duree_max: 96, // Jusqu'à 96 mois (8 ans)
    frais_dossier: 1,
    assurance: 0.4,
    description: "Financement de vos besoins personnels quotidiens. Disponible pour les salariés souhaitant transférer leur compte chez UBA.",
    avantages: [
      "Durée jusqu'à 96 mois (8 ans)",
      "Montant jusqu'à 30 millions FCFA",
      "Aucune garantie requise",
      "Maintien d'un niveau de vie normal",
      "Capacité à financer les besoins urgents"
    ],
    documents: [
      "Demande manuscrite de prêt",
      "3 derniers bulletins de salaire",
      "Copie de la pièce d'identité",
      "Attestation de travail",
      "Dernière facture CIE ou SODECI (au nom du titulaire)",
      "OU Facture CIE/SODECI + Certificat de résidence",
      "Certificat de prise de tension artérielle"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 12,
      revenus_min: 150000,
      types_contrat: ["cdi"],
      garantie_requise: false,
      types_garantie_acceptes: [],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      transfert_compte_requis: true
    }
  },

  // PRÊT FONCTIONNAIRE UBA
  {
    id: 502,
    banque_id: 5,
    nom: "Prêt Fonctionnaire UBA",
    taux: 9.5,
    montant_min: 500000,
    montant_max: 27500000, // 27 500 000 FCFA
    duree_min: 12,
    duree_max: 96, // Jusqu'à 96 mois (8 ans)
    frais_dossier: 1,
    assurance: 0.4,
    description: "Prêt spécialement conçu pour soutenir les besoins personnels des fonctionnaires. Accessible pour rachat de prêt ou nouveau financement.",
    avantages: [
      "Durée jusqu'à 96 mois (8 ans)",
      "Montant jusqu'à 27,5 millions FCFA",
      "Taux d'intérêt concurrentiel",
      "Aucune garantie requise",
      "Conditions de paiement pratiques"
    ],
    documents: [
      "Demande manuscrite de prêt",
      "3 derniers bulletins de salaire",
      "Copie de la pièce d'identité",
      "Attestation de travail",
      "Dernière facture CIE ou SODECI (au nom du titulaire)",
      "OU Facture CIE/SODECI + Certificat de résidence",
      "Certificat de prise de tension artérielle"
    ],
    documents_sans_rachat: [
      "Domiciliation de salaire (en plus des documents ci-dessus)"
    ],
    documents_rachat: [
      "Demande manuscrite de rachat de prêt",
      "Attestation de redevance banque",
      "Attestation de redevance employeur (si prêt employeur en cours)",
      "Attestation de salaire",
      "Tableau d'amortissement des prêts en cours",
      "Extrait de compte des 6 derniers mois"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 12,
      revenus_min: 150000,
      types_contrat: ["fonctionnaire"],
      garantie_requise: false,
      types_garantie_acceptes: [],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      rachat_possible: true
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // BSIC - BANQUE SAHÉLO-SAHARIENNE (Données officielles bsic.ci)
  // ═══════════════════════════════════════════════════════════════

  // PRÊT À LA CONSOMMATION BSIC
  {
    id: 701,
    banque_id: 6,
    nom: "Prêt à la Consommation BSIC",
    taux: 8.0, // 8% HT fonctionnaires, 9-10% HT privé
    taux_fonctionnaire: 8.0,
    taux_prive_min: 9.0,
    taux_prive_max: 10.0,
    montant_min: 100000,
    montant_max: 50000000,
    duree_min: 12,
    duree_max: 120, // 120 mois max (fonctionnaires uniquement)
    frais_dossier: 1.5,
    assurance: 0.43,
    description: "Prêt pour achat de biens de consommation : voiture, voyage, équipement, etc. Jusqu'à 120 mois pour fonctionnaires.",
    avantages: [
      "Taux 8% HT pour fonctionnaires",
      "Durée jusqu'à 120 mois (10 ans)",
      "Produits associés : PEC, Venus Retraite",
      "Taux d'épargne 3,50% HT/an"
    ],
    produits_obligatoires: ["PEC", "Venus Retraite", "Capital Gagnant"],
    epargne: {
      cotisation_min: 10000,
      plafond: 10000000,
      duree: 60,
      taux_interet: 3.5
    },
    taux_charge_par_revenu: [
      { revenu_min: 80000, revenu_max: 200000, taux_max: 35 },
      { revenu_min: 200001, revenu_max: 400000, taux_max: 38 },
      { revenu_min: 400001, revenu_max: 600000, taux_max: 42 },
      { revenu_min: 600001, revenu_max: 800000, taux_max: 45 },
      { revenu_min: 800001, revenu_max: 1000000, taux_max: 48 },
      { revenu_min: 1000001, revenu_max: 1500000, taux_max: 52 },
      { revenu_min: 1500001, revenu_max: 2000000, taux_max: 55 },
      { revenu_min: 2000001, taux_max: 57 }
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 6,
      revenus_min: 100000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      compte_cheque_obligatoire: true
    }
  },

  // PRÊT PERSONNEL IMMOBILIER BSIC
  {
    id: 702,
    banque_id: 6,
    nom: "Prêt Personnel Immobilier BSIC",
    taux: 9.5, // Variable selon profil
    montant_min: 5000000,
    montant_max: 100000000, // 100M grand public, plus pour haut de gamme
    montant_max_haut_gamme: 200000000,
    duree_min: 60,
    duree_max: 300, // 25 ans max
    frais_dossier: 1.5, // 1,5% HT, plafond 200 000 FCFA
    frais_dossier_max: 200000,
    assurance: 0.43, // Variable selon montant
    penalite_remboursement_anticipe: 0,
    description: "Prêt à long terme pour acquisition, aménagement ou construction de maison. Durée jusqu'à 25 ans.",
    avantages: [
      "Durée jusqu'à 25 ans",
      "Montant jusqu'à 100M (grand public)",
      "Remboursement anticipé sans pénalité",
      "Taux préférentiel si PEL constitué"
    ],
    apport_personnel_detail: [
      { type: "Promotions immobilières", apport: 10 },
      { type: "Montant > 150M", apport: 25, expertise_requise: true },
      { type: "Autres cas", apport: 20, expertise_requise: true },
      { type: "Travaux, rénovations, locatif", apport: 30, expertise_requise: true }
    ],
    assurance_detail: [
      { montant_min: 500001, montant_max: 15000000, taux: 0.43, mode: "unique", formalite: false },
      { montant_min: 15000001, montant_max: 30000000, taux: 0.60, mode: "mensuel", formalite: false },
      { montant_min: 30000001, taux: 0.60, mode: "mensuel", formalite: true }
    ],
    garanties: [
      "Assurance décès/Invalidité",
      "Assurance Multirisques Habitation",
      "Assurance Incendie et Autres Risques",
      "Domiciliation irrévocable des revenus",
      "Cession de loyers",
      "Hypothèque de premier rang",
      "Gage sur produits associés"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 6, // 6 mois CDI pour privé
      revenus_min: 300000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: true,
      types_garantie_acceptes: ["hypotheque", "nantissement", "cession_loyers"],
      domiciliation_obligatoire: true,
      apport_personnel: 10,
      bien_libre_hypotheque: true,
      echeance_avant_retraite: true,
      taux_preferentiel_si_pel: true
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // BICICI - BANQUE INTERNATIONALE POUR LE COMMERCE (Données officielles bicici.com)
  // ═══════════════════════════════════════════════════════════════

  // CRÉDIT CONSO BICICI
  {
    id: 801,
    banque_id: 7,
    nom: "Crédit Conso BICICI",
    taux: 7.75, // À partir de 7,75% HT (promo 7,25%)
    taux_min: 7.25,
    taux_max: 9.75,
    montant_min: 1000000, // 1 000 000 FCFA minimum
    montant_max: 50000000,
    duree_min: 12,
    duree_max: 60, // 5 ans maximum
    frais_dossier: 2, // 2%
    assurance: 0.43,
    description: "Crédit à taux préférentiel pour tous vos besoins : voyage, projet, événement, électroménager.",
    avantages: [
      "Taux à partir de 7,25% HT (promo)",
      "Durée jusqu'à 5 ans",
      "Financement tous besoins",
      "Montant minimum 1 million FCFA"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 6,
      revenus_min: 150000,
      types_contrat: ["fonctionnaire", "cdi", "cdd"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0
    }
  },

  // CRÉDIT SCOLAIRE BICICI
  {
    id: 802,
    banque_id: 7,
    nom: "Crédit Scolaire BICICI",
    taux: 7.75, // À partir de 7,75% HT (promo 7,25%)
    taux_min: 7.25,
    taux_max: 9.75,
    montant_min: 1000000, // 1 000 000 FCFA minimum
    montant_max: 20000000,
    duree_min: 12,
    duree_max: 60, // 5 ans maximum
    frais_dossier: 2, // 2%
    assurance: 0.43,
    description: "Crédit pour préparer la rentrée scolaire et assurer une année sereine aux enfants.",
    avantages: [
      "Taux à partir de 7,25% HT (promo)",
      "Durée jusqu'à 5 ans",
      "Financement rentrée scolaire",
      "Montant minimum 1 million FCFA"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 6,
      revenus_min: 150000,
      types_contrat: ["fonctionnaire", "cdi", "cdd"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0
    }
  },

  // CRÉDIT BAIL AUTO BICICI
  {
    id: 803,
    banque_id: 7,
    nom: "Crédit Bail Auto BICICI",
    type: "credit_bail",
    taux: 7.75, // À partir de 7,75% HT
    montant_min: 3000000,
    montant_max: 50000000,
    duree_min: 12,
    duree_max: 60, // 60 mois maximum
    frais_dossier: 2,
    assurance: 0.5,
    description: "Crédit automobile à taux préférentiel. Financement véhicule neuf ou occasion récente.",
    avantages: [
      "Taux à partir de 7,75% HT",
      "Durée jusqu'à 60 mois",
      "Financement véhicule",
      "Conditions avantageuses"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 12,
      revenus_min: 250000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: true,
      types_garantie_acceptes: ["gage_vehicule"],
      domiciliation_obligatoire: true,
      apport_personnel: 10
    }
  },

  // CRÉDIT ÉQUIPEMENT BICICI (Professionnels)
  {
    id: 804,
    banque_id: 7,
    nom: "Crédit Équipement BICICI",
    type: "professionnel",
    taux: 8.0, // À partir de 8% HT minimum
    montant_min: 1000000, // 1 000 000 FCFA minimum
    montant_max: 100000000,
    duree_min: 12,
    duree_max: 60, // 1 à 5 ans
    frais_dossier: 1.25, // 1,25%
    assurance: 0.43,
    description: "Financement équipements professionnels : machines, informatique, véhicules. 100% de l'investissement.",
    avantages: [
      "Taux à partir de 8% HT",
      "Financement 100% de l'investissement",
      "Durée 1 à 5 ans",
      "Accompagnement expert"
    ],
    conditions: {
      age_min: 21,
      age_max: 65,
      anciennete_min: 12,
      revenus_min: 300000,
      types_contrat: ["independant", "entreprise"],
      garantie_requise: true,
      types_garantie_acceptes: ["nantissement", "gage_vehicule"],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      client_professionnel: true
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // SIB - SOCIÉTÉ IVOIRIENNE DE BANQUE (Données officielles sib.ci)
  // ═══════════════════════════════════════════════════════════════

  // CRÉDIT PROPRIO SIB (Immobilier)
  {
    id: 901,
    banque_id: 8,
    nom: "Crédit Proprio SIB",
    taux: 8.5, // Variable selon formule
    montant_min: 5000000,
    montant_max: 150000000, // Selon quotité cessible
    duree_min: 60,
    duree_max: 300, // 25 ans fonctionnaires, 20 ans privé
    duree_max_prive: 240,
    duree_max_fonctionnaire: 300,
    frais_dossier: 1.5,
    assurance: 0.43,
    description: "Prêt immobilier pour acquisition, aménagement ou construction. Formules CDMH, PEL, Réescomptable.",
    avantages: [
      "Durée jusqu'à 25 ans (fonctionnaires)",
      "Durée jusqu'à 20 ans (privé)",
      "Formule CDMH taux bonifié (min 11 ans)",
      "Conditions avantageuses avec PEL"
    ],
    formules: [
      { type: "CDMH", description: "Taux bonifié, durée min 11 ans" },
      { type: "PEL", description: "Conditions avantageuses selon effort d'épargne" },
      { type: "Réescomptable", description: "Prêt classique réescomptable" }
    ],
    apport_personnel_detail: [
      { type: "Promotion immobilière", apport: 0, note: "Couverture 100% du bien" },
      { type: "Rachat de bien", apport: 0, note: "Couverture 100% du bien" },
      { type: "Construction individuelle", apport: 20 }
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 6,
      revenus_min: 250000, // Salaire minimum 250 000 FCFA/mois
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: true,
      types_garantie_acceptes: ["hypotheque", "nantissement"],
      domiciliation_obligatoire: true,
      apport_personnel: 0, // 0% si promotion, 20% si construction
      compte_depot_sib_obligatoire: true
    }
  },

  // SIB OXYGÈNE (Découvert)
  {
    id: 902,
    banque_id: 8,
    nom: "SIB Oxygène",
    type: "decouvert",
    taux: 12.0, // Variable
    montant_min: 36000, // 30% de 120 000 min
    montant_max: 2000000, // Max 2 millions FCFA
    montant_pct_salaire_min: 30,
    montant_pct_salaire_max: 60,
    duree_min: 1,
    duree_max: 12, // Renouvelé annuellement
    frais_dossier: 0, // Sans frais de dossier
    assurance: 0, // Incluse dans cotisation annuelle
    description: "Découvert conventionnel de 30 à 60% du salaire. Disponible dès le 6 du mois. Assurance décès incluse.",
    avantages: [
      "30 à 60% du salaire (max 2M FCFA)",
      "Sans frais de dossier",
      "Disponible dès le 6 du mois",
      "Assurance décès/invalidité incluse",
      "Renouvelé par tacite reconduction"
    ],
    assurance_incluse: {
      capital_max: 2000000,
      couverture: ["décès", "invalidité_absolue_definitive"],
      apurement_debit: true
    },
    conditions: {
      age_min: 21,
      age_max: 59, // 1 an avant retraite
      anciennete_min: 1, // 1er virement de salaire
      revenus_min: 120000, // Revenu minimum 120 000 FCFA
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: false,
      types_garantie_acceptes: [],
      domiciliation_obligatoire: true,
      apport_personnel: 0,
      compte_depot_sib_obligatoire: true,
      non_client_douteux: true
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // AUTRE BANQUE - PRÊTS GÉNÉRIQUES POUR SIMULATION
  // ═══════════════════════════════════════════════════════════════

  // PRÊT À LA CONSOMMATION GÉNÉRIQUE
  {
    id: 9901,
    banque_id: 99,
    nom: "Prêt Consommation (Générique)",
    taux: 10.0, // Taux moyen marché
    taux_min: 7.0,
    taux_max: 14.0,
    taux_personnalisable: true,
    montant_min: 100000,
    montant_max: 50000000,
    duree_min: 6,
    duree_max: 84, // 7 ans max
    frais_dossier: 1.5,
    assurance: 0.43,
    description: "Simulation générique de prêt à la consommation. Taux et conditions personnalisables.",
    avantages: [
      "Simulation personnalisable",
      "Taux ajustable (7-14%)",
      "Durée jusqu'à 7 ans",
      "Pour toute banque non listée"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 6,
      revenus_min: 100000,
      types_contrat: ["fonctionnaire", "cdi", "cdd"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0
    }
  },

  // PRÊT IMMOBILIER GÉNÉRIQUE
  {
    id: 9902,
    banque_id: 99,
    nom: "Prêt Immobilier (Générique)",
    taux: 9.0, // Taux moyen marché
    taux_min: 6.0,
    taux_max: 12.0,
    taux_personnalisable: true,
    montant_min: 5000000,
    montant_max: 150000000,
    duree_min: 60,
    duree_max: 300, // 25 ans max
    frais_dossier: 1.5,
    assurance: 0.43,
    description: "Simulation générique de prêt immobilier. Taux et conditions personnalisables.",
    avantages: [
      "Simulation personnalisable",
      "Taux ajustable (6-12%)",
      "Durée jusqu'à 25 ans",
      "Pour toute banque non listée"
    ],
    apport_personnel_detail: [
      { type: "Promotion immobilière", apport: 10 },
      { type: "Acquisition standard", apport: 20 },
      { type: "Construction/Travaux", apport: 30 }
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 12,
      revenus_min: 250000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: true,
      types_garantie_acceptes: ["hypotheque", "nantissement"],
      domiciliation_obligatoire: true,
      apport_personnel: 10
    }
  },

  // DÉCOUVERT/FACILITÉ DE CAISSE GÉNÉRIQUE
  {
    id: 9903,
    banque_id: 99,
    nom: "Découvert (Générique)",
    type: "decouvert",
    taux: 12.0, // Taux moyen marché
    taux_min: 10.0,
    taux_max: 15.0,
    taux_personnalisable: true,
    montant_min: 50000,
    montant_max: 2000000,
    montant_pct_salaire_min: 20,
    montant_pct_salaire_max: 50,
    duree_min: 1,
    duree_max: 12,
    frais_dossier: 0,
    assurance: 0,
    description: "Simulation générique de découvert/facilité de caisse. Paramètres personnalisables.",
    avantages: [
      "Simulation personnalisable",
      "20 à 50% du salaire",
      "Taux ajustable",
      "Pour toute banque non listée"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 3,
      revenus_min: 100000,
      types_contrat: ["fonctionnaire", "cdi"],
      garantie_requise: false,
      types_garantie_acceptes: [],
      domiciliation_obligatoire: true,
      apport_personnel: 0
    }
  },

  // PRÊT SCOLAIRE GÉNÉRIQUE
  {
    id: 9904,
    banque_id: 99,
    nom: "Prêt Scolaire (Générique)",
    taux: 9.0,
    taux_min: 7.0,
    taux_max: 12.0,
    taux_personnalisable: true,
    montant_min: 100000,
    montant_max: 5000000,
    duree_min: 6,
    duree_max: 24,
    frais_dossier: 1.0,
    assurance: 0.3,
    description: "Prêt pour financer les frais de scolarité, fournitures scolaires et autres dépenses liées à l'éducation.",
    avantages: [
      "Financement de la rentrée scolaire",
      "Frais de scolarité et inscription",
      "Fournitures et équipements",
      "Durée adaptée à l'année scolaire",
      "Taux personnalisable selon votre banque"
    ],
    documents: [
      "Demande de prêt",
      "Pièce d'identité",
      "Bulletins de salaire",
      "Justificatif des frais de scolarité",
      "Attestation de travail"
    ],
    conditions: {
      age_min: 21,
      age_max: 60,
      anciennete_min: 6,
      revenus_min: 100000,
      types_contrat: ["fonctionnaire", "cdi", "cdd"],
      garantie_requise: false,
      types_garantie_acceptes: ["domiciliation"],
      domiciliation_obligatoire: true,
      apport_personnel: 0
    }
  }
];

// Labels pour affichage
export const LABELS = {
  garanties: {
    aucune: "Aucune garantie",
    domiciliation: "Domiciliation de salaire",
    caution_salariale: "Caution salariale (garant)",
    hypotheque: "Hypothèque",
    nantissement: "Nantissement (épargne, assurance-vie)",
    gage_vehicule: "Gage sur véhicule"
  },
  contrats: {
    fonctionnaire: "Fonctionnaire",
    cdi: "CDI",
    cdd: "CDD",
    independant: "Indépendant",
    retraite: "Retraité"
  }
};

export const api = {
  getBanques: () => Promise.resolve(BANQUES),
  getPretsByBanque: (banqueId) => Promise.resolve(TYPES_PRETS.filter(p => p.banque_id === banqueId)),
  getAllPrets: () => Promise.resolve(TYPES_PRETS)
};
