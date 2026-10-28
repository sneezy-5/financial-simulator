// Tests du cycle de paie (statuts, contrôles) et du calcul des différences d'audit.
//   node tests/paie/cycle.test.cjs

const path = require('path');
const racine = path.join(__dirname, '..', '..');
const cycle = require(path.join(racine, 'server', 'paie', 'cyclePaie.js'));

let ko = 0;
const ok = (label, cond, detail) => {
  if (!cond) ko++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + label + (!cond && detail !== undefined ? '  → ' + detail : ''));
};

console.log('\n▸ Transitions de statut');
ok('Brouillon → valider → Validée', cycle.transition('draft', 'valider').vers === 'validated');
ok('Validée → clôturer → Clôturée', cycle.transition('validated', 'cloturer').vers === 'closed');
ok('Brouillon → clôturer directement autorisé', cycle.transition('draft', 'cloturer').ok);
ok('Clôturée → valider refusé', !cycle.transition('closed', 'valider').ok);
ok('Clôturée → clôturer refusé', !cycle.transition('closed', 'cloturer').ok);
ok('Rouvrir sans motif refusé', !cycle.transition('closed', 'rouvrir').ok);
ok('Rouvrir avec motif trop court refusé', !cycle.transition('closed', 'rouvrir', { motif: 'oups' }).ok);
ok('Rouvrir avec motif → Brouillon', cycle.transition('closed', 'rouvrir', { motif: 'Erreur de prime de transport' }).vers === 'draft');
ok('Action inconnue refusée', !cycle.transition('draft', 'supprimer').ok);

console.log('\n▸ Contrôles d\'une période');
const periode = { mois: 10, annee: 2026 };
const r = (o) => ({ nom: 'X', prenom: 'Y', numeroCnps: 'C1', salaireBase: 200000, netAPayer: 180000, joursTravailles: 26, absencesJours: 0, ...o });
const propre = cycle.controlesPeriode({ records: [r({})], periode });
ok('Période propre : clôturable, aucune anomalie', propre.cloturable && propre.anomalies.length === 0, JSON.stringify(propre.anomalies));

const vide = cycle.controlesPeriode({ records: [], periode });
ok('Période vide : bloquante', !vide.cloturable && vide.anomalies[0].code === 'periode_vide');

const negatif = cycle.controlesPeriode({ records: [r({ netAPayer: -5000 })], periode });
ok('Net négatif : bloquant', !negatif.cloturable && negatif.anomalies.some(a => a.code === 'net_negatif'));

const doublon = cycle.controlesPeriode({ records: [r({}), r({})], periode });
ok('Même salarié deux fois : bloquant', !doublon.cloturable && doublon.anomalies.some(a => a.code === 'doublon'));

const alertes = cycle.controlesPeriode({ records: [r({ numeroCnps: '', matricule: 'M9', salaireBase: 60000, netAPayer: 55000 })], periode });
ok('Sans n° CNPS et sous le SMIG : alertes, mais clôturable', alertes.cloturable
  && alertes.anomalies.some(a => a.code === 'sans_cnps') && alertes.anomalies.some(a => a.code === 'sous_smig'));

const partiel = cycle.controlesPeriode({ records: [r({ salaireBase: 60000, joursTravailles: 20 })], periode });
ok('Sous le SMIG mais mois incomplet : pas d\'alerte SMIG', !partiel.anomalies.some(a => a.code === 'sous_smig'));

const precedents = [r({ netAPayer: 100000 }), r({ nom: 'PARTI', numeroCnps: 'C2' })];
const variation = cycle.controlesPeriode({ records: [r({ netAPayer: 150000 }), r({ nom: 'NOUVEAU', numeroCnps: 'C3' })], precedents, periode });
ok('Net +50 % vs M-1 : alerte', variation.anomalies.some(a => a.code === 'ecart_net' && /hausse de 50 %/.test(a.message)));
ok('Entrée et sortie signalées (info)', variation.anomalies.some(a => a.code === 'entree') && variation.anomalies.some(a => a.code === 'sortie'));
ok('Alertes et infos n\'empêchent pas la clôture', variation.cloturable);

console.log('\n▸ Différences pour le journal d\'audit');
// Charge audit.js sans base de données réelle : seule `differences` est testée.
const Module = require('module');
const charger = Module._load;
Module._load = function (req, parent) { return req === '../database' ? { AuditLog: {} } : charger.apply(this, arguments); };
const { differences } = require(path.join(racine, 'server', 'paie', 'audit.js'));
Module._load = charger;
const diff = differences(
  { salaireBase: 400000, nom: 'KONE', updatedAt: new Date(1), zoneTransport: null, companyLogo: 'data:image/png;base64,AAAA' },
  { salaireBase: 450000, nom: 'KONE', updatedAt: new Date(2), zoneTransport: '', companyLogo: 'data:image/png;base64,BBBB' }
);
ok('Champ modifié capturé avec avant / après', diff.salaireBase && diff.salaireBase.avant === 400000 && diff.salaireBase.apres === 450000);
ok('Champ inchangé, horodatage et null ↔ vide ignorés', !diff.nom && !diff.updatedAt && !diff.zoneTransport);
ok('Logo : changement noté sans recopier l\'image', diff.companyLogo && diff.companyLogo.apres === '(modifié)');
ok('400000 et « 400000 » considérés égaux', Object.keys(differences({ a: 400000 }, { a: '400000' })).length === 0);

console.log(ko ? `\n✗ ${ko} échec(s)\n` : '\n✓ Tout est vert.\n');
process.exit(ko ? 1 : 0);
