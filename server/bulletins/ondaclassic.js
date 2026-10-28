// Modèle de bulletin « ondaclassic » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

/**
 * Quatrième modèle par défaut, inspiré de la mise en page LOGIPAIE : bloc
 * salarié en grille dense, gains/retenues salariales dans un tableau, charges
 * patronales dans un second tableau SÉPARÉ en bas de page — LOGIPAIE ne les
 * mélange jamais sur la même ligne, contrairement au modèle « Grille numérotée ».
 */
function generatePdfDefinitionLogipaie(employee, calc, companyInfo = {}) {
    const NAVY = '#0f172a', BORDER = '#94a3b8', BAND = '#e2e8f0';
    const company = resolveCompanyInfo(employee, companyInfo);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const { congesAcquis, congesReste, congesPris } = calculateCongesCounters(employee, calc, annee, moisNum);
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periode = `01/${String(moisNum).padStart(2, '0')}/${annee} au ${dernierJour}/${String(moisNum).padStart(2, '0')}/${annee}`;

    const cell = (text, opts = {}) => ({ text: (text === null || text === undefined) ? '' : text.toString(), fontSize: opts.fontSize || 6.8, bold: opts.bold || false, alignment: opts.align || 'left', fillColor: opts.fill || null, color: opts.color || 'black', colSpan: opts.colSpan || null, margin: opts.margin || [2, 2, 2, 2] });
    const headerCell = (text) => cell(text, { fill: NAVY, color: 'white', bold: true, align: 'center' });

    const grilleSalarie = {
        table: {
            widths: ['16%', '34%', '16%', '34%'],
            body: [
                [cell('Matricule', { bold: true, fill: BAND }), cell(employee.matricule || '____'), cell('N° CNPS', { bold: true, fill: BAND }), cell(employee.num_secu || employee.numero_cnps || '____')],
                [cell('Nom', { bold: true, fill: BAND }), cell((employee.nom || '').toUpperCase()), cell('Prénoms', { bold: true, fill: BAND }), cell(employee.prenom || '')],
                [cell('Emploi', { bold: true, fill: BAND }), cell(employee.poste || ''), cell('Catégorie', { bold: true, fill: BAND }), cell(employee.categorie || '')],
                [cell('Date embauche', { bold: true, fill: BAND }), cell(employee.date_embauche ? formatDate(employee.date_embauche) : ''), cell('Ancienneté', { bold: true, fill: BAND }), cell(calc.ancienneteTxt || '')],
                [cell('Situation familiale', { bold: true, fill: BAND }), cell({ celibataire: 'Célibataire', marie: 'Marié(e)', divorce: 'Divorcé(e)', veuf: 'Veuf/Veuve' }[employee.situation_matrimoniale] || employee.situation_matrimoniale || ''), cell('Parts IGR', { bold: true, fill: BAND }), cell(calc.parts !== undefined ? calc.parts.toFixed(1) : '1.0')],
                [cell('Congés acquis / reste', { bold: true, fill: BAND }), cell(`${congesAcquis || 0} j  (Reste : ${congesReste || 0} j)`), cell('Congés pris', { bold: true, fill: BAND }), cell(`${congesPris || 0} j`)]
            ]
        },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER }
    };

    const ligne = (r, retenue = false) => [
        cell(r.code || '', { align: 'center', color: '#64748b' }),
        cell(r.label + (r.exonere ? ' (exo.)' : '')),
        cell(r.base !== undefined ? fcfa(r.base) : '', { align: 'right' }),
        cell(r.taux || '', { align: 'center' }),
        cell(fcfa(Math.abs(r.montant)), { align: 'right', color: retenue ? '#dc2626' : '#166534', bold: r.info })
    ];

    const bodyPaie = [[headerCell('N°'), headerCell('Rubrique'), headerCell('Base'), headerCell('Taux'), headerCell('Montant')]];
    bodyPaie.push([cell('GAINS', { bold: true, fill: BAND, colSpan: 5 }), {}, {}, {}, {}]);
    gains.forEach(r => bodyPaie.push(ligne(r)));
    bodyPaie.push([cell('TOTAL BRUT', { bold: true, fill: BAND, colSpan: 4 }), {}, {}, {}, cell(fcfa(calc.gainsTotaux), { align: 'right', bold: true, fill: BAND })]);
    bodyPaie.push([cell('RETENUES', { bold: true, fill: BAND, colSpan: 5 }), {}, {}, {}, {}]);
    retenues.forEach(r => bodyPaie.push(ligne(r, !r.info)));
    bodyPaie.push([cell('TOTAL RETENUES', { bold: true, fill: BAND, colSpan: 4 }), {}, {}, {}, cell(fcfa(calc.salarial.total), { align: 'right', bold: true, color: '#dc2626', fill: BAND })]);

    const bodyPatronal = [[headerCell('N°'), headerCell('Charge patronale'), headerCell('Base'), headerCell('Taux'), headerCell('Montant')]];
    patronal.forEach(r => bodyPatronal.push(ligne(r)));
    bodyPatronal.push([cell('TOTAL CHARGES PATRONALES', { bold: true, fill: BAND, colSpan: 4 }), {}, {}, {}, cell(fcfa(calc.patronal.grandTotal), { align: 'right', bold: true, fill: BAND })]);

    return {
        pageSize: 'A4', pageMargins: [32, 32, 32, 32],
        content: [
            {
                columns: [
                    company.logo ? { image: company.logo, fit: [60, 40], width: 70 } : { width: 70, text: '' },
                    { width: '*', stack: [{ text: company.nom, fontSize: 11, bold: true }, { text: company.adresse, fontSize: 6.8, color: '#475569' }, { text: `CNPS ${company.cnps}  ·  Contribuable ${company.contribuable}`, fontSize: 6.5, color: '#475569' }] },
                    { width: 150, stack: [{ text: 'BULLETIN DE PAIE', fontSize: 10, bold: true, alignment: 'right', color: NAVY }, { text: `Du ${periode}`, fontSize: 7, alignment: 'right', color: '#475569' }] }
                ]
            },
            { text: '', margin: [0, 6] },
            grilleSalarie,
            { text: '', margin: [0, 8] },
            { table: { headerRows: 1, widths: ['7%', '39%', '16%', '12%', '24%'], body: bodyPaie }, layout: { hLineWidth: (i, n) => (i <= 1 || i === n.table.body.length) ? 1 : 0.3, vLineWidth: () => 0.3, hLineColor: () => BORDER, vLineColor: () => BORDER } },
            { text: '', margin: [0, 10] },
            { text: 'CHARGES PATRONALES', fontSize: 7.5, bold: true, color: NAVY, margin: [0, 0, 0, 3] },
            { table: { headerRows: 1, widths: ['7%', '39%', '16%', '12%', '24%'], body: bodyPatronal }, layout: { hLineWidth: (i, n) => (i <= 1 || i === n.table.body.length) ? 1 : 0.3, vLineWidth: () => 0.3, hLineColor: () => BORDER, vLineColor: () => BORDER } },
            { text: '', margin: [0, 10] },
            {
                columns: [
                    { width: '*', text: `Mode de règlement : ${employee.virement ? 'Virement bancaire' : 'Espèces'}`, fontSize: 7, margin: [0, 10, 0, 0], color: '#475569' },
                    { width: 170, table: { widths: ['*'], body: [[{ text: 'NET À PAYER', fontSize: 8, bold: true, alignment: 'center' }], [{ text: fcfa(calc.netAPayer) + ' F', fontSize: 15, bold: true, alignment: 'center', fillColor: '#FFFF00', margin: [0, 4] }]] }, layout: { hLineWidth: () => 1.2, vLineWidth: () => 1.2, hLineColor: () => '#000', vLineColor: () => '#000' } }
                ]
            },
            { text: '', margin: [0, 12] },
            { columns: [{ text: 'Cachet et signature de l\'employeur', fontSize: 6.5, alignment: 'center' }, { text: 'Signature du salarié (précédée de « lu et approuvé »)', fontSize: 6.5, alignment: 'center' }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generatePdfDefinitionLogipaie });
