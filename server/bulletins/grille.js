// Modèle de bulletin « grille » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

/**
 * Second modèle par défaut, format « grille numérotée » (rubriques 010, 020…,
 * colonnes Base/Taux/Gains/Retenues séparées P.S. et P.P.) — une mise en page
 * alternative à generatePdfDefinition, proposée au même titre qu'elle.
 *
 * Le cumul annuel affiché reste celui du mois en cours : aucun historique de
 * paie n'est encore conservé (voir le suivi cumul LOGIPAIE, chantier à part).
 * C'est exact pour un premier bulletin de l'année, approximatif ensuite.
 */
function generatePdfDefinitionGrilleNumerotee(employee, calc, companyInfo = {}) {
    const BLUE = '#1e3a8a';
    const BORDER = '#cbd5e1';
    const BAND = '#e2e8f0';
    const DARK_BAND = '#334155';
    const YELLOW = '#FFFF00';

    const company = {
        nom: companyInfo.nom_entreprise || employee.nom_entreprise || 'VOTRE ENTREPRISE',
        adresse: companyInfo.adresse || employee.adresse || '',
        siege: companyInfo.siege_social || employee.siege_social || companyInfo.adresse || '',
        ville: companyInfo.ville || employee.ville || '',
        cnps: companyInfo.numero_cnps || employee.numero_cnps || '____',
        ncc: companyInfo.numero_contribuable || employee.numero_contribuable || '____',
        email: companyInfo.email || employee.email_entreprise || '',
        telephone: companyInfo.telephone || employee.tel_entreprise || '',
        logo: companyInfo.logo || null
    };

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const { congesAcquis, congesReste, congesPris, jCP } = calculateCongesCounters(employee, calc, annee, moisNum);
    const cumuls = calculateCumuls(employee, calc, annee);
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periodeDebut = `01/${String(moisNum).padStart(2, '0')}/${annee}`;
    const periodeFin = `${dernierJour}/${String(moisNum).padStart(2, '0')}/${annee}`;

    const SITUATIONS = { celibataire: 'Célibataire', marie: 'Marié(e)', divorce: 'Divorcé(e)', veuf: 'Veuf/Veuve' };

    const headerColumns = [];
    headerColumns.push(company.logo
        ? { image: company.logo, fit: [70, 42], width: 90 }
        : { text: company.nom, fontSize: 12, bold: true, color: BLUE, width: '*' });
    headerColumns.push({ width: '*', text: '' });
    headerColumns.push({
        width: 220,
        stack: [
            { text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', fontSize: 12, bold: true, alignment: 'right', color: BLUE },
            { text: `Du ${periodeDebut} au ${periodeFin}`, fontSize: 7.5, alignment: 'right', color: '#475569' }
        ]
    });

    const infoRow = (label, value) => [
        { text: label, fontSize: 7, color: '#475569', margin: [0, 1.5, 0, 1.5] },
        { text: (value || '').toString(), fontSize: 7, bold: true, margin: [0, 1.5, 0, 1.5] }
    ];

    const infoBlock = {
        columns: [
            {
                width: '50%',
                table: {
                    widths: ['40%', '60%'],
                    body: [
                        infoRow('Adresse', company.adresse),
                        infoRow('Siège social', company.siege),
                        infoRow('Ville', company.ville),
                        infoRow('Matricule CNPS', company.cnps),
                        infoRow('NCC', company.ncc),
                        infoRow('E-mail', company.email),
                        infoRow('Fixe', company.telephone)
                    ]
                },
                layout: 'noBorders'
            },
            {
                width: '50%',
                table: {
                    widths: ['46%', '54%'],
                    body: [
                        infoRow('Nom', (employee.nom || '').toUpperCase()),
                        infoRow('Prénoms', employee.prenom),
                        infoRow('Emploi', employee.poste),
                        infoRow('Matricule', employee.matricule),
                        infoRow('Catégorie', employee.categorie),
                        infoRow('Nombre de part', calc.parts !== undefined ? calc.parts.toFixed(1) : '1.0'),
                        infoRow("Date d'embauche", employee.date_embauche ? formatDate(employee.date_embauche) : ''),
                        infoRow('Ancienneté', calc.ancienneteTxt),
                        infoRow('N° CNPS', employee.num_secu || employee.numero_cnps),
                        infoRow('Situation matrimoniale', SITUATIONS[employee.situation_matrimoniale] || employee.situation_matrimoniale)
                    ]
                },
                layout: 'noBorders'
            }
        ],
        columnGap: 16
    };

    const cell = (text, opts = {}) => ({
        text: (text === null || text === undefined) ? '' : text.toString(),
        fontSize: opts.fontSize || 6.8,
        bold: opts.bold || false,
        alignment: opts.align || 'left',
        fillColor: opts.fill || null,
        color: opts.color || 'black',
        colSpan: opts.colSpan || null,
        margin: opts.margin || [2, 2, 2, 2]
    });
    const headerCell = (text) => cell(text, { fill: DARK_BAND, color: 'white', bold: true, align: 'center', fontSize: 6.8 });
    // Sans numéro (un sous-total n'est pas une rubrique), sauf « SALAIRE BRUT »
    // qui en porte un dans le modèle d'origine.
    const bandRow = (label, gains, retenuesPS, retenuesPP, numero) => [
        cell(numero || '', { align: 'center', fontSize: 6.3, bold: true, fill: BAND }), cell(label, { bold: true, fill: BAND }),
        cell('', { fill: BAND }), cell('', { fill: BAND }),
        cell(gains !== undefined ? fcfa(gains) : '', { align: 'right', bold: true, fill: BAND }),
        cell(retenuesPS !== undefined ? fcfa(retenuesPS) : '', { align: 'right', bold: true, fill: BAND }),
        cell('', { fill: BAND }),
        cell(retenuesPP !== undefined ? fcfa(retenuesPP) : '', { align: 'right', bold: true, fill: BAND })
    ];

    // Mêmes codes de rubrique que les autres modèles (voir construireRubriques
    // / CODE_RUBRIQUE) : un compte qui personnalise ses numéros dans Paramètres
    // les retrouve à l'identique ici, pas une numérotation propre à ce modèle.
    const codes = resolveCodesRubrique(companyInfo.rubriqueCodes);
    const ligne = (label, base, tauxS, gains, retenuesPS, tauxP, retenuesPP, code) => [
        cell(code || '', { align: 'center', fontSize: 6.3 }),
        cell(label),
        cell(base !== undefined && base !== null ? fcfa(base) : '', { align: 'right' }),
        cell(tauxS || '', { align: 'center' }),
        cell(gains !== undefined && gains !== null ? fcfa(gains) : '', { align: 'right' }),
        cell(retenuesPS !== undefined && retenuesPS !== null ? fcfa(retenuesPS) : '', { align: 'right' }),
        cell(tauxP || '', { align: 'center' }),
        cell(retenuesPP !== undefined && retenuesPP !== null ? fcfa(retenuesPP) : '', { align: 'right' })
    ];

    const body = [[
        headerCell('N°'), headerCell('LIBELLÉ'), headerCell('BASE'), headerCell('TAUX'),
        headerCell('GAINS'), headerCell('RETENUE\n(P.S)'), headerCell('TAUX'), headerCell('RETENUE\n(P.P)')
    ]];

    body.push(ligne('Salaire de base', calc.salaireBaseMensuel, '100%', calc.salaireBase, undefined, undefined, undefined, codes.salaireBase));
    if (calc.sursalaire > 0) body.push(ligne('Sursalaire', employee.sursalaire, '100%', calc.sursalaire, undefined, undefined, undefined, codes.sursalaire));
    if (calc.primeAnciennete > 0) body.push(ligne(`Prime d'ancienneté (${calc.ansAnciennete} ans)`, null, null, calc.primeAnciennete, undefined, undefined, undefined, codes.primeAnciennete));
    (employee.primes || []).forEach(p => { if (p.montant > 0) body.push(ligne(p.libelle || p.label || 'Prime', null, null, p.montant, undefined, undefined, undefined, codes.prime)); });
    if (calc.allocationConges > 0) body.push(ligne(`Allocation congés (${calc.joursCP} j)`, null, null, calc.allocationConges, undefined, undefined, undefined, codes.allocationConges));
    (calc.heuresSupTranches || []).forEach(t => body.push(ligne(`Heures supplémentaires — ${t.label}`, calc.tauxHoraire, `×${t.coef}`, t.montant, undefined, undefined, undefined, codes.heuresSup)));
    if (calc.primeTransport > 0) body.push(ligne('Prime de transport non imposable', null, null, calc.primeTransport, undefined, undefined, undefined, codes.primeTransport));
    if (calc.primeTransportImposable > 0) body.push(ligne('Prime de transport (excédent imposable)', null, null, calc.primeTransportImposable, undefined, undefined, undefined, codes.primeTransportImposable));
    if (calc.primeLogement > 0) body.push(ligne('Prime de logement', null, null, calc.primeLogement, undefined, undefined, undefined, codes.primeLogement));

    body.push(bandRow('SALAIRE BRUT', calc.gainsTotaux));

    body.push(ligne('Impôt sur les Traitements et Salaires (ITS)', calc.brutImposable, null, null, calc.salarial.its, null, null, codes.its));
    body.push(ligne('Caisse de Retraite (CR)', calc.baseCNPS, '6.3%', null, calc.salarial.cnps, null, null, codes.cnpsSalariale));
    if (calc.salarial.ricf > 0) body.push(ligne('Réduction Impôt Charge de Famille (RICF)', null, null, null, calc.salarial.ricf, null, null, codes.ricf));

    body.push(bandRow('TOTAL RETENUES SALARIALES', undefined, calc.salarial.total));

    body.push(ligne("Taxe d'Apprentissage (TA)", calc.brutImposable, null, null, null, '0.4%', calc.patronal.fdfpTA, codes.fdfpTA));
    body.push(ligne('Taxe à la Formation Professionnelle Continue (TFPC)', calc.brutImposable, null, null, null, '0.6%', calc.patronal.fdfpFPC, codes.fdfpFPC));
    body.push(bandRow('Total charges fiscales employeurs', undefined, undefined, (calc.patronal.fdfpTA || 0) + (calc.patronal.fdfpFPC || 0)));

    body.push(ligne('CNPS / Caisse de Retraite', calc.baseCNPS, null, null, null, '7.7%', calc.patronal.cnpsRetraite, codes.cnpsPatronale));
    body.push(ligne('CNPS / Prestation Familiale', calc.baseCNPS_PfAtAm, null, null, null, '5.0%', calc.patronal.cnpsPF, codes.cnpsPF));
    body.push(ligne('CNPS / Accident de Travail', calc.baseCNPS_PfAtAm, null, null, null, `${employee.taux_at_mp || employee.taux_at || 2}%`, calc.patronal.cnpsAT, codes.cnpsAT));
    body.push(ligne('CNAM / Assurance maladie', calc.totalPersonnesCMU * 1000, null, null, null, null, calc.patronal.cmu, codes.cmuPatronale));
    const totalChargesSociales = (calc.patronal.cnpsRetraite || 0) + (calc.patronal.cnpsPF || 0) + (calc.patronal.cnpsAT || 0) + (calc.patronal.cmu || 0);
    body.push(bandRow('Total charges sociales employeurs', undefined, undefined, totalChargesSociales));

    const totalChargesPatronales = ((calc.patronal.fdfpTA || 0) + (calc.patronal.fdfpFPC || 0) + totalChargesSociales);
    body.push([
        cell('TOTAL CHARGES PATRONALES', { colSpan: 5, fill: DARK_BAND, color: 'white', bold: true, fontSize: 6.8 }), {}, {}, {}, {},
        cell(`Gains: ${fcfa(calc.gainsTotaux)}`, { fill: DARK_BAND, color: 'white', bold: true, align: 'right', fontSize: 6.3 }),
        cell('', { fill: DARK_BAND }),
        cell(`Retenues: ${fcfa(calc.salarial.total)}`, { fill: DARK_BAND, color: 'white', bold: true, align: 'right', fontSize: 6.3 })
    ]);
    void totalChargesPatronales; // conservé pour un futur pied de page « coût employeur total »

    return {
        pageSize: 'A4', pageMargins: [35, 35, 35, 35],
        content: [
            { columns: headerColumns },
            { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 525, y2: 5, lineWidth: 1, strokeColor: BORDER }] },
            { text: '', margin: [0, 5] },
            infoBlock,
            { text: '', margin: [0, 6] },
            {
                table: { headerRows: 1, widths: ['7%', '29%', '11%', '8%', '11%', '11%', '8%', '15%'], body },
                layout: {
                    hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1.2 : 0.4,
                    vLineWidth: () => 0.4,
                    hLineColor: () => BORDER,
                    vLineColor: () => BORDER
                }
            },
            { text: '', margin: [0, 6] },
            {
                columns: [
                    { width: '*', text: 'CUMUL DE PAIE', fontSize: 8, bold: true, color: '#475569', margin: [0, 8, 0, 0] },
                    {
                        width: 180,
                        table: {
                            widths: ['*'],
                            body: [
                                [{ text: 'NET À PAYER', fontSize: 9, bold: true, alignment: 'center', margin: [0, 2] }],
                                [{ text: fcfa(calc.netAPayer) + ' F', fontSize: 16, bold: true, alignment: 'center', fillColor: YELLOW, margin: [0, 4] }]
                            ]
                        },
                        layout: { hLineWidth: () => 1.5, vLineWidth: () => 1.5, hLineColor: () => '#000', vLineColor: () => '#000' }
                    }
                ]
            },
            { text: `Mode de règlement : ${employee.virement ? `Virement bancaire${employee.rib ? ` — compte n° ${employee.rib}` : ''}` : 'Espèces'}`, fontSize: 7, alignment: 'center', margin: [0, 6, 0, 2] },
            { text: '', margin: [0, 4] },
            { text: `CUMUL SUR L'ANNÉE ${annee} (${moisNum} mois)`, fontSize: 7.5, bold: true, fillColor: '#f1f5f9', margin: [3, 3] },
            {
                margin: [0, 4, 0, 0],
                table: {
                    widths: ['16%', '13%', '16%', '13%', '16%', '13%', '13%'],
                    body: [
                        [
                            cell('Jours travaillés', { fontSize: 6.3, color: '#475569' }), cell(cumuls.cumulJours, { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('I.T.S', { fontSize: 6.3, color: '#475569' }), cell(fcfa(cumuls.cumulITS), { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('Caisse de Retraite', { fontSize: 6.3, color: '#475569' }), cell(fcfa(cumuls.cumulCNPS), { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('', { fontSize: 6.3 })
                        ],
                        [
                            cell('Brut', { fontSize: 6.3, color: '#475569' }), cell(fcfa(cumuls.cumulBrut), { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('Brut imposable', { fontSize: 6.3, color: '#475569' }), cell(fcfa(cumuls.cumulBrutImposable), { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('R.I.C.F', { fontSize: 6.3, color: '#475569' }), cell(fcfa(cumuls.cumulRICF), { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('', { fontSize: 6.3 })
                        ],
                        [
                            cell('Congés acquis', { fontSize: 6.3, color: '#475569' }), cell(`${congesAcquis || 0} j`, { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('Congés pris', { fontSize: 6.3, color: '#475569' }), cell(`${congesPris || 0} j`, { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('Reste à prendre', { fontSize: 6.3, color: '#475569' }), cell(`${congesReste || 0} j`, { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('', { fontSize: 6.3 })
                        ]
                    ]
                },
                layout: 'lightHorizontalLines'
            },
            { text: '', margin: [0, 4] },
            { text: 'P.S : Part Salariale     P.P : Part Patronale', fontSize: 6.3, italics: true, color: '#64748b' },
            { text: '', margin: [0, 6] },
            {
                columns: [
                    { stack: [{ text: "L'Employeur", bold: true, alignment: 'center', margin: [0, 0, 0, 18] }, { text: company.nom, fontSize: 7, alignment: 'center' }, { canvas: [{ type: 'line', x1: 50, y1: 6, x2: 150, y2: 6, lineWidth: 0.5 }] }, { text: 'Cachet & Signature', fontSize: 6, alignment: 'center', margin: [0, 3] }] },
                    { stack: [{ text: 'Le Salarié', bold: true, alignment: 'center', margin: [0, 0, 0, 18] }, { text: `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}`, fontSize: 7, alignment: 'center' }, { canvas: [{ type: 'line', x1: 50, y1: 6, x2: 150, y2: 6, lineWidth: 0.5 }] }, { text: 'Lu et approuvé', fontSize: 6, alignment: 'center', margin: [0, 3] }] }
                ]
            },
            { text: '', margin: [0, 6] },
            { text: 'Pour vous aider à faire valoir vos droits, conservez ce bulletin de paie sans limitation de durée.', fontSize: 6.5, italics: true, color: '#64748b', alignment: 'center' }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generatePdfDefinitionGrilleNumerotee });
