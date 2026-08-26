// Auto-test des regles de solde de tout compte (Cote d Ivoire).
//   node --experimental-vm-modules tests/soldeToutCompte.test.mjs
// Verifie notamment l exemple de reference : 8 ans 7 mois a 600 000 F
// doit donner 1 652 500 F d indemnite de licenciement.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Le paquet racine est en CommonJS pour Node, alors que Vite lit ce module
// comme de l ESM. On en fait donc une copie .mjs le temps du test, plutot que
// de dupliquer les regles ou de changer le type du paquet.
const SOURCE = new URL('../src/services/soldeToutCompte.js', import.meta.url);
const copie = path.join(os.tmpdir(), 'soldeToutCompte.' + process.pid + '.mjs');
fs.writeFileSync(copie, fs.readFileSync(SOURCE));
const {
  calculerAnciennete, indemniteLicenciement, indemniteFinCDD,
  calculerSoldeToutCompte, salaireReference
} = await import(pathToFileURL(copie).href);
process.on('exit', () => { try { fs.unlinkSync(copie); } catch {} });

let ko = 0;
const ok = (label, cond, detail) => { if (!cond) ko++; console.log('  ' + (cond ? '✓' : '✗') + ' ' + label + (!cond && detail ? '  → ' + detail : '')); };
const fr = (n) => Math.round(n).toLocaleString('fr-FR');

console.log('\n▸ VOTRE EXEMPLE : 8 ans 7 mois, salaire global 600 000');
const anc = calculerAnciennete('2017-01-15', '2025-08-20');
const lic = indemniteLicenciement({ salaireRef: 600000, anciennete: { moisTotal: 8*12+7 }, motif: 'licenciement' });
lic.tranches.forEach(t => console.log('    tranche ' + t.de + '-' + (t.a || '+') + ' : ' + t.annees + ' an(s) x ' + (t.taux*100) + '% = ' + fr(t.montant)));
console.log('    TOTAL = ' + fr(lic.montant));
ok('1re tranche = 900 000', lic.tranches[0].montant === 900000, fr(lic.tranches[0].montant));
ok('2e tranche ≈ 752 500', Math.abs(lic.tranches[1].montant - 752500) <= 100, fr(lic.tranches[1].montant));
ok('total ≈ 1 652 500', Math.abs(lic.montant - 1652500) <= 100, fr(lic.montant));

console.log('\n▸ Grille des circonstances');
const base = { salaireRef: 600000, anciennete: { moisTotal: 60 } };
ok('démission : pas d\'indemnité de licenciement', indemniteLicenciement({ ...base, motif: 'demission' }).du === false);
ok('licenciement : indemnité due', indemniteLicenciement({ ...base, motif: 'licenciement' }).du === true);
ok('FAUTE LOURDE : aucune indemnité de licenciement', indemniteLicenciement({ ...base, motif: 'licenciement_faute_lourde' }).du === false);
ok('retraite : même barème que le licenciement',
   indemniteLicenciement({ ...base, motif: 'retraite' }).montant === indemniteLicenciement({ ...base, motif: 'licenciement' }).montant);
ok('moins d\'un an : pas d\'indemnité', indemniteLicenciement({ salaireRef: 600000, anciennete: { moisTotal: 11 }, motif: 'licenciement' }).du === false);
ok('décès : droit à apprécier, pas automatique', indemniteLicenciement({ ...base, motif: 'deces' }).du === false);

console.log('\n▸ Indemnité de fin de CDD (3 %)');
ok('fin normale : 3% du cumul', indemniteFinCDD({ salairesBrutsCumules: 7200000, motif: 'fin_cdd' }).montant === 216000);
ok('rupture par le SALARIÉ : non due', indemniteFinCDD({ salairesBrutsCumules: 7200000, motif: 'cdd_rupture_salarie' }).du === false);
ok('CDI équivalent refusé : non due', indemniteFinCDD({ salairesBrutsCumules: 7200000, motif: 'cdd_refus_cdi' }).du === false);
ok('rupture par l\'EMPLOYEUR : due', indemniteFinCDD({ salairesBrutsCumules: 7200000, motif: 'cdd_rupture_employeur' }).du === true);

console.log('\n▸ Salaire de référence : moyenne 12 mois, frais professionnels exclus');
const hist = Array.from({length:12},(_,i)=>({ salaire: 500000, primes: i < 6 ? 0 : 200000, fraisProfessionnels: 50000 }));
const sr = salaireReference(hist, 700000);
ok('moyenne = 550 000 (frais exclus)', Math.round(sr) === 550000, fr(sr));

console.log('\n▸ Aucune retenue sans base');
const r = calculerSoldeToutCompte({
  dateEmbauche: '2020-01-10', dateSortie: '2026-08-31', motif: 'demission',
  brutMensuel: 400000, salaireDernierMois: 400000, joursCongesPris: 10,
  preavisDureeMois: 1, preavisMoisExecutes: 0,
  retenues: [
    { code: 'avance', libelle: 'Avance sur salaire', montant: 50000, base: 'Avance consentie le 12/07/2026' },
    { code: 'divers', libelle: 'Retenue sans justification', montant: 90000 }
  ]
});
ok('la retenue justifiée est appliquée', r.retenues.length === 1 && r.retenues[0].montant === 50000);
ok('la retenue sans base est écartée', r.totalRetenues === 50000, fr(r.totalRetenues));
ok('le préavis non exécuté n\'est PAS déduit d\'office', !r.gains.some(g => g.code === 'indemnite_preavis'));
ok('mais il est signalé', r.aVerifier.some(a => /potentiellement dû à l/.test(a)));
console.log('    signalements :');
r.aVerifier.forEach(a => console.log('      • ' + a));
console.log('    net = ' + fr(r.netSoldeToutCompte) + '  (brut ' + fr(r.soldeBrut) + ' − retenues ' + fr(r.totalRetenues) + ')');

console.log('\n▸ Effet des saisies désormais proposées à l\'utilisateur');
// Salaire augmente en cours d annee : la moyenne reelle differe du salaire courant.
const histo = [...Array(6).fill({ salaire: 400000, primes: 0 }), ...Array(6).fill({ salaire: 600000, primes: 0 })];
ok('sans historique, on retombe sur le salaire courant', salaireReference(null, 600000) === 600000);
ok('avec historique, la moyenne reelle fait foi', salaireReference(histo, 600000) === 500000);

const ancRef = { moisTotal: 103 };
const sansH = indemniteLicenciement({ salaireRef: 600000, anciennete: ancRef, motif: 'licenciement' });
const avecH = indemniteLicenciement({ salaireRef: 500000, anciennete: ancRef, motif: 'licenciement' });
ok("l ecart sur l indemnite est significatif (" + fr(sansH.montant - avecH.montant) + ')',
   sansH.montant - avecH.montant > 250000);

const cddEstime = indemniteFinCDD({ salaireMensuel: 400000, dureeMois: 18, motif: 'fin_cdd' });
const cddReel = indemniteFinCDD({ salairesBrutsCumules: 6300000, motif: 'fin_cdd' });
ok('le cumul reel du CDD change le montant', cddEstime.montant !== cddReel.montant,
   fr(cddEstime.montant) + ' vs ' + fr(cddReel.montant));
ok('l estimation est signalee comme telle', cddEstime.approxime && !cddReel.approxime);

console.log('\n' + (ko === 0 ? '✓ Tout est vert.' : '✗ ' + ko + ' échec(s).') + '\n');
process.exit(ko === 0 ? 0 : 1);
