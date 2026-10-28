// Modèle de bulletin « tcmLogistic » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

/**
 * Neuvième modèle par défaut, réplique fidèle d'un bulletin réel (TCM
 * LOGISTIC) : en-tête Niveau/Coefficient/Indice/Ancienneté/N° Sécurité
 * Sociale, Qualification/Horaire/CCN, congés Acquis/Reste à prendre/Pris
 * détaillés, et — sa particularité — une part patronale scindée en deux
 * colonnes Retenue(+) / Retenue(-) plutôt qu'une seule colonne Retenue.
 */
function generatePdfDefinitionTcmLogistic(employee, calc, companyInfo = {}) {
    const BORDER = '#000000';
    // Orange (thème transport/logistique), avec un bandeau franc pour les
    // sous-totaux — voir la même remarque sur generatePdfDefinitionLavandiere
    // ci-dessus : un gris presque blanc rend TOTAL BRUT/COTISATIONS
    // indiscernables des lignes normales.
    const ORANGE = '#c2410c';
    const BAND = '#fed7aa';
    const company = resolveCompanyInfo(employee, companyInfo);
    const codes = resolveCodesRubrique(companyInfo.rubriqueCodes);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periodeDebut = `01/${String(moisNum).padStart(2, '0')}/${String(annee).slice(-2)}`;
    const periodeFin = `${dernierJour}/${String(moisNum).padStart(2, '0')}/${String(annee).slice(-2)}`;

    const { congesAcquis: congesAcquisTCM, congesReste: congesResteTCM, congesPris: congesPrisTCM } = calculateCongesCounters(employee, calc, annee, moisNum);
    const cumuls = calculateCumuls(employee, calc, annee);

    const box = (contenu, opts = {}) => ({
        table: { widths: ['*'], body: [[{ stack: contenu, margin: opts.margin || [6, 5] }]] },
        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER }
    });
    const kv = (label, value, opts = {}) => ({ columns: [{ text: label, fontSize: 6.6, width: opts.labelWidth || 100 }, { text: (value === undefined || value === null || value === '') ? '' : value.toString(), fontSize: 6.6, bold: true, width: '*' }], margin: [0, 1] });

    const cell = (text, opts = {}) => ({
        text: (text === null || text === undefined) ? '' : text.toString(),
        fontSize: opts.fontSize || 6.4, bold: opts.bold || false, alignment: opts.align || 'left',
        fillColor: opts.fill || null, colSpan: opts.colSpan || null, margin: opts.margin || [2, 1.5, 2, 1.5]
    });
    const headerCell = (text, opts = {}) => cell(text, { fill: ORANGE, color: 'white', bold: true, align: 'center', fontSize: 6.2, ...opts });
    const subHeaderCell = (text, opts = {}) => cell(text, { fill: '#fb923c', color: '#431407', bold: true, align: 'center', fontSize: 6, ...opts });

    // Part patronale scindée Retenue(+)/Retenue(-) : « + » pour une charge
    // patronale normale, « - » réservé à un éventuel avantage/déduction
    // (aucune rubrique ONDA actuelle n'en produit, la colonne reste à blanc).
    const ligne = (numero, label, nombre, base, tauxS, gain, retenuePS, baseP, tauxP, retenuePPlus, retenuePMoins) => [
        cell(numero || ''), cell(label),
        cell(nombre !== undefined && nombre !== null ? nombre : '', { align: 'right' }),
        cell(base !== undefined && base !== null ? fcfa(base) : '', { align: 'right' }),
        cell(tauxS || '', { align: 'center' }),
        cell(gain !== undefined && gain !== null ? fcfa(gain) : '', { align: 'right' }),
        cell(retenuePS !== undefined && retenuePS !== null ? fcfa(retenuePS) : '', { align: 'right' }),
        cell(tauxP || '', { align: 'center' }),
        cell(retenuePPlus !== undefined && retenuePPlus !== null ? fcfa(retenuePPlus) : '', { align: 'right' }),
        cell(retenuePMoins !== undefined && retenuePMoins !== null ? fcfa(retenuePMoins) : '', { align: 'right' })
    ];
    const bandRow = (label, gain, retenuePS, retenuePPlus) => [
        cell('', { fill: BAND }), cell(label, { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }),
        cell(gain !== undefined ? fcfa(gain) : '', { align: 'right', bold: true, fill: BAND }),
        cell(retenuePS !== undefined ? fcfa(retenuePS) : '', { align: 'right', bold: true, fill: BAND }),
        cell('', { fill: BAND }),
        cell(retenuePPlus !== undefined ? fcfa(retenuePPlus) : '', { align: 'right', bold: true, fill: BAND }),
        cell('', { fill: BAND })
    ];

    const body = [[
        headerCell('N°'), headerCell('Désignation'), headerCell('Nombre'), headerCell('Base'),
        headerCell('Taux'), headerCell('Gain'), headerCell('Retenue'),
        headerCell('Taux'), headerCell('Retenue(+)'), headerCell('Retenue(-)')
    ], [
        subHeaderCell(''), subHeaderCell(''), subHeaderCell(''), subHeaderCell(''),
        subHeaderCell('Part salariale', { colSpan: 3 }), {}, {},
        subHeaderCell('Part patronale', { colSpan: 3 }), {}, {}
    ]];

    // Dénominateur standard 26 jours (même base que le moteur de calcul) :
    // utiliser calc.joursTrav ici affichait 30 même avec des absences,
    // la déduction étant déjà appliquée dans calc.salaireBase.
    const JOURS_BASE_TCM = 26;
    body.push(ligne(codes.salaireBase, 'Salaire de base', calc.joursTrav, (calc.salaireBaseMensuel || 0) / JOURS_BASE_TCM, undefined, calc.salaireBase));
    if (calc.sursalaire > 0) body.push(ligne(codes.sursalaire, 'Sursalaire', calc.joursTrav, (employee.sursalaire || 0) / JOURS_BASE_TCM, undefined, calc.sursalaire));
    if (calc.primeAnciennete > 0) body.push(ligne(codes.primeAnciennete, `Prime d'ancienneté (${calc.ansAnciennete} ans)`, undefined, undefined, undefined, calc.primeAnciennete));
    (employee.primes || []).forEach(p => { if (p.montant > 0) body.push(ligne(codes.prime, p.libelle || p.label || 'Prime', undefined, undefined, undefined, p.montant)); });
    if (calc.allocationConges > 0) body.push(ligne(codes.allocationConges, `Allocation congés (${calc.joursCP} j)`, calc.joursCP, undefined, undefined, calc.allocationConges));
    (calc.heuresSupTranches || []).forEach(t => body.push(ligne(codes.heuresSup, `Heures sup. — ${t.label}`, t.heures, calc.tauxHoraire, `×${t.coef}`, t.montant)));
    if (calc.primeTransport > 0) body.push(ligne(codes.primeTransport, 'Indemnité de transport', undefined, undefined, undefined, calc.primeTransport));
    if (calc.primeTransportImposable > 0) body.push(ligne(codes.primeTransportImposable, 'Indemnité de transport (excédent imposable)', undefined, undefined, undefined, calc.primeTransportImposable));
    if (calc.primeLogement > 0) {
        // Avantage en nature en toutes lettres dans les cumuls plus bas : ce
        // bulletin l'affiche explicitement, contrairement aux autres modèles.
        body.push(ligne(codes.primeLogement, 'Avantage en nature — Logement', undefined, undefined, undefined, calc.primeLogement));
    }
    body.push(bandRow('TOTAL BRUT', calc.gainsTotaux));

    body.push(ligne(codes.its, 'ITS — Impôt sur Traitements et Salaires', undefined, calc.brutImposable, undefined, undefined, calc.salarial.its));
    body.push(ligne(codes.cnpsSalariale, 'Retenue CNPS — Retraite', undefined, calc.baseCNPS, '6,30', undefined, calc.salarial.cnps));
    body.push(ligne(codes.cmuSalariale, 'CMU — Assurance maladie', undefined, calc.totalPersonnesCMU * 1000, undefined, undefined, calc.salarial.cmu));
    if (calc.salarial.ricf > 0) body.push(ligne(codes.ricf, 'dont RICF (réduction charge de famille)', undefined, undefined, undefined, undefined, calc.salarial.ricf));
    if (calc.salarial.acompte > 0) body.push(ligne(codes.acompte, 'Acompte / avance', undefined, undefined, undefined, undefined, calc.salarial.acompte));

    body.push(ligne(codes.cnpsPatronale, 'Retraite Générale CNPS', undefined, undefined, undefined, undefined, undefined, calc.baseCNPS, '7,70', calc.patronal.cnpsRetraite));
    body.push(ligne(codes.cnpsPF, 'Prestations Familiales', undefined, undefined, undefined, undefined, undefined, calc.baseCNPS_PfAtAm, '5,00', calc.patronal.cnpsPF));
    body.push(ligne(codes.cnpsAT, 'Accident du Travail', undefined, undefined, undefined, undefined, undefined, calc.baseCNPS_PfAtAm, `${employee.taux_at_mp || employee.taux_at || 2},00`, calc.patronal.cnpsAT));
    body.push(ligne(codes.cmuPatronale, 'CMU — part patronale', undefined, undefined, undefined, undefined, undefined, undefined, undefined, calc.patronal.cmu));
    body.push(ligne(codes.impotEmployeur, 'CN — Contribution Nationale (employeur)', undefined, undefined, undefined, undefined, undefined, calc.brutImposable, '1,20', calc.patronal.cnEmployeur ?? calc.patronal.impotEmployeur));
    if ((calc.patronal.ceEmployeur || 0) > 0) body.push(ligne(codes.ceEmployeur, 'CE — Contribution Employeur (expatrié)', undefined, undefined, undefined, undefined, undefined, calc.brutImposable, '9,20', calc.patronal.ceEmployeur));
    body.push(ligne(codes.fdfpTA, "Taxe d'Apprentissage", undefined, undefined, undefined, undefined, undefined, calc.brutImposable, '0,40', calc.patronal.fdfpTA));
    body.push(ligne(codes.fdfpFPC, 'Formation Professionnelle Continue', undefined, undefined, undefined, undefined, undefined, calc.brutImposable, '0,60', calc.patronal.fdfpFPC));

    const totalPatronal = (calc.patronal.cnpsRetraite || 0) + (calc.patronal.cnpsPF || 0) + (calc.patronal.cnpsAT || 0) + (calc.patronal.cmu || 0) + (calc.patronal.impotEmployeur || 0) + (calc.patronal.fdfpTA || 0) + (calc.patronal.fdfpFPC || 0);
    body.push(bandRow('TOTAL COTISATIONS', undefined, calc.salarial.total, totalPatronal));

    const congesRow = (label, acquis, reste, pris) => [
        cell(label, { fontSize: 6.4 }), cell(acquis || '', { align: 'center', fontSize: 6.4 }),
        cell(reste || '', { align: 'center', fontSize: 6.4 }), cell(pris || '', { align: 'center', fontSize: 6.4 })
    ];
    const cumulsRow = (label, brut, chargesSal, chargesPat, avantages, net) => [
        cell(label, { bold: true, fontSize: 6.3 }), cell(fcfa(brut), { align: 'right', fontSize: 6.3 }),
        cell(fcfa(chargesSal), { align: 'right', fontSize: 6.3 }), cell(fcfa(chargesPat), { align: 'right', fontSize: 6.3 }),
        cell(fcfa(avantages), { align: 'right', fontSize: 6.3 }), cell(fcfa(net), { align: 'right', bold: true, fontSize: 6.3 })
    ];

    return {
        pageSize: 'A4', pageMargins: [26, 28, 26, 28],
        content: [
            {
                columns: [
                    { width: '55%', ...box([
                        { text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', fontSize: 10, bold: true },
                        { text: `Période : Du ${periodeDebut} au ${periodeFin}`, fontSize: 6.6, margin: [0, 2, 0, 0] },
                        { text: `Paiement le ${periodeFin} — Par : ${employee.virement ? 'VIREMENT' : 'ESPÈCES'}`, fontSize: 6.6 }
                    ]) },
                    { width: '2%', text: '' },
                    { width: '43%', ...box([
                        company.logo ? { image: company.logo, fit: [90, 32], alignment: 'center' } : { text: company.nom, fontSize: 11, bold: true, alignment: 'center' },
                        !company.logo ? null : { text: company.nom, fontSize: 8, bold: true, alignment: 'center', margin: [0, 2, 0, 0] },
                        { text: `${company.adresse}${company.ville ? ' — ' + company.ville : ''}`, fontSize: 6.2, alignment: 'center' }
                    ].filter(Boolean)) }
                ]
            },
            { text: '', margin: [0, 4] },
            box([
                { columns: [kv('Matricule', employee.matricule), kv('Niveau', employee.niveau || employee.categorie || ''), kv('Coefficient', employee.coefficient || ''), kv('Indice', employee.indice || '')] },
                { columns: [kv('Ancienneté', calc.ancienneteTxt), kv('N° Sécurité Sociale', employee.num_secu || employee.numero_cnps || ''), kv('', ''), kv('', '')] },
                { columns: [kv('Catégorie', employee.categorie || ''), kv('Emploi occupé', employee.poste || ''), kv('Département', employee.departement || ''), kv('', '')] },
                { columns: [kv('Qualification', employee.qualification || employee.poste || ''), kv('Horaire', '173,33 h/mois'), kv('CCN', employee.ccn || 'Transport / Logistique'), kv('', '')] }
            ]),
            { text: '', margin: [0, 4] },
            {
                columns: [
                    { width: '58%', ...box([
                        { text: `Nombre de parts : ${calc.parts !== undefined ? calc.parts.toFixed(1) : '1,00'}`, fontSize: 6.8 },
                        { text: `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}`, fontSize: 10.5, bold: true, margin: [0, 3, 0, 0] }
                    ]) },
                    { width: '2%', text: '' },
                    { width: '40%', stack: [
                        {
                            table: {
                                widths: ['34%', '22%', '22%', '22%'],
                                body: [
                                    [headerCell(''), headerCell('Acquis'), headerCell('Reste'), headerCell('Pris')],
                                    congesRow('Repos comp.'),
                                    congesRow('Congés', congesAcquisTCM, congesResteTCM, congesPrisTCM)
                                ]
                            },
                            layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER }
                        },
                        { text: 'Dates de congés : —', fontSize: 6.2, margin: [2, 3, 0, 0] },
                        { text: 'Commentaire :', fontSize: 6.2, margin: [2, 2, 0, 0] }
                    ] }
                ]
            },
            { text: '', margin: [0, 6] },
            {
                table: { headerRows: 2, widths: ['6%', '19%', '6%', '9%', '6%', '9%', '9%', '6%', '9%', '9%'], body },
                layout: { hLineWidth: (i, node) => (i === 0 || i === 2 || i === node.table.body.length) ? 1 : 0.4, vLineWidth: () => 0.4, hLineColor: () => '#94a3b8', vLineColor: () => '#94a3b8' }
            },
            { text: '', margin: [0, 8] },
            {
                columns: [
                    { width: '*', text: '' },
                    {
                        width: 170,
                        table: { widths: ['*'], body: [[{ text: 'NET À PAYER', fontSize: 8, bold: true, alignment: 'center', margin: [0, 2] }], [{ text: fcfa(calc.netAPayer) + ' F', fontSize: 15, bold: true, alignment: 'center', fillColor: '#FFFF00', margin: [0, 3] }]] },
                        layout: { hLineWidth: () => 1.2, vLineWidth: () => 1.2, hLineColor: () => '#000', vLineColor: () => '#000' }
                    }
                ]
            },
            { text: '', margin: [0, 8] },
            { text: 'CUMULS', fontSize: 7.5, bold: true, margin: [0, 0, 0, 3] },
            {
                table: {
                    widths: ['14%', '17%', '17%', '17%', '17%', '18%'],
                    body: [
                        [headerCell('Période'), headerCell('Salaire Brut'), headerCell('Charges Sal.'), headerCell('Charges Pat.'), headerCell('Avant. en nature'), headerCell('NET À PAYER')],
                        cumulsRow('Mois', calc.gainsTotaux, calc.salarial.total, totalPatronal, calc.primeLogement || 0, calc.netAPayer),
                        cumulsRow(`Année ${annee}`, cumuls.cumulBrut, cumuls.cumulChargesSal, cumuls.cumulChargesPat, calc.primeLogement || 0, cumuls.cumulNetAPayer)
                    ]
                },
                layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER }
            },
            { text: '', margin: [0, 10] },
            { text: 'VISA', fontSize: 7, bold: true, margin: [0, 0, 0, 24] },
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5 }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generatePdfDefinitionTcmLogistic });
