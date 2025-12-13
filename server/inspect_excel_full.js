const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/model/modele_bulletin_paie_CI.xlsx');

try {
    const workbook = XLSX.readFile(filePath);

    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n--- FEUILLE : ${sheetName} ---`);
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Array of Arrays

        if (data.length > 0) {
            console.log("Ligne 1 (Headers probables) :", JSON.stringify(data[0]));
            if (data.length > 1) console.log("Ligne 2 (Données/Sous-titres ?) :", JSON.stringify(data[1]));
        } else {
            console.log("(Vide)");
        }
    });

} catch (error) {
    console.error("Erreur lecture excel:", error.message);
}
