const fs = require('fs');
const https = require('https');
const path = require('path');

// Utilisation de sources plus génériques et fiables (Clearbit, Google)
// Si le logo spécifique CI n'existe pas, on prend le logo global qui est souvent identique.
const LOGOS = [
    { name: 'bni.png', url: 'https://logo.clearbit.com/bni.ci' }, // BNI
    { name: 'sgci.png', url: 'https://logo.clearbit.com/societegenerale.com' }, // SG (Global)
    { name: 'nsia.png', url: 'https://logo.clearbit.com/groupensia.com' }, // NSIA
    { name: 'ecobank.png', url: 'https://logo.clearbit.com/ecobank.com' }, // Ecobank
    { name: 'uba.png', url: 'https://logo.clearbit.com/ubagroup.com' }, // UBA
    { name: 'bsic.png', url: 'https://logo.clearbit.com/bsicbank.com' }, // BSIC
    { name: 'bicici.png', url: 'https://logo.clearbit.com/bicici.com' }, // BICICI
    { name: 'sib.png', url: 'https://logo.clearbit.com/sib.ci' }, // SIB
    { name: 'boa.png', url: 'https://logo.clearbit.com/boabank.com' }, // BOA
    { name: 'bridge.png', url: 'https://logo.clearbit.com/bridgebankgroup.com' }, // Bridge
    { name: 'baci.png', url: 'https://logo.clearbit.com/banqueatlantique.net' }, // Banque Atlantique
    { name: 'bgfi.png', url: 'https://logo.clearbit.com/bgfibank.com' } // BGFI
];

const OUTPUT_DIR = path.join(__dirname, 'src', 'assets', 'logos');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const downloadImage = (url, filename) => {
    return new Promise((resolve) => {
        const file = fs.createWriteStream(path.join(OUTPUT_DIR, filename));

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };

        https.get(url, options, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log(`✅ Downloaded: ${filename}`);
                    resolve(true);
                });
            } else {
                console.log(`❌ Failed: ${filename} (Status: ${response.statusCode}) - URL: ${url}`);
                file.close();
                fs.unlink(path.join(OUTPUT_DIR, filename), () => { });
                resolve(false);
            }
        }).on('error', (err) => {
            console.error(`❌ Error: ${filename} - ${err.message}`);
            fs.unlink(path.join(OUTPUT_DIR, filename), () => { });
            resolve(false);
        });
    });
};

async function downloadAll() {
    console.log('🔄 Démarrage du téléchargement des logos...');
    for (const logo of LOGOS) {
        await downloadImage(logo.url, logo.name);
    }
    console.log('🏁 Terminé.');
}

downloadAll();
