// ═══════════════════════════════════════════════════════════════════════════
// DÉCLARATIONS — SORTIE TABLEUR (XLSX / CSV)
//
// Rend en classeur les structures produites par declarationsService. Une feuille
// = une déclaration, mise en forme pour être relue et reportée sur e-CNPS.
// ═══════════════════════════════════════════════════════════════════════════

const XLSX = require('xlsx');

const NF = '#,##0';

/** aoa → feuille avec largeurs de colonnes auto (bornées). */
function feuilleDepuisAoa(aoa, largeurs) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = (largeurs || aoa[0].map(() => 24)).map(w => ({ wch: w }));
    return ws;
}

function enteteEntreprise(d) {
    const e = d.entreprise || {};
    return [
        [d.titre],
        [e.raisonSociale || '', '', `Période : ${d.periode.libelle}`],
        [`N° Employeur : ${e.numeroEmployeur || '—'}`, '', d.periode.type === 'trimestriel' ? 'Versement trimestriel' : 'Versement mensuel'],
        d.partielle ? ['⚠ DÉCLARATION PARTIELLE — certaines données historiques manquent, voir avertissements'] : [],
        []
    ];
}

/** Bordereau CNPS (feuille 27). */
function bordereauCnpsXlsx(d) {
    const wb = XLSX.utils.book_new();

    const aoa = [
        ...enteteEntreprise(d),
        [`Total salaires bruts payés sur la période`, d.totalBrutPaye],
        [`Effectif total`, d.effectifTotal, `Effectif cotisant`, d.effectifCotisant],
        [],
        ['SALAIRES BRUTS SOUMIS À COTISATION'],
        ['Catégorie de salaires', 'Nombre de salariés', 'Base régime retraite', 'Base PF / AT / AM'],
        ...d.categories.map(c => [c.libelle, c.effectif, c.baseRetraite, c.basePfAt]),
        ['TOTAL', d.effectifCotisant, d.totaux.baseRetraite, d.totaux.basePfAt],
        [],
        ['DÉCOMPTE DES COTISATIONS DUES'],
        ['Rubrique', 'Base cotisable', 'Taux', 'Montant (FCFA)'],
        ['Assurance Maternité', d.decompte.assuranceMaternite.base, pct(d.decompte.assuranceMaternite.taux), d.decompte.assuranceMaternite.montant],
        ['Prestations Familiales', d.decompte.prestationsFamiliales.base, pct(d.decompte.prestationsFamiliales.taux), d.decompte.prestationsFamiliales.montant],
        ['Accidents du Travail', d.decompte.accidentsTravail.base, pct(d.decompte.accidentsTravail.taux), d.decompte.accidentsTravail.montant],
        ['Régime de Retraite (14 % = 7,7 % emp. + 6,3 % sal.)', d.decompte.regimeRetraite.base, pct(d.decompte.regimeRetraite.taux), d.decompte.regimeRetraite.montant],
        ['TOTAL COTISATIONS À PAYER', '', '', d.decompte.total]
    ];

    if (d.avertissements && d.avertissements.length) {
        aoa.push([], ['AVERTISSEMENTS'], ...d.avertissements.map(a => [a]));
    }

    const ws = feuilleDepuisAoa(aoa, [46, 20, 20, 20]);
    formatColonneNombre(ws, aoa, [1, 2, 3]);
    XLSX.utils.book_append_sheet(wb, ws, 'Bordereau CNPS');
    return xlsxBuffer(wb);
}

/** Liste nominative CNPS (feuille 26). */
function listeNominativeCnpsXlsx(d) {
    const wb = XLSX.utils.book_new();
    const enTetes = ['N° ordre', 'N° CNPS', 'Nom', 'Prénoms', 'Année naissance', "Date d'embauche",
        'Date de départ', 'Type (M/J/H)', 'Durée (mois)', 'Salaire brut', 'Branches cotisées'];
    const aoa = [
        ...enteteEntreprise(d),
        enTetes,
        ...d.salaries.map(s => [
            s.ordre, s.numeroCnps, s.nom, s.prenoms, s.anneeNaissance, s.dateEmbauche,
            s.dateDepart, s.typeSalarie, s.dureeTravaillee, s.salaireBrut, s.branchesCotisees
        ]),
        ['', '', `TOTAL (${d.total.effectif} salarié(s))`, '', '', '', '', '', '', d.total.salaireBrut, '']
    ];
    if (d.avertissements && d.avertissements.length) {
        aoa.push([], ['AVERTISSEMENTS'], ...d.avertissements.map(a => [a]));
    }
    const ws = feuilleDepuisAoa(aoa, [9, 18, 20, 22, 14, 14, 14, 12, 12, 16, 14]);
    XLSX.utils.book_append_sheet(wb, ws, 'Liste nominative CNPS');
    return xlsxBuffer(wb);
}

function csvDepuis(d, type) {
    // Réutilise la mise en page XLSX puis exporte la 1re feuille en CSV.
    const wb = XLSX.read(type === 'cnps-liste' ? listeNominativeCnpsXlsx(d) : bordereauCnpsXlsx(d), { type: 'buffer' });
    return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ';' });
}

// ── utilitaires ──
function pct(t) { return (Math.round(t * 10000) / 100) + ' %'; }
function xlsxBuffer(wb) { return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); }
function formatColonneNombre(ws, aoa, colIdx) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
        for (const c of colIdx) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell && typeof cell.v === 'number') cell.z = NF;
        }
    }
}

module.exports = { bordereauCnpsXlsx, listeNominativeCnpsXlsx, csvDepuis };
