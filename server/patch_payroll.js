const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'payrollService.js');
let content = fs.readFileSync(filePath, 'utf8');

const bjLogic = `
function calculateBeninSalaryRules(employee) {
    // 1. Calcul des éléments de base (identique à calculateSalaryRules)
    const salaireBaseMensuel = parseFloat(employee['salaire_base'] || 0);
    const joursDansLeMois = 30;
    const joursBasePaie = parseFloat(employee['jours_travailles'] || 26);
    const joursAbsences = parseFloat(employee['absences_jours'] || 0);
    const autoConges = !!employee['auto_conges'];
    let joursConges = parseFloat(employee['jours_conges_pris'] || 0);

    if (autoConges) {
        const dateRefStr = employee['date_dernier_conge'] || employee['date_embauche'];
        if (dateRefStr) {
            const dRef = new Date(dateRefStr);
            const paieMois = parseInt(employee['mois'] || new Date().getMonth() + 1);
            const paieAnnee = parseInt(employee['annee'] || new Date().getFullYear());
            const dNow = new Date(paieAnnee, paieMois - 1, 1);
            const diffMois = (dNow.getFullYear() - dRef.getFullYear()) * 12 + (dNow.getMonth() - dRef.getMonth());
            if (diffMois > 0) {
                joursConges = Math.min(30, Math.floor(diffMois * 2.2));
            }
        }
    }

    const joursTrav = Math.max(0, joursBasePaie - joursAbsences - joursConges);
    const joursCP = joursConges;

    const salaireBase = Math.round((salaireBaseMensuel / joursDansLeMois) * joursTrav);
    const sursalaireTotal = parseFloat(employee['sursalaire'] || 0);
    const sursalaire = Math.round((sursalaireTotal / joursDansLeMois) * joursTrav);
    
    const primeTransportMensuel = parseFloat(employee['prime_transport'] || 0);
    const primeTransport = (employee['bulletin_type'] === 'conges') ? 0 : Math.round((primeTransportMensuel / joursBasePaie) * joursTrav);
    const primeLogement = parseFloat(employee['prime_logement'] || 0);

    const nbHeuresSup = parseFloat(employee['heures_sup_nb'] || 0);
    const coefHS = parseFloat(employee['heures_sup_coef'] || 1.15);
    const tauxHoraire = salaireBaseMensuel > 0 ? Math.round(salaireBaseMensuel / 173.33) : 0;
    const montantHeuresSup = Math.round(nbHeuresSup * tauxHoraire * coefHS);

    // Primes et autres éléments
    const primesList = Array.isArray(employee['primes']) ? employee['primes'] : [];
    const primesImposables = primesList.filter(p => p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);
    const primesNonImposablesRub = primesList.filter(p => !p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);
    const gratification = parseFloat(employee['gratification'] || 0);

    const salaireBrut = salaireBase + sursalaire + montantHeuresSup + primesImposables + gratification;
    const brutImposable = salaireBrut;
    const gainsTotaux = salaireBrut + primeTransport + primeLogement + primesNonImposablesRub;

    // Calculs spécifiques Bénin
    const baseFiscale = brutImposable;
    const impotEmployeur = Math.round(baseFiscale * 0.04); // VPS = 4%
    const totalFiscalEmployeur = impotEmployeur;

    const plafondCNSS = 1200000;
    const baseCNSS = Math.min(brutImposable, plafondCNSS);

    const cnssPF = Math.round(baseCNSS * 0.09);
    const cnssRetraitePat = Math.round(baseCNSS * 0.064);
    const tauxATPat = parseFloat(employee['taux_at'] || 0.01);
    const cnssAT = Math.round(baseCNSS * tauxATPat);
    
    const totalSocialEmployeur = cnssPF + cnssRetraitePat + cnssAT;
    const totalPatronal = totalFiscalEmployeur + totalSocialEmployeur;

    // Charges salariales
    const cnssSal = Math.round(baseCNSS * 0.036);
    const salImposable = brutImposable - cnssSal; // La particularité du Bénin
    
    const tranches = [
        { plafond: 60000, taux: 0.00 },
        { plafond: 150000, taux: 0.10 },
        { plafond: 250000, taux: 0.15 },
        { plafond: 500000, taux: 0.19 },
        { plafond: Infinity, taux: 0.30 }
    ];
    let itsFinal = 0;
    let prec = 0;
    for (const { plafond, taux } of tranches) {
        if (salImposable <= prec) break;
        itsFinal += (Math.min(salImposable, plafond) - prec) * taux;
        prec = plafond;
    }
    itsFinal = Math.round(itsFinal);

    let redevanceSpeciale = 0;
    if (salImposable > 60000) {
        const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
        if (moisNum === 3) redevanceSpeciale = 1000;
        else if (moisNum === 6) redevanceSpeciale = 3000;
    }

    const acompte = parseFloat(employee['acompte'] || 0);
    const avance = parseFloat(employee['avance'] || 0);
    const opposition = parseFloat(employee['opposition'] || 0);
    const autres = parseFloat(employee['autres_retenues'] || 0);

    const impots = itsFinal + redevanceSpeciale;
    const totalRetenuesDiverses = acompte + avance + opposition + autres;
    const totalRetenues = impots + cnssSal + totalRetenuesDiverses;
    
    const netAPayerRaw = gainsTotaux - totalRetenues;
    const netAPayer = Math.max(0, netAPayerRaw);

    const autresTaxesSalariales = [];
    if (redevanceSpeciale > 0) {
        autresTaxesSalariales.push({ code: '411', label: 'REDEVANCE SPECIALE ORTB/SRTB', base: null, montant: redevanceSpeciale });
    }

    return {
        brut: salaireBrut, salaireBase, salaireBaseMensuel, sursalaire,
        primeAnciennete: 0, ansAnciennete: 0, ancienneteTxt: '____', allocationConges: 0, joursCP,
        gratification, preavisVal: 0, indemLicenciement: 0, indemTransac: 0, fraisFuneraires: 0,
        primesImposables, primesNonImposablesRub, montantHeuresSup, nbHeuresSup, coefHS, tauxHoraire,
        primeTransport, primeLogement,
        brutImposable, gainsTotaux, baseCNPS: baseCNSS, baseCNPS_PfAtAm: baseCNSS, parts: 0, totalPersonnesCMU: 0,
        patronal: {
            impotEmployeur, fdfpTA: 0, fdfpFPC: 0, totalFiscal: totalFiscalEmployeur,
            cnpsPF: cnssPF, cnpsAM: 0, cnpsAT: cnssAT, cnpsRetraite: cnssRetraitePat, cmu: 0,
            totalSocial: totalSocialEmployeur, grandTotal: totalPatronal
        },
        salarial: {
            its: itsFinal, ricf: 0, baseITS: salImposable, is: 0, cn: 0, igr: 0, cnps: cnssSal, cmu: 0,
            acompte, avance, opposition, autres, total: totalRetenues, regime: '2024',
            autresTaxes: autresTaxesSalariales
        },
        netAPayer
    };
}

function generateBeninPdfDefinition(employee, calc, companyInfo = {}) {
    const GRAY_BORDER = '#e2e8f0';
    
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

    const c = (text, align='left', bold=false, colSpan=1) => ({ text: text?text.toString():'', fontSize: 8, alignment: align, bold: bold, margin: [2, 3, 2, 3], colSpan: colSpan });
    const cNum = (val) => ({ text: val ? fcfa(val) : '', fontSize: 8, alignment: 'right', margin: [2, 3, 2, 3] });

    const body = [
        [
            { text: 'RUBRIQUES DE GAINS (ÉLÉMENTS DE RÉMUNÉRATION)', fillColor: '#f8fafc', bold: true, fontSize: 8, border: [false, true, false, true], colSpan: 2 },
            {},
            { text: 'Base', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8, border: [false, true, false, true] },
            { text: 'Taux', fillColor: '#f8fafc', bold: true, alignment: 'center', fontSize: 8, border: [false, true, false, true] },
            { text: 'Montant (FCFA)', fillColor: '#f8fafc', bold: true, alignment: 'right', fontSize: 8, border: [false, true, false, true] }
        ]
    ];

    body.push([{text: '1. Salaire de base', fontSize: 8, border:[false,false,false,false], colSpan: 2}, {}, {text:'', border:[false,false,false,false]}, {text:'', border:[false,false,false,false]}, {text: fcfa(calc.salaireBase), alignment: 'right', fontSize: 8, border:[false,false,false,false]}]);
    if (calc.montantHeuresSup > 0) body.push([{text: '2. Heures supplémentaires', fontSize: 8, border:[false,false,false,false], colSpan: 2}, {}, {text: fcfa(calc.tauxHoraire), alignment:'right', fontSize: 8, border:[false,false,false,false]}, {text: calc.nbHeuresSup + 'h', alignment:'center', fontSize: 8, border:[false,false,false,false]}, {text: fcfa(calc.montantHeuresSup), alignment: 'right', fontSize: 8, border:[false,false,false,false]}]);
    if (calc.primeTransport > 0) body.push([{text: '3. Prime de Transport', fontSize: 8, border:[false,false,false,false], colSpan: 2}, {}, {text:'', border:[false,false,false,false]}, {text:'', border:[false,false,false,false]}, {text: fcfa(calc.primeTransport), alignment: 'right', fontSize: 8, border:[false,false,false,false]}]);
    if (calc.primeLogement > 0) body.push([{text: '4. Prime de Logement', fontSize: 8, border:[false,false,false,false], colSpan: 2}, {}, {text:'', border:[false,false,false,false]}, {text:'', border:[false,false,false,false]}, {text: fcfa(calc.primeLogement), alignment: 'right', fontSize: 8, border:[false,false,false,false]}]);
    
    if (Array.isArray(employee.primes)) {
        employee.primes.forEach(p => { 
            if (p.montant > 0) {
                body.push([{text: (p.label || 'PRIME').toUpperCase(), fontSize: 8, border:[false,false,false,false], colSpan: 2}, {}, {text:'', border:[false,false,false,false]}, {text:'', border:[false,false,false,false]}, {text: fcfa(p.montant), alignment: 'right', fontSize: 8, border:[false,false,false,false]}]);
            }
        });
    }

    body.push([
        { text: 'Total Salaire Brut (A)', fillColor: '#f1f5f9', bold: true, fontSize: 8, border: [false, true, false, true], colSpan: 4 }, {}, {}, {},
        { text: fcfa(calc.gainsTotaux), fillColor: '#f1f5f9', bold: true, alignment: 'right', fontSize: 8, border: [false, true, false, true] }
    ]);

    body.push([
        { text: 'RETENUES LÉGALES ET AUTRES RETENUES', fillColor: '#f8fafc', bold: true, fontSize: 8, border: [false, true, false, true], colSpan: 5 }, {}, {}, {}, {}
    ]);

    body.push([{text: '1. CNSS – part salariale', fontSize: 8, border:[false,false,false,false], colSpan: 2}, {}, {text:'(A)', alignment:'center', fontSize: 8, border:[false,false,false,false]}, {text:'3,6%', alignment:'center', fontSize: 8, border:[false,false,false,false]}, {text: fcfa(calc.salarial.cnps), alignment: 'right', fontSize: 8, border:[false,false,false,false]}]);
    body.push([{text: '2. Salaire imposable (B)', fontSize: 8, border:[false,false,false,false], colSpan: 2}, {}, {text:'(A) - CNSS', alignment:'center', fontSize: 8, border:[false,false,false,false]}, {text:'', border:[false,false,false,false]}, {text: fcfa(calc.salarial.baseITS), alignment: 'right', fontSize: 8, border:[false,false,false,false]}]);
    body.push([{text: '3. IRPP', fontSize: 8, border:[false,false,false,false], colSpan: 2}, {}, {text:'(B)', alignment:'center', fontSize: 8, border:[false,false,false,false]}, {text:'barème', alignment:'center', fontSize: 8, border:[false,false,false,false]}, {text: fcfa(calc.salarial.its), alignment: 'right', fontSize: 8, border:[false,false,false,false]}]);
    
    if (calc.salarial.autresTaxes && calc.salarial.autresTaxes.length > 0) {
        calc.salarial.autresTaxes.forEach(t => {
            body.push([{text: '4. ' + t.label, fontSize: 8, border:[false,false,false,false], colSpan: 2}, {}, {text:'', border:[false,false,false,false]}, {text:'', border:[false,false,false,false]}, {text: fcfa(t.montant), alignment: 'right', fontSize: 8, border:[false,false,false,false]}]);
        });
    }
    
    if (calc.salarial.acompte > 0) body.push([{text: 'Acompte', fontSize: 8, border:[false,false,false,false], colSpan: 2}, {}, {text:'', border:[false,false,false,false]}, {text:'', border:[false,false,false,false]}, {text: fcfa(calc.salarial.acompte), alignment: 'right', fontSize: 8, border:[false,false,false,false]}]);

    body.push([
        { text: 'Total des retenues (C)', fillColor: '#f1f5f9', bold: true, fontSize: 8, border: [false, true, false, true], colSpan: 4 }, {}, {}, {},
        { text: fcfa(calc.salarial.total), fillColor: '#f1f5f9', bold: true, alignment: 'right', fontSize: 8, border: [false, true, false, true] }
    ]);

    const virementStr = employee.virement ? 'Virement bancaire' : 'Espèces';
    const ribStr = (employee.virement && employee.rib) ? employee.rib : '';

    return {
        pageSize: 'A4', pageMargins: [40, 40, 40, 40],
        content: [
            {
                table: {
                    widths: ['*'],
                    body: [
                        [
                            {
                                stack: [
                                    { text: 'RÉPUBLIQUE DU BÉNIN', alignment: 'center', fontSize: 10, bold: true },
                                    { text: company.nom, alignment: 'center', fontSize: 12, bold: true, margin: [0, 5, 0, 0] },
                                    { text: company.adresse, alignment: 'center', fontSize: 9 },
                                    { text: 'NIF : ' + company.contribuable + ' | RCCM : ' + company.cc + ' | Code CNSS : ' + company.cnps, alignment: 'center', fontSize: 8, color: '#475569', margin: [0, 5, 0, 0] }
                                ],
                                border: [false, false, false, true]
                            }
                        ]
                    ]
                }
            },
            { text: 'BULLETIN DE PAIE', alignment: 'center', fontSize: 14, bold: true, margin: [0, 15, 0, 15] },
            {
                columns: [
                    { stack: [ { text: 'Période de paie : ' + moisNom + ' ' + annee, fontSize: 9 }, { text: 'Date de paiement : ' + dernierJour + '/' + String(moisNum).padStart(2, '0') + '/' + annee, fontSize: 9 } ] },
                    { stack: [ { text: 'EMPLOYEUR :', fontSize: 9, bold: true }, { text: 'Nom : ' + company.nom, fontSize: 9 } ] },
                    { stack: [ { text: 'SALARIÉ :', fontSize: 9, bold: true }, { text: 'Nom : ' + (employee.nom || '').toUpperCase() + ' ' + (employee.prenom || ''), fontSize: 9 }, { text: 'Matricule : ' + (employee.matricule || '____'), fontSize: 9 }, { text: 'N° CNSS : ' + (employee.num_secu || '____'), fontSize: 9 }, { text: 'Fonction : ' + (employee.poste || '____'), fontSize: 9 } ] }
                ]
            },
            { text: '', margin: [0, 15] },
            { text: 'DÉTAIL DE LA RÉMUNÉRATION', fontSize: 10, bold: true, margin: [0, 0, 0, 5] },
            {
                table: { headerRows: 1, widths: ['45%', '5%', '15%', '15%', '20%'], body: body },
                layout: { hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 1 : 0; }, vLineWidth: function (i) { return 0; }, hLineColor: function (i) { return GRAY_BORDER; } }
            },
            { text: '', margin: [0, 5] },
            {
                table: {
                    widths: ['*', 'auto'],
                    body: [
                        [
                            { text: 'NET À PAYER (D = A – C)', border: [true, true, false, true], fillColor: '#1e293b', color: 'white', bold: true, fontSize: 10, alignment: 'right', margin: [5, 8, 5, 8] },
                            { text: fcfa(calc.netAPayer) + ' FCFA', border: [false, true, true, true], fillColor: '#1e293b', color: 'white', bold: true, fontSize: 10, alignment: 'right', margin: [5, 8, 5, 8] }
                        ]
                    ]
                },
                layout: { hLineColor: function() { return '#1e293b'; }, vLineColor: function() { return '#1e293b'; } }
            },
            { text: '', margin: [0, 15] },
            {
                table: {
                    widths: ['*'],
                    body: [
                        [
                            {
                                stack: [
                                    { text: 'MODE DE PAIEMENT : ' + virementStr, fontSize: 9, margin: [0, 2] },
                                    (ribStr ? { text: 'Numéro de compte : ' + ribStr, fontSize: 9, margin: [0, 2] } : {}),
                                    { text: 'Arrêté le présent bulletin à la somme de : ' + fcfa(calc.netAPayer) + ' francs CFA.', fontSize: 9, italics: true, margin: [0, 5, 0, 0] }
                                ],
                                border: [true, true, true, true],
                                margin: [10, 10, 10, 10],
                                fillColor: '#f8fafc'
                            }
                        ]
                    ]
                },
                layout: { hLineColor: function() { return GRAY_BORDER; }, vLineColor: function() { return GRAY_BORDER; } }
            },
            { text: '', margin: [0, 20] },
            {
                columns: [
                    { stack: [ { text: 'Pour l\\'employeur,', fontSize: 9 }, { text: 'Nom et qualité :', fontSize: 9, margin: [0, 2] }, { text: 'Signature et cachet :', fontSize: 9, margin: [0, 2] } ] },
                    { text: '' },
                    { stack: [ { text: 'Lu et approuvé,', fontSize: 9 }, { text: 'Le salarié,', fontSize: 9, margin: [0, 2] }, { text: 'Nom et signature :', fontSize: 9, margin: [0, 2] } ] }
                ]
            }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}
`;

content = content.replace(
    'exports.calculateSinglePayroll = (employee) => {\n    return calculateSalaryRules(employee);',
    bjLogic + '\n\nexports.calculateSinglePayroll = (employee) => {\n    if (employee.pays === \'BJ\') return calculateBeninSalaryRules(employee);\n    return calculateSalaryRules(employee);'
);

content = content.replace(
    'const docDefinition = generatePdfDefinition(employee, calculs, companyInfo);',
    'const docDefinition = (employee.pays === \'BJ\') ? generateBeninPdfDefinition(employee, calculs, companyInfo) : generatePdfDefinition(employee, calculs, companyInfo);'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched payrollService.js');
