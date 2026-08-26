const XLSX = require('xlsx');
const PdfPrinter = require('pdfmake');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const templateEngine = require('./templateEngine');
const { buildViewData } = require('./templateViewData');
let PDFDocument, rgb;
try {
    const pdfLib = require('pdf-lib');
    PDFDocument = pdfLib.PDFDocument;
    rgb = pdfLib.rgb;
} catch (e) {
    console.warn("pdf-lib n'est pas installé, la génération de PDF visuels échouera.");
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
 * Heures supplémentaires — barème légal ivoirien (Code du Travail, CCI du
 * 20/07/1977) : 41e à 46e heure de la semaine à 1,15 ; au-delà de la 46e à
 * 1,50 ; heures de nuit à 1,75 ; heures de jour un dimanche ou jour férié à
 * 1,75 ; heures de nuit un dimanche ou jour férié à 2,00.
 *
 * `heures_sup_nb` reste le point d'entrée simple : ces heures « ordinaires »
 * sont réparties automatiquement sur les deux premiers paliers, comme
 * l'exige le barème — l'utilisateur compte ses heures, pas le barème à sa
 * place. Un coefficient explicitement différent du défaut (1.15) est traité
 * comme une classification volontaire (« toutes ces heures sont de nuit »,
 * via le sélecteur existant) et s'applique tel quel plutôt que d'être
 * réparti. `heures_sup_nuit` / `heures_sup_ferie_jour` / `heures_sup_ferie_nuit`
 * sont des champs dédiés pour qui veut aller plus loin que la case unique.
 */
const HS_SEUIL_PALIER1 = 6; // 41e à 46e heure de la semaine
const HS_TAUX_PALIER1 = 1.15;
const HS_TAUX_PALIER2 = 1.5;
const HS_TAUX_NUIT = 1.75;
const HS_TAUX_FERIE_JOUR = 1.75;
const HS_TAUX_FERIE_NUIT = 2;

function calculerHeuresSupplementaires(employee, tauxHoraire) {
    const nbSimple = parseFloat(employee['heures_sup_nb'] || 0);
    const nbNuit = parseFloat(employee['heures_sup_nuit'] || 0);
    const nbFerieJour = parseFloat(employee['heures_sup_ferie_jour'] || 0);
    const nbFerieNuit = parseFloat(employee['heures_sup_ferie_nuit'] || 0);
    const coefBrut = employee['heures_sup_coef'];
    const coefExplicite = (coefBrut !== undefined && coefBrut !== null && coefBrut !== '') ? parseFloat(coefBrut) : null;

    const tranches = [];
    let montant = 0;

    if (coefExplicite !== null && coefExplicite !== HS_TAUX_PALIER1) {
        if (nbSimple > 0) {
            const m = Math.round(nbSimple * tauxHoraire * coefExplicite);
            montant += m;
            tranches.push({ label: `Heures supplémentaires (×${coefExplicite})`, heures: nbSimple, coef: coefExplicite, montant: m });
        }
    } else if (nbSimple > 0) {
        const h1 = Math.min(nbSimple, HS_SEUIL_PALIER1);
        const h2 = Math.max(0, nbSimple - HS_SEUIL_PALIER1);
        if (h1 > 0) {
            const m = Math.round(h1 * tauxHoraire * HS_TAUX_PALIER1);
            montant += m;
            tranches.push({ label: 'De la 41e à la 46e heure', heures: h1, coef: HS_TAUX_PALIER1, montant: m });
        }
        if (h2 > 0) {
            const m = Math.round(h2 * tauxHoraire * HS_TAUX_PALIER2);
            montant += m;
            tranches.push({ label: 'Au-delà de la 46e heure', heures: h2, coef: HS_TAUX_PALIER2, montant: m });
        }
    }

    if (nbNuit > 0) {
        const m = Math.round(nbNuit * tauxHoraire * HS_TAUX_NUIT);
        montant += m;
        tranches.push({ label: 'Heures de nuit', heures: nbNuit, coef: HS_TAUX_NUIT, montant: m });
    }
    if (nbFerieJour > 0) {
        const m = Math.round(nbFerieJour * tauxHoraire * HS_TAUX_FERIE_JOUR);
        montant += m;
        tranches.push({ label: 'Heures de jour, dimanche ou jour férié', heures: nbFerieJour, coef: HS_TAUX_FERIE_JOUR, montant: m });
    }
    if (nbFerieNuit > 0) {
        const m = Math.round(nbFerieNuit * tauxHoraire * HS_TAUX_FERIE_NUIT);
        montant += m;
        tranches.push({ label: 'Heures de nuit, dimanche ou jour férié', heures: nbFerieNuit, coef: HS_TAUX_FERIE_NUIT, montant: m });
    }

    const nbHeuresSup = nbSimple + nbNuit + nbFerieJour + nbFerieNuit;
    // coefHS : coefficient affiché sur le bulletin quand une seule tranche est
    // active (cas courant, une ligne suffit) — sinon `tranches` fait foi.
    const coefHS = tranches.length === 1 ? tranches[0].coef : (coefExplicite ?? HS_TAUX_PALIER1);

    return { nbHeuresSup, coefHS, montantHeuresSup: montant, tranches };
}

/**
 * Calcul des règles de paie - COTE D'IVOIRE
 */
function calculateSalaryRules(employee) {
    const salaireBaseMensuel = parseFloat(employee['salaire_base'] || 0);
    // Jours calendaires : sert uniquement à l'allocation de congés, qui se
    // compte en trentièmes (2,2 jours acquis par mois, plafonnés à 30).
    const joursDansLeMois = 30;
    // Jours ouvrables d'un mois complet : dénominateur de TOUTE proratisation
    // liée au temps de travail (salaire de base, sursalaire, primes).
    const JOURS_BASE_STANDARD = 26;
    const joursAbsences = parseFloat(employee['absences_jours'] || 0);
    const joursTravailleExplicite = (employee['jours_travailles'] !== undefined && employee['jours_travailles'] !== null && employee['jours_travailles'] !== '')
        ? parseFloat(employee['jours_travailles'])
        : null;
    // Ancienneté : calculée ici (avant les congés) car la majoration légale des
    // congés payés en dépend — voir plus bas.
    const dateEmbaucheStr = employee['date_embauche'] || employee['Date Embauche'];
    const paieMois = parseInt(employee['mois'] || new Date().getMonth() + 1);
    const paieAnnee = parseInt(employee['annee'] || new Date().getFullYear());

    let primeAnciennete = 0;
    let ansAnciennete = 0;
    let ancienneteAnneesExactes = 0;
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
        ancienneteAnneesExactes = Math.max(0, (refDate - embauche) / (365 * 24 * 3600 * 1000));
        ancienneteTxt = `${ansAnciennete} ans ${String(Math.max(0, diffMois)).padStart(2, '0')} mois`;

        if (ansAnciennete >= 2) {
            const tauxAnc = Math.min(25, 2 + (ansAnciennete - 2));
            primeAnciennete = Math.round(salaireBaseMensuel * (tauxAnc / 100));
        }
    }

    const autoConges = !!employee['auto_conges'];
    let joursConges = parseFloat(employee['jours_conges_pris'] || 0);

    if (autoConges) {
        const dateRefStr = employee['date_dernier_conge'] || employee['date_embauche'];
        if (dateRefStr) {
            const dRef = new Date(dateRefStr);
            const dNow = new Date(paieAnnee, paieMois - 1, 1);
            const diffMois = (dNow.getFullYear() - dRef.getFullYear()) * 12 + (dNow.getMonth() - dRef.getMonth());
            if (diffMois > 0) {
                // Barème légal (Code du Travail) : au delà de 5 ans d'ancienneté,
                // la durée du congé est majorée d'un nombre de jours croissant
                // par palier — jamais retranchée, jamais plafonnée par le calcul
                // de base.
                const majoration =
                    (ancienneteAnneesExactes > 5 && ancienneteAnneesExactes <= 10 ? 1 : 0) +
                    (ancienneteAnneesExactes > 10 && ancienneteAnneesExactes <= 15 ? 2 : 0) +
                    (ancienneteAnneesExactes > 15 && ancienneteAnneesExactes <= 20 ? 3 : 0) +
                    (ancienneteAnneesExactes > 20 && ancienneteAnneesExactes <= 25 ? 5 : 0) +
                    (ancienneteAnneesExactes > 25 ? 7 : 0);
                joursConges = Math.floor(diffMois * 2.2) + majoration;
            }
        }
    }

    // Jours effectivement travaillés : si jours_travailles est fourni explicitement (ex: export d'un
    // système de pointage externe qui donne directement le nombre de jours réellement travaillés), on
    // l'utilise tel quel. Sinon, on part de la base légale standard et on retranche les absences saisies
    // (évite de compter les absences deux fois si les deux champs sont renseignés en même temps).
    const joursTrav = Math.max(0, (joursTravailleExplicite !== null ? joursTravailleExplicite : (JOURS_BASE_STANDARD - joursAbsences)) - joursConges);
    const joursBasePaie = JOURS_BASE_STANDARD;
    const joursCP = joursConges;

    // Diviseur : joursBasePaie (26), la MÊME échelle que joursTrav.
    // joursTrav vaut 26 pour un mois complet ; diviser par 30 amputait donc
    // le salaire de 13,3 % alors même que le salarié n'avait pas été absent.
    // Les primes divisaient déjà correctement par 26 : le bulletin était
    // incohérent avec lui-même.
    const salaireBase = Math.round((salaireBaseMensuel / joursBasePaie) * joursTrav);
    const sursalaireTotal = parseFloat(employee['sursalaire'] || 0);
    const sursalaire = Math.round((sursalaireTotal / joursBasePaie) * joursTrav);
    const primeTransportMensuel = parseFloat(employee['prime_transport'] || 0);
    const bulletinType = employee['bulletin_type'] || 'habituel';
    const primeTransport = bulletinType === 'conges' ? 0 : Math.round((primeTransportMensuel / joursBasePaie) * joursTrav);
    const primeLogement = parseFloat(employee['prime_logement'] || 0);

    const tauxHoraire = salaireBaseMensuel > 0 ? Math.round(salaireBaseMensuel / 173.33) : 0;
    const heuresSup = calculerHeuresSupplementaires(employee, tauxHoraire);
    const { nbHeuresSup, coefHS, montantHeuresSup } = heuresSup;

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

    let n = Math.min(parseFloat(employee['nombre_enfants'] || 0), 4);
    let parts = 1;
    const situation = String(employee['situation_matrimoniale'] || '').toLowerCase();

    if (situation.includes('mari')) parts = 2 + (n * 0.5);
    else if (situation.includes('veuf') || situation.includes('veuv')) parts = (n > 0) ? (2 + (n * 0.5)) : 1;
    else parts = (n > 0) ? (1.5 + (n * 0.5)) : 1;
    parts = Math.min(parts, 5.0);

    // ITS (impôt unique sur salaires, réforme fiscale 2024) — l'ancien régime
    // (I.S./C.N./I.G.R., remplacé par cette réforme) n'est plus calculé.
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
    const ricf = Math.max(0, (parts - 1) * 11000);
    const itsFinal = Math.max(0, Math.round(impotBrut) - ricf);

    const acompte = parseFloat(employee['acompte'] || 0);
    const avance = parseFloat(employee['avance'] || 0);
    const opposition = parseFloat(employee['opposition'] || 0);
    const autres = parseFloat(employee['autres_retenues'] || 0);

    const totalRetenues = itsFinal + cnpsSal + cmuSal + acompte + avance + opposition + autres;

    return {
        brut: salaireBrut, salaireBase, salaireBaseMensuel, sursalaire,
        primeAnciennete, ansAnciennete, ancienneteTxt, allocationConges, joursCP,
        gratification, preavisVal, indemLicenciement, indemTransac, fraisFuneraires,
        primesImposables, primesNonImposablesRub, montantHeuresSup, nbHeuresSup, coefHS, tauxHoraire,
        heuresSupTranches: heuresSup.tranches,
        primeTransport, primeLogement,
        brutImposable, gainsTotaux, baseCNPS, baseCNPS_PfAtAm, parts, totalPersonnesCMU, joursTrav,
        patronal: {
            impotEmployeur, fdfpTA, fdfpFPC, totalFiscal: totalFiscalEmployeur,
            cnpsPF, cnpsAM, cnpsAT, cnpsRetraite: cnpsRetraitePat, cmu: cmuPat,
            totalSocial: totalSocialEmployeur, grandTotal: totalPatronal
        },
        salarial: {
            its: itsFinal, ricf, cnps: cnpsSal, cmu: cmuSal,
            acompte, avance, opposition, autres, total: totalRetenues
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
        num_employeur: companyInfo.numero_employeur || employee.numero_employeur || '____',
        // Facultatif : le compte n'en a pas forcément configuré un (Paramètres >
        // Profil Entreprise). Absent, l'en-tête se rend exactement comme avant.
        logo: companyInfo.logo || null
    };

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
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

    const joursTrav = Math.max(0, (employee.jours_travailles || 26) - (employee.absences_jours || 0));

    body.push(row(codes.salaireBase, 'SALAIRE CATEGORIEL', calc.salaireBaseMensuel, joursTrav + '/30', calc.salaireBase, null, null, null));
    if (calc.sursalaire > 0) body.push(row(codes.sursalaire, 'SURSALAIRE', employee.sursalaire, joursTrav + '/30', calc.sursalaire, null, null, null));
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
    if (calc.primeLogement > 0) body.push(row(codes.primeLogement, 'PRIME DE LOGEMENT (EXO)', null, null, calc.primeLogement, null, null, null));

    body.push(row('', 'BRUT IMPOSABLE', null, null, calc.brut, null, null, null, { bold: true }));

    body.push(row(codes.cnpsSalariale, 'CNPS - RETRAITE', calc.baseCNPS, '6.3%', null, calc.salarial.cnps, '7.7%', calc.patronal.cnpsRetraite));
    body.push(row(codes.cnpsPF, 'CNPS - PRESTATIONS FAMILIALES', calc.baseCNPS_PfAtAm, null, null, null, '5.0%', calc.patronal.cnpsPF));
    body.push(row(codes.cnpsAT, 'CNPS - ACCIDENT DU TRAVAIL', calc.baseCNPS_PfAtAm, null, null, null, (employee.taux_at || 2) + '%', calc.patronal.cnpsAT));
    body.push(row(codes.cnpsAM, 'CNPS - ASSURANCE MATERNITE', calc.baseCNPS_PfAtAm, null, null, null, '0.75%', calc.patronal.cnpsAM));

    body.push(row(codes.its, 'ITS (IMPOT UNIQUE 2024)', calc.brutImposable, null, null, calc.salarial.its + calc.salarial.ricf, null, null));
    if (calc.salarial.ricf > 0) body.push(row(codes.ricf, '   dont R.I.C.F', null, null, calc.salarial.ricf, null, null, null));

    body.push(row(codes.impotEmployeur, 'T.A.S.P (IMPOT EMPLOYEUR)', calc.brutImposable, null, null, null, '1.2%', calc.patronal.impotEmployeur));
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
    body.push(ligne('CNPS / Accident de Travail', calc.baseCNPS_PfAtAm, null, null, null, `${employee.taux_at || 2}%`, calc.patronal.cnpsAT, codes.cnpsAT));
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
                            cell('Jours travaillés', { fontSize: 6.3, color: '#475569' }), cell(calc.joursTrav, { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('I.T.S', { fontSize: 6.3, color: '#475569' }), cell(fcfa(calc.salarial.its), { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('Caisse de Retraite', { fontSize: 6.3, color: '#475569' }), cell(fcfa(calc.salarial.cnps), { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('', { fontSize: 6.3 })
                        ],
                        [
                            cell('Brut', { fontSize: 6.3, color: '#475569' }), cell(fcfa(calc.gainsTotaux), { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('Brut imposable', { fontSize: 6.3, color: '#475569' }), cell(fcfa(calc.brutImposable), { fontSize: 6.3, bold: true, align: 'right' }),
                            cell('R.I.C.F', { fontSize: 6.3, color: '#475569' }), cell(fcfa(calc.salarial.ricf), { fontSize: 6.3, bold: true, align: 'right' }),
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

/** Identité employeur commune aux modèles ci-dessous — un seul endroit à corriger. */
function resolveCompanyInfo(employee, companyInfo = {}) {
    return {
        nom: companyInfo.nom_entreprise || employee.nom_entreprise || 'VOTRE ENTREPRISE',
        adresse: companyInfo.adresse || employee.adresse || '',
        siege: companyInfo.siege_social || employee.siege_social || companyInfo.adresse || '',
        ville: companyInfo.ville || employee.ville || '',
        cnps: companyInfo.numero_cnps || employee.numero_cnps || '____',
        contribuable: companyInfo.numero_contribuable || employee.numero_contribuable || '____',
        email: companyInfo.email || employee.email_entreprise || '',
        telephone: companyInfo.telephone || employee.tel_entreprise || '',
        logo: companyInfo.logo || null
    };
}

/** Rubriques de gains/retenues communes, sous une forme neutre exploitable par
 * n'importe quelle mise en page ci-dessous (une ligne = un libellé + un montant,
 * classé gain/retenue salariale/charge patronale). Construit une seule fois,
 * pour ne pas retrouver un calcul différent d'un modèle à l'autre. */
// Numérotation de rubrique commune à tous les modèles ONDA, alignée sur un
// bulletin réel (LA LAVANDIERE) : 10/11/60/655 et 450/452/502/503/520/530 y
// sont directement visibles. L'impôt sur salaire principal y garde le
// numéro 430 : c'est celui de l'ITS (impôt unique, réforme fiscale 2024),
// seul régime que ce moteur calcule désormais.
const CODE_RUBRIQUE = {
    salaireBase: '10', sursalaire: '11', primeAnciennete: '12', prime: '13',
    allocationConges: '14', heuresSup: '15', gratification: '60',
    primeTransport: '655', primeLogement: '656',
    its: '430', cnpsSalariale: '502', cmuSalariale: '504', ricf: '432', acompte: '460',
    cnpsPatronale: '503', cnpsPF: '450', cnpsAT: '452', cnpsAM: '451', cmuPatronale: '505',
    impotEmployeur: '431', fdfpTA: '520', fdfpFPC: '530'
};

/**
 * Fusionne les codes de rubrique du compte (Paramètres) avec les valeurs par
 * défaut ONDA : un compte qui n'a jamais rien configuré obtient les codes par
 * défaut ; un compte qui n'a redéfini que « its » garde le reste tel quel.
 */
function resolveCodesRubrique(codesCompte) {
    if (!codesCompte) return CODE_RUBRIQUE;
    return { ...CODE_RUBRIQUE, ...codesCompte };
}

function construireRubriques(employee, calc, codesCompte) {
    const c = resolveCodesRubrique(codesCompte);
    const gains = [];
    gains.push({ code: c.salaireBase, label: 'Salaire de base', base: calc.salaireBaseMensuel, taux: '100%', montant: calc.salaireBase });
    if (calc.sursalaire > 0) gains.push({ code: c.sursalaire, label: 'Sursalaire', base: employee.sursalaire, taux: '100%', montant: calc.sursalaire });
    if (calc.primeAnciennete > 0) gains.push({ code: c.primeAnciennete, label: `Prime d'ancienneté (${calc.ansAnciennete} ans)`, montant: calc.primeAnciennete });
    (employee.primes || []).forEach(p => { if (p.montant > 0) gains.push({ code: c.prime, label: p.libelle || p.label || 'Prime', montant: p.montant }); });
    if (calc.allocationConges > 0) gains.push({ code: c.allocationConges, label: `Allocation congés (${calc.joursCP} j)`, montant: calc.allocationConges });
    (calc.heuresSupTranches || []).forEach(t => gains.push({ code: c.heuresSup, label: `Heures sup. — ${t.label} (${t.heures}h)`, base: calc.tauxHoraire, taux: `×${t.coef}`, montant: t.montant }));
    if (calc.primeTransport > 0) gains.push({ code: c.primeTransport, label: 'Indemnité de transport', montant: calc.primeTransport, exonere: true });
    if (calc.primeLogement > 0) gains.push({ code: c.primeLogement, label: 'Prime de logement', montant: calc.primeLogement, exonere: true });

    const retenues = [];
    retenues.push({ code: c.its, label: 'Impôt sur les Traitements et Salaires (ITS)', base: calc.brutImposable, montant: calc.salarial.its });
    retenues.push({ code: c.cnpsSalariale, label: 'CNPS — Retraite (part salariale)', base: calc.baseCNPS, taux: '6.3%', montant: calc.salarial.cnps });
    retenues.push({ code: c.cmuSalariale, label: 'CMU — Assurance maladie', base: calc.totalPersonnesCMU * 1000, montant: calc.salarial.cmu });
    // Toujours en grandeur positive comme les autres lignes : c'est une
    // information (déjà déduite de l'ITS ci-dessus), pas une retenue
    // supplémentaire — chaque modèle décide comment la présenter via `info`.
    if (calc.salarial.ricf > 0) retenues.push({ code: c.ricf, label: 'dont Réduction Impôt Charge de Famille (RICF)', montant: calc.salarial.ricf, info: true });
    if (calc.salarial.acompte > 0) retenues.push({ code: c.acompte, label: 'Acompte / avance', montant: calc.salarial.acompte });

    const patronal = [];
    patronal.push({ code: c.cnpsPatronale, label: 'CNPS — Retraite (part patronale)', base: calc.baseCNPS, taux: '7.7%', montant: calc.patronal.cnpsRetraite });
    patronal.push({ code: c.cnpsPF, label: 'CNPS — Prestations familiales', base: calc.baseCNPS_PfAtAm, taux: '5.0%', montant: calc.patronal.cnpsPF });
    patronal.push({ code: c.cnpsAT, label: 'CNPS — Accident du travail', base: calc.baseCNPS_PfAtAm, taux: `${employee.taux_at || 2}%`, montant: calc.patronal.cnpsAT });
    patronal.push({ code: c.cmuPatronale, label: 'CMU — part patronale', montant: calc.patronal.cmu });
    patronal.push({ code: c.impotEmployeur, label: 'T.A.S.P (impôt employeur)', base: calc.brutImposable, taux: '1.2%', montant: calc.patronal.impotEmployeur });
    patronal.push({ code: c.fdfpTA, label: 'FDFP — Taxe apprentissage', base: calc.brutImposable, taux: '0.4%', montant: calc.patronal.fdfpTA });
    patronal.push({ code: c.fdfpFPC, label: 'FDFP — Formation continue', base: calc.brutImposable, taux: '0.6%', montant: calc.patronal.fdfpFPC });

    return { gains, retenues, patronal };
}

/**
 * Troisième modèle par défaut, format « compact » (inspiré des bulletins Sage
 * Paie / petites structures) : une seule colonne de montants, gains et
 * retenues à la suite plutôt que côte à côte — le plus dense des modèles
 * proposés, pensé pour tenir sur une demi-page.
 */
function generatePdfDefinitionCompact(employee, calc, companyInfo = {}) {
    const BLUE = '#1e3a8a', BORDER = '#e2e8f0', BAND = '#f1f5f9';
    const company = resolveCompanyInfo(employee, companyInfo);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const periode = `${['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][moisNum] || ''} ${annee}`;

    const headerCols = [];
    if (company.logo) headerCols.push({ image: company.logo, fit: [45, 30], width: 55 });
    headerCols.push({ width: '*', stack: [{ text: company.nom, fontSize: 11, bold: true, color: BLUE }, { text: [company.adresse, company.ville].filter(Boolean).join(' — '), fontSize: 7, color: '#64748b' }] });
    headerCols.push({ width: 140, stack: [{ text: 'BULLETIN DE PAIE', fontSize: 10, bold: true, alignment: 'right' }, { text: periode, fontSize: 8, alignment: 'right', color: '#64748b' }] });

    const infoLine = `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}  ·  ${employee.poste || ''}  ·  Matricule ${employee.matricule || '____'}  ·  N° CNPS ${employee.num_secu || employee.numero_cnps || '____'}`;

    const cell = (text, opts = {}) => ({ text: (text === null || text === undefined) ? '' : text.toString(), fontSize: opts.fontSize || 7.2, bold: opts.bold || false, alignment: opts.align || 'left', fillColor: opts.fill || null, color: opts.color || 'black', margin: opts.margin || [3, 2, 3, 2] });
    const ligneSection = (titre) => [cell('', { fill: BAND }), cell(titre, { bold: true, fill: BAND, colSpan: 4 }), {}, {}, {}];
    const ligneMontant = (r, signe = 1) => {
        // Une ligne « info » (ex. RICF) est une précision, pas une retenue en
        // plus : elle s'affiche toujours en positif, quel que soit le signe
        // demandé pour le reste de la section.
        const s = r.info ? 1 : signe;
        return [
            cell(r.code || '', { align: 'center', color: r.info ? '#94a3b8' : '#64748b' }),
            cell((r.info ? '   ' : '') + r.label + (r.exonere ? ' (exonérée)' : ''), { color: r.info ? '#64748b' : 'black', italics: !!r.info }),
            cell(r.base !== undefined ? fcfa(r.base) : '', { align: 'right', color: '#94a3b8' }),
            cell(r.taux || '', { align: 'center', color: '#94a3b8' }),
            cell(fcfa(r.montant * s), { align: 'right', color: r.info ? '#64748b' : (s < 0 ? '#dc2626' : '#0f172a') })
        ];
    };

    const body = [
        [cell('N°', { bold: true, align: 'center' }), cell('LIBELLÉ', { bold: true }), cell('BASE', { bold: true, align: 'right' }), cell('TAUX', { bold: true, align: 'center' }), cell('MONTANT', { bold: true, align: 'right' })],
        ligneSection('GAINS'),
        ...gains.map(r => ligneMontant(r)),
        [cell('', { fill: BAND }), cell('Total brut', { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell(fcfa(calc.gainsTotaux), { align: 'right', bold: true, fill: BAND })],
        ligneSection('RETENUES SALARIALES'),
        ...retenues.map(r => ligneMontant(r, -1)),
        [cell('', { fill: BAND }), cell('Total retenues', { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell(fcfa(-calc.salarial.total), { align: 'right', bold: true, color: '#dc2626', fill: BAND })],
        ligneSection('CHARGES PATRONALES (pour information)'),
        ...patronal.map(r => ligneMontant(r)),
        [cell('', { fill: BAND }), cell('Total charges patronales', { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell(fcfa(calc.patronal.grandTotal), { align: 'right', bold: true, fill: BAND })]
    ];

    return {
        pageSize: 'A4', pageMargins: [32, 32, 32, 32],
        content: [
            { columns: headerCols },
            { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 531, y2: 6, lineWidth: 1, strokeColor: BORDER }] },
            { text: infoLine, fontSize: 7.5, margin: [0, 8, 0, 10] },
            { table: { headerRows: 1, widths: ['7%', '41%', '16%', '12%', '24%'], body }, layout: { hLineWidth: (i, n) => (i === 0 || i === 1 || i === n.table.body.length) ? 1 : 0.3, vLineWidth: () => 0, hLineColor: () => BORDER } },
            { text: '', margin: [0, 10] },
            {
                columns: [
                    { width: '*', text: `Net imposable : ${fcfa(calc.brutImposable)}     Coût employeur total : ${fcfa(calc.gainsTotaux + calc.patronal.grandTotal)}`, fontSize: 6.8, color: '#64748b', margin: [0, 10, 0, 0] },
                    { width: 170, table: { widths: ['*'], body: [[{ text: 'NET À PAYER', fontSize: 8, bold: true, alignment: 'center' }], [{ text: fcfa(calc.netAPayer) + ' F', fontSize: 15, bold: true, alignment: 'center', fillColor: '#FFFF00', margin: [0, 4] }]] }, layout: { hLineWidth: () => 1.2, vLineWidth: () => 1.2, hLineColor: () => '#000', vLineColor: () => '#000' } }
                ]
            },
            { text: `Mode de règlement : ${employee.virement ? `Virement bancaire${employee.rib ? ` — ${employee.rib}` : ''}` : 'Espèces'}`, fontSize: 6.8, margin: [0, 8, 0, 0], color: '#64748b' },
            { text: '', margin: [0, 14] },
            { columns: [{ text: 'Signature Employeur', fontSize: 6.5, alignment: 'center' }, { text: 'Signature Salarié', fontSize: 6.5, alignment: 'center' }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

/**
 * Quatrième modèle par défaut, inspiré de la mise en page LOGIPAIE : bloc
 * salarié en grille dense, gains/retenues salariales dans un tableau, charges
 * patronales dans un second tableau SÉPARÉ en bas de page — LOGIPAIE ne les
 * mélange jamais sur la même ligne, contrairement au modèle « Grille numérotée ».
 */
function generatePdfDefinitionLogipaie(employee, calc, companyInfo = {}) {
    const NAVY = '#0f172a', BORDER = '#94a3b8', BAND = '#e2e8f0';
    const company = resolveCompanyInfo(employee, companyInfo);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periode = `01/${String(moisNum).padStart(2, '0')}/${annee} au ${dernierJour}/${String(moisNum).padStart(2, '0')}/${annee}`;

    const cell = (text, opts = {}) => ({ text: (text === null || text === undefined) ? '' : text.toString(), fontSize: opts.fontSize || 6.8, bold: opts.bold || false, alignment: opts.align || 'left', fillColor: opts.fill || null, color: opts.color || 'black', colSpan: opts.colSpan || null, margin: opts.margin || [2, 2, 2, 2] });
    const headerCell = (text) => cell(text, { fill: NAVY, color: 'white', bold: true, align: 'center' });

    const grilleSalarie = {
        table: {
            widths: ['16%', '34%', '16%', '34%'],
            body: [
                [cell('Matricule', { bold: true, fill: BAND }), cell(employee.matricule || '____'), cell('N° CNPS', { bold: true, fill: BAND }), cell(employee.num_secu || employee.numero_cnps || '____')],
                [cell('Nom', { bold: true, fill: BAND }), cell((employee.nom || '').toUpperCase()), cell('Prénoms', { bold: true, fill: BAND }), cell(employee.prenom || '')],
                [cell('Emploi', { bold: true, fill: BAND }), cell(employee.poste || ''), cell('Catégorie', { bold: true, fill: BAND }), cell(employee.categorie || '')],
                [cell('Date embauche', { bold: true, fill: BAND }), cell(employee.date_embauche ? formatDate(employee.date_embauche) : ''), cell('Ancienneté', { bold: true, fill: BAND }), cell(calc.ancienneteTxt || '')],
                [cell('Situation familiale', { bold: true, fill: BAND }), cell({ celibataire: 'Célibataire', marie: 'Marié(e)', divorce: 'Divorcé(e)', veuf: 'Veuf/Veuve' }[employee.situation_matrimoniale] || employee.situation_matrimoniale || ''), cell('Parts IGR', { bold: true, fill: BAND }), cell(calc.parts !== undefined ? calc.parts.toFixed(1) : '1.0')]
            ]
        },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER }
    };

    const ligne = (r, retenue = false) => [
        cell(r.code || '', { align: 'center', color: '#64748b' }),
        cell(r.label + (r.exonere ? ' (exo.)' : '')),
        cell(r.base !== undefined ? fcfa(r.base) : '', { align: 'right' }),
        cell(r.taux || '', { align: 'center' }),
        cell(fcfa(Math.abs(r.montant)), { align: 'right', color: retenue ? '#dc2626' : '#166534', bold: r.info })
    ];

    const bodyPaie = [[headerCell('N°'), headerCell('Rubrique'), headerCell('Base'), headerCell('Taux'), headerCell('Montant')]];
    bodyPaie.push([cell('GAINS', { bold: true, fill: BAND, colSpan: 5 }), {}, {}, {}, {}]);
    gains.forEach(r => bodyPaie.push(ligne(r)));
    bodyPaie.push([cell('TOTAL BRUT', { bold: true, fill: BAND, colSpan: 4 }), {}, {}, {}, cell(fcfa(calc.gainsTotaux), { align: 'right', bold: true, fill: BAND })]);
    bodyPaie.push([cell('RETENUES', { bold: true, fill: BAND, colSpan: 5 }), {}, {}, {}, {}]);
    retenues.forEach(r => bodyPaie.push(ligne(r, !r.info)));
    bodyPaie.push([cell('TOTAL RETENUES', { bold: true, fill: BAND, colSpan: 4 }), {}, {}, {}, cell(fcfa(calc.salarial.total), { align: 'right', bold: true, color: '#dc2626', fill: BAND })]);

    const bodyPatronal = [[headerCell('N°'), headerCell('Charge patronale'), headerCell('Base'), headerCell('Taux'), headerCell('Montant')]];
    patronal.forEach(r => bodyPatronal.push(ligne(r)));
    bodyPatronal.push([cell('TOTAL CHARGES PATRONALES', { bold: true, fill: BAND, colSpan: 4 }), {}, {}, {}, cell(fcfa(calc.patronal.grandTotal), { align: 'right', bold: true, fill: BAND })]);

    return {
        pageSize: 'A4', pageMargins: [32, 32, 32, 32],
        content: [
            {
                columns: [
                    company.logo ? { image: company.logo, fit: [60, 40], width: 70 } : { width: 70, text: '' },
                    { width: '*', stack: [{ text: company.nom, fontSize: 11, bold: true }, { text: company.adresse, fontSize: 6.8, color: '#475569' }, { text: `CNPS ${company.cnps}  ·  Contribuable ${company.contribuable}`, fontSize: 6.5, color: '#475569' }] },
                    { width: 150, stack: [{ text: 'BULLETIN DE PAIE', fontSize: 10, bold: true, alignment: 'right', color: NAVY }, { text: `Du ${periode}`, fontSize: 7, alignment: 'right', color: '#475569' }] }
                ]
            },
            { text: '', margin: [0, 6] },
            grilleSalarie,
            { text: '', margin: [0, 8] },
            { table: { headerRows: 1, widths: ['7%', '39%', '16%', '12%', '24%'], body: bodyPaie }, layout: { hLineWidth: (i, n) => (i <= 1 || i === n.table.body.length) ? 1 : 0.3, vLineWidth: () => 0.3, hLineColor: () => BORDER, vLineColor: () => BORDER } },
            { text: '', margin: [0, 10] },
            { text: 'CHARGES PATRONALES', fontSize: 7.5, bold: true, color: NAVY, margin: [0, 0, 0, 3] },
            { table: { headerRows: 1, widths: ['7%', '39%', '16%', '12%', '24%'], body: bodyPatronal }, layout: { hLineWidth: (i, n) => (i <= 1 || i === n.table.body.length) ? 1 : 0.3, vLineWidth: () => 0.3, hLineColor: () => BORDER, vLineColor: () => BORDER } },
            { text: '', margin: [0, 10] },
            {
                columns: [
                    { width: '*', text: `Mode de règlement : ${employee.virement ? 'Virement bancaire' : 'Espèces'}`, fontSize: 7, margin: [0, 10, 0, 0], color: '#475569' },
                    { width: 170, table: { widths: ['*'], body: [[{ text: 'NET À PAYER', fontSize: 8, bold: true, alignment: 'center' }], [{ text: fcfa(calc.netAPayer) + ' F', fontSize: 15, bold: true, alignment: 'center', fillColor: '#FFFF00', margin: [0, 4] }]] }, layout: { hLineWidth: () => 1.2, vLineWidth: () => 1.2, hLineColor: () => '#000', vLineColor: () => '#000' } }
                ]
            },
            { text: '', margin: [0, 12] },
            { columns: [{ text: 'Cachet et signature de l\'employeur', fontSize: 6.5, alignment: 'center' }, { text: 'Signature du salarié (précédée de « lu et approuvé »)', fontSize: 6.5, alignment: 'center' }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

/**
 * Cinquième modèle par défaut, style « reçu bancaire » : gains et retenues
 * dans deux tableaux CÔTE À CÔTE plutôt qu'un seul tableau large — courant
 * dans les bulletins émis par les banques/assurances à Abidjan, où le mode de
 * règlement occupe une place centrale.
 */
function generatePdfDefinitionBancaire(employee, calc, companyInfo = {}) {
    const TEAL = '#0f766e', BORDER = '#d1d5db', BAND = '#f0fdfa';
    const company = resolveCompanyInfo(employee, companyInfo);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);
    const totalPatronal = patronal.reduce((s, r) => s + (r.montant || 0), 0);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const periode = `${['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][moisNum] || ''} ${annee}`;

    const cell = (text, opts = {}) => ({ text: (text === null || text === undefined) ? '' : text.toString(), fontSize: opts.fontSize || 7, bold: opts.bold || false, alignment: opts.align || 'left', fillColor: opts.fill || null, color: opts.color || 'black', margin: opts.margin || [3, 2, 3, 2] });
    const headerCell = (text) => cell(text, { fill: TEAL, color: 'white', bold: true, align: 'center' });
    const ligne = (r) => [cell((r.code ? `${r.code}  ` : '') + r.label + (r.exonere ? ' (exo.)' : ''), { color: r.info ? '#9ca3af' : 'black' }), cell(fcfa(r.montant), { align: 'right', color: r.info ? '#9ca3af' : 'black' })];

    const bodyGains = [[headerCell('GAINS'), headerCell('')], ...gains.map(ligne), [cell('Total brut', { bold: true, fill: BAND }), cell(fcfa(calc.gainsTotaux), { align: 'right', bold: true, fill: BAND })]];
    const bodyRetenues = [[headerCell('RETENUES'), headerCell('')], ...retenues.map(ligne), [cell('Total retenues', { bold: true, fill: BAND }), cell(fcfa(calc.salarial.total), { align: 'right', bold: true, fill: BAND })]];

    return {
        pageSize: 'A4', pageMargins: [32, 32, 32, 32],
        content: [
            {
                columns: [
                    company.logo ? { image: company.logo, fit: [50, 34], width: 60 } : { width: 60, text: '' },
                    { width: '*', stack: [{ text: company.nom, fontSize: 11, bold: true, color: TEAL }, { text: [company.adresse, company.ville].filter(Boolean).join(', '), fontSize: 7, color: '#6b7280' }] },
                    { width: 150, stack: [{ text: 'BULLETIN DE PAIE', fontSize: 10, bold: true, alignment: 'right' }, { text: periode, fontSize: 8, alignment: 'right', color: '#6b7280' }] }
                ]
            },
            { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 531, y2: 6, lineWidth: 1.5, strokeColor: TEAL }] },
            { text: '', margin: [0, 8] },
            { text: `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}   —   ${employee.poste || ''}   —   Matricule ${employee.matricule || '____'}   —   N° CNPS ${employee.num_secu || employee.numero_cnps || '____'}`, fontSize: 7.5, margin: [0, 0, 0, 10] },
            {
                columns: [
                    { width: '49%', table: { headerRows: 1, widths: ['70%', '30%'], body: bodyGains }, layout: { hLineWidth: (i, n) => (i <= 1 || i === n.table.body.length) ? 1 : 0.3, vLineWidth: () => 0, hLineColor: () => BORDER } },
                    { width: '2%', text: '' },
                    { width: '49%', table: { headerRows: 1, widths: ['70%', '30%'], body: bodyRetenues }, layout: { hLineWidth: (i, n) => (i <= 1 || i === n.table.body.length) ? 1 : 0.3, vLineWidth: () => 0, hLineColor: () => BORDER } }
                ]
            },
            { text: '', margin: [0, 10] },
            { text: `Charges patronales (information) : ${fcfa(totalPatronal)}     Coût employeur total : ${fcfa(calc.gainsTotaux + totalPatronal)}`, fontSize: 6.8, color: '#6b7280' },
            { text: '', margin: [0, 12] },
            {
                table: {
                    widths: ['*', 180],
                    body: [[
                        { stack: [{ text: 'MODE DE RÈGLEMENT', fontSize: 7, bold: true, color: TEAL }, { text: employee.virement ? `Virement bancaire${employee.rib ? `\nCompte : ${employee.rib}` : ''}` : 'Espèces', fontSize: 8, margin: [0, 3, 0, 0] }], fillColor: BAND, margin: [10, 10] },
                        { stack: [{ text: 'NET À PAYER', fontSize: 8, bold: true, alignment: 'center' }, { text: fcfa(calc.netAPayer) + ' F', fontSize: 16, bold: true, alignment: 'center', color: TEAL, margin: [0, 4, 0, 0] }], margin: [10, 10] }
                    ]]
                },
                layout: { hLineWidth: () => 1, vLineWidth: (i) => (i === 1 ? 1 : 0), hLineColor: () => TEAL, vLineColor: () => TEAL }
            },
            { text: '', margin: [0, 14] },
            { columns: [{ text: "Cachet & signature de l'employeur", fontSize: 6.5, alignment: 'center' }, { text: 'Signature du salarié', fontSize: 6.5, alignment: 'center' }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

/**
 * Sixième modèle par défaut, style « cartes » moderne : sections en blocs
 * colorés distincts plutôt qu'un grand tableau — vise les entreprises qui
 * veulent un bulletin visuellement plus contemporain, sans rien perdre des
 * mentions légales.
 */
function generatePdfDefinitionModerne(employee, calc, companyInfo = {}) {
    const INDIGO = '#4338ca', SOFT = '#eef2ff', BORDER = '#e5e7eb';
    const company = resolveCompanyInfo(employee, companyInfo);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);
    const totalPatronal = patronal.reduce((s, r) => s + (r.montant || 0), 0);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const periode = `${['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][moisNum] || ''} ${annee}`;

    const card = (titre, contenu) => ({
        table: { widths: ['*'], body: [[{ text: titre, fontSize: 8, bold: true, color: 'white', fillColor: INDIGO, margin: [10, 5] }], [{ stack: contenu, margin: [10, 8] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0.75, vLineColor: () => BORDER, paddingLeft: () => 0, paddingRight: () => 0 }
    });
    const kv = (label, value) => ({ columns: [{ text: label, fontSize: 7, color: '#6b7280', width: 90 }, { text: (value || '').toString(), fontSize: 7.5, bold: true, width: '*' }], margin: [0, 1.5] });
    const ligneMontant = (r, couleur) => ({ columns: [{ text: (r.code ? `${r.code}  ` : '') + r.label + (r.exonere ? ' (exo.)' : ''), fontSize: 7, italics: !!r.info, color: r.info ? '#9ca3af' : undefined, width: '*' }, { text: fcfa(r.montant), fontSize: 7, bold: !r.info, alignment: 'right', color: r.info ? '#9ca3af' : couleur, width: 70 }], margin: [0, 1.5] });

    return {
        pageSize: 'A4', pageMargins: [30, 30, 30, 30],
        content: [
            {
                table: { widths: ['*'], body: [[{
                    columns: [
                        company.logo ? { image: company.logo, fit: [42, 28], width: 52 } : { width: 52, text: '' },
                        { width: '*', stack: [{ text: company.nom, fontSize: 11, bold: true, color: 'white' }, { text: [company.adresse, company.ville].filter(Boolean).join(', '), fontSize: 6.8, color: '#e0e7ff' }] },
                        { width: 150, stack: [{ text: 'BULLETIN DE PAIE', fontSize: 10, bold: true, alignment: 'right', color: 'white' }, { text: periode, fontSize: 7.5, alignment: 'right', color: '#e0e7ff' }] }
                    ],
                    margin: [12, 10]
                }]] },
                layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: INDIGO }
            },
            { text: '', margin: [0, 10] },
            card('IDENTITÉ DU SALARIÉ', [
                { columns: [{ stack: [kv('Nom', (employee.nom || '').toUpperCase()), kv('Prénoms', employee.prenom), kv('Emploi', employee.poste), kv('Matricule', employee.matricule)] }, { stack: [kv('N° CNPS', employee.num_secu || employee.numero_cnps), kv('Catégorie', employee.categorie), kv('Ancienneté', calc.ancienneteTxt), kv('Parts IGR', calc.parts !== undefined ? calc.parts.toFixed(1) : '1.0')] }] }
            ]),
            { text: '', margin: [0, 8] },
            {
                columns: [
                    { width: '49%', ...card('RÉMUNÉRATION', [...gains.map(r => ligneMontant(r, '#166534')), { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 235, y2: 4, lineWidth: 0.5, lineColor: BORDER }] }, { columns: [{ text: 'Total brut', fontSize: 7.5, bold: true, width: '*' }, { text: fcfa(calc.gainsTotaux), fontSize: 7.5, bold: true, alignment: 'right', width: 70 }], margin: [0, 3, 0, 0] }]) },
                    { width: '2%', text: '' },
                    { width: '49%', ...card('COTISATIONS', [...retenues.map(r => ligneMontant(r, '#dc2626')), { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 235, y2: 4, lineWidth: 0.5, lineColor: BORDER }] }, { columns: [{ text: 'Total retenues', fontSize: 7.5, bold: true, width: '*' }, { text: fcfa(calc.salarial.total), fontSize: 7.5, bold: true, alignment: 'right', color: '#dc2626', width: 70 }], margin: [0, 3, 0, 0] }, { text: `Charges patronales (info.) : ${fcfa(totalPatronal)}`, fontSize: 6.3, color: '#9ca3af', margin: [0, 4, 0, 0] }]) }
                ]
            },
            { text: '', margin: [0, 10] },
            {
                table: { widths: ['*', 170], body: [[
                    { stack: [{ text: 'MODE DE RÈGLEMENT', fontSize: 6.8, bold: true, color: INDIGO }, { text: employee.virement ? `Virement bancaire${employee.rib ? ` — ${employee.rib}` : ''}` : 'Espèces', fontSize: 7.5, margin: [0, 3, 0, 0] }], margin: [12, 10] },
                    { stack: [{ text: 'NET À PAYER', fontSize: 7.5, bold: true, alignment: 'center', color: 'white' }, { text: fcfa(calc.netAPayer) + ' F', fontSize: 15, bold: true, alignment: 'center', color: 'white', margin: [0, 3, 0, 0] }], fillColor: INDIGO, margin: [10, 8] }
                ]] },
                layout: { hLineWidth: () => 0.75, vLineWidth: () => 0, hLineColor: () => BORDER }
            },
            { text: '', margin: [0, 14] },
            { columns: [{ text: "Cachet & signature de l'employeur", fontSize: 6.5, alignment: 'center', color: '#6b7280' }, { text: 'Signature du salarié', fontSize: 6.5, alignment: 'center', color: '#6b7280' }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

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
    const jrsMois = calc.joursTrav || dernierJour;

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

    const joursBase = jrsMois || 30;
    body.push(ligne(codes.salaireBase, 'Salaire de base', joursBase, (calc.salaireBaseMensuel || 0) / joursBase, undefined, calc.salaireBase));
    if (calc.sursalaire > 0) body.push(ligne(codes.sursalaire, 'Sursalaire', joursBase, (employee.sursalaire || 0) / joursBase, undefined, calc.sursalaire));
    if (calc.primeAnciennete > 0) body.push(ligne(codes.primeAnciennete, `Prime d'ancienneté (${calc.ansAnciennete} ans)`, undefined, undefined, undefined, calc.primeAnciennete));
    (employee.primes || []).forEach(p => { if (p.montant > 0) body.push(ligne(codes.prime, p.libelle || p.label || 'Prime', undefined, undefined, undefined, p.montant)); });
    if (calc.allocationConges > 0) body.push(ligne(codes.allocationConges, `Allocation congés (${calc.joursCP} j)`, calc.joursCP, undefined, undefined, calc.allocationConges));
    (calc.heuresSupTranches || []).forEach(t => body.push(ligne(codes.heuresSup, `Heures sup. — ${t.label}`, t.heures, calc.tauxHoraire, `×${t.coef}`, t.montant)));
    if (calc.primeTransport > 0) body.push(ligne(codes.primeTransport, 'Indemnité de transport', undefined, undefined, undefined, calc.primeTransport));
    if (calc.primeLogement > 0) body.push(ligne(codes.primeLogement, 'Prime de logement', undefined, undefined, undefined, calc.primeLogement));

    body.push(bandRow('TOTAL BRUT', calc.gainsTotaux));

    body.push(ligne(codes.its, 'Impôt sur les Traitements et Salaires', undefined, calc.brutImposable, undefined, undefined, calc.salarial.its));
    body.push(ligne(codes.cnpsSalariale, 'Retenue CNPS', undefined, calc.baseCNPS, '6,30', undefined, calc.salarial.cnps));
    body.push(ligne(codes.cmuSalariale, 'CMU — Assurance maladie', undefined, calc.totalPersonnesCMU * 1000, undefined, undefined, calc.salarial.cmu));
    if (calc.salarial.ricf > 0) body.push(ligne(codes.ricf, 'dont Réduction Impôt Charge de Famille (RICF)', undefined, undefined, undefined, undefined, calc.salarial.ricf));
    if (calc.salarial.acompte > 0) body.push(ligne(codes.acompte, 'Acompte / avance', undefined, undefined, undefined, undefined, calc.salarial.acompte));

    body.push(ligne(codes.cnpsPatronale, 'Retraite Générale CNPS', undefined, undefined, undefined, undefined, undefined, calc.baseCNPS, '7,70', calc.patronal.cnpsRetraite));
    body.push(ligne(codes.cnpsPF, 'Prestations Familiales', undefined, undefined, undefined, undefined, undefined, calc.baseCNPS_PfAtAm, '5,00', calc.patronal.cnpsPF));
    body.push(ligne(codes.cnpsAT, 'Accident du Travail', undefined, undefined, undefined, undefined, undefined, calc.baseCNPS_PfAtAm, `${employee.taux_at || 2},00`, calc.patronal.cnpsAT));
    body.push(ligne(codes.cmuPatronale, 'CMU — part patronale', undefined, undefined, undefined, undefined, undefined, undefined, undefined, calc.patronal.cmu));
    body.push(ligne(codes.impotEmployeur, 'T.A.S.P (impôt employeur)', undefined, undefined, undefined, undefined, undefined, calc.brutImposable, '1,20', calc.patronal.impotEmployeur));
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
                                    congesRow('Congés')
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
                        // Cumul annuel identique au cumul du mois : ONDA ne conserve pas
                        // encore d'historique de paie (voir generatePdfDefinitionGrilleNumerotee
                        // ci-dessus) — exact pour un premier bulletin de l'année, approximatif ensuite.
                        cumulsRow(`Année ${annee}`, calc.gainsTotaux, calc.salarial.total, totalPatronal, calc.brutImposable, calc.joursTrav, calc.montantHeuresSup, calc.netAPayer)
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

/**
 * Huitième modèle par défaut, réplique fidèle d'un bulletin réel (A.D.
 * ARCHITECTURE) : boîtes « PÉRIODE DE PAIE » / « DATE DE PAIE » / « TYPE DE
 * PAIE » en en-tête, boîte « CUMULS ANNUELS », résumé GAINS/RETENUES/NET À
 * PAYER, et pied RÈGLEMENT/BILLETAGE (décompte des coupures en espèces).
 *
 * Le bulletin d'origine affiche I.S./C.N./I.G.R. (ancien régime fiscal) dans
 * ses cumuls annuels ; conformément à la réforme 2024, ce modèle affiche
 * l'ITS qui les a remplacés plutôt que de reproduire des libellés obsolètes.
 */
function generatePdfDefinitionADArchitecture(employee, calc, companyInfo = {}) {
    const BORDER = '#000000';
    // Violet (thème « cumuls/administratif »), avec un bandeau franc pour les
    // sous-totaux — pas un gris sur gris, voir la même remarque sur
    // generatePdfDefinitionLavandiere ci-dessus.
    const VIOLET = '#6d28d9';
    const BAND = '#ddd6fe';
    const company = resolveCompanyInfo(employee, companyInfo);
    const codes = resolveCodesRubrique(companyInfo.rubriqueCodes);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periodeDebut = `01/${String(moisNum).padStart(2, '0')}/${String(annee).slice(-2)}`;
    const periodeFin = `${dernierJour}/${String(moisNum).padStart(2, '0')}/${String(annee).slice(-2)}`;

    const box = (contenu, opts = {}) => ({
        table: { widths: ['*'], body: [[{ stack: contenu, margin: opts.margin || [6, 5] }]] },
        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER }
    });
    const kv = (label, value, opts = {}) => ({ columns: [{ text: label, fontSize: 6.6, width: opts.labelWidth || 100 }, { text: (value === undefined || value === null || value === '') ? '' : value.toString(), fontSize: 6.6, bold: true, width: '*' }], margin: [0, 1] });

    const cell = (text, opts = {}) => ({
        text: (text === null || text === undefined) ? '' : text.toString(),
        fontSize: opts.fontSize || 6.6, bold: opts.bold || false, alignment: opts.align || 'left',
        fillColor: opts.fill || null, colSpan: opts.colSpan || null, margin: opts.margin || [2, 1.5, 2, 1.5]
    });
    const headerCell = (text) => cell(text, { fill: VIOLET, color: 'white', bold: true, align: 'center', fontSize: 6.6 });

    const ligne = (numero, label, base, taux, gain, retenue) => [
        cell(numero || ''), cell(label),
        cell(base !== undefined && base !== null ? fcfa(base) : '', { align: 'right' }),
        cell(taux || '', { align: 'center' }),
        cell(gain !== undefined && gain !== null ? fcfa(gain) : '', { align: 'right' }),
        cell(retenue !== undefined && retenue !== null ? fcfa(retenue) : '', { align: 'right' })
    ];
    const bandRow = (label, gain, retenue) => [
        cell('', { fill: BAND }), cell(label, { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }),
        cell(gain !== undefined ? fcfa(gain) : '', { align: 'right', bold: true, fill: BAND }),
        cell(retenue !== undefined ? fcfa(retenue) : '', { align: 'right', bold: true, fill: BAND })
    ];

    const body = [[headerCell('N°'), headerCell('Désignation'), headerCell('Base'), headerCell('Taux'), headerCell('Gains'), headerCell('Retenues')]];
    body.push(ligne(codes.salaireBase, 'Salaire de base', calc.salaireBaseMensuel, '100%', calc.salaireBase));
    if (calc.sursalaire > 0) body.push(ligne(codes.sursalaire, 'Sursalaire', employee.sursalaire, '100%', calc.sursalaire));
    if (calc.primeAnciennete > 0) body.push(ligne(codes.primeAnciennete, `Prime d'ancienneté (${calc.ansAnciennete} ans)`, undefined, undefined, calc.primeAnciennete));
    (employee.primes || []).forEach(p => { if (p.montant > 0) body.push(ligne(codes.prime, p.libelle || p.label || 'Prime', undefined, undefined, p.montant)); });
    if (calc.allocationConges > 0) body.push(ligne(codes.allocationConges, `Allocation congés (${calc.joursCP} j)`, undefined, undefined, calc.allocationConges));
    (calc.heuresSupTranches || []).forEach(t => body.push(ligne(codes.heuresSup, `Heures sup. — ${t.label} (${t.heures}h)`, calc.tauxHoraire, `×${t.coef}`, t.montant)));
    if (calc.primeTransport > 0) body.push(ligne(codes.primeTransport, 'Indemnité de transport', undefined, undefined, calc.primeTransport));
    if (calc.primeLogement > 0) body.push(ligne(codes.primeLogement, 'Prime de logement', undefined, undefined, calc.primeLogement));
    body.push(bandRow('TOTAL BRUT', calc.gainsTotaux));

    body.push(ligne(codes.its, 'ITS — Impôt sur Traitements et Salaires', calc.brutImposable, null, null, calc.salarial.its));
    body.push(ligne(codes.cnpsSalariale, 'CNPS — Retraite (part salariale)', calc.baseCNPS, '6,3%', null, calc.salarial.cnps));
    body.push(ligne(codes.cmuSalariale, 'CMU — Assurance maladie', calc.totalPersonnesCMU * 1000, null, null, calc.salarial.cmu));
    if (calc.salarial.ricf > 0) body.push(ligne(codes.ricf, 'dont RICF (réduction charge de famille)', null, null, null, calc.salarial.ricf));
    if (calc.salarial.acompte > 0) body.push(ligne(codes.acompte, 'Acompte / avance', null, null, null, calc.salarial.acompte));
    body.push(bandRow('TOTAL RETENUES', undefined, calc.salarial.total));

    const totalPatronal = (calc.patronal.cnpsRetraite || 0) + (calc.patronal.cnpsPF || 0) + (calc.patronal.cnpsAT || 0) + (calc.patronal.cmu || 0) + (calc.patronal.impotEmployeur || 0) + (calc.patronal.fdfpTA || 0) + (calc.patronal.fdfpFPC || 0);

    // Décompte des coupures pour un règlement en espèces : uniquement affiché
    // quand ce n'est pas un virement (le « billetage » n'a pas de sens sinon).
    const coupures = [10000, 5000, 2000, 1000, 500, 250, 100, 50, 25, 10, 5];
    const billetage = [];
    if (!employee.virement) {
        let reste = Math.round(calc.netAPayer || 0);
        coupures.forEach(c => {
            const qte = Math.floor(reste / c);
            if (qte > 0) { billetage.push([cell(`${c} F`, { fontSize: 6.3 }), cell(qte, { align: 'right', fontSize: 6.3 }), cell(fcfa(qte * c), { align: 'right', fontSize: 6.3 })]); reste -= qte * c; }
        });
    }

    return {
        pageSize: 'A4', pageMargins: [28, 28, 28, 28],
        content: [
            {
                columns: [
                    { width: '46%', ...box([
                        company.logo ? { image: company.logo, fit: [90, 40], margin: [0, 0, 0, 4] } : { text: company.nom, fontSize: 11, bold: true },
                        !company.logo ? null : { text: company.nom, fontSize: 9, bold: true },
                        { text: company.adresse, fontSize: 6.6 }, { text: company.ville, fontSize: 6.6 },
                        { text: `N° CNPS : ${company.cnps}`, fontSize: 6.6 }, { text: `N° Contribuable : ${company.contribuable}`, fontSize: 6.6 }
                    ].filter(Boolean)) },
                    { width: '2%', text: '' },
                    { width: '27%', ...box([
                        { text: 'PÉRIODE DE PAIE', fontSize: 6.6, bold: true, alignment: 'center' },
                        { text: `Du ${periodeDebut} au ${periodeFin}`, fontSize: 7.5, alignment: 'center', margin: [0, 2, 0, 0] }
                    ]) },
                    { width: '2%', text: '' },
                    { width: '23%', stack: [
                        box([{ text: 'DATE DE PAIE', fontSize: 6.6, bold: true, alignment: 'center' }, { text: periodeFin, fontSize: 7.5, alignment: 'center', margin: [0, 2, 0, 0] }]),
                        { text: '', margin: [0, 2] },
                        box([{ text: 'TYPE DE PAIE', fontSize: 6.6, bold: true, alignment: 'center' }, { text: 'Mensuel', fontSize: 7.5, alignment: 'center', margin: [0, 2, 0, 0] }])
                    ] }
                ]
            },
            { text: '', margin: [0, 4] },
            { text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', fontSize: 12, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
            box([
                { columns: [kv('Nom', (employee.nom || '').toUpperCase()), kv('Matricule', employee.matricule), kv('Nb Parts IGR', calc.parts !== undefined ? calc.parts.toFixed(1) : '1,00')] },
                { columns: [kv('Prénoms', employee.prenom), kv('Emploi', employee.poste), kv('Nationalité', employee.nationalite || 'Ivoirienne')] },
                { columns: [kv('Équipe', employee.equipe || ''), kv('Sal. Cat.', employee.categorie || ''), kv('N° CNPS', employee.num_secu || employee.numero_cnps || '')] },
                { columns: [kv('Département', employee.departement || ''), kv('Service', employee.service || employee.departement || ''), kv("Date d'embauche", employee.date_embauche ? formatDate(employee.date_embauche) : '')] },
                { columns: [kv('Ancienneté', calc.ancienneteTxt), kv('Lieu de paie', company.ville), kv('Date retour congés', '')] }
            ]),
            { text: '', margin: [0, 6] },
            {
                table: { headerRows: 1, widths: ['6%', '30%', '13%', '9%', '13%', '13%'], body },
                layout: { hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.4, vLineWidth: () => 0.4, hLineColor: () => '#94a3b8', vLineColor: () => '#94a3b8' }
            },
            { text: '', margin: [0, 6] },
            {
                columns: [
                    { width: '46%', ...box([
                        { text: 'CUMULS ANNUELS', fontSize: 6.8, bold: true, margin: [0, 0, 0, 3] },
                        // Historique de paie non conservé (voir la même remarque sur
                        // generatePdfDefinitionGrilleNumerotee) : cumul annuel = cumul du
                        // mois, exact pour un premier bulletin de l'année.
                        kv('Cumul Brut imposable', fcfa(calc.brutImposable), { labelWidth: 140 }),
                        kv('Cumul ITS', fcfa(calc.salarial.its), { labelWidth: 140 }),
                        kv('Cumul CNPS Employé', fcfa(calc.salarial.cnps), { labelWidth: 140 }),
                        kv('Brut congé', fcfa(calc.allocationConges || 0), { labelWidth: 140 }),
                        kv('Brut CNPS', fcfa(calc.baseCNPS), { labelWidth: 140 }),
                        kv('Jrs congés à prendre', calc.joursCP || 0, { labelWidth: 140 }),
                        kv('Indemnité de Transport', fcfa(calc.primeTransport || 0), { labelWidth: 140 }),
                        kv('Jours fiscaux', calc.joursTrav || 0, { labelWidth: 140 }),
                        kv('Cumul exonéré', fcfa((calc.primeTransport || 0) + (calc.primeLogement || 0)), { labelWidth: 140 }),
                        kv('Cumul CMU', fcfa(calc.salarial.cmu), { labelWidth: 140 })
                    ]) },
                    { width: '4%', text: '' },
                    { width: '50%', stack: [
                        box([
                            { columns: [{ text: 'GAINS', fontSize: 7, bold: true }, { text: fcfa(calc.gainsTotaux) + ' F', fontSize: 7, bold: true, alignment: 'right' }] },
                            { columns: [{ text: 'RETENUES', fontSize: 7, bold: true }, { text: fcfa(calc.salarial.total) + ' F', fontSize: 7, bold: true, alignment: 'right' }], margin: [0, 2, 0, 0] },
                            { columns: [{ text: 'CHARGES PATRONALES (info.)', fontSize: 6.3, color: '#6b7280' }, { text: fcfa(totalPatronal) + ' F', fontSize: 6.3, color: '#6b7280', alignment: 'right' }], margin: [0, 2, 0, 0] },
                            { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 235, y2: 4, lineWidth: 0.5, lineColor: '#94a3b8' }] },
                            {
                                margin: [0, 4, 0, 0],
                                table: { widths: ['*', 'auto'], body: [[{ text: 'NET À PAYER', fontSize: 8.5, bold: true, fillColor: '#FFFF00', margin: [4, 3] }, { text: fcfa(calc.netAPayer) + ' F', fontSize: 8.5, bold: true, alignment: 'right', fillColor: '#FFFF00', margin: [4, 3] }]] },
                                layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => '#000', vLineColor: () => '#000' }
                            }
                        ]),
                        { text: '', margin: [0, 4] },
                        { text: 'RÈGLEMENT', fontSize: 6.8, bold: true },
                        { text: employee.virement ? `Virement bancaire${employee.rib ? ` — compte n° ${employee.rib}` : ''}` : 'Espèces', fontSize: 7, margin: [0, 2, 0, 4] },
                        !employee.virement && billetage.length ? {
                            table: { widths: ['34%', '33%', '33%'], body: [[headerCell('Coupure'), headerCell('Qté'), headerCell('Montant')], ...billetage] },
                            layout: { hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => '#94a3b8', vLineColor: () => '#94a3b8' }
                        } : null,
                        !employee.virement && billetage.length ? { text: 'BILLETAGE', fontSize: 6, italics: true, color: '#6b7280', margin: [0, 2, 0, 0] } : null
                    ].filter(Boolean) }
                ]
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

/**
 * Neuvième modèle par défaut, réplique fidèle d'un bulletin réel (TCM
 * LOGISTIC) : en-tête Niveau/Coefficient/Indice/Ancienneté/N° Sécurité
 * Sociale, Qualification/Horaire/CCN, congés Acquis/Reste à prendre/Pris
 * détaillés, et — sa particularité — une part patronale scindée en deux
 * colonnes Retenue(+) / Retenue(-) plutôt qu'une seule colonne Retenue.
 */
function generatePdfDefinitionTcmLogistic(employee, calc, companyInfo = {}) {
    const BORDER = '#000000';
    // Orange (thème transport/logistique), avec un bandeau franc pour les
    // sous-totaux — voir la même remarque sur generatePdfDefinitionLavandiere
    // ci-dessus : un gris presque blanc rend TOTAL BRUT/COTISATIONS
    // indiscernables des lignes normales.
    const ORANGE = '#c2410c';
    const BAND = '#fed7aa';
    const company = resolveCompanyInfo(employee, companyInfo);
    const codes = resolveCodesRubrique(companyInfo.rubriqueCodes);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periodeDebut = `01/${String(moisNum).padStart(2, '0')}/${String(annee).slice(-2)}`;
    const periodeFin = `${dernierJour}/${String(moisNum).padStart(2, '0')}/${String(annee).slice(-2)}`;

    const box = (contenu, opts = {}) => ({
        table: { widths: ['*'], body: [[{ stack: contenu, margin: opts.margin || [6, 5] }]] },
        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER }
    });
    const kv = (label, value, opts = {}) => ({ columns: [{ text: label, fontSize: 6.6, width: opts.labelWidth || 100 }, { text: (value === undefined || value === null || value === '') ? '' : value.toString(), fontSize: 6.6, bold: true, width: '*' }], margin: [0, 1] });

    const cell = (text, opts = {}) => ({
        text: (text === null || text === undefined) ? '' : text.toString(),
        fontSize: opts.fontSize || 6.4, bold: opts.bold || false, alignment: opts.align || 'left',
        fillColor: opts.fill || null, colSpan: opts.colSpan || null, margin: opts.margin || [2, 1.5, 2, 1.5]
    });
    const headerCell = (text, opts = {}) => cell(text, { fill: ORANGE, color: 'white', bold: true, align: 'center', fontSize: 6.2, ...opts });
    const subHeaderCell = (text, opts = {}) => cell(text, { fill: '#fb923c', color: '#431407', bold: true, align: 'center', fontSize: 6, ...opts });

    // Part patronale scindée Retenue(+)/Retenue(-) : « + » pour une charge
    // patronale normale, « - » réservé à un éventuel avantage/déduction
    // (aucune rubrique ONDA actuelle n'en produit, la colonne reste à blanc).
    const ligne = (numero, label, nombre, base, tauxS, gain, retenuePS, baseP, tauxP, retenuePPlus, retenuePMoins) => [
        cell(numero || ''), cell(label),
        cell(nombre !== undefined && nombre !== null ? nombre : '', { align: 'right' }),
        cell(base !== undefined && base !== null ? fcfa(base) : '', { align: 'right' }),
        cell(tauxS || '', { align: 'center' }),
        cell(gain !== undefined && gain !== null ? fcfa(gain) : '', { align: 'right' }),
        cell(retenuePS !== undefined && retenuePS !== null ? fcfa(retenuePS) : '', { align: 'right' }),
        cell(tauxP || '', { align: 'center' }),
        cell(retenuePPlus !== undefined && retenuePPlus !== null ? fcfa(retenuePPlus) : '', { align: 'right' }),
        cell(retenuePMoins !== undefined && retenuePMoins !== null ? fcfa(retenuePMoins) : '', { align: 'right' })
    ];
    const bandRow = (label, gain, retenuePS, retenuePPlus) => [
        cell('', { fill: BAND }), cell(label, { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }),
        cell(gain !== undefined ? fcfa(gain) : '', { align: 'right', bold: true, fill: BAND }),
        cell(retenuePS !== undefined ? fcfa(retenuePS) : '', { align: 'right', bold: true, fill: BAND }),
        cell('', { fill: BAND }),
        cell(retenuePPlus !== undefined ? fcfa(retenuePPlus) : '', { align: 'right', bold: true, fill: BAND }),
        cell('', { fill: BAND })
    ];

    const body = [[
        headerCell('N°'), headerCell('Désignation'), headerCell('Nombre'), headerCell('Base'),
        headerCell('Taux'), headerCell('Gain'), headerCell('Retenue'),
        headerCell('Taux'), headerCell('Retenue(+)'), headerCell('Retenue(-)')
    ], [
        subHeaderCell(''), subHeaderCell(''), subHeaderCell(''), subHeaderCell(''),
        subHeaderCell('Part salariale', { colSpan: 3 }), {}, {},
        subHeaderCell('Part patronale', { colSpan: 3 }), {}, {}
    ]];

    const joursBase = calc.joursTrav || 30;
    body.push(ligne(codes.salaireBase, 'Salaire de base', joursBase, (calc.salaireBaseMensuel || 0) / joursBase, undefined, calc.salaireBase));
    if (calc.sursalaire > 0) body.push(ligne(codes.sursalaire, 'Sursalaire', joursBase, (employee.sursalaire || 0) / joursBase, undefined, calc.sursalaire));
    if (calc.primeAnciennete > 0) body.push(ligne(codes.primeAnciennete, `Prime d'ancienneté (${calc.ansAnciennete} ans)`, undefined, undefined, undefined, calc.primeAnciennete));
    (employee.primes || []).forEach(p => { if (p.montant > 0) body.push(ligne(codes.prime, p.libelle || p.label || 'Prime', undefined, undefined, undefined, p.montant)); });
    if (calc.allocationConges > 0) body.push(ligne(codes.allocationConges, `Allocation congés (${calc.joursCP} j)`, calc.joursCP, undefined, undefined, calc.allocationConges));
    (calc.heuresSupTranches || []).forEach(t => body.push(ligne(codes.heuresSup, `Heures sup. — ${t.label}`, t.heures, calc.tauxHoraire, `×${t.coef}`, t.montant)));
    if (calc.primeTransport > 0) body.push(ligne(codes.primeTransport, 'Indemnité de transport', undefined, undefined, undefined, calc.primeTransport));
    if (calc.primeLogement > 0) {
        // Avantage en nature en toutes lettres dans les cumuls plus bas : ce
        // bulletin l'affiche explicitement, contrairement aux autres modèles.
        body.push(ligne(codes.primeLogement, 'Avantage en nature — Logement', undefined, undefined, undefined, calc.primeLogement));
    }
    body.push(bandRow('TOTAL BRUT', calc.gainsTotaux));

    body.push(ligne(codes.its, 'ITS — Impôt sur Traitements et Salaires', undefined, calc.brutImposable, undefined, undefined, calc.salarial.its));
    body.push(ligne(codes.cnpsSalariale, 'Retenue CNPS — Retraite', undefined, calc.baseCNPS, '6,30', undefined, calc.salarial.cnps));
    body.push(ligne(codes.cmuSalariale, 'CMU — Assurance maladie', undefined, calc.totalPersonnesCMU * 1000, undefined, undefined, calc.salarial.cmu));
    if (calc.salarial.ricf > 0) body.push(ligne(codes.ricf, 'dont RICF (réduction charge de famille)', undefined, undefined, undefined, undefined, calc.salarial.ricf));
    if (calc.salarial.acompte > 0) body.push(ligne(codes.acompte, 'Acompte / avance', undefined, undefined, undefined, undefined, calc.salarial.acompte));

    body.push(ligne(codes.cnpsPatronale, 'Retraite Générale CNPS', undefined, undefined, undefined, undefined, undefined, calc.baseCNPS, '7,70', calc.patronal.cnpsRetraite));
    body.push(ligne(codes.cnpsPF, 'Prestations Familiales', undefined, undefined, undefined, undefined, undefined, calc.baseCNPS_PfAtAm, '5,00', calc.patronal.cnpsPF));
    body.push(ligne(codes.cnpsAT, 'Accident du Travail', undefined, undefined, undefined, undefined, undefined, calc.baseCNPS_PfAtAm, `${employee.taux_at || 2},00`, calc.patronal.cnpsAT));
    body.push(ligne(codes.cmuPatronale, 'CMU — part patronale', undefined, undefined, undefined, undefined, undefined, undefined, undefined, calc.patronal.cmu));
    body.push(ligne(codes.impotEmployeur, 'T.A.S.P (impôt employeur)', undefined, undefined, undefined, undefined, undefined, calc.brutImposable, '1,20', calc.patronal.impotEmployeur));
    body.push(ligne(codes.fdfpTA, "Taxe d'Apprentissage", undefined, undefined, undefined, undefined, undefined, calc.brutImposable, '0,40', calc.patronal.fdfpTA));
    body.push(ligne(codes.fdfpFPC, 'Formation Professionnelle Continue', undefined, undefined, undefined, undefined, undefined, calc.brutImposable, '0,60', calc.patronal.fdfpFPC));

    const totalPatronal = (calc.patronal.cnpsRetraite || 0) + (calc.patronal.cnpsPF || 0) + (calc.patronal.cnpsAT || 0) + (calc.patronal.cmu || 0) + (calc.patronal.impotEmployeur || 0) + (calc.patronal.fdfpTA || 0) + (calc.patronal.fdfpFPC || 0);
    body.push(bandRow('TOTAL COTISATIONS', undefined, calc.salarial.total, totalPatronal));

    const congesRow = (label, acquis, reste, pris) => [
        cell(label, { fontSize: 6.4 }), cell(acquis || '', { align: 'center', fontSize: 6.4 }),
        cell(reste || '', { align: 'center', fontSize: 6.4 }), cell(pris || '', { align: 'center', fontSize: 6.4 })
    ];
    const cumulsRow = (label, brut, chargesSal, chargesPat, avantages, net) => [
        cell(label, { bold: true, fontSize: 6.3 }), cell(fcfa(brut), { align: 'right', fontSize: 6.3 }),
        cell(fcfa(chargesSal), { align: 'right', fontSize: 6.3 }), cell(fcfa(chargesPat), { align: 'right', fontSize: 6.3 }),
        cell(fcfa(avantages), { align: 'right', fontSize: 6.3 }), cell(fcfa(net), { align: 'right', bold: true, fontSize: 6.3 })
    ];

    return {
        pageSize: 'A4', pageMargins: [26, 28, 26, 28],
        content: [
            {
                columns: [
                    { width: '55%', ...box([
                        { text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', fontSize: 10, bold: true },
                        { text: `Période : Du ${periodeDebut} au ${periodeFin}`, fontSize: 6.6, margin: [0, 2, 0, 0] },
                        { text: `Paiement le ${periodeFin} — Par : ${employee.virement ? 'VIREMENT' : 'ESPÈCES'}`, fontSize: 6.6 }
                    ]) },
                    { width: '2%', text: '' },
                    { width: '43%', ...box([
                        company.logo ? { image: company.logo, fit: [90, 32], alignment: 'center' } : { text: company.nom, fontSize: 11, bold: true, alignment: 'center' },
                        !company.logo ? null : { text: company.nom, fontSize: 8, bold: true, alignment: 'center', margin: [0, 2, 0, 0] },
                        { text: `${company.adresse}${company.ville ? ' — ' + company.ville : ''}`, fontSize: 6.2, alignment: 'center' }
                    ].filter(Boolean)) }
                ]
            },
            { text: '', margin: [0, 4] },
            box([
                { columns: [kv('Matricule', employee.matricule), kv('Niveau', employee.niveau || employee.categorie || ''), kv('Coefficient', employee.coefficient || ''), kv('Indice', employee.indice || '')] },
                { columns: [kv('Ancienneté', calc.ancienneteTxt), kv('N° Sécurité Sociale', employee.num_secu || employee.numero_cnps || ''), kv('', ''), kv('', '')] },
                { columns: [kv('Catégorie', employee.categorie || ''), kv('Emploi occupé', employee.poste || ''), kv('Département', employee.departement || ''), kv('', '')] },
                { columns: [kv('Qualification', employee.qualification || employee.poste || ''), kv('Horaire', '173,33 h/mois'), kv('CCN', employee.ccn || 'Transport / Logistique'), kv('', '')] }
            ]),
            { text: '', margin: [0, 4] },
            {
                columns: [
                    { width: '58%', ...box([
                        { text: `Nombre de parts : ${calc.parts !== undefined ? calc.parts.toFixed(1) : '1,00'}`, fontSize: 6.8 },
                        { text: `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}`, fontSize: 10.5, bold: true, margin: [0, 3, 0, 0] }
                    ]) },
                    { width: '2%', text: '' },
                    { width: '40%', stack: [
                        {
                            table: {
                                widths: ['34%', '22%', '22%', '22%'],
                                body: [
                                    [headerCell(''), headerCell('Acquis'), headerCell('Reste'), headerCell('Pris')],
                                    congesRow('Repos comp.'), congesRow('Congés')
                                ]
                            },
                            layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER }
                        },
                        { text: 'Dates de congés : —', fontSize: 6.2, margin: [2, 3, 0, 0] },
                        { text: 'Commentaire :', fontSize: 6.2, margin: [2, 2, 0, 0] }
                    ] }
                ]
            },
            { text: '', margin: [0, 6] },
            {
                table: { headerRows: 2, widths: ['6%', '19%', '6%', '9%', '6%', '9%', '9%', '6%', '9%', '9%'], body },
                layout: { hLineWidth: (i, node) => (i === 0 || i === 2 || i === node.table.body.length) ? 1 : 0.4, vLineWidth: () => 0.4, hLineColor: () => '#94a3b8', vLineColor: () => '#94a3b8' }
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
                    widths: ['14%', '17%', '17%', '17%', '17%', '18%'],
                    body: [
                        [headerCell('Période'), headerCell('Salaire Brut'), headerCell('Charges Sal.'), headerCell('Charges Pat.'), headerCell('Avant. en nature'), headerCell('NET À PAYER')],
                        cumulsRow('Mois', calc.gainsTotaux, calc.salarial.total, totalPatronal, calc.primeLogement || 0, calc.netAPayer),
                        cumulsRow(`Année ${annee}`, calc.gainsTotaux, calc.salarial.total, totalPatronal, calc.primeLogement || 0, calc.netAPayer)
                    ]
                },
                layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDER, vLineColor: () => BORDER }
            },
            { text: '', margin: [0, 10] },
            { text: 'VISA', fontSize: 7, bold: true, margin: [0, 0, 0, 24] },
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5 }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

/**
 * Dixième modèle par défaut, réplique fidèle d'un bulletin réel (SCASO) :
 * bandeau « PÉRIODE DE PAIE » pleine largeur, bloc DIRECTION/VILLE/FONCTION/
 * DATE DE NAISSANCE/DATE D'ENTRÉE, colonne NBRE/TAUX fusionnée, et pied
 * « CACHET ET SIGNATURE » (grand encart vide) à côté du résumé GAINS/
 * RETENUES/NET À PAYER — sans doubles colonnes P.S/P.P, contrairement aux
 * modèles précédents.
 *
 * Contrairement aux autres modèles ONDA, celui-ci reste volontairement en
 * noir et blanc (traits fins, aucun bandeau coloré) : c'est la mise en page
 * réelle du bulletin d'origine, sobre, avec un simple filigrane du nom de
 * l'entreprise en fond de page — pas un choix de « pas assez de couleur »
 * comme sur les modèles précédents, juste fidèle à la source.
 */
function generatePdfDefinitionScaso(employee, calc, companyInfo = {}) {
    const BORDER = '#000000';
    const company = resolveCompanyInfo(employee, companyInfo);
    const codes = resolveCodesRubrique(companyInfo.rubriqueCodes);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const dernierJour = new Date(annee, moisNum, 0).getDate();
    const periodeDebut = `01/${String(moisNum).padStart(2, '0')}/${annee}`;
    const periodeFin = `${dernierJour}/${String(moisNum).padStart(2, '0')}/${annee}`;
    const MOIS_NOMS = ['', 'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
    const dateEntree = (() => {
        if (!employee.date_embauche) return '';
        const d = new Date(employee.date_embauche);
        if (isNaN(d.getTime())) return formatDate(employee.date_embauche);
        return `${MOIS_NOMS[d.getMonth() + 1]} ${d.getFullYear()}`;
    })();

    const box = (contenu, opts = {}) => ({
        table: { widths: ['*'], body: [[{ stack: contenu, margin: opts.margin || [6, 5] }]] },
        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER }
    });
    const kv = (label, value, opts = {}) => ({ columns: [{ text: label, fontSize: 6.8, bold: true, width: opts.labelWidth || 95 }, { text: (value === undefined || value === null || value === '') ? '' : value.toString(), fontSize: 6.8, width: '*' }], margin: [0, 1.5] });

    const cell = (text, opts = {}) => ({
        text: (text === null || text === undefined) ? '' : text.toString(),
        fontSize: opts.fontSize || 6.8, bold: opts.bold || false, alignment: opts.align || 'left',
        margin: opts.margin || [2, 2, 2, 2]
    });
    const headerCell = (text) => cell(text, { bold: true, align: 'center', fontSize: 7 });

    const ligne = (code, label, base, nbreTaux, gain, retenue) => [
        cell(code || ''), cell(label),
        cell(base !== undefined && base !== null ? fcfa(base) : '', { align: 'right' }),
        cell(nbreTaux || '', { align: 'center' }),
        cell(gain !== undefined && gain !== null ? fcfa(gain) : '', { align: 'right' }),
        cell(retenue !== undefined && retenue !== null ? fcfa(retenue) : '', { align: 'right' })
    ];
    // Bandeau de sous-total sobre (gras + trait, pas de fond coloré) : fidèle
    // à l'original, qui insère « Total Brut » / « Total Retenues — Salaire
    // Net » comme de simples lignes en gras dans le même tableau.
    const bandRow = (labelGains, labelRetenues, gain, retenue) => [
        cell(''), cell(''), cell(''), cell(labelRetenues || '', { bold: true }),
        cell(gain !== undefined ? fcfa(gain) : '', { align: 'right', bold: true }),
        cell(retenue !== undefined ? fcfa(retenue) : '', { align: 'right', bold: true })
    ];
    void bandRow;

    const body = [[headerCell('CODE'), headerCell('RUBRIQUE'), headerCell('BASE'), headerCell('NBRE/TAUX'), headerCell('GAINS'), headerCell('RETENUES')]];
    body.push(ligne(codes.salaireBase, 'Salaire de base', calc.salaireBaseMensuel, (calc.joursTrav || 30).toFixed(2), calc.salaireBase));
    if (calc.sursalaire > 0) body.push(ligne(codes.sursalaire, 'Sursalaire', employee.sursalaire, '100%', calc.sursalaire));
    if (calc.primeAnciennete > 0) body.push(ligne(codes.primeAnciennete, "Prime d'ancienneté", null, `${calc.ansAnciennete},00`, calc.primeAnciennete));
    (employee.primes || []).forEach(p => { if (p.montant > 0) body.push(ligne(codes.prime, p.libelle || p.label || "Prime d'incitation", null, null, p.montant)); });
    if (calc.allocationConges > 0) body.push(ligne(codes.allocationConges, `Allocation congés (${calc.joursCP} j)`, null, null, calc.allocationConges));
    (calc.heuresSupTranches || []).forEach(t => body.push(ligne(codes.heuresSup, `Heures sup. — ${t.label}`, calc.tauxHoraire, `×${t.coef}`, t.montant)));
    if (calc.primeTransport > 0) body.push(ligne(codes.primeTransport, 'Indemnité Transport non Imposable', null, `${(calc.joursTrav || 30).toFixed(2)}`, calc.primeTransport));
    if (calc.primeLogement > 0) body.push(ligne(codes.primeLogement, 'Prime de logement', null, null, calc.primeLogement));
    body.push([cell(''), cell('Total Brut', { bold: true }), cell(''), cell(''), cell(fcfa(calc.gainsTotaux), { align: 'right', bold: true }), cell('')]);

    body.push(ligne(codes.its, 'Impôt sur Traitements et Salaires (ITS)', calc.brutImposable, null, null, calc.salarial.its));
    body.push(ligne(codes.cnpsSalariale, 'CNPS Régime général', calc.baseCNPS, '6,30', null, calc.salarial.cnps));
    body.push(ligne(codes.cmuSalariale, 'CMU — Assurance maladie', calc.totalPersonnesCMU * 1000, null, null, calc.salarial.cmu));
    if (calc.salarial.ricf > 0) body.push(ligne(codes.ricf, 'dont RICF (réduction charge de famille)', null, null, null, calc.salarial.ricf));
    if (calc.salarial.acompte > 0) body.push(ligne(codes.acompte, 'Acompte / avance', null, null, null, calc.salarial.acompte));
    body.push([cell(''), cell('Total Retenues — Salaire Net', { bold: true }), cell(''), cell(''), cell(fcfa(calc.netAPayer), { align: 'right', bold: true }), cell(fcfa(calc.salarial.total), { align: 'right', bold: true })]);

    return {
        pageSize: 'A4', pageMargins: [30, 28, 30, 28],
        // Filigrane discret du nom de l'entreprise, comme le logo circulaire en
        // fond de page du bulletin d'origine.
        background: (currentPage, pageSize) => ({
            text: company.nom, fontSize: 74, color: '#f1f5f9', bold: true,
            alignment: 'center', angle: 30,
            absolutePosition: { x: 0, y: pageSize.height / 2 - 60 }, width: pageSize.width
        }),
        content: [
            {
                columns: [
                    { width: '55%', ...box([
                        company.logo ? { image: company.logo, fit: [80, 36], margin: [0, 0, 0, 4] } : null,
                        { text: company.nom, fontSize: 11, bold: true },
                        { text: company.adresse, fontSize: 7 },
                        { text: company.ville, fontSize: 7 }
                    ].filter(Boolean)) },
                    { width: '2%', text: '' },
                    { width: '43%', ...box([{ text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', fontSize: 11.5, bold: true, alignment: 'center', margin: [0, 8] }]) }
                ]
            },
            {
                table: { widths: ['*'], body: [[{ text: `PÉRIODE DE PAIE DU ${periodeDebut} AU ${periodeFin}`, fontSize: 7.5, alignment: 'center', margin: [0, 4] }]] },
                layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER }
            },
            { text: '', margin: [0, 4] },
            {
                columns: [
                    { width: '55%', ...box([
                        kv('DIRECTION', employee.departement || ''),
                        kv('VILLE', company.ville),
                        kv('FONCTION', employee.poste || ''),
                        kv('DATE DE NAISS.', employee.date_naissance ? formatDate(employee.date_naissance) : ''),
                        kv('DATE ENTREE', dateEntree)
                    ]) },
                    { width: '2%', text: '' },
                    { width: '43%', ...box([
                        { text: 'NOM ET ADRESSE DU SALARIÉ', fontSize: 6.6, bold: true, alignment: 'center' },
                        { text: `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}`, fontSize: 10, bold: true, alignment: 'center', margin: [0, 10, 0, 0] }
                    ], { margin: [6, 14] }) }
                ]
            },
            { text: '', margin: [0, 6] },
            {
                table: { headerRows: 1, widths: ['7%', '33%', '13%', '12%', '17%', '18%'], body },
                layout: { hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.4, vLineWidth: () => 0.4, hLineColor: () => '#94a3b8', vLineColor: () => '#94a3b8' }
            },
            { text: '', margin: [0, 10] },
            {
                columns: [
                    {
                        width: '58%',
                        table: { widths: ['*'], body: [[{ text: 'CACHET ET SIGNATURE', fontSize: 7, bold: true, alignment: 'center', margin: [0, 4] }], [{ text: '', margin: [0, 30] }]] },
                        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER }
                    },
                    { width: '2%', text: '' },
                    {
                        width: '40%',
                        table: {
                            widths: ['*', 'auto'],
                            body: [
                                [cell('GAINS', { bold: true }), cell(fcfa(calc.gainsTotaux) + 'F', { align: 'right', bold: true })],
                                [cell('RETENUES', { bold: true }), cell(fcfa(calc.salarial.total) + 'F', { align: 'right', bold: true })],
                                [cell('NET A PAYER', { bold: true, fontSize: 8 }), cell(fcfa(calc.netAPayer) + 'F', { align: 'right', bold: true, fontSize: 8 })]
                            ]
                        },
                        layout: { hLineWidth: () => 0.75, vLineWidth: () => 0.75, hLineColor: () => BORDER, vLineColor: () => BORDER, paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3, paddingBottom: () => 3 }
                    }
                ]
            }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

/**
 * Onzième modèle, seul modèle « paramétrable » : même structure sobre que
 * generatePdfDefinition (Classique), mais la couleur d'accent (bandeaux
 * d'en-tête, sous-totaux) est celle choisie par le compte dans Paramètres
 * (companyInfo.bulletinCouleur) plutôt qu'une couleur figée dans le code —
 * un calque de couleur sur un gabarit neutre, pas un bulletin de plus.
 * Sans couleur enregistrée, retombe sur un bleu par défaut.
 */
function generatePdfDefinitionPersonnalise(employee, calc, companyInfo = {}) {
    const ACCENT = /^#[0-9a-fA-F]{6}$/.test(companyInfo.bulletinCouleur || '') ? companyInfo.bulletinCouleur : '#1e3a8a';
    // Teintes dérivées de l'accent pour les bandeaux clairs (sous-totaux) et
    // moyens (sous-groupes), en gardant le même calcul que les couleurs fixes
    // choisies pour les autres modèles (bandeau clair mais net, pas un gris
    // presque blanc).
    const hexToRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const [r, g, b] = hexToRgb(ACCENT);
    const mix = (v, ratio) => Math.round(v + (255 - v) * ratio);
    const teinte = (ratio) => `#${[r, g, b].map(v => mix(v, ratio).toString(16).padStart(2, '0')).join('')}`;
    const BAND = teinte(0.82);
    const SUBHEADER = teinte(0.35);

    const company = resolveCompanyInfo(employee, companyInfo);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);
    const totalPatronal = patronal.reduce((s, r) => s + (r.montant || 0), 0);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const periode = `${['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][moisNum] || ''} ${annee}`;

    const cell = (text, opts = {}) => ({
        text: (text === null || text === undefined) ? '' : text.toString(),
        fontSize: opts.fontSize || 6.8, bold: opts.bold || false, alignment: opts.align || 'left',
        fillColor: opts.fill || null, color: opts.color || 'black', colSpan: opts.colSpan || null,
        margin: opts.margin || [2, 2, 2, 2]
    });
    const headerCell = (text, opts = {}) => cell(text, { fill: ACCENT, color: 'white', bold: true, align: 'center', fontSize: 6.8, ...opts });
    const infoRow = (label, value) => [
        { text: label, fontSize: 7, color: '#475569', margin: [0, 1.5, 0, 1.5] },
        { text: (value || '').toString(), fontSize: 7, bold: true, margin: [0, 1.5, 0, 1.5] }
    ];

    const body = [[headerCell('N°'), headerCell('Désignation'), headerCell('Base'), headerCell('Taux'), headerCell('Gains'), headerCell('Retenues')]];
    const ligneGain = (r) => [cell(r.code || ''), cell(r.label), cell(r.base !== undefined && r.base !== null ? fcfa(r.base) : '', { align: 'right' }), cell(r.taux || '', { align: 'center' }), cell(fcfa(r.montant), { align: 'right' }), cell('')];
    const ligneRetenue = (r) => [cell(r.code || ''), cell(r.label + (r.info ? ' (info.)' : '')), cell(r.base !== undefined && r.base !== null ? fcfa(r.base) : '', { align: 'right' }), cell(r.taux || '', { align: 'center' }), cell(''), cell(r.info ? '' : fcfa(r.montant), { align: 'right' })];
    gains.forEach(r => body.push(ligneGain(r)));
    body.push([cell('', { fill: BAND }), cell('TOTAL BRUT', { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell(fcfa(calc.gainsTotaux), { align: 'right', bold: true, fill: BAND }), cell('', { fill: BAND })]);
    retenues.forEach(r => body.push(ligneRetenue(r)));
    body.push([cell('', { fill: BAND }), cell('TOTAL RETENUES', { bold: true, fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell('', { fill: BAND }), cell(fcfa(calc.salarial.total), { align: 'right', bold: true, fill: BAND })]);

    return {
        pageSize: 'A4', pageMargins: [30, 30, 30, 30],
        content: [
            {
                table: { widths: ['*'], body: [[{
                    columns: [
                        company.logo ? { image: company.logo, fit: [42, 28], width: 52 } : { width: 52, text: '' },
                        { width: '*', stack: [{ text: company.nom, fontSize: 11, bold: true, color: 'white' }, { text: [company.adresse, company.ville].filter(Boolean).join(', '), fontSize: 6.8, color: 'white' }] },
                        { width: 150, stack: [{ text: employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE', fontSize: 10, bold: true, alignment: 'right', color: 'white' }, { text: periode, fontSize: 7.5, alignment: 'right', color: 'white' }] }
                    ],
                    margin: [12, 10]
                }]] },
                layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: ACCENT }
            },
            { text: '', margin: [0, 8] },
            {
                columns: [
                    { width: '50%', table: { widths: ['40%', '60%'], body: [infoRow('Nom', (employee.nom || '').toUpperCase()), infoRow('Prénoms', employee.prenom), infoRow('Emploi', employee.poste), infoRow('Matricule', employee.matricule)] }, layout: 'noBorders' },
                    { width: '50%', table: { widths: ['46%', '54%'], body: [infoRow('N° CNPS', employee.num_secu || employee.numero_cnps), infoRow('Catégorie', employee.categorie), infoRow('Ancienneté', calc.ancienneteTxt), infoRow('Nombre de parts', calc.parts !== undefined ? calc.parts.toFixed(1) : '1.0')] }, layout: 'noBorders' }
                ],
                columnGap: 16
            },
            { text: '', margin: [0, 8] },
            {
                table: { headerRows: 1, widths: ['6%', '32%', '13%', '9%', '20%', '20%'], body },
                layout: { hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.4, vLineWidth: () => 0.4, hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1' }
            },
            { text: '', margin: [0, 8] },
            { text: `Charges patronales (info.) : ${fcfa(totalPatronal)} F`, fontSize: 6.5, color: '#6b7280' },
            { text: '', margin: [0, 6] },
            {
                table: { widths: ['*', 170], body: [[
                    { stack: [{ text: 'MODE DE RÈGLEMENT', fontSize: 6.8, bold: true, color: ACCENT }, { text: employee.virement ? `Virement bancaire${employee.rib ? ` — ${employee.rib}` : ''}` : 'Espèces', fontSize: 7.5, margin: [0, 3, 0, 0] }], margin: [12, 10] },
                    { stack: [{ text: 'NET À PAYER', fontSize: 7.5, bold: true, alignment: 'center', color: 'white' }, { text: fcfa(calc.netAPayer) + ' F', fontSize: 15, bold: true, alignment: 'center', color: 'white', margin: [0, 3, 0, 0] }], fillColor: ACCENT, margin: [10, 8] }
                ]] },
                layout: { hLineWidth: () => 0.75, vLineWidth: () => 0, hLineColor: () => '#cbd5e1' }
            },
            { text: '', margin: [0, 14] },
            { columns: [{ text: "Cachet & signature de l'employeur", fontSize: 6.5, alignment: 'center', color: '#6b7280' }, { text: 'Signature du salarié', fontSize: 6.5, alignment: 'center', color: '#6b7280' }] }
        ],
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

// ─── Modèle « Sur-mesure » : éditeur visuel type Canva ─────────────────────
// Au lieu d'une mise en page figée dans le code (comme les 10 modèles
// ci-dessus), celui-ci lit un tableau de blocs positionnés librement
// (bulletinCanvasLayout, JSON sur le compte) et les imprime chacun à ses
// coordonnées exactes via `absolutePosition` de pdfmake. C'est le même
// système de coordonnées (points PDF, 1pt = 1/72") que l'éditeur affiche à
// l'écran : ce qui est glissé-déposé dans Paramètres est ce qui s'imprime,
// au point près — pas une conversion susceptible de diverger.
const CANVAS_PAGE = { width: 595.28, height: 841.89 }; // A4 portrait, en points

// Catalogue des champs qu'un bloc texte peut afficher — sert à la fois de
// résolveur ici et de source pour le menu déroulant de l'éditeur (exporté
// plus bas), pour ne jamais avoir deux listes de champs à tenir à jour.
exports.CANVAS_CHAMPS_DISPONIBLES = [
    { cle: 'company.nom', libelle: "Nom de l'entreprise", groupe: 'Entreprise' },
    { cle: 'company.adresse', libelle: 'Adresse', groupe: 'Entreprise' },
    { cle: 'company.ville', libelle: 'Ville', groupe: 'Entreprise' },
    { cle: 'company.cnps', libelle: 'N° CNPS employeur', groupe: 'Entreprise' },
    { cle: 'company.contribuable', libelle: 'N° contribuable', groupe: 'Entreprise' },
    { cle: 'company.telephone', libelle: 'Téléphone', groupe: 'Entreprise' },
    { cle: 'company.email', libelle: 'E-mail', groupe: 'Entreprise' },
    { cle: 'titre.bulletin', libelle: 'Titre (« Bulletin de paie »)', groupe: 'Bulletin' },
    { cle: 'periode.texte', libelle: 'Période (« Août 2026 »)', groupe: 'Bulletin' },
    { cle: 'employee.nomComplet', libelle: 'Nom complet du salarié', groupe: 'Salarié' },
    { cle: 'employee.matricule', libelle: 'Matricule', groupe: 'Salarié' },
    { cle: 'employee.poste', libelle: 'Emploi', groupe: 'Salarié' },
    { cle: 'employee.categorie', libelle: 'Catégorie', groupe: 'Salarié' },
    { cle: 'employee.cnps', libelle: 'N° CNPS salarié', groupe: 'Salarié' },
    { cle: 'employee.dateEmbauche', libelle: "Date d'embauche", groupe: 'Salarié' },
    { cle: 'employee.anciennete', libelle: 'Ancienneté', groupe: 'Salarié' },
    { cle: 'employee.parts', libelle: 'Nombre de parts IGR', groupe: 'Salarié' },
    { cle: 'totaux.brut', libelle: 'Total brut', groupe: 'Totaux' },
    { cle: 'totaux.retenues', libelle: 'Total retenues salariales', groupe: 'Totaux' },
    { cle: 'totaux.chargesPatronales', libelle: 'Total charges patronales', groupe: 'Totaux' },
    { cle: 'totaux.netAPayer', libelle: 'Net à payer', groupe: 'Totaux' }
];

function resoudreChampCanvas(champ, ctx) {
    const { employee, calc, company, periode } = ctx;
    switch (champ) {
        case 'company.nom': return company.nom;
        case 'company.adresse': return company.adresse;
        case 'company.ville': return company.ville;
        case 'company.cnps': return company.cnps;
        case 'company.contribuable': return company.contribuable;
        case 'company.telephone': return company.telephone;
        case 'company.email': return company.email;
        case 'titre.bulletin': return employee.isLeavePayslip ? "BULLETIN D'ALLOCATION CONGÉ" : 'BULLETIN DE PAIE';
        case 'periode.texte': return periode;
        case 'employee.nomComplet': return `${(employee.nom || '').toUpperCase()} ${employee.prenom || ''}`.trim();
        case 'employee.matricule': return employee.matricule || '';
        case 'employee.poste': return employee.poste || '';
        case 'employee.categorie': return employee.categorie || '';
        case 'employee.cnps': return employee.num_secu || employee.numero_cnps || '';
        case 'employee.dateEmbauche': return employee.date_embauche ? formatDate(employee.date_embauche) : '';
        case 'employee.anciennete': return calc.ancienneteTxt || '';
        case 'employee.parts': return calc.parts !== undefined ? calc.parts.toFixed(1) : '1.0';
        case 'totaux.brut': return fcfa(calc.gainsTotaux) + ' F';
        case 'totaux.retenues': return fcfa(calc.salarial.total) + ' F';
        case 'totaux.chargesPatronales': return fcfa(ctx.totalPatronal) + ' F';
        case 'totaux.netAPayer': return fcfa(calc.netAPayer) + ' F';
        default: return '';
    }
}

// Disposition par défaut proposée à l'ouverture de l'éditeur (et utilisée
// telle quelle si le compte n'a encore rien personnalisé) — une mise en page
// simple et complète, pas un canevas vide, pour qu'il y ait toujours quelque
// chose à ajuster plutôt qu'à construire de zéro.
const CANVAS_LAYOUT_DEFAUT = [
    { id: 'logo', type: 'logo', x: 30, y: 30, w: 90, h: 48 },
    { id: 'nom-entreprise', type: 'text', x: 132, y: 30, w: 250, h: 16, champ: 'company.nom', fontSize: 12, bold: true, color: '#0f172a' },
    { id: 'adresse-entreprise', type: 'text', x: 132, y: 48, w: 250, h: 12, champ: 'company.adresse', fontSize: 7.5, color: '#475569' },
    { id: 'ville-entreprise', type: 'text', x: 132, y: 60, w: 250, h: 12, champ: 'company.ville', fontSize: 7.5, color: '#475569' },
    { id: 'titre', type: 'text', x: 395, y: 30, w: 170, h: 20, champ: 'titre.bulletin', fontSize: 13, bold: true, color: '#1e3a8a', align: 'right' },
    { id: 'periode', type: 'text', x: 395, y: 52, w: 170, h: 12, champ: 'periode.texte', fontSize: 8, color: '#475569', align: 'right' },
    { id: 'nom-salarie', type: 'text', x: 30, y: 100, w: 260, h: 14, champ: 'employee.nomComplet', fontSize: 10, bold: true },
    { id: 'poste-salarie', type: 'text', x: 30, y: 116, w: 260, h: 12, champ: 'employee.poste', fontSize: 7.5, color: '#475569' },
    { id: 'matricule-salarie', type: 'text', x: 300, y: 100, w: 130, h: 12, champ: 'employee.matricule', fontSize: 7.5, color: '#475569' },
    { id: 'cnps-salarie', type: 'text', x: 300, y: 116, w: 265, h: 12, champ: 'employee.cnps', fontSize: 7.5, color: '#475569' },
    { id: 'table', type: 'table', x: 30, y: 150, w: 535, h: 380, headerColor: '#1e3a8a', showPatronal: false, fontSize: 7.5 },
    { id: 'net-a-payer', type: 'netBox', x: 395, y: 545, w: 170, h: 50, backgroundColor: '#1e3a8a', textColor: '#ffffff', fontSize: 15 },
    { id: 'ligne-visa-employeur', type: 'line', x: 30, y: 660, w: 200, h: 1, color: '#000000' },
    { id: 'texte-visa-employeur', type: 'text', x: 30, y: 664, w: 200, h: 12, texte: "Cachet & signature de l'employeur", fontSize: 6.5, align: 'center', color: '#6b7280' },
    { id: 'ligne-visa-salarie', type: 'line', x: 365, y: 660, w: 200, h: 1, color: '#000000' },
    { id: 'texte-visa-salarie', type: 'text', x: 365, y: 664, w: 200, h: 12, texte: 'Signature du salarié', fontSize: 6.5, align: 'center', color: '#6b7280' }
];
exports.CANVAS_LAYOUT_DEFAUT = CANVAS_LAYOUT_DEFAUT;
exports.CANVAS_PAGE = CANVAS_PAGE;

function generatePdfDefinitionSurMesure(employee, calc, companyInfo = {}) {
    const company = resolveCompanyInfo(employee, companyInfo);
    const codes = resolveCodesRubrique(companyInfo.rubriqueCodes);
    const { gains, retenues, patronal } = construireRubriques(employee, calc, companyInfo.rubriqueCodes);
    const totalPatronal = patronal.reduce((s, r) => s + (r.montant || 0), 0);

    const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
    const annee = parseInt(employee.annee || new Date().getFullYear());
    const periode = `${['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][moisNum] || ''} ${annee}`;

    const ctx = { employee, calc, company, periode, totalPatronal };
    const layoutBrut = Array.isArray(companyInfo.bulletinCanvasLayout) && companyInfo.bulletinCanvasLayout.length
        ? companyInfo.bulletinCanvasLayout
        : CANVAS_LAYOUT_DEFAUT;

    // Le nombre de lignes du tableau des rubriques dépend du salarié réel
    // (heures sup, primes libres, RICF...), pas seulement du style — une
    // disposition conçue (à la main ou par l'IA) pour un salarié « simple »
    // sous-estime souvent la hauteur réelle du tableau pour un salarié avec
    // plus de rubriques, et les blocs placés dessous (encart Net à payer,
    // signature...) chevauchaient alors le bas du tableau. On calcule donc la
    // hauteur RÉELLE ici et on repousse vers le bas tout bloc positionné à ou
    // sous le bas déclaré du tableau, de la différence — jamais de chevauchement,
    // quel que soit ce que la disposition enregistrée avait prévu.
    const hauteurReelleTable = (bloc) => {
        const fsTable = bloc.fontSize || 7;
        const ROW_H = Math.max(13, fsTable * 2.3), HEADER_H = Math.max(17, fsTable * 2.6);
        let nbLignes = gains.length + 1 /* total brut */ + retenues.length + 1 /* total retenues */;
        if (bloc.showPatronal) nbLignes += patronal.length;
        return HEADER_H + nbLignes * ROW_H;
    };
    const blocTable = layoutBrut.find(b => b.type === 'table' && b.visible !== false);
    let layout = layoutBrut;
    if (blocTable) {
        const hauteurReelle = hauteurReelleTable(blocTable);
        const hauteurDeclaree = blocTable.h || 0;
        if (hauteurReelle > hauteurDeclaree) {
            const decalage = hauteurReelle - hauteurDeclaree;
            const seuil = blocTable.y + hauteurDeclaree;
            layout = layoutBrut.map(b => (b.id !== blocTable.id && b.type !== 'watermark' && (b.y || 0) >= seuil - 1)
                ? { ...b, y: b.y + decalage }
                : b);
        }
    }

    // Rendu du tableau des rubriques en lignes `columns` empilées, chacune sa
    // propre `absolutePosition`, PAS en un unique `table` multi-colonnes.
    //
    // Raison, vérifiée empiriquement (pas une supposition) : dans pdfmake, une
    // cellule `alignment: 'right'` à l'intérieur d'un `table` dont la largeur
    // déclarée est INFÉRIEURE à la largeur de page calcule sa position par
    // rapport à la largeur de page entière, pas par rapport à sa propre
    // colonne — les montants débordaient donc hors du bloc, jusqu'au bord de
    // la page, dès que le tableau ne faisait pas toute la largeur (exactement
    // le cas ici, où l'utilisateur choisit lui-même la largeur du bloc). Avec
    // `columns` (chaque colonne portant sa propre `width` déclarée), le même
    // alignement se calcule correctement — confirmé par un test isolé avant
    // d'écrire ce code, pas une intuition non vérifiée.
    const blocATableauPdf = (bloc) => {
        const showPatronal = !!bloc.showPatronal;
        const fs = bloc.fontSize || 7;
        const headerColor = bloc.headerColor || '#1e3a8a';
        const partsPct = showPatronal ? [6, 28, 11, 9, 12, 12, 9, 13] : [7, 38, 15, 10, 15, 15];
        const colWidths = partsPct.map(p => (p / 100) * bloc.w);
        const entetes = showPatronal
            ? ['N°', 'Désignation', 'Base', 'Taux', 'Gains', 'Retenues', 'Taux P.', 'Charges P.']
            : ['N°', 'Désignation', 'Base', 'Taux', 'Gains', 'Retenues'];
        const aligns = showPatronal
            ? ['left', 'left', 'right', 'center', 'right', 'right', 'center', 'right']
            : ['left', 'left', 'right', 'center', 'right', 'right'];

        const ligneColonnes = (valeurs, opts = {}) => valeurs.map((v, i) => ({
            width: colWidths[i], text: v === null || v === undefined ? '' : v.toString(),
            fontSize: opts.fontSize || fs, bold: !!opts.bold, alignment: aligns[i], color: opts.color || '#000000'
        }));

        // Hauteur de ligne proportionnelle à la taille de police choisie : un
        // intitulé long (ex. « Impôt sur les Traitements et Salaires (ITS) »)
        // dans une colonne Désignation étroite passe sur 2 lignes — à hauteur
        // fixe, la 2e ligne chevauchait le texte de la ligne suivante dès que
        // fontSize dépassait ~8. Avec de la marge (×2.3), une ligne repliée sur
        // 2 tient sans empiéter sur la ligne d'après.
        const ROW_H = Math.max(13, fs * 2.3), HEADER_H = Math.max(17, fs * 2.6);
        let y = bloc.y;
        const items = [];
        const fondDeRangee = (hauteur, couleur) => items.push({ canvas: [{ type: 'rect', x: 0, y: 0, w: bloc.w, h: hauteur, color: couleur }], absolutePosition: { x: bloc.x, y } });
        const traitBas = (hauteur) => items.push({ canvas: [{ type: 'line', x1: 0, y1: hauteur, x2: bloc.w, y2: hauteur, lineWidth: 0.5, lineColor: '#cbd5e1' }], absolutePosition: { x: bloc.x, y } });
        const rangee = (valeurs, opts = {}) => items.push({ columns: ligneColonnes(valeurs, opts), absolutePosition: { x: bloc.x, y: y + 3 }, columnGap: 0 });

        fondDeRangee(HEADER_H, headerColor);
        rangee(entetes, { bold: true, color: 'white' });
        y += HEADER_H;

        const ligneMontant = (r, colGains, colRetenues) => {
            const valeurs = new Array(entetes.length).fill('');
            valeurs[0] = r.code || ''; valeurs[1] = r.label + (r.info ? ' (info.)' : '');
            valeurs[2] = r.base !== undefined && r.base !== null ? fcfa(r.base) : '';
            valeurs[3] = r.taux || '';
            if (colGains !== undefined) valeurs[4] = fcfa(r.montant);
            if (colRetenues !== undefined && !r.info) valeurs[5] = fcfa(r.montant);
            rangee(valeurs);
            traitBas(ROW_H);
            y += ROW_H;
        };
        gains.forEach(r => ligneMontant(r, true));

        fondDeRangee(ROW_H, '#e2e8f0');
        const totalBrut = new Array(entetes.length).fill('');
        totalBrut[1] = 'TOTAL BRUT'; totalBrut[4] = fcfa(calc.gainsTotaux);
        rangee(totalBrut, { bold: true });
        y += ROW_H;

        retenues.forEach(r => ligneMontant(r, undefined, true));

        if (showPatronal) {
            patronal.forEach(r => {
                const valeurs = ['', '', '', '', '', '', '', ''];
                valeurs[0] = r.code || ''; valeurs[1] = r.label; valeurs[6] = r.taux || ''; valeurs[7] = fcfa(r.montant);
                rangee(valeurs); traitBas(ROW_H); y += ROW_H;
            });
        }

        fondDeRangee(ROW_H, '#e2e8f0');
        const totalRet = new Array(entetes.length).fill('');
        totalRet[1] = 'TOTAL RETENUES'; totalRet[5] = fcfa(calc.salarial.total);
        if (showPatronal) totalRet[7] = fcfa(totalPatronal);
        rangee(totalRet, { bold: true });
        y += ROW_H;

        return items;
    };

    const content = layout.filter(b => b.visible !== false).flatMap(bloc => {
        switch (bloc.type) {
            case 'logo':
                return company.logo
                    ? { image: company.logo, fit: [bloc.w, bloc.h], absolutePosition: { x: bloc.x, y: bloc.y } }
                    : null;
            case 'text': {
                // Un `text` avec `alignment` sous `absolutePosition` s'aligne sur la
                // PAGE entière, pas sur son `width` local (comportement pdfmake) —
                // un titre aligné à droite débordait donc jusqu'au bord de la page
                // au lieu de rester dans son bloc. Le contenir dans une table à une
                // cellule d'une largeur déclarée force l'alignement à respecter le
                // bloc, pas la page.
                const texte = bloc.champ ? resoudreChampCanvas(bloc.champ, ctx) : (bloc.texte || '');
                return {
                    absolutePosition: { x: bloc.x, y: bloc.y },
                    table: { widths: [bloc.w], body: [[{ text: texte, fontSize: bloc.fontSize || 8, bold: !!bloc.bold, italics: !!bloc.italics, color: bloc.color || '#000000', alignment: bloc.align || 'left', border: [false, false, false, false], margin: [0, 0, 0, 0] }]] },
                    layout: 'noBorders'
                };
            }
            case 'table':
                return blocATableauPdf(bloc);
            case 'netBox':
                return {
                    absolutePosition: { x: bloc.x, y: bloc.y },
                    table: { widths: [bloc.w], body: [[{ text: 'NET À PAYER', fontSize: (bloc.fontSize || 15) * 0.5, bold: true, alignment: 'center', color: bloc.textColor || '#ffffff' }], [{ text: fcfa(calc.netAPayer) + ' F', fontSize: bloc.fontSize || 15, bold: true, alignment: 'center', color: bloc.textColor || '#ffffff' }]] },
                    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: bloc.backgroundColor || '#1e3a8a', paddingTop: () => 4, paddingBottom: () => 6 }
                };
            case 'line':
                return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: bloc.w, y2: 0, lineWidth: bloc.thickness || 0.75, lineColor: bloc.color || '#000000' }], absolutePosition: { x: bloc.x, y: bloc.y } };
            case 'rect':
                return { canvas: [{ type: 'rect', x: 0, y: 0, w: bloc.w, h: bloc.h, color: bloc.backgroundColor || '#f1f5f9', lineColor: bloc.borderColor || null }], absolutePosition: { x: bloc.x, y: bloc.y } };
            case 'watermark':
                // `angle` (rotation) n'a de sens que sur un texte, pas dans une
                // cellule de table — contrairement aux autres blocs, celui-ci reste
                // un `text` brut ; sa largeur par défaut (page entière) évite qu'un
                // centrage mal borné ne se voie.
                return { text: bloc.texte || company.nom, fontSize: bloc.fontSize || 74, color: bloc.color || '#f1f5f9', bold: true, alignment: 'center', angle: bloc.angle !== undefined ? bloc.angle : 30, absolutePosition: { x: 0, y: bloc.y }, width: CANVAS_PAGE.width };
            default:
                return null;
        }
    }).filter(Boolean);

    return {
        pageSize: 'A4', pageMargins: [0, 0, 0, 0],
        content,
        defaultStyle: { font: 'Roboto', fontSize: 8 }
    };
}

// Modèles ONDA additionnels, réservés à la Côte d'Ivoire pour l'instant — un
// seul endroit à étendre pour proposer un nouveau style de bulletin.
const MODELES_CI_SUPPLEMENTAIRES = {
    grille: generatePdfDefinitionGrilleNumerotee,
    compact: generatePdfDefinitionCompact,
    // Clé alignée sur le code envoyé par le sélecteur (renommé « ONDACLASSIC »
    // côté UI) : la fonction garde son nom d'origine, seule la clé du
    // dispatch change, sinon ce style était silencieusement introuvable et
    // la génération retombait sur Classique sans le dire.
    ondaclassic: generatePdfDefinitionLogipaie,
    bancaire: generatePdfDefinitionBancaire,
    moderne: generatePdfDefinitionModerne,
    lavandiere: generatePdfDefinitionLavandiere,
    adArchitecture: generatePdfDefinitionADArchitecture,
    scaso: generatePdfDefinitionScaso,
    personnalise: generatePdfDefinitionPersonnalise,
    tcmLogistic: generatePdfDefinitionTcmLogistic,
    surMesure: generatePdfDefinitionSurMesure
};
// Exposé pour que server.js valide `templateStyle` contre la même liste que
// celle réellement utilisée ici, sans avoir à la recopier à la main.
exports.STYLES_BULLETIN_DISPONIBLES = Object.keys(MODELES_CI_SUPPLEMENTAIRES);

// Catalogue affiché dans Paramètres > Modèles de bulletin pour éditer les
// codes : un seul endroit à tenir à jour, le client ne fait que l'afficher.
exports.CODE_RUBRIQUE = CODE_RUBRIQUE;
exports.CATALOGUE_RUBRIQUES = [
    { cle: 'salaireBase', libelle: 'Salaire de base', groupe: 'Gains' },
    { cle: 'sursalaire', libelle: 'Sursalaire', groupe: 'Gains' },
    { cle: 'primeAnciennete', libelle: "Prime d'ancienneté", groupe: 'Gains' },
    { cle: 'prime', libelle: 'Primes libres (diverses)', groupe: 'Gains' },
    { cle: 'allocationConges', libelle: 'Allocation congés payés', groupe: 'Gains' },
    { cle: 'heuresSup', libelle: 'Heures supplémentaires', groupe: 'Gains' },
    { cle: 'gratification', libelle: 'Gratification / 13e mois', groupe: 'Gains' },
    { cle: 'primeTransport', libelle: 'Indemnité de transport', groupe: 'Gains' },
    { cle: 'primeLogement', libelle: 'Prime de logement', groupe: 'Gains' },
    { cle: 'its', libelle: 'ITS — impôt sur salaire (nouveau régime, 2024)', groupe: 'Retenues salariales' },
    { cle: 'cnpsSalariale', libelle: 'CNPS retraite (part salariale)', groupe: 'Retenues salariales' },
    { cle: 'cmuSalariale', libelle: 'CMU (part salariale)', groupe: 'Retenues salariales' },
    { cle: 'ricf', libelle: 'RICF (réduction impôt charges familiales)', groupe: 'Retenues salariales' },
    { cle: 'acompte', libelle: 'Acompte / avance', groupe: 'Retenues salariales' },
    { cle: 'cnpsPatronale', libelle: 'CNPS retraite (part patronale)', groupe: 'Charges patronales' },
    { cle: 'cnpsPF', libelle: 'CNPS prestations familiales', groupe: 'Charges patronales' },
    { cle: 'cnpsAT', libelle: 'CNPS accident du travail', groupe: 'Charges patronales' },
    { cle: 'cnpsAM', libelle: 'CNPS assurance maternité', groupe: 'Charges patronales' },
    { cle: 'cmuPatronale', libelle: 'CMU (part patronale)', groupe: 'Charges patronales' },
    { cle: 'impotEmployeur', libelle: 'T.A.S.P (impôt employeur)', groupe: 'Charges patronales' },
    { cle: 'fdfpTA', libelle: "FDFP — Taxe d'apprentissage", groupe: 'Charges patronales' },
    { cle: 'fdfpFPC', libelle: 'FDFP — Formation professionnelle continue', groupe: 'Charges patronales' }
];

// Instantané par salarié pour l'historique de paie persistant (fondation des futures
// déclarations réglementaires CNPS/ITS/CMU) — capture ce qui a réellement été calculé/déclaré,
// indépendamment de toute modification ultérieure de la fiche salarié.
function buildPayslipSnapshot(emp, calculs) {
    return {
        nom: emp.nom || '',
        prenom: emp.prenom || '',
        matricule: emp.matricule || '',
        numeroCnps: emp.numero_cnps || '',
        poste: emp.poste || '',
        salaireBase: calculs.salaireBase || 0,
        brutTotal: calculs.gainsTotaux || 0,
        netAPayer: calculs.netAPayer || 0,
        cnpsSal: calculs.salarial?.cnps || 0,
        cnpsPF: calculs.patronal?.cnpsPF || 0,
        cnpsAM: calculs.patronal?.cnpsAM || 0,
        cnpsAT: calculs.patronal?.cnpsAT || 0,
        cnpsRetraitePat: calculs.patronal?.cnpsRetraite || 0,
        its: calculs.salarial?.its || 0,
        ricf: calculs.salarial?.ricf || 0,
        cmuSal: calculs.salarial?.cmu || 0,
        cmuPat: calculs.patronal?.cmu || 0,
        totalPersonnesCMU: calculs.totalPersonnesCMU || 0,
        situationMatrimoniale: emp.situation_matrimoniale || '',
        nombreEnfants: parseInt(emp.nombre_enfants) || 0,
        heuresSupNb: parseFloat(emp.heures_sup_nb) || 0,
        montantHeuresSup: calculs.montantHeuresSup || 0,
        joursTravailles: calculs.joursTrav !== undefined ? calculs.joursTrav : 0,
        absencesJours: parseFloat(emp.absences_jours) || 0
    };
}

const MOIS_ETAT_PAIE = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/**
 * État de paie : le lot entier en une seule vue tableur, à côté des bulletins
 * PDF individuels — un contrôle global (masse salariale, cohérence entre
 * salariés) est bien plus rapide sur un tableau que PDF par PDF, et c'est le
 * format attendu pour le transmettre tel quel à un comptable ou à la CNPS.
 */
function construireEtatDePaie(lignes, { nomEntreprise, mois, annee } = {}) {
    const periode = mois ? `${MOIS_ETAT_PAIE[parseInt(mois, 10)] || ''} ${annee || ''}`.trim() : (annee || '');
    const entete = [
        ['ÉTAT DE PAIE'],
        [nomEntreprise || '', periode ? `Période : ${periode}` : ''],
        []
    ];
    const colonnes = [
        'Matricule', 'Nom', 'Prénom', 'N° CNPS', 'Poste',
        'Jours travaillés', 'Absences (j)', 'Heures sup (nb)',
        'Salaire de base', 'Montant heures sup', 'Brut total',
        'CNPS salarié', 'ITS', 'RICF', 'CMU salarié', 'Net à payer',
        'CNPS patronal (retraite)', 'CNPS patronal (PF)', 'CNPS patronal (AT)', 'CMU patronal'
    ];
    const lignesDonnees = lignes.map(l => [
        l.matricule, l.nom, l.prenom, l.numeroCnps, l.poste,
        l.joursTravailles, l.absencesJours, l.heuresSupNb,
        l.salaireBase, l.montantHeuresSup, l.brutTotal,
        l.cnpsSal, l.its, l.ricf, l.cmuSal, l.netAPayer,
        l.cnpsRetraitePat, l.cnpsPF, l.cnpsAT, l.cmuPat
    ]);
    const somme = (cle) => lignes.reduce((acc, l) => acc + (Number(l[cle]) || 0), 0);
    const ligneTotal = [
        `TOTAL (${lignes.length} salarié(s))`, '', '', '', '', '', '', '',
        somme('salaireBase'), somme('montantHeuresSup'), somme('brutTotal'),
        somme('cnpsSal'), somme('its'), somme('ricf'), somme('cmuSal'), somme('netAPayer'),
        somme('cnpsRetraitePat'), somme('cnpsPF'), somme('cnpsAT'), somme('cmuPat')
    ];

    const aoa = [...entete, colonnes, ...lignesDonnees, [], ligneTotal];
    const feuille = XLSX.utils.aoa_to_sheet(aoa);
    feuille['!cols'] = colonnes.map(c => ({ wch: Math.max(12, c.length + 2) }));
    feuille['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colonnes.length - 1 } }];

    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'État de paie');
    return classeur;
}

/**
 * Decode un document transmis en base64, tolerant au prefixe data URL.
 *
 * Buffer.from n'echoue pas sur « data:…;base64, » : il ignore les caracteres
 * invalides et rend un tampon decale, illisible comme ZIP. On retire donc le
 * prefixe avant de decoder, plutot que de laisser l'erreur surgir plus loin.
 */
function decoderDocumentBase64(valeur) {
    const texte = String(valeur || '');
    const virgule = texte.indexOf(',');
    const utile = texte.startsWith('data:') && virgule > 0 ? texte.slice(virgule + 1) : texte;
    return Buffer.from(utile, 'base64');
}

exports.processPayrollFile = async (dataPath, outputPath, templatePath = null, mapping = null, htmlTemplate = null, country = 'CI', sheetName = null, leavesToProcess = [], docxTemplateBase64 = null, templateStyle = null) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`[RH] Lecture Excel: ${dataPath}`);
            const workbook = XLSX.readFile(dataPath);

            const getSheetData = (name) => {
                const s = workbook.Sheets[name];
                return s ? XLSX.utils.sheet_to_json(s) : [];
            };

            // Feuille employés explicitement choisie par l'utilisateur (fichiers multi-feuilles
            // sans nom standard) — sinon recherche flexible comme avant.
            let employesSheetName = (sheetName && workbook.SheetNames.includes(sheetName))
                ? sheetName
                : workbook.SheetNames.find(n =>
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
            const isDocxMode = (!!templatePath && templatePath.toLowerCase().endsWith('.docx')) || !!docxTemplateBase64;
            const isHtmlTemplateMode = !!htmlTemplate;
            let docTemplateContent = null;
            if (docxTemplateBase64) {
                docTemplateContent = decoderDocumentBase64(docxTemplateBase64);
            } else if (templatePath) {
                docTemplateContent = fs.readFileSync(templatePath);
            }

            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            let totalMasseSalariale = 0;
            let totalCNPS = 0;
            let totalImpots = 0;
            const perEmployeeResults = [];

            output.on('close', () => resolve({
                count: fullEmployees.length,
                type: isDocxMode ? 'docx' : 'pdf',
                totalMasseSalariale,
                totalCNPS,
                totalImpots,
                perEmployeeResults
            }));
            archive.on('error', (err) => reject(err));
            archive.pipe(output);

            const promises = [];
            let browser = null;
            if (isHtmlTemplateMode) {
                // Une seule instance pour tout le lot. La localisation de Chrome et
                // son installation automatique vivent dans templateEngine : les
                // dupliquer ici faisait qu'un require de puppeteer en échec laissait
                // `browser` à null, et l'erreur ne remontait qu'au premier bulletin.
                browser = await templateEngine.launchBrowser();
            }

            for (const [index, emp] of fullEmployees.entries()) {
                try {
                    const calculs = exports.calculateSinglePayroll({ ...emp, pays: country });
                    totalMasseSalariale += calculs.gainsTotaux || 0;
                    totalCNPS += calculs.salarial.cnps || 0;
                    totalImpots += calculs.salarial.irpp || calculs.salarial.its || 0;
                    perEmployeeResults.push(buildPayslipSnapshot(emp, calculs));

                    const rawName = String(emp['nom'] || `Emp${index}`);
                    const safeName = rawName.replace(/[^a-z0-9]/gi, '_');

                    const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                    const moisNom = moisNoms[parseInt(emp.mois || 1) - 1] || 'Mois';
                    const entNom = (companyInfo.nom_entreprise || emp.nom_entreprise || 'ENTREPRISE').toUpperCase();
                    const salNom = (emp.nom || `Employe${index}`).toUpperCase();
                    
                    const leave = (leavesToProcess || []).find(l => l.id === emp.id || (l.matricule && l.matricule === emp.matricule));
                    const employesToGenerate = [emp];
                    if (leave) employesToGenerate.push({ ...emp, isLeavePayslip: true });

                    for (const currentEmp of employesToGenerate) {
                        const finalFileName = currentEmp.isLeavePayslip ? `BULLETIN ALLOCATION CONGE - ${entNom} - ${salNom} - ${moisNom} ${emp.annee || ''}` : `BULLETIN DE PAIE - ${entNom} - ${salNom} - ${moisNom} ${emp.annee || ''}`;

                        if (isDocxMode) {
                            const PizZip = require('pizzip');
                            const Docxtemplater = require('docxtemplater');
                            const zip = new PizZip(docTemplateContent);
                            const doc = new Docxtemplater(zip, {
                                paragraphLoop: true,
                                linebreaks: true,
                                nullGetter() { return ""; }
                            });
                            
                            const flatData = {
                                ...currentEmp,
                                ...calculs,
                                netAPayer: fcfa(calculs.netAPayer),
                                brutTotal: fcfa(calculs.gainsTotaux || calculs.brutImposable),
                                nomComplet: (currentEmp.nom || '') + ' ' + (currentEmp.prenom || ''),
                                date_jour: new Date().toLocaleDateString()
                            };
                            doc.render(flatData);
                            const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
                            archive.append(buf, { name: `${finalFileName}.docx` });
                        } else if (isHtmlTemplateMode) {
                            const viewData = buildViewData(currentEmp, calculs, { ...companyInfo, nom_entreprise: entNom });
                            promises.push((async () => {
                                // Le modèle du client est un bulletin de paie : sur une
                                // allocation congé, seul le titre change.
                                let tpl = htmlTemplate;
                                if (currentEmp.isLeavePayslip) {
                                    tpl = tpl.replace(/BULLETIN DE PAIE/gi, "BULLETIN D'ALLOCATION CONGÉ");
                                }
                                const pdfBuffer = await templateEngine.renderTemplateToPdf(tpl, viewData, browser);

                                archive.append(pdfBuffer, { name: `${finalFileName}.pdf` });
                            })());
                        } else {
                            let docDefinition;
                            const paysCode = currentEmp.pays || country;
                            if (paysCode === 'BJ') {
                                docDefinition = generateBeninPdfDefinition(currentEmp, calculs, companyInfo);
                            } else if (paysCode === 'TG') {
                                docDefinition = generateTogoPdfDefinition(currentEmp, calculs, companyInfo);
                            } else if (MODELES_CI_SUPPLEMENTAIRES[templateStyle]) {
                                docDefinition = MODELES_CI_SUPPLEMENTAIRES[templateStyle](currentEmp, calculs, companyInfo);
                            } else {
                                docDefinition = generatePdfDefinition(currentEmp, calculs, companyInfo);
                            }

                            const pdfDoc = printer.createPdfKitDocument(docDefinition);
                            let chunks = [];
                            pdfDoc.on('data', (chunk) => chunks.push(chunk));
                            pdfDoc.on('end', () => {
                                const result = Buffer.concat(chunks);
                                archive.append(result, { name: `${finalFileName}.pdf` });
                            });
                            pdfDoc.end();
                        }
                    } // end employesToGenerate loop
                } catch (err) {
                    console.error("Error creating document for " + emp.nom, err);
                }
            } // end for

            Promise.all(promises).then(async () => {
                if (browser) await browser.close();
                // État de paie : le lot entier en une seule vue tableur, à côté des
                // bulletins PDF individuels (voir construireEtatDePaie).
                try {
                    const classeurEtatPaie = construireEtatDePaie(perEmployeeResults, {
                        nomEntreprise: companyInfo.raison_sociale || companyInfo.nom_entreprise || (fullEmployees[0] && fullEmployees[0].nom_entreprise) || '',
                        mois: fullEmployees[0] && fullEmployees[0].mois,
                        annee: fullEmployees[0] && fullEmployees[0].annee
                    });
                    archive.append(XLSX.write(classeurEtatPaie, { type: 'buffer', bookType: 'xlsx' }), { name: 'Etat de paie.xlsx' });
                } catch (e) {
                    console.warn('État de paie Excel non généré :', e.message);
                }
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
    // Jours ouvrables d'un mois complet : dénominateur de TOUTE proratisation
    // liée au temps de travail (salaire de base, sursalaire, primes).
    const JOURS_BASE_STANDARD = 26;
    const joursAbsences = parseFloat(employee['absences_jours'] || 0);
    const joursTravailleExplicite = (employee['jours_travailles'] !== undefined && employee['jours_travailles'] !== null && employee['jours_travailles'] !== '')
        ? parseFloat(employee['jours_travailles'])
        : null;
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

    // Cf. calculateSalaryRules : jours_travailles explicite prime sur base - absences (évite le double comptage)
    const joursTrav = Math.max(0, (joursTravailleExplicite !== null ? joursTravailleExplicite : (JOURS_BASE_STANDARD - joursAbsences)) - joursConges);
    const joursBasePaie = JOURS_BASE_STANDARD;
    const joursCP = joursConges;

    // Diviseur : joursBasePaie (26), la MÊME échelle que joursTrav.
    // joursTrav vaut 26 pour un mois complet ; diviser par 30 amputait donc
    // le salaire de 13,3 % alors même que le salarié n'avait pas été absent.
    // Les primes divisaient déjà correctement par 26 : le bulletin était
    // incohérent avec lui-même.
    const salaireBase = Math.round((salaireBaseMensuel / joursBasePaie) * joursTrav);
    const sursalaireTotal = parseFloat(employee['sursalaire'] || 0);
    const sursalaire = Math.round((sursalaireTotal / joursBasePaie) * joursTrav);

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
        brutImposable, gainsTotaux, baseCNPS: baseCNSS, baseCNPS_PfAtAm: baseCNSS, parts: 0, totalPersonnesCMU: 0, joursTrav,
        patronal: {
            impotEmployeur, fdfpTA: 0, fdfpFPC: 0, totalFiscal: totalFiscalEmployeur,
            cnpsPF: cnssPF, cnpsAM: 0, cnpsAT: cnssAT, cnpsRetraite: cnssRetraitePat, cmu: 0,
            totalSocial: totalSocialEmployeur, grandTotal: totalPatronal
        },
        salarial: {
            its: itsFinal, ricf: 0, baseITS: salImposable, cnps: cnssSal, cmu: 0,
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
    // Jours ouvrables d'un mois complet : dénominateur de TOUTE proratisation
    // liée au temps de travail (salaire de base, sursalaire, primes).
    const JOURS_BASE_STANDARD = 26;
    const joursAbsences = parseFloat(employee['absences_jours'] || 0);
    const joursTravailleExplicite = (employee['jours_travailles'] !== undefined && employee['jours_travailles'] !== null && employee['jours_travailles'] !== '')
        ? parseFloat(employee['jours_travailles'])
        : null;
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

    // Cf. calculateSalaryRules : jours_travailles explicite prime sur base - absences (évite le double comptage)
    const joursTrav = Math.max(0, (joursTravailleExplicite !== null ? joursTravailleExplicite : (JOURS_BASE_STANDARD - joursAbsences)) - joursConges);
    const joursBasePaie = JOURS_BASE_STANDARD;
    const joursCP = joursConges;

    // Diviseur : joursBasePaie (26), la MÊME échelle que joursTrav.
    // joursTrav vaut 26 pour un mois complet ; diviser par 30 amputait donc
    // le salaire de 13,3 % alors même que le salarié n'avait pas été absent.
    // Les primes divisaient déjà correctement par 26 : le bulletin était
    // incohérent avec lui-même.
    const salaireBase = Math.round((salaireBaseMensuel / joursBasePaie) * joursTrav);
    const sursalaireTotal = parseFloat(employee['sursalaire'] || 0);
    const sursalaire = Math.round((sursalaireTotal / joursBasePaie) * joursTrav);

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
        brutImposable, gainsTotaux, baseCNPS: baseCNSS, baseCNPS_PfAtAm: baseCNSS, parts: 0, totalPersonnesCMU: 0, joursTrav,
        revenuApresCotisations, abattementMensuel, revenuNetImposableMensuel, totalRetenuesDiverses,
        patronal: {
            impotEmployeur, fdfpTA: 0, fdfpFPC: 0, totalFiscal: impotEmployeur,
            cnpsPF: 0, cnpsAM: inamPat, cnpsAT: 0, cnpsRetraite: cnssPat, cmu: inamPat,
            totalSocial: totalSocialEmployeur, grandTotal: totalPatronal
        },
        salarial: {
            its: irppMensuel, irpp: irppMensuel, ricf: 0, baseITS: revenuNetImposableMensuel, baseIRPP: revenuNetImposableMensuel,
            cnps: cnssSal, inam: inamSal, cmu: inamSal,
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

exports.calculateSinglePayroll = (employee) => {
    if (employee.pays === 'BJ') return calculateBeninSalaryRules(employee);
    if (employee.pays === 'TG') return calculateTogoSalaryRules(employee);
    return calculateSalaryRules(employee);
};

/**
 * Génère un PDF individuel et retourne un Buffer
 */
exports.generateSinglePdf = (employee, calculs, companyInfo = {}, htmlTemplate = null, templateStyle = null) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (htmlTemplate) {
                const viewData = buildViewData(employee, calculs, companyInfo);
                return resolve(await templateEngine.renderTemplateToPdf(htmlTemplate, viewData));
            }
            const now = new Date();
            if (employee.mois) now.setMonth(parseInt(employee.mois) - 1);
            if (employee.annee) now.setFullYear(parseInt(employee.annee));

            let docDefinition;
            if (employee.pays === 'BJ') {
                docDefinition = generateBeninPdfDefinition(employee, calculs, companyInfo);
            } else if (employee.pays === 'TG') {
                docDefinition = generateTogoPdfDefinition(employee, calculs, companyInfo);
            } else if (MODELES_CI_SUPPLEMENTAIRES[templateStyle]) {
                // Modèles ONDA additionnels, pour l'instant réservés à la Côte
                // d'Ivoire — seul pays où le référentiel LOGIPAIE a été vérifié.
                docDefinition = MODELES_CI_SUPPLEMENTAIRES[templateStyle](employee, calculs, companyInfo);
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
                const viewData = buildViewData(employee, calculs);
                return resolve(await templateEngine.renderTemplateToPdf(htmlTemplate, viewData));
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

exports.processPayrollJson = async (employeesList, outputPath, templatePath = null, mapping = null, htmlTemplate = null, country = 'CI', companyInfoOverride = null, leavesToProcess = [], docxTemplateBase64 = null, templateStyle = null) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`[RH] Lecture depuis JSON (Base Locale)`);
            if (!employeesList || employeesList.length === 0) return reject(new Error(`La liste des employés est vide`));

            // Le profil entreprise (paramètres) fait foi quand il est fourni. À
            // défaut, on retombe sur le premier salarié du lot — mais son
            // `numero_cnps` est SON numéro personnel, pas celui de l'employeur :
            // c'est un pis-aller, pas la bonne source.
            const firstEmp = employeesList[0] || {};
            const companyInfo = companyInfoOverride ? {
                nom_entreprise: companyInfoOverride.nom_entreprise || 'Mon Entreprise',
                adresse: companyInfoOverride.adresse || '',
                numero_cnps: companyInfoOverride.numero_cnps || '',
                numero_contribuable: companyInfoOverride.numero_contribuable || '',
                logo: companyInfoOverride.logo || null,
            } : {
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
            const perEmployeeResults = [];

            output.on('close', () => resolve({
                count: fullEmployees.length,
                type: isDocxMode ? 'docx' : 'pdf',
                totalMasseSalariale,
                totalCNPS,
                totalImpots,
                perEmployeeResults
            }));
            archive.on('error', (err) => reject(err));
            archive.pipe(output);

            const promises = [];
            let browser = null;
            if (isHtmlTemplateMode) {
                // Une seule instance pour tout le lot. La localisation de Chrome et
                // son installation automatique vivent dans templateEngine : les
                // dupliquer ici faisait qu'un require de puppeteer en échec laissait
                // `browser` à null, et l'erreur ne remontait qu'au premier bulletin.
                browser = await templateEngine.launchBrowser();
            }

            for (const [index, emp] of fullEmployees.entries()) {
                try {
                    const calculs = exports.calculateSinglePayroll({ ...emp, pays: country });
                    totalMasseSalariale += calculs.gainsTotaux || 0;
                    totalCNPS += calculs.salarial.cnps || 0;
                    totalImpots += calculs.salarial.irpp || calculs.salarial.its || 0;
                    perEmployeeResults.push(buildPayslipSnapshot(emp, calculs));

                    const rawName = String(emp['nom'] || `Emp${index}`);
                    const safeName = rawName.replace(/[^a-z0-9]/gi, '_');

                    const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                    const moisNom = moisNoms[parseInt(emp.mois || new Date().getMonth() + 1) - 1] || 'Mois';
                    const annee = emp.annee || new Date().getFullYear();
                    const entNom = (companyInfo.nom_entreprise || emp.nom_entreprise || 'ENTREPRISE').toUpperCase();
                    const salNom = (emp.nom || `Employe${index}`).toUpperCase();
                    
                    const leave = leavesToProcess.find(l => l.id === emp.id || (l.matricule && l.matricule === emp.matricule));
                    const employesToGenerate = [emp];
                    if (leave) employesToGenerate.push({ ...emp, isLeavePayslip: true });

                    for (const currentEmp of employesToGenerate) {
                        const finalFileName = currentEmp.isLeavePayslip ? `BULLETIN ALLOCATION CONGE - ${entNom} - ${salNom} - ${moisNom} ${annee}` : `BULLETIN DE PAIE - ${entNom} - ${salNom} - ${moisNom} ${annee}`;

                        if (isHtmlTemplateMode) {
                            // `companyInfo` (pas un objet à la volée réduit à son nom) :
                            // c'est lui qui porte le logo du compte, sans quoi un modèle
                            // PDF importé se rendait toujours sans logo, même configuré.
                            const viewData = buildViewData(currentEmp, calculs, { ...companyInfo, nom_entreprise: entNom });
                            promises.push((async () => {
                                // Le modèle du client est un bulletin de paie : sur une
                                // allocation congé, seul le titre change.
                                let tpl = htmlTemplate;
                                if (currentEmp.isLeavePayslip) {
                                    tpl = tpl.replace(/BULLETIN DE PAIE/gi, "BULLETIN D'ALLOCATION CONGÉ");
                                }
                                const pdfBuffer = await templateEngine.renderTemplateToPdf(tpl, viewData, browser);

                                archive.append(pdfBuffer, { name: `${finalFileName}.pdf` });
                            })());
                        } else if (docxTemplateBase64) {
                            const PizZip = require('pizzip');
                            const Docxtemplater = require('docxtemplater');
                            const templateContent = decoderDocumentBase64(docxTemplateBase64);
                            const zip = new PizZip(templateContent);
                            const doc = new Docxtemplater(zip, {
                                paragraphLoop: true,
                                linebreaks: true,
                                nullGetter() { return ""; }
                            });
                            
                            const flatData = {
                                ...currentEmp,
                                ...calculs,
                                netAPayer: fcfa(calculs.netAPayer),
                                brutTotal: fcfa(calculs.gainsTotaux || calculs.brutImposable),
                                nomComplet: (currentEmp.nom || '') + ' ' + (currentEmp.prenom || '')
                            };
                            
                            doc.render(flatData);
                            const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
                            archive.append(buf, { name: `${finalFileName}.docx` });
                        } else {
                            let docDefinition;
                            const paysCode = currentEmp.pays || country;
                            if (paysCode === 'BJ') {
                                docDefinition = generateBeninPdfDefinition(currentEmp, calculs, companyInfo);
                            } else if (paysCode === 'TG') {
                                docDefinition = generateTogoPdfDefinition(currentEmp, calculs, companyInfo);
                            } else if (MODELES_CI_SUPPLEMENTAIRES[templateStyle]) {
                                docDefinition = MODELES_CI_SUPPLEMENTAIRES[templateStyle](currentEmp, calculs, companyInfo);
                            } else {
                                docDefinition = generatePdfDefinition(currentEmp, calculs, companyInfo);
                            }

                            const pdfDoc = printer.createPdfKitDocument(docDefinition);
                            let chunks = [];
                            pdfDoc.on('data', (chunk) => chunks.push(chunk));
                            pdfDoc.on('end', () => {
                                const result = Buffer.concat(chunks);
                                archive.append(result, { name: `${finalFileName}.pdf` });
                            });
                            pdfDoc.end();
                        }
                    } // end employesToGenerate loop
                } catch (err) {
                    console.error("Error creating document for " + emp.nom, err);
                }
            } // end for

            Promise.all(promises).then(async () => {
                if (browser) await browser.close();
                // État de paie : un tableur qui récapitule tout le lot en une vue,
                // à côté des bulletins PDF — utile pour un contrôle rapide ou pour
                // transmettre au comptable, sans avoir à ouvrir chaque PDF.
                try {
                    const classeurEtatPaie = construireEtatDePaie(perEmployeeResults, {
                        nomEntreprise: companyInfo.nom_entreprise || (employeesList[0] && employeesList[0].nom_entreprise) || '',
                        mois: employeesList[0] && employeesList[0].mois,
                        annee: employeesList[0] && employeesList[0].annee
                    });
                    archive.append(XLSX.write(classeurEtatPaie, { type: 'buffer', bookType: 'xlsx' }), { name: 'Etat de paie.xlsx' });
                } catch (e) {
                    console.warn('État de paie Excel non généré :', e.message);
                }
                setTimeout(() => archive.finalize(), 500);
            }).catch(async (err) => {
                if (browser) await browser.close();
                reject(err);
            });

        } catch (e) { reject(e); }
    });
};
