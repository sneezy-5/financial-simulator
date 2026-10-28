// Modèle de bulletin « lavandiere » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

/**
 * Septième modèle par défaut, réplique fidèle d'un bulletin réel (LA
 * LAVANDIERE) : boîte « congés/absences » à gauche, boîte matricule + nom en
 * gras à droite, tableau Acquis/Reste à prendre/Pris pour repos comp. et
 * congés, colonne Nombre séparée de Base (jours/heures × taux journalier ou
 * horaire), et pied « Cumuls » Période/Année.
 *
 * Le solde de congés (Acquis/Reste à prendre/Pris) n'est pas un cumul qu'ONDA
 * conserve aujourd'hui (voir le cumul annuel plus bas) : la colonne est
 * affichée à blanc plutôt qu'avec une fausse valeur à 0.
 */
function generatePdfDefinitionLavandiere(employee, calc, companyInfo = {}) {
    const BORDER = '#000000';
    // Vert (thème congés/repos), pas du gris sur gris : chaque modèle ONDA a
    // sa propre couleur d'accent (bleu, indigo, teal…), celui-ci n'y échappe
    // pas.
    const GREEN = '#15803d';
    const company = resolveCompanyInfo(employee, companyInfo);
    const codes = resolveCodesRubrique(companyInfo.rubriqueCodes);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periodeDebut = `01/${String(moisNum).padStart(2, '0')}/${String(annee).slice(-2)}`;
    const periodeFin = `${dernierJour}/${String(moisNum).padStart(2, '0')}/${String(annee).slice(-2)}`;

    const { congesAcquis, congesReste, congesPris, jCP } = calculateCongesCounters(employee, calc, annee, moisNum);
    const cumuls = calculateCumuls(employee, calc, annee);

    const box = (contenu, opts = {}) => ({
        table: { widths: ['*'], body: [[{ stack: contenu, margin: opts.margin || [6, 5] }]] },
        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER }
    });
    const kv = (label, value, opts = {}) => ({ columns: [{ text: label, fontSize: 6.8, width: opts.labelWidth || 110 }, { text: (value === undefined || value === null || value === '') ? '' : value.toString(), fontSize: 6.8, bold: true, width: '*' }], margin: [0, 1] });

    const cell = (text, opts = {}) => ({
        text: (text === null || text === undefined) ? '' : text.toString(),
        fontSize: opts.fontSize || 6.6,
        bold: opts.bold || false,
        alignment: opts.align || 'left',
        fillColor: opts.fill || null,
        colSpan: opts.colSpan || null,
        margin: opts.margin || [2, 1.5, 2, 1.5]
    });
    // Vert franc pour les en-têtes, vert moyen pour les sous-groupes (Part
    // salariale/patronale), vert pâle mais coloré (pas gris) pour les
    // sous-totaux — la hiérarchie reste lisible sans jamais retomber en
    // niveaux de gris.
    const headerCell = (text, opts = {}) => cell(text, { fill: GREEN, color: 'white', bold: true, align: 'center', fontSize: 6.3, ...opts });
    const subHeaderCell = (text, opts = {}) => cell(text, { fill: '#4ade80', color: '#052e16', bold: true, align: 'center', fontSize: 6.1, ...opts });

    // Nombre (jours/heures) × Base (taux journalier/horaire) = Gain, comme sur
    // le bulletin d'origine — distinct des autres modèles où Base est
    // directement le montant mensuel.
    const ligne = (numero, label, nombre, base, tauxS, gain, retenuePS, baseP, tauxP, retenuePP) => [
        cell(numero || ''), cell(label),
        cell(nombre !== undefined && nombre !== null ? nombre : '', { align: 'right' }),
        cell(base !== undefined && base !== null ? fcfa(base) : '', { align: 'right' }),
        cell(tauxS || '', { align: 'center' }),
        cell(gain !== undefined && gain !== null ? fcfa(gain) : '', { align: 'right' }),
        cell(retenuePS !== undefined && retenuePS !== null ? fcfa(retenuePS) : '', { align: 'right' }),
        cell(tauxP || '', { align: 'center' }),
        cell(retenuePP !== undefined && retenuePP !== null ? fcfa(retenuePP) : '', { align: 'right' })
    ];
    const bandRow = (label, gain, retenuePS, retenuePP) => [
        cell('', { fill: '#bbf7d0' }), cell(label, { bold: true, fill: '#bbf7d0' }),
        cell('', { fill: '#bbf7d0' }), cell('', { fill: '#bbf7d0' }), cell('', { fill: '#bbf7d0' }),
        cell(gain !== undefined ? fcfa(gain) : '', { align: 'right', bold: true, fill: '#bbf7d0' }),
        cell(retenuePS !== undefined ? fcfa(retenuePS) : '', { align: 'right', bold: true, fill: '#bbf7d0' }),
        cell('', { fill: '#bbf7d0' }),
        cell(retenuePP !== undefined ? fcfa(retenuePP) : '', { align: 'right', bold: true, fill: '#bbf7d0' })
    ];

    const body = [[
        headerCell('N°'), headerCell('Désignation'), headerCell('Nombre'), headerCell('Base'),
        headerCell('Taux'), headerCell('Gain'), headerCell('Retenue'),
        headerCell('Taux'), headerCell('Retenue')
    ], [
        subHeaderCell(''), subHeaderCell(''), subHeaderCell(''), subHeaderCell(''),
        subHeaderCell('Part salariale', { colSpan: 3 }), {}, {},
        subHeaderCell('Part patronale', { colSpan: 2 }), {}
    ]];

    // Dénominateur standard 26 jours (même base que le moteur de calcul) :
    // utiliser joursTrav (jours après déductions) donnait un taux journalier
    // différent et un affichage incohérent — la déduction est déjà faite dans
    // calc.salaireBase, pas besoin de la répercuter ici.
    const JOURS_BASE_LAVANDIERE = 26;
    body.push(ligne(codes.salaireBase, 'Salaire de base', calc.joursTrav, (calc.salaireBaseMensuel || 0) / JOURS_BASE_LAVANDIERE, undefined, calc.salaireBase));
    if (calc.sursalaire > 0) body.push(ligne(codes.sursalaire, 'Sursalaire', calc.joursTrav, (employee.sursalaire || 0) / JOURS_BASE_LAVANDIERE, undefined, calc.sursalaire));
    if (calc.primeAnciennete > 0) body.push(ligne(codes.primeAnciennete, `Prime d'ancienneté (${calc.ansAnciennete} ans)`, undefined, undefined, undefined, calc.primeAnciennete));
    (employee.primes || []).forEach(p => { if (p.montant > 0) body.push(ligne(codes.prime, p.libelle || p.label || 'Prime', undefined, undefined, undefined, p.montant)); });
    if (calc.allocationConges > 0) body.push(ligne(codes.allocationConges, `Allocation congés (${calc.joursCP} j)`, calc.joursCP, undefined, undefined, calc.allocationConges));
    (calc.heuresSupTranches || []).forEach(t => body.push(ligne(codes.heuresSup, `Heures sup. — ${t.label}`, t.heures, calc.tauxHoraire, `×${t.coef}`, t.montant)));
    if (calc.primeTransport > 0) body.push(ligne(codes.primeTransport, 'Indemnité de transport', undefined, undefined, undefined, calc.primeTransport));
    if (calc.primeTransportImposable > 0) body.push(ligne(codes.primeTransportImposable, 'Indemnité de transport (excédent imposable)', undefined, undefined, undefined, calc.primeTransportImposable));
    if (calc.primeLogement > 0) body.push(ligne(codes.primeLogement, 'Prime de logement', undefined, undefined, undefined, calc.primeLogement));

    body.push(bandRow('TOTAL BRUT', calc.gainsTotaux));

    body.push(ligne(codes.its, 'Impôt sur les Traitements et Salaires', undefined, calc.brutImposable, undefined, undefined, calc.salarial.its));
    body.push(ligne(codes.cnpsSalariale, 'Retenue CNPS', undefined, calc.baseCNPS, '6,30', undefined, calc.salarial.cnps));
    body.push(ligne(codes.cmuSalariale, 'CMU — Assurance maladie', undefined, calc.totalPersonnesCMU * 1000, undefined, undefined, calc.salarial.cmu));
    if (calc.salarial.ricf > 0) body.push(ligne(codes.ricf, 'dont Réduction Impôt Charge de Famille (RICF)', undefined, undefined, undefined, undefined, calc.salarial.ricf));
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
        cell(label, { fontSize: 6.6 }), cell(acquis || '', { align: 'center', fontSize: 6.6 }),
        cell(reste || '', { align: 'center', fontSize: 6.6 }), cell(pris || '', { align: 'center', fontSize: 6.6 })
    ];

    const cumulsRow = (label, brut, chargesSal, chargesPat, netImposable, jrs, heuresSup, net) => [
        cell(label, { bold: true, fontSize: 6.3 }), cell(fcfa(brut), { align: 'right', fontSize: 6.3 }),
        cell(fcfa(chargesSal), { align: 'right', fontSize: 6.3 }), cell(fcfa(chargesPat), { align: 'right', fontSize: 6.3 }),
        cell(fcfa(netImposable), { align: 'right', fontSize: 6.3 }), cell(jrs, { align: 'right', fontSize: 6.3 }),
        cell(fcfa(heuresSup), { align: 'right', fontSize: 6.3 }), cell(fcfa(net), { align: 'right', bold: true, fontSize: 6.3 })
    ];

    return {
        pageSize: 'A4', pageMargins: [28, 28, 28, 28],
        content: [
            {
                columns: [
                    { width: '58%', ...box([
                        company.logo ? { image: company.logo, fit: [90, 40], margin: [0, 0, 0, 4] } : { text: company.nom, fontSize: 11, bold: true },
                        !company.logo ? null : { text: company.nom, fontSize: 9, bold: true },
                        { text: company.adresse, fontSize: 6.8 },
                        { text: company.ville, fontSize: 6.8 },
                        { text: `Tél : ${company.telephone || '—'}`, fontSize: 6.8 },
                        { text: `N° CNPS : ${company.cnps}`, fontSize: 6.8 }
                    ].filter(Boolean)) },
                    { width: '2%', text: '' },
                    { width: '40%', ...box([
                        { text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', fontSize: 12, bold: true, alignment: 'center' }
                    ], { margin: [6, 12] }) }
                ]
            },
            { text: '', margin: [0, 4] },
            box([
                { columns: [kv('Période du', `${periodeDebut} au ${periodeFin}`), kv('Paiement le', `${periodeFin}   par ${employee.virement ? 'Virement' : 'Espèces'}`)] },
                { columns: [kv("Date d'embauche", employee.date_embauche ? formatDate(employee.date_embauche) : ''), kv('Ancienneté', calc.ancienneteTxt)] },
                { columns: [kv('Département', employee.departement || ''), kv('Emploi', employee.poste || '')] },
                { columns: [kv('Catégorie', employee.categorie || ''), kv('Nbre de parts IGR', calc.parts !== undefined ? calc.parts.toFixed(1) : '1,00')] },
                { columns: [kv('Situation', `${{ celibataire: 'Célibataire', marie: 'Marié(e)', divorce: 'Divorcé(e)', veuf: 'Veuf/Veuve' }[employee.situation_matrimoniale] || employee.situation_matrimoniale || ''}   ${parseInt(employee.nombre_enfants) || 0} Enfant(s)`), kv('N° CNPS', employee.num_secu || employee.numero_cnps || '')] }
            ]),
            { text: '', margin: [0, 4] },
            {
                columns: [
                    { width: '48%', ...box([
                        { text: 'Absences / congés', fontSize: 6.8, bold: true, margin: [0, 0, 0, 3] },
                        kv('Jours Absence sans solde', parseFloat(employee.absences_jours) || 0, { labelWidth: 150 }),
                        kv('Jours Absence avec solde', 0, { labelWidth: 150 }),
                        kv('Jours rappel', '', { labelWidth: 150 }),
                        kv('Date de retour congés', '', { labelWidth: 150 }),
                        kv('Date départ congés', '', { labelWidth: 150 }),
                        kv('Médaille du travail', 0, { labelWidth: 150 })
                    ]) },
                    { width: '4%', text: '' },
                    { width: '48%', stack: [
                        box([
                            { text: `Matricule   ${employee.matricule || ''}`, fontSize: 7.5, bold: true },
                            { text: `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}`, fontSize: 10, bold: true, margin: [0, 3, 0, 0] }
                        ]),
                        { text: '', margin: [0, 3] },
                        {
                            table: {
                                widths: ['34%', '22%', '22%', '22%'],
                                body: [
                                    [headerCell(''), headerCell('Acquis'), headerCell('Reste à prendre'), headerCell('Pris')],
                                    congesRow('Repos comp.'),
                                    congesRow('Congés', congesAcquis, congesReste, congesPris)
                                ]
                            },
                            layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER }
                        }
                    ] }
                ]
            },
            { text: '', margin: [0, 6] },
            {
                table: { headerRows: 2, widths: ['5%', '25%', '8%', '11%', '8%', '11%', '11%', '8%', '13%'], body },
                layout: {
                    hLineWidth: (i, node) => (i === 0 || i === 2 || i === node.table.body.length) ? 1 : 0.4,
                    vLineWidth: () => 0.4,
                    hLineColor: () => '#94a3b8',
                    vLineColor: () => '#94a3b8'
                }
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
                    widths: ['12%', '13%', '13%', '13%', '13%', '11%', '11%', '14%'],
                    body: [
                        [headerCell('Période'), headerCell('Salaire brut'), headerCell('Charges sal.'), headerCell('Charges pat.'), headerCell('Net imposable'), headerCell('Jrs trav.'), headerCell('Heures sup'), headerCell('NET À PAYER')],
                        cumulsRow('Mois', calc.gainsTotaux, calc.salarial.total, totalPatronal, calc.brutImposable, calc.joursTrav, calc.montantHeuresSup, calc.netAPayer),
                        cumulsRow(`Année ${annee}`, cumuls.cumulBrut, cumuls.cumulChargesSal, cumuls.cumulChargesPat, cumuls.cumulBrutImposable, cumuls.cumulJours, cumuls.cumulHeuresSup, cumuls.cumulNetAPayer)
                    ]
                },
                layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER }
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

Object.assign(exports, { generatePdfDefinitionLavandiere });
