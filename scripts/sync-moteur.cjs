// Génère server/moteur/paieCI.cjs (CommonJS, pour le serveur) à partir de
// server/moteur/paieCI.mjs (ESM, lu aussi par le simulateur via Vite).
//
//   node scripts/sync-moteur.cjs           → réécrit la copie
//   node scripts/sync-moteur.cjs --check   → code 1 si la copie n'est pas à jour
//
// Le serveur est en CommonJS et ne peut pas charger un module ESM de façon
// synchrone sous Node 20 : plutôt que deux moteurs écrits à la main (qui
// avaient fini par diverger), une seule source et une copie mécanique.

const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', 'server', 'moteur', 'paieCI.mjs');
const CIBLE = path.join(__dirname, '..', 'server', 'moteur', 'paieCI.cjs');

function convertir(source) {
  if (/^\s*import\s/m.test(source)) {
    throw new Error('paieCI.mjs ne doit contenir aucun import (moteur pur).');
  }
  const exportes = [];
  const corps = source.replace(/^export (const|function) ([A-Za-z0-9_]+)/gm, (_, nature, nom) => {
    exportes.push(nom);
    return `${nature} ${nom}`;
  });
  if (/^export\s/m.test(corps)) {
    throw new Error('Seuls les `export const` / `export function` en début de ligne sont pris en charge.');
  }
  return [
    '// FICHIER GÉNÉRÉ par scripts/sync-moteur.cjs à partir de paieCI.mjs — NE PAS MODIFIER.',
    "'use strict';",
    '',
    corps.trimEnd(),
    '',
    `module.exports = { ${exportes.join(', ')} };`,
    ''
  ].join('\n');
}

const attendu = convertir(fs.readFileSync(SOURCE, 'utf8'));

if (process.argv.includes('--check')) {
  const actuel = fs.existsSync(CIBLE) ? fs.readFileSync(CIBLE, 'utf8') : '';
  if (actuel !== attendu) {
    console.error('✗ server/moteur/paieCI.cjs n\'est plus à jour : lancer `node scripts/sync-moteur.cjs`.');
    process.exit(1);
  }
  console.log('✓ paieCI.cjs à jour');
} else {
  fs.writeFileSync(CIBLE, attendu);
  console.log('✓ server/moteur/paieCI.cjs régénéré');
}
