const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/model/modele_bulletin_paie_CI.xlsx');

try {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets['EMPLOYES']; // Je suppose que c'est cette feuille
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length > 0) {
        console.log("Exemple de données (1er employé) :", Object.keys(data[0]));
        console.log("Valeurs :", data[0]);
    } else {
        console.log("Aucune donnée trouvée.");
    }

} catch (error) {
    console.error("Erreur:", error.message);
}
