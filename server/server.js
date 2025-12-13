const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Visit, PayrollRequest } = require('./database');
const payrollService = require('./payrollService'); // Import du service

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration Upload
const upload = multer({ dest: 'uploads/' });

// Assurer que le dossier uploads existe
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// ══════════════════════════════════════════════════════════════════════════
// ROUTES ANALYTICS (VIA SQLITE)
// ══════════════════════════════════════════════════════════════════════════

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
        const ip = req.ip || req.connection.remoteAddress;

        // Recherche de la dernière visite de cette IP
        const lastVisit = await Visit.findOne({
            where: { ip },
            order: [['createdAt', 'DESC']] // createdAt est ajouté automatiquement par Sequelize
        });

        // 1 Heure en millisecondes
        const oneHour = 60 * 60 * 1000;
        const now = new Date();
        const shouldCount = !lastVisit || (now - new Date(lastVisit.createdAt) > oneHour);

        if (shouldCount) {
            await Visit.create({
                ip: ip,
                userAgent: req.headers['user-agent']
            });
            // console.log(`📈 Nouvelle visite unique (IP: ${ip})`);
        } else {
            // console.log(`🔄 Visite récurrente ignorée (IP: ${ip})`);
        }

        const count = await Visit.count();
        res.json({ success: true, visits: count, ignored: !shouldCount });
    } catch (e) {
        console.error("Erreur analytics:", e);
        // On ne bloque pas le front en cas d'erreur analytics
        res.json({ success: false });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// ROUTES RH / PAIE
// ══════════════════════════════════════════════════════════════════════════

// Upload multiple : 'file' (Excel) et 'template' (Word, optionnel)
const cpUpload = upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'template', maxCount: 1 }
]);

app.post('/api/rh/generate-pay-slips', cpUpload, async (req, res) => {
    try {
        // req.files['file'][0] contient l'Excel
        const dataFile = req.files['file'] ? req.files['file'][0] : null;
        const templateFile = req.files['template'] ? req.files['template'][0] : null;

        if (!dataFile) {
            return res.status(400).json({ error: "Aucun fichier Excel fourni" });
        }

        // On enregistre la demande dans la DB
        const payrollReq = await PayrollRequest.create({
            filename: dataFile.originalname,
            status: 'PROCESSING'
        });

        const zipFilename = `bulletins_${payrollReq.id}_${Date.now()}.zip`;
        const zipPath = path.join(__dirname, 'uploads', zipFilename);

        console.log(`🚀 Démarrage traitement RH pour: ${dataFile.originalname}`);
        if (templateFile) {
            console.log(`📋 Utilisation du template: ${templateFile.originalname}`);
        }

        // Appel au service
        const result = await payrollService.processPayrollFile(
            dataFile.path,
            zipPath,
            templateFile ? templateFile.path : null
        );

        // Mise à jour DB
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
        res.status(500).json({ error: "Erreur lors du traitement" });
    }
});

// Route pour télécharger une ressource (ZIP ou Template)
app.get('/api/rh/download/:filename', (req, res) => {
    const fileName = req.params.filename;
    // Si on demande le template
    if (fileName === 'modele-paie.xlsx') {
        const templatePath = path.join(__dirname, '../src/services/model/modele_paie_complet.xlsx');
        if (fs.existsSync(templatePath)) return res.download(templatePath, 'modele_paie_complet.xlsx');
    }

    // Sinon, c'est un ZIP dans uploads/
    const safeFileName = path.basename(fileName);
    const filePath = path.join(__dirname, 'uploads', safeFileName);

    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send("Fichier introuvable");
    }
});

// Démarrage
app.listen(PORT, () => {
    console.log(`🚀 Serveur Backend (SQLite) lancé sur http://localhost:${PORT}`);
});
