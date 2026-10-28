// Tests des explications ligne par ligne du simulateur (src/services/explicationsBulletin.js).
//   node tests/paie/explications.test.mjs
//
// Chaque explication doit retomber sur le montant affiché du bulletin.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const moteurUrl = pathToFileURL(path.join(racine, 'server', 'moteur', 'paieCI.mjs')).href
const { calculerBulletinCI } = await import(moteurUrl)

// Le paquet racine est en CommonJS : copie .mjs temporaire, import du moteur en absolu.
const source = fs.readFileSync(path.join(racine, 'src', 'services', 'explicationsBulletin.js'), 'utf8')
  .replace("'../../server/moteur/paieCI.mjs'", `'${moteurUrl}'`)
const copie = path.join(os.tmpdir(), `explicationsBulletin.${process.pid}.mjs`)
fs.writeFileSync(copie, source)
const { expliquerBulletin } = await import(pathToFileURL(copie).href)
process.on('exit', () => { try { fs.unlinkSync(copie) } catch {} })

let ko = 0
const ok = (label, cond, detail) => { if (!cond) ko++; console.log('  ' + (cond ? '✓' : '✗') + ' ' + label + (!cond && detail !== undefined ? '  → ' + JSON.stringify(detail) : '')) }
const nombres = (s) => (s.match(/\d[\d\s  ]*/g) || []).map(x => +x.replace(/[\s  ]/g, ''))

const emp = { mois: 10, annee: 2026, salaire_base: 400000, prime_transport: 50000, situation_matrimoniale: 'marie', nombre_enfants: 2, date_embauche: '2020-01-06', heures_sup_nb: 8, zone_transport: 'abidjan' }
const c = calculerBulletinCI(emp)
const lignes = expliquerBulletin(c, emp)
const ligne = (cle) => lignes.find(l => l.cle === cle)

console.log('\n▸ Montants des lignes = bulletin')
ok('Salaire, ancienneté, heures sup., transport, ITS, CNPS, CMU, net présents',
  ['salaire_base', 'anciennete', 'heures_sup', 'transport', 'brut_imposable', 'its', 'cnps', 'cmu', 'net', 'cout_employeur'].every(k => ligne(k)))
ok('Montant ITS = ITS du bulletin', ligne('its').montant === c.salarial.its)
ok('Montant net = net du bulletin', ligne('net').montant === c.netAPayer)
ok('Coût employeur = gains + charges patronales', ligne('cout_employeur').montant === c.gainsTotaux + c.patronal.grandTotal)
ok('Transport = exonéré + excédent (50 000)', ligne('transport').montant === 50000)

console.log('\n▸ Les étapes retombent sur le résultat')
const tranches = ligne('its').etapes.filter(e => e.startsWith('De ')).map(e => nombres(e.split('→')[1])[0])
const sommeTranches = tranches.reduce((a, b) => a + b, 0)
ok(`Somme des tranches (${sommeTranches}) − réduction (${c.salarial.ricf}) = ITS (${c.salarial.its})`, sommeTranches - c.salarial.ricf === c.salarial.its, tranches)
ok('Heures sup. : la somme des tranches = montant', ligne('heures_sup').etapes.slice(1).reduce((s, e) => s + nombres(e.split('=').pop())[0], 0) === c.montantHeuresSup)
ok('Ancienneté : 6 ans → 6 %', /6 ans de service → taux de 6 %/.test(ligne('anciennete').etapes[0]))
ok('Transport : excédent de 20 000 annoncé', /20\s000 imposés/.test(ligne('transport').etapes[1].replace(/[  ]/g, ' ')))
ok('CMU : 4 personnes × 500', /4 personne\(s\).*500/.test(ligne('cmu').etapes[0]))

console.log('\n▸ Cas simple')
const simple = expliquerBulletin(calculerBulletinCI({ mois: 10, annee: 2026, salaire_base: 75000, prime_transport: 30000 }), { mois: 10, annee: 2026, zone_transport: 'abidjan' })
ok('Pas de ligne ancienneté / heures sup. quand elles sont nulles', !simple.some(l => l.cle === 'anciennete' || l.cle === 'heures_sup'))
ok('Salaire au SMIG : ITS nul, une seule tranche à 0 %', simple.find(l => l.cle === 'its').montant === 0)

console.log(ko ? `\n✗ ${ko} échec(s)\n` : '\n✓ Tout est vert.\n')
process.exit(ko ? 1 : 0)
