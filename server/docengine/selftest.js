// ═══════════════════════════════════════════════════════
// AUTO-TEST DU MOTEUR DE DOCUMENTS
//
//   node server/docengine/selftest.js              → jeu d'essai intégré
//   node server/docengine/selftest.js mon.pdf      → sur un document réel
//
// Génère deux PDF de référence (une grille, un texte rédigé), les fait passer
// dans la chaîne complète et vérifie les invariants du moteur.
// ═══════════════════════════════════════════════════════

const fs = require('fs');
const os = require('os');
const path = require('path');
const PdfPrinter = require('pdfmake');

const engine = require('./index');
const prosePatterns = require('./detect/prosePatterns');
const lexicon = require('./detect/lexicon');
const { createAiDetector } = require('./detect/aiDetect');
const rules = require('./detect/rules');

let failures = 0;
function check(label, condition, detail) {
    const ok = !!condition;
    if (!ok) failures++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && detail ? `  → ${detail}` : ''}`);
}

const FONTS = {
    Roboto: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
    Serif: { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' }
};

// Un SEUL printer, comme en production (payrollService en instancie un au
// chargement du module). Avec une instance par document, pdfmake décale les
// coordonnées des éléments `canvas` d'un document à l'autre.
const printer = new PdfPrinter(FONTS);

function buildPdf(docDefinition) {
    return new Promise((resolve, reject) => {
        const pdf = printer.createPdfKitDocument(docDefinition);
        const chunks = [];
        pdf.on('data', c => chunks.push(c));
        pdf.on('end', () => resolve(Buffer.concat(chunks)));
        pdf.on('error', reject);
        pdf.end();
    });
}

const payslipDefinition = {
    pageSize: 'A4', pageMargins: [40, 40, 40, 40], defaultStyle: { font: 'Roboto' },
    content: [
        { text: 'BULLETIN DE PAIE', fontSize: 16, bold: true, color: '#1a3d6b', alignment: 'center', margin: [0, 0, 0, 8] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: '#1a3d6b' }], margin: [0, 0, 0, 10] },
        {
            columns: [
                { text: 'ACME SARL\n01 BP 1234 Abidjan', fontSize: 8 },
                { text: 'Période : Août 2026\nMatricule : M-0412', fontSize: 8, alignment: 'right' }
            ], margin: [0, 0, 0, 12]
        },
        {
            table: {
                widths: ['*', 70, 70, 70],
                body: [
                    [h('Rubrique'), h('Base', 'right'), h('Taux', 'right'), h('Montant', 'right')],
                    [c('Salaire de base'), c('30', 'right'), c(''), c('350 000', 'right')],
                    [c('ITS'), c('435 000', 'right'), c('8,78%', 'right'), c('38 200', 'right')],
                    [c('CNPS'), c('435 000', 'right'), c('6,30%', 'right'), c('27 405', 'right')],
                    [{ text: 'NET À PAYER', bold: true, fillColor: '#FFFF00', fontSize: 9 }, c(''), c(''),
                     { text: '369 395', bold: true, fillColor: '#FFFF00', fontSize: 9, alignment: 'right' }]
                ]
            }
        }
    ]
};
function h(text, alignment) { return { text, bold: true, fillColor: '#e8eef5', fontSize: 8, alignment }; }
function c(text, alignment) { return { text, fontSize: 8, alignment }; }

// Bulletin réglé uniquement par des filets HORIZONTAUX, avec un bandeau de texte
// blanc sur fond foncé. C'est la forme réelle des bulletins béninois du client,
// et elle cumulait quatre défauts : gras perdu, texte blanc réémis en noir,
// document classé « prose » faute de filets verticaux, et titre fixe écrasé par
// une variable héritée du bloc au-dessus.
function b(text, alignment) { return { text, fontSize: 8, bold: true, alignment }; }
function n(text, alignment) { return { text, fontSize: 8, alignment }; }

const bandedPayslipDefinition = {
    pageSize: 'A4', pageMargins: [40, 40, 40, 40], defaultStyle: { font: 'Roboto' },
    content: [
        { text: 'RÉPUBLIQUE DU BÉNIN', fontSize: 9, alignment: 'center' },
        { text: 'BULLETIN DE PAIE', fontSize: 13, bold: true, alignment: 'center', margin: [0, 10, 0, 10] },
        { text: 'Période de paie : Août 2026', fontSize: 8, margin: [0, 0, 0, 2] },
        { text: 'DÉTAIL DE LA RÉMUNÉRATION', fontSize: 10, bold: true, margin: [0, 10, 0, 6] },
        {
            table: {
                widths: ['*', 70, 70, 80],
                body: [
                    [b('RUBRIQUES DE GAINS'), b('Base', 'right'), b('Taux', 'right'), b('Montant (FCFA)', 'right')],
                    [n('1. Salaire de base'), n('200 000', 'right'), n(''), n('200 000', 'right')],
                    [n('2. Prime de Transport'), n('30 000', 'right'), n(''), n('30 000', 'right')],
                    [b('Total Salaire Brut (A)'), n(''), n(''), b('950 000', 'right')],
                    [b('Total des retenues (C)'), n(''), n(''), b('132 880', 'right')]
                ]
            },
            layout: 'lightHorizontalLines'
        },
        {
            table: { widths: ['*'], body: [[{
                text: 'NET À PAYER (D = A – C) 750 150 FCFA',
                color: '#ffffff', fillColor: '#1f2937', bold: true, fontSize: 10,
                alignment: 'right', margin: [4, 3, 4, 3]
            }]] },
            layout: 'noBorders', margin: [0, 10, 0, 0]
        }
    ]
};

const P = (t, o = {}) => Object.assign({ text: t, fontSize: 11, alignment: 'justify', margin: [0, 0, 0, 8], lineHeight: 1.4 }, o);
const contractDefinition = {
    pageSize: 'A4', pageMargins: [70, 60, 60, 60], defaultStyle: { font: 'Serif' },
    content: [
        { text: 'CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE', fontSize: 14, bold: true, alignment: 'center', margin: [0, 0, 0, 24] },
        P("Entre la société ACME SARL, dont le siège est à Abidjan Cocody, représentée par M. DIALLO, en qualité de Directeur Général, d'une part,"),
        P("Et Monsieur KOUAME Awa, demeurant à Abidjan, d'autre part,"),
        P('Article 1 — Engagement', { bold: true, alignment: 'left', margin: [0, 8, 0, 4] }),
        P("L'employeur engage le salarié à compter du 01/09/2026, en qualité de Comptable senior, moyennant une rémunération mensuelle brute de 485 000 FCFA. La période d'essai est fixée à ___________ mois."),
        P('Fait à Abidjan, le 21/08/2026, en deux exemplaires originaux.', { margin: [0, 24, 0, 0] })
    ]
};

async function run() {
    const target = process.argv[2];

    if (target) {
        console.log(`\n▸ Document fourni : ${target}`);
        const result = await engine.buildTemplate(fs.readFileSync(target), { filename: path.basename(target) });
        if (!result.ok) {
            console.log(`  ✗ Extraction impossible (${result.reason}) : ${result.diagnostics.join(' ')}`);
            process.exit(1);
        }
        console.log(`  nature   : ${result.nature}`);
        console.log(`  stats    : ${JSON.stringify(result.stats)}`);
        console.log(`  variables: ${result.variables.join(', ') || '(aucune)'}`);
        const out = path.join(os.tmpdir(), path.basename(target, path.extname(target)) + '.template.html');
        fs.writeFileSync(out, result.html);
        console.log(`  gabarit  : ${out}`);
        return;
    }

    console.log('\n▸ Motifs contextuels (documents rédigés)');
    const spans = prosePatterns.findSpans(
        "Entre la société ACME SARL, représentée par M. DIALLO, en qualité de Directeur Général, d'une part,"
    );
    const found = Object.fromEntries(spans.map(s => [s.variable, s.sample]));
    check('société → entreprise', found.entreprise === 'ACME SARL', JSON.stringify(found));
    check('représentée par → signataireNom', found.signataireNom === 'M. DIALLO', JSON.stringify(found));
    check('en qualité de → signatairePoste', found.signatairePoste === 'Directeur Général', JSON.stringify(found));

    console.log('\n▸ Lexique métier');
    check('« Salaire de base » reconnu', lexicon.lookup('Salaire de base')?.variable === 'salaire_base_mensuel');
    check('« CNPS » désigne la part salariale', lexicon.lookup('CNPS - RETRAITE')?.variable === 'cnps_salariale');
    check('« BULLETIN DE PAIE » identifié comme titre', lexicon.isTitleOnly('BULLETIN DE PAIE'));
    check('« KOUAME Awa » non identifié comme titre', !lexicon.isTitleOnly('KOUAME Awa'));

    console.log('\n▸ Grille (bulletin de paie)');
    const payslip = await engine.buildTemplate(await buildPdf(payslipDefinition), { filename: 'bulletin.pdf' });
    check('extraction réussie', payslip.ok, payslip.reason);
    check('nature « grid »', payslip.nature === 'grid', payslip.nature);
    check('tableau reconstruit', payslip.stats.tables === 1, JSON.stringify(payslip.stats));
    check('filets extraits', payslip.stats.rules > 10, `${payslip.stats.rules} filets`);
    check('aplats de couleur extraits', payslip.stats.rects >= 4, `${payslip.stats.rects} aplats`);
    check('couleur du filet d\'en-tête conservée', payslip.html.includes('#1a3d6b'));
    check('fond de la ligne NET conservé', payslip.html.toLowerCase().includes('#ffff00'));
    check('{net_a_payer} détecté', payslip.variables.includes('net_a_payer'), payslip.variables.join(','));
    check('{salaire_base_mensuel} détecté', payslip.variables.includes('salaire_base_mensuel'), payslip.variables.join(','));
    check('{its_net} détecté', payslip.variables.includes('its_net'), payslip.variables.join(','));
    check('libellés fixes préservés', payslip.html.includes('Rubrique') && payslip.html.includes('NET À PAYER'));

    console.log('\n▸ Grille sans filets verticaux (bulletin à bandeau)');
    const banded = await engine.buildTemplate(await buildPdf(bandedPayslipDefinition), { filename: 'benin.pdf' });
    check('extraction réussie', banded.ok, banded.reason);
    check("classé « grid » malgré l'absence de filets verticaux", banded.nature === 'grid', banded.nature);
    check('gras conservé', /font-weight:700/.test(banded.html));
    check('texte blanc du bandeau conservé', /color:#ffffff/i.test(banded.html),
        'le bandeau ressortait en noir sur fond foncé, donc illisible');
    check('fond du bandeau conservé', /#1f2937/i.test(banded.html));
    check('titre « DÉTAIL DE LA RÉMUNÉRATION » non écrasé',
        banded.html.includes('DÉTAIL DE LA RÉMUNÉRATION'),
        'un intitulé fixe avait hérité de {periode} depuis le bloc au-dessus');
    check('la période reste sur sa propre ligne', /Période de paie : \{mois_paie\}/.test(banded.html));

    console.log('\n▸ Cas rencontrés sur les bulletins réels');
    check('rubrique numérotée reconnue', lexicon.lookup('1. Salaire de base')?.variable === 'salaire_base_mensuel',
        'la numérotation « 1. » empêchait toute correspondance au lexique');
    check('« Total Salaire Brut (A) » reconnu', lexicon.lookup('Total Salaire Brut (A)')?.variable === 'total_gains_bruts');
    check('« CNSS – part salariale » reconnu', lexicon.lookup('1. CNSS – part salariale')?.variable === 'cnps_salariale');
    check('un numéro d\'immatriculation reste un code',
        rules.classifyValue('00023355') !== null,
        'les numéros CNSS étaient rejetés car classés « montant »');

    // Le net à payer répété en toutes lettres doit suivre le bandeau, sinon le
    // bulletin se contredit lui-même.
    const echoDoc = {
        pages: [{
            blocks: [
                { id: 'b0', lines: ['NET À PAYER (D = A – C) 750 150 FCFA'], text: 'NET À PAYER (D = A – C) 750 150 FCFA', x: 0, y: 0, w: 100, h: 10 },
                { id: 'b1', lines: ['Arrêté le présent bulletin à la somme de : 750 150 francs CFA.'], text: 'Arrêté le présent bulletin à la somme de : 750 150 francs CFA.', x: 0, y: 20, w: 100, h: 10 }
            ],
            tables: [], texts: [], lines: [], rects: [], images: []
        }],
        variables: [], diagnostics: []
    };
    rules.detect(echoDoc, 'grid');
    const echoes = echoDoc.variables.filter(v => v.variable === 'net_a_payer');
    check('le net répété en toutes lettres devient lui aussi une variable',
        echoes.length === 2, `${echoes.length} occurrence(s) sur 2`);

    console.log('\n▸ Rédigé (contrat de travail)');
    const contract = await engine.buildTemplate(await buildPdf(contractDefinition), { filename: 'contrat.pdf' });
    check('extraction réussie', contract.ok, contract.reason);
    check('nature « prose »', contract.nature === 'prose', contract.nature);
    check('rendu en flux, pas en absolu', !/onda-page[^>]*position:relative;width:210mm;height:/.test(contract.html));
    check('police serif reconnue', contract.html.includes('Georgia'));
    check('titres en gras', contract.html.includes('font-weight:700'));
    // Un guillemet double dans une pile de polices refermait l'attribut au milieu,
    // laissant une déclaration tronquée (« font-family:Georgia, »). On vérifie donc
    // qu'aucune valeur de style ne se termine sur une déclaration incomplète.
    const styleValues = [...contract.html.matchAll(/style="([^"]*)"/g)].map(m => m[1]);
    check('aucune déclaration de style tronquée',
        styleValues.every(v => !/[,:]\s*$/.test(v)),
        styleValues.find(v => /[,:]\s*$/.test(v)));
    check("la pile de polices survit à l'attribut", contract.html.includes("Georgia, 'Times New Roman', serif"));
    ['signataireNom', 'signatairePoste', 'nomComplet', 'dateEntree', 'poste', 'salaireAff', 'lieu', 'dateDoc']
        .forEach(v => check(`{${v}} détecté`, contract.variables.includes(v), contract.variables.join(',')));
    check('blanc à compléter préservé', contract.html.includes('___'));
    check('mentions légales préservées', contract.html.includes("d'essai"));

    console.log('\n▸ Document hors catalogue (rubriques inconnues du lexique)');
    // Aucune de ces rubriques n'est au lexique. Le moteur doit malgré tout rendre
    // le document paramétrable : sans cela l'outil ne servirait qu'aux libellés
    // prévus d'avance, ce qui contredit sa raison d'être.
    const foreign = await buildPdf({
        pageSize: 'A4', pageMargins: [40, 40, 40, 40], defaultStyle: { font: 'Roboto' },
        content: [
            { text: 'FICHE DE PAIE', fontSize: 13, bold: true, alignment: 'center', margin: [0, 0, 0, 12] },
            { text: 'Numéro NIC : M2704910', fontSize: 8, margin: [0, 0, 0, 10] },
            {
                table: {
                    widths: ['*', 80, 80],
                    body: [
                        [b('Libellé'), b('Base', 'right'), b('Montant', 'right')],
                        [n('1. Indemnité de brousse'), n('12 000', 'right'), n('12 000', 'right')],
                        [n('2. Prime de marée'), n('5 000', 'right'), n('5 000', 'right')],
                        [n('3. Allocation vestimentaire'), n('7 500', 'right'), n('7 500', 'right')]
                    ]
                },
                layout: 'lightHorizontalLines'
            }
        ]
    });
    const unknown = await engine.buildTemplate(foreign, { filename: 'etranger.pdf' });
    check('extraction réussie', unknown.ok, unknown.reason);
    check('des emplacements sont créés malgré des libellés inconnus',
        unknown.stats.provisional >= 3,
        `${unknown.stats.provisional} emplacement(s) — un libellé hors lexique laissait la valeur figée`);
    check('chaque emplacement porte le nom de son intitulé',
        unknown.variables.includes('champ_indemnite_de_brousse'),
        unknown.variables.join(','));
    check('les intitulés sont remontés à l\'interface',
        unknown.unmapped.length >= 3 && unknown.unmapped.every(u => u.label && u.samples.length),
        JSON.stringify(unknown.unmapped.slice(0, 2)));
    check('les libellés fixes ne deviennent pas des variables',
        !unknown.variables.some(v => /champ_libelle|champ_montant|champ_base/.test(v)),
        unknown.variables.join(','));
    check('les intitulés de rubrique restent dans le document',
        unknown.html.includes('Indemnité de brousse') && unknown.html.includes('Prime de marée'));

    console.log('\n▸ Déterminisme');
    // Sur le MÊME buffer : régénérer le PDF testerait la stabilité de pdfmake,
    // pas celle du moteur.
    const bytes = await buildPdf(payslipDefinition);
    const first = await engine.buildTemplate(bytes, { filename: 'bulletin.pdf' });
    const second = await engine.buildTemplate(bytes, { filename: 'bulletin.pdf' });
    check('deux exécutions donnent le même HTML', first.html === second.html);

    console.log('\n▸ Robustesse');
    const broken = await engine.buildTemplate(Buffer.from('%PDF-1.4\nne suit pas la spec\n'), { filename: 'casse.pdf' });
    check('un PDF illisible ne lève pas', broken.ok === false && broken.reason === 'extraction-failed', broken.reason);
    const notPdf = await engine.buildTemplate(Buffer.from('juste du texte'), { filename: 'note.txt' });
    check('un format inconnu est refusé proprement', notPdf.ok === false && notPdf.reason === 'no-extractor', notPdf.reason);

    console.log('\n▸ Anti-hallucination du détecteur IA');
    const hallucinating = createAiDetector(async () => JSON.stringify([
        { id: 'identifiant:inexistant', variable: 'netAPayer', confidence: 0.9 },
        { id: '0:t0:1:1', variable: 'variable_inventee', confidence: 0.9 },
        { id: '0:t0:1:1', variable: 'netAPayer', confidence: 0.1 }
    ]));
    const doc = { ...payslip.ir };
    const before = doc.variables.filter(v => v.detectedBy === 'ai').length;
    await hallucinating.detect(doc, { nature: 'grid' });
    const after = doc.variables.filter(v => v.detectedBy === 'ai').length;
    check('les trois propositions invalides sont rejetées', after === before, `${after - before} acceptée(s)`);

    console.log(`\n${failures === 0 ? '✓ Tout est vert.' : `✗ ${failures} vérification(s) en échec.`}\n`);
    process.exit(failures === 0 ? 0 : 1);
}

run().catch(e => { console.error('\nÉchec inattendu :', e); process.exit(1); });
