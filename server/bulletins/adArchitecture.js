// Modèle de bulletin « adArchitecture » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

/**
 * Huitième modèle par défaut, réplique fidèle d'un bulletin réel (A.D.
 * ARCHITECTURE) : boîtes « PÉRIODE DE PAIE » / « DATE DE PAIE » / « TYPE DE
 * PAIE » en en-tête, boîte « CUMULS ANNUELS », résumé GAINS/RETENUES/NET À
 * PAYER, et pied RÈGLEMENT/BILLETAGE (décompte des coupures en espèces).
 *
 * Le bulletin d'origine affiche I.S./C.N./I.G.R. (ancien régime fiscal) dans
 * ses cumuls annuels ; conformément à la réforme 2024, ce modèle affiche
 * l'ITS qui les a remplacés plutôt que de reproduire des libellés obsolètes.
 */
function generatePdfDefinitionADArchitecture(employee, calc, companyInfo = {}) {
    const BORDER = '#000000';
    // Violet (thème « cumuls/administratif »), avec un bandeau franc pour les
    // sous-totaux — pas un gris sur gris, voir la même remarque sur
    // generatePdfDefinitionLavandiere ci-dessus.
    const VIOLET = '#6d28d9';
    const BAND = '#ddd6fe';
    const company = resolveCompanyInfo(employee, companyInfo);
    const codes = resolveCodesRubrique(companyInfo.rubriqueCodes);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const { congesAcquis, congesReste, congesPris } = calculateCongesCounters(employee, calc, annee, moisNum);
    const cumuls = calculateCumuls(employee, calc, annee);
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periodeDebut = `01/${String(moisNum).padStart(2, '0')}/${String(annee).slice(-2)}`;
    const periodeFin = `${dernierJour}/${String(moisNum).padStart(2, '0')}/${String(annee).slice(-2)}`;

    const box = (contenu, opts = {}) => ({
        table: { widths: ['*'], body: [[{ stack: contenu, margin: opts.margin || [6, 5] }]] },
        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER }
    });
    const kv = (label, value, opts = {}) => ({ columns: [{ text: label, fontSize: 6.6, width: opts.labelWidth || 100 }, { text: (value === undefined || value === null || value === '') ? '' : value.toString(), fontSize: 6.6, bold: true, width: '*' }], margin: [0, 1] });

    const cell = (text, opts = {}) => ({
        text: (text === null || text === undefined) ? '' : text.toString(),
        fontSize: opts.fontSize || 6.6, bold: opts.bold || false, alignment: opts.align || 'left',
        fillColor: opts.fill || null, colSpan: opts.colSpan || null, margin: opts.margin || [2, 1.5, 2, 1.5]
    });
    const headerCell = (text) => cell(text, { fill: VIOLET, color: 'white', bold: true, align: 'center', fontSize: 6.6 });

    const ligne = (numero, label, base, taux, gain, retenue) => [
        cell(numero || ''), cell(label),
        cell(base !== undefined && base !== null ? fcfa(base) : '', { align: 'right' }),
        cell(taux || '', { align: 'center' }),
        cell(gain !== undefined && gain !== null ? fcfa(gain) : '', { align: 'right' }),
        cell(retenue !== undefined && retenue !== null ? fcfa(retenue) : '', { align: 'right' })
    ];
    const bandRow = (label, gain, retenue) => [
        cell('', { fill: BAND }), cell(label, { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }),
        cell(gain !== undefined ? fcfa(gain) : '', { align: 'right', bold: true, fill: BAND }),
        cell(retenue !== undefined ? fcfa(retenue) : '', { align: 'right', bold: true, fill: BAND })
    ];

    const body = [[headerCell('N°'), headerCell('Désignation'), headerCell('Base'), headerCell('Taux'), headerCell('Gains'), headerCell('Retenues')]];
    body.push(ligne(codes.salaireBase, 'Salaire de base', calc.salaireBaseMensuel, '100%', calc.salaireBase));
    if (calc.sursalaire > 0) body.push(ligne(codes.sursalaire, 'Sursalaire', employee.sursalaire, '100%', calc.sursalaire));
    if (calc.primeAnciennete > 0) body.push(ligne(codes.primeAnciennete, `Prime d'ancienneté (${calc.ansAnciennete} ans)`, undefined, undefined, calc.primeAnciennete));
    (employee.primes || []).forEach(p => { if (p.montant > 0) body.push(ligne(codes.prime, p.libelle || p.label || 'Prime', undefined, undefined, p.montant)); });
    if (calc.allocationConges > 0) body.push(ligne(codes.allocationConges, `Allocation congés (${calc.joursCP} j)`, undefined, undefined, calc.allocationConges));
    (calc.heuresSupTranches || []).forEach(t => body.push(ligne(codes.heuresSup, `Heures sup. — ${t.label} (${t.heures}h)`, calc.tauxHoraire, `×${t.coef}`, t.montant)));
    if (calc.primeTransport > 0) body.push(ligne(codes.primeTransport, 'Indemnité de transport', undefined, undefined, calc.primeTransport));
    if (calc.primeTransportImposable > 0) body.push(ligne(codes.primeTransportImposable, 'Indemnité de transport (excédent imposable)', undefined, undefined, calc.primeTransportImposable));
    if (calc.primeLogement > 0) body.push(ligne(codes.primeLogement, 'Prime de logement', undefined, undefined, calc.primeLogement));
    body.push(bandRow('TOTAL BRUT', calc.gainsTotaux));

    body.push(ligne(codes.its, 'ITS — Impôt sur Traitements et Salaires', calc.brutImposable, null, null, calc.salarial.its));
    body.push(ligne(codes.cnpsSalariale, 'CNPS — Retraite (part salariale)', calc.baseCNPS, '6,3%', null, calc.salarial.cnps));
    body.push(ligne(codes.cmuSalariale, 'CMU — Assurance maladie', calc.totalPersonnesCMU * 1000, null, null, calc.salarial.cmu));
    if (calc.salarial.ricf > 0) body.push(ligne(codes.ricf, 'dont RICF (réduction charge de famille)', null, null, null, calc.salarial.ricf));
    if (calc.salarial.acompte > 0) body.push(ligne(codes.acompte, 'Acompte / avance', null, null, null, calc.salarial.acompte));
    body.push(bandRow('TOTAL RETENUES', undefined, calc.salarial.total));

    const totalPatronal = (calc.patronal.cnpsRetraite || 0) + (calc.patronal.cnpsPF || 0) + (calc.patronal.cnpsAT || 0) + (calc.patronal.cmu || 0) + (calc.patronal.impotEmployeur || 0) + (calc.patronal.fdfpTA || 0) + (calc.patronal.fdfpFPC || 0);

    // Décompte des coupures pour un règlement en espèces : uniquement affiché
    // quand ce n'est pas un virement (le « billetage » n'a pas de sens sinon).
    const coupures = [10000, 5000, 2000, 1000, 500, 250, 100, 50, 25, 10, 5];
    const billetage = [];
    if (!employee.virement) {
        let reste = Math.round(calc.netAPayer || 0);
        coupures.forEach(c => {
            const qte = Math.floor(reste / c);
            if (qte > 0) { billetage.push([cell(`${c} F`, { fontSize: 6.3 }), cell(qte, { align: 'right', fontSize: 6.3 }), cell(fcfa(qte * c), { align: 'right', fontSize: 6.3 })]); reste -= qte * c; }
        });
    }

    return {
        pageSize: 'A4', pageMargins: [28, 28, 28, 28],
        content: [
            {
                columns: [
                    { width: '46%', ...box([
                        company.logo ? { image: company.logo, fit: [90, 40], margin: [0, 0, 0, 4] } : { text: company.nom, fontSize: 11, bold: true },
                        !company.logo ? null : { text: company.nom, fontSize: 9, bold: true },
                        { text: company.adresse, fontSize: 6.6 }, { text: company.ville, fontSize: 6.6 },
                        { text: `N° CNPS : ${company.cnps}`, fontSize: 6.6 }, { text: `N° Contribuable : ${company.contribuable}`, fontSize: 6.6 }
                    ].filter(Boolean)) },
                    { width: '2%', text: '' },
                    { width: '27%', ...box([
                        { text: 'PÉRIODE DE PAIE', fontSize: 6.6, bold: true, alignment: 'center' },
                        { text: `Du ${periodeDebut} au ${periodeFin}`, fontSize: 7.5, alignment: 'center', margin: [0, 2, 0, 0] }
                    ]) },
                    { width: '2%', text: '' },
                    { width: '23%', stack: [
                        box([{ text: 'DATE DE PAIE', fontSize: 6.6, bold: true, alignment: 'center' }, { text: periodeFin, fontSize: 7.5, alignment: 'center', margin: [0, 2, 0, 0] }]),
                        { text: '', margin: [0, 2] },
                        box([{ text: 'TYPE DE PAIE', fontSize: 6.6, bold: true, alignment: 'center' }, { text: 'Mensuel', fontSize: 7.5, alignment: 'center', margin: [0, 2, 0, 0] }])
                    ] }
                ]
            },
            { text: '', margin: [0, 4] },
            { text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', fontSize: 12, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
            box([
                { columns: [kv('Nom', (employee.nom || '').toUpperCase()), kv('Matricule', employee.matricule), kv('Nb Parts IGR', calc.parts !== undefined ? calc.parts.toFixed(1) : '1,00')] },
                { columns: [kv('Prénoms', employee.prenom), kv('Emploi', employee.poste), kv('Nationalité', employee.nationalite || 'Ivoirienne')] },
                { columns: [kv('Équipe', employee.equipe || ''), kv('Sal. Cat.', employee.categorie || ''), kv('N° CNPS', employee.num_secu || employee.numero_cnps || '')] },
                { columns: [kv('Département', employee.departement || ''), kv('Service', employee.service || employee.departement || ''), kv("Date d'embauche", employee.date_embauche ? formatDate(employee.date_embauche) : '')] },
                { columns: [kv('Ancienneté', calc.ancienneteTxt), kv('Lieu de paie', company.ville), kv('Congés (Acq/Pris/Reste)', `${congesAcquis || 0}j / ${congesPris || 0}j / ${congesReste || 0}j`)] }
            ]),
            { text: '', margin: [0, 6] },
            {
                table: { headerRows: 1, widths: ['6%', '30%', '13%', '9%', '13%', '13%'], body },
                layout: { hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.4, vLineWidth: () => 0.4, hLineColor: () => '#94a3b8', vLineColor: () => '#94a3b8' }
            },
            { text: '', margin: [0, 6] },
            {
                columns: [
                    { width: '46%', ...box([
                        { text: 'CUMULS ANNUELS', fontSize: 6.8, bold: true, margin: [0, 0, 0, 3] },
                        kv('Cumul Brut imposable', fcfa(cumuls.cumulBrutImposable), { labelWidth: 140 }),
                        kv('Cumul ITS', fcfa(cumuls.cumulITS), { labelWidth: 140 }),
                        kv('Cumul CNPS Employé', fcfa(cumuls.cumulCNPS), { labelWidth: 140 }),
                        kv('Brut congé', fcfa(calc.allocationConges || 0), { labelWidth: 140 }),
                        kv('Brut CNPS', fcfa(calc.baseCNPS), { labelWidth: 140 }),
                        kv('Jrs congés acquis', `${congesAcquis || 0} j`, { labelWidth: 140 }),
                        kv('Jrs congés pris', `${congesPris || 0} j`, { labelWidth: 140 }),
                        kv('Jrs congés reste', `${congesReste || 0} j`, { labelWidth: 140 }),
                        kv('Indemnité de Transport', fcfa(calc.primeTransport || 0), { labelWidth: 140 }),
                        kv('Jours fiscaux', cumuls.cumulJours, { labelWidth: 140 }),
                        kv('Cumul exonéré', fcfa((calc.primeTransport || 0) + (calc.primeLogement || 0)), { labelWidth: 140 }),
                        kv('Cumul CMU', fcfa(cumuls.cumulCMU), { labelWidth: 140 })
                    ]) },
                    { width: '4%', text: '' },
                    { width: '50%', stack: [
                        box([
                            { columns: [{ text: 'GAINS', fontSize: 7, bold: true }, { text: fcfa(calc.gainsTotaux) + ' F', fontSize: 7, bold: true, alignment: 'right' }] },
                            { columns: [{ text: 'RETENUES', fontSize: 7, bold: true }, { text: fcfa(calc.salarial.total) + ' F', fontSize: 7, bold: true, alignment: 'right' }], margin: [0, 2, 0, 0] },
                            { columns: [{ text: 'CHARGES PATRONALES (info.)', fontSize: 6.3, color: '#6b7280' }, { text: fcfa(totalPatronal) + ' F', fontSize: 6.3, color: '#6b7280', alignment: 'right' }], margin: [0, 2, 0, 0] },
                            { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 235, y2: 4, lineWidth: 0.5, lineColor: '#94a3b8' }] },
                            {
                                margin: [0, 4, 0, 0],
                                table: { widths: ['*', 'auto'], body: [[{ text: 'NET À PAYER', fontSize: 8.5, bold: true, fillColor: '#FFFF00', margin: [4, 3] }, { text: fcfa(calc.netAPayer) + ' F', fontSize: 8.5, bold: true, alignment: 'right', fillColor: '#FFFF00', margin: [4, 3] }]] },
                                layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => '#000', vLineColor: () => '#000' }
                            }
                        ]),
                        { text: '', margin: [0, 4] },
                        { text: 'RÈGLEMENT', fontSize: 6.8, bold: true },
                        { text: employee.virement ? `Virement bancaire${employee.rib ? ` — compte n° ${employee.rib}` : ''}` : 'Espèces', fontSize: 7, margin: [0, 2, 0, 4] },
                        !employee.virement && billetage.length ? {
                            table: { widths: ['34%', '33%', '33%'], body: [[headerCell('Coupure'), headerCell('Qté'), headerCell('Montant')], ...billetage] },
                            layout: { hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => '#94a3b8', vLineColor: () => '#94a3b8' }
                        } : null,
                        !employee.virement && billetage.length ? { text: 'BILLETAGE', fontSize: 6, italics: true, color: '#6b7280', margin: [0, 2, 0, 0] } : null
                    ].filter(Boolean) }
                ]
            },
            { text: '', margin: [0, 10] },
            {
                columns: [
                    { stack: [{ text: "Visa de l'employeur", fontSize: 7, alignment: 'center', margin: [0, 0, 0, 24] }, { canvas: [{ type: 'line', x1: 40, y1: 0, x2: 200, y2: 0, lineWidth: 0.5 }] }] },
                    { stack: [{ text: "Visa de l'employé", fontSize: 7, alignment: 'center', margin: [0, 0, 0, 24] }, { canvas: [{ type: 'line', x1: 40, y1: 0, x2: 200, y2: 0, lineWidth: 0.5 }] }] }
                ]
            }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generatePdfDefinitionADArchitecture });
