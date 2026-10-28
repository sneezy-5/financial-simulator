// Modèle de bulletin « moderne » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

/**
 * Sixième modèle par défaut, style « cartes » moderne : sections en blocs
 * colorés distincts plutôt qu'un grand tableau — vise les entreprises qui
 * veulent un bulletin visuellement plus contemporain, sans rien perdre des
 * mentions légales.
 */
function generatePdfDefinitionModerne(employee, calc, companyInfo = {}) {
    const INDIGO = '#4338ca', SOFT = '#eef2ff', BORDER = '#e5e7eb';
    const company = resolveCompanyInfo(employee, companyInfo);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);
    const totalPatronal = patronal.reduce((s, r) => s + (r.montant || 0), 0);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const { congesAcquis, congesReste, congesPris } = calculateCongesCounters(employee, calc, annee, moisNum);
    const periode = `${['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][moisNum] || ''} ${annee}`;

    const card = (titre, contenu) => ({
        table: { widths: ['*'], body: [[{ text: titre, fontSize: 8, bold: true, color: 'white', fillColor: INDIGO, margin: [10, 5] }], [{ stack: contenu, margin: [10, 8] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0.75, vLineColor: () => BORDER, paddingLeft: () => 0, paddingRight: () => 0 }
    });
    const kv = (label, value) => ({ columns: [{ text: label, fontSize: 7, color: '#6b7280', width: 90 }, { text: (value || '').toString(), fontSize: 7.5, bold: true, width: '*' }], margin: [0, 1.5] });
    const ligneMontant = (r, couleur) => ({ columns: [{ text: (r.code ? `${r.code}  ` : '') + r.label + (r.exonere ? ' (exo.)' : ''), fontSize: 7, italics: !!r.info, color: r.info ? '#9ca3af' : undefined, width: '*' }, { text: fcfa(r.montant), fontSize: 7, bold: !r.info, alignment: 'right', color: r.info ? '#9ca3af' : couleur, width: 70 }], margin: [0, 1.5] });

    return {
        pageSize: 'A4', pageMargins: [30, 30, 30, 30],
        content: [
            {
                table: { widths: ['*'], body: [[{
                    columns: [
                        company.logo ? { image: company.logo, fit: [42, 28], width: 52 } : { width: 52, text: '' },
                        { width: '*', stack: [{ text: company.nom, fontSize: 11, bold: true, color: 'white' }, { text: [company.adresse, company.ville].filter(Boolean).join(', '), fontSize: 6.8, color: '#e0e7ff' }] },
                        { width: 150, stack: [{ text: 'BULLETIN DE PAIE', fontSize: 10, bold: true, alignment: 'right', color: 'white' }, { text: periode, fontSize: 7.5, alignment: 'right', color: '#e0e7ff' }] }
                    ],
                    margin: [12, 10]
                }]] },
                layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: INDIGO }
            },
            { text: '', margin: [0, 10] },
            card('IDENTITÉ DU SALARIÉ', [
                { columns: [{ stack: [kv('Nom', (employee.nom || '').toUpperCase()), kv('Prénoms', employee.prenom), kv('Emploi', employee.poste), kv('Matricule', employee.matricule)] }, { stack: [kv('N° CNPS', employee.num_secu || employee.numero_cnps), kv('Catégorie', employee.categorie), kv('Ancienneté', calc.ancienneteTxt), kv('Congés (Acq/Pris/Reste)', `${congesAcquis || 0}j / ${congesPris || 0}j / ${congesReste || 0}j`)] }] }
            ]),
            { text: '', margin: [0, 8] },
            {
                columns: [
                    { width: '49%', ...card('RÉMUNÉRATION', [...gains.map(r => ligneMontant(r, '#166534')), { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 235, y2: 4, lineWidth: 0.5, lineColor: BORDER }] }, { columns: [{ text: 'Total brut', fontSize: 7.5, bold: true, width: '*' }, { text: fcfa(calc.gainsTotaux), fontSize: 7.5, bold: true, alignment: 'right', width: 70 }], margin: [0, 3, 0, 0] }]) },
                    { width: '2%', text: '' },
                    { width: '49%', ...card('COTISATIONS', [...retenues.map(r => ligneMontant(r, '#dc2626')), { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 235, y2: 4, lineWidth: 0.5, lineColor: BORDER }] }, { columns: [{ text: 'Total retenues', fontSize: 7.5, bold: true, width: '*' }, { text: fcfa(calc.salarial.total), fontSize: 7.5, bold: true, alignment: 'right', color: '#dc2626', width: 70 }], margin: [0, 3, 0, 0] }, { text: `Charges patronales (info.) : ${fcfa(totalPatronal)}`, fontSize: 6.3, color: '#9ca3af', margin: [0, 4, 0, 0] }]) }
                ]
            },
            { text: '', margin: [0, 10] },
            {
                table: { widths: ['*', 170], body: [[
                    { stack: [{ text: 'MODE DE RÈGLEMENT', fontSize: 6.8, bold: true, color: INDIGO }, { text: employee.virement ? `Virement bancaire${employee.rib ? ` — ${employee.rib}` : ''}` : 'Espèces', fontSize: 7.5, margin: [0, 3, 0, 0] }], margin: [12, 10] },
                    { stack: [{ text: 'NET À PAYER', fontSize: 7.5, bold: true, alignment: 'center', color: 'white' }, { text: fcfa(calc.netAPayer) + ' F', fontSize: 15, bold: true, alignment: 'center', color: 'white', margin: [0, 3, 0, 0] }], fillColor: INDIGO, margin: [10, 8] }
                ]] },
                layout: { hLineWidth: () => 0.75, vLineWidth: () => 0, hLineColor: () => BORDER }
            },
            { text: '', margin: [0, 14] },
            { columns: [{ text: "Cachet & signature de l'employeur", fontSize: 6.5, alignment: 'center', color: '#6b7280' }, { text: 'Signature du salarié', fontSize: 6.5, alignment: 'center', color: '#6b7280' }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generatePdfDefinitionModerne });
