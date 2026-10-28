// Modèle de bulletin « compact » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

/**
 * Troisième modèle par défaut, format « compact » (inspiré des bulletins Sage
 * Paie / petites structures) : une seule colonne de montants, gains et
 * retenues à la suite plutôt que côte à côte — le plus dense des modèles
 * proposés, pensé pour tenir sur une demi-page.
 */
function generatePdfDefinitionCompact(employee, calc, companyInfo = {}) {
    const BLUE = '#1e3a8a', BORDER = '#e2e8f0', BAND = '#f1f5f9';
    const company = resolveCompanyInfo(employee, companyInfo);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const { congesAcquis, congesReste, congesPris } = calculateCongesCounters(employee, calc, annee, moisNum);
    const periode = `${['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][moisNum] || ''} ${annee}`;

    const headerCols = [];
    if (company.logo) headerCols.push({ image: company.logo, fit: [45, 30], width: 55 });
    headerCols.push({ width: '*', stack: [{ text: company.nom, fontSize: 11, bold: true, color: BLUE }, { text: [company.adresse, company.ville].filter(Boolean).join(' — '), fontSize: 7, color: '#64748b' }] });
    headerCols.push({ width: 140, stack: [{ text: 'BULLETIN DE PAIE', fontSize: 10, bold: true, alignment: 'right' }, { text: periode, fontSize: 8, alignment: 'right', color: '#64748b' }] });

    const infoLine = `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}  ·  ${employee.poste || ''}  ·  Matricule ${employee.matricule || '____'}  ·  N° CNPS ${employee.num_secu || employee.numero_cnps || '____'}`;

    const cell = (text, opts = {}) => ({ text: (text === null || text === undefined) ? '' : text.toString(), fontSize: opts.fontSize || 7.2, bold: opts.bold || false, alignment: opts.align || 'left', fillColor: opts.fill || null, color: opts.color || 'black', margin: opts.margin || [3, 2, 3, 2] });
    const ligneSection = (titre) => [cell('', { fill: BAND }), cell(titre, { bold: true, fill: BAND, colSpan: 4 }), {}, {}, {}];
    const ligneMontant = (r, signe = 1) => {
        // Une ligne « info » (ex. RICF) est une précision, pas une retenue en
        // plus : elle s'affiche toujours en positif, quel que soit le signe
        // demandé pour le reste de la section.
        const s = r.info ? 1 : signe;
        return [
            cell(r.code || '', { align: 'center', color: r.info ? '#94a3b8' : '#64748b' }),
            cell((r.info ? '   ' : '') + r.label + (r.exonere ? ' (exonérée)' : ''), { color: r.info ? '#64748b' : 'black', italics: !!r.info }),
            cell(r.base !== undefined ? fcfa(r.base) : '', { align: 'right', color: '#94a3b8' }),
            cell(r.taux || '', { align: 'center', color: '#94a3b8' }),
            cell(fcfa(r.montant * s), { align: 'right', color: r.info ? '#64748b' : (s < 0 ? '#dc2626' : '#0f172a') })
        ];
    };

    const body = [
        [cell('N°', { bold: true, align: 'center' }), cell('LIBELLÉ', { bold: true }), cell('BASE', { bold: true, align: 'right' }), cell('TAUX', { bold: true, align: 'center' }), cell('MONTANT', { bold: true, align: 'right' })],
        ligneSection('GAINS'),
        ...gains.map(r => ligneMontant(r)),
        [cell('', { fill: BAND }), cell('Total brut', { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell(fcfa(calc.gainsTotaux), { align: 'right', bold: true, fill: BAND })],
        ligneSection('RETENUES SALARIALES'),
        ...retenues.map(r => ligneMontant(r, -1)),
        [cell('', { fill: BAND }), cell('Total retenues', { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell(fcfa(-calc.salarial.total), { align: 'right', bold: true, color: '#dc2626', fill: BAND })],
        ligneSection('CHARGES PATRONALES (pour information)'),
        ...patronal.map(r => ligneMontant(r)),
        [cell('', { fill: BAND }), cell('Total charges patronales', { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell(fcfa(calc.patronal.grandTotal), { align: 'right', bold: true, fill: BAND })]
    ];

    return {
        pageSize: 'A4', pageMargins: [32, 32, 32, 32],
        content: [
            { columns: headerCols },
            { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 531, y2: 6, lineWidth: 1, strokeColor: BORDER }] },
            { text: infoLine, fontSize: 7.5, margin: [0, 8, 0, 10] },
            { table: { headerRows: 1, widths: ['7%', '41%', '16%', '12%', '24%'], body }, layout: { hLineWidth: (i, n) => (i === 0 || i === 1 || i === n.table.body.length) ? 1 : 0.3, vLineWidth: () => 0, hLineColor: () => BORDER } },
            { text: '', margin: [0, 10] },
            {
                columns: [
                    { width: '*', text: `Net imposable : ${fcfa(calc.brutImposable)}     Coût employeur total : ${fcfa(calc.gainsTotaux + calc.patronal.grandTotal)}`, fontSize: 6.8, color: '#64748b', margin: [0, 10, 0, 0] },
                    { width: 170, table: { widths: ['*'], body: [[{ text: 'NET À PAYER', fontSize: 8, bold: true, alignment: 'center' }], [{ text: fcfa(calc.netAPayer) + ' F', fontSize: 15, bold: true, alignment: 'center', fillColor: '#FFFF00', margin: [0, 4] }]] }, layout: { hLineWidth: () => 1.2, vLineWidth: () => 1.2, hLineColor: () => '#000', vLineColor: () => '#000' } }
                ]
            },
            { text: `Congés payés — Acquis : ${congesAcquis || 0} j   ·   Pris : ${congesPris || 0} j   ·   Reste à prendre : ${congesReste || 0} j`, fontSize: 6.8, margin: [0, 6, 0, 0], color: '#1e3a8a', bold: true },
            { text: `Mode de règlement : ${employee.virement ? `Virement bancaire${employee.rib ? ` — ${employee.rib}` : ''}` : 'Espèces'}`, fontSize: 6.8, margin: [0, 4, 0, 0], color: '#64748b' },
            { text: '', margin: [0, 14] },
            { columns: [{ text: 'Signature Employeur', fontSize: 6.5, alignment: 'center' }, { text: 'Signature Salarié', fontSize: 6.5, alignment: 'center' }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generatePdfDefinitionCompact });
