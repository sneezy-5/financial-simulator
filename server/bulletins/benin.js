// Modèle de bulletin « benin » — extrait tel quel de payrollService.js (phase 6).
const { fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques } = require('./outils');

function generateBeninPdfDefinition(employee, calc, companyInfo = {}) {
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
    const { congesAcquis, congesReste, congesPris } = calculateCongesCounters(employee, calc, annee, moisNum);
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const moisNom = moisNoms[moisNum - 1];

    // 1. GAINS TABLE BODY
    const gainsBody = [
        [
            { text: 'RUBRIQUES DE GAINS (ÉLÉMENTS DE RÉMUNÉRATION)', fillColor: '#f8fafc', bold: true, fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Base', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Taux', fillColor: '#f8fafc', bold: true, alignment: 'center', fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Montant (FCFA)', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8, color: '#334155', border: [false, true, false, true] }
        ]
    ];

    // 1. Salaire de base
    gainsBody.push([
        { text: '1. Salaire de base', fontSize: 8, border: [false, false, false, false] },
        { text: '', border: [false, false, false, false] },
        { text: '', border: [false, false, false, false] },
        { text: fcfa(calc.salaireBase), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
    ]);

    // 2. Heures sup
    if (calc.montantHeuresSup > 0) {
        gainsBody.push([
            { text: '2. Heures supplémentaires', fontSize: 8, border: [false, false, false, false] },
            { text: fcfa(calc.tauxHoraire), alignment: 'right', fontSize: 8, border: [false, false, false, false] },
            { text: calc.nbHeuresSup + 'h', alignment: 'center', fontSize: 8, border: [false, false, false, false] },
            { text: fcfa(calc.montantHeuresSup), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ]);
    }

    // 3. Primes (rendement, fonction, etc.)
    const totalPrimes = (calc.primeAnciennete || 0) + (calc.sursalaire || 0) + (calc.primesImposables || 0) + (calc.primesNonImposablesRub || 0);
    if (totalPrimes > 0) {
        gainsBody.push([
            { text: '3. Primes (rendement, fonction, ancienneté, etc.)', fontSize: 8, border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: fcfa(totalPrimes), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ]);
    }

    // 4. Indemnités (transport, logement, représentation, etc.)
    const totalIndemnites = (calc.primeTransport || 0) + (calc.primeLogement || 0);
    if (totalIndemnites > 0) {
        gainsBody.push([
            { text: '4. Indemnités (transport, logement, etc.)', fontSize: 8, border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: fcfa(totalIndemnites), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ]);
    }

    // 5. Gratifications / Congés Payés
    if (calc.allocationConges > 0) {
        gainsBody.push([
            { text: '5. Gratifications / Congés Payés', fontSize: 8, border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: fcfa(calc.allocationConges), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ]);
    }

    // TOTAL SALAIRE BRUT (A)
    gainsBody.push([
        { text: 'TOTAL SALAIRE BRUT (A)', fillColor: '#f1f5f9', bold: true, fontSize: 8.5, border: [false, true, false, true], colSpan: 3 },
        {}, {},
        { text: fcfa(calc.gainsTotaux) + ' FCFA', fillColor: '#f1f5f9', bold: true, alignment: 'right', fontSize: 8.5, border: [false, true, false, true] }
    ]);


    // 2. RETENUES TABLE BODY
    const retenuesBody = [
        [
            { text: 'RETENUES LÉGALES ET AUTRES RETENUES', fillColor: '#f8fafc', bold: true, fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Base', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Taux', fillColor: '#f8fafc', bold: true, alignment: 'center', fontSize: 8, color: '#334155', border: [false, true, false, true] },
            { text: 'Montant (FCFA)', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8, color: '#334155', border: [false, true, false, true] }
        ]
    ];

    // 1. CNSS salariale
    retenuesBody.push([
        { text: '1. CNSS – part salariale', fontSize: 8, border: [false, false, false, false] },
        { text: '(A)', alignment: 'right', fontSize: 8, border: [false, false, false, false] },
        { text: '3,6%', alignment: 'center', fontSize: 8, border: [false, false, false, false] },
        { text: fcfa(calc.salarial.cnps), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
    ]);

    // 2. Salaire imposable (B)
    retenuesBody.push([
        { text: '2. Salaire imposable (B)', fontSize: 8, bold: true, border: [false, false, false, false] },
        { text: '(A) – CNSS', alignment: 'right', fontSize: 8, border: [false, false, false, false] },
        { text: '', border: [false, false, false, false] },
        { text: fcfa(calc.salarial.baseITS), alignment: 'right', bold: true, fontSize: 8, border: [false, false, false, false] }
    ]);

    // 3. IRPP
    retenuesBody.push([
        { text: '3. IRPP (Impôt sur le Revenu des Personnes Physiques)', fontSize: 8, border: [false, false, false, false] },
        { text: '(B)', alignment: 'right', fontSize: 8, border: [false, false, false, false] },
        { text: 'barème', alignment: 'center', fontSize: 8, border: [false, false, false, false] },
        { text: fcfa(calc.salarial.its), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
    ]);

    // 4. Autres taxes (ex: ORTB)
    if (calc.salarial.autresTaxes && calc.salarial.autresTaxes.length > 0) {
        calc.salarial.autresTaxes.forEach(t => {
            retenuesBody.push([
                { text: '4. ' + t.label, fontSize: 8, border: [false, false, false, false] },
                { text: '', border: [false, false, false, false] },
                { text: '', border: [false, false, false, false] },
                { text: fcfa(t.montant), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
            ]);
        });
    }

    // 5. Autres retenues (acompte, etc.)
    const firstOtherTax = calc.salarial.autresTaxes && calc.salarial.autresTaxes[0] ? calc.salarial.autresTaxes[0].montant : 0;
    const resteRetenues = calc.salarial.total - calc.salarial.its - calc.salarial.cnps - firstOtherTax;
    if (resteRetenues > 0) {
        retenuesBody.push([
            { text: '5. Autres retenues autorisées (avances, acomptes, etc.)', fontSize: 8, border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: fcfa(resteRetenues), alignment: 'right', fontSize: 8, border: [false, false, false, false] }
        ]);
    }

    // TOTAL DES RETENUES (C)
    retenuesBody.push([
        { text: 'TOTAL DES RETENUES (C)', fillColor: '#f1f5f9', bold: true, fontSize: 8.5, border: [false, true, false, true], colSpan: 3 },
        {}, {},
        { text: fcfa(calc.salarial.total) + ' FCFA', fillColor: '#f1f5f9', bold: true, alignment: 'right', fontSize: 8.5, border: [false, true, false, true] }
    ]);

    const virementStr = employee.virement ? 'Virement bancaire' : 'Espèces';
    const ribStr = (employee.virement && employee.rib) ? employee.rib : '';

    return {
        pageSize: 'A4',
        pageMargins: [40, 35, 40, 35],
        content: [
            // EN-TÊTE OFFICIEL BÉNIN
            {
                table: {
                    widths: ['*'],
                    body: [
                        [
                            {
                                stack: [
                                    { text: 'RÉPUBLIQUE DU BÉNIN', alignment: 'center', fontSize: 9, bold: true, color: '#475569' },
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

            // TITRE
            { text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', alignment: 'center', fontSize: 13, bold: true, color: NAVY_HEADER, margin: [0, 12, 0, 12] },

            // CARTOUCHE EMPLOYEUR & SALARIÉ
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
                            { text: 'Fonction : ' + (employee.poste || '____'), fontSize: 7.5, color: '#475569', margin: [0, 1, 0, 0] },
                            { text: 'Congés : ' + (congesAcquis || 0) + 'j acq. / ' + (congesPris || 0) + 'j pris / ' + (congesReste || 0) + 'j reste', fontSize: 7.5, color: '#1e3a8a', bold: true, margin: [0, 1, 0, 0] }
                        ],
                        width: '35%'
                    }
                ]
            },

            { text: '', margin: [0, 10] },
            { text: 'DÉTAIL DE LA RÉMUNÉRATION', fontSize: 9.5, bold: true, color: NAVY_HEADER, margin: [0, 0, 0, 4] },

            // TABLE 1 : GAINS
            {
                table: { headerRows: 1, widths: ['50%', '15%', '15%', '20%'], body: gainsBody },
                layout: { hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 1 : 0.5; }, vLineWidth: function () { return 0; }, hLineColor: function () { return GRAY_BORDER; } }
            },

            { text: '', margin: [0, 8] },

            // TABLE 2 : RETENUES
            {
                table: { headerRows: 1, widths: ['50%', '15%', '15%', '20%'], body: retenuesBody },
                layout: { hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 1 : 0.5; }, vLineWidth: function () { return 0; }, hLineColor: function () { return GRAY_BORDER; } }
            },

            { text: '', margin: [0, 10] },

            // TABLE 3 : RÉCAPITULATIF NET
            {
                table: {
                    widths: ['75%', '25%'],
                    body: [
                        [
                            { text: 'Salaire brut (A)', fontSize: 8, border: [false, false, false, false] },
                            { text: fcfa(calc.gainsTotaux) + ' FCFA', alignment: 'right', fontSize: 8, border: [false, false, false, false] }
                        ],
                        [
                            { text: 'Moins : Total des retenues (C)', fontSize: 8, border: [false, false, false, false] },
                            { text: fcfa(calc.salarial.total) + ' FCFA', alignment: 'right', fontSize: 8, border: [false, false, false, false] }
                        ],
                        [
                            { text: 'NET À PAYER (D = A – C)', fillColor: NAVY_HEADER, color: 'white', bold: true, fontSize: 9.5, margin: [4, 6, 4, 6], border: [false, false, false, false] },
                            { text: fcfa(calc.netAPayer) + ' FCFA', fillColor: NAVY_HEADER, color: 'white', bold: true, fontSize: 9.5, alignment: 'right', margin: [4, 6, 4, 6], border: [false, false, false, false] }
                        ]
                    ]
                },
                layout: { hLineWidth: function () { return 0.5; }, vLineWidth: function () { return 0; }, hLineColor: function () { return GRAY_BORDER; } }
            },

            { text: '', margin: [0, 12] },

            // MODE DE PAIEMENT & ARRETE
            {
                table: {
                    widths: ['*'],
                    body: [
                        [
                            {
                                stack: [
                                    { text: 'MODE DE PAIEMENT : ' + virementStr.toUpperCase(), fontSize: 8.5, bold: true, color: NAVY_HEADER },
                                    (ribStr ? { text: 'Numéro de compte : ' + ribStr, fontSize: 8, color: '#475569', margin: [0, 2, 0, 0] } : {}),
                                    { text: 'Arrêté le présent bulletin à la somme de : ' + fcfa(calc.netAPayer) + ' francs CFA.', fontSize: 8, italics: true, color: '#334155', margin: [0, 4, 0, 0] }
                                ],
                                border: [true, true, true, true],
                                margin: [8, 8, 8, 8],
                                fillColor: '#f8fafc'
                            }
                        ]
                    ]
                },
                layout: { hLineColor: function () { return GRAY_BORDER; }, vLineColor: function () { return GRAY_BORDER; } }
            },

            { text: '', margin: [0, 15] },

            // SIGNATURES
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

Object.assign(exports, { generateBeninPdfDefinition });
