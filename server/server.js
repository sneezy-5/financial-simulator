require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Visit, PayrollRequest } = require('./database');
const payrollService = require('./payrollService');
const aiService = require('./aiService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

const upload = multer({ dest: 'uploads/' });

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Route de santé pour le monitoring/débogage
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        nodeVersion: process.version
    });
});

app.get('/api/stats', async (req, res) => {
    try {
        const totalHits = await Visit.count();
        const totalVisits = await Visit.count({
            distinct: true,
            col: 'clientId'
        });
        const recentVisits = await Visit.findAll({
            limit: 50,
            order: [['createdAt', 'DESC']]
        });
        res.json({ totalHits, totalVisits, recentVisits });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Erreur DB" });
    }
});

app.post('/api/stats/visit', async (req, res) => {
    try {
        const { page, clientId } = req.body;
        
        // Extraction robuste de l'IP réelle (derrière proxy Nginx)
        let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
        if (ip && ip.includes('::ffff:')) ip = ip.split(':').pop();
        if (ip === '::1') ip = '127.0.0.1';

        // On enregistre l'action
        await Visit.create({
            ip: ip,
            userAgent: req.headers['user-agent'],
            page: page || 'home',
            clientId: clientId
        });

        // Nombre de visiteurs uniques (basé sur l'IP ou le ClientID)
        const totalVisits = await Visit.count({
            distinct: true,
            col: clientId ? 'clientId' : 'ip'
        });

        res.json({ success: true, visits: totalVisits });
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

// ─── Génération bulletin individuel (Simulateur manuel) ───────────────────
app.post('/api/rh/generate-single-payslip', async (req, res) => {
    try {
        const { employee } = req.body;
        if (!employee || !employee.nom) {
            return res.status(400).json({ error: 'Données employé manquantes' });
        }

        const calculs = payrollService.calculateSinglePayroll(employee);
        const companyInfo = {
            nom_entreprise: employee.nom_entreprise,
            adresse: employee.adresse,
            siege_social: employee.siege_social,
            email_entreprise: employee.email_entreprise,
            tel_entreprise: employee.tel_entreprise,
            numero_cnps: employee.numero_cnps,
            numero_contribuable: employee.numero_contribuable,
        };

        const pdfBuffer = await payrollService.generateSinglePdf(employee, calculs, companyInfo);

        const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const moisNom = moisNoms[parseInt(employee.mois || 1) - 1] || 'Mois';
        const entrepriseNom = (employee.nom_entreprise || 'ENTREPRISE').toUpperCase();
        const employeNom = (employee.nom || 'Salarie').toUpperCase();
        const fileName = `BULLETIN DE PAIE - ${entrepriseNom} - ${employeNom} - ${moisNom} ${employee.annee || ''}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Erreur génération bulletin individuel:', error);
        res.status(500).json({ error: error.message || 'Erreur lors de la génération' });
    }
});

// ─── Génération Solde de Tout Compte (PDF) ────────────────────────────────
app.post('/api/rh/generate-stc', async (req, res) => {
    try {
        const { employee, calculs } = req.body;
        if (!employee || !employee.nom) {
            return res.status(400).json({ error: 'Données employé manquantes' });
        }
        const pdfBuffer = await payrollService.generateStcPdf(employee, calculs);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="STC_${employee.nom}_${employee.prenom || ''}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Erreur génération STC:', error);
        res.status(500).json({ error: error.message || 'Erreur lors de la génération' });
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

// ═══════════════════════════════════════════════════════
// ROUTES IA - OpenRouter
// ═══════════════════════════════════════════════════════

/**
 * POST /api/ai/analyse
 * Analyse complète de la situation financière d'une entreprise
 */
app.post('/api/ai/analyse', async (req, res) => {
    try {
        const { entreprise, resultats, projections } = req.body;
        if (!entreprise || !entreprise.ca) {
            return res.status(400).json({ error: 'Données entreprise manquantes' });
        }
        const analyse = await aiService.analyserEntreprise({ entreprise, resultats, projections });
        res.json({ success: true, analyse });
    } catch (e) {
        console.error('Erreur IA analyse:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/ai/chat
 * Réponse à une question spécifique du chef d'entreprise
 */
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { question, contexte } = req.body;
        if (!question) {
            return res.status(400).json({ error: 'Question manquante' });
        }
        const reponse = await aiService.repondreQuestion(question, contexte || {});
        res.json({ success: true, reponse });
    } catch (e) {
        console.error('Erreur IA chat:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/ai/models
 * Retourne le modèle IA actuellement configuré
 */
app.get('/api/ai/models', (req, res) => {
    res.json({
        current: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
        available: [
            { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (Rapide)' },
            { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku (Équilibré)' },
            { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (OpenAI)' },
            { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Gratuit)' },
        ]
    });
});

// Gestion globale des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur Backend lancé sur le port ${PORT}`);
    console.log(`🔗 URL locale: http://localhost:${PORT}`);
    console.log(`🤖 IA OpenRouter: ${process.env.OPENROUTER_MODEL || 'non configuré (ajoutez .env)'}`);
});
