const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/model/modele_bulletin_paie_CI.xlsx');

try {
    // Lire le fichier Excel existant
    const workbook = XLSX.readFile(filePath);

    // Données de l'entreprise (à personnaliser selon vos besoins)
    const entrepriseData = [
        {
            nom_entreprise: "Côte d'Ivoire PAIE",
            adresse: "17 BP 184 Abidjan 17",
            siege_social: "BINGERVILLE-CITEE FDFP-VILLA 67",
            numero_cnps: "1234567",
            numero_contribuable: "CI-ABJ-2024-M-12345",
            email: "infos@cotedivoirepaie.ci",
            telephone: "+225 07 07 07 07 07"
        }
    ];

    // Créer une nouvelle feuille pour l'entreprise
    const entrepriseSheet = XLSX.utils.json_to_sheet(entrepriseData);

    // Ajouter la feuille au workbook
    XLSX.utils.book_append_sheet(workbook, entrepriseSheet, 'ENTREPRISE');

    // Sauvegarder le fichier
    XLSX.writeFile(workbook, filePath);

    console.log('✅ Feuille ENTREPRISE ajoutée avec succès !');
    console.log('Données ajoutées:', entrepriseData[0]);

} catch (error) {
    console.error('❌ Erreur:', error.message);
}
