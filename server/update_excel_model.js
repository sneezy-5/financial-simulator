const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/model/modele_paie_complet.xlsx');

try {
    // Lire le fichier Excel existant
    const workbook = XLSX.readFile(filePath);

    console.log('Feuilles actuelles:', workbook.SheetNames);

    // ===== 1. Supprimer la feuille ENTREPRISE =====
    if (workbook.SheetNames.includes('ENTREPRISE')) {
        delete workbook.Sheets['ENTREPRISE'];
        workbook.SheetNames = workbook.SheetNames.filter(name => name !== 'ENTREPRISE');
        console.log('✅ Feuille ENTREPRISE supprimée');
    }

    // ===== 2. Mettre à jour INFORMATIONS_ENTREPRISE =====
    const infoEntrepriseData = [
        {
            nom_entreprise: "Côte d'Ivoire PAIE",
            adresse: "17 BP 184 Abidjan 17",
            siege_social: "BINGERVILLE-CITEE FDFP-VILLA 67",
            numero_cnps: "XXXXXX",
            numero_contribuable: "XXXXXXX",
            email: "infos@cotedivoirepaie.ci",
            telephone: "+225 0758474646"
        }
    ];

    // Supprimer l'ancienne feuille INFORMATIONS_ENTREPRISE
    if (workbook.SheetNames.includes('INFORMATIONS_ENTREPRISE')) {
        delete workbook.Sheets['INFORMATIONS_ENTREPRISE'];
        workbook.SheetNames = workbook.SheetNames.filter(name => name !== 'INFORMATIONS_ENTREPRISE');
    }

    // Créer la nouvelle feuille INFORMATIONS_ENTREPRISE en première position
    const infoSheet = XLSX.utils.json_to_sheet(infoEntrepriseData);

    // Ajouter la feuille au début
    workbook.SheetNames.unshift('INFORMATIONS_ENTREPRISE');
    workbook.Sheets['INFORMATIONS_ENTREPRISE'] = infoSheet;

    console.log('✅ Feuille INFORMATIONS_ENTREPRISE mise à jour avec:');
    console.log('   - nom_entreprise');
    console.log('   - adresse');
    console.log('   - siege_social');
    console.log('   - numero_cnps');
    console.log('   - numero_contribuable');
    console.log('   - email');
    console.log('   - telephone');

    // Sauvegarder le fichier
    XLSX.writeFile(workbook, filePath);

    console.log('\n🎉 Fichier Excel mis à jour !');
    console.log('Feuilles finales:', workbook.SheetNames);

} catch (error) {
    console.error('❌ Erreur:', error.message);
}
