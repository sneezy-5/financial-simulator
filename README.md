# ONDA — Paie & RH (Côte d'Ivoire)

Deux produits construits sur la même base de code :

- **ONDA RH Pro** — logiciel de paie et RH pour PME et cabinets : bulletins, cycle de paie contrôlé et clôturé, journal d'audit, déclarations CNPS / ITS / FDFP / DISA, journal de paie SYSCOHADA, ordre de virement, provision pour congés.
- **Le simulateur** (`VITE_APP_MODE=simulator`) — gratuit et sans compte : bulletin expliqué ligne par ligne, net → brut, coût employeur, solde de tout compte, guides publics.

La feuille de route est dans [ROADMAP.md](ROADMAP.md), le déploiement dans [DEPLOY.md](DEPLOY.md).

## Démarrer

Toujours utiliser le runtime embarqué `./node.exe` (Node 20.17), pas le Node du système.

```bash
npm install                 # dépendances du front ; celles du serveur : cd server && npm install
npm run dev                 # front Vite (http://localhost:5173)
npm run server              # API Express (port défini dans server/.env, 3002 par défaut)
```

## Commandes utiles

| Commande | Rôle |
| --- | --- |
| `npm run test:paie` | Tests du moteur de paie CI (bulletins de référence vérifiés à la main) |
| `node tests/paie/declarations.test.cjs` | Déclarations ITS, FDFP, DISA, livre et récap annuels |
| `node tests/paie/cycle.test.cjs` | Cycle de paie, contrôles avant clôture, audit |
| `node tests/paie/compta.test.cjs` | Journal de paie, export Sage, virement, provision congés |
| `node tests/paie/explications.test.mjs` | Explications ligne par ligne du simulateur |
| `npm run moteur:sync` | Régénère `server/moteur/paieCI.cjs` après toute modification de `paieCI.mjs` |
| `npm run guides` | Régénère les pages `public/guides/` (`SITE_URL=…` ajoute sitemap et robots.txt) |
| `node scripts/apercu-bulletins.cjs [dossier]` | Un PDF par modèle de bulletin (`--empreinte f.json` : empreinte pour comparer avant / après une modification) |
| `node scripts/lister-routes.cjs` | Liste les routes de l'API et signale les doublons |
| `node server/scripts/auditTransport.js --detail` | Repère les bulletins anciens à vérifier (transport au-delà du plafond) |

## Architecture

```
server/
├── moteur/paieCI.mjs        Moteur de paie CI : SOURCE UNIQUE, lue par le simulateur (Vite)
├── moteur/paieCI.cjs        Copie CommonJS générée pour le serveur (npm run moteur:sync)
├── moteur/paieBenin.js      Moteurs Bénin et Togo
├── moteur/paieTogo.js
├── payrollService.js        Génération des bulletins (lot, individuel, solde de tout compte), instantanés
├── bulletins/               Un fichier par modèle de bulletin pdfmake + outils.js communs
├── declarations/            CNPS, ITS, FDFP, DISA, états annuels ; rendu PDF / Excel / CSV commun
├── compta/                  Plan comptable SYSCOHADA, journal de paie et OD, provision, virement
├── paie/                    Cycle de paie (statuts, contrôles) et journal d'audit
├── routes/                  Routeurs par domaine : auth, admin, paieGouvernance, rhDonnees, documents, ia
├── server.js                Démarrage, middlewares, génération de paie, téléchargements
└── database.js              Modèles Sequelize et migrations additives
src/
├── components/HRPayroll.vue          Espace RH (modules)
├── components/PayslipSimulator.vue   Bulletin, explications, net → brut
├── components/CoutEmployeurSimulator.vue
├── components/hr/                    Déclarations, cycle de paie, plan comptable…
└── services/calculators/index.js     Bénin / Togo ; la Côte d'Ivoire appelle le moteur partagé
tests/paie/                           Tests du moteur, des déclarations, du cycle et de la compta
scripts/                              Outils (synchro moteur, guides, aperçu bulletins, routes)
```

Règles à connaître :

- **Barèmes datés** : un taux qui change = une nouvelle version dans `BAREMES_CI` (`paieCI.mjs`) avec sa date d'effet, jamais une modification de l'ancienne.
- **Fiche / contrat** : la fiche dit qui est le salarié (situation, zone, banque), le contrat dit ce qu'il perçoit.
- **Historique figé** : chaque bulletin généré enregistre un instantané (`PayslipRecord`, dont `detailPaie`) ; un champ absent sur un ancien bulletin vaut `null`, jamais 0, et rend le document « partiel ».

## Auteur

Narcisse Adingra.
