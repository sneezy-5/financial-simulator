const XLSX = require('xlsx');
const path = require('path');

// Définition des feuilles et en-têtes
const sheets = {
    'INFORMATIONS_ENTREPRISE': [
        ['nom_entreprise', 'adresse', 'code_postal', 'ville', 'siret', 'logo_url'],
        ['Ma Société SARL', '123 Rue Abidjan', '01000', 'Abidjan', '123456789', '']
    ],
    'EMPLOYES': [
        ['id_employe', 'matricule', 'nom', 'prenom', 'date_naissance', 'securite_sociale', 'email', 'situation_familiale', 'nombre_enfants'],
        ['EMP001', 'M202401', 'AMANGOUA', 'Jean', '1990-05-15', '1900512345678', 'jean@mail.com', 'marie', 2],
        ['EMP002', 'M202402', 'KOUASSI', 'Marie', '1992-08-20', '2920812345678', 'marie@mail.com', 'celibataire', 0]
    ],
    'CONTRATS': [
        ['id_employe', 'type_contrat', 'date_debut', 'poste', 'categorie', 'temps_travail'],
        ['EMP001', 'CDI', '2023-01-01', 'Comptable', 'Cadre', 'Temps plein'],
        ['EMP002', 'CDD', '2024-02-01', 'Assistante', 'Agent', 'Temps plein']
    ],
    'REMUNERATION': [
        ['id_employe', 'salaire_base', 'sursalaire', 'prime_transport', 'prime_logement', 'autres_primes'],
        ['EMP001', 350000, 50000, 30000, 0, 15000],
        ['EMP002', 150000, 0, 30000, 0, 0]
    ],
    'CONGES': [
        ['id_employe', 'solde_conges_payes', 'conges_acquis_mois', 'conges_pris_mois'],
        ['EMP001', 25.0, 2.2, 0],
        ['EMP002', 5.0, 2.2, 2]
    ],
    'TEMPS_TRAVAIL': [
        ['id_employe', 'mois', 'jours_travailles', 'heures_sup_nb', 'heures_sup_taux', 'absences_jours'],
        ['EMP001', '12/2025', 22, 5, 1.25, 0],
        ['EMP002', '12/2025', 20, 0, 0, 0]
    ]
};

const wb = XLSX.utils.book_new();

for (const [sheetName, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Ajustement largeur colonnes (cosmétique)
    ws['!cols'] = data[0].map(() => ({ wch: 20 }));

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

const outputPath = path.join(__dirname, '../src/services/model/modele_paie_complet.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`✅ Fichier modèle créé : ${outputPath}`);
