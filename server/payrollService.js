const XLSX = require('xlsx');
const PdfPrinter = require('pdfmake');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

// Définition des polices
const fonts = {
    Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
    }
};
const printer = new PdfPrinter(fonts);

/**
 * Calcul des règles de paie - COTE D'IVOIRE
 */
function calculateSalaryRules(employee) {
    // 1. Inputs
    const salaireBase = parseFloat(employee['salaire_base'] || 0);
    const sursalaire = parseFloat(employee['sursalaire'] || 0);
    const primeTransport = parseFloat(employee['prime_transport'] || 0);
    const autresPrimes = parseFloat(employee['autres_primes'] || 0);

    // Heures Sup
    const nbHeuresSup = parseFloat(employee['heures_sup_nb'] || 0);
    const tauxHeuresSup = parseFloat(employee['heures_sup_taux'] || 0);
    const montantHeuresSup = parseFloat(employee['montant_heures_sup'] || (nbHeuresSup * tauxHeuresSup) || 0);

    // 2. Bases
    const salaireBrut = salaireBase + sursalaire + autresPrimes + montantHeuresSup;
    const brutImposable = salaireBrut;

    // 3. Calculs Charges Employeur
    const baseFiscale = brutImposable;
    const impotEmployeur = Math.round(baseFiscale * 0.012); // 1.20%
    const fdfpTA = Math.round(baseFiscale * 0.004);       // 0.40%
    const fdfpFPC = Math.round(baseFiscale * 0.006);      // 0.60%
    const totalFiscalEmployeur = impotEmployeur + fdfpTA + fdfpFPC;

    // Base Sociale
    const plafondCNPS = 1647315;
    const baseCNPS = Math.min(salaireBrut, plafondCNPS);
    const baseCNPS_PfAt = Math.min(salaireBrut, 70000);

    const cnpsPF = Math.round(baseCNPS_PfAt * 0.0575); // 5.75%
    const cnpsAT = Math.round(baseCNPS_PfAt * 0.05);   // 5.00%
    const cnpsRetraitePat = Math.round(baseCNPS * 0.077); // 7.70%

    // CMU Patronale
    const baseCMU = 1000;
    const cmuPat = 500;

    const totalSocialEmployeur = cnpsPF + cnpsAT + cnpsRetraitePat + cmuPat;
    const totalPatronal = totalFiscalEmployeur + totalSocialEmployeur;

    // 4. Calculs Charges Salariales
    // IS (Impôt sur Salaire) - 1.20%
    const is = Math.round(brutImposable * 0.012);

    // CN (Contribution Nationale) - Barème progressif
    let cn = 0;
    if (brutImposable > 50000) {
        if (brutImposable <= 130000) {
            cn = Math.round(brutImposable * 0.015);
        } else if (brutImposable <= 200000) {
            cn = 1950 + Math.round((brutImposable - 130000) * 0.05);
        } else {
            cn = 5450 + Math.round((brutImposable - 200000) * 0.10);
        }
    }

    // CNPS Retraite Salarié (6.30%)
    const cnpsSal = Math.round(baseCNPS * 0.063);

    // IGR - Barème progressif mensuel CI
    let parts = 1;
    const situation = String(employee['situation_matrimoniale'] || '').toLowerCase();
    if (situation === 'marie' || situation === 'marié') parts += 1;
    parts += (parseFloat(employee['nombre_enfants'] || employee['enfants'] || 0) * 0.5);

    const baseIGR = (brutImposable - is - cn - cnpsSal) * 0.85;
    const quotientFamilial = baseIGR / parts;

    let igrParPart = 0;
    if (quotientFamilial <= 25000) {
        igrParPart = 0;
    } else if (quotientFamilial <= 45583) {
        igrParPart = (quotientFamilial - 25000) * 0.10;
    } else if (quotientFamilial <= 81666) {
        igrParPart = 2058.30 + (quotientFamilial - 45583) * 0.15;
    } else if (quotientFamilial <= 126666) {
        igrParPart = 7470.75 + (quotientFamilial - 81666) * 0.20;
    } else if (quotientFamilial <= 220833) {
        igrParPart = 16470.75 + (quotientFamilial - 126666) * 0.25;
    } else if (quotientFamilial <= 389166) {
        igrParPart = 40012.50 + (quotientFamilial - 220833) * 0.35;
    } else {
        igrParPart = 98929.05 + (quotientFamilial - 389166) * 0.45;
    }

    const igr = Math.round(igrParPart * parts);

    // CMU Salarié
    const cmuSal = 500;

    const totalRetenues = is + cn + igr + cnpsSal + cmuSal;

    // 5. Net
    const netIntermediaire = salaireBrut - totalRetenues;
    const transportNet = primeTransport;
    const netAPayer = netIntermediaire + transportNet;

    return {
        brut: salaireBrut,
        brutImposable,
        baseFiscale,
        baseCNPS,
        baseCNPS_PfAt,
        baseCMU,
        transportNet,
        parts,
        patronal: {
            impotEmployeur, fdfpTA, fdfpFPC, totalFiscal: totalFiscalEmployeur,
            cnpsPF, cnpsAT, cnpsRetraite: cnpsRetraitePat, cmu: cmuPat, totalSocial: totalSocialEmployeur,
            grandTotal: totalPatronal
        },
        salarial: {
            is, cn, igr, cnps: cnpsSal, cmu: cmuSal, total: totalRetenues
        },
        netAPayer
    };
}

/**
 * Formateur FCFA
 */
const fcfa = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '';
    return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

/**
 * Génère le PDF - COPIE EXACTE DU MODELE IVOIRIEN
 */
function generatePdfDefinition(employee, calc, companyInfo = {}) {
    const highlight = '#FFFF00';
    const greenLogo = '#5D8C3D';
    const headerGray = '#E0E0E0';

    // Données entreprise
    const company = {
        nom: companyInfo.nom_entreprise || "Côte d'Ivoire PAIE",
        adresse: companyInfo.adresse || '17 BP 184 Abidjan 17',
        siege_social: companyInfo.siege_social || 'BINGERVILLE-CITEE FDFP-VILLA 67',
        cnps: companyInfo.numero_cnps || 'XXXXXX',
        contribuable: companyInfo.numero_contribuable || 'XXXXXXX',
        email: companyInfo.email || 'infos@cotedivoirepaie.ci',
        telephone: companyInfo.telephone || '+225 0758474646'
    };

    // Période de paie
    const now = new Date();
    const mois = String(now.getMonth() + 1).padStart(2, '0');
    const annee = now.getFullYear();
    const dernierJour = new Date(annee, now.getMonth() + 1, 0).getDate();
    const periodeDebut = `01/${mois}/${annee}`;
    const periodeFin = `${dernierJour}/${mois}/${annee}`;

    // Données employé
    const emp = {
        matricule: String(employee.matricule || '00020'),
        nom: String(employee.nom || 'GBALOU').toUpperCase(),
        prenom: String(employee.prenom || 'SERI GASPARD'),
        emploi: String(employee.poste || employee.fonction || 'OPERATEUR DE SAISIES').toUpperCase(),
        categorie: employee.categorie || 'M2',
        parts: calc.parts.toFixed(2),
        dateEmbauche: employee.date_embauche || '01/07/2018',
        dateNaissance: employee.date_naissance || '01/01/1977',
        ville: employee.ville || 'ABIDJAN',
        numSecu: employee.numero_securite_sociale || '1770718XXXX'
    };

    // Helper pour cellules
    const cell = (text, options = {}) => ({
        text: text?.toString() || '',
        fontSize: options.fontSize || 7,
        bold: options.bold || false,
        alignment: options.align || 'left',
        fillColor: options.fill || null,
        border: options.border !== undefined ? options.border : [true, true, true, true],
        margin: options.margin || [2, 1, 2, 1]
    });

    // Ligne du tableau principal
    const mainRow = (code, libelle, base, taux, gains, retenues, tauxPP, montantPP, isBold = false, bgColor = null) => [
        cell(code, { align: 'center', fill: bgColor, bold: isBold }),
        cell(libelle, { align: 'left', fill: bgColor, bold: isBold }),
        cell(base ? fcfa(base) : '', { align: 'right', fill: bgColor }),
        cell(taux || '', { align: 'center', fill: bgColor }),
        cell(gains ? fcfa(gains) : '', { align: 'right', fill: bgColor, bold: isBold }),
        cell(retenues ? fcfa(retenues) : '', { align: 'right', fill: bgColor }),
        cell(tauxPP || '', { align: 'center', fill: bgColor }),
        cell(montantPP ? fcfa(montantPP) : '', { align: 'right', fill: bgColor })
    ];

    return {
        pageSize: 'A4',
        pageMargins: [20, 20, 20, 20],
        content: [
            // ===== EN-TETE =====
            {
                columns: [
                    // GAUCHE: Logo + Adresse
                    {
                        width: '48%',
                        stack: [
                            {
                                table: {
                                    widths: ['*'],
                                    body: [[{
                                        stack: [
                                            { text: "Côte d'Ivoire", fontSize: 14, bold: true, color: greenLogo },
                                            { text: 'PAIE', fontSize: 22, bold: true, color: greenLogo }
                                        ],
                                        margin: [5, 5, 5, 5]
                                    }]]
                                },
                                layout: 'noBorders'
                            },
                            { text: '', margin: [0, 3] },
                            {
                                table: {
                                    widths: ['auto', '*'],
                                    body: [
                                        [{ text: 'ADRESSE:', bold: true, fontSize: 7 }, { text: company.adresse, fontSize: 7 }],
                                        [{ text: 'SIEGE SOCIAL:', bold: true, fontSize: 7 }, { text: company.siege_social, fontSize: 7 }],
                                        [{ text: 'N° CNPS:', bold: true, fontSize: 7 }, { text: company.cnps, fontSize: 7 }],
                                        [{ text: 'N° CONTRIBUABLE:', bold: true, fontSize: 7 }, { text: company.contribuable, fontSize: 7 }],
                                        [{ text: 'E-mail:', bold: true, fontSize: 7 }, { text: company.email, fontSize: 7 }],
                                        [{ text: 'TELEPHONE:', bold: true, fontSize: 7 }, { text: company.telephone, fontSize: 7 }]
                                    ]
                                },
                                layout: 'noBorders'
                            }
                        ]
                    },
                    // DROITE: Titre + Infos employé
                    {
                        width: '52%',
                        stack: [
                            {
                                table: {
                                    widths: ['*'],
                                    body: [[{
                                        text: 'BULLETIN DE PAIE',
                                        alignment: 'center',
                                        bold: true,
                                        fontSize: 12,
                                        fillColor: headerGray,
                                        margin: [0, 5, 0, 5]
                                    }]]
                                }
                            },
                            {
                                text: `LA PAYE DU ${periodeDebut} AU ${periodeFin}`,
                                alignment: 'center',
                                fontSize: 8,
                                bold: true,
                                margin: [0, 3, 0, 5]
                            },
                            {
                                table: {
                                    widths: ['35%', '65%'],
                                    body: [
                                        [{ text: 'Matricule:', fontSize: 7 }, { text: emp.matricule, fontSize: 7, bold: true }],
                                        [{ text: 'Nom:', fontSize: 7 }, { text: emp.nom, fontSize: 7, bold: true }],
                                        [{ text: 'Prénoms:', fontSize: 7 }, { text: emp.prenom, fontSize: 7, bold: true }],
                                        [{ text: 'Emploi:', fontSize: 7 }, { text: emp.emploi, fontSize: 7 }],
                                        [{ text: 'Catégorie:', fontSize: 7 }, { text: emp.categorie, fontSize: 7 }],
                                        [{ text: 'Nbre de Part:', fontSize: 7 }, { text: emp.parts, fontSize: 7, bold: true, fillColor: highlight }],
                                        [{ text: "Date d'Embauche:", fontSize: 7 }, { text: emp.dateEmbauche, fontSize: 7 }],
                                        [{ text: 'Date de Naissance:', fontSize: 7 }, { text: emp.dateNaissance, fontSize: 7 }],
                                        [{ text: 'Ville:', fontSize: 7 }, { text: emp.ville, fontSize: 7 }],
                                        [{ text: 'N° SECU:', fontSize: 7 }, { text: emp.numSecu, fontSize: 7 }]
                                    ]
                                },
                                layout: 'noBorders'
                            }
                        ]
                    }
                ]
            },

            { text: '', margin: [0, 8] },

            // ===== TABLEAU PRINCIPAL =====
            {
                table: {
                    headerRows: 1,
                    widths: ['8%', '28%', '11%', '7%', '11%', '11%', '9%', '11%'],
                    body: [
                        // En-tête
                        [
                            cell('N° Rubriques', { align: 'center', bold: true, fill: headerGray }),
                            cell('LIBELLE', { align: 'center', bold: true, fill: headerGray }),
                            cell('BASE', { align: 'center', bold: true, fill: headerGray }),
                            cell('TAUX', { align: 'center', bold: true, fill: headerGray }),
                            cell('GAINS', { align: 'center', bold: true, fill: headerGray }),
                            cell('RETENUES', { align: 'center', bold: true, fill: headerGray }),
                            cell('TAUX P.P', { align: 'center', bold: true, fill: headerGray }),
                            cell('MONTANT P.P', { align: 'center', bold: true, fill: headerGray })
                        ],

                        // Section 1: Salaire
                        mainRow('00010', 'SALAIRE DE BASE', calc.brutImposable, '30', employee.salaire_base),
                        mainRow('00020', 'AVANTAGE EN NATURE', employee.autres_primes || null, '30', employee.autres_primes || null),

                        // Salaire Brut
                        mainRow('00500', 'SALAIRE BRUT', null, null, calc.brut, null, null, null, true, highlight),

                        // Brut Imposable
                        mainRow('00501', 'BRUT IMPOSABLE', null, null, calc.brutImposable, null, null, null, true, highlight),

                        // Charges Fiscales Employeur
                        mainRow('00511', 'Impôt Employeur', calc.baseFiscale, null, null, null, '1.20%', calc.patronal.impotEmployeur),
                        mainRow('00512', 'F.D.F.P / T.A', calc.baseFiscale, null, null, null, '0.40%', calc.patronal.fdfpTA),
                        mainRow('00513', 'F.D.F.P / F.P.C', calc.baseFiscale, null, null, null, '0.60%', calc.patronal.fdfpFPC),
                        mainRow('', 'Total Charges Fiscales Employeurs', null, null, null, null, null, calc.patronal.totalFiscal, true),

                        // Charges Sociales Employeur
                        mainRow('00520', 'C.N.P.S / Prestation Familiale', calc.baseCNPS_PfAt, null, null, null, '5.75%', calc.patronal.cnpsPF),
                        mainRow('00521', 'C.N.P.S / Accident de Travail', calc.baseCNPS_PfAt, null, null, null, '5.00%', calc.patronal.cnpsAT),
                        mainRow('00522', 'C.N.P.S / Caisse de Retraite', calc.baseCNPS, null, null, null, '7.70%', calc.patronal.cnpsRetraite),
                        mainRow('00523', 'CMU / ASSURANCE MALADIE', calc.baseCMU, null, null, null, '50.00%', calc.patronal.cmu),
                        mainRow('', 'Total Charges Sociales Employeurs', null, null, null, null, null, calc.patronal.totalSocial, true),

                        // Total Patronal
                        mainRow('', 'Total Charges Patronales', null, null, null, null, null, calc.patronal.grandTotal, true),

                        // Retenues Salariales
                        mainRow('00540', 'Retenue I.S', calc.brutImposable, '1.20%', null, calc.salarial.is),
                        mainRow('00541', 'Retenue C.N', calc.brutImposable, null, null, calc.salarial.cn),
                        mainRow('00542', 'Retenue I.G.R', calc.brutImposable, null, null, calc.salarial.igr),
                        mainRow('00543', 'Retenue C.N.P.S', calc.baseCNPS, '6.30%', null, calc.salarial.cnps),
                        mainRow('00544', 'Retenue C.M.U', calc.baseCMU, '50.00%', null, calc.salarial.cmu),
                        mainRow('', 'Total Retenues', null, null, null, calc.salarial.total, null, null, true),

                        // Salaire Net
                        mainRow('', 'SALAIRE NET', null, null, calc.netAPayer - calc.transportNet, null, null, null, true, highlight),

                        // Transport
                        mainRow('00630', 'INDEMNITE DE TRANSPORT NON IMPOSABLE', calc.transportNet, '30', calc.transportNet)
                    ]
                },
                layout: {
                    hLineWidth: (i) => (i === 0 || i === 1 || i === 4 || i === 5) ? 1.5 : 0.5,
                    vLineWidth: () => 0.5,
                    hLineColor: () => 'black',
                    vLineColor: () => 'black'
                }
            },

            { text: '', margin: [0, 8] },

            // ===== PIED DE PAGE =====
            {
                columns: [
                    // GAUCHE: Cumul de paie
                    {
                        width: '55%',
                        stack: [
                            { text: 'CUMUL DE PAIE', alignment: 'center', bold: true, fontSize: 8, margin: [0, 0, 0, 5] },
                            {
                                table: {
                                    widths: ['33%', '33%', '34%'],
                                    body: [
                                        [
                                            cell('C.N', { align: 'center', bold: true, fill: highlight }),
                                            cell('I.G.R', { align: 'center', bold: true, fill: highlight }),
                                            cell('C.N.P.S Employé', { align: 'center', bold: true, fill: highlight })
                                        ],
                                        [
                                            cell(fcfa(calc.salarial.cn), { align: 'center' }),
                                            cell(fcfa(calc.salarial.igr), { align: 'center' }),
                                            cell(fcfa(calc.salarial.cnps), { align: 'center' })
                                        ],
                                        [
                                            cell('Base Congé', { align: 'center', bold: true, fill: highlight }),
                                            cell('Jours Fiscaux', { align: 'center', bold: true, fill: highlight }),
                                            cell('I.S', { align: 'center', bold: true, fill: highlight })
                                        ],
                                        [
                                            cell(fcfa(calc.brutImposable), { align: 'center' }),
                                            cell('30', { align: 'center' }),
                                            cell(fcfa(calc.salarial.is), { align: 'center' })
                                        ],
                                        [
                                            { text: '', border: [false, false, false, false] },
                                            { text: '', border: [false, false, false, false] },
                                            cell('Brut Imposable', { align: 'center', bold: true, fill: highlight })
                                        ],
                                        [
                                            { text: '', border: [false, false, false, false] },
                                            { text: '', border: [false, false, false, false] },
                                            cell(fcfa(calc.brutImposable), { align: 'center' })
                                        ]
                                    ]
                                }
                            }
                        ]
                    },
                    // DROITE: Net
                    {
                        width: '45%',
                        stack: [
                            {
                                table: {
                                    widths: ['50%', '50%'],
                                    body: [
                                        [
                                            cell('GAINS', { align: 'right', bold: true }),
                                            cell(fcfa(calc.brut + calc.transportNet), { align: 'right' })
                                        ],
                                        [
                                            cell('RETENUES', { align: 'right', bold: true }),
                                            cell(fcfa(calc.salarial.total), { align: 'right' })
                                        ],
                                        [
                                            cell('NET A PAYER', { align: 'center', bold: true, fill: highlight }),
                                            cell(fcfa(calc.netAPayer), { align: 'center', bold: true, fill: highlight, fontSize: 9 })
                                        ]
                                    ]
                                },
                                margin: [10, 0, 0, 5]
                            },
                            {
                                table: {
                                    widths: ['50%', '50%'],
                                    body: [
                                        [
                                            cell('REGLEMENT:', { align: 'right', bold: true, fill: highlight }),
                                            cell('Virement', { align: 'center', bold: true, fill: highlight })
                                        ],
                                        [
                                            cell('XXXX', { align: 'center', fill: highlight }),
                                            cell('01001 1234567890 00', { align: 'center', fill: highlight })
                                        ]
                                    ]
                                },
                                margin: [10, 0, 0, 0]
                            }
                        ]
                    }
                ]
            }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 7 }
    };
}

exports.processPayrollFile = async (dataPath, outputPath, templatePath = null) => {
    return new Promise((resolve, reject) => {
        try {
            console.log(`[RH] Lecture Excel: ${dataPath}`);
            const workbook = XLSX.readFile(dataPath);

            const getSheetData = (name) => {
                const s = workbook.Sheets[name];
                return s ? XLSX.utils.sheet_to_json(s) : [];
            };

            // Recherche flexible de la feuille employés
            let employesSheetName = workbook.SheetNames.find(n =>
                n.toUpperCase() === 'EMPLOYES' ||
                n.toUpperCase() === 'EMPLOYES' || // Doublon intentionnel pour clarté
                n.toUpperCase() === 'EMPLOYES' ||
                n.toUpperCase() === 'EMPLOYÉS'
            );

            if (!employesSheetName && workbook.SheetNames.length > 0) {
                // Fallback: Si une seule feuille, on l'utilise
                if (workbook.SheetNames.length === 1) {
                    employesSheetName = workbook.SheetNames[0];
                }
            }

            if (!employesSheetName) {
                return reject(new Error("Feuille 'EMPLOYES' introuvable dans le fichier Excel."));
            }

            const employesList = getSheetData(employesSheetName);
            if (employesList.length === 0) return reject(new Error(`La feuille ${employesSheetName} est vide`));

            // Lecture des données d'entreprise depuis INFORMATIONS_ENTREPRISE
            let entrepriseList = getSheetData('INFORMATIONS_ENTREPRISE');
            if (entrepriseList.length === 0) {
                entrepriseList = getSheetData('ENTREPRISE');
            }
            const companyInfo = entrepriseList.length > 0 ? entrepriseList[0] : {};

            // Data merging
            const remuList = getSheetData('REMUNERATION');
            const indexBy = (arr, key) => arr.reduce((acc, item) => ({ ...acc, [item[key]]: item }), {});
            const remuMap = indexBy(remuList, 'id_employe');

            const fullEmployees = employesList.map(emp => ({
                ...emp,
                ...(remuMap[emp.id_employe] || {})
            }));

            // Output init
            const isDocxMode = !!templatePath;
            let docTemplateContent = null;
            if (isDocxMode) docTemplateContent = fs.readFileSync(templatePath, 'binary');

            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => resolve({ count: fullEmployees.length, type: isDocxMode ? 'docx' : 'pdf' }));
            archive.on('error', (err) => reject(err));
            archive.pipe(output);

            fullEmployees.forEach((emp, index) => {
                try {
                    const calculs = calculateSalaryRules(emp);
                    const rawName = String(emp['nom'] || `Emp${index}`);
                    const safeName = rawName.replace(/[^a-z0-9]/gi, '_');

                    if (isDocxMode) {
                        const viewData = { ...emp, ...calculs, date_jour: new Date().toLocaleDateString() };
                        const zip = new PizZip(docTemplateContent);
                        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
                        doc.render(viewData);
                        archive.append(doc.getZip().generate({ type: 'nodebuffer' }), { name: `bulletin_${safeName}.docx` });
                    } else {
                        const docDefinition = generatePdfDefinition(emp, calculs, companyInfo);
                        const pdfDoc = printer.createPdfKitDocument(docDefinition);
                        let chunks = [];
                        pdfDoc.on('data', (chunk) => chunks.push(chunk));
                        pdfDoc.on('end', () => {
                            const result = Buffer.concat(chunks);
                            archive.append(result, { name: `bulletin_${safeName}.pdf` });
                        });
                        pdfDoc.end();
                    }
                } catch (err) {
                    console.error("Error creating PDF for " + emp.nom, err);
                }
            });

            setTimeout(() => archive.finalize(), 500);

        } catch (e) { reject(e); }
    });
};
