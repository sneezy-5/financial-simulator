// Chaine complete d'un contrat de travail Word, telle que l'interface l'exerce :
//   assistant -> gabarit -> generation depuis la fiche salarie et son contrat.
//   ./node.exe tests/contratOffice.test.js
const path = require('path');
const RACINE = process.cwd();
const PizZip = require(path.join(RACINE, 'server/node_modules/pizzip'));
const { extraireOffice } = require(path.join(RACINE, 'server/docengine/office/officeExtract.js'));
const { analyserModele } = require(path.join(RACINE, 'server/docengine/office/officeAnalyse.js'));
const { poserVariables, remplir } = require(path.join(RACINE, 'server/docengine/office/officeRemplir.js'));

const p = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const z = new PizZip();
z.file('word/document.xml', `<?xml version="1.0"?><w:document><w:body>${
    p('CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE') +
    p('Entre la société ACME SARL, représentée par Monsieur DIALLO Ibrahim, en qualité de Directeur des ressources humaines,') +
    p('et Monsieur KOUAME Awa, engagé en qualité de Comptable,') +
    p("à compter du 01/03/2025 et jusqu'au 28/02/2026,") +
    p('moyennant un salaire de base mensuel de 450 000 FCFA.') +
    p('Fait à Abidjan, le 15/02/2025')
}</w:body></w:document>`);
const source = z.generate({ type: 'nodebuffer' });

const analyse = analyserModele(extraireOffice(source, 'contrat.docx'), 'contrat_travail');
console.log('Variables repérées :', analyse.variables.join(', ') || '(aucune)');

const gabarit = poserVariables(source, analyse.emplacements, 'docx');
console.log('Gabarit :\n' + extraireOffice(gabarit.buffer, 'contrat.docx').texte + '\n');

// Ce que DocumentsGenerator envoie : fiche salarié + contrat fusionnés.
const donnees = {
    nomComplet: 'Kouassi YAO', poste: 'Chef comptable',
    entreprise: 'BETA CI', adresse: 'Cocody Riviera',
    salaireAff: 620000, lieu: 'Yamoussoukro', dateDoc: '21/08/2026',
    dateEntree: '01/09/2026', dateFinContrat: '31/08/2027',
    signataireNom: 'TRAORE Awa', signatairePoste: 'Directrice générale',
    salarie_nom_complet: 'Kouassi YAO', contrat_type: 'CDD'
};

const final = remplir(gabarit.buffer, donnees, 'docx');
const texte = extraireOffice(final.buffer, 'contrat.docx').texte;

let ko = 0;
const ok = (label, cond, detail) => { if (!cond) ko++; console.log(`  ${cond ? '✓' : '✗'} ${label}${!cond && detail ? '\n      → ' + detail : ''}`); };

ok('le texte juridique fixe est conservé', /CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE/.test(texte) && /en qualité de/.test(texte));
ok('aucune valeur du modèle ne subsiste', !/KOUAME|450 ?000|ACME|DIALLO|15\/02\/2025/.test(texte));
ok('le salarié et son poste sont posés', /Kouassi YAO/.test(texte) && /Chef comptable/.test(texte));
ok('la devise n\'est pas dédoublée', /620 000 FCFA\./.test(texte));
ok('les dates du contrat sont posées', /01\/09\/2026/.test(texte) && /31\/08\/2027/.test(texte));
ok('le signataire est posé', /TRAORE Awa/.test(texte));
ok('le fichier reste un docx lisible', !/&lt;w:/.test(texte));

console.log('\n--- document généré ---\n' + texte);
console.log('\n' + (ko ? '✗ ' + ko + ' échec(s)' : '✓ Chaîne « contrat de travail » verte') + '\n');
process.exit(ko ? 1 : 0);
