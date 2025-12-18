const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Visit, PayrollRequest } = require('./database');
const payrollService = require('./payrollService');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

const upload = multer({ dest: 'uploads/' });

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

app.get('/api/stats', async (req, res) => {
    try {
        const totalVisits = await Visit.count();
        const recentVisits = await Visit.findAll({
            limit: 20,
            order: [['createdAt', 'DESC']]
        });
        res.json({ totalVisits, recentVisits });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Erreur DB" });
    }
});

app.post('/api/stats/visit', async (req, res) => {
    try {
        let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;

        if (ip && ip.indexOf(',') > -1) {
            ip = ip.split(',')[0].trim();
        }

        if (ip && ip.includes('::ffff:')) {
            ip = ip.split(':').pop();
        }

        const lastVisit = await Visit.findOne({
            where: { ip },
            order: [['createdAt', 'DESC']]
        });

        const oneHour = 60 * 60 * 1000;
        const now = new Date();
        const shouldCount = !lastVisit || (now - new Date(lastVisit.createdAt) > oneHour);

        if (shouldCount) {
            await Visit.create({
                ip: ip,
                userAgent: req.headers['user-agent']
            });
        }

        const count = await Visit.count();
        res.json({ success: true, visits: count, ignored: !shouldCount });
    } catch (e) {
        console.error("Erreur analytics:", e);
        res.json({ success: false });
    }
});

const cpUpload = upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'template', maxCount: 1 }
]);

app.post('/api/rh/generate-pay-slips', cpUpload, async (req, res) => {
    try {
        const dataFile = req.files['file'] ? req.files['file'][0] : null;
        const templateFile = req.files['template'] ? req.files['template'][0] : null;

        if (!dataFile) {
            return res.status(400).json({ error: "Aucun fichier Excel fourni" });
        }

        const payrollReq = await PayrollRequest.create({
            filename: dataFile.originalname,
            status: 'PROCESSING'
        });

        const zipFilename = `bulletins_${payrollReq.id}_${Date.now()}.zip`;
        const zipPath = path.join(__dirname, 'uploads', zipFilename);

        console.log(`🚀 Démarrage traitement RH pour: ${dataFile.originalname}`);

        const result = await payrollService.processPayrollFile(
            dataFile.path,
            zipPath,
            templateFile ? templateFile.path : null
        );

        await payrollReq.update({
            status: 'SUCCESS',
            employeeCount: result.count
        });

        console.log(`✅ ${result.count} bulletins (${result.type}) générés.`);

        res.json({
            success: true,
            message: `${result.count} bulletins générés (${result.type}) !`,
            jobId: payrollReq.id,
            zipUrl: `/api/rh/download/${zipFilename}`
        });

    } catch (error) {
        console.error("Erreur RH:", error);
        res.status(500).json({ error: error.message || "Erreur lors du traitement" });
    }
});

const scrapingService = require('./scrapingService');

app.post('/api/loans/scrape', async (req, res) => {
    try {
        const { bankId } = req.body;
        const results = await scrapingService.scrapBankData(bankId);
        res.json({ success: true, results });
    } catch (e) {
        console.error("Erreur scraping:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/rh/download/:filename', (req, res) => {
    const fileName = req.params.filename;
    if (fileName === 'modele-paie.xlsx') {
        const templatePath = path.join(__dirname, '../src/services/model/modele_paie_complet.xlsx');
        if (fs.existsSync(templatePath)) return res.download(templatePath, 'modele_paie_complet.xlsx');
    }

    const safeFileName = path.basename(fileName);
    const filePath = path.join(__dirname, 'uploads', safeFileName);

    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send("Fichier introuvable");
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur Backend (SQLite) lancé sur http://localhost:${PORT}`);
});
