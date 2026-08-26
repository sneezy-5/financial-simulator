const XLSX = require('xlsx');
const path = 'C:/Users/HP/Downloads/© LOGIPAIE_RH260 V01.xlsm';
const sheetName = process.argv[2];
const wb = XLSX.readFile(path, { cellFormula: true, cellStyles: false });
const ws = wb.Sheets[sheetName];
if (!ws) { console.error('Feuille introuvable :', sheetName); process.exit(1); }
const range = XLSX.utils.decode_range(ws['!ref']);
const maxRow = Math.min(range.e.r, (parseInt(process.argv[3]) || 400));
for (let r = range.s.r; r <= maxRow; r++) {
  const rowParts = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    if (!cell) continue;
    let val = cell.f ? `=${cell.f}` : cell.v;
    if (val === undefined || val === null || val === '') continue;
    rowParts.push(`${addr}:${JSON.stringify(val)}`);
  }
  if (rowParts.length) console.log(`R${r + 1}  ` + rowParts.join('  '));
}
