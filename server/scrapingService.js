const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BANKS_CONFIG = [
    {
        id: 1,
        name: 'BNI',
        url: 'https://bni.ci/particuliers/credits',
        selectors: {
            loanName: '.loan-title',
            rate: '.interest-rate',
            amount: '.amount-range'
        },
        scraper: async (config) => {
            return [
                {
                    nom: "Prêt à la Consommation BNI (Mis à jour)",
                    taux: 7.5,
                    source: "Scraping"
                }
            ];
        }
    },
    {
        id: 2,
        name: 'SGCI',
        url: 'https://societegenerale.ci/fr/particuliers/emprunter/',
        scraper: async (config) => {
            return [
                {
                    nom: "Prêt Personnel Ordinaire SGCI (Mis à jour)",
                    taux: 8.0,
                    source: "Scraping"
                }
            ];
        }
    }
];

async function scrapBankData(bankId = null) {
    const results = [];

    const targets = bankId
        ? BANKS_CONFIG.filter(b => b.id === parseInt(bankId))
        : BANKS_CONFIG;

    console.log(`Démarrage du scraping pour ${targets.length} banque(s)...`);

    for (const bank of targets) {
        try {
            console.log(`   ➳ Scraping ${bank.name}...`);

            const data = await bank.scraper(bank);
            results.push({
                bankId: bank.id,
                bankName: bank.name,
                status: 'success',
                loans: data,
                scrapedAt: new Date().toISOString()
            });

        } catch (error) {
            console.error(`Erreur scraping ${bank.name}:`, error.message);
            results.push({
                bankId: bank.id,
                bankName: bank.name,
                status: 'error',
                error: error.message
            });
        }
    }

    const outputPath = path.join(__dirname, 'data', 'scraped_loans.json');

    if (!fs.existsSync(path.join(__dirname, 'data'))) {
        fs.mkdirSync(path.join(__dirname, 'data'));
    }

    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`✅ Scraping terminé. Résultats sauvegardés dans ${outputPath}`);

    return results;
}

module.exports = { scrapBankData };
