// ═══════════════════════════════════════════════════════════════════════════
// RENDU GÉNÉRIQUE DES DÉCLARATIONS (PDF / XLSX / CSV)
//
// Met en page n'importe quel « document » produit par declarationsEtats.js
// (blocs de tableaux ou de paires libellé / valeur). Ajouter une déclaration ne
// demande donc que sa logique, pas un nouveau gabarit PDF et Excel.
// ═══════════════════════════════════════════════════════════════════════════

const PdfPrinter = require('pdfmake');
const XLSX = require('xlsx');

const printer = new PdfPrinter({
    Roboto: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' }
});

const NAVY = '#1e3a5f';
const BAND = '#eef2f7';
const BORDER = '#c3c2b7';
const AMBRE = '#92400e';

const fcfa = (v) => (v === null || v === undefined || v === '' || isNaN(v)) ? (v === '' ? '' : '—')
    : Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pct = (t) => (t === '' || t === null || t === undefined) ? '' : (Math.round(t * 10000) / 100).toString().replace('.', ',') + ' %';

function texte(valeur, format) {
    if (format === 'fcfa') return typeof valeur === 'number' ? fcfa(valeur) : String(valeur ?? '');
    if (format === 'pct') return typeof valeur === 'number' ? pct(valeur) : String(valeur ?? '');
    return String(valeur ?? '');
}

function rendre(definition) {
    return new Promise((resolve, reject) => {
        try {
            const doc = printer.createPdfKitDocument(definition);
            const morceaux = [];
            doc.on('data', (c) => morceaux.push(c));
            doc.on('end', () => resolve(Buffer.concat(morceaux)));
            doc.on('error', reject);
            doc.end();
        } catch (e) { reject(e); }
    });
}

// ── PDF ──────────────────────────────────────────────────────────────────
async function documentPdf(d) {
    const largeurPage = d.paysage ? 786 : 515;
    const e = d.entreprise || {};
    const petit = d.paysage && (d.blocs[0]?.colonnes?.length || 0) > 10;
    const fs = petit ? 6.3 : 7.8;
    // Un montant ne se coupe jamais (« 4 800 / 000 ») ; un en-tête d'un seul mot non plus.
    const th = (t, align) => ({ text: t, bold: true, fontSize: fs, fillColor: BAND, margin: [2, 3, 2, 3], alignment: align, noWrap: !/\s/.test(t) });
    const td = (t, align, opt = {}) => ({ text: t, fontSize: fs, margin: [2, 2.5, 2, 2.5], alignment: align, ...opt });

    const contenu = [
        { text: d.titre.toUpperCase(), fontSize: 12.5, bold: true, color: NAVY },
        d.reference ? { text: d.reference, fontSize: 7.5, color: '#64748b', margin: [0, 2, 0, 0] } : null,
        {
            columns: [
                { text: [
                    { text: (e.raisonSociale || '—') + '\n', bold: true, fontSize: 9 },
                    e.numeroContribuable ? { text: `NCC : ${e.numeroContribuable}   `, fontSize: 7.8 } : '',
                    e.numeroEmployeur ? { text: `N° employeur CNPS : ${e.numeroEmployeur}`, fontSize: 7.8 } : '',
                    { text: '\n' + [e.adresse, e.ville, e.telephone && `Tél : ${e.telephone}`].filter(Boolean).join(' · '), fontSize: 7.5, color: '#64748b' },
                    e.serviceAssiette ? { text: `\nService d’assiette : ${e.serviceAssiette}`, fontSize: 7.5, color: '#64748b' } : ''
                ] },
                { width: 170, alignment: 'right', text: [
                    { text: 'Période\n', fontSize: 7, color: '#64748b' },
                    { text: d.periode.libelle, bold: true, fontSize: 9 }
                ] }
            ], margin: [0, 8, 0, 8]
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: largeurPage, y2: 0, lineWidth: 1, lineColor: BORDER }], margin: [0, 0, 0, 8] }
    ];

    if (d.partielle) {
        contenu.push({
            table: { widths: ['*'], body: [[{ text: 'DOCUMENT PARTIEL — des données historiques manquent (bulletins antérieurs au suivi des déclarations). Vérifier avant dépôt.', fontSize: 7.5, bold: true, color: AMBRE, fillColor: '#fffbeb', margin: [6, 4, 6, 4] }]] },
            layout: 'noBorders', margin: [0, 0, 0, 8]
        });
    }

    const traits = { hLineColor: () => BORDER, vLineColor: () => BORDER, hLineWidth: () => 0.5, vLineWidth: () => 0.5 };
    for (const bloc of d.blocs) {
        contenu.push({ text: bloc.titre, fontSize: 8.5, bold: true, color: NAVY, margin: [0, 6, 0, 4] });
        if (bloc.paires) {
            contenu.push({
                table: { widths: ['*', 140], body: bloc.paires.map(([lib, val, format]) => [td(lib), td(texte(val, format), 'right', { bold: true })]) },
                layout: traits
            });
            continue;
        }
        const corps = [bloc.colonnes.map(c => th(c.libelle, c.align === 'right' ? 'right' : 'left'))];
        const cellule = (v, i, opt) => td(texte(v, bloc.colonnes[i].format), bloc.colonnes[i].align, { noWrap: bloc.colonnes[i].format !== 'txt', ...opt });
        for (const ligne of bloc.lignes) corps.push(ligne.map((v, i) => cellule(v, i)));
        if (bloc.total) corps.push(bloc.total.map((v, i) => cellule(v, i, { bold: true, fillColor: BAND })));
        // Seules les colonnes de libellé en tête de tableau s'étirent ; les autres prennent leur largeur utile.
        const largeurs = bloc.colonnes.map((c, i) => (c.format === 'txt' && i < 3) ? '*' : 'auto');
        contenu.push({ table: { headerRows: 1, widths: largeurs, body: corps }, layout: traits });
    }

    if (d.aPayer) {
        contenu.push({
            table: { widths: ['*', 150], body: [[
                { text: d.aPayer.libelle, bold: true, fontSize: 9, color: '#ffffff', fillColor: NAVY, margin: [6, 5, 6, 5] },
                { text: fcfa(d.aPayer.montant) + ' FCFA', bold: true, fontSize: 9.5, color: '#ffffff', fillColor: NAVY, alignment: 'right', margin: [6, 5, 6, 5] }
            ]] },
            layout: 'noBorders', margin: [0, 12, 0, 0]
        });
    }

    for (const note of d.notes || []) contenu.push({ text: note, fontSize: 6.8, color: '#64748b', margin: [0, 5, 0, 0] });
    if (d.avertissements?.length) {
        contenu.push({ text: 'Avertissements', fontSize: 8, bold: true, margin: [0, 12, 0, 3], color: AMBRE });
        contenu.push({ ul: d.avertissements.map(a => ({ text: a, fontSize: 7.5, color: AMBRE })) });
    }
    contenu.push({
        columns: [
            { text: `\nCertifié exact, le ${new Date().toLocaleDateString('fr-FR')}${e.ville ? ' à ' + e.ville : ''}`, fontSize: 7.5, color: '#64748b' },
            { text: `\n${e.signataireNom || ''}\nSignature et cachet`, fontSize: 7.5, alignment: 'right', color: '#64748b' }
        ], margin: [0, 16, 0, 0]
    });
    contenu.push({ text: 'Aide à la saisie sur e-Impôts / e-CNPS — ne remplace pas la déclaration en ligne officielle.', fontSize: 6.5, italics: true, color: '#94a3b8', margin: [0, 12, 0, 0] });

    return rendre({
        pageSize: 'A4', pageOrientation: d.paysage ? 'landscape' : 'portrait',
        pageMargins: d.paysage ? [28, 28, 28, 28] : [40, 34, 40, 34],
        content: contenu.filter(Boolean),
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    });
}

// ── XLSX / CSV ───────────────────────────────────────────────────────────
function aoaDepuis(d) {
    const e = d.entreprise || {};
    const aoa = [
        [d.titre], [d.reference || ''],
        [e.raisonSociale || '', '', `Période : ${d.periode.libelle}`],
        [e.numeroContribuable ? `NCC : ${e.numeroContribuable}` : '', '', e.numeroEmployeur ? `N° employeur CNPS : ${e.numeroEmployeur}` : ''],
        d.partielle ? ['⚠ DOCUMENT PARTIEL — certaines données historiques manquent, voir avertissements'] : [],
        []
    ];
    const valeur = (v, format) => (format === 'pct' && typeof v === 'number') ? pct(v) : v;
    for (const bloc of d.blocs) {
        aoa.push([bloc.titre]);
        if (bloc.paires) {
            for (const [lib, val, format] of bloc.paires) aoa.push([lib, valeur(val, format)]);
        } else {
            aoa.push(bloc.colonnes.map(c => c.libelle));
            for (const ligne of bloc.lignes) aoa.push(ligne.map((v, i) => valeur(v, bloc.colonnes[i].format)));
            if (bloc.total) aoa.push(bloc.total.map((v, i) => valeur(v, bloc.colonnes[i].format)));
        }
        aoa.push([]);
    }
    if (d.aPayer) aoa.push([d.aPayer.libelle, d.aPayer.montant], []);
    for (const note of d.notes || []) aoa.push([note]);
    if (d.avertissements?.length) aoa.push([], ['AVERTISSEMENTS'], ...d.avertissements.map(a => [a]));
    return aoa;
}

function documentXlsx(d) {
    const aoa = aoaDepuis(d);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const nbCol = Math.max(...aoa.map(r => r.length));
    ws['!cols'] = Array.from({ length: nbCol }, (_, i) => ({ wch: i === 0 ? 42 : 16 }));
    for (const ref of Object.keys(ws)) {
        if (ref[0] !== '!' && typeof ws[ref].v === 'number') ws[ref].z = '#,##0';
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, d.titre.replace(/[\\/?*[\]:]/g, '').slice(0, 31));
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function documentCsv(d) {
    const ws = XLSX.utils.aoa_to_sheet(aoaDepuis(d));
    return XLSX.utils.sheet_to_csv(ws, { FS: ';' });
}

module.exports = { documentPdf, documentXlsx, documentCsv };
