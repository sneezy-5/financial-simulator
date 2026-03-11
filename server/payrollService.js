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

    const nbAyantsDroitCMU = Math.max(0, parseInt(employee['ayants_droit_cmu'] || 0));
    const cmuPat = 500 * (1 + nbAyantsDroitCMU);
    const cmuSal = 500 * (1 + nbAyantsDroitCMU);

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
        brutImposable, gainsTotaux, baseCNPS, baseCNPS_PfAtAm, parts,
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
    body.push(row('CMU (ASSURANCE MALADIE)', 1000, null, null, calc.salarial.cmu, null, calc.patronal.cmu));
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

                    const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                    const moisNom = moisNoms[parseInt(emp.mois || 1) - 1] || 'Mois';
                    const entNom = (companyInfo.nom_entreprise || emp.nom_entreprise || 'ENTREPRISE').toUpperCase();
                    const salNom = (emp.nom || `Employe${index}`).toUpperCase();
                    const finalFileName = `BULLETIN DE PAIE - ${entNom} - ${salNom} - ${moisNom} ${emp.annee || ''}`;

                    if (isDocxMode) {
                        const viewData = { ...emp, ...calculs, date_jour: new Date().toLocaleDateString() };
                        const zip = new PizZip(docTemplateContent);
                        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
                        doc.render(viewData);
                        archive.append(doc.getZip().generate({ type: 'nodebuffer' }), { name: `${finalFileName}.docx` });
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

/**
 * Génère le PDF du Solde de Tout Compte
 */
exports.generateStcPdf = (employee, calculs) => {
    return new Promise((resolve, reject) => {
        try {
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
