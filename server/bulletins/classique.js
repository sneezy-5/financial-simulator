// Modèle de bulletin « classique » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

/**
 * Génère le PDF - COPIE EXACTE DU MODELE IVOIRIEN
 */
function generatePdfDefinition(employee, calc, companyInfo = {}) {
    const BLUE_DOC = '#1e3a8a';
    const YELLOW_NET = '#FFFF00';
    const GRAY_LIGHT = '#F8FAFC';
    const GRAY_BORDER = '#E2E8F0';

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const { congesAcquis, congesReste, congesPris, jCP } = calculateCongesCounters(employee, calc, annee, moisNum);
    const cumuls = calculateCumuls(employee, calc, annee);

    const company = {
        nom: companyInfo.nom_entreprise || employee.nom_entreprise || "VOTRE ENTREPRISE",
        adresse: companyInfo.adresse || employee.adresse || 'Abidjan, Côte d\'Ivoire',
        cnps: companyInfo.numero_cnps || employee.numero_cnps || '____',
        contribuable: companyInfo.numero_contribuable || employee.numero_contribuable || '____',
        cc: companyInfo.numero_cc || employee.numero_cc || '____',
        num_employeur: companyInfo.numero_employeur || employee.numero_employeur || '____',
        // Facultatif : le compte n'en a pas forcément configuré un (Paramètres >
        // Profil Entreprise). Absent, l'en-tête se rend exactement comme avant.
        logo: companyInfo.logo || null
    };

    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periodeStr = `01/${String(moisNum).padStart(2, '0')}/${annee} au ${dernierJour}/${String(moisNum).padStart(2, '0')}/${annee}`;

    // En-tête : logo optionnel en première colonne, jamais un bloc vide à sa place.
    const headerColumns = [];
    if (company.logo) {
        headerColumns.push({ image: company.logo, fit: [50, 50], margin: [0, 0, 10, 0] });
    }
    headerColumns.push({ stack: [{ text: company.nom, fontSize: 13, bold: true, color: BLUE_DOC }, { text: company.adresse, fontSize: 8 }, { text: `N° RCCM : ${company.contribuable} — N° CC : ${company.cc}`, fontSize: 7, color: '#666' }, { text: `N° CNPS : ${company.cnps}`, fontSize: 7, color: '#666' }], width: '*' });
    headerColumns.push({ text: employee.isLeavePayslip ? 'BULLETIN D\'ALLOCATION\nCONGÉ' : 'BULLETIN DE PAIE\nOFFICIEL', alignment: 'right', fontSize: 10, color: BLUE_DOC, bold: true, width: 100 });

    const cell = (text, opts = {}) => ({
        text: text?.toString() || '',
        fontSize: opts.fontSize || 6.5,
        bold: opts.bold || false,
        alignment: opts.align || 'left',
        fillColor: opts.fill || null,
        border: opts.border || [true, true, true, true],
        // Un bulletin chargé (heures sup détaillées, plusieurs primes, prime
        // d'ancienneté...) peut dépasser une trentaine de lignes — la marge
        // verticale d'origine (3pt) suffisait à elle seule à pousser tout ce
        // qui suit sur une deuxième page rien qu'à cause du nombre de lignes.
        margin: opts.margin || [2, 1.5, 2, 1.5],
        color: opts.color || 'black',
        colSpan: opts.colSpan || null,
        rowSpan: opts.rowSpan || null,
        noWrap: opts.noWrap || false
    });

    const headerCell = (text, opts = {}) => cell(text, { fill: '#334155', color: 'white', bold: true, align: 'center', fontSize: 7, ...opts });

    // Mêmes codes de rubrique que les autres modèles ONDA (voir CODE_RUBRIQUE /
    // Paramètres > Modèles de bulletin) : personnaliser un numéro s'applique
    // ici aussi, pas seulement aux modèles construits sur construireRubriques.
    const codes = resolveCodesRubrique(companyInfo.rubriqueCodes);

    // Colonnes: N° | DESIGNATION | BASE | TAUX(S) | GAINS(S) | RET(S) | TAUX(P) | RET(P)
    const row = (code, label, base, tS, gS, rS, tP, rP, opts = {}) => [
        cell(code || '', { align: 'center', fontSize: 6 }),
        cell(label, { align: 'left', bold: opts.bold }),
        cell(base ? fcfa(base) : '', { align: 'right' }),
        cell(tS || '', { align: 'center' }),
        cell(gS ? fcfa(gS) : '', { align: 'right', color: '#16a34a', bold: opts.bold }),
        cell(rS ? fcfa(rS) : '', { align: 'right', color: '#dc2626', bold: opts.bold }),
        cell(tP || '', { align: 'center' }),
        cell(rP ? fcfa(rP) : '', { align: 'right', color: '#dc2626', bold: opts.bold })
    ];

    const body = [
        [
            headerCell('N°', { rowSpan: 2 }),
            headerCell('DESIGNATION', { rowSpan: 2 }),
            headerCell('BASE', { rowSpan: 2 }),
            headerCell('PART SALARIALE', { colSpan: 3 }),
            {}, {},
            headerCell('PART PATRONALE', { colSpan: 2 }),
            {}
        ],
        [
            {}, {}, {},
            headerCell('Taux'), headerCell('Gains'), headerCell('Retenues'),
            headerCell('Taux'), headerCell('Retenues')
        ]
    ];

    // calc.joursTrav est d\u00e9j\u00e0 calcul\u00e9 correctement par le moteur (base \u2212 absences \u2212 cong\u00e9s).
    const joursTrav = calc.joursTrav !== undefined ? calc.joursTrav : Math.max(0, (employee.jours_travailles || 26) - (employee.absences_jours || 0));

    body.push(row(codes.salaireBase, 'SALAIRE CATEGORIEL', calc.salaireBaseMensuel, joursTrav + '/26', calc.salaireBase, null, null, null));
    if (calc.sursalaire > 0) body.push(row(codes.sursalaire, 'SURSALAIRE', employee.sursalaire, joursTrav + '/26', calc.sursalaire, null, null, null));
    if (calc.primeAnciennete > 0) body.push(row(codes.primeAnciennete, `PRIME D'ANCIENNETE (${calc.ansAnciennete} ans)`, calc.salaireBase + (calc.sursalaire || 0), null, calc.primeAnciennete, null, null, null));
    if (calc.allocationConges > 0) body.push(row(codes.allocationConges, `ALLOCATION CONGES (${calc.joursCP} jrs)`, null, null, calc.allocationConges, null, null, null));

    if (Array.isArray(employee.primes)) {
        employee.primes.forEach(p => { if (p.montant > 0) body.push(row(codes.prime, (p.label || 'PRIME').toUpperCase(), null, null, p.montant, null, null, null)); });
    }
    // Une ligne par palier légal réellement utilisé (41e-46e heure, au-delà,
    // nuit, dimanche/férié...) plutôt qu'une ligne unique au coefficient moyen :
    // c'est ce détail que réclame un bulletin conforme.
    (calc.heuresSupTranches || []).forEach(t => {
        body.push(row(codes.heuresSup, `HEURES SUPPLEMENTAIRES — ${t.label.toUpperCase()} (${t.heures}h)`, calc.tauxHoraire, `×${t.coef}`, t.montant, null, null, null));
    });
    if (calc.primeTransport > 0) body.push(row(codes.primeTransport, 'PRIME DE TRANSPORT (EXO)', null, null, calc.primeTransport, null, null, null));
    if (calc.primeTransportImposable > 0) body.push(row(codes.primeTransportImposable, 'PRIME DE TRANSPORT (EXCEDENT IMPOSABLE)', null, null, calc.primeTransportImposable, null, null, null));
    if (calc.primeLogement > 0) body.push(row(codes.primeLogement, 'PRIME DE LOGEMENT (EXO)', null, null, calc.primeLogement, null, null, null));

    body.push(row('', 'BRUT IMPOSABLE', null, null, calc.brut, null, null, null, { bold: true }));

    body.push(row(codes.cnpsSalariale, 'CNPS - RETRAITE', calc.baseCNPS, '6.3%', null, calc.salarial.cnps, '7.7%', calc.patronal.cnpsRetraite));
    body.push(row(codes.cnpsPF, 'CNPS - PRESTATIONS FAMILIALES', calc.baseCNPS_PfAtAm, null, null, null, '5.0%', calc.patronal.cnpsPF));
    body.push(row(codes.cnpsAT, 'CNPS - ACCIDENT DU TRAVAIL', calc.baseCNPS_PfAtAm, null, null, null, (employee.taux_at_mp || employee.taux_at || 2) + '%', calc.patronal.cnpsAT));
    body.push(row(codes.cnpsAM, 'CNPS - ASSURANCE MATERNITE', calc.baseCNPS_PfAtAm, null, null, null, '0.75%', calc.patronal.cnpsAM));

    body.push(row(codes.its, 'ITS (IMPOT UNIQUE 2024)', calc.brutImposable, null, null, calc.salarial.its + calc.salarial.ricf, null, null));
    if (calc.salarial.ricf > 0) body.push(row(codes.ricf, '   dont R.I.C.F', null, null, calc.salarial.ricf, null, null, null));

    body.push(row(codes.impotEmployeur, 'CN - CONTRIBUTION NATIONALE (EMPLOYEUR)', calc.brutImposable, null, null, null, '1.2%', calc.patronal.cnEmployeur ?? calc.patronal.impotEmployeur));
    if ((calc.patronal.ceEmployeur || 0) > 0) body.push(row(codes.ceEmployeur, 'CE - CONTRIBUTION EMPLOYEUR (EXPATRIE)', calc.brutImposable, null, null, null, '9.2%', calc.patronal.ceEmployeur));
    body.push(row(codes.fdfpTA, 'FDFP - TAXE APPRENTISSAGE', calc.brutImposable, null, null, null, '0.4%', calc.patronal.fdfpTA));
    body.push(row(codes.fdfpFPC, 'FDFP - FORMATION CONTINUE', calc.brutImposable, null, null, null, '0.6%', calc.patronal.fdfpFPC));
    body.push(row(codes.cmuSalariale, `CMU (ASSURANCE MALADIE) [${calc.totalPersonnesCMU} pers.]`, calc.totalPersonnesCMU * 1000, null, null, calc.salarial.cmu, null, calc.patronal.cmu));
    if (calc.salarial.acompte > 0) body.push(row(codes.acompte, 'ACOMPTE / AVANCES', null, null, null, calc.salarial.acompte, null, null));


    return {
        pageSize: 'A4', pageMargins: [40, 30, 40, 30],
        content: [
            { columns: headerColumns },
            { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, strokeColor: GRAY_BORDER }] },
            { text: '', margin: [0, 6] },
            {
                table: {
                    widths: ['35%', '25%', '40%'],
                    body: [
                        [
                            { text: '', border: [false, false, false, false] },
                            { text: '', border: [false, false, false, false] },
                            {
                                table: {
                                    widths: ['50%', '50%'],
                                    body: [
                                        [{ text: 'N° CC', fontSize: 6 }, { text: company.cc, fontSize: 6, bold: true }],
                                        [{ text: 'N° Employeur', fontSize: 6 }, { text: company.num_employeur, fontSize: 6, bold: true }]
                                    ]
                                },
                                layout: 'lightHorizontalLines',
                                margin: [0, -10, 0, 5]
                            }
                        ],
                        [
                            {
                                stack: [
                                    { text: 'SALARIE', fontSize: 8, bold: true, color: 'white', fillColor: '#334155', alignment: 'center', margin: [0, 2] },
                                    {
                                        table: {
                                            widths: ['40%', '60%'],
                                            body: [
                                                [{ text: 'Nom :', fontSize: 7, margin: [0, 2] }, { text: (employee.nom || '').toUpperCase(), fontSize: 7, bold: true }],
                                                [{ text: 'Prénom(s) :', fontSize: 7, margin: [0, 2] }, { text: employee.prenom || '', fontSize: 7, bold: true }],
                                                [{ text: 'Direction :', fontSize: 7, margin: [0, 2] }, { text: employee.direction || '____', fontSize: 7 }],
                                                [{ text: 'Service :', fontSize: 7, margin: [0, 2] }, { text: employee.service || '____', fontSize: 7 }],
                                                [{ text: 'Emploi :', fontSize: 7, margin: [0, 2] }, { text: employee.poste || '', fontSize: 7 }],
                                                [{ text: 'Qualification :', fontSize: 7, margin: [0, 2] }, { text: employee.qualification || '____', fontSize: 7 }],
                                                [{ text: 'Catégorie :', fontSize: 7, margin: [0, 2] }, { text: employee.categorie || '', fontSize: 7 }]
                                            ]
                                        },
                                        layout: 'noBorders'
                                    }
                                ],
                                colSpan: 2
                            },
                            {},
                            {
                                stack: [
                                    { text: '', margin: [0, 10] }, // spacer for SALARIE header align
                                    {
                                        table: {
                                            widths: ['50%', '50%'],
                                            body: [
                                                [{ text: 'N° Matricule', fontSize: 7 }, { text: employee.matricule || '____', fontSize: 7, bold: true }],
                                                [{ text: 'N° CNPS', fontSize: 7 }, { text: employee.num_secu || employee.numero_cnps || '____', fontSize: 7, bold: true }],
                                                [{ text: 'Parts IGR', fontSize: 7 }, { text: calc.parts.toFixed(1), fontSize: 7, bold: true }],
                                                [{ text: 'Type Contrat', fontSize: 7 }, { text: employee.type_contrat || 'CDI', fontSize: 7 }],
                                                [{ text: 'Date entrée', fontSize: 7 }, { text: employee.date_embauche ? new Date(employee.date_embauche).toLocaleDateString('fr-FR') : '____', fontSize: 7 }],
                                                [{ text: 'Ancienneté', fontSize: 7 }, { text: calc.ancienneteTxt || '____', fontSize: 7 }],
                                                [{ text: 'Congés (Acq/Pris/Reste)', fontSize: 6.5 }, { text: `${congesAcquis || 0}j / ${congesPris || 0}j / ${congesReste || 0}j`, fontSize: 6.5, bold: true }]
                                            ]
                                        },
                                        layout: {
                                            hLineWidth: () => 0.5,
                                            vLineWidth: () => 0.5,
                                            hLineColor: () => '#ccc',
                                            vLineColor: () => '#ccc'
                                        }
                                    }
                                ]
                            }
                        ]
                    ]
                },
                layout: 'noBorders',
                margin: [0, 5, 0, 8]
            },
            {
                table: {
                    headerRows: 2,
                    widths: ['6%', '29%', '10%', '9%', '11%', '11%', '9%', '15%'],
                    body: body
                },
                layout: {
                    hLineWidth: (i, node) => (i === 0 || i === 2 || i === node.table.body.length) ? 1.5 : 0.5,
                    vLineWidth: () => 0.5,
                    hLineColor: () => GRAY_BORDER,
                    vLineColor: () => GRAY_BORDER
                }
            },
            { text: '', margin: [0, 8] },
            {
                columns: [
                    {
                        width: '*',
                        table: {
                            widths: ['auto', '35%', '15%', '20%', '20%'],
                            body: [
                                [
                                    { text: 'Cumuls', rowSpan: 5, alignment: 'center', verticalAlign: 'middle', bold: true, fontSize: 12, color: '#94a3b8', margin: [2, 10] },
                                    { text: 'Brut imposable', fontSize: 7, margin: [2, 2] }, { text: fcfa(cumuls.cumulBrutImposable), fontSize: 7, alignment: 'right' },
                                    { text: 'Mode de règlement', fontSize: 8, colSpan: 2, alignment: 'center', bold: true, fillColor: '#f1f5f9' }, {}
                                ],
                                [
                                    {},
                                    { text: 'Nombre de jours', fontSize: 7, margin: [2, 2] }, { text: cumuls.cumulJours, fontSize: 7, alignment: 'right' },
                                    {
                                        stack: [
                                            { text: (employee.virement ? 'VIREMENT' : 'ESPECES'), fontSize: 12, bold: true, color: '#1e3a8a' },
                                            { text: (employee.virement && employee.rib) ? `RIB: ${employee.rib}` : '', fontSize: 6, color: '#64748b', margin: [0, 5, 0, 0] }
                                        ],
                                        colSpan: 2, rowSpan: 4, alignment: 'center', verticalAlign: 'middle'
                                    }, {}
                                ],
                                [
                                    {},
                                    { text: 'ITS', fontSize: 7, margin: [2, 2] }, { text: fcfa(cumuls.cumulITS), fontSize: 7, alignment: 'right' },
                                    {}, {}
                                ],
                                [
                                    {},
                                    { text: 'RICF', fontSize: 7, margin: [2, 2] }, { text: fcfa(cumuls.cumulRICF), fontSize: 7, alignment: 'right' },
                                    {}, {}
                                ],
                                [
                                    {},
                                    { text: 'Cnps', fontSize: 7, margin: [2, 2] }, { text: fcfa(cumuls.cumulCNPS), fontSize: 7, alignment: 'right' },
                                    {}, {}
                                ]
                            ]
                        },
                        layout: {
                            hLineWidth: (i) => (i === 0 || i === 5) ? 1 : 0.5,
                            vLineWidth: (i) => (i === 0 || i === 1 || i === 3 || i === 5) ? 1 : 0.5,
                            hLineColor: () => '#cbd5e1',
                            vLineColor: () => '#cbd5e1'
                        }
                    },
                    { width: 25, text: '' },
                    {
                        width: 180,
                        table: {
                            widths: ['*'],
                            body: [
                                [{ text: 'NET À PAYER', fontSize: 10, bold: true, alignment: 'center', margin: [0, 2] }],
                                [{ text: fcfa(calc.netAPayer) + ' F', alignment: 'center', fontSize: 16, bold: true, fillColor: '#FFFF00', margin: [0, 8] }]
                            ]
                        },
                        layout: {
                            hLineWidth: () => 1.5,
                            vLineWidth: () => 1.5,
                            hLineColor: () => '#000',
                            vLineColor: () => '#000'
                        }
                    }
                ]
            },
            { text: `Période : du ${periodeStr}   —   Mode de paie : ${employee.virement ? 'Virement' : 'Espèces'}`, fontSize: 6.5, color: '#64748b', margin: [0, 6, 0, 0] },
            // Le bloc signatures + mention légale ne doit jamais se couper : un
            // bulletin d'une ligne de plus que la page laissait la mention seule
            // sur une seconde page. `unbreakable` le fait basculer en entier
            // plutôt que de l'écarteler, et les marges resserrées lui donnent
            // la place de tenir sur la première dans l'immense majorité des cas.
            {
                unbreakable: true,
                stack: [
                    { text: '', margin: [0, 8] },
                    {
                        columns: [
                            { stack: [{ text: 'L\'Employeur', bold: true, alignment: 'center', margin: [0, 0, 0, 20] }, { text: company.nom, fontSize: 7, alignment: 'center', margin: [0, 2] }, { canvas: [{ type: 'line', x1: 50, y1: 0, x2: 150, y2: 0, lineWidth: 0.5 }] }, { text: 'Cachet & Signature', fontSize: 6, alignment: 'center', margin: [0, 5] }] },
                            { stack: [{ text: 'Le Salarié', bold: true, alignment: 'center', margin: [0, 0, 0, 20] }, { text: `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}`, fontSize: 7, alignment: 'center', margin: [0, 2] }, { canvas: [{ type: 'line', x1: 50, y1: 0, x2: 150, y2: 0, lineWidth: 0.5 }] }, { text: 'Lu et approuvé', fontSize: 6, alignment: 'center', margin: [0, 5] }] }
                        ]
                    },
                    { text: '', margin: [0, 8] },
                    // Mention légale LOGIPAIE : le bulletin de paie ivoirien n'a pas de délai
                    // de conservation — la mention le rappelle explicitement à l'employé.
                    { text: 'Pour vous aider à faire valoir vos droits, conservez ce bulletin de paie sans limitation de durée.', fontSize: 6.5, italics: true, color: '#64748b', alignment: 'center' }
                ]
            }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generatePdfDefinition });
