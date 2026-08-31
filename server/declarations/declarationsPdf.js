// ═══════════════════════════════════════════════════════════════════════════
// DÉCLARATIONS — SORTIE PDF (pdfmake)
//
// Mise en page inspirée des feuilles LOGIPAIE 27 (bordereau) et 26 (liste
// nominative). Sortie imprimable, à recopier sur e-CNPS — ce n'est pas une
// télédéclaration.
// ═══════════════════════════════════════════════════════════════════════════

const PdfPrinter = require('pdfmake');

const fonts = {
    Roboto: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' }
};
const printer = new PdfPrinter(fonts);

const NAVY = '#1e3a5f';
const BAND = '#eef2f7';
const BORDER = '#c3c2b7';

const fcfa = (v) => (v === null || v === undefined || isNaN(v)) ? '—'
    : Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pct = (t) => (Math.round(t * 10000) / 100).toString().replace('.', ',') + ' %';

function rendre(docDefinition) {
    return new Promise((resolve, reject) => {
        try {
            const doc = printer.createPdfKitDocument(docDefinition);
            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            doc.end();
        } catch (e) { reject(e); }
    });
}

function bandeauPartielle(d) {
    if (!d.partielle) return null;
    return {
        table: { widths: ['*'], body: [[{
            text: 'DÉCLARATION PARTIELLE — des données historiques manquent (bulletins antérieurs au suivi des déclarations). Vérifier avant dépôt.',
            fontSize: 7.5, bold: true, color: '#92400e', fillColor: '#fffbeb', margin: [6, 4, 6, 4]
        }]] },
        layout: 'noBorders', margin: [0, 0, 0, 8]
    };
}

function entete(d) {
    const e = d.entreprise;
    return [
        { text: d.titre.toUpperCase(), fontSize: 13, bold: true, color: NAVY },
        {
            columns: [
                { text: [
                    { text: (e.raisonSociale || '—') + '\n', bold: true, fontSize: 9 },
                    { text: `N° Employeur : ${e.numeroEmployeur || '—'}\n`, fontSize: 8 },
                    e.codeEtablissement ? { text: `Code établissement : ${e.codeEtablissement}   Code activité : ${e.codeActivite || '—'}\n`, fontSize: 8 } : {},
                    { text: (e.adresse || '') + (e.telephone ? `   Tél : ${e.telephone}` : ''), fontSize: 8, color: '#64748b' }
                ] },
                { width: 160, text: [
                    { text: 'Période\n', fontSize: 7, color: '#64748b' },
                    { text: d.periode.libelle + '\n', bold: true, fontSize: 9 },
                    { text: d.periode.type === 'trimestriel' ? 'Versement trimestriel' : 'Versement mensuel', fontSize: 7.5, color: '#64748b' }
                ], alignment: 'right' }
            ], margin: [0, 6, 0, 8]
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: BORDER }], margin: [0, 0, 0, 8] }
    ];
}

function th(t, align) { return { text: t, bold: true, fontSize: 7.5, fillColor: BAND, margin: [3, 3, 3, 3], alignment: align || 'left' }; }
function td(t, align, opt = {}) { return { text: t, fontSize: 7.5, margin: [3, 2.5, 3, 2.5], alignment: align || 'left', ...opt }; }

// ── Bordereau CNPS (feuille 27) ──
async function bordereauCnpsPdf(d) {
    const catBody = [[th('Catégorie de salaires'), th('Nb salariés', 'center'), th('Base retraite', 'right'), th('Base PF / AT / AM', 'right')]];
    for (const c of d.categories) {
        catBody.push([td(c.libelle), td(String(c.effectif), 'center'), td(fcfa(c.baseRetraite), 'right'), td(fcfa(c.basePfAt), 'right')]);
    }
    catBody.push([
        td('TOTAL', 'left', { bold: true, fillColor: BAND }),
        td(String(d.effectifCotisant), 'center', { bold: true, fillColor: BAND }),
        td(fcfa(d.totaux.baseRetraite), 'right', { bold: true, fillColor: BAND }),
        td(fcfa(d.totaux.basePfAt), 'right', { bold: true, fillColor: BAND })
    ]);

    const dec = d.decompte;
    const decBody = [[th('Rubrique'), th('Base cotisable', 'right'), th('Taux', 'center'), th('Montant (FCFA)', 'right')]];
    const lignesDec = [
        ['Assurance Maternité', dec.assuranceMaternite],
        ['Prestations Familiales', dec.prestationsFamiliales],
        ['Accidents du Travail', dec.accidentsTravail],
        ['Régime de Retraite (7,7 % emp. + 6,3 % sal.)', dec.regimeRetraite]
    ];
    for (const [lib, r] of lignesDec) {
        decBody.push([td(lib), td(fcfa(r.base), 'right'), td(pct(r.taux), 'center'), td(fcfa(r.montant), 'right')]);
    }
    decBody.push([
        td('TOTAL COTISATIONS À PAYER', 'left', { bold: true, fillColor: BAND, colSpan: 3 }), {}, {},
        td(fcfa(dec.total), 'right', { bold: true, fillColor: BAND })
    ]);

    const content = [
        ...entete(d),
        bandeauPartielle(d),
        { columns: [
            { text: `Total salaires bruts payés sur la période : ${fcfa(d.totalBrutPaye)} FCFA`, fontSize: 8, bold: true },
            { text: `Effectif : ${d.effectifCotisant} / ${d.effectifTotal}`, fontSize: 8, alignment: 'right' }
        ], margin: [0, 0, 0, 8] },
        { text: 'SALAIRES BRUTS SOUMIS À COTISATION', fontSize: 8.5, bold: true, color: NAVY, margin: [0, 2, 0, 4] },
        { table: { widths: ['*', 60, 100, 100], body: catBody }, layout: { hLineColor: () => BORDER, vLineColor: () => BORDER, hLineWidth: () => 0.5, vLineWidth: () => 0.5 } },
        { text: 'DÉCOMPTE DES COTISATIONS DUES', fontSize: 8.5, bold: true, color: NAVY, margin: [0, 12, 0, 4] },
        { table: { widths: ['*', 100, 60, 100], body: decBody }, layout: { hLineColor: () => BORDER, vLineColor: () => BORDER, hLineWidth: () => 0.5, vLineWidth: () => 0.5 } }
    ];

    if (d.avertissements && d.avertissements.length) {
        content.push({ text: 'Avertissements', fontSize: 8, bold: true, margin: [0, 14, 0, 3], color: '#92400e' });
        content.push({ ul: d.avertissements.map(a => ({ text: a, fontSize: 7.5, color: '#92400e' })) });
    }

    content.push({
        columns: [
            { text: '\n\nBordereau certifié exact,\n\nLe ' + new Date().toLocaleDateString('fr-FR') + (d.entreprise.ville ? ' à ' + d.entreprise.ville : ''), fontSize: 7.5, color: '#64748b' },
            { text: '\n\n\n' + (d.entreprise.signataireNom || '') + '\nSignature et cachet', fontSize: 7.5, alignment: 'right', color: '#64748b' }
        ], margin: [0, 20, 0, 0]
    });
    content.push({ text: 'Aide à la saisie sur e-CNPS — ne remplace pas la déclaration en ligne officielle.', fontSize: 6.5, italics: true, color: '#94a3b8', margin: [0, 16, 0, 0] });

    return rendre({ pageSize: 'A4', pageMargins: [40, 34, 40, 34], content, defaultStyle: { font: 'Roboto', fontSize: 8 } });
}

// ── Liste nominative CNPS (feuille 26) ──
async function listeNominativeCnpsPdf(d) {
    const head = ['N°', 'N° CNPS', 'Nom', 'Prénoms', 'Né(e)', 'Embauche', 'Départ', 'Type', 'Durée', 'Salaire brut', 'Branches']
        .map(t => th(t, t === 'Salaire brut' || t === 'Durée' ? 'right' : 'left'));
    const body = [head];
    for (const s of d.salaries) {
        body.push([
            td(String(s.ordre)), td(s.numeroCnps || '—'), td(s.nom), td(s.prenoms),
            td(String(s.anneeNaissance || '—')), td(s.dateEmbauche || '—'), td(s.dateDepart || ''),
            td(s.typeSalarie, 'center'), td(String(s.dureeTravaillee), 'right'),
            td(fcfa(s.salaireBrut), 'right'), td(s.branchesCotisees, 'center')
        ]);
    }
    body.push([
        td(`TOTAL — ${d.total.effectif} salarié(s)`, 'left', { bold: true, fillColor: BAND, colSpan: 9 }),
        {}, {}, {}, {}, {}, {}, {}, {},
        td(fcfa(d.total.salaireBrut), 'right', { bold: true, fillColor: BAND }),
        td('', 'center', { fillColor: BAND })
    ]);

    const content = [
        ...entete(d),
        bandeauPartielle(d),
        { table: { headerRows: 1, widths: [16, 58, '*', '*', 28, 46, 40, 26, 28, 58, 34], body },
          layout: { hLineColor: () => BORDER, vLineColor: () => BORDER, hLineWidth: () => 0.4, vLineWidth: () => 0.4 } },
        { text: 'Branches cotisées : 1 = Retraite · 2 = Accidents du travail / maladies pro · 3 = Prestations familiales + Assurance maternité', fontSize: 6.8, color: '#64748b', margin: [0, 6, 0, 0] }
    ];
    if (d.avertissements && d.avertissements.length) {
        content.push({ text: 'Avertissements', fontSize: 8, bold: true, margin: [0, 12, 0, 3], color: '#92400e' });
        content.push({ ul: d.avertissements.map(a => ({ text: a, fontSize: 7.5, color: '#92400e' })) });
    }

    return rendre({ pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [28, 30, 28, 30], content, defaultStyle: { font: 'Roboto', fontSize: 8 } });
}

module.exports = { bordereauCnpsPdf, listeNominativeCnpsPdf };
