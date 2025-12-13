const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/model/modele_bulletin_paie_CI.xlsx');

try {
    const workbook = XLSX.readFile(filePath);

    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n========== FEUILLE : ${sheetName} ==========`);
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        console.log(`Nombre de lignes: ${data.length}`);

        if (data.length > 0) {
            console.log('\nColonnes disponibles:');
            console.log(Object.keys(data[0]));

            console.log('\nPremière ligne de données:');
            console.log(JSON.stringify(data[0], null, 2));
        }
    });

} catch (error) {
    console.error("Erreur lecture excel:", error.message);
}
