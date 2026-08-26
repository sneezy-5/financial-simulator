// ═══════════════════════════════════════════════════════
// RÉFÉRENTIEL DE PAIE — CÔTE D'IVOIRE
//
// Chaque entrée relie UNE variable canonique aux LIBELLÉS sous lesquels elle
// apparaît réellement sur un bulletin. Les libellés sont comparés après
// normalisation (sans accent, sans ponctuation, sans casse, sans numérotation),
// il est donc inutile de démultiplier les variantes typographiques.
//
// `sides` sert aux rubriques qui portent une part salariale ET une part
// patronale sur la même ligne : la colonne du tableau décide laquelle est
// désignée. Sans cela, la charge de l'employeur se retrouvait nommée comme une
// retenue du salarié.
//
// Ce fichier est le point d'entrée pour enrichir la couverture : ajouter une
// rubrique, c'est ajouter une ligne ici, rien d'autre.
// ═══════════════════════════════════════════════════════

const K = { TEXT: 'text', AMOUNT: 'amount', DATE: 'date', RATE: 'rate', CODE: 'code' };

// ── 1. Identité ──────────────────────────────────────────────────────────────
const IDENTITE = [
    { variable: 'devise', kind: K.TEXT, labels: ['devise', 'monnaie'] },
    { variable: 'periode_paie_debut', kind: K.DATE, labels: ['periode du', 'debut de periode', 'du'] },
    { variable: 'periode_paie_fin', kind: K.DATE, labels: ['periode au', 'fin de periode', 'au'] },
    { variable: 'mois_paie', kind: K.TEXT, labels: ['periode', 'periode de paie', 'mois', 'mois de paie', 'mois de'] },
    { variable: 'date_paiement', kind: K.DATE, labels: ['date de paiement', 'date de reglement', 'paye le'] },
    { variable: 'numero_bulletin', kind: K.CODE, labels: ['n bulletin', 'numero de bulletin', 'bulletin n'] },

    { variable: 'employeur_nom', kind: K.TEXT, labels: ['employeur', 'nom employeur'] },
    { variable: 'employeur_raison_sociale', kind: K.TEXT, labels: ['raison sociale', 'denomination sociale', 'societe', 'entreprise'] },
    { variable: 'employeur_adresse', kind: K.TEXT, labels: ['adresse employeur', 'siege social', 'siege', 'adresse'] },
    { variable: 'employeur_numero_contribuable', kind: K.CODE, labels: ['n contribuable', 'numero contribuable', 'compte contribuable', 'n cc', 'ncc'] },
    { variable: 'employeur_numero_cnps', kind: K.CODE, labels: ['n employeur', 'n cnps employeur', 'numero employeur', 'compte employeur'] },
    { variable: 'employeur_numero_cnam', kind: K.CODE, labels: ['n cnam employeur', 'numero cnam employeur'] },
    { variable: 'employeur_secteur_activite', kind: K.TEXT, labels: ['secteur d activite', 'branche d activite', 'activite'] },

    { variable: 'salarie_nom', kind: K.TEXT, labels: ['nom', 'nom du salarie', 'nom de l employe'] },
    { variable: 'salarie_prenoms', kind: K.TEXT, labels: ['prenoms', 'prenom', 'prenom s'] },
    { variable: 'salarie_adresse', kind: K.TEXT, labels: ['adresse du salarie', 'domicile', 'residence'] },
    { variable: 'salarie_matricule', kind: K.CODE, labels: ['matricule', 'n matricule', 'numero matricule', 'mle', 'matricule interne'] },
    { variable: 'salarie_numero_cnps', kind: K.CODE, labels: ['n cnps', 'numero cnps', 'cnps salarie', 'n cnss', 'n securite sociale'] },
    { variable: 'salarie_numero_cnam', kind: K.CODE, labels: ['n cnam', 'numero cnam', 'cmu n'] },
    { variable: 'salarie_date_embauche', kind: K.DATE, labels: ['date d embauche', 'date embauche', 'date d entree', 'embauche le', 'entree'] },
    { variable: 'salarie_type_contrat', kind: K.TEXT, labels: ['type contrat', 'type de contrat', 'nature du contrat', 'contrat'] },
    { variable: 'salarie_emploi', kind: K.TEXT, labels: ['emploi', 'poste', 'fonction', 'poste occupe'] },
    { variable: 'salarie_categorie', kind: K.CODE, labels: ['categorie', 'cat', 'categorie professionnelle'] },
    { variable: 'salarie_echelon', kind: K.CODE, labels: ['echelon', 'indice', 'classement'] },
    { variable: 'salarie_service', kind: K.TEXT, labels: ['service', 'departement', 'direction', 'affectation'] },
    { variable: 'salarie_qualification', kind: K.TEXT, labels: ['qualification', 'niveau', 'classification professionnelle'] },
    { variable: 'anciennete_mois', kind: K.TEXT, labels: ['anciennete', 'anciennete en mois'] },
    { variable: 'nombre_enfants_charge', kind: K.AMOUNT, labels: ['nombre d enfants', 'enfants a charge', 'enfants'] },
    { variable: 'nombre_parts_fiscales', kind: K.AMOUNT, labels: ['parts igr', 'nombre de parts', 'parts fiscales', 'parts'] }
];

// ── 2. Temps de travail ──────────────────────────────────────────────────────
const TEMPS = [
    { variable: 'jours_ouvres', kind: K.AMOUNT, labels: ['jours ouvres', 'jours ouvrables'] },
    { variable: 'jours_travailles', kind: K.AMOUNT, labels: ['jours travailles', 'nombre de jours', 'jours payes', 'nb jours'] },
    { variable: 'jours_absence', kind: K.AMOUNT, labels: ['jours d absence', 'absences', 'jours absence'] },
    { variable: 'jours_conges_payes', kind: K.AMOUNT, labels: ['jours de conges', 'conges payes jours', 'jours cp'] },
    { variable: 'jours_maladie', kind: K.AMOUNT, labels: ['jours de maladie', 'arret maladie'] },
    { variable: 'jours_absence_non_payee', kind: K.AMOUNT, labels: ['absence non payee', 'jours non payes'] },

    { variable: 'heures_normales', kind: K.AMOUNT, labels: ['heures normales', 'heures travaillees', 'h normales'] },
    { variable: 'heures_supplementaires_15', kind: K.AMOUNT, labels: ['heures supplementaires 15', 'hs 15', 'h sup 15'] },
    { variable: 'heures_supplementaires_25', kind: K.AMOUNT, labels: ['heures supplementaires 25', 'hs 25', 'h sup 25'] },
    { variable: 'heures_supplementaires_50', kind: K.AMOUNT, labels: ['heures supplementaires 50', 'hs 50', 'h sup 50'] },
    { variable: 'heures_supplementaires_75', kind: K.AMOUNT, labels: ['heures supplementaires 75', 'hs 75', 'h sup 75'] },
    { variable: 'heures_supplementaires_100', kind: K.AMOUNT, labels: ['heures supplementaires 100', 'hs 100', 'h sup 100'] },
    { variable: 'heures_supplementaires', kind: K.AMOUNT, labels: ['heures supplementaires', 'heures sup', 'h sup', 'majoration heures'] },

    { variable: 'taux_horaire', kind: K.AMOUNT, labels: ['taux horaire', 'salaire horaire'] },
    { variable: 'taux_journalier', kind: K.AMOUNT, labels: ['taux journalier', 'salaire journalier'] }
];

// ── 3. Salaire principal ─────────────────────────────────────────────────────
const SALAIRE = [
    { variable: 'salaire_base_mensuel', kind: K.AMOUNT, labels: ['salaire categoriel', 'salaire de base', 'salaire base', 'salaire de categorie', 'salaire mensuel', 'salaire de base mensuel'] },
    { variable: 'salaire_base_horaire', kind: K.AMOUNT, labels: ['salaire de base horaire', 'base horaire'] },
    { variable: 'salaire_journalier', kind: K.AMOUNT, labels: ['salaire journalier'] },
    { variable: 'sursalaire', kind: K.AMOUNT, labels: ['sursalaire', 'sur salaire', 'complement de salaire'] },
    { variable: 'rappel_salaire', kind: K.AMOUNT, labels: ['rappel de salaire', 'rappel salaire'] },
    { variable: 'rappel_sursalaire', kind: K.AMOUNT, labels: ['rappel de sursalaire', 'rappel sursalaire'] },
    { variable: 'conges_payes', kind: K.AMOUNT, labels: ['conges payes', 'allocation conges', 'allocation de conges', 'indemnite de conges payes'] },
    { variable: 'rappel_conges_payes', kind: K.AMOUNT, labels: ['rappel conges payes', 'rappel de conges'] },
    { variable: 'indemnite_fin_cdd', kind: K.AMOUNT, labels: ['indemnite de fin de contrat', 'indemnite fin cdd', 'prime de precarite'] }
];

// ── 4. Primes ────────────────────────────────────────────────────────────────
// `exonere` marque les rubriques que la source de référence donne comme non
// soumises socialement et fiscalement. C'est une valeur PAR DÉFAUT : le régime
// réel dépend de la convention et des plafonds en vigueur (voir PARAMS_CI).
const PRIMES = [
    { variable: 'prime_anciennete', labels: ['prime d anciennete', 'prime anciennete', 'anciennete'] },
    { variable: 'prime_assiduite', labels: ['prime d assiduite', 'prime assiduite'] },
    { variable: 'prime_astreinte', labels: ['prime d astreinte', 'prime astreinte'] },
    { variable: 'prime_brevet', labels: ['prime de brevet', 'prime brevet'] },
    { variable: 'prime_caisse', labels: ['prime de caisse', 'prime caisse'] },
    { variable: 'prime_chantier', labels: ['prime de chantier', 'prime chantier'] },
    { variable: 'prime_exceptionnelle', labels: ['prime exceptionnelle'] },
    { variable: 'prime_gardiennage', labels: ['prime de gardiennage', 'prime gardiennage'] },
    { variable: 'prime_informatique', labels: ['prime informatique'] },
    { variable: 'prime_interessement', labels: ['prime d interessement', 'interessement'] },
    { variable: 'prime_mer', labels: ['prime de mer', 'prime mer'] },
    { variable: 'prime_nuit', labels: ['prime de nuit', 'prime nuit', 'majoration de nuit'] },
    { variable: 'prime_panier', labels: ['prime de panier', 'prime panier', 'panier'], exonere: true },
    { variable: 'prime_pilotage_jour', labels: ['prime de pilotage jour', 'pilotage jour'] },
    { variable: 'prime_pilotage_nuit', labels: ['prime de pilotage nuit', 'pilotage nuit'] },
    { variable: 'prime_productivite', labels: ['prime de productivite', 'productivite'] },
    { variable: 'prime_quart', labels: ['prime de quart', 'prime quart'] },
    { variable: 'prime_recouvrement', labels: ['prime de recouvrement'] },
    { variable: 'prime_rendement', labels: ['prime de rendement', 'rendement'] },
    { variable: 'prime_responsabilite', labels: ['prime de responsabilite', 'prime responsabilite'] },
    { variable: 'prime_risque', labels: ['prime de risque', 'prime risque'] },
    { variable: 'prime_salissure', labels: ['prime de salissure', 'salissure'], exonere: true },
    { variable: 'prime_statistique', labels: ['prime statistique'] },
    { variable: 'prime_sujetion', labels: ['prime de sujetion', 'indemnite de sujetion', 'sujetion'] },
    { variable: 'prime_transport', labels: ['prime de transport', 'prime de transport exo', 'transport'] },
    { variable: 'prime_treizieme_mois', labels: ['prime de 13e mois', 'treizieme mois', '13e mois', 'gratification'] },
    { variable: 'prime_vacances', labels: ['prime de vacances', 'prime vacances'] },
    { variable: 'prime_objectif', labels: ['prime d objectif', 'prime objectifs', 'bonus objectifs'] },
    { variable: 'prime_qualite', labels: ['prime de qualite'] },
    { variable: 'prime_langue', labels: ['prime de langue'] },
    { variable: 'prime_fin_annee', labels: ['prime de fin d annee', 'prime fin annee'] },
    { variable: 'rappel_prime', labels: ['rappel de prime', 'rappel prime'] }
].map(p => ({ ...p, kind: K.AMOUNT }));

// ── 5. Indemnités et avantages en nature ─────────────────────────────────────
const INDEMNITES = [
    { variable: 'indemnite_transport_imposable', labels: ['indemnite de transport imposable'] },
    { variable: 'indemnite_transport_non_imposable', labels: ['indemnite de transport', 'indemnite de transport non imposable'] },
    { variable: 'indemnite_logement', labels: ['indemnite de logement', 'prime de logement', 'logement'] },
    { variable: 'indemnite_logement_supplementaire', labels: ['indemnite de logement supplementaire'] },
    { variable: 'indemnite_fonction', labels: ['indemnite de fonction', 'prime de fonction'] },
    { variable: 'indemnite_representation', labels: ['indemnite de representation'] },
    { variable: 'indemnite_responsabilite', labels: ['indemnite de responsabilite'] },
    { variable: 'indemnite_deplacement', labels: ['indemnite de deplacement', 'frais de deplacement'] },
    { variable: 'indemnite_expatriation', labels: ['indemnite d expatriation', 'prime d expatriation'] },
    { variable: 'indemnite_tenue', labels: ['indemnite de tenue', 'prime de tenue'] },
    { variable: 'indemnite_telephone', labels: ['indemnite telephone', 'forfait telephone'] },
    { variable: 'indemnite_domesticite', labels: ['indemnite de domesticite'] },
    { variable: 'indemnite_forfaitaire', labels: ['indemnite forfaitaire'] },
    { variable: 'indemnite_mission', labels: ['indemnite de mission', 'frais de mission'] },
    { variable: 'indemnite_deces', labels: ['indemnite de deces', 'frais funeraires'] },
    { variable: 'indemnite_depart', labels: ['indemnite de depart', 'indemnite de licenciement'] },
    { variable: 'indemnite_depart_negocie', labels: ['indemnite de depart negocie', 'indemnite transactionnelle'] },
    { variable: 'allocation_familiale', labels: ['allocation familiale', 'allocations familiales'] },
    { variable: 'allocation_familiale_complementaire', labels: ['allocation familiale complementaire'] },

    { variable: 'avantage_nature_logement', labels: ['avantage en nature logement', 'an logement'] },
    { variable: 'avantage_nature_nourriture', labels: ['avantage en nature nourriture', 'an nourriture'] },
    { variable: 'avantage_nature_vehicule', labels: ['avantage en nature vehicule', 'an vehicule'] },
    { variable: 'avantage_nature_electricite', labels: ['avantage en nature electricite', 'an electricite'] },
    { variable: 'avantage_nature_telephone', labels: ['avantage en nature telephone', 'an telephone'] },
    { variable: 'avantage_nature_autre', labels: ['avantage en nature', 'avantages en nature'] }
].map(i => ({ ...i, kind: K.AMOUNT }));

// ── 6. Retenues salariales ───────────────────────────────────────────────────
// Les rubriques qui portent aussi une part patronale déclarent `sides` : la
// colonne du tableau décide alors du côté désigné.
const RETENUES = [
    {
        variable: 'cnps_salariale', kind: K.AMOUNT,
        labels: ['cnps retraite', 'cnps', 'cnps part salariale', 'cnss part salariale',
                 'cnps salarie', 'retraite', 'cnss', 'cnss retraite', 'cotisation retraite'],
        sides: { salarial: 'cnps_salariale', patronal: 'cnps_retraite_patronale' }
    },
    {
        variable: 'cmu_salariale', kind: K.AMOUNT,
        labels: ['cmu', 'cmu assurance maladie', 'assurance maladie', 'cnam'],
        sides: { salarial: 'cmu_salariale', patronal: 'cmu_patronale' }
    },
    { variable: 'its_net', kind: K.AMOUNT, labels: ['its', 'its impot unique', 'impot unique', 'impot sur salaire', 'impot sur traitements et salaires'] },
    { variable: 'its_base_imposable', kind: K.AMOUNT, labels: ['base imposable its', 'assiette its'] },
    { variable: 'its_brut', kind: K.AMOUNT, labels: ['its brut', 'impot brut'] },
    { variable: 'reduction_charges_famille', kind: K.AMOUNT, labels: ['reduction pour charges de famille', 'abattement charges de famille', 'dont r i c f', 'ricf', 'r i c f'] },

    { variable: 'mutuelle_salarie', kind: K.AMOUNT, labels: ['mutuelle', 'mutuelle salarie'] },
    { variable: 'assurance_sante_salarie', kind: K.AMOUNT, labels: ['assurance sante', 'assurance maladie complementaire'] },
    { variable: 'retraite_complementaire_salarie', kind: K.AMOUNT, labels: ['retraite complementaire'] },
    { variable: 'cotisation_syndicale', kind: K.AMOUNT, labels: ['cotisation syndicale', 'syndicat'] },
    { variable: 'avance_salaire', kind: K.AMOUNT, labels: ['avance sur salaire', 'avance', 'acompte'] },
    { variable: 'remboursement_pret', kind: K.AMOUNT, labels: ['remboursement de pret', 'pret', 'echeance pret'] },
    { variable: 'saisie_arret', kind: K.AMOUNT, labels: ['saisie arret', 'saisie sur salaire'] },
    { variable: 'opposition', kind: K.AMOUNT, labels: ['opposition'] },
    { variable: 'absence_non_payee_retenue', kind: K.AMOUNT, labels: ['retenue pour absence', 'retenue absence'] },
    { variable: 'retenue_cantine', kind: K.AMOUNT, labels: ['retenue cantine', 'cantine'] },
    { variable: 'retenue_transport', kind: K.AMOUNT, labels: ['retenue transport'] },
    { variable: 'retenue_equipement', kind: K.AMOUNT, labels: ['retenue equipement', 'equipement'] },
    { variable: 'retenue_autre', kind: K.AMOUNT, labels: ['autres retenues', 'autre retenue'] }
];

// ── 7. Charges patronales ────────────────────────────────────────────────────
const PATRONAL = [
    { variable: 'cnps_prestations_familiales_patronale', kind: K.AMOUNT, labels: ['cnps prestations familiales', 'prestations familiales', 'pf'] },
    { variable: 'cnps_accident_travail_patronale', kind: K.AMOUNT, labels: ['cnps accident du travail', 'accident du travail', 'accidents de travail', 'risque professionnel'] },
    { variable: 'cnps_maternite_patronale', kind: K.AMOUNT, labels: ['cnps assurance maternite', 'assurance maternite', 'maternite'] },
    { variable: 'formation_professionnelle_patronale', kind: K.AMOUNT, labels: ['fdfp formation continue', 'formation continue', 'formation professionnelle'] },
    { variable: 'taxe_apprentissage_patronale', kind: K.AMOUNT, labels: ['fdfp taxe apprentissage', 'taxe apprentissage', 'taxe d apprentissage'] },
    { variable: 'impot_employeur_patronale', kind: K.AMOUNT, labels: ['t a s p impot employeur', 't a s p', 'impot employeur', 'tasp'] },
    { variable: 'assurance_sante_patronale', kind: K.AMOUNT, labels: ['assurance sante patronale'] },
    { variable: 'retraite_complementaire_patronale', kind: K.AMOUNT, labels: ['retraite complementaire patronale'] },
    { variable: 'autres_charges_patronales', kind: K.AMOUNT, labels: ['autres charges patronales'] }
];

// ── 8. Totaux ────────────────────────────────────────────────────────────────
const TOTAUX = [
    { variable: 'total_gains_bruts', kind: K.AMOUNT, labels: ['total salaire brut', 'total brut', 'total des gains', 'total gains', 'salaire brut', 'brut'] },
    { variable: 'total_primes', kind: K.AMOUNT, labels: ['total des primes', 'total primes'] },
    { variable: 'total_indemnites', kind: K.AMOUNT, labels: ['total des indemnites', 'total indemnites'] },
    { variable: 'total_avantages_nature', kind: K.AMOUNT, labels: ['total avantages en nature'] },
    { variable: 'brut_social', kind: K.AMOUNT, labels: ['brut social', 'assiette sociale'] },
    { variable: 'brut_imposable_its', kind: K.AMOUNT, labels: ['brut imposable', 'salaire imposable', 'net imposable', 'base imposable'] },
    { variable: 'total_exonere_social', kind: K.AMOUNT, labels: ['total exonere social', 'exonere social'] },
    { variable: 'total_exonere_fiscal', kind: K.AMOUNT, labels: ['total exonere fiscal', 'exonere fiscal'] },
    { variable: 'total_retenues_salariales', kind: K.AMOUNT, labels: ['total des retenues', 'total retenues', 'retenues salariales', 'total salarial'] },
    { variable: 'net_avant_impot', kind: K.AMOUNT, labels: ['net avant impot'] },
    { variable: 'net_a_payer', kind: K.AMOUNT, labels: ['net a payer', 'net a percevoir', 'net paye', 'salaire net', 'net'] },
    { variable: 'total_charges_patronales', kind: K.AMOUNT, labels: ['total charges patronales', 'total patronal', 'charges patronales'] },
    { variable: 'cout_total_employeur', kind: K.AMOUNT, labels: ['cout total employeur', 'cout employeur', 'masse salariale'] }
];

/**
 * `canonical` signale que le nom porte déjà tout son sens, côté compris :
 * « cnps_prestations_familiales_patronale » n'a pas à être re-préfixé par la
 * colonne, sous peine de produire « patronal.cnps_..._patronale ».
 */
const ENTRIES_CI = [
    ...IDENTITE, ...TEMPS, ...SALAIRE, ...PRIMES, ...INDEMNITES,
    ...RETENUES, ...PATRONAL, ...TOTAUX
].map(e => ({ ...e, canonical: true }));

// ═══════════════════════════════════════════════════════
// PARAMÈTRES CONFIGURABLES
//
// Ce ne sont PAS des constantes universelles. Les taux de majoration des heures
// supplémentaires dépendent de l'horaire, du secteur, de la convention
// collective et du règlement intérieur ; les plafonds d'exonération dépendent du
// régime en vigueur et de la nature de l'indemnité.
//
// Les valeurs ci-dessous sont des points de départ, destinés à être remplacés
// par ceux de l'entreprise. Les figer dans le moteur reviendrait à appliquer à
// tous une règle qui n'appartient qu'à certains.
// ═══════════════════════════════════════════════════════
const PARAMS_CI = {
    majorationsHeuresSup: {
        // clé = suffixe de la variable, valeur = coefficient appliqué au taux horaire
        hs_15: null,
        hs_25: null,
        hs_50: null,
        hs_75: null,
        hs_100: null
    },
    plafondsExoneration: {
        // Fraction du brut au-delà de laquelle l'indemnité redevient imposable.
        // À renseigner selon le régime applicable à l'entreprise.
        indemnite_fonction: null,
        indemnite_representation: null,
        indemnite_responsabilite: null,
        indemnite_deplacement: null,
        indemnite_expatriation: null,
        indemnite_tenue: null
    },
    indemniteFinCdd: {
        // Pourcentage des salaires bruts de la durée du contrat, sous conditions.
        tauxParDefaut: null
    }
};

module.exports = { ENTRIES_CI, PARAMS_CI, K };
