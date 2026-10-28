// Tests de la phase 4 : journal de paie et des OD, export Sage, provision pour
// congés payés, ordre de virement.
//   node tests/paie/compta.test.cjs

const path = require('path');
const racine = path.join(__dirname, '..', '..');
const compta = require(path.join(racine, 'server', 'compta', 'etatsComptables.js'));
const { genererDeclaration } = require(path.join(racine, 'server', 'declarations'));

let ko = 0;
const ok = (label, cond, detail) => {
  if (!cond) ko++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + label + (!cond && detail !== undefined ? '  → ' + JSON.stringify(detail) : ''));
};
const periode = { mois: 8, annee: 2025, libelle: 'Août 2025', code: '2025/08', nbPeriodes: 1 };
const ligne = (ecr, compte, sens) => ecr.filter(e => e.compte === compte).reduce((s, e) => s + e[sens], 0);
const equilibre = (ecr, journal) => {
  const es = ecr.filter(e => !journal || e.journal === journal);
  return es.reduce((s, e) => s + e.debit, 0) === es.reduce((s, e) => s + e.credit, 0);
};
const detail = (g = {}, r = {}, extra = {}) => JSON.stringify({
  version: 1,
  gains: { salaireBase: 0, sursalaire: 0, heuresSup: 0, primeAnciennete: 0, primesImposables: 0, gratification: 0, allocationConges: 0, preavis: 0, indemLicenciement: 0, indemTransac: 0, primeTransport: 0, primeTransportImposable: 0, primeLogement: 0, primesNonImposables: 0, fraisFuneraires: 0, ...g },
  retenues: { its: 0, cnps: 0, cmu: 0, acompte: 0, avance: 0, opposition: 0, autres: 0, ...r },
  conges: { acquis: 0, pris: 0, salaireReference: 0, ...(extra.conges || {}) },
  paiement: { mode: 'virement', banque: '', rib: '', ...(extra.paiement || {}) }
});

console.log('\n▸ Journal de paie — jeu de référence LOGIPAIE (août 2025)');
// Totaux du classeur LOGIPAIE, feuille 28 (un seul enregistrement agrégé suffit).
const ref = [{
  nom: 'TOTAL', its: 226195, cnpsSal: 185378, cmuSal: 0, netAPayer: 3270927,
  brutTotal: 3682500, brutImposable: 2942500,
  cnEmployeur: 35310, ceEmployeur: 0, fdfpTA: 11770, fdfpFPC: 17655,
  cnpsPF: 0, cnpsAM: 0, cnpsAT: 0, cnpsRetraitePat: 284697, cmuPat: 0,
  detailPaie: detail({ salaireBase: 2520000, primesImposables: 422500, primeTransport: 300000, primesNonImposables: 440000 }, { its: 226195, cnps: 185378 })
}];
const j = compta.journalPaie({ entreprise: {}, periode, lignes: ref });
const e = j.ecritures;
ok('661100 Salaires D 2 520 000', ligne(e, '661100', 'debit') === 2520000);
ok('661210 Primes D 422 500', ligne(e, '661210', 'debit') === 422500);
ok('663400 Transport D 300 000', ligne(e, '663400', 'debit') === 300000);
ok('663830 Indemnités non soumises D 440 000', ligne(e, '663830', 'debit') === 440000);
ok('447200 ITS C 226 195', ligne(e.filter(x => x.journal === 'PAIE'), '447200', 'credit') === 226195);
ok('431310 CNPS salarié C 185 378', ligne(e.filter(x => x.journal === 'PAIE'), '431310', 'credit') === 185378);
ok('422000 Net à payer C 3 270 927', ligne(e, '422000', 'credit') === 3270927);
ok('Journal de paie équilibré', equilibre(e, 'PAIE'));
console.log('\n▸ Journal des OD — référence LOGIPAIE');
ok('ITS : 447200 D 226 195 + 641300 D 35 310 → 442130 C 261 505',
  ligne(e.filter(x => x.journal === 'OD'), '447200', 'debit') === 226195 && ligne(e, '641300', 'debit') === 35310 && ligne(e, '442130', 'credit') === 261505);
ok('FDFP : 641400 D 11 770 + 641500 D 17 655 → 442810 C 29 425',
  ligne(e, '641400', 'debit') === 11770 && ligne(e, '641500', 'debit') === 17655 && ligne(e, '442810', 'credit') === 29425);
ok('CNPS : 664100 D 284 697 + 431310 D 185 378 → 431000 C 470 075',
  ligne(e, '664100', 'debit') === 284697 && ligne(e.filter(x => x.journal === 'OD'), '431310', 'debit') === 185378 && ligne(e, '431000', 'credit') === 470075);
ok('Journal des OD équilibré', equilibre(e, 'OD'));
ok('Document complet (pas partiel)', !j.partielle, j.avertissements);

console.log('\n▸ Année générée par le moteur');
const log = console.log; console.log = () => {};
const payroll = require(path.join(racine, 'server', 'payrollService.js'));
console.log = log;
const salaries = [
  { nom: 'KONE', prenom: 'Awa', matricule: 'M1', numero_cnps: '111', salaire_base: 400000, sursalaire: 20000, prime_transport: 50000, prime_logement: 30000, acompte: 15000, date_embauche: '2020-01-06', date_dernier_conge: '2026-01-01', banque: 'SGBCI', rib: 'CI008 0001', primes: [{ montant: 10000, imposable: true }] },
  { nom: 'YAO', prenom: 'Koffi', matricule: 'M2', numero_cnps: '222', salaire_base: 1500000, prime_transport: 30000, statut_salarie: 'expatrie', heures_sup_nb: 8, date_embauche: '2023-03-01', banque: 'NSIA', rib: 'CI042 0002' },
  { nom: 'DIABY', prenom: 'Moussa', matricule: 'M3', numero_cnps: '333', salaire_base: 90000, prime_transport: 30000, mode_paiement: 'especes', date_embauche: '2024-04-01' },
  { nom: 'TRAORE', prenom: 'Ali', matricule: 'M4', numero_cnps: '444', salaire_base: 250000, prime_transport: 30000, banque: 'SGBCI', date_embauche: '2025-06-01' }
];
let tousEquilibres = true, debitsJustes = true;
const parMois = {};
for (let mois = 1; mois <= 12; mois++) {
  const recs = [];
  let gains = 0;
  for (const s of salaries) {
    const emp = { ...s, mois, annee: 2026 };
    const c = payroll.calculateSinglePayroll(emp);
    gains += c.gainsTotaux;
    recs.push({ ...payroll.buildPayslipSnapshot(emp, c), mois, annee: 2026 });
  }
  parMois[mois] = recs;
  const jm = compta.journalPaie({ entreprise: {}, periode: { mois, annee: 2026 }, lignes: recs });
  if (!equilibre(jm.ecritures, 'PAIE') || !equilibre(jm.ecritures, 'OD')) tousEquilibres = false;
  if (jm.ecritures.filter(x => x.journal === 'PAIE').reduce((s, x) => s + x.debit, 0) !== gains) debitsJustes = false;
}
ok('12 mois : journaux de paie et d\'OD tous équilibrés', tousEquilibres);
ok('12 mois : débits du journal de paie = total des gains des bulletins', debitsJustes);
const oct = compta.journalPaie({ entreprise: {}, periode: { mois: 10, annee: 2026 }, lignes: parMois[10] });
ok('Acomptes sur 421000 (15 000), logement sur 663830', ligne(oct.ecritures, '421000', 'credit') === 15000 && ligne(oct.ecritures, '663830', 'debit') === 30000);
ok('Transport complet sur 663400 (excédent compris : 50 000 + 3 × 30 000)', ligne(oct.ecritures, '663400', 'debit') === 140000, ligne(oct.ecritures, '663400', 'debit'));

console.log('\n▸ Bulletins antérieurs (sans détail de paie)');
const ancien = { ...parMois[10][0], detailPaie: null };
const jAncien = compta.journalPaie({ entreprise: {}, periode: { mois: 10, annee: 2026 }, lignes: [ancien] });
ok('Comptes regroupés, document partiel avec avertissement', jAncien.partielle && jAncien.avertissements.length > 0);
ok('… et toujours équilibré', equilibre(jAncien.ecritures, 'PAIE') && equilibre(jAncien.ecritures, 'OD'));

console.log('\n▸ Plan comptable personnalisé');
const perso = compta.journalPaie({ entreprise: { comptesPaie: JSON.stringify({ salaires: '661110', journalPaie: 'SAL', netAPayer: 'abc' }) }, periode: { mois: 10, annee: 2026 }, lignes: parMois[10] });
ok('Compte remplacé (661110) et code journal (SAL) appliqués', perso.ecritures.some(x => x.compte === '661110' && x.journal === 'SAL'));
ok('Numéro invalide ignoré (net reste sur 422000)', perso.ecritures.some(x => x.compte === '422000'));

console.log('\n▸ Export Sage');
const csv = compta.sageCsv(j).split('\r\n');
ok('En-tête + une ligne par écriture', csv[0].startsWith('Code journal;Date;N° compte') && csv.length === j.ecritures.length + 1, csv.length);
ok('Date au format JJMMAA (31/08/2025 → 310825)', csv[1].split(';')[1] === '310825', csv[1]);

console.log('\n▸ Provision pour congés payés');
const prov = compta.provisionConges({
  entreprise: {}, periode: { mois: 10, annee: 2026 },
  lignes: [{ nom: 'TEST', prenom: 'Un', statutSalarie: 'local', tauxAtMp: 0.02, detailPaie: detail({}, {}, { conges: { acquis: 26, pris: 0, salaireReference: 300000 } }) }]
});
const l0 = prov.blocs[0].lignes[0];
ok('Indemnité = 300 000 / 30 × 26 = 260 000', l0[3] === 260000, l0);
ok('Charges sociales = 260 000 × 7,7 % + 75 000 × 7,75 % = 25 833', l0[4] === 25833, l0[4]);
ok('Charges fiscales = 260 000 × (1,2 % + 1 %) = 5 720', l0[5] === 5720, l0[5]);
ok('Provision = 291 553 et écriture équilibrée', prov.aPayer.montant === 291553 && equilibre(prov.ecritures), prov.aPayer.montant);
const provAn = compta.provisionConges({ entreprise: {}, periode: { mois: 10, annee: 2026 }, lignes: parMois[10] });
ok('Salarié sans retour de congés depuis l\'embauche : alerte « vérifier la date »', provAn.avertissements.some(a => /DIABY|YAO|TRAORE/.test(a)));

console.log('\n▸ Ordre de virement');
const ov = compta.ordreVirement({ entreprise: {}, periode: { mois: 10, annee: 2026 }, lignes: parMois[10] });
const listeOv = ov.blocs.find(b => b.titre.startsWith('Liste'));
const totalNets = parMois[10].reduce((s, r) => s + r.netAPayer, 0);
const especes = parMois[10].find(r => r.nom === 'DIABY').netAPayer;
ok('3 virements, DIABY payé en espèces à part', listeOv.lignes.length === 3 && ov.blocs.some(b => b.titre.startsWith('Payés hors virement')));
ok('Total à virer = nets − espèces', ov.aPayer.montant === totalNets - especes, [ov.aPayer.montant, totalNets - especes]);
ok('TRAORE sans RIB : signalé, document partiel', ov.partielle && ov.avertissements.some(a => /sans RIB/.test(a)) && listeOv.lignes.some(l => l[3] === 'RIB MANQUANT'));
ok('Récapitulatif par banque (NSIA, SGBCI)', ov.blocs.find(b => b.titre.startsWith('Récapitulatif')).paires.map(p => p[0]).join(',') === 'NSIA,SGBCI');

console.log('\n▸ Rendu (PDF, Excel, CSV, Sage)');
(async () => {
  for (const [type, formats] of [['journal-paie', ['pdf', 'xlsx', 'csv', 'sage']], ['provision-conges', ['pdf', 'xlsx', 'sage']], ['ordre-virement', ['pdf', 'xlsx', 'csv']]]) {
    for (const format of formats) {
      try {
        const out = await genererDeclaration({ type, format, entreprise: { raisonSociale: 'ONDA TEST' }, periodes: [{ mois: 10, annee: 2026 }], records: parMois[10] });
        const signe = format === 'pdf' ? out.buffer.slice(0, 4).toString() === '%PDF' : format === 'xlsx' ? out.buffer.slice(0, 2).toString() === 'PK' : out.buffer.length > 50;
        ok(`${type} · ${format} (${out.filename})`, signe);
      } catch (err) { ok(`${type} · ${format}`, false, err.message); }
    }
  }
  try {
    await genererDeclaration({ type: 'ordre-virement', format: 'sage', entreprise: {}, periodes: [{ mois: 10, annee: 2026 }], records: [] });
    ok('Format Sage refusé hors écritures', false);
  } catch (err) { ok('Format Sage refusé hors écritures', /Sage/.test(err.message)); }
  console.log(ko ? `\n✗ ${ko} échec(s)\n` : '\n✓ Tout est vert.\n');
  process.exit(ko ? 1 : 0);
})();
