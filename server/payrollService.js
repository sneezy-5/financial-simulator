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
    const salaireBaseMensuel = parseFloat(employee['salaire_base'] || 0);
    const heuresMensuelles = parseFloat(employee['heures_mensuelles'] || 173.33);

    // Calcul du salaire de base effectif (prorata)
    const salaireBase = Math.round((salaireBaseMensuel / 173.33) * heuresMensuelles);

    const sursalaire = parseFloat(employee['sursalaire'] || 0);
    const primeTransport = parseFloat(employee['prime_transport'] || 0);
    const autresPrimes = parseFloat(employee['autres_primes'] || 0);
    const primesNonImposables = parseFloat(employee['primes_non_imposables'] || 0);

    // Heures Sup
    const nbHeuresSup = parseFloat(employee['heures_sup_nb'] || 0);
    const tauxHeuresSup = parseFloat(employee['heures_sup_taux'] || 0);
    const montantHeuresSup = Math.round(parseFloat(employee['montant_heures_sup'] || (nbHeuresSup * tauxHeuresSup) || 0));

    // 2. Bases
    const salaireBrut = salaireBase + sursalaire + autresPrimes + montantHeuresSup;
    const brutImposable = salaireBrut;

    // 3. Calculs Charges Employeur
    const baseFiscale = brutImposable;
    const impotEmployeur = Math.round(baseFiscale * 0.012); // Taxe employeur 1.2%
    const fdfpTA = Math.round(baseFiscale * 0.004);
    const fdfpFPC = Math.round(baseFiscale * 0.006);
    const totalFiscalEmployeur = impotEmployeur + fdfpTA + fdfpFPC;

    const plafondCNPS = 3375000;
    const baseCNPS = Math.min(brutImposable, plafondCNPS);
    const baseCNPS_PfAtAm = Math.min(brutImposable, 75000); // Plafond SMIG 2023 = 75 000

    // Taux AT configurable selon secteur d'activité (2% à 5%)
    const tauxAT = parseFloat(employee['taux_at'] || 0.02);
    const cnpsPF = Math.round(baseCNPS_PfAtAm * 0.05);      // 5% Prestations Familiales
    const cnpsAM = Math.round(baseCNPS_PfAtAm * 0.0075);    // 0.75% Assurance Maternité
    const cnpsAT = Math.round(baseCNPS_PfAtAm * tauxAT);    // 2-5% Accident du Travail
    const cnpsRetraitePat = Math.round(baseCNPS * 0.077);    // 7.7% Retraite Patronale

    // CMU : 500 F par tête (salarié + ayants droit)
    const nbAyantsDroitCMU = Math.max(0, parseInt(employee['ayants_droit_cmu'] || 0));
    const cmuPat = 500 * (1 + nbAyantsDroitCMU);  // 500 par tête
    const cmuSal = 500 * (1 + nbAyantsDroitCMU);  // 500 par tête

    const totalSocialEmployeur = cnpsPF + cnpsAM + cnpsAT + cnpsRetraitePat + cmuPat;
    const totalPatronal = totalFiscalEmployeur + totalSocialEmployeur;

    // 4. Calculs Charges Salariales
    const cnpsSal = Math.round(baseCNPS * 0.063) // 6.3% Retraite Salariale

    let itsFinal = 0, ricf = 0, baseTaxableITS = 0;
    let is = 0, cn = 0, igr = 0;

    let n = Math.min(parseFloat(employee['nombre_enfants'] || employee['enfants'] || 0), 4);
    let parts = 1;
    const situation = String(employee['situation_matrimoniale'] || '').toLowerCase();

    if (situation.includes('mari')) {
        // Marié : Base 2 + 0.5 par enfant
        parts = 2 + (n * 0.5);
    } else if (situation.includes('veuf') || situation.includes('veuv')) {
        // Veuf : 1 part si sans enfant, sinon Base 2 + 0.5 par enfant (comme marié)
        parts = (n > 0) ? (2 + (n * 0.5)) : 1;
    } else {
        // Célibataire, Divorcé : 1 part si sans enfant, sinon Base 1.5 + 0.5 par enfant
        parts = (n > 0) ? (1.5 + (n * 0.5)) : 1;
    }
    parts = Math.min(parts, 5.0);

    const regime = employee['regime'] || 'ancien';

    if (regime !== 'ancien') {
        // ---- RÉFORME 2024 (ITS UNIQUE) ----
        // L'utilisateur précise : "L’ITS est calculé sur le salaire brut imposable"
        const sal_imposable = brutImposable;
        const tranches = [
            { plafond: 75000, taux: 0.00 },
            { plafond: 240000, taux: 0.16 },
            { plafond: 800000, taux: 0.21 },
            { plafond: 2400000, taux: 0.24 },
            { plafond: 8000000, taux: 0.28 },
            { plafond: Infinity, taux: 0.32 }
        ];

        let impot_brut = 0;
        let prec = 0;
        for (const { plafond, taux } of tranches) {
            if (sal_imposable <= prec) break;
            impot_brut += (Math.min(sal_imposable, plafond) - prec) * taux;
            prec = plafond;
        }

        const itsBrut = Math.round(impot_brut);
        ricf = Math.max(0, (parts - 1) * 11000); // 0.5 part = 5500
        itsFinal = Math.max(0, itsBrut - ricf);
        baseTaxableITS = sal_imposable;

    } else {
        // ---- ANCIENNE LOI (IS, CN, IGR) ----
        is = Math.round(brutImposable * 0.012)
        if (brutImposable > 50000) {
            if (brutImposable <= 130000) cn = Math.round((brutImposable - 50000) * 0.015)
            else if (brutImposable <= 200000) cn = 1200 + Math.round((brutImposable - 130000) * 0.05)
            else cn = 4700 + Math.round((brutImposable - 200000) * 0.10)
        }

        const baseIGR = (brutImposable - is - cn - cnpsSal) * 0.85
        const quotientFamilial = baseIGR / parts

        let igrParPart = 0
        if (quotientFamilial > 25000) {
            if (quotientFamilial <= 45583) igrParPart = (quotientFamilial - 25000) * 0.10
            else if (quotientFamilial <= 81666) igrParPart = (quotientFamilial * 0.15) - 2292
            else if (quotientFamilial <= 126666) igrParPart = (quotientFamilial * 0.20) - 6375
            else if (quotientFamilial <= 220833) igrParPart = (quotientFamilial * 0.25) - 12708
            else if (quotientFamilial <= 389166) igrParPart = (quotientFamilial * 0.35) - 34792
            else igrParPart = (quotientFamilial * 0.45) - 73708
        }
        igr = Math.max(0, Math.round(igrParPart * parts))
    }

    const acompte = parseFloat(employee['acompte'] || 0)
    const avance = parseFloat(employee['avance'] || 0)
    const opposition = parseFloat(employee['opposition'] || 0)
    const autresRetenues = parseFloat(employee['autres_retenues'] || 0)

    const impots = regime !== 'ancien' ? itsFinal : (is + cn + igr)
    const totalRetenues = impots + cnpsSal + cmuSal + acompte + avance + opposition + autresRetenues

    // 5. Net
    const netIntermediaire = salaireBrut - totalRetenues
    const netAPayer = netIntermediaire + primeTransport + primesNonImposables

    return {
        brut: salaireBrut,
        salaireBase,
        salaireBaseMensuel,
        sursalaire,
        autresPrimes,
        heuresMensuelles,
        brutImposable,
        baseFiscale: brutImposable,
        baseCNPS,
        baseCNPS_PfAtAm: baseCNPS_PfAtAm,
        baseCMU: cmuPat + cmuSal,
        nbAyantsDroitCMU,
        tauxAT,
        transportNet: primeTransport,
        primesNonImposables,
        parts,
        patronal: {
            impotEmployeur, fdfpTA, fdfpFPC, totalFiscal: totalFiscalEmployeur,
            cnpsPF, cnpsAM, cnpsAT, cnpsRetraite: cnpsRetraitePat, cmu: cmuPat,
            totalSocial: totalSocialEmployeur,
            grandTotal: totalPatronal
        },
        salarial: {
            its: itsFinal, ricf, is, cn, igr, cnps: cnpsSal, cmu: cmuSal,
            acompte, avance, opposition, autres: autresRetenues,
            total: totalRetenues, regime
        },
        baseTaxableITS,
        ricf,
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

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    if (dateStr.includes('-')) {
        const [y, m, d] = dateStr.split('-');
        if (y.length === 4) return `${d}/${m}/${y}`;
    }
    return dateStr;
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
        siege_social: companyInfo.siege_social || employee.siege_social || 'BINGERVILLE-CITEE FDFP-VILLA 67',
        cnps: companyInfo.numero_cnps || '0001122',
        contribuable: companyInfo.numero_contribuable || '025555',
        email: companyInfo.email_entreprise || employee.email_entreprise || 'infos@cotedivoirepaie.ci',
        telephone: companyInfo.tel_entreprise || employee.tel_entreprise || '+225 0758474646'
    };

    // Période de paie (utilise mois/annee de l'employé si fournis)
    const now = new Date();
    const moisNum = employee.mois ? parseInt(employee.mois) : (now.getMonth() + 1);
    const annee = employee.annee ? parseInt(employee.annee) : now.getFullYear();
    const mois = String(moisNum).padStart(2, '0');
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periodeDebut = `01/${mois}/${annee}`;
    const periodeFin = `${dernierJour}/${mois}/${annee}`;

    // Données employé
    const emp = {
        matricule: String(employee.matricule || '0020'),
        nom: String(employee.nom || 'GBALOU').toUpperCase(),
        prenom: String(employee.prenom || 'SERI GASPARD'),
        emploi: String(employee.poste || employee.fonction || 'OPERATEUR DE SAISIES').toUpperCase(),
        categorie: employee.categorie || 'M2',
        parts: calc.parts.toFixed(2),
        dateEmbauche: formatDate(employee.date_embauche) || '01/07/2018',
        dateNaissance: formatDate(employee.date_naissance) || '01/01/1977',
        ville: employee.ville || 'ABIDJAN',
        numSecu: employee.num_secu || employee.numero_securite_sociale || '1770718XXXX',
        modeReglement: employee.mode_reglement || 'Virement',
        banqueNom: employee.banque_nom || 'XXXX',
        banqueCompte: employee.banque_compte || '01001 1234567890 00'
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

    // Ligne du tableau principal (10 colonnes - Modèle Professionnel)
    const mainRow = (code, libelle, nombre, base, tauxGain, gains, tauxSal, retenues, tauxPat, montantPat, isBold = false, bgColor = null) => [
        cell(code, { align: 'center', fill: bgColor, bold: isBold }),
        cell(libelle, { align: 'left', fill: bgColor, bold: isBold }),
        cell(nombre || '', { align: 'center', fill: bgColor }),
        cell(base ? fcfa(base) : '', { align: 'right', fill: bgColor }),
        cell(tauxGain || '', { align: 'center', fill: bgColor }),
        cell(gains ? fcfa(gains) : '', { align: 'right', fill: bgColor, bold: isBold }),
        cell(tauxSal || '', { align: 'center', fill: bgColor }),
        cell(retenues ? fcfa(retenues) : '', { align: 'right', fill: bgColor }),
        cell(tauxPat || '', { align: 'center', fill: bgColor }),
        cell(montantPat ? fcfa(montantPat) : '', { align: 'right', fill: bgColor })
    ];

    return {
        pageSize: 'A4',
        pageMargins: [20, 20, 20, 20],
        content: [
            // ===== EN-TETE STYLE BOITES CIV =====
            {
                table: {
                    widths: ['48%', '4%', '48%'],
                    body: [
                        [
                            {
                                stack: [
                                    { text: company.nom, fontSize: 10, bold: true },
                                    { text: company.adresse, fontSize: 7 },
                                    { text: `N° C.C.: ${company.contribuable}`, fontSize: 7 },
                                    { text: `N° CNPS: ${company.cnps}`, fontSize: 7 },
                                    { text: `TEL: ${company.telephone}`, fontSize: 7 },
                                ],
                                border: [true, true, true, true]
                            },
                            { text: '', border: [false, false, false, false] },
                            {
                                stack: [
                                    { text: emp.nom + ' ' + emp.prenom, fontSize: 10, bold: true, alignment: 'center' },
                                    {
                                        columns: [
                                            { text: `Matricule: ${emp.matricule}`, fontSize: 7 },
                                            { text: `Situation: ${employee.situation_matrimoniale}`, fontSize: 7 }
                                        ]
                                    },
                                    { text: `Emploi: ${emp.emploi}`, fontSize: 7 },
                                    { text: `Catégorie: ${emp.categorie}`, fontSize: 7 },
                                    { text: `Parts: ${emp.parts}`, fontSize: 7, bold: true }
                                ],
                                border: [true, true, true, true],
                                margin: [5, 5, 5, 5]
                            }
                        ]
                    ]
                },
                layout: { hLineWidth: () => 1, vLineWidth: () => 1 }
            },

            { text: '', margin: [0, 5] },
            {
                text: `BULLETIN DE PAIE - Période du ${periodeDebut} au ${periodeFin}`,
                alignment: 'center', fontSize: 9, bold: true, color: '#1e40af'
            },
            { text: '', margin: [0, 5] },

            { text: '', margin: [0, 8] },

            // ===== TABLEAU PRINCIPAL =====
            {
                table: {
                    headerRows: 2,
                    widths: ['4%', '23%', '7%', '8%', '6%', '10%', '6%', '11%', '6%', '11%'],
                    body: [
                        // En-tête Ligne 1
                        [
                            { text: 'N°', rowSpan: 2, alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            { text: 'Désignation', rowSpan: 2, alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            { text: 'Nombre', rowSpan: 2, alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            { text: 'Base', rowSpan: 2, alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            { text: 'Gains', colSpan: 2, alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            {},
                            { text: 'Part salariale', colSpan: 2, alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            {},
                            { text: 'Part patronale', colSpan: 2, alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            {}
                        ],
                        // En-tête Ligne 2
                        [
                            {}, {}, {}, {},
                            { text: 'Taux', alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            { text: 'Montant', alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            { text: 'Taux', alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            { text: 'Retenue', alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            { text: 'Taux', alignment: 'center', bold: true, fill: headerGray, fontSize: 6 },
                            { text: 'Retenue', alignment: 'center', bold: true, fill: headerGray, fontSize: 6 }
                        ],

                        // Section Gains
                        mainRow('380', 'SALAIRE DE BASE', calc.heuresMensuelles, (calc.salaireBaseMensuel / 173.33).toFixed(2), '100%', calc.salaireBase, null, null, null, null),
                        mainRow('385', 'SURSALAIRE', null, null, null, calc.sursalaire || null, null, null, null, null),
                        mainRow('395', 'AUTRES PRIMES IMPOSABLES', null, null, null, calc.autresPrimes || null, null, null, null, null),
                        mainRow('', 'TOTAL BRUT', null, null, null, calc.brut, null, null, null, null, true, '#fafafa'),

                        // Section Taxes (ITS 2024 ou Ancien)
                        ...(calc.salarial.regime !== 'ancien' ? [
                            mainRow('405', 'ITS (IMPOT UNIQUE 2024)', null, calc.baseTaxableITS, null, null, null, calc.salarial.its + calc.ricf, null, null),
                            ...(calc.ricf > 0 ? [
                                mainRow('406', 'REDUCTION FAMILLE (RICF)', null, null, null, null, null, -calc.ricf, null, null, false)
                            ] : []),
                            mainRow('412', 'ITS PATRONAL (TA/FPC)', null, calc.brutImposable, null, null, null, null, '2.20%', calc.patronal.totalFiscal)
                        ] : [
                            mainRow('405', 'IMPOT SUR SALAIRE (I.S)', null, calc.brutImposable, null, null, '1.20%', calc.salarial.is, '1.20%', calc.patronal.impotEmployeur),
                            mainRow('410', 'CONTRIBUTION NATIONALE (C.N)', null, calc.brutImposable, null, null, null, calc.salarial.cn, '1.00%', calc.patronal.totalFiscal - calc.patronal.impotEmployeur),
                            mainRow('415', 'I.G.R', null, null, null, null, null, calc.salarial.igr, null, null)
                        ]),

                        // Section Sociale
                        mainRow('430', 'C.M.U (COUVERTURE MALADIE)', (1 + (calc.nbAyantsDroitCMU || 0)).toFixed(0), fcfa(calc.baseCMU), null, null, '50.0%', calc.salarial.cmu, '50.0%', calc.patronal.cmu),
                        mainRow('454', 'CNPS (PENSION DE RETRAITE)', null, calc.baseCNPS, null, null, '6.30%', calc.salarial.cnps, '7.70%', calc.patronal.cnpsRetraite),
                        mainRow('450', 'CNPS (PREST. FAMILIALES)', null, calc.baseCNPS_PfAtAm, null, null, null, null, '5.00%', calc.patronal.cnpsPF),
                        mainRow('451', 'CNPS (ASSURANCE MATERNITE)', null, calc.baseCNPS_PfAtAm, null, null, null, null, '0.75%', calc.patronal.cnpsAM),
                        mainRow('452', 'CNPS (ACCIDENT TRAVAIL)', null, calc.baseCNPS_PfAtAm, null, null, null, null, (calc.tauxAT * 100).toFixed(2) + '%', calc.patronal.cnpsAT),

                        ...(calc.salarial.acompte > 0 ? [
                            mainRow('900', 'ACOMPTES SUR PAIE', null, null, null, null, null, calc.salarial.acompte, null, null)
                        ] : []),
                        ...(calc.salarial.avance > 0 ? [
                            mainRow('910', 'AVANCE / PRÊT', null, null, null, null, null, calc.salarial.avance, null, null)
                        ] : []),
                        ...(calc.salarial.opposition > 0 ? [
                            mainRow('920', 'OPPOSITION / SAISIE', null, null, null, null, null, calc.salarial.opposition, null, null)
                        ] : []),
                        ...(calc.salarial.autres > 0 ? [
                            mainRow('950', 'AUTRES RETENUES DIVERSES', null, null, null, null, null, calc.salarial.autres, null, null)
                        ] : []),

                        mainRow('', 'TOTAL DES COTISATIONS', null, null, null, null, null, calc.salarial.total, null, calc.patronal.grandTotal, true, '#fafafa'),

                        // Net Final
                        mainRow('630', 'PRIME DE TRANSPORT (EXO)', null, null, null, calc.transportNet, null, null, null, null),
                        ...(calc.primesNonImposables > 0 ? [
                            mainRow('640', 'INDEMNITES NON IMPOSABLES', null, null, null, calc.primesNonImposables, null, null, null, null)
                        ] : [])
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

            // ===== BLOC NET A PAYER STYLE CIV =====
            {
                table: {
                    widths: ['30%', '40%', '30%'],
                    body: [
                        [
                            {
                                stack: [
                                    { text: 'CUMULS', bold: true, fontSize: 8, alignment: 'center' },
                                    { text: `Brut: ${fcfa(calc.brut + calc.transportNet + calc.primesNonImposables)}`, fontSize: 7 },
                                    { text: `Charges Sal.: ${fcfa(calc.salarial.total)}`, fontSize: 7 },
                                    { text: `Charges Pat.: ${fcfa(calc.patronal.grandTotal)}`, fontSize: 7 }
                                ],
                                border: [true, true, true, true]
                            },
                            {
                                stack: [
                                    { text: 'NET A PAYER (FCFA)', bold: true, fontSize: 12, alignment: 'center', margin: [0, 5, 0, 0] },
                                    { text: fcfa(calc.netAPayer), bold: true, fontSize: 18, alignment: 'center', color: '#1e40af', margin: [0, 5, 0, 5] }
                                ],
                                fillHighlight: true,
                                border: [true, true, true, true]
                            },
                            {
                                stack: [
                                    { text: 'MODE DE REGLEMENT', bold: true, fontSize: 8, alignment: 'center' },
                                    { text: emp.modeReglement, fontSize: 7, alignment: 'center' },
                                    { text: emp.banqueNom, fontSize: 7, alignment: 'center' },
                                    { text: emp.banqueCompte, fontSize: 6, alignment: 'center' }
                                ],
                                border: [true, true, true, true]
                            }
                        ]
                    ]
                },
                margin: [0, 10, 0, 0]
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

/**
 * Calcul des règles pour un employé unique (simulation manuelle)
 */
exports.calculateSinglePayroll = (employee) => {
    return calculateSalaryRules(employee);
};

/**
 * Génère un PDF individuel et retourne un Buffer
 */
exports.generateSinglePdf = (employee, calculs, companyInfo = {}) => {
    return new Promise((resolve, reject) => {
        try {
            const now = new Date();
            // Prise en compte du mois/année fournis par l'utilisateur
            if (employee.mois) now.setMonth(parseInt(employee.mois) - 1);
            if (employee.annee) now.setFullYear(parseInt(employee.annee));

            const docDefinition = generatePdfDefinition(employee, calculs, companyInfo);
            const pdfDoc = printer.createPdfKitDocument(docDefinition);
            const chunks = [];
            pdfDoc.on('data', (chunk) => chunks.push(chunk));
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            pdfDoc.on('error', (err) => reject(err));
            pdfDoc.end();
        } catch (e) {
            reject(e);
        }
    });
};
