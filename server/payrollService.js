const XLSX = require('xlsx');
const PdfPrinter = require('pdfmake');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
let PDFDocument, rgb;
try {
    const pdfLib = require('pdf-lib');
    PDFDocument = pdfLib.PDFDocument;
    rgb = pdfLib.rgb;
} catch (e) {
    console.warn("pdf-lib n'est pas installé, la génération de PDF visuels échouera.");
}

let puppeteer;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    console.warn("puppeteer n'est pas installé, la génération HTML-to-PDF échouera.");
}

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

    // Jours effectivement travaillés (salaire de base)
    const joursTrav = Math.max(0, joursBasePaie - joursAbsences - joursConges);
    const joursCP = joursConges;

    const salaireBase = Math.round((salaireBaseMensuel / joursDansLeMois) * joursTrav);
    const sursalaireTotal = parseFloat(employee['sursalaire'] || 0);
    const sursalaire = Math.round((sursalaireTotal / joursDansLeMois) * joursTrav);
    const primeTransportMensuel = parseFloat(employee['prime_transport'] || 0);
    const bulletinType = employee['bulletin_type'] || 'habituel';
    const primeTransport = bulletinType === 'conges' ? 0 : Math.round((primeTransportMensuel / joursBasePaie) * joursTrav);
    const primeLogement = parseFloat(employee['prime_logement'] || 0);

    const nbHeuresSup = parseFloat(employee['heures_sup_nb'] || 0);
    const coefHS = parseFloat(employee['heures_sup_coef'] || 1.15);
    const tauxHoraire = salaireBaseMensuel > 0 ? Math.round(salaireBaseMensuel / 173.33) : 0;
    const montantHeuresSup = Math.round(nbHeuresSup * tauxHoraire * coefHS);

    const dateEmbaucheStr = employee['date_embauche'] || employee['Date Embauche'];
    const paieMois = parseInt(employee['mois'] || new Date().getMonth() + 1);
    const paieAnnee = parseInt(employee['annee'] || new Date().getFullYear());

    let primeAnciennete = 0;
    let ansAnciennete = 0;
    let ancienneteTxt = "0 ans 00 mois";

    if (dateEmbaucheStr) {
        const embauche = new Date(dateEmbaucheStr);
        const refDate = new Date(paieAnnee, paieMois - 1, 1);

        let diffAns = refDate.getFullYear() - embauche.getFullYear();
        let diffMois = refDate.getMonth() - embauche.getMonth();
        if (diffMois < 0) {
            diffAns--;
            diffMois += 12;
        }
        ansAnciennete = Math.max(0, diffAns);
        ancienneteTxt = `${ansAnciennete} ans ${String(Math.max(0, diffMois)).padStart(2, '0')} mois`;

        if (ansAnciennete >= 2) {
            const tauxAnc = Math.min(25, 2 + (ansAnciennete - 2));
            primeAnciennete = Math.round(salaireBaseMensuel * (tauxAnc / 100));
        }
    }

    let allocationConges = 0;
    if (joursCP > 0) {
        const baseCP = salaireBaseMensuel + sursalaireTotal + primeAnciennete;
        allocationConges = Math.round((baseCP / joursDansLeMois) * joursCP);
    }

    const primesList = Array.isArray(employee['primes']) ? employee['primes'] : [];
    const primesImposables = primesList.filter(p => p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);
    const primesNonImposablesRub = primesList.filter(p => !p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);

    const gratification = parseFloat(employee['gratification'] || 0);
    const preavisVal = parseFloat(employee['preavis'] || 0);
    const indemLicenciement = parseFloat(employee['indemnite_licenciement'] || 0);
    const indemTransac = parseFloat(employee['indemnite_transactionnelle'] || 0);
    const fraisFuneraires = parseFloat(employee['frais_funeraires'] || 0);

    const salaireBrut = salaireBase + sursalaire + primeAnciennete + allocationConges + montantHeuresSup + primesImposables + gratification + preavisVal;
    const brutImposable = salaireBrut;
    const gainsTotaux = salaireBrut + primeTransport + primeLogement + primesNonImposablesRub + indemLicenciement + indemTransac + fraisFuneraires;

    const baseFiscale = brutImposable;
    const impotEmployeur = Math.round(baseFiscale * 0.012);
    const fdfpTA = Math.round(baseFiscale * 0.004);
    const fdfpFPC = Math.round(baseFiscale * 0.006);
    const totalFiscalEmployeur = impotEmployeur + fdfpTA + fdfpFPC;

    const plafondCNPS = 3375000;
    const baseCNPS = Math.min(brutImposable, plafondCNPS);
    const baseCNPS_PfAtAm = Math.min(brutImposable, 75000);

    const tauxAT = parseFloat(employee['taux_at'] || 0.02);
    const cnpsPF = Math.round(baseCNPS_PfAtAm * 0.05);
    const cnpsAM = Math.round(baseCNPS_PfAtAm * 0.0075);
    const cnpsAT = Math.round(baseCNPS_PfAtAm * tauxAT);
    const cnpsRetraitePat = Math.round(baseCNPS * 0.077);

    const sitCmu = String(employee['situation_matrimoniale'] || '').toLowerCase();
    const conjointCmu = sitCmu.includes('mari') ? 1 : 0;
    const enfantsCmu = Number(employee['nombre_enfants']) || 0;
    const nbPersonnesCMUAuto = 1 + conjointCmu + enfantsCmu;
    const nbAyantsDroitCMU = Math.max(0, parseInt(employee['ayants_droit_cmu']) > 0 ? parseInt(employee['ayants_droit_cmu']) : (nbPersonnesCMUAuto - 1));
    const totalPersonnesCMU = 1 + nbAyantsDroitCMU;

    const cmuPat = 500 * totalPersonnesCMU;
    const cmuSal = 500 * totalPersonnesCMU;

    const totalSocialEmployeur = cnpsPF + cnpsAM + cnpsAT + cnpsRetraitePat + cmuPat;
    const totalPatronal = totalFiscalEmployeur + totalSocialEmployeur;

    const cnpsSal = Math.round(baseCNPS * 0.063);

    let itsFinal = 0, ricf = 0;
    let is = 0, cn = 0, igr = 0;

    let n = Math.min(parseFloat(employee['nombre_enfants'] || 0), 4);
    let parts = 1;
    const situation = String(employee['situation_matrimoniale'] || '').toLowerCase();

    if (situation.includes('mari')) parts = 2 + (n * 0.5);
    else if (situation.includes('veuf') || situation.includes('veuv')) parts = (n > 0) ? (2 + (n * 0.5)) : 1;
    else parts = (n > 0) ? (1.5 + (n * 0.5)) : 1;
    parts = Math.min(parts, 5.0);

    const regime = employee['regime'] || '2024';

    if (regime !== 'ancien') {
        const tranches = [
            { plafond: 75000, taux: 0.00 }, { plafond: 240000, taux: 0.16 },
            { plafond: 800000, taux: 0.21 }, { plafond: 2400000, taux: 0.24 },
            { plafond: 8000000, taux: 0.28 }, { plafond: Infinity, taux: 0.32 }
        ];
        let impotBrut = 0;
        let prec = 0;
        for (const { plafond, taux } of tranches) {
            if (brutImposable <= prec) break;
            impotBrut += (Math.min(brutImposable, plafond) - prec) * taux;
            prec = plafond;
        }
        ricf = Math.max(0, (parts - 1) * 11000);
        itsFinal = Math.max(0, Math.round(impotBrut) - ricf);
    } else {
        is = Math.round(brutImposable * 0.012);
        if (brutImposable > 50000) {
            if (brutImposable <= 130000) cn = Math.round((brutImposable - 50000) * 0.015);
            else if (brutImposable <= 200000) cn = 1200 + Math.round((brutImposable - 130000) * 0.05);
            else cn = 4700 + Math.round((brutImposable - 200000) * 0.10);
        }
        const baseIGR = (brutImposable - is - cn - cnpsSal) * 0.85;
        const qF = baseIGR / parts;
        let igrParPart = 0;
        if (qF > 25000) {
            if (qF <= 45583) igrParPart = (qF - 25000) * 0.10;
            else if (qF <= 81666) igrParPart = (qF * 0.15) - 2292;
            else if (qF <= 126666) igrParPart = (qF * 0.20) - 6375;
            else if (qF <= 220833) igrParPart = (qF * 0.25) - 12708;
            else if (qF <= 389166) igrParPart = (qF * 0.35) - 34792;
            else igrParPart = (qF * 0.45) - 73708;
        }
        igr = Math.max(0, Math.round(igrParPart * parts));
    }

    const acompte = parseFloat(employee['acompte'] || 0);
    const avance = parseFloat(employee['avance'] || 0);
    const opposition = parseFloat(employee['opposition'] || 0);
    const autres = parseFloat(employee['autres_retenues'] || 0);

    const impots = regime !== 'ancien' ? itsFinal : (is + cn + igr);
    const totalRetenues = impots + cnpsSal + cmuSal + acompte + avance + opposition + autres;

    return {
        brut: salaireBrut, salaireBase, salaireBaseMensuel, sursalaire,
        primeAnciennete, ansAnciennete, ancienneteTxt, allocationConges, joursCP,
        gratification, preavisVal, indemLicenciement, indemTransac, fraisFuneraires,
        primesImposables, primesNonImposablesRub, montantHeuresSup, nbHeuresSup, coefHS, tauxHoraire,
        primeTransport, primeLogement,
        brutImposable, gainsTotaux, baseCNPS, baseCNPS_PfAtAm, parts, totalPersonnesCMU,
        patronal: {
            impotEmployeur, fdfpTA, fdfpFPC, totalFiscal: totalFiscalEmployeur,
            cnpsPF, cnpsAM, cnpsAT, cnpsRetraite: cnpsRetraitePat, cmu: cmuPat,
            totalSocial: totalSocialEmployeur, grandTotal: totalPatronal
        },
        salarial: {
            its: itsFinal, ricf, is, cn, igr, cnps: cnpsSal, cmu: cmuSal,
            acompte, avance, opposition, autres, total: totalRetenues, regime
        },
        netAPayer: gainsTotaux - totalRetenues
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
    const BLUE_DOC = '#1e3a8a';
    const YELLOW_NET = '#FFFF00';
    const GRAY_LIGHT = '#F8FAFC';
    const GRAY_BORDER = '#E2E8F0';

    const company = {
        nom: companyInfo.nom_entreprise || employee.nom_entreprise || "VOTRE ENTREPRISE",
        adresse: companyInfo.adresse || employee.adresse || 'Abidjan, Côte d\'Ivoire',
        cnps: companyInfo.numero_cnps || employee.numero_cnps || '____',
        contribuable: companyInfo.numero_contribuable || employee.numero_contribuable || '____',
        cc: companyInfo.numero_cc || employee.numero_cc || '____',
        num_employeur: companyInfo.numero_employeur || employee.numero_employeur || '____'
    };

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periodeStr = `01/${String(moisNum).padStart(2, '0')}/${annee} au ${dernierJour}/${String(moisNum).padStart(2, '0')}/${annee}`;

    const cell = (text, opts = {}) => ({
        text: text?.toString() || '',
        fontSize: opts.fontSize || 6.5,
        bold: opts.bold || false,
        alignment: opts.align || 'left',
        fillColor: opts.fill || null,
        border: opts.border || [true, true, true, true],
        margin: opts.margin || [2, 3, 2, 3],
        color: opts.color || 'black',
        colSpan: opts.colSpan || null,
        rowSpan: opts.rowSpan || null,
        noWrap: opts.noWrap || false
    });

    const headerCell = (text, opts = {}) => cell(text, { fill: '#334155', color: 'white', bold: true, align: 'center', fontSize: 7, ...opts });

    // Colonnes: DESIGNATION | BASE | TAUX(S) | GAINS(S) | RET(S) | TAUX(P) | RET(P)
    const row = (label, base, tS, gS, rS, tP, rP, opts = {}) => [
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
            headerCell('DESIGNATION', { rowSpan: 2 }),
            headerCell('BASE', { rowSpan: 2 }),
            headerCell('PART SALARIALE', { colSpan: 3 }),
            {}, {},
            headerCell('PART PATRONALE', { colSpan: 2 }),
            {}
        ],
        [
            {}, {},
            headerCell('Taux'), headerCell('Gains'), headerCell('Retenues'),
            headerCell('Taux'), headerCell('Retenues')
        ]
    ];

    const joursTrav = Math.max(0, (employee.jours_travailles || 26) - (employee.absences_jours || 0));

    body.push(row('SALAIRE CATEGORIEL', calc.salaireBaseMensuel, joursTrav + '/30', calc.salaireBase, null, null, null));
    if (calc.sursalaire > 0) body.push(row('SURSALAIRE', employee.sursalaire, joursTrav + '/30', calc.sursalaire, null, null, null));
    if (calc.primeAnciennete > 0) body.push(row(`PRIME D'ANCIENNETE (${calc.ansAnciennete} ans)`, calc.salaireBase + (calc.sursalaire || 0), null, calc.primeAnciennete, null, null, null));
    if (calc.allocationConges > 0) body.push(row(`ALLOCATION CONGES (${calc.joursCP} jrs)`, null, null, calc.allocationConges, null, null, null));

    if (Array.isArray(employee.primes)) {
        employee.primes.forEach(p => { if (p.montant > 0) body.push(row((p.label || 'PRIME').toUpperCase(), null, null, p.montant, null, null, null)); });
    }
    if (calc.montantHeuresSup > 0) body.push(row(`HEURES SUPPLEMENTAIRES (${calc.nbHeuresSup}h)`, calc.tauxHoraire, `×${calc.coefHS}`, calc.montantHeuresSup, null, null, null));
    if (calc.primeTransport > 0) body.push(row('PRIME DE TRANSPORT (EXO)', null, null, calc.primeTransport, null, null, null));
    if (calc.primeLogement > 0) body.push(row('PRIME DE LOGEMENT (EXO)', null, null, calc.primeLogement, null, null, null));

    body.push(row('BRUT IMPOSABLE', null, null, calc.brut, null, null, null, { bold: true }));

    body.push(row('CNPS - RETRAITE', calc.baseCNPS, '6.3%', null, calc.salarial.cnps, '7.7%', calc.patronal.cnpsRetraite));
    body.push(row('CNPS - PRESTATIONS FAMILIALES', calc.baseCNPS_PfAtAm, null, null, null, '5.0%', calc.patronal.cnpsPF));
    body.push(row('CNPS - ACCIDENT DU TRAVAIL', calc.baseCNPS_PfAtAm, null, null, null, (employee.taux_at || 2) + '%', calc.patronal.cnpsAT));
    body.push(row('CNPS - ASSURANCE MATERNITE', calc.baseCNPS_PfAtAm, null, null, null, '0.75%', calc.patronal.cnpsAM));

    if (calc.salarial.regime !== 'ancien') {
        body.push(row('ITS (IMPOT UNIQUE 2024)', calc.brutImposable, null, null, calc.salarial.its + calc.salarial.ricf, null, null));
        if (calc.salarial.ricf > 0) body.push(row('   dont R.I.C.F', null, null, calc.salarial.ricf, null, null, null));
    } else {
        body.push(row('IMPOT SUR SALAIRE (I.S)', calc.brutImposable, '1.2%', null, calc.salarial.is, null, null));
        body.push(row('CONTRIBUTION NATIONALE (C.N)', calc.brutImposable, null, null, calc.salarial.cn, null, null));
        body.push(row('I.G.R', null, null, null, calc.salarial.igr, null, null));
    }

    body.push(row('T.A.S.P (IMPOT EMPLOYEUR)', calc.brutImposable, null, null, null, '1.2%', calc.patronal.impotEmployeur));
    body.push(row('FDFP - TAXE APPRENTISSAGE', calc.brutImposable, null, null, null, '0.4%', calc.patronal.fdfpTA));
    body.push(row('FDFP - FORMATION CONTINUE', calc.brutImposable, null, null, null, '0.6%', calc.patronal.fdfpFPC));
    body.push(row(`CMU (ASSURANCE MALADIE) [${calc.totalPersonnesCMU} pers.]`, calc.totalPersonnesCMU * 1000, null, null, calc.salarial.cmu, null, calc.patronal.cmu));
    if (calc.salarial.acompte > 0) body.push(row('ACOMPTE / AVANCES', null, null, null, calc.salarial.acompte, null, null));


    return {
        pageSize: 'A4', pageMargins: [40, 40, 40, 40],
        content: [
            {
                columns: [
                    { stack: [{ text: company.nom, fontSize: 13, bold: true, color: BLUE_DOC }, { text: company.adresse, fontSize: 8 }, { text: `N° RCCM : ${company.contribuable} — N° CC : ${company.cc}`, fontSize: 7, color: '#666' }, { text: `N° CNPS : ${company.cnps}`, fontSize: 7, color: '#666' }], width: '*' },
                    { text: 'BULLETIN DE PAIE\nOFFICIEL', alignment: 'right', fontSize: 10, color: BLUE_DOC, bold: true, width: 100 }
                ]
            },
            { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, strokeColor: GRAY_BORDER }] },
            { text: '', margin: [0, 10] },
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
                                                [{ text: 'N° CNPS', fontSize: 7 }, { text: employee.num_secu || '____', fontSize: 7, bold: true }],
                                                [{ text: 'Parts IGR', fontSize: 7 }, { text: calc.parts.toFixed(1), fontSize: 7, bold: true }],
                                                [{ text: 'Type Contrat', fontSize: 7 }, { text: employee.type_contrat || 'CDI', fontSize: 7 }],
                                                [{ text: 'Ancienneté', fontSize: 7 }, { text: calc.ancienneteTxt || '____', fontSize: 7 }]
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
                margin: [0, 5, 0, 15]
            },
            {
                table: {
                    headerRows: 2,
                    widths: ['34%', '11%', '9%', '11%', '11%', '9%', '15%'],
                    body: body
                },
                layout: {
                    hLineWidth: (i, node) => (i === 0 || i === 2 || i === node.table.body.length) ? 1.5 : 0.5,
                    vLineWidth: () => 0.5,
                    hLineColor: () => GRAY_BORDER,
                    vLineColor: () => GRAY_BORDER
                }
            },
            { text: '', margin: [0, 15] },
            {
                columns: [
                    {
                        width: '*',
                        table: {
                            widths: ['auto', '35%', '15%', '20%', '20%'],
                            body: [
                                [
                                    { text: 'Cumuls', rowSpan: 5, alignment: 'center', verticalAlign: 'middle', bold: true, fontSize: 12, color: '#94a3b8', margin: [2, 10] },
                                    { text: 'Brut imposable', fontSize: 7, margin: [2, 2] }, { text: fcfa(calc.brutImposable), fontSize: 7, alignment: 'right' },
                                    { text: 'Mode de règlement', fontSize: 8, colSpan: 2, alignment: 'center', bold: true, fillColor: '#f1f5f9' }, {}
                                ],
                                [
                                    {},
                                    { text: 'Nombre de jours', fontSize: 7, margin: [2, 2] }, { text: joursTrav, fontSize: 7, alignment: 'right' },
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
                                    { text: 'ITS', fontSize: 7, margin: [2, 2] }, { text: fcfa(calc.salarial.its), fontSize: 7, alignment: 'right' },
                                    {}, {}
                                ],
                                [
                                    {},
                                    { text: 'RICF', fontSize: 7, margin: [2, 2] }, { text: fcfa(calc.salarial.ricf), fontSize: 7, alignment: 'right' },
                                    {}, {}
                                ],
                                [
                                    {},
                                    { text: 'Cnps', fontSize: 7, margin: [2, 2] }, { text: fcfa(calc.salarial.cnps), fontSize: 7, alignment: 'right' },
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
            { text: '', margin: [0, 20] },
            {
                columns: [
                    { stack: [{ text: 'L\'Employeur', bold: true, alignment: 'center', margin: [0, 0, 0, 30] }, { text: company.nom, fontSize: 7, alignment: 'center', margin: [0, 2] }, { canvas: [{ type: 'line', x1: 50, y1: 0, x2: 150, y2: 0, lineWidth: 0.5 }] }, { text: 'Cachet & Signature', fontSize: 6, alignment: 'center', margin: [0, 5] }] },
                    { stack: [{ text: 'Le Salarié', bold: true, alignment: 'center', margin: [0, 0, 0, 30] }, { text: `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}`, fontSize: 7, alignment: 'center', margin: [0, 2] }, { canvas: [{ type: 'line', x1: 50, y1: 0, x2: 150, y2: 0, lineWidth: 0.5 }] }, { text: 'Lu et approuvé', fontSize: 6, alignment: 'center', margin: [0, 5] }] }
                ]
            }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

exports.processPayrollFile = async (dataPath, outputPath, templatePath = null, mapping = null, htmlTemplate = null, country = 'CI') => {
    return new Promise(async (resolve, reject) => {
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

            const fullEmployees = employesList.map(emp => {
                const merged = {
                    ...emp,
                    ...(remuMap[emp.id_employe] || {})
                };

                // Application du Smart Mapping si fourni
                if (mapping) {
                    const mappedEmp = {};
                    for (const [standardKey, fileHeader] of Object.entries(mapping)) {
                        if (fileHeader && merged[fileHeader] !== undefined) {
                            mappedEmp[standardKey] = merged[fileHeader];
                        }
                    }
                    // On fusionne pour garder les champs originaux en backup
                    return { ...merged, ...mappedEmp };
                }

                return merged;
            });

            // Output init
            const isDocxMode = !!templatePath && templatePath.toLowerCase().endsWith('.docx');
            const isHtmlTemplateMode = !!htmlTemplate;
            let docTemplateContent = null;
            if (templatePath) docTemplateContent = fs.readFileSync(templatePath);

            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            let totalMasseSalariale = 0;
            let totalCNPS = 0;
            let totalImpots = 0;

            output.on('close', () => resolve({ 
                count: fullEmployees.length, 
                type: isDocxMode ? 'docx' : 'pdf',
                totalMasseSalariale,
                totalCNPS,
                totalImpots
            }));
            archive.on('error', (err) => reject(err));
            archive.pipe(output);

            const promises = [];
            let browser = null;
            if (isHtmlTemplateMode && puppeteer) {
                browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            }

            for (const [index, emp] of fullEmployees.entries()) {
                try {
                    const calculs = exports.calculateSinglePayroll({ ...emp, pays: country });
                    totalMasseSalariale += calculs.gainsTotaux || 0;
                    totalCNPS += calculs.salarial.cnps || 0;
                    totalImpots += calculs.salarial.irpp || calculs.salarial.its || 0;

                    const rawName = String(emp['nom'] || `Emp${index}`);
                    const safeName = rawName.replace(/[^a-z0-9]/gi, '_');

                    const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                    const moisNom = moisNoms[parseInt(emp.mois || 1) - 1] || 'Mois';
                    const entNom = (companyInfo.nom_entreprise || emp.nom_entreprise || 'ENTREPRISE').toUpperCase();
                    const salNom = (emp.nom || `Employe${index}`).toUpperCase();
                    const finalFileName = `BULLETIN DE PAIE - ${entNom} - ${salNom} - ${moisNom} ${emp.annee || ''}`;

                    if (isDocxMode) {
                        const viewData = { ...emp, ...calculs, date_jour: new Date().toLocaleDateString() };
                        const zip = new PizZip(docTemplateContent.toString('binary'));
                        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
                        doc.render(viewData);
                        archive.append(doc.getZip().generate({ type: 'nodebuffer' }), { name: `${finalFileName}.docx` });
                    } else if (isHtmlTemplateMode) {
                        const entNom = (companyInfo.nom_entreprise || emp.nom_entreprise || 'ENTREPRISE').toUpperCase();
                        const viewData = {
                            ...emp,
                            ...calculs,
                            date_jour: new Date().toLocaleDateString(),
                            nom_entreprise: entNom
                        };
                        promises.push((async () => {
                            if (!puppeteer) throw new Error("puppeteer module not found. Run npm install puppeteer");

                            // Replacements
                            let html = htmlTemplate;
                            // Format FCFA
                            const formatFCFA = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

                            for (const key of Object.keys(viewData)) {
                                const val = viewData[key];
                                const strVal = typeof val === 'number' ? formatFCFA(val) : (val || '');
                                // Remplacer dynamiquement les {clé} dans le HTML
                                const regex = new RegExp(`{${key}}`, 'g');
                                html = html.replace(regex, strVal);
                            }

                            // Nettoyer les variables restantes non mappées
                            html = html.replace(/{[^}]+}/g, '0');

                            const fullHtml = `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="utf-8">
                                <script src="https://cdn.tailwindcss.com"></script>
                                <style>
                                    body { 
                                        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                                        background: white; 
                                        color: #1f2937;
                                        font-size: 11px;
                                        line-height: 1.3;
                                        text-align: left;
                                    }
                                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                                    /* Force compact table rows */
                                    table { font-size: 11px; border-collapse: collapse; }
                                    td, th { padding: 2px 8px !important; }
                                    h1 { font-size: 15px !important; margin: 4px 0 !important; }
                                    h2 { font-size: 13px !important; margin: 3px 0 !important; }
                                    h3 { font-size: 12px !important; margin: 2px 0 !important; }
                                    p { margin: 2px 0 !important; }
                                    /* Reduce all large spacings */
                                    .mt-4, .mt-6, .mt-8, .mb-4, .mb-6, .mb-8, .my-4, .my-6, .my-8 { margin-top: 8px !important; margin-bottom: 8px !important; }
                                    .pt-4, .pt-6, .pt-8, .pb-4, .pb-6, .pb-8, .py-4, .py-6, .py-8 { padding-top: 4px !important; padding-bottom: 4px !important; }
                                </style>
                            </head>
                            <body class="p-6">
                                ${html}
                            </body>
                            </html>
                            `;

                            const page = await browser.newPage();
                            await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
                            const pdfBytes = await page.pdf({ format: 'A4', printBackground: true });
                            await page.close();

                            archive.append(Buffer.from(pdfBytes), { name: `${finalFileName}.pdf` });
                        })());
                    } else {
                        const docDefinition = generatePdfDefinition(emp, calculs, companyInfo);
                        const pdfDoc = printer.createPdfKitDocument(docDefinition);
                        let chunks = [];
                        pdfDoc.on('data', (chunk) => chunks.push(chunk));
                        pdfDoc.on('end', () => {
                            const result = Buffer.concat(chunks);
                            archive.append(result, { name: `${finalFileName}.pdf` });
                        });
                        pdfDoc.end();
                    }
                } catch (err) {
                    console.error("Error creating document for " + emp.nom, err);
                }
            } // end for

            Promise.all(promises).then(async () => {
                if (browser) await browser.close();
                setTimeout(() => archive.finalize(), 500);
            }).catch(async (err) => {
                if (browser) await browser.close();
                reject(err);
            });

        } catch (e) { reject(e); }
    });
};

/**
 * Calcul des règles pour un employé unique (simulation manuelle)
 */
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
            { text: 'BULLETIN DE PAIE', alignment: 'center', fontSize: 13, bold: true, color: NAVY_HEADER, margin: [0, 12, 0, 12] },

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
                            { text: 'Matricule : ' + (employee.matricule || '____') + '   |   N° CNSS : ' + (employee.num_secu || '____'), fontSize: 7.5, color: '#475569', margin: [0, 2, 0, 0] },
                            { text: 'Fonction : ' + (employee.poste || '____'), fontSize: 7.5, color: '#475569', margin: [0, 1, 0, 0] }
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

function calculateTogoSalaryRules(employee) {
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

    let ansAnciennete = 0;
    let tauxAnciennete = 0;
    let primeAnciennete = 0;
    if (employee.date_embauche) {
        const emb = new Date(employee.date_embauche);
        const paieMois = parseInt(employee.mois || new Date().getMonth() + 1);
        const paieAnnee = parseInt(employee.annee || new Date().getFullYear());
        const paieDate = new Date(paieAnnee, paieMois - 1, 30);
        ansAnciennete = Math.floor(Math.abs(paieDate - emb) / (1000 * 60 * 60 * 24 * 365.25));
        if (ansAnciennete >= 2) {
            tauxAnciennete = Math.min(5 + Math.floor((ansAnciennete - 2) / 3) * 2, 35);
            primeAnciennete = Math.round(salaireBaseMensuel * (tauxAnciennete / 100));
        }
    }

    const primeTransportMensuel = parseFloat(employee['prime_transport'] || 0);
    const primeTransport = (employee['bulletin_type'] === 'conges') ? 0 : Math.round((primeTransportMensuel / joursBasePaie) * joursTrav);
    const primeLogement = parseFloat(employee['prime_logement'] || 0);

    const nbHeuresSup = parseFloat(employee['heures_sup_nb'] || 0);
    const coefHS = parseFloat(employee['heures_sup_coef'] || 1.15);
    const tauxHoraire = salaireBaseMensuel > 0 ? Math.round(salaireBaseMensuel / 173.33) : 0;
    const montantHeuresSup = Math.round(nbHeuresSup * tauxHoraire * coefHS);

    const primesList = Array.isArray(employee['primes']) ? employee['primes'] : [];
    const primesImposables = primesList.filter(p => p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);
    const primesNonImposablesRub = primesList.filter(p => !p.imposable).reduce((acc, p) => acc + (+p.montant || 0), 0);
    const gratification = parseFloat(employee['gratification'] || 0);

    const salaireBrut = salaireBase + sursalaire + primeAnciennete + montantHeuresSup + primesImposables + gratification;
    const brutImposable = salaireBrut + primeTransport + primeLogement;
    const gainsTotaux = brutImposable + primesNonImposablesRub;

    const plafondCNSS = 1500000;
    const baseCNSS = Math.min(brutImposable, plafondCNSS);

    const cnssSal = Math.round(baseCNSS * 0.04);
    const inamSal = Math.round(baseCNSS * 0.05);
    const totalSocialSalarial = cnssSal + inamSal;

    const revenuApresCotisations = Math.max(0, brutImposable - totalSocialSalarial);
    const revenuAnnuel = revenuApresCotisations * 12;
    const abattementAnnuel = Math.min(revenuAnnuel, 10000000) * 0.28;
    const abattementMensuel = Math.round(abattementAnnuel / 12);

    const revenuNetImposableAnnuel = Math.max(0, revenuAnnuel - abattementAnnuel);
    const revenuNetImposableMensuel = Math.round(revenuNetImposableAnnuel / 12);

    const tranches = [
        { plafond: 900000, taux: 0.00 },
        { plafond: 3000000, taux: 0.03 },
        { plafond: 6000000, taux: 0.10 },
        { plafond: 9000000, taux: 0.15 },
        { plafond: 12000000, taux: 0.20 },
        { plafond: 15000000, taux: 0.25 },
        { plafond: 20000000, taux: 0.30 },
        { plafond: Infinity, taux: 0.35 }
    ];

    let irppAnnuel = 0;
    let prec = 0;
    for (const { plafond, taux } of tranches) {
        if (revenuNetImposableAnnuel <= prec) break;
        irppAnnuel += (Math.min(revenuNetImposableAnnuel, plafond) - prec) * taux;
        prec = plafond;
    }
    const irppMensuel = Math.round(irppAnnuel / 12);

    const cnssPat = Math.round(baseCNSS * 0.175);
    const inamPat = Math.round(baseCNSS * 0.05);
    const impotEmployeur = Math.round(brutImposable * 0.01);
    const totalSocialEmployeur = cnssPat + inamPat;
    const totalPatronal = totalSocialEmployeur + impotEmployeur;

    const acompte = parseFloat(employee['acompte'] || 0);
    const avance = parseFloat(employee['avance'] || 0);
    const opposition = parseFloat(employee['opposition'] || 0);
    const autres = parseFloat(employee['autres_retenues'] || 0);
    const totalRetenuesDiverses = acompte + avance + opposition + autres;

    const totalRetenues = totalSocialSalarial + irppMensuel + totalRetenuesDiverses;
    const netAPayer = Math.max(0, gainsTotaux - totalRetenues);

    return {
        brut: salaireBrut, salaireBase, salaireBaseMensuel, sursalaire,
        primeAnciennete, ansAnciennete, tauxAnciennete, ancienneteTxt: ansAnciennete + ' an(s)', allocationConges: 0, joursCP,
        gratification, preavisVal: 0, indemLicenciement: 0, indemTransac: 0, fraisFuneraires: 0,
        primesImposables, primesNonImposablesRub, montantHeuresSup, nbHeuresSup, coefHS, tauxHoraire,
        primeTransport, primeLogement,
        brutImposable, gainsTotaux, baseCNPS: baseCNSS, baseCNPS_PfAtAm: baseCNSS, parts: 0, totalPersonnesCMU: 0,
        revenuApresCotisations, abattementMensuel, revenuNetImposableMensuel, totalRetenuesDiverses,
        patronal: {
            impotEmployeur, fdfpTA: 0, fdfpFPC: 0, totalFiscal: impotEmployeur,
            cnpsPF: 0, cnpsAM: inamPat, cnpsAT: 0, cnpsRetraite: cnssPat, cmu: inamPat,
            totalSocial: totalSocialEmployeur, grandTotal: totalPatronal
        },
        salarial: {
            its: irppMensuel, irpp: irppMensuel, ricf: 0, baseITS: revenuNetImposableMensuel, baseIRPP: revenuNetImposableMensuel,
            is: 0, cn: 0, igr: 0, cnps: cnssSal, inam: inamSal, cmu: inamSal,
            acompte, avance, opposition, autres, total: totalRetenues, regime: '2026',
            autresTaxes: []
        },
        netAPayer
    };
}

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

            { text: 'BULLETIN DE PAIE', alignment: 'center', fontSize: 13, bold: true, color: NAVY_HEADER, margin: [0, 10, 0, 10] },

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
                            { text: 'Matricule : ' + (employee.matricule || '____') + '   |   N° CNSS : ' + (employee.num_secu || '____'), fontSize: 7.5, color: '#475569', margin: [0, 2, 0, 0] },
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

exports.calculateSinglePayroll = (employee) => {
    if (employee.pays === 'BJ') return calculateBeninSalaryRules(employee);
    if (employee.pays === 'TG') return calculateTogoSalaryRules(employee);
    return calculateSalaryRules(employee);
};

/**
 * Génère un PDF individuel et retourne un Buffer
 */
exports.generateSinglePdf = (employee, calculs, companyInfo = {}, htmlTemplate = null) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (htmlTemplate) {
                if (!puppeteer) {
                    return reject(new Error("puppeteer module not found. Run npm install puppeteer"));
                }
                const viewData = {
                    ...employee,
                    ...calculs,
                    date_jour: new Date().toLocaleDateString(),
                    nom_entreprise: (companyInfo.nom_entreprise || employee.nom_entreprise || 'ENTREPRISE').toUpperCase()
                };
                let html = htmlTemplate;
                const formatFCFA = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

                for (const key of Object.keys(viewData)) {
                    const val = viewData[key];
                    const strVal = typeof val === 'number' ? formatFCFA(val) : (val || '');
                    const regex = new RegExp(`{${key}}`, 'g');
                    html = html.replace(regex, strVal);
                }
                html = html.replace(/{[^}]+}/g, '0');

                const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        body { font-family: sans-serif; background: white; font-size: 11px; line-height: 1.3; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        table { font-size: 11px; border-collapse: collapse; }
                        td, th { padding: 2px 8px !important; }
                    </style>
                </head>
                <body class="p-6">${html}</body>
                </html>
                `;

                const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
                const page = await browser.newPage();
                await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
                const pdfBytes = await page.pdf({ format: 'A4', printBackground: true });
                await browser.close();
                
                return resolve(Buffer.from(pdfBytes));
            }
            const now = new Date();
            if (employee.mois) now.setMonth(parseInt(employee.mois) - 1);
            if (employee.annee) now.setFullYear(parseInt(employee.annee));

            let docDefinition;
            if (employee.pays === 'BJ') {
                docDefinition = generateBeninPdfDefinition(employee, calculs, companyInfo);
            } else if (employee.pays === 'TG') {
                docDefinition = generateTogoPdfDefinition(employee, calculs, companyInfo);
            } else {
                docDefinition = generatePdfDefinition(employee, calculs, companyInfo);
            }

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

/**
 * Génère le PDF du Solde de Tout Compte
 */
exports.generateStcPdf = (employee, calculs, htmlTemplate = null) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (htmlTemplate) {
                if (!puppeteer) {
                    return reject(new Error("puppeteer module not found. Run npm install puppeteer"));
                }
                const viewData = {
                    ...employee,
                    ...calculs,
                    date_jour: new Date().toLocaleDateString(),
                    nom_entreprise: (employee.nom_entreprise || 'ENTREPRISE').toUpperCase()
                };
                let html = htmlTemplate;
                const formatFCFA = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

                for (const key of Object.keys(viewData)) {
                    const val = viewData[key];
                    const strVal = typeof val === 'number' ? formatFCFA(val) : (val || '');
                    const regex = new RegExp(`{${key}}`, 'g');
                    html = html.replace(regex, strVal);
                }
                html = html.replace(/{[^}]+}/g, '0');

                const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        body { font-family: sans-serif; background: white; font-size: 11px; line-height: 1.3; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        table { font-size: 11px; border-collapse: collapse; }
                        td, th { padding: 2px 8px !important; }
                    </style>
                </head>
                <body class="p-6">${html}</body>
                </html>
                `;

                const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
                const page = await browser.newPage();
                await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
                const pdfBytes = await page.pdf({ format: 'A4', printBackground: true });
                await browser.close();
                
                return resolve(Buffer.from(pdfBytes));
            }

            const emp = employee;
            const c = calculs;

            const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
            const fcfaFmt = (v) => v ? Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '0';
            const ancLabel = (ans, moisTotal, joursResto = 0) => {
                const m = moisTotal % 12;
                let label = "";
                if (ans > 0) label += `${ans} an${ans > 1 ? 's' : ''}`;
                if (m > 0) label += (label ? ", " : "") + `${m} mois`;
                if (joursResto > 0) label += (label ? " et " : "") + `${joursResto} jour${joursResto > 1 ? 's' : ''}`;
                return label || "0 jour";
            };

            const motifLabels = {
                licenciement: 'Licenciement', demission: 'Démission',
                retraite: 'Retraite', commun_accord: "Rupture d'un commun accord",
                fin_cdd: 'Fin normale du CDD', deces: 'Décès du salarié',
                force_majeure: 'Force majeure',
            };

            const purple = '#4f46e5';
            const lightPurple = '#ede9fe';
            const headerGray = '#f1f5f9';

            const tableRows = [];

            // En-têtes colonnes
            tableRows.push([
                { text: 'Code', bold: true, fontSize: 7, fillColor: headerGray, alignment: 'center' },
                { text: 'Désignation', bold: true, fontSize: 7, fillColor: headerGray },
                { text: 'Calcul de référence', bold: true, fontSize: 7, fillColor: headerGray },
                { text: 'Base légale', bold: true, fontSize: 7, fillColor: headerGray, alignment: 'center' },
                { text: 'Montant (FCFA)', bold: true, fontSize: 7, fillColor: headerGray, alignment: 'right' },
            ]);

            // Données
            const gainLignes = (c.lignes || []).filter(l => l.type === 'gain');
            const retLignes = (c.lignes || []).filter(l => l.type === 'retenue');

            gainLignes.forEach(l => {
                tableRows.push([
                    { text: l.code, fontSize: 7, alignment: 'center', color: '#4f46e5', bold: true },
                    { text: l.libelle, fontSize: 7 },
                    { text: l.calcul || '', fontSize: 6.5, color: '#6b7280', italics: true },
                    { text: l.loi || '', fontSize: 6, color: '#94a3b8', alignment: 'center' },
                    { text: fcfaFmt(l.montant), fontSize: 7, alignment: 'right', bold: true, color: '#16a34a' },
                ]);
            });

            // Ligne total brut
            tableRows.push([
                { text: '', fontSize: 7 },
                { text: 'TOTAL BRUT DES DROITS & INDEMNITÉS', bold: true, fontSize: 7.5, fillColor: '#fafafa' },
                { text: '', fontSize: 7 },
                { text: '', fontSize: 7 },
                { text: fcfaFmt(c.totalBrut), bold: true, fontSize: 8, alignment: 'right', fillColor: '#fafafa' },
            ]);

            // Retenues
            retLignes.forEach(l => {
                tableRows.push([
                    { text: l.code, fontSize: 7, alignment: 'center', color: '#dc2626', bold: true },
                    { text: l.libelle, fontSize: 7 },
                    { text: '', fontSize: 7 },
                    { text: l.loi || '', fontSize: 6, color: '#94a3b8', alignment: 'center' },
                    { text: `− ${fcfaFmt(l.montant)}`, fontSize: 7, alignment: 'right', color: '#dc2626', bold: true },
                ]);
            });

            // Net
            tableRows.push([
                { text: '', colSpan: 4, border: [false, false, false, false], fontSize: 7 },
                {}, {}, {},
                {
                    text: `NET : ${fcfaFmt(c.net)} FCFA`,
                    bold: true, fontSize: 9, alignment: 'right',
                    fillColor: purple, color: 'white',
                    margin: [4, 4, 4, 4]
                },
            ]);

            const docDef = {
                pageSize: 'A4',
                pageMargins: [30, 30, 30, 40],
                content: [
                    // ENTÊTE
                    {
                        columns: [
                            {
                                stack: [
                                    { text: emp.nom_entreprise || 'ENTREPRISE', fontSize: 12, bold: true, color: purple },
                                    { text: 'REÇU POUR SOLDE DE TOUT COMPTE', fontSize: 9, bold: true, color: '#1e1b4b', margin: [0, 3, 0, 0] },
                                    { text: `Établi le ${new Date().toLocaleDateString('fr-FR')}`, fontSize: 8, color: '#6b7280', margin: [0, 2, 0, 0] },
                                ],
                                width: '*'
                            },
                            {
                                table: {
                                    widths: ['auto', '*'],
                                    body: [
                                        [{ text: 'Nom :', fontSize: 7.5, bold: true, border: [false, false, false, false] }, { text: `${(emp.nom || '').toUpperCase()} ${emp.prenom || ''}`, fontSize: 7.5, border: [false, false, false, false] }],
                                        [{ text: 'Poste :', fontSize: 7.5, bold: true, border: [false, false, false, false] }, { text: emp.poste || '—', fontSize: 7.5, border: [false, false, false, false] }],
                                        [{ text: 'Type contrat :', fontSize: 7.5, bold: true, border: [false, false, false, false] }, { text: (emp.type_contrat || '').toUpperCase(), fontSize: 7.5, border: [false, false, false, false] }],
                                        [{ text: 'Motif :', fontSize: 7.5, bold: true, border: [false, false, false, false] }, { text: motifLabels[emp.motif_rupture] || emp.motif_rupture, fontSize: 7.5, border: [false, false, false, false] }],
                                        [{ text: 'Date entrée :', fontSize: 7.5, bold: true, border: [false, false, false, false] }, { text: formatDate(emp.date_embauche), fontSize: 7.5, border: [false, false, false, false] }],
                                        [{ text: 'Date sortie :', fontSize: 7.5, bold: true, border: [false, false, false, false] }, { text: formatDate(emp.date_sortie), fontSize: 7.5, border: [false, false, false, false] }],
                                        [{ text: 'Ancienneté :', fontSize: 7.5, bold: true, border: [false, false, false, false] }, { text: ancLabel(c.ans, c.moisTotal, c.joursResto), fontSize: 7.5, bold: true, color: purple, border: [false, false, false, false] }],
                                        [{ text: 'Salaire ref. :', fontSize: 7.5, bold: true, border: [false, false, false, false] }, { text: `${fcfaFmt(c.brut)} FCFA/mois`, fontSize: 7.5, border: [false, false, false, false] }],
                                    ]
                                },
                                width: 'auto'
                            }
                        ]
                    },

                    { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 535, y2: 8, lineWidth: 1.5, lineColor: purple }], margin: [0, 10, 0, 12] },

                    // TABLEAU
                    {
                        table: {
                            headerRows: 1,
                            widths: ['7%', '30%', '28%', '15%', '20%'],
                            body: tableRows
                        },
                        layout: {
                            hLineWidth: (i) => i === 0 || i === 1 ? 1.5 : 0.5,
                            vLineWidth: () => 0.5,
                            hLineColor: () => '#e2e8f0',
                            vLineColor: () => '#e2e8f0',
                        }
                    },

                    { text: '', margin: [0, 20] },

                    // SIGNATURES
                    {
                        columns: [
                            {
                                stack: [
                                    { text: 'L\'Employeur', fontSize: 8, bold: true, color: '#374151', alignment: 'center' },
                                    { text: emp.nom_entreprise || '________________', fontSize: 8, color: '#6b7280', alignment: 'center', margin: [0, 3] },
                                    { canvas: [{ type: 'line', x1: 0, y1: 30, x2: 150, y2: 30, lineWidth: 1, lineColor: '#1e293b' }] },
                                    { text: 'Signature & Cachet', fontSize: 7, color: '#94a3b8', alignment: 'center', margin: [0, 5] },
                                ]
                            },
                            { text: '' },
                            {
                                stack: [
                                    { text: 'Le Salarié', fontSize: 8, bold: true, color: '#374151', alignment: 'center' },
                                    { text: `${(emp.nom || '').toUpperCase()} ${emp.prenom || ''}`, fontSize: 8, color: '#6b7280', alignment: 'center', margin: [0, 3] },
                                    { canvas: [{ type: 'line', x1: 0, y1: 30, x2: 150, y2: 30, lineWidth: 1, lineColor: '#1e293b' }] },
                                    { text: 'Lu et approuvé', fontSize: 7, color: '#94a3b8', alignment: 'center', margin: [0, 5] },
                                ]
                            }
                        ]
                    },

                    { text: '', margin: [0, 15] },

                    // MENTION LÉGALE
                    {
                        text: 'Ce reçu pour solde de tout compte est établi conformément au Code du Travail de Côte d\'Ivoire (Loi n°2015-532 du 20 juillet 2015). Le salarié dispose d\'un délai de 6 mois à compter de la signature pour en contester le contenu par voie judiciaire. Toute signature vaut acceptation des montants mentionnés.',
                        fontSize: 6.5, color: '#94a3b8', italics: true,
                        margin: [0, 0, 0, 0],
                        alignment: 'justify'
                    }
                ],
                defaultStyle: { font: 'Roboto', fontSize: 8 }
            };

            const pdfDoc = printer.createPdfKitDocument(docDef);
            const chunks = [];
            pdfDoc.on('data', chunk => chunks.push(chunk));
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            pdfDoc.on('error', err => reject(err));
            pdfDoc.end();
        } catch (e) { reject(e); }
    });
};

// ─── processPayrollJson ────────────────────────────────────────────────────────

exports.processPayrollJson = async (employeesList, outputPath, templatePath = null, mapping = null, htmlTemplate = null, country = 'CI') => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`[RH] Lecture depuis JSON (Base Locale)`);
            if (!employeesList || employeesList.length === 0) return reject(new Error(`La liste des employés est vide`));

            const firstEmp = employeesList[0] || {};
            const companyInfo = {
                nom_entreprise: firstEmp.nom_entreprise || 'Mon Entreprise',
                adresse: firstEmp.adresse || '',
                numero_cnps: firstEmp.numero_cnps || '',
                numero_contribuable: firstEmp.numero_contribuable || '',
            };

            const fullEmployees = employeesList;

            // Output init
            const isDocxMode = !!templatePath && templatePath.toLowerCase().endsWith('.docx');
            const isHtmlTemplateMode = !!htmlTemplate;
            let docTemplateContent = null;
            if (templatePath) docTemplateContent = fs.readFileSync(templatePath);

            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            let totalMasseSalariale = 0;
            let totalCNPS = 0;
            let totalImpots = 0;

            output.on('close', () => resolve({ 
                count: fullEmployees.length, 
                type: isDocxMode ? 'docx' : 'pdf',
                totalMasseSalariale,
                totalCNPS,
                totalImpots
            }));
            archive.on('error', (err) => reject(err));
            archive.pipe(output);

            const promises = [];
            let browser = null;
            if (isHtmlTemplateMode && puppeteer) {
                browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            }

            for (const [index, emp] of fullEmployees.entries()) {
                try {
                    const calculs = exports.calculateSinglePayroll({ ...emp, pays: country });
                    totalMasseSalariale += calculs.gainsTotaux || 0;
                    totalCNPS += calculs.salarial.cnps || 0;
                    totalImpots += calculs.salarial.irpp || calculs.salarial.its || 0;

                    const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                    const moisNom = moisNoms[parseInt(emp.mois || new Date().getMonth() + 1) - 1] || 'Mois';
                    const annee = emp.annee || new Date().getFullYear();
                    const entNom = (companyInfo.nom_entreprise || emp.nom_entreprise || 'ENTREPRISE').toUpperCase();
                    const salNom = (emp.nom || `Employe${index}`).toUpperCase();
                    const finalFileName = `BULLETIN DE PAIE - ${entNom} - ${salNom} - ${moisNom} ${annee}`;

                    if (isHtmlTemplateMode) {
                        const viewData = {
                            ...emp,
                            ...calculs,
                            date_jour: new Date().toLocaleDateString(),
                            nom_entreprise: entNom
                        };
                        promises.push((async () => {
                            if (!puppeteer) throw new Error("puppeteer module not found. Run npm install puppeteer");
                            let html = htmlTemplate;
                            const formatFCFA = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

                            for (const key of Object.keys(viewData)) {
                                const val = viewData[key];
                                const strVal = typeof val === 'number' ? formatFCFA(val) : (val || '');
                                const regex = new RegExp(`{${key}}`, 'g');
                                html = html.replace(regex, strVal);
                            }
                            html = html.replace(/{[^}]+}/g, '0');

                            const fullHtml = `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="utf-8">
                                <script src="https://cdn.tailwindcss.com"></script>
                                <style>
                                    body { font-family: sans-serif; background: white; font-size: 11px; line-height: 1.3; }
                                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                                    table { font-size: 11px; border-collapse: collapse; }
                                    td, th { padding: 2px 8px !important; }
                                </style>
                            </head>
                            <body class="p-6">${html}</body>
                            </html>
                            `;

                            const page = await browser.newPage();
                            await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
                            const pdfBytes = await page.pdf({ format: 'A4', printBackground: true });
                            await page.close();

                            archive.append(Buffer.from(pdfBytes), { name: `${finalFileName}.pdf` });
                        })());
                    } else {
                        const docDefinition = generatePdfDefinition(emp, calculs, companyInfo);
                        const pdfDoc = printer.createPdfKitDocument(docDefinition);
                        let chunks = [];
                        pdfDoc.on('data', (chunk) => chunks.push(chunk));
                        pdfDoc.on('end', () => {
                            const result = Buffer.concat(chunks);
                            archive.append(result, { name: `${finalFileName}.pdf` });
                        });
                        pdfDoc.end();
                    }
                } catch (err) {
                    console.error("Error creating document for " + emp.nom, err);
                }
            } // end for

            Promise.all(promises).then(async () => {
                if (browser) await browser.close();
                setTimeout(() => archive.finalize(), 500);
            }).catch(async (err) => {
                if (browser) await browser.close();
                reject(err);
            });

        } catch (e) { reject(e); }
    });
};
