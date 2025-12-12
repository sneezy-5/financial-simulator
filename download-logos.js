const fs = require('fs');
const https = require('https');
const path = require('path');

const LOGOS = [
    { name: 'bni.png', url: 'https://upload.wikimedia.org/wikipedia/fr/5/52/Logo-BNI.png' },
    { name: 'sgci.png', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Soci%C3%A9t%C3%A9_G%C3%A9n%C3%A9rale.svg/1200px-Soci%C3%A9t%C3%A9_G%C3%A9n%C3%A9rale.svg.png' }, // Generic SG is safer/cleaner
    { name: 'nsia.png', url: 'https://upload.wikimedia.org/wikipedia/fr/5/5f/Nsia-logo.png' },
    { name: 'ecobank.png', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Ecobank_Logo.svg/1200px-Ecobank_Logo.svg.png' },
    { name: 'uba.png', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/United_Bank_for_Africa_logo.svg/1200px-United_Bank_for_Africa_logo.svg.png' },
    { name: 'bsic.png', url: 'https://www.bsic.ci/wp-content/uploads/2020/05/logo-bsic.png' },
    { name: 'bicici.png', url: 'https://www.bicici.com/sites/default/files/logo_bicici.png' },
    { name: 'sib.png', url: 'https://www.sib.ci/wp-content/uploads/2020/05/logo-sib.png' }
];

const OUTPUT_DIR = path.join(__dirname, 'src', 'assets', 'logos');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const downloadImage = (url, filename) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(path.join(OUTPUT_DIR, filename));
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: Status Code ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`Downloaded ${filename}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(path.join(OUTPUT_DIR, filename), () => { });
            reject(err);
        });
    });
};

async function downloadAll() {
    console.log('Starting downloads...');
    for (const logo of LOGOS) {
        try {
            await downloadImage(logo.url, logo.name);
        } catch (error) {
            console.error(`Error downloading ${logo.name}:`, error.message);
            // Fallback?
        }
    }
    console.log('All downloads finished.');
}

downloadAll();
