// Modèle de bulletin « togo » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

function generateTogoPdfDefinition(employee, calc, companyInfo = {}) {
    const GRAY_BORDER = '#cbd5e1';
    const NAVY_HEADER = '#1e293b';

    const company = {
        nom: companyInfo.nom_entreprise || employee.nom_entreprise || "VOTRE ENTREPRISE",
        adresse: companyInfo.adresse || employee.adresse || '',
        cnps: companyInfo.numero_cnps || employee.numero_cnps || '____',
        contribuable: companyInfo.numero_contribuable || employee.numero_contribuable || '____',
        cc: companyInfo.numero_cc || employee.numero_cc || '____'
    };

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const moisNom = moisNoms[moisNum - 1];

    const gainsBody = [
        [
            { text: 'RUBRIQUES DE GAINS (RÉMUNÉRATION)', fillColor: '#f8fafc', bold: true, fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Base', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Taux', fillColor: '#f8fafc', bold: true, alignment: 'center', fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Montant (FCFA)', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8, color: '#334155', border: [false, true, false, true] }
        ],
        [
            { text: '1. Salaire de base', fontSize: 8, border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: fcfa(calc.salaireBase), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ]
    ];

    if (calc.primeAnciennete > 0) {
        gainsBody.push([
            { text: '2. Prime d\'ancienneté (' + calc.ansAnciennete + ' ans)', fontSize: 8, border: [false, false, false, false] },
            { text: 'catégorie', alignment: 'right', fontSize: 8, border: [false, false, false, false] },
            { text: (calc.tauxAnciennete || 0) + '%', alignment: 'center', fontSize: 8, border: [false, false, false, false] },
            { text: fcfa(calc.primeAnciennete), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ]);
    }

    if (calc.montantHeuresSup > 0) {
        gainsBody.push([
            { text: '3. Heures supplémentaires', fontSize: 8, border: [false, false, false, false] },
            { text: fcfa(calc.tauxHoraire), alignment: 'right', fontSize: 8, border: [false, false, false, false] },
            { text: calc.nbHeuresSup + 'h', alignment: 'center', fontSize: 8, border: [false, false, false, false] },
            { text: fcfa(calc.montantHeuresSup), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ]);
    }

    const totalPrimes = (calc.sursalaire || 0) + (calc.primesImposables || 0) + (calc.primesNonImposablesRub || 0);
    if (totalPrimes > 0) {
        gainsBody.push([
            { text: '4. Primes (rendement, assiduité, etc.)', fontSize: 8, border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: fcfa(totalPrimes), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ]);
    }

    const totalIndem = (calc.primeTransport || 0) + (calc.primeLogement || 0);
    if (totalIndem > 0) {
        gainsBody.push([
            { text: '5. Indemnités (transport, logement)', fontSize: 8, border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: fcfa(totalIndem), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ]);
    }

    gainsBody.push([
        { text: 'TOTAL SALAIRE BRUT (A)', fillColor: '#f1f5f9', bold: true, fontSize: 8.5, border: [false, true, false, true], colSpan: 3 },
        {}, {},
        { text: fcfa(calc.gainsTotaux) + ' FCFA', fillColor: '#f1f5f9', bold: true, alignment: 'right', fontSize: 8.5, border: [false, true, false, true] }
    ]);

    const socialBody = [
        [
            { text: 'RETENUES SOCIALES SALARIALES', fillColor: '#f8fafc', bold: true, fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Base', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Taux', fillColor: '#f8fafc', bold: true, alignment: 'center', fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Montant (FCFA)', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8, color: '#334155', border: [false, true, false, true] }
        ],
        [
            { text: '1. CNSS – part salariale (Vieillesse, Invalidité)', fontSize: 8, border: [false, false, false, false] },
            { text: '(A)', alignment: 'right', fontSize: 8, border: [false, false, false, false] },
            { text: '4,0%', alignment: 'center', fontSize: 8, border: [false, false, false, false] },
            { text: fcfa(calc.salarial.cnps), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ],
        [
            { text: '2. Assurance Maladie (INAM / AMU)', fontSize: 8, border: [false, false, false, false] },
            { text: '(A)', alignment: 'right', fontSize: 8, border: [false, false, false, false] },
            { text: '5,0%', alignment: 'center', fontSize: 8, border: [false, false, false, false] },
            { text: fcfa(calc.salarial.inam || calc.salarial.cmu), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ],
        [
            { text: 'TOTAL COTISATIONS SOCIALES SALARIALES (B)', fillColor: '#f1f5f9', bold: true, fontSize: 8.5, border: [false, true, false, true], colSpan: 3 },
            {}, {},
            { text: fcfa(calc.salarial.cnps + (calc.salarial.inam || calc.salarial.cmu)) + ' FCFA', fillColor: '#f1f5f9', bold: true, alignment: 'right', fontSize: 8.5, border: [false, true, false, true] }
        ],
        [
            { text: 'REVENU APRÈS COTISATIONS SOCIALES (C = A – B)', fillColor: '#f8fafc', bold: true, fontSize: 8.5, border: [false, false, false, true], colSpan: 3 },
            {}, {},
            { text: fcfa(calc.revenuApresCotisations) + ' FCFA', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8.5, border: [false, false, false, true] }
        ]
    ];

    const virementStr = employee.virement ? 'Virement bancaire' : 'Espèces';
    const ribStr = (employee.virement && employee.rib) ? employee.rib : '';

    return {
        pageSize: 'A4',
        pageMargins: [40, 35, 40, 35],
        content: [
            {
                table: {
                    widths: ['*'],
                    body: [
                        [
                            {
                                stack: [
                                    { text: 'RÉPUBLIQUE TOGOLAISE', alignment: 'center', fontSize: 9, bold: true, color: '#475569' },
                                    { text: company.nom.toUpperCase(), alignment: 'center', fontSize: 13, bold: true, color: NAVY_HEADER, margin: [0, 3, 0, 0] },
                                    { text: company.adresse, alignment: 'center', fontSize: 8, color: '#64748b' },
                                    { text: 'NIF : ' + company.contribuable + '   |   RCCM : ' + company.cc + '   |   Code CNSS : ' + company.cnps, alignment: 'center', fontSize: 7.5, color: '#475569', margin: [0, 4, 0, 0] }
                                ],
                                border: [false, false, false, true]
                            }
                        ]
                    ]
                },
                layout: { hLineColor: function () { return GRAY_BORDER; } }
            },

            { text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', alignment: 'center', fontSize: 13, bold: true, color: NAVY_HEADER, margin: [0, 10, 0, 10] },

            {
                columns: [
                    {
                        stack: [
                            { text: 'Période de paie : ' + moisNom + ' ' + annee, fontSize: 8.5, bold: true },
                            { text: 'Date de paiement : ' + dernierJour + '/' + String(moisNum).padStart(2, '0') + '/' + annee, fontSize: 8, color: '#475569', margin: [0, 2, 0, 0] }
                        ],
                        width: '35%'
                    },
                    {
                        stack: [
                            { text: 'EMPLOYEUR :', fontSize: 8.5, bold: true, color: NAVY_HEADER },
                            { text: company.nom, fontSize: 8, margin: [0, 2, 0, 0] }
                        ],
                        width: '30%'
                    },
                    {
                        stack: [
                            { text: 'SALARIÉ :', fontSize: 8.5, bold: true, color: NAVY_HEADER },
                            { text: (employee.nom || '').toUpperCase() + ' ' + (employee.prenom || ''), fontSize: 8, bold: true, margin: [0, 2, 0, 0] },
                            { text: 'Matricule : ' + (employee.matricule || '____') + '   |   N° CNSS : ' + (employee.num_secu || employee.numero_cnps || '____'), fontSize: 7.5, color: '#475569', margin: [0, 2, 0, 0] },
                            { text: 'Fonction : ' + (employee.poste || '____'), fontSize: 7.5, color: '#475569', margin: [0, 1, 0, 0] }
                        ],
                        width: '35%'
                    }
                ]
            },

            { text: '', margin: [0, 8] },
            { text: 'DÉTAIL DE LA RÉMUNÉRATION (TOGO)', fontSize: 9.5, bold: true, color: NAVY_HEADER, margin: [0, 0, 0, 4] },

            {
                table: { headerRows: 1, widths: ['50%', '15%', '15%', '20%'], body: gainsBody },
                layout: { hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 1 : 0.5; }, vLineWidth: function () { return 0; }, hLineColor: function () { return GRAY_BORDER; } }
            },

            { text: '', margin: [0, 6] },

            {
                table: { headerRows: 1, widths: ['50%', '15%', '15%', '20%'], body: socialBody },
                layout: { hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 1 : 0.5; }, vLineWidth: function () { return 0; }, hLineColor: function () { return GRAY_BORDER; } }
            },

            { text: '', margin: [0, 6] },

            {
                table: {
                    headerRows: 1,
                    widths: ['75%', '25%'],
                    body: [
                        [
                            { text: 'IMPÔT SUR LE REVENU DES PERSONNES PHYSIQUES (IRPP)', fillColor: '#f8fafc', bold: true, fontSize: 8, color: '#334155', border: [false, true, false, true] },
                            { text: 'Montant (FCFA)', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8, color: '#334155', border: [false, true, false, true] }
                        ],
                        [
                            { text: 'Revenu après cotisations sociales (C)', fontSize: 8, border: [false, false, false, false] },
                            { text: fcfa(calc.revenuApresCotisations), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
                        ],
                        [
                            { text: 'Moins : Abattement professionnel 28 % (plafonné)', fontSize: 8, border: [false, false, false, false] },
                            { text: '- ' + fcfa(calc.abattementMensuel), alignment: 'right', fontSize: 8, color: '#dc2626', border: [false, false, false, false] }
                        ],
                        [
                            { text: 'REVENU NET IMPOSABLE MENSUEL (D)', fontSize: 8, bold: true, border: [false, false, false, false] },
                            { text: fcfa(calc.revenuNetImposableMensuel) + ' FCFA', alignment: 'right', bold: true, fontSize: 8, border: [false, false, false, false] }
                        ],
                        [
                            { text: 'IRPP MENSUEL RETENU À LA SOURCE (E)', fillColor: '#f1f5f9', bold: true, fontSize: 8.5, border: [false, true, false, true] },
                            { text: fcfa(calc.salarial.irpp || calc.salarial.its) + ' FCFA', fillColor: '#f1f5f9', bold: true, alignment: 'right', fontSize: 8.5, border: [false, true, false, true] }
                        ]
                    ]
                },
                layout: { hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 1 : 0.5; }, vLineWidth: function () { return 0; }, hLineColor: function () { return GRAY_BORDER; } }
            },

            { text: '', margin: [0, 8] },

            {
                table: {
                    widths: ['75%', '25%'],
                    body: [
                        [
                            { text: 'Salaire brut (A)', fontSize: 8, border: [false, false, false, false] },
                            { text: fcfa(calc.gainsTotaux) + ' FCFA', alignment: 'right', fontSize: 8, border: [false, false, false, false] }
                        ],
                        [
                            { text: 'Moins : Cotisations sociales salariales (B)', fontSize: 8, border: [false, false, false, false] },
                            { text: fcfa(calc.salarial.cnps + (calc.salarial.inam || calc.salarial.cmu)) + ' FCFA', alignment: 'right', fontSize: 8, border: [false, false, false, false] }
                        ],
                        [
                            { text: 'Moins : IRPP mensuel (E)', fontSize: 8, border: [false, false, false, false] },
                            { text: fcfa(calc.salarial.irpp || calc.salarial.its) + ' FCFA', alignment: 'right', fontSize: 8, border: [false, false, false, false] }
                        ],
                        (calc.totalRetenuesDiverses > 0 ? [
                            { text: 'Moins : Autres retenues (F)', fontSize: 8, border: [false, false, false, false] },
                            { text: fcfa(calc.totalRetenuesDiverses) + ' FCFA', alignment: 'right', fontSize: 8, border: [false, false, false, false] }
                        ] : [{ text: '', colSpan: 2, border: [false, false, false, false] }, {}]),
                        [
                            { text: 'NET À PAYER (A – B – E – F)', fillColor: NAVY_HEADER, color: 'white', bold: true, fontSize: 9.5, margin: [4, 5, 4, 5], border: [false, false, false, false] },
                            { text: fcfa(calc.netAPayer) + ' FCFA', fillColor: NAVY_HEADER, color: 'white', bold: true, fontSize: 9.5, alignment: 'right', margin: [4, 5, 4, 5], border: [false, false, false, false] }
                        ]
                    ]
                },
                layout: { hLineWidth: function () { return 0.5; }, vLineWidth: function () { return 0; }, hLineColor: function () { return GRAY_BORDER; } }
            },

            { text: '', margin: [0, 8] },

            {
                table: {
                    widths: ['*'],
                    body: [
                        [
                            {
                                stack: [
                                    { text: 'MODE DE PAIEMENT : ' + virementStr.toUpperCase(), fontSize: 8.5, bold: true, color: NAVY_HEADER },
                                    (ribStr ? { text: 'Numéro de compte : ' + ribStr, fontSize: 8, color: '#475569', margin: [0, 2, 0, 0] } : {}),
                                    { text: 'Arrêté le présent bulletin à la somme de : ' + fcfa(calc.netAPayer) + ' francs CFA.', fontSize: 8, italics: true, color: '#334155', margin: [0, 3, 0, 0] }
                                ],
                                border: [true, true, true, true],
                                margin: [6, 6, 6, 6],
                                fillColor: '#f8fafc'
                            }
                        ]
                    ]
                },
                layout: { hLineColor: function () { return GRAY_BORDER; }, vLineColor: function () { return GRAY_BORDER; } }
            },

            { text: '', margin: [0, 10] },

            {
                columns: [
                    {
                        stack: [
                            { text: 'Pour l\'employeur,', fontSize: 8.5, bold: true, color: NAVY_HEADER },
                            { text: 'Nom et qualité :', fontSize: 7.5, color: '#64748b', margin: [0, 2, 0, 0] },
                            { text: 'Signature et cachet :', fontSize: 7.5, color: '#64748b', margin: [0, 2, 0, 0] }
                        ]
                    },
                    { text: '' },
                    {
                        stack: [
                            { text: 'Lu et approuvé,', fontSize: 8.5, bold: true, color: NAVY_HEADER },
                            { text: 'Le salarié,', fontSize: 7.5, color: '#64748b', margin: [0, 2, 0, 0] },
                            { text: 'Nom et signature :', fontSize: 7.5, color: '#64748b', margin: [0, 2, 0, 0] }
                        ]
                    }
                ]
            }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

Object.assign(exports, { generateTogoPdfDefinition });
