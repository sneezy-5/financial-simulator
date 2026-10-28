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

// Moteur de paie CI : source unique partagée avec le simulateur (voir
// server/moteur/paieCI.mjs). Barèmes datés, heures sup., ITS, CNPS, CMU,
// transport plafonné par zone, base de jours réglable par entreprise.
const { calculerBulletinCI } = require('./moteur/paieCI.cjs');

function calculateSalaryRules(employee) {
    return calculerBulletinCI(employee);
}

/**
 * Un modèle client (Word ou HTML) conçu avant le plafonnement du transport n'a
 * pas d'emplacement pour l'excédent imposable : la ligne manquerait et les gains
 * affichés ne tomberaient plus sur le brut. On le détecte pour prévenir le RH.
 */
function modeleSansTransportImposable({ isDocxMode, isHtmlTemplateMode, htmlTemplate, docTemplateContent }) {
    const VARIABLES = /transport_imposable|primeTransportImposable/;
    try {
        if (isHtmlTemplateMode) return !VARIABLES.test(htmlTemplate || '');
        if (isDocxMode && docTemplateContent) {
            const xml = new PizZip(docTemplateContent).file('word/document.xml')?.asText() || '';
            return !VARIABLES.test(xml);
        }
    } catch (e) {
        console.warn('Analyse du modèle (transport imposable) impossible :', e.message);
    }
    return false;
}

function avertissementTransport(salaries) {
    if (!salaries.length) return [];
    const noms = salaries.slice(0, 5).join(', ') + (salaries.length > 5 ? '…' : '');
    return [`Votre modèle de bulletin n'affiche pas l'excédent imposable de la prime de transport (au-delà du plafond exonéré) — ${salaries.length} salarié(s) concerné(s) : ${noms}. Le calcul est juste ; ajoutez la variable {primeTransportImposable} (modèle Word) ou {{prime_transport_imposable}} (modèle HTML) pour que la ligne apparaisse.`];
}

// Modèles de bulletin (un fichier par modèle) et outils communs : server/bulletins/.
// Calculs Bénin / Togo : server/moteur/. Extraits en phase 6, code inchangé.
const {
    fcfa, formatDate, calculateCongesCounters, calculateCumuls, resolveCompanyInfo, CODE_RUBRIQUE, resolveCodesRubrique, construireRubriques,
    generatePdfDefinition,
    generatePdfDefinitionGrilleNumerotee,
    generatePdfDefinitionCompact,
    generatePdfDefinitionLogipaie,
    generatePdfDefinitionBancaire,
    generatePdfDefinitionModerne,
    generatePdfDefinitionLavandiere,
    generatePdfDefinitionADArchitecture,
    generatePdfDefinitionTcmLogistic,
    generatePdfDefinitionScaso,
    generatePdfDefinitionPersonnalise,
    generatePdfDefinitionSurMesure,
    generateBeninPdfDefinition,
    generateTogoPdfDefinition
} = require('./bulletins');
const { calculateBeninSalaryRules } = require('./moteur/paieBenin');
const { calculateTogoSalaryRules } = require('./moteur/paieTogo');
const { CANVAS_CHAMPS_DISPONIBLES, CANVAS_LAYOUT_DEFAUT, CANVAS_PAGE } = require('./bulletins/surMesure');
Object.assign(exports, { CANVAS_CHAMPS_DISPONIBLES, CANVAS_LAYOUT_DEFAUT, CANVAS_PAGE });

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
// Exposé pour les tests des déclarations : c'est l'instantané réellement enregistré.
exports.buildPayslipSnapshot = (emp, calculs) => buildPayslipSnapshot(emp, calculs);
exports.CATALOGUE_RUBRIQUES = [
    { cle: 'salaireBase', libelle: 'Salaire de base', groupe: 'Gains' },
    { cle: 'sursalaire', libelle: 'Sursalaire', groupe: 'Gains' },
    { cle: 'primeAnciennete', libelle: "Prime d'ancienneté", groupe: 'Gains' },
    { cle: 'prime', libelle: 'Primes libres (diverses)', groupe: 'Gains' },
    { cle: 'allocationConges', libelle: 'Allocation congés payés', groupe: 'Gains' },
    { cle: 'heuresSup', libelle: 'Heures supplémentaires', groupe: 'Gains' },
    { cle: 'gratification', libelle: 'Gratification / 13e mois', groupe: 'Gains' },
    { cle: 'primeTransport', libelle: 'Indemnité de transport', groupe: 'Gains' },
    { cle: 'primeTransportImposable', libelle: 'Indemnité de transport (excédent imposable)', groupe: 'Gains' },
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
    { cle: 'cnEmployeur', libelle: 'CN — Contribution Nationale (employeur)', groupe: 'Charges patronales' },
    { cle: 'ceEmployeur', libelle: 'CE — Contribution Employeur (expatrié)', groupe: 'Charges patronales' },
    { cle: 'impotEmployeur', libelle: 'CN + CE (impôts employeur, agrégat)', groupe: 'Charges patronales' },
    { cle: 'fdfpTA', libelle: "FDFP — Taxe d'apprentissage", groupe: 'Charges patronales' },
    { cle: 'fdfpFPC', libelle: 'FDFP — Formation professionnelle continue', groupe: 'Charges patronales' }
];

// Instantané par salarié pour l'historique de paie persistant (fondation des futures
// déclarations réglementaires CNPS/ITS/CMU) — capture ce qui a réellement été calculé/déclaré,
// indépendamment de toute modification ultérieure de la fiche salarié.
/**
 * Détail de paie figé avec le bulletin (colonne PayslipRecord.detailPaie).
 * Les gains et retenues sont ventilés comme dans le livre de paie LOGIPAIE ;
 * leur somme retombe exactement sur le total des gains et le net.
 */
function detailPaieDepuis(emp, c) {
    const n = (v) => Math.round(+v || 0);
    const s = c.salarial || {};
    const mode = String(emp.mode_paiement || emp.modePaiement || (emp.virement === false ? 'especes' : 'virement')).toLowerCase();
    return {
        version: 1,
        gains: {
            salaireBase: n(c.salaireBase), sursalaire: n(c.sursalaire), heuresSup: n(c.montantHeuresSup),
            primeAnciennete: n(c.primeAnciennete), primesImposables: n(c.primesImposables),
            gratification: n(c.gratification), allocationConges: n(c.allocationConges),
            preavis: n(c.preavisVal), indemLicenciement: n(c.indemLicenciement), indemTransac: n(c.indemTransac),
            primeTransport: n(c.primeTransport), primeTransportImposable: n(c.primeTransportImposable),
            primeLogement: n(c.primeLogement), primesNonImposables: n(c.primesNonImposablesRub),
            fraisFuneraires: n(c.fraisFuneraires)
        },
        retenues: {
            its: n(s.its), cnps: n(s.cnps), cmu: n(s.cmu),
            acompte: n(s.acompte ?? c.acompte), avance: n(s.avance ?? c.avance),
            opposition: n(s.opposition ?? c.opposition), autres: n(s.autres ?? c.autresRetenues)
        },
        conges: {
            acquis: n(c.totalCongesAcquis), pris: +c.joursCP || 0,
            // Base journalière de l'allocation (salaire + sursalaire + ancienneté) / 30.
            salaireReference: n((+c.salaireBaseMensuel || 0) + (+emp.sursalaire || 0) + (+c.primeAnciennete || 0))
        },
        paiement: {
            mode: ['especes', 'cheque'].includes(mode) ? mode : 'virement',
            banque: emp.banque || '',
            rib: emp.rib || ''
        }
    };
}

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
        absencesJours: parseFloat(emp.absences_jours) || 0,

        // ── Lot 1 : champs déclarations (figés au moment de la génération) ──
        brutImposable: calculs.brutImposable ?? null,
        baseCnpsRetraite: calculs.baseCNPS ?? null,
        baseCnpsPfAt: calculs.baseCNPS_PfAtAm ?? null,
        cnEmployeur: calculs.patronal?.cnEmployeur ?? null,
        ceEmployeur: calculs.patronal?.ceEmployeur ?? null,
        fdfpTA: calculs.patronal?.fdfpTA ?? null,
        fdfpFPC: calculs.patronal?.fdfpFPC ?? null,
        tauxAtMp: calculs.patronal?.tauxAt ?? null,
        // Connu à la génération : on le fige. 'expatrie' si la fiche le dit.
        statutSalarie: String(emp.statut_salarie || '').toLowerCase().includes('expat') ? 'expatrie' : 'local',
        typeSalarie: 'M', // le moteur mensualise tous les bulletins (base 26)
        anneeNaissance: anneeNaissanceDepuis(emp.date_naissance || emp.annee_naissance),
        dateEmbauche: emp.date_embauche || null,
        dateDepart: emp.date_depart || emp.date_fin || null,

        // ── Phase 4 : détail figé pour la comptabilité, le virement et les congés ──
        detailPaie: JSON.stringify(detailPaieDepuis(emp, calculs))
    };
}

/** Année de naissance depuis une date ISO/FR ou une année déjà nue. */
function anneeNaissanceDepuis(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number' && v > 1900 && v < 2100) return v;
    const s = String(v);
    const m = s.match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
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

exports.processPayrollFile = async (dataPath, outputPath, templatePath = null, mapping = null, htmlTemplate = null, country = 'CI', sheetName = null, leavesToProcess = [], docxTemplateBase64 = null, templateStyle = null, optionsPaie = {}) => {
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
            const sansExcedent = modeleSansTransportImposable({ isDocxMode, isHtmlTemplateMode, htmlTemplate, docTemplateContent });
            const salariesExcedentMasque = [];

            output.on('close', () => resolve({
                count: fullEmployees.length,
                type: isDocxMode ? 'docx' : 'pdf',
                totalMasseSalariale,
                totalCNPS,
                totalImpots,
                perEmployeeResults,
                avertissements: avertissementTransport(salariesExcedentMasque)
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
                    const calculs = exports.calculateSinglePayroll({ ...emp, pays: country, base_jours_paie: emp.base_jours_paie ?? optionsPaie.baseJoursPaie, zone_transport: emp.zone_transport || optionsPaie.zoneTransport });
                    totalMasseSalariale += calculs.gainsTotaux || 0;
                    totalCNPS += calculs.salarial.cnps || 0;
                    totalImpots += calculs.salarial.irpp || calculs.salarial.its || 0;
                    perEmployeeResults.push(buildPayslipSnapshot(emp, calculs));
                    if (sansExcedent && calculs.primeTransportImposable > 0) salariesExcedentMasque.push(`${emp.prenom || ''} ${emp.nom || ''}`.trim());

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

exports.processPayrollJson = async (employeesList, outputPath, templatePath = null, mapping = null, htmlTemplate = null, country = 'CI', companyInfoOverride = null, leavesToProcess = [], docxTemplateBase64 = null, templateStyle = null, optionsPaie = {}) => {
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
            // Ici un modèle Word base64 est décodé plus bas, au rendu : on le lit aussi pour l'analyse.
            const sansExcedent = modeleSansTransportImposable({
                isDocxMode: isDocxMode || !!docxTemplateBase64, isHtmlTemplateMode, htmlTemplate,
                docTemplateContent: docTemplateContent || (docxTemplateBase64 ? decoderDocumentBase64(docxTemplateBase64) : null)
            });
            const salariesExcedentMasque = [];

            output.on('close', () => resolve({
                count: fullEmployees.length,
                type: isDocxMode ? 'docx' : 'pdf',
                totalMasseSalariale,
                totalCNPS,
                totalImpots,
                perEmployeeResults,
                avertissements: avertissementTransport(salariesExcedentMasque)
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
                    const calculs = exports.calculateSinglePayroll({ ...emp, pays: country, base_jours_paie: emp.base_jours_paie ?? optionsPaie.baseJoursPaie, zone_transport: emp.zone_transport || optionsPaie.zoneTransport });
                    totalMasseSalariale += calculs.gainsTotaux || 0;
                    totalCNPS += calculs.salarial.cnps || 0;
                    totalImpots += calculs.salarial.irpp || calculs.salarial.its || 0;
                    perEmployeeResults.push(buildPayslipSnapshot(emp, calculs));
                    if (sansExcedent && calculs.primeTransportImposable > 0) salariesExcedentMasque.push(`${emp.prenom || ''} ${emp.nom || ''}`.trim());

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
