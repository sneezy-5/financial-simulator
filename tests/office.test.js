// Auto-test de la chaîne Word / Excel.
//   ./node.exe tests/office.test.js
//
// Vérifie la propriété qui fait tout l'intérêt de cette voie : le fichier du
// client n'est jamais reconstruit, seul son texte est substitué — donc la mise
// en page ne peut pas se dégrader.

const path = require('path');

const RACINE = path.join(__dirname, '..');
const { extraireOffice } = require(path.join(RACINE, 'server/docengine/office/officeExtract.js'));
const { analyserModele } = require(path.join(RACINE, 'server/docengine/office/officeAnalyse.js'));
const { poserVariables, remplir } = require(path.join(RACINE, 'server/docengine/office/officeRemplir.js'));
const { remplacerDansNoeuds } = require(path.join(RACINE, 'server/docxEditor.js'));
const PizZip = require(path.join(RACINE, 'server/node_modules/pizzip'));
const XLSX = require(path.join(RACINE, 'server/node_modules/xlsx'));

let ko = 0;
const ok = (label, cond, detail) => {
    if (!cond) ko++;
    console.log(`  ${cond ? '✓' : '✗'} ${label}${!cond && detail ? '  → ' + detail : ''}`);
};

// ── Modèles de test ──────────────────────────────────────────────────────────
const p = (t, gras) => `<w:p><w:r>${gras ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t>${t}</w:t></w:r></w:p>`;
const tc = (t, span) => `<w:tc>${span ? `<w:tcPr><w:gridSpan w:val="${span}"/></w:tcPr>` : ''}${p(t)}</w:tc>`;
const tr = (cs) => `<w:tr>${cs}</w:tr>`;

function bulletinDocx() {
    const corps = p('BULLETIN DE PAIE', true) + p('Nom : KOUAME Awa') + p('Matricule : EMP-001') +
        '<w:tbl>' +
        tr(tc('DESIGNATION') + tc('PART SALARIALE', 2)) +
        tr(tc('SALAIRE CATEGORIEL') + tc('300 000') + tc('')) +
        tr(tc('ITS') + tc('') + tc('38 500')) +
        tr(tc('NET A PAYER') + tc('') + tc('318 450')) +
        '</w:tbl>' + p('Fait a Abidjan, le 21/08/2026');
    const z = new PizZip();
    z.file('word/document.xml', `<?xml version="1.0"?><w:document><w:body>${corps}</w:body></w:document>`);
    z.file('word/header1.xml', `<?xml version="1.0"?><w:hdr>${p('ACME SARL')}</w:hdr>`);
    return z.generate({ type: 'nodebuffer' });
}

function bulletinXlsx() {
    const ws = XLSX.utils.aoa_to_sheet([
        ['BULLETIN DE PAIE', '', ''],
        ['Nom', 'KOUAME Awa', ''],
        ['Matricule', 'EMP-001', ''],
        ['Rubrique', 'Base', 'Montant'],
        ['Salaire de base', 300000, 300000],
        ['ITS', 300000, 38500],
        ['NET A PAYER', '', 318450]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bulletin');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── Pièges du XML Word ───────────────────────────────────────────────────────
console.log('\n▸ Pièges du format Word');

const xmlTableau = '<w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>SALAIRE</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:p><w:r><w:t>300 000</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body>';
const r1 = remplacerDansNoeuds(xmlTableau, '300 000', '{montant}');
// <w:t[^>]*> matchait aussi <w:tc>, <w:tbl>, <w:tr> : les balises du tableau
// finissaient échappées à l'intérieur du texte et le document était détruit.
ok('les balises de tableau ne sont pas confondues avec <w:t>', !/&lt;w:/.test(r1.xml), r1.xml.slice(0, 120));
ok('le remplacement a bien eu lieu', r1.xml.includes('{montant}'));

// Un remplacement contenant sa propre cible faisait déborder la pile.
const xmlAuto = '<w:body><w:p><w:r><w:t>Emploi : comptable</w:t></w:r></w:p></w:body>';
const r2 = remplacerDansNoeuds(xmlAuto, 'comptable', '{comptable}');
ok('un remplacement auto-contenant ne boucle pas', r2.remplacements === 1 && r2.xml.includes('{comptable}'));

// Word coupe volontiers un mot en plusieurs runs.
const xmlCoupe = '<w:body><w:p><w:r><w:t>KOU</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>AME Awa</w:t></w:r></w:p></w:body>';
const r3 = remplacerDansNoeuds(xmlCoupe, 'KOUAME Awa', '{salarie_nom}');
ok('un texte réparti sur plusieurs runs est recollé', r3.remplacements === 1 && r3.xml.includes('{salarie_nom}'));

// ── Chaîne complète, sur les deux formats ────────────────────────────────────
const donnees = {
    salarie_nom: 'YAO Kouassi', salarie_matricule: 'EMP-2027',
    salaire_base_mensuel: 450000, its_net: 52300, net_a_payer: 397700
};

for (const [nom, format, fabriquer] of [['bulletin.docx', 'docx', bulletinDocx], ['bulletin.xlsx', 'xlsx', bulletinXlsx]]) {
    console.log(`\n▸ Chaîne complète — ${nom}`);
    const source = fabriquer();

    const analyse = analyserModele(extraireOffice(source, nom), 'bulletin_paie');
    ok('le salarié est repéré', analyse.variables.includes('salarie_nom'), analyse.variables.join(','));
    ok('le net à payer est repéré', analyse.variables.includes('net_a_payer'), analyse.variables.join(','));
    ok('le modèle est jugé suffisamment renseigné', analyse.completude.suffisant);

    const gabarit = poserVariables(source, analyse.emplacements, format);
    const relu = extraireOffice(gabarit.buffer, nom);
    ok('les variables sont posées', /\{salarie_nom\}/.test(relu.texte) && /\{net_a_payer\}/.test(relu.texte));
    ok('les intitulés fixes sont conservés', /BULLETIN DE PAIE/i.test(relu.texte) && /ITS/.test(relu.texte));

    const final = remplir(gabarit.buffer, donnees, format);
    const texte = extraireOffice(final.buffer, nom).texte;
    ok('rempli avec les nouvelles données', /YAO Kouassi/.test(texte) && /397 ?700/.test(texte));
    ok('aucune valeur du modèle ne subsiste', !/KOUAME Awa/.test(texte) && !/318 ?450/.test(texte));
    ok('le fichier reste lisible', !/&lt;w:/.test(texte));
}

// ── Contrôle de complétude ───────────────────────────────────────────────────
console.log('\n▸ Contrôle de complétude');
const vide = new PizZip();
vide.file('word/document.xml', `<?xml version="1.0"?><w:document><w:body>${p('BULLETIN DE PAIE', true)}${p('Nom :')}</w:body></w:document>`);
const analyseVide = analyserModele(extraireOffice(vide.generate({ type: 'nodebuffer' }), 'vide.docx'), 'bulletin_paie');
ok('un modèle vierge est déclaré insuffisant', !analyseVide.completude.suffisant);
ok('le conseil à donner est fourni', typeof analyseVide.completude.conseil === 'string' && analyseVide.completude.conseil.length > 20);

// ── Une formule Excel ne devient jamais une variable ─────────────────────────
console.log('\n▸ Formules Excel');
const wsF = XLSX.utils.aoa_to_sheet([['Rubrique', 'Montant'], ['Salaire de base', 300000], ['Total', 0]]);
wsF.B3 = { t: 'n', v: 300000, f: 'SUM(B2:B2)' };
const wbF = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbF, wsF, 'F');
const bufF = XLSX.write(wbF, { type: 'buffer', bookType: 'xlsx' });
const aF = analyserModele(extraireOffice(bufF, 'f.xlsx'), 'bulletin_paie');
const gF = poserVariables(bufF, aF.emplacements, 'xlsx');
const wbRelu = XLSX.read(gF.buffer, { type: 'buffer' });
ok('la formule est préservée', !!wbRelu.Sheets.F.B3 && !!wbRelu.Sheets.F.B3.f, JSON.stringify(wbRelu.Sheets.F.B3));


// ── Le type choisi doit survivre à l'enregistrement ──────────────────────────
console.log('\n▸ Types de documents');
const { listerTypes } = require(path.join(RACINE, 'server/docengine/office/typesDocuments.js'));
const sourceService = require('fs').readFileSync(path.join(RACINE, 'src/services/officeTemplate.js'), 'utf8');
// Sans correspondance explicite entre les codes du moteur (bulletin_paie…) et
// les types applicatifs (payslip…), un contrat enregistré depuis l'assistant
// retombait sur l'étiquette par défaut « Bulletin de paie ».
for (const t of listerTypes()) {
    ok(`le type ${t.code} a une correspondance applicative`,
        sourceService.includes(t.code + ':'));
}


console.log('\n' + (ko === 0 ? '✓ Tout est vert.' : `✗ ${ko} vérification(s) en échec.`) + '\n');
process.exit(ko === 0 ? 0 : 1);
