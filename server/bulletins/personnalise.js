// Modèle de bulletin « personnalise » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

/**
 * Onzième modèle, seul modèle « paramétrable » : même structure sobre que
 * generatePdfDefinition (Classique), mais la couleur d'accent (bandeaux
 * d'en-tête, sous-totaux) est celle choisie par le compte dans Paramètres
 * (companyInfo.bulletinCouleur) plutôt qu'une couleur figée dans le code —
 * un calque de couleur sur un gabarit neutre, pas un bulletin de plus.
 * Sans couleur enregistrée, retombe sur un bleu par défaut.
 */
function generatePdfDefinitionPersonnalise(employee, calc, companyInfo = {}) {
    const ACCENT = /^#[0-9a-fA-F]{6}$/.test(companyInfo.bulletinCouleur || '') ? companyInfo.bulletinCouleur : '#1e3a8a';
    // Teintes dérivées de l'accent pour les bandeaux clairs (sous-totaux) et
    // moyens (sous-groupes), en gardant le même calcul que les couleurs fixes
    // choisies pour les autres modèles (bandeau clair mais net, pas un gris
    // presque blanc).
    const hexToRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const [r, g, b] = hexToRgb(ACCENT);
    const mix = (v, ratio) => Math.round(v + (255 - v) * ratio);
    const teinte = (ratio) => `#${[r, g, b].map(v => mix(v, ratio).toString(16).padStart(2, '0')).join('')}`;
    const BAND = teinte(0.82);
    const SUBHEADER = teinte(0.35);

    const company = resolveCompanyInfo(employee, companyInfo);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);
    const totalPatronal = patronal.reduce((s, r) => s + (r.montant || 0), 0);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const { congesAcquis, congesReste, congesPris } = calculateCongesCounters(employee, calc, annee, moisNum);
    const periode = `${['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][moisNum] || ''} ${annee}`;

    const cell = (text, opts = {}) => ({
        text: (text === null || text === undefined) ? '' : text.toString(),
        fontSize: opts.fontSize || 6.8, bold: opts.bold || false, alignment: opts.align || 'left',
        fillColor: opts.fill || null, color: opts.color || 'black', colSpan: opts.colSpan || null,
        margin: opts.margin || [2, 2, 2, 2]
    });
    const headerCell = (text, opts = {}) => cell(text, { fill: ACCENT, color: 'white', bold: true, align: 'center', fontSize: 6.8, ...opts });
    const infoRow = (label, value) => [
        { text: label, fontSize: 7, color: '#475569', margin: [0, 1.5, 0, 1.5] },
        { text: (value || '').toString(), fontSize: 7, bold: true, margin: [0, 1.5, 0, 1.5] }
    ];

    const body = [[headerCell('N°'), headerCell('Désignation'), headerCell('Base'), headerCell('Taux'), headerCell('Gains'), headerCell('Retenues')]];
    const ligneGain = (r) => [cell(r.code || ''), cell(r.label), cell(r.base !== undefined && r.base !== null ? fcfa(r.base) : '', { align: 'right' }), cell(r.taux || '', { align: 'center' }), cell(fcfa(r.montant), { align: 'right' }), cell('')];
    const ligneRetenue = (r) => [cell(r.code || ''), cell(r.label + (r.info ? ' (info.)' : '')), cell(r.base !== undefined && r.base !== null ? fcfa(r.base) : '', { align: 'right' }), cell(r.taux || '', { align: 'center' }), cell(''), cell(r.info ? '' : fcfa(r.montant), { align: 'right' })];
    gains.forEach(r => body.push(ligneGain(r)));
    body.push([cell('', { fill: BAND }), cell('TOTAL BRUT', { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell(fcfa(calc.gainsTotaux), { align: 'right', bold: true, fill: BAND }), cell('', { fill: BAND })]);
    retenues.forEach(r => body.push(ligneRetenue(r)));
    body.push([cell('', { fill: BAND }), cell('TOTAL RETENUES', { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell(fcfa(calc.salarial.total), { align: 'right', bold: true, fill: BAND })]);

    return {
        pageSize: 'A4', pageMargins: [30, 30, 30, 30],
        content: [
            {
                table: { widths: ['*'], body: [[{
                    columns: [
                        company.logo ? { image: company.logo, fit: [42, 28], width: 52 } : { width: 52, text: '' },
                        { width: '*', stack: [{ text: company.nom, fontSize: 11, bold: true, color: 'white' }, { text: [company.adresse, company.ville].filter(Boolean).join(', '), fontSize: 6.8, color: 'white' }] },
                        { width: 150, stack: [{ text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', fontSize: 10, bold: true, alignment: 'right', color: 'white' }, { text: periode, fontSize: 7.5, alignment: 'right', color: 'white' }] }
                    ],
                    margin: [12, 10]
                }]] },
                layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: ACCENT }
            },
            { text: '', margin: [0, 8] },
            {
                columns: [
                    { width: '50%', table: { widths: ['40%', '60%'], body: [infoRow('Nom', (employee.nom || '').toUpperCase()), infoRow('Prénoms', employee.prenom), infoRow('Emploi', employee.poste), infoRow('Matricule', employee.matricule)] }, layout: 'noBorders' },
                    { width: '50%', table: { widths: ['46%', '54%'], body: [infoRow('N° CNPS', employee.num_secu || employee.numero_cnps), infoRow('Catégorie', employee.categorie), infoRow('Ancienneté', calc.ancienneteTxt), infoRow('Congés payés', `${congesAcquis || 0}j acq. / ${congesPris || 0}j pris / ${congesReste || 0}j reste`)] }, layout: 'noBorders' }
                ],
                columnGap: 16
            },
            { text: '', margin: [0, 8] },
            {
                table: { headerRows: 1, widths: ['6%', '32%', '13%', '9%', '20%', '20%'], body },
                layout: { hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.4, vLineWidth: () => 0.4, hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1' }
            },
            { text: '', margin: [0, 8] },
            { text: `Charges patronales (info.) : ${fcfa(totalPatronal)} F`, fontSize: 6.5, color: '#6b7280' },
            { text: '', margin: [0, 6] },
            {
                table: { widths: ['*', 170], body: [[
                    { stack: [{ text: 'MODE DE RÈGLEMENT', fontSize: 6.8, bold: true, color: ACCENT }, { text: employee.virement ? `Virement bancaire${employee.rib ? ` — ${employee.rib}` : ''}` : 'Espèces', fontSize: 7.5, margin: [0, 3, 0, 0] }], margin: [12, 10] },
                    { stack: [{ text: 'NET À PAYER', fontSize: 7.5, bold: true, alignment: 'center', color: 'white' }, { text: fcfa(calc.netAPayer) + ' F', fontSize: 15, bold: true, alignment: 'center', color: 'white', margin: [0, 3, 0, 0] }], fillColor: ACCENT, margin: [10, 8] }
                ]] },
                layout: { hLineWidth: () => 0.75, vLineWidth: () => 0, hLineColor: () => '#cbd5e1' }
            },
            { text: '', margin: [0, 14] },
            { columns: [{ text: "Cachet & signature de l'employeur", fontSize: 6.5, alignment: 'center', color: '#6b7280' }, { text: 'Signature du salarié', fontSize: 6.5, alignment: 'center', color: '#6b7280' }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generatePdfDefinitionPersonnalise });
