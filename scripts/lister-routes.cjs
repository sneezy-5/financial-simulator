// Liste les routes Express déclarées par server/server.js, dans l'ordre, sans
// démarrer le serveur ni toucher à la base : sert à vérifier qu'un découpage
// de server.js ne perd, n'ajoute ni ne réordonne aucune route.
//
//   node scripts/lister-routes.cjs            → la liste, puis les doublons
//   node scripts/lister-routes.cjs f.json     → la liste en JSON dans f.json
//
// Principe : on enregistre chaque app.get/post/put/patch/delete, puis on coupe
// court à server.listen(). La base n'est pas ouverte (DB_PATH vers un fichier
// temporaire jetable).

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const racine = path.join(__dirname, '..');
process.env.DB_PATH = path.join(os.tmpdir(), `lister-routes-${process.pid}.sqlite`);
const sortie = process.argv[2];
const routes = [];

const charger = Module._load;
Module._load = function (requete, parent, isMain) {
    const m = charger.apply(this, arguments);
    if (requete === 'express' && !m.__liste) {
        const app = m.application;
        for (const methode of ['get', 'post', 'put', 'patch', 'delete', 'all']) {
            const original = app[methode];
            app[methode] = function (chemin, ...reste) {
                // app.get('nom') sans handler = lecture d'un réglage, pas une route.
                if (reste.length) routes.push(`${methode.toUpperCase()} ${chemin}`);
                return original.call(this, chemin, ...reste);
            };
        }
        m.__liste = true;
    }
    if (requete === 'http' && !m.__liste) {
        const creer = m.createServer;
        m.createServer = (...args) => {
            const serveur = creer(...args);
            serveur.listen = () => { terminer(); return serveur; };
            return serveur;
        };
        m.__liste = true;
    }
    return m;
};

function terminer() {
    const vus = new Map();
    for (const r of routes) vus.set(r, (vus.get(r) || 0) + 1);
    const doublons = [...vus].filter(([, n]) => n > 1);
    if (sortie) fs.writeFileSync(sortie, JSON.stringify(routes, null, 1));
    else routes.forEach((r, i) => console.info(String(i + 1).padStart(3), r));
    console.info(`${routes.length} routes · ${doublons.length} déclarée(s) plusieurs fois${doublons.length ? ' : ' + doublons.map(([r, n]) => `${r} (×${n})`).join(', ') : ''}`);
    setTimeout(() => process.exit(0), 50);
}

console.log = () => {};
console.warn = () => {};
require(path.join(racine, 'server', 'server.js'));
