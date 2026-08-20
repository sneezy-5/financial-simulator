const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');
const path = require('path');

const nodeVersion = 'v20.17.0';
const nodeUrl = `https://nodejs.org/dist/${nodeVersion}/win-x64/node.exe`;
const nodeExePath = path.join(__dirname, 'node.exe');

console.log(`[1/4] Téléchargement de Node.js (${nodeVersion}) pour l'encapsulation...`);

const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
};

async function build() {
    try {
        if (!fs.existsSync(nodeExePath)) {
            await downloadFile(nodeUrl, nodeExePath);
            console.log('✅ Node.js téléchargé avec succès.');
        } else {
            console.log('✅ Node.js déjà présent.');
        }

        console.log('[2/4] Compilation du frontend (SaaS)...');
        execSync('npm run build', { stdio: 'inherit' });

        console.log('[3/4] Compilation du frontend (Enterprise Site)...');
        execSync('npm run build --prefix enterprise-site', { stdio: 'inherit' });

        console.log('[4/4] Création de l\'exécutable ONDA-RH avec CAXA...');
        // CAXA embarque le dossier courant et lance node.exe sur server.js
        const caxaCmd = `npx caxa --input . --output dist/onda-rh.exe -- "{{caxa}}/node.exe" "{{caxa}}/server/server.js"`;
        execSync(caxaCmd, { stdio: 'inherit' });

        console.log('🎉 SUCCÈS ! L\'exécutable a été généré dans dist/onda-rh.exe');
    } catch (e) {
        console.error('❌ Erreur lors du build:', e.message);
        process.exit(1);
    }
}

build();
