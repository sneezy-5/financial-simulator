// ═══════════════════════════════════════════════════════
// LE CLASSEUR UNIQUE D'IMPORT
//
// Un seul fichier, trois feuilles, une règle de partage claire :
//
//   ENTREPRISE — ce qui est vrai pour tout le monde (raison sociale, adresse,
//                numéros, signataire). Une seule ligne.
//   EMPLOYES   — l'IDENTITÉ du salarié, et rien de plus : état civil (sexe, date
//                de naissance), catégorie, situation matrimoniale, enfants à
//                charge, et son salaire NET de référence.
//   CONTRATS   — la RÉMUNÉRATION et ses composantes : salaire de base,
//                sursalaire, primes. C'est la pièce signée, donc elle fait foi.
//
// Le salaire de base ne figure PAS dans la feuille des employés : deux endroits
// pour la même donnée, c'est la garantie qu'ils divergeront. La fiche dit qui
// est le salarié, le contrat dit ce qu'il perçoit.
// ═══════════════════════════════════════════════════════

const COLONNES_ENTREPRISE = [
    'raison_sociale', 'adresse', 'telephone', 'email',
    'numero_cnps_employeur', 'numero_contribuable',
    'signataire_nom', 'signataire_fonction', 'ville'
];

const COLONNES_EMPLOYES = [
    'matricule', 'nom', 'prenom', 'sexe', 'date_naissance',
    'poste', 'categorie', 'categorie_professionnelle',
    'telephone', 'date_embauche', 'numero_cnps',
    'situation_matrimoniale', 'nombre_enfants',
    'expatrie', 'salaire_net'
];

const COLONNES_CONTRATS = [
    'matricule', 'type', 'date_debut', 'date_fin', 'poste',
    'salaire_base', 'sursalaire',
    'prime_1_libelle', 'prime_1_montant', 'prime_1_imposable',
    'prime_2_libelle', 'prime_2_montant', 'prime_2_imposable',
    'prime_3_libelle', 'prime_3_montant', 'prime_3_imposable'
];

const EXEMPLE_ENTREPRISE = {
    raison_sociale: 'MA SOCIETE SARL',
    adresse: 'Abidjan, Cocody Riviera',
    telephone: '+225 07 00 00 00',
    email: 'contact@masociete.ci',
    numero_cnps_employeur: 'CNPS-000000',
    numero_contribuable: 'CI-2024-123456A',
    signataire_nom: 'TRAORE Awa',
    signataire_fonction: 'Directrice générale',
    ville: 'Abidjan'
};

const EXEMPLE_EMPLOYE = {
    matricule: 'EMP-001',
    nom: 'KONAN', prenom: 'Yao',
    sexe: 'M',
    date_naissance: '15/03/1988',
    poste: 'Comptable', categorie: 'Agent de maîtrise',
    categorie_professionnelle: 'cadre',
    telephone: '+225 07 00 00 01',
    date_embauche: '15/01/2020',
    numero_cnps: '123456-A',
    situation_matrimoniale: 'marie',
    nombre_enfants: 2,
    expatrie: 'non',
    salaire_net: 385000
};

const EXEMPLE_CONTRAT = {
    matricule: 'EMP-001',
    type: 'CDI',
    date_debut: '15/01/2020',
    date_fin: '',
    poste: 'Comptable',
    salaire_base: 350000,
    sursalaire: 0,
    prime_1_libelle: 'Prime de transport', prime_1_montant: 30000, prime_1_imposable: 'non',
    prime_2_libelle: 'Prime de logement', prime_2_montant: 50000, prime_2_imposable: 'oui',
    prime_3_libelle: '', prime_3_montant: '', prime_3_imposable: ''
};

const MODE_EMPLOI = [
    ['Comment remplir ce classeur'],
    [''],
    ['1. ENTREPRISE', 'Une seule ligne. Ces informations servent d\'en-tête à tous les documents générés.'],
    ['2. EMPLOYES', 'Une ligne par salarié. Le matricule est la clé : il relie la fiche à son contrat.'],
    ['', 'Le salaire NET est celui versé au salarié. La composition du salaire se déclare dans CONTRATS.'],
    ['', 'sexe : M ou F (ou « Homme » / « Femme »).'],
    ['', 'categorie : classification conventionnelle (ex. Agent de maîtrise, Cadre, Employé).'],
    ['', 'categorie_professionnelle : cadre ou employe — alimente la répartition Cadres/Employés du tableau de bord RH.'],
    ['3. CONTRATS', 'Une ligne par contrat. Un salarié peut en avoir plusieurs (CDD renouvelé, avenant).'],
    ['', 'C\'est ici que se déclarent le salaire de base, le sursalaire et les primes.'],
    ['', 'Le contrat en vigueur à la date de paie est celui qui est retenu.'],
    [''],
    ['Types de contrat acceptés', 'CDI, CDD, STAGE, INTERIM'],
    ['Situation matrimoniale', 'celibataire, marie, divorce, veuf'],
    ['Expatrié', 'oui / non — laissez vide pour « non ». Change le taux de T.A.S.P payé par l\'employeur.'],
    ['Prime imposable', 'oui / non — laissez vide pour « oui », qui est le régime de droit commun'],
    ['Dates', 'Format français JJ/MM/AAAA (ex. 01/03/2026) — concerne la date de naissance, la date d\'embauche et les dates de contrat.'],
    ['Lignes d\'exemple', 'Les lignes fournies sont des exemples : remplacez-les par vos données.']
];

/** Construit le classeur modèle. */
function construireClasseur(XLSX) {
    const wb = XLSX.utils.book_new();

    const feuille = (lignes, colonnes) =>
        XLSX.utils.json_to_sheet(lignes, { header: colonnes });

    const wsEntreprise = feuille([EXEMPLE_ENTREPRISE], COLONNES_ENTREPRISE);
    wsEntreprise['!cols'] = COLONNES_ENTREPRISE.map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(wb, wsEntreprise, 'ENTREPRISE');

    const wsEmployes = feuille([EXEMPLE_EMPLOYE], COLONNES_EMPLOYES);
    wsEmployes['!cols'] = COLONNES_EMPLOYES.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, wsEmployes, 'EMPLOYES');

    const wsContrats = feuille([EXEMPLE_CONTRAT], COLONNES_CONTRATS);
    wsContrats['!cols'] = COLONNES_CONTRATS.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, wsContrats, 'CONTRATS');

    const wsAide = XLSX.utils.aoa_to_sheet(MODE_EMPLOI);
    wsAide['!cols'] = [{ wch: 28 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsAide, 'MODE_EMPLOI');

    return wb;
}

module.exports = {
    construireClasseur,
    COLONNES_ENTREPRISE, COLONNES_EMPLOYES, COLONNES_CONTRATS
};
