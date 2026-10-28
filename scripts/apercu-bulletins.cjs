// Aperçu de tous les modèles de bulletin intégrés (remplace les anciens
// server/__test_*.js, un script par modèle).
//
//   node scripts/apercu-bulletins.cjs [dossier]           → un PDF par modèle (défaut : dossier temporaire)
//   node scripts/apercu-bulletins.cjs --empreinte f.json   → la définition pdfmake de chaque modèle, en JSON
//
// L'empreinte sert de filet de sécurité pour un déplacement de code : générée
// avant et après, elle doit être identique (même jour : certains modèles
// impriment la date du jour).

const fs = require('fs');
const os = require('os');
const path = require('path');

const racine = path.join(__dirname, '..');
const args = process.argv.slice(2);
const iEmpreinte = args.indexOf('--empreinte');
const fichierEmpreinte = iEmpreinte >= 0 ? args[iEmpreinte + 1] : null;
const dossier = fichierEmpreinte ? null : (args[0] || path.join(os.tmpdir(), 'apercu-bulletins'));

// Capture la définition passée au moteur PDF, avant tout rendu.
const PdfPrinter = require(path.join(racine, 'server', 'node_modules', 'pdfmake'));
const capturees = [];
const rendre = PdfPrinter.prototype.createPdfKitDocument;
PdfPrinter.prototype.createPdfKitDocument = function (definition, ...reste) {
    capturees.push(JSON.stringify(definition, (cle, valeur) => typeof valeur === 'function' ? `ƒ ${valeur.toString()}` : valeur));
    return rendre.call(this, definition, ...reste);
};

const log = console.log;
console.log = () => {};
const payroll = require(path.join(racine, 'server', 'payrollService.js'));
console.log = log;

const salarie = {
    pays: 'CI', nom: 'KONE', prenom: 'Awa', matricule: 'M-001', numero_cnps: '00123456', poste: 'Comptable',
    categorie: 'M2', departement: 'Finance', mois: '10', annee: '2026', date_embauche: '2019-03-01',
    situation_matrimoniale: 'marie', nombre_enfants: 2, statut_salarie: 'local',
    salaire_base: 450000, sursalaire: 25000, prime_transport: 50000, prime_logement: 30000,
    heures_sup_nb: 8, acompte: 20000, banque: 'SGBCI', rib: 'CI008 01234 012345678901 12', virement: true,
    primes: [{ libelle: 'Prime de responsabilité', montant: 40000, imposable: true }, { libelle: 'Panier', montant: 10000, imposable: false }]
};
const entreprise = {
    nom_entreprise: 'ONDA DÉMO SARL', adresse: 'BP 1289 Abidjan 01', ville: 'Abidjan', numero_cnps: '067964 A',
    numero_contribuable: '1212170 D', telephone: '27 22 00 00 00', signataire_nom: 'TRAORE Awa', signataire_fonction: 'Gérante'
};
const stc = {
    ans: 7, moisTotal: 7, joursResto: 12, brut: 475000, totalBrut: 1650000, net: 1480000,
    lignes: [
        { type: 'gain', code: 'IL', libelle: 'Indemnité de licenciement', calcul: '7 ans × 30 % × 475 000', loi: 'Art. 18.7', montant: 997500 },
        { type: 'gain', code: 'CP', libelle: 'Indemnité compensatrice de congés', calcul: '22 jours', loi: 'Art. 25.11', montant: 652500 },
        { type: 'retenue', code: 'ITS', libelle: 'ITS sur indemnités imposables', calcul: '', loi: 'CGI', montant: 170000 }
    ]
};

const cas = [
    ['classique', { ...salarie }, null],
    ...payroll.STYLES_BULLETIN_DISPONIBLES.map(style => [style, { ...salarie }, style]),
    ['benin', { ...salarie, pays: 'BJ' }, null],
    ['togo', { ...salarie, pays: 'TG' }, null]
];

(async () => {
    if (dossier) fs.mkdirSync(dossier, { recursive: true });
    const empreinte = {};
    for (const [nom, emp, style] of cas) {
        const avant = capturees.length;
        const pdf = await payroll.generateSinglePdf(emp, payroll.calculateSinglePayroll(emp), entreprise, null, style);
        empreinte[nom] = capturees.slice(avant).join('\n');
        if (dossier) fs.writeFileSync(path.join(dossier, `bulletin_${nom}.pdf`), pdf);
    }
    const avant = capturees.length;
    const pdfStc = await payroll.generateStcPdf({ ...salarie, date_sortie: '2026-10-31', motif_rupture: 'licenciement', type_contrat: 'CDI', nom_entreprise: entreprise.nom_entreprise }, stc);
    empreinte.stc = capturees.slice(avant).join('\n');
    if (dossier) fs.writeFileSync(path.join(dossier, 'solde_tout_compte.pdf'), pdfStc);

    if (fichierEmpreinte) {
        fs.writeFileSync(fichierEmpreinte, JSON.stringify(empreinte, null, 1));
        log(`✓ Empreinte de ${Object.keys(empreinte).length} modèles → ${fichierEmpreinte}`);
    } else {
        log(`✓ ${Object.keys(empreinte).length} PDF écrits dans ${dossier}`);
    }
    process.exit(0);
})().catch(e => { log('ÉCHEC :', e); process.exit(1); });
