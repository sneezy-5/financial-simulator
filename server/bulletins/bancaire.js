// Modèle de bulletin « bancaire » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

/**
 * Cinquième modèle par défaut, style « reçu bancaire » : gains et retenues
 * dans deux tableaux CÔTE À CÔTE plutôt qu'un seul tableau large — courant
 * dans les bulletins émis par les banques/assurances à Abidjan, où le mode de
 * règlement occupe une place centrale.
 */
function generatePdfDefinitionBancaire(employee, calc, companyInfo = {}) {
    const TEAL = '#0f766e', BORDER = '#d1d5db', BAND = '#f0fdfa';
    const company = resolveCompanyInfo(employee, companyInfo);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);
    const totalPatronal = patronal.reduce((s, r) => s + (r.montant || 0), 0);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const { congesAcquis, congesReste, congesPris } = calculateCongesCounters(employee, calc, annee, moisNum);
    const periode = `${['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][moisNum] || ''} ${annee}`;

    const cell = (text, opts = {}) => ({ text: (text === null || text === undefined) ? '' : text.toString(), fontSize: opts.fontSize || 7, bold: opts.bold || false, alignment: opts.align || 'left', fillColor: opts.fill || null, color: opts.color || 'black', margin: opts.margin || [3, 2, 3, 2] });
    const headerCell = (text) => cell(text, { fill: TEAL, color: 'white', bold: true, align: 'center' });
    const ligne = (r) => [cell((r.code ? `${r.code}  ` : '') + r.label + (r.exonere ? ' (exo.)' : ''), { color: r.info ? '#9ca3af' : 'black' }), cell(fcfa(r.montant), { align: 'right', color: r.info ? '#9ca3af' : 'black' })];

    const bodyGains = [[headerCell('GAINS'), headerCell('')], ...gains.map(ligne), [cell('Total brut', { bold: true, fill: BAND }), cell(fcfa(calc.gainsTotaux), { align: 'right', bold: true, fill: BAND })]];
    const bodyRetenues = [[headerCell('RETENUES'), headerCell('')], ...retenues.map(ligne), [cell('Total retenues', { bold: true, fill: BAND }), cell(fcfa(calc.salarial.total), { align: 'right', bold: true, fill: BAND })]];

    return {
        pageSize: 'A4', pageMargins: [32, 32, 32, 32],
        content: [
            {
                columns: [
                    company.logo ? { image: company.logo, fit: [50, 34], width: 60 } : { width: 60, text: '' },
                    { width: '*', stack: [{ text: company.nom, fontSize: 11, bold: true, color: TEAL }, { text: [company.adresse, company.ville].filter(Boolean).join(', '), fontSize: 7, color: '#6b7280' }] },
                    { width: 150, stack: [{ text: 'BULLETIN DE PAIE', fontSize: 10, bold: true, alignment: 'right' }, { text: periode, fontSize: 8, alignment: 'right', color: '#6b7280' }] }
                ]
            },
            { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 531, y2: 6, lineWidth: 1.5, strokeColor: TEAL }] },
            { text: '', margin: [0, 8] },
            { text: `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}   —   ${employee.poste || ''}   —   Matricule ${employee.matricule || '____'}   —   N° CNPS ${employee.num_secu || employee.numero_cnps || '____'}`, fontSize: 7.5, margin: [0, 0, 0, 4] },
            { text: `Congés payés : Acquis ${congesAcquis || 0} j   ·   Pris ${congesPris || 0} j   ·   Reste à prendre ${congesReste || 0} j`, fontSize: 7, bold: true, color: TEAL, margin: [0, 0, 0, 8] },
            {
                columns: [
                    { width: '49%', table: { headerRows: 1, widths: ['70%', '30%'], body: bodyGains }, layout: { hLineWidth: (i, n) => (i <= 1 || i === n.table.body.length) ? 1 : 0.3, vLineWidth: () => 0, hLineColor: () => BORDER } },
                    { width: '2%', text: '' },
                    { width: '49%', table: { headerRows: 1, widths: ['70%', '30%'], body: bodyRetenues }, layout: { hLineWidth: (i, n) => (i <= 1 || i === n.table.body.length) ? 1 : 0.3, vLineWidth: () => 0, hLineColor: () => BORDER } }
                ]
            },
            { text: '', margin: [0, 10] },
            { text: `Charges patronales (information) : ${fcfa(totalPatronal)}     Coût employeur total : ${fcfa(calc.gainsTotaux + totalPatronal)}`, fontSize: 6.8, color: '#6b7280' },
            { text: '', margin: [0, 12] },
            {
                table: {
                    widths: ['*', 180],
                    body: [[
                        { stack: [{ text: 'MODE DE RÈGLEMENT', fontSize: 7, bold: true, color: TEAL }, { text: employee.virement ? `Virement bancaire${employee.rib ? `\nCompte : ${employee.rib}` : ''}` : 'Espèces', fontSize: 8, margin: [0, 3, 0, 0] }], fillColor: BAND, margin: [10, 10] },
                        { stack: [{ text: 'NET À PAYER', fontSize: 8, bold: true, alignment: 'center' }, { text: fcfa(calc.netAPayer) + ' F', fontSize: 16, bold: true, alignment: 'center', color: TEAL, margin: [0, 4, 0, 0] }], margin: [10, 10] }
                    ]]
                },
                layout: { hLineWidth: () => 1, vLineWidth: (i) => (i === 1 ? 1 : 0), hLineColor: () => TEAL, vLineColor: () => TEAL }
            },
            { text: '', margin: [0, 14] },
            { columns: [{ text: "Cachet & signature de l'employeur", fontSize: 6.5, alignment: 'center' }, { text: 'Signature du salarié', fontSize: 6.5, alignment: 'center' }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generatePdfDefinitionBancaire });
