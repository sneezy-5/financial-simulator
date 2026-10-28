// Tests du moteur de paie CI (server/moteur/paieCI.mjs → paieCI.cjs).
//   node tests/paie/moteur.test.cjs
//
// 1. la copie CommonJS du serveur est à jour avec la source partagée ;
// 2. les bulletins de référence (casReference.cjs) tombent juste au franc près ;
// 3. le serveur (calculateSinglePayroll) utilise bien ce moteur ;
// 4. paramètres : base de jours, zone de transport, barème daté.

const { execFileSync } = require('child_process');
const path = require('path');

const racine = path.join(__dirname, '..', '..');
const moteur = require(path.join(racine, 'server', 'moteur', 'paieCI.cjs'));
const cas = require('./casReference.cjs');

let ko = 0;
const ok = (label, cond, detail) => {
  if (!cond) ko++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + label + (!cond && detail ? '  → ' + detail : ''));
};
const aPlat = (r) => ({ ...r, ...r.patronal, ...r.salarial });

console.log('\n▸ Copie serveur du moteur');
try {
  execFileSync(process.execPath, [path.join(racine, 'scripts', 'sync-moteur.cjs'), '--check'], { stdio: 'pipe' });
  ok('paieCI.cjs à jour avec paieCI.mjs', true);
} catch (e) {
  ok('paieCI.cjs à jour avec paieCI.mjs', false, 'lancer `node scripts/sync-moteur.cjs`');
}

console.log('\n▸ Bulletins de référence (vérifiés à la main)');
for (const c of cas) {
  const r = aPlat(moteur.calculerBulletinCI({ ...c.employe }));
  const ecarts = Object.entries(c.attendu).filter(([k, v]) => r[k] !== v).map(([k, v]) => `${k} attendu ${v}, obtenu ${r[k]}`);
  ok(c.nom, ecarts.length === 0, ecarts.join(' ; '));
}

console.log('\n▸ Serveur = moteur partagé');
// Le serveur journalise au chargement (base de données…) : on le fait taire le temps du require.
const log = console.log;
console.log = () => {};
const payrollService = require(path.join(racine, 'server', 'payrollService.js'));
console.log = log;
for (const c of cas) {
  const serveur = payrollService.calculateSinglePayroll({ ...c.employe });
  const partage = moteur.calculerBulletinCI({ ...c.employe });
  ok(c.nom, JSON.stringify(serveur) === JSON.stringify(partage));
}

console.log('\n▸ Paramètres');
const base = { mois: 10, annee: 2026, salaire_base: 400000, prime_transport: 30000, situation_matrimoniale: 'celibataire', absences_jours: 2 };
const b26 = moteur.calculerBulletinCI({ ...base });
const b30 = moteur.calculerBulletinCI({ ...base, base_jours_paie: 30, jours_travailles: 30 });
ok('base 26 par défaut : 400 000 / 26 × 24 = 369 231', b26.salaireBase === 369231, b26.salaireBase);
ok('base 30 : 400 000 / 30 × 28 = 373 333', b30.salaireBase === 373333, b30.salaireBase);
ok('base inconnue (31) → 26', moteur.calculerBulletinCI({ ...base, base_jours_paie: 31 }).salaireBase === 369231);
const trente = moteur.calculerBulletinCI({ mois: 10, annee: 2026, salaire_base: 400000, prime_transport: 30000, jours_travailles: 30 });
ok('30 jours saisis sur une base 26 : plafonné à 100 % (400 000, pas 461 538)', trente.salaireBase === 400000 && trente.primeTransport === 30000, trente.salaireBase);

const transport = { mois: 10, annee: 2026, salaire_base: 400000, prime_transport: 30000, situation_matrimoniale: 'celibataire' };
const bouake = moteur.calculerBulletinCI({ ...transport, zone_transport: 'bouake' });
const interieur = moteur.calculerBulletinCI({ ...transport, zone_transport: 'interieur' });
ok('Bouaké : 24 000 exonérés, 6 000 imposables', bouake.primeTransport === 24000 && bouake.primeTransportImposable === 6000);
ok('Intérieur : 20 000 exonérés, 10 000 imposables', interieur.primeTransport === 20000 && interieur.primeTransportImposable === 10000);
ok('Plafond saisi sur la fiche prioritaire sur la zone', moteur.calculerBulletinCI({ ...transport, zone_transport: 'interieur', plafond_transport_exonere: 30000 }).primeTransportImposable === 0);

ok('Barème 2024 appliqué en 2026', moteur.baremeCI(2026, 10).dateEffet === '2024-01-01');
ok('Avant la 1re date d\'effet : 1re version', moteur.baremeCI(2020, 1).dateEffet === '2024-01-01');

console.log('\n▸ Congés');
const habituel = { mois: 10, annee: 2026, salaire_base: 400000, prime_transport: 30000, date_embauche: '2024-01-01', bulletin_type: 'habituel' };
const sansMode = moteur.calculerBulletinCI({ ...habituel, prise_conges_mode: null });
ok('Bulletin normal sans mode : aucun congé pris, salaire complet', sansMode.joursCP === 0 && sansMode.salaireBase === 400000);
ok('Droits acquis toujours calculés (33 mois × 2,2 = 72 j)', sansMode.totalCongesAcquis === 72, sansMode.totalCongesAcquis);

console.log(ko ? `\n✗ ${ko} échec(s)\n` : '\n✓ Tout est vert.\n');
process.exit(ko ? 1 : 0);
