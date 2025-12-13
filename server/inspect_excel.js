const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/model/modele_bulletin_paie_CI.xlsx');

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convertir la première ligne en JSON pour voir les en-têtes
    const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];

    console.log("En-têtes trouvés :", JSON.stringify(headers, null, 2));
} catch (error) {
    console.error("Erreur lecture excel:", error.message);
}
