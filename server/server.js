// Polyfill pour File dans les versions de Node.js qui ne l'ont pas en global (évite le crash "File is not defined" d'Axios)
if (typeof global.File === 'undefined') {
    global.File = require('buffer').File || class File {};
}

try {
    // Chemin explicite (server/.env), pas relatif au cwd du process : sinon,
    // lancer `node server.js` depuis un dossier différent (racine du dépôt vs
    // server/, PM2 vs Docker...) charge un fichier différent en silence. Même
    // fichier que celui déjà utilisé explicitement par aiService.js.
    require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
} catch (e) {
    // dotenv n'est pas nécessaire en production Electron
}
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

try {
    const srcImg = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\166aee7a-971c-472b-9579-0aac54a19666\\hr_testimonial_manager_1789050919760.jpg';
    const destPublic = path.join(__dirname, '..', 'public', 'temoignage-rh.jpg');
    const destEntPublic = path.join(__dirname, '..', 'enterprise-site', 'public', 'temoignage-rh.jpg');
    if (fs.existsSync(srcImg)) {
        fs.copyFileSync(srcImg, destPublic);
        if (fs.existsSync(path.dirname(destEntPublic))) fs.copyFileSync(srcImg, destEntPublic);
    }
    const srcVideo = path.join(__dirname, '..', 'public', 'onda-demo.mp4');
    const destEntVideo = path.join(__dirname, '..', 'enterprise-site', 'public', 'onda-demo.mp4');
    if (fs.existsSync(srcVideo) && fs.existsSync(path.dirname(destEntVideo))) {
        fs.copyFileSync(srcVideo, destEntVideo);
    }
} catch (e) {
    console.warn('Asset copy note:', e.message);
}

const crypto = require('crypto');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const { Sequelize } = require('sequelize');
const { AuditLog, Visit, PayrollRequest, User, AdminUser, SubscriptionPlan, BankLoan, Transaction, Invoice, License, PayrollPeriod, PayslipRecord, Employee, Absence, Formation, Evaluation, Template, LocalSettings } = require('./database');
const payrollService = require('./payrollService');
const aiService = require('./aiService');
const templateEngine = require('./templateEngine');
const docEngine = require('./docengine');
const { irToCanvasLayout } = require('./docengine/toCanvasLayout');
const { createAiDetector } = require('./docengine/detect/aiDetect');
const { createProseAiDetector } = require('./docengine/detect/proseAi');
const { checkConformity } = require('./docengine/conformity');
const { extraireOffice } = require('./docengine/office/officeExtract');
const { analyserModele } = require('./docengine/office/officeAnalyse');
const { poserVariables, remplir: remplirOffice } = require('./docengine/office/officeRemplir');
const { listerTypes: listerTypesDocuments } = require('./docengine/office/typesDocuments');
const { construireClasseur } = require('./import/classeurModele');
const { lireClasseur } = require('./import/classeurLecture');
const { genererDeclaration, TYPES_ANNUELS } = require('./declarations');
const { journaliser, differences } = require('./paie/audit');
const cyclePaie = require('./paie/cyclePaie');

// Le moteur ne connaît aucun fournisseur d'IA : on lui injecte le nôtre. L'IA
// n'intervient que sur les fragments que le lexique métier n'a pas su nommer,
// et chacune de ses réponses est vérifiée contre le texte réellement extrait.
const askModel = (maxTokens) => async (prompt) =>
    aiService.callOpenRouter([{ role: 'user', content: prompt }], { maxTokens, temperature: 0 });

docEngine.registerDetector(createAiDetector(askModel(1500)));

// Sur un document RÉDIGÉ, la structure ne porte aucun sens : « je soussigné »
// désigne l'employeur dans une attestation et le salarié dans une demande de
// congés. Aucun motif ne peut trancher, seule la lecture du document le peut.
// Le modèle propose des portions de texte ; chacune doit exister telle quelle
// dans le texte extrait du PDF pour être retenue.
docEngine.registerDetector(createProseAiDetector(askModel(1200)));
const emailService = require('./emailService');
const billingService = require('./billingService');
const invoiceService = require('./invoiceService');
const licenseService = require('./licenseService');
const XLSX = require('xlsx');

let bcrypt, jwt;
try {
    bcrypt = require('bcrypt');
    jwt = require('jsonwebtoken');
} catch (e) {
    console.warn("⚠️ bcrypt ou jsonwebtoken non installé. Exécutez : npm install bcrypt jsonwebtoken");
}

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-onda-key';

// Instance « simulateur » : publique, sans compte. VITE_APP_MODE est déjà
// injectée dans le conteneur (voir deploy/stack.yml) ; APP_MODE la remplace si
// définie. Ici aucune inscription n'est possible et le bulletin individuel se
// génère sans connexion — la création de compte se fait uniquement sur l'instance Pro.
const IS_SIMULATOR = (process.env.APP_MODE || process.env.VITE_APP_MODE) === 'simulator';

const app = express();
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ 
    limit: '50mb',
    verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/api/billing/paystack/webhook')) {
            req.rawBody = buf.toString();
        }
    }
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.set('trust proxy', true);

// Servir les fichiers statiques du frontend (générés par vite build)
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
}

// Crée le serveur HTTP et attache Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Middleware d'authentification Socket.IO (JWT)
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    return next();
  } catch (e) {
    return next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const room = `user_${socket.userId}`;
  socket.join(room);
  console.log(`⚡ Socket connecté pour l'utilisateur ${socket.userId}`);
});

const UPLOADS_DIR = process.env.UPLOADS_PATH || 'uploads/';
const upload = multer({ dest: UPLOADS_DIR });

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Middleware d'authentification
const authMiddleware = async (req, res, next) => {
    if (!jwt) return res.status(500).json({ error: "Service indisponible (jwt manquant)" });

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Non autorisé, token manquant" });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findByPk(decoded.id);
        if (!user) return res.status(401).json({ error: "Utilisateur non trouvé" });
        if (user.isBlocked) return res.status(403).json({ error: "Votre compte a été suspendu. Veuillez contacter le support." });
        req.user = decoded; // { id, email, role }
        next();
    } catch (e) {
        return res.status(401).json({ error: "Token invalide ou expiré" });
    }
};

// Limiteur minimal en mémoire, par IP (une seule instance du serveur : pas de
// stockage partagé). Réservé aux routes publiques qui lancent un rendu PDF.
const makeRateLimiter = ({ windowMs, max }) => {
    const hits = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [ip, h] of hits) if (h.resetAt <= now) hits.delete(ip);
    }, windowMs).unref();
    return (req, res, next) => {
        const now = Date.now();
        let h = hits.get(req.ip);
        if (!h || h.resetAt <= now) {
            h = { count: 0, resetAt: now + windowMs };
            hits.set(req.ip, h);
        }
        if (++h.count > max) {
            res.setHeader('Retry-After', Math.ceil((h.resetAt - now) / 1000));
            return res.status(429).json({ error: "Trop de générations en peu de temps. Réessayez dans quelques minutes." });
        }
        next();
    };
};

// Bulletin individuel : sur l'instance simulateur, une requête sans jeton passe
// (avec limitation de débit) ; avec un jeton, ou sur l'instance Pro, l'auth
// habituelle s'applique.
const payslipRateLimit = makeRateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });
const singlePayslipAuth = (req, res, next) => {
    if (IS_SIMULATOR && !req.headers.authorization) return payslipRateLimit(req, res, next);
    return authMiddleware(req, res, next);
};

/**
 * Portail commun aux routes qui appellent un modèle IA (coût réel par appel).
 * Binaire : abonnement Pro (ou supérieur) actif = accès illimité ; sinon,
 * chaque appel consomme une unité de l'allocation gratuite mensuelle (même
 * pool que la génération groupée de bulletins). Pas de crédits à acheter à la
 * pièce — c'est l'abonnement Pro qui donne accès, rien d'autre.
 *
 * Doit être appelé après authMiddleware (a besoin de req.user.id). Renvoie
 * l'utilisateur si l'accès est accordé (et décrémente déjà l'unité gratuite le
 * cas échéant), ou envoie directement la réponse 402 et renvoie null.
 */
async function gateAiAccess(req, res) {
    const userObj = await User.findByPk(req.user.id);
    if (!userObj) {
        res.status(404).json({ error: "Utilisateur non trouvé" });
        return null;
    }
    await billingService.ensureFreeMonthlyPeriod(userObj);
    const access = billingService.checkAiAccess(userObj);
    if (!access.ok) {
        res.status(402).json({ error: billingService.quotaErrorMessage(access.reason), reason: access.reason });
        return null;
    }
    if (access.useFreeMonthly) {
        userObj.freeMonthlyUsed = (userObj.freeMonthlyUsed || 0) + 1;
        await userObj.save();
    }
    return userObj;
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

// Réservé aux administrateurs : la route renvoie les dernières visites avec IP
// et navigateur (elle était publique). adminMiddleware est défini plus bas,
// d'où l'appel différé au moment de la requête.
app.get('/api/stats', (req, res, next) => adminMiddleware(req, res, next), async (req, res) => {
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
        const { page, clientId, country } = req.body;

        // Extraction robuste de l'IP réelle (derrière proxy Nginx)
        let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
        if (ip && ip.includes('::ffff:')) ip = ip.split(':').pop();
        if (ip === '::1') ip = '127.0.0.1';

        // On enregistre l'action avec le pays
        await Visit.create({
            ip: ip,
            userAgent: req.headers['user-agent'],
            page: page || 'home',
            country: country || 'CI',
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

// ─── Entonnoir simulateur → Pro ────────────────────────────────────────────────
// Événements anonymes (aucun montant, aucune donnée de paie), rangés dans la
// table des visites sous « evt:<nom>[:<source>] » pour réutiliser le stockage.
const EVENEMENTS_ENTONNOIR = ['simulation', 'pdf_simulateur', 'net_vers_brut', 'partage', 'explication', 'cout_employeur', 'guide_vu', 'clic_pro'];
app.post('/api/stats/evenement', async (req, res) => {
    try {
        const { evenement, clientId, source } = req.body || {};
        if (!EVENEMENTS_ENTONNOIR.includes(evenement)) return res.status(400).json({ success: false });
        const suffixe = source ? ':' + String(source).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) : '';
        await Visit.create({
            page: `evt:${evenement}${suffixe}`,
            clientId: clientId ? String(clientId).slice(0, 40) : null,
            userAgent: (req.headers['user-agent'] || '').slice(0, 250),
            country: 'CI'
        });
        res.json({ success: true });
    } catch (e) {
        console.error('Erreur entonnoir :', e.message);
        res.json({ success: false });
    }
});

// Routes « auth » : server/routes/auth.js
require('./routes/auth')(app, { IS_SIMULATOR, JWT_SECRET, License, Sequelize, User, authMiddleware, bcrypt, billingService, differences, emailService, journaliser, jwt });

app.post('/api/billing/verify-paystack', authMiddleware, async (req, res) => {
    try {
        const { reference } = req.body;
        const userId = req.user.id;

        if (!reference) return res.status(400).json({ error: "Référence Paystack manquante." });

        // Vérifier si la transaction existe déjà
        const existingTx = await Transaction.findOne({ where: { reference } });
        if (existingTx && existingTx.status === 'success') {
            return res.status(400).json({ error: "Transaction déjà traitée." });
        }

        // Appel à l'API Paystack pour vérifier
        const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
        if (!paystackSecret) return res.status(500).json({ error: "Clé secrète Paystack non configurée côté serveur." });

        const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${paystackSecret}`
            }
        });
        const verifyData = await verifyRes.json();

        if (verifyData.status && verifyData.data.status === 'success') {
            // Le montant retourné par Paystack est en FCFA, car XOF est une devise sans décimales.
            const paystackAmount = verifyData.data.amount;

            // Le palier accordé est TOUJOURS dérivé du montant confirmé par Paystack,
            // jamais d'une valeur envoyée par le client.
            const plan = await billingService.resolvePlanByAmount(paystackAmount);
            if (!plan) {
                if (!existingTx) {
                    await Transaction.create({ reference, amount: paystackAmount, credits: 0, status: 'failed', userId });
                }
                return res.status(400).json({ error: "Montant payé ne correspond à aucune offre d'abonnement active." });
            }

            // Enregistrer ou mettre à jour la transaction
            if (existingTx) {
                existingTx.status = 'success';
                existingTx.amount = paystackAmount;
                existingTx.subscriptionTier = plan.code;
                await existingTx.save();
            } else {
                await Transaction.create({
                    reference,
                    amount: paystackAmount,
                    credits: 0,
                    subscriptionTier: plan.code,
                    status: 'success',
                    userId
                });
            }

            const user = await billingService.grantSubscription(userId, plan);
            const snapshot = billingService.getSubscriptionSnapshot(user, plan);
            const message = `Abonnement ${plan.name} activé pour ${plan.billingCycle === 'annual' ? '12 mois' : '30 jours'} !`;

            // Génération + envoi de la facture (non-bloquant)
            invoiceService.createInvoiceForPayment({ userId, user, plan, amount: paystackAmount, reference })
                .then(invoice => emailService.sendInvoiceEmail(user.email, {
                    invoiceNumber: invoice.invoiceNumber,
                    pdfPath: invoice.pdfPath,
                    planName: plan.name,
                    amount: paystackAmount
                }))
                .catch(err => console.error('❌ Erreur génération/envoi facture:', err));

            // Émettre l'événement de notification en temps réel
            io.to(`user_${userId}`).emit('payment_success', { ...snapshot, message });

            return res.json({ success: true, ...snapshot, message });
        } else {
            // Transaction échouée ou invalide
            if (!existingTx) {
                 await Transaction.create({
                    reference,
                    amount: verifyData?.data?.amount || 0,
                    credits: 0,
                    status: 'failed',
                    userId
                });
            }
            return res.status(400).json({ error: "Paiement échoué ou non validé par Paystack." });
        }
    } catch (e) {
        console.error("Paystack verification error:", e);
        res.status(500).json({ error: "Erreur lors de la vérification du paiement." });
    }
});

// ==========================================
// WEBHOOK PAYSTACK (Confirmation server-to-server)
// ==========================================

// IMPORTANT : Ce webhook doit recevoir le body brut (raw) pour valider la signature HMAC
app.post('/api/billing/paystack/webhook', async (req, res) => {
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
        console.error('❌ Webhook: PAYSTACK_WEBHOOK_SECRET non configuré');
        return res.sendStatus(500);
    }

    // req.rawBody est défini par le middleware express.json
    const payload = req.rawBody || JSON.stringify(req.body);

    // Valider la signature Paystack
    const hash = crypto.createHmac('sha512', secret)
        .update(payload)
        .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
        console.warn('⚠️ Webhook Paystack: signature invalide');
        return res.sendStatus(400);
    }

    let event = req.body;
    try {
        // Optionnel : on s'assure que event est bien un objet
        if (typeof event === 'string') {
            event = JSON.parse(event);
        }
    } catch (e) {
        console.error('❌ Webhook Paystack: JSON invalide', e.message);
        return res.sendStatus(400);
    }

    // Répondre immédiatement à Paystack (< 5 secondes)
    res.sendStatus(200);

    // Traitement asynchrone de l'événement
    try {
        if (event.event === 'charge.success') {
            const data = event.data;
            const reference = data.reference;
            const amountPaid = data.amount; // en centimes/unités Paystack
            const chargeMetadata = data.metadata || {};

            // Achat de licence entreprise en libre-service (site enterprise-site, pas de compte SaaS)
            if (chargeMetadata.type === 'license') {
                const { companyName, contactEmail } = chargeMetadata;
                if (!companyName || !contactEmail) {
                    console.warn(`⚠️ Webhook licence: métadonnées manquantes pour ${reference}`);
                    return;
                }
                const result = await licenseService.createLicenseFromPayment({ reference, amountPaid, companyName, contactEmail });
                if (result.alreadyProcessed) {
                    console.log(`ℹ️ Webhook: licence déjà créée pour la référence ${reference}, ignorée.`);
                    return;
                }
                if (!result.ok) {
                    console.warn(`⚠️ Webhook licence: montant ${amountPaid} ne correspond pas au prix attendu (ref: ${reference})`);
                    return;
                }
                console.log(`✅ Webhook: licence entreprise créée pour ${companyName} (ref: ${reference})`);
                emailService.sendLicenseKeyEmail(contactEmail, { licenseKey: result.license.licenseKey, companyName })
                    .catch(err => console.error('❌ Erreur envoi clé de licence (webhook):', err));
                return;
            }

            // Éviter le double traitement
            const existingTx = await Transaction.findOne({ where: { reference } });
            if (existingTx && existingTx.status === 'success') {
                console.log(`ℹ️ Webhook: Transaction ${reference} déjà traitée, ignorée.`);
                return;
            }

            // Extraire les métadonnées (userId envoyé depuis le client ; planCode informatif uniquement)
            const metadata = data.metadata || {};
            const userId = metadata.userId || (data.customer && data.customer.metadata && data.customer.metadata.userId);

            if (!userId) {
                console.warn(`⚠️ Webhook: userId manquant dans les métadonnées pour ${reference}`);
                return;
            }

            // Le palier accordé est TOUJOURS dérivé du montant confirmé par Paystack,
            // jamais des métadonnées client.
            const plan = await billingService.resolvePlanByAmount(amountPaid);
            if (!plan) {
                console.warn(`⚠️ Webhook: montant ${amountPaid} ne correspond à aucune offre d'abonnement active (ref: ${reference})`);
                return;
            }

            // Enregistrer ou mettre à jour la transaction
            if (existingTx) {
                existingTx.status = 'success';
                existingTx.amount = amountPaid;
                existingTx.subscriptionTier = plan.code;
                await existingTx.save();
            } else {
                await Transaction.create({
                    reference,
                    amount: amountPaid,
                    credits: 0,
                    subscriptionTier: plan.code,
                    status: 'success',
                    userId
                });
            }

            // Activer l'abonnement de l'utilisateur
            const user = await billingService.grantSubscription(userId, plan);
            if (user) {
                console.log(`✅ Webhook: abonnement ${plan.name} activé pour l'utilisateur ${userId} (ref: ${reference})`);

                // Génération + envoi de la facture (non-bloquant)
                invoiceService.createInvoiceForPayment({ userId, user, plan, amount: amountPaid, reference })
                    .then(invoice => emailService.sendInvoiceEmail(user.email, {
                        invoiceNumber: invoice.invoiceNumber,
                        pdfPath: invoice.pdfPath,
                        planName: plan.name,
                        amount: amountPaid
                    }))
                    .catch(err => console.error('❌ Erreur génération/envoi facture (webhook):', err));

                // Notification temps réel via Socket.IO
                const snapshot = billingService.getSubscriptionSnapshot(user, plan);
                io.to(`user_${userId}`).emit('payment_success', {
                    ...snapshot,
                    reference,
                    message: `Abonnement ${plan.name} activé via webhook Paystack !`
                });
            } else {
                console.warn(`⚠️ Webhook: Utilisateur ${userId} introuvable`);
            }
        }
    } catch (err) {
        console.error('❌ Erreur traitement webhook Paystack:', err);
    }
});

// ==========================================
// ROUTES ADMIN (GESTION CRUD, AUTH & ANALYTICS)
// ==========================================

const adminAuthMiddleware = async (req, res, next) => {
    if (!jwt) return res.status(500).json({ error: "Service indisponible (jwt manquant)" });

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Accès non autorisé, token admin manquant" });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.scope !== 'admin') {
            return res.status(403).json({ error: "Accès réservé exclusivement aux administrateurs" });
        }
        const admin = await AdminUser.findByPk(decoded.id);
        if (!admin) return res.status(401).json({ error: "Compte Administrateur introuvable" });
        req.admin = admin;
        next();
    } catch (e) {
        return res.status(401).json({ error: "Session Admin invalide ou expirée" });
    }
};
// Alias historique, utilisé aussi par /api/stats plus haut (appel différé).
const adminMiddleware = adminAuthMiddleware;

/** Data URL ou base64 nu → Buffer (modèles PDF ici, documents Office dans routes/documents.js). */
function decodeDataUrl(value) {
    const comma = value.indexOf(',');
    const payload = value.startsWith('data:') && comma > 0 ? value.slice(comma + 1) : value;
    return Buffer.from(payload, 'base64');
}

// Routes « admin » : server/routes/admin.js
require('./routes/admin')(app, { AdminUser, BankLoan, Invoice, JWT_SECRET, License, PayrollPeriod, PayslipRecord, Sequelize, SubscriptionPlan, Transaction, User, Visit, adminAuthMiddleware, bcrypt, billingService, jwt, licenseService });

// ==========================================
// ROUTES PUBLIQUES DES FORMULES D'ABONNEMENT
// ==========================================

// GET /api/billing/plans - Liste des formules d'abonnement actives pour les clients
app.get('/api/billing/plans', async (req, res) => {
    try {
        const plans = await billingService.getActivePlans();
        res.json({ success: true, plans });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/billing/plans :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// GET /api/billing/invoices - Factures de l'utilisateur connecté
app.get('/api/billing/invoices', authMiddleware, async (req, res) => {
    try {
        const invoices = await Invoice.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']]
        });
        res.json({ success: true, invoices });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/billing/invoices :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// GET /api/billing/invoices/:id/download - Télécharger le PDF d'une facture (propriétaire uniquement)
app.get('/api/billing/invoices/:id/download', authMiddleware, async (req, res) => {
    try {
        const invoice = await Invoice.findByPk(req.params.id);
        if (!invoice || invoice.userId !== req.user.id) {
            return res.status(404).json({ error: "Facture introuvable" });
        }
        
        const filename = (invoice.pdfPath ? path.basename(invoice.pdfPath) : invoice.invoiceNumber) 
            || `ONDA-${new Date(invoice.createdAt).getFullYear()}-${String(invoice.id).padStart(6, '0')}`;
            
        let actualPdfPath = path.join(__dirname, 'uploads', 'invoices', filename.endsWith('.pdf') ? filename : `${filename}.pdf`);

        if (!fs.existsSync(actualPdfPath)) {
            // Tentative de regénération du PDF si le fichier a été perdu ou non généré
            const user = await User.findByPk(invoice.userId);
            const plan = await SubscriptionPlan.findOne({ where: { code: invoice.subscriptionTier } });
            
            if (user && plan) {
                try {
                    actualPdfPath = await invoiceService.regenerateInvoicePdf(invoice, user, plan);
                } catch (e) {
                    console.error("Échec de la regénération de la facture:", e);
                    return res.status(404).json({ error: "Fichier de facture introuvable et regénération impossible." });
                }
            } else {
                return res.status(404).json({ error: "Fichier de facture introuvable." });
            }
        }
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(actualPdfPath)}"`);
        fs.createReadStream(actualPdfPath).pipe(res);
    } catch (e) {
        console.error('❌ Erreur sur GET /api/billing/invoices/:id/download :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// ==========================================
// LICENCES ENTREPRISE (Édition installable)
// ==========================================

// ============================================================================
// ROUTES LOCAL DESKTOP LICENSE (OFFLINE)
// ============================================================================

// GET /api/local-license/status - Vérifie si une licence est enregistrée localement
app.get('/api/local-license/status', async (req, res) => {
    try {
        const setting = await LocalSettings.findOne({ where: { key: 'desktop_license_key' } });
        if (!setting || !setting.value) {
            return res.json({ activated: false });
        }
        
        // Vérifier si la clé existe dans la table globale (simulation d'une clé valide)
        const license = await License.findOne({ where: { licenseKey: setting.value, status: 'active' } });
        if (license || setting.value === 'ONDA-DESKTOP-ADMIN-2026') {
            return res.json({ activated: true, license: setting.value, plan: license ? license.planType : 'enterprise' });
        } else {
            return res.json({ activated: false });
        }
    } catch (err) {
        console.error('Erreur status licence locale:', err);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// POST /api/local-license/verify - Valide et enregistre une clé localement
app.post('/api/local-license/verify', async (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'Clé requise.' });

    try {
        // En vrai mode hors-ligne absolu, on devrait avoir une logique de vérification cryptographique de la clé.
        // Ici on suppose que la BDD SQLite locale a été livrée avec la table 'Licenses' pré-remplie par nous, 
        // ou on autorise un format spécifique de clé magique pour le client.
        const license = await License.findOne({ where: { licenseKey: key } });
        
        if (!license || license.status !== 'active') {
            // Check backdoor pour le dev/demo
            if (key !== 'ONDA-DESKTOP-ADMIN-2026') {
                return res.status(400).json({ error: 'Clé de licence invalide ou expirée.' });
            }
        }

        // Sauvegarder dans les paramètres locaux
        await LocalSettings.upsert({
            key: 'desktop_license_key',
            value: key
        });

        res.json({ success: true, message: 'Licence activée avec succès pour ce poste.' });
    } catch (err) {
        console.error('Erreur verify licence locale:', err);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// POST /api/licenses/activate - Active une licence sur une installation (première utilisation)
app.post('/api/licenses/activate', async (req, res) => {
    try {
        const { licenseKey, installationId } = req.body;
        const result = await licenseService.activateLicense(licenseKey, installationId);
        if (!result.ok) return res.status(400).json({ error: result.message, reason: result.reason });
        res.json({ success: true, token: result.token, expiresAt: result.expiresAt });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/licenses/activate :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// POST /api/licenses/verify - Revérification périodique d'une licence déjà activée
app.post('/api/licenses/verify', async (req, res) => {
    try {
        const { licenseKey, installationId } = req.body;
        const result = await licenseService.verifyLicense(licenseKey, installationId);
        if (!result.ok) return res.status(400).json({ error: result.message, reason: result.reason });
        res.json({ success: true, token: result.token, expiresAt: result.expiresAt });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/licenses/verify :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// POST /api/enterprise/licenses/verify-paystack - Achat en libre-service d'une licence entreprise
// (aucune auth : le site enterprise-site est déployé séparément, sans compte SaaS)
app.post('/api/enterprise/licenses/verify-paystack', async (req, res) => {
    try {
        const { reference, companyName, contactEmail } = req.body;
        if (!reference || !companyName || !contactEmail) {
            return res.status(400).json({ error: "Référence de paiement, nom de l'entreprise et email requis." });
        }

        const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
        if (!paystackSecret) return res.status(500).json({ error: "Clé secrète Paystack non configurée côté serveur." });

        const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${paystackSecret}` }
        });
        const verifyData = await verifyRes.json();

        if (!(verifyData.status && verifyData.data.status === 'success')) {
            return res.status(400).json({ error: "Paiement échoué ou non validé par Paystack." });
        }

        const result = await licenseService.createLicenseFromPayment({
            reference,
            amountPaid: verifyData.data.amount,
            companyName,
            contactEmail
        });

        if (result.alreadyProcessed) {
            return res.json({ success: true, licenseKey: result.license.licenseKey, message: "Licence déjà activée pour ce paiement." });
        }
        if (!result.ok) {
            return res.status(400).json({ error: "Montant payé ne correspond pas au prix de la licence entreprise." });
        }

        emailService.sendLicenseKeyEmail(contactEmail, { licenseKey: result.license.licenseKey, companyName })
            .catch(err => console.error('❌ Erreur envoi clé de licence:', err));

        res.json({ success: true, licenseKey: result.license.licenseKey, message: "Licence activée ! Votre clé a également été envoyée par email." });
    } catch (e) {
        console.error('Erreur achat licence entreprise:', e);
        res.status(500).json({ error: "Erreur lors de la vérification du paiement." });
    }
});

// ==========================================
// ROUTES DES PRÊTS BANCAIRES (SIMULATION CRUD)
// ==========================================

// GET /api/bank-loans - Obtenir les offres de prêt actives (Client / Simulateur)
app.get('/api/bank-loans', async (req, res) => {
    try {
        const { country, bankName } = req.query;
        const whereClause = { active: true };
        if (country) whereClause.country = country;
        if (bankName) whereClause.bankName = bankName;

        const loans = await BankLoan.findAll({
            where: whereClause,
            order: [['bankName', 'ASC'], ['interestRate', 'ASC']]
        });
        res.json({ success: true, loans });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/bank-loans :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// ==========================================
// ROUTES RH (Extraction & PDF)
// ==========================================

// Réservé au module RH (annuaire/contrats/saisie mensuelle) — jamais utilisé
// par les simulateurs publics (bulletin, congés, STC), qui n'exigent pas de
// compte. Voir HRPayroll.vue : ces modules sont exclus de la liste autorisée
// en VITE_APP_MODE=simulator.
app.post('/api/rh/extract-headers', authMiddleware, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Aucun fichier fourni" });
        }

        const workbook = XLSX.readFile(req.file.path);

        const requestedSheet = req.body.sheetName;
        let sheetName = (requestedSheet && workbook.SheetNames.includes(requestedSheet))
            ? requestedSheet
            : (workbook.SheetNames.find(n =>
                n.toUpperCase() === 'EMPLOYES' || n.toUpperCase() === 'EMPLOYÉS'
            ) || workbook.SheetNames[0]);

        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            return res.status(400).json({ error: "Feuille introuvable" });
        }

        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (!data || data.length === 0) {
            return res.status(400).json({ error: "Fichier vide" });
        }

        const headers = data[0].filter(h => h && typeof h === 'string' && h.trim() !== '');

        // Nettoyage du fichier temporaire si souhaité, mais on le garde pour plus tard ?
        // Non, on forcera le frontend à renvoyer le fichier au final, c'est plus simple.
        fs.unlinkSync(req.file.path);

        res.json({ success: true, headers, sheetNames: workbook.SheetNames, selectedSheet: sheetName });
    } catch (error) {
        console.error("Erreur extraction en-têtes:", error);
        res.status(500).json({ error: "Erreur de lecture du fichier" });
    }
});

/**
 * POST /api/rh/import/classeur
 *
 * Lit le classeur unique et rend ses trois volets separes. Rien n'est
 * enregistre ici : le client decide quoi conserver, et voit d'abord ce qui
 * a ete compris.
 */
app.post('/api/rh/import/classeur', authMiddleware, upload.single('file'), (req, res) => {
    let chemin = null;
    try {
        if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni.' });
        chemin = req.file.path;
        const classeur = XLSX.readFile(chemin, { cellDates: true });
        const lu = lireClasseur(XLSX, classeur);

        if (!lu.feuillesLues.length) {
            return res.status(400).json({
                error: "Aucune feuille reconnue. Le classeur doit contenir au moins une feuille ENTREPRISE, EMPLOYES ou CONTRATS.",
                feuillesTrouvees: classeur.SheetNames
            });
        }

        res.json({ success: true, ...lu });
    } catch (e) {
        console.error('Lecture du classeur :', e.message);
        res.status(400).json({ error: "Requête invalide." });
    } finally {
        if (chemin && fs.existsSync(chemin)) fs.unlinkSync(chemin);
    }
});

app.post('/api/rh/extract-data', authMiddleware, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Aucun fichier fourni" });
        }

        const workbook = XLSX.readFile(req.file.path);

        let sheetName = workbook.SheetNames.find(n =>
            n.toUpperCase() === 'EMPLOYES' || n.toUpperCase() === 'EMPLOYÉS'
        ) || workbook.SheetNames[0];

        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            return res.status(400).json({ error: "Feuille introuvable" });
        }

        const data = XLSX.utils.sheet_to_json(sheet, { defval: "" }); // Parse full data
        
        fs.unlinkSync(req.file.path);

        res.json({ success: true, data });
    } catch (error) {
        console.error("Erreur extraction données:", error);
        res.status(500).json({ error: "Erreur de lecture du fichier" });
    }
});

// POST /api/rh/smart-mapping - Suggestions de mapping de colonnes par IA (en overlay du mapping
// par mots-clés déjà calculé côté frontend ; ne bloque jamais l'import en cas d'échec)
app.post('/api/rh/smart-mapping', authMiddleware, async (req, res) => {
    try {
        if (!(await gateAiAccess(req, res))) return;
        const { headers, fields } = req.body;
        if (!Array.isArray(headers) || headers.length === 0 || !Array.isArray(fields) || fields.length === 0) {
            return res.status(400).json({ error: "En-têtes et champs standards requis." });
        }
        const mapping = await aiService.suggestColumnMapping(headers, fields);
        res.json({ success: true, mapping });
    } catch (e) {
        console.error('Erreur smart mapping IA:', e.message);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

const cpUpload = upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'template', maxCount: 1 }
]);

app.post('/api/rh/generate-pay-slips', authMiddleware, cpUpload, async (req, res) => {
    try {
        const dataFile = req.files['file'] ? req.files['file'][0] : null;
        const templateFile = req.files['template'] ? req.files['template'][0] : null;
        const mapping = req.body.mapping ? JSON.parse(req.body.mapping) : null;
        const sheetName = req.body.sheetName || null;
        const htmlTemplate = req.body.htmlTemplate ? req.body.htmlTemplate : null;
        const docxTemplateBase64 = req.body.docxTemplateBase64 ? req.body.docxTemplateBase64 : null;
        const templateStyle = req.body.templateStyle || null;
        const country = req.body.country || 'CI';
        const mois = parseInt(req.body.mois) || (new Date().getMonth() + 1);
        const annee = parseInt(req.body.annee) || new Date().getFullYear();

        console.log("RAW body employeesData:", req.body.employeesData ? req.body.employeesData.substring(0, 100) + '...' : null);
        const employeesData = req.body.employeesData ? JSON.parse(req.body.employeesData) : null;
        console.log("Parsed employeesData is Array?", Array.isArray(employeesData), "Length:", employeesData ? employeesData.length : 0);

        const leavesToProcess = req.body.leavesToProcess ? JSON.parse(req.body.leavesToProcess) : [];
        const entrepriseProfile = req.body.entreprise ? JSON.parse(req.body.entreprise) : null;

        if (!dataFile && !employeesData) {
            return res.status(400).json({ error: "Aucune donnée fournie (fichier Excel ou JSON manquant)" });
        }

        console.log("=== DEBUG /generate-pay-slips ===");
        console.log("dataFile:", dataFile ? dataFile.originalname : null);
        console.log("templateFile:", templateFile ? templateFile.originalname : null);
        console.log("htmlTemplate provided:", !!htmlTemplate);
        console.log("=================================");

        let finalDataPath = dataFile ? dataFile.path : null;
        let finalTemplatePath = templateFile ? templateFile.path : null;

        if (dataFile) {
            const ext = path.extname(dataFile.originalname);
            finalDataPath = dataFile.path + ext;
            fs.renameSync(dataFile.path, finalDataPath);
        }

        if (templateFile) {
            const ext = path.extname(templateFile.originalname);
            finalTemplatePath = templateFile.path + ext;
            fs.renameSync(templateFile.path, finalTemplatePath);
        }

        // Vérification des crédits (5 crédits par bulletin)
        const userObj = await User.findByPk(req.user.id);
        if (!userObj) {
            if (finalDataPath && fs.existsSync(finalDataPath)) fs.unlinkSync(finalDataPath);
            if (finalTemplatePath && fs.existsSync(finalTemplatePath)) fs.unlinkSync(finalTemplatePath);
            return res.status(404).json({ error: "Utilisateur non trouvé" });
        }

        // Calcul du nombre d'employés
        let employeeCount = 0;
        if (dataFile) {
            try {
                const workbook = XLSX.readFile(finalDataPath);
                let employesSheetName = (sheetName && workbook.SheetNames.includes(sheetName))
                    ? sheetName
                    : (workbook.SheetNames.find(n =>
                        n.toUpperCase() === 'EMPLOYES' ||
                        n.toUpperCase() === 'EMPLOYÉS'
                    ) || (workbook.SheetNames.length === 1 ? workbook.SheetNames[0] : null));

                if (!employesSheetName) {
                    if (finalDataPath && fs.existsSync(finalDataPath)) fs.unlinkSync(finalDataPath);
                    if (finalTemplatePath && fs.existsSync(finalTemplatePath)) fs.unlinkSync(finalTemplatePath);
                    return res.status(400).json({ error: "Feuille employés introuvable dans le fichier Excel. Veuillez sélectionner la feuille contenant vos employés." });
                }
                const employesList = XLSX.utils.sheet_to_json(workbook.Sheets[employesSheetName]);
                employeeCount = employesList.length;
            } catch (excelErr) {
                if (finalDataPath && fs.existsSync(finalDataPath)) fs.unlinkSync(finalDataPath);
                if (finalTemplatePath && fs.existsSync(finalTemplatePath)) fs.unlinkSync(finalTemplatePath);
                return res.status(400).json({ error: "Impossible de lire le fichier Excel pour compter les employés." });
            }
        } else if (employeesData) {
            employeeCount = employeesData.length;
        }

        if (employeeCount === 0) {
            if (finalDataPath && fs.existsSync(finalDataPath)) fs.unlinkSync(finalDataPath);
            if (finalTemplatePath && fs.existsSync(finalTemplatePath)) fs.unlinkSync(finalTemplatePath);
            return res.status(400).json({ error: "Aucun employé trouvé pour la génération." });
        }

        // Cycle de paie : une période clôturée est figée et refuse la régénération.
        // Vérifié AVANT le quota : « période clôturée » est la vraie raison du refus.
        let period = await PayrollPeriod.findOne({ where: { userId: userObj.id, mois, annee, country } });
        if (period && period.status === cyclePaie.STATUTS.CLOTUREE) {
            if (finalDataPath && fs.existsSync(finalDataPath)) fs.unlinkSync(finalDataPath);
            if (finalTemplatePath && fs.existsSync(finalTemplatePath)) fs.unlinkSync(finalTemplatePath);
            return res.status(409).json({
                error: "Cette période est clôturée : ses bulletins ne peuvent plus être régénérés. Rouvrez-la (avec un motif) dans « Cycle de paie », ou régularisez sur le mois suivant.",
                reason: 'periode_cloturee'
            });
        }

        const plan = await billingService.getPlanByCode(userObj.subscriptionTier);
        await billingService.ensureFreeMonthlyPeriod(userObj);
        const quotaCheck = billingService.checkQuota(userObj, plan, employeeCount);
        if (!quotaCheck.ok) {
            if (finalDataPath && fs.existsSync(finalDataPath)) fs.unlinkSync(finalDataPath);
            if (finalTemplatePath && fs.existsSync(finalTemplatePath)) fs.unlinkSync(finalTemplatePath);
            return res.status(402).json({
                error: billingService.quotaErrorMessage(quotaCheck.reason, { plan, user: userObj, countNeeded: employeeCount }),
                reason: quotaCheck.reason,
                employeeCount,
                ...billingService.getSubscriptionSnapshot(userObj, plan)
            });
        }

        // Cycle de paie : une génération crée la période en brouillon. Régénérer une
        // période validée la repasse en brouillon (ses chiffres changent, il faut
        // les recontrôler). Le cas « clôturée » a été refusé plus haut.
        const regeneration = !!period;
        if (!period) {
            period = await PayrollPeriod.create({ userId: userObj.id, mois, annee, country, status: cyclePaie.STATUTS.BROUILLON });
        } else if (period.status !== cyclePaie.STATUTS.BROUILLON) {
            period.status = cyclePaie.STATUTS.BROUILLON;
            period.validatedAt = null;
            await period.save();
        }

        const payrollReq = await PayrollRequest.create({
            filename: dataFile ? dataFile.originalname : 'Local_DB_Export',
            status: 'PROCESSING',
            UserId: req.user.id
        });

        // Jeton aléatoire plutôt que Date.now() : le ZIP contient les bulletins de
        // paie complets (salaires, N° CNPS, RIB) de tous les employés du lot, et
        // /api/rh/download/:filename n'accepte que ce format précis — un suffixe
        // temporel était trivialement énumérable.
        const zipFilename = `bulletins_${payrollReq.id}_${crypto.randomBytes(16).toString('hex')}.zip`;
        const zipPath = path.join(__dirname, 'uploads', zipFilename);

        console.log(`🚀 Démarrage traitement RH (${country}) pour: ${dataFile ? dataFile.originalname : 'Données locales'}`);

        // Le profil entreprise vient des paramètres (raisonSociale, numeroCnpsEmployeur...
        // en camelCase, comme partout où il est stocké) ; processPayrollJson attend le
        // snake_case du reste du moteur de paie.
        //
        // Le logo, lui, est un attribut du compte (Paramètres > Profil Entreprise),
        // indépendant de la présence ou non d'un classeur "ENTREPRISE" — on le
        // récupère donc même quand entrepriseProfile est absent.
        const userPourLogo = await User.findByPk(req.user.id);
        // Un classeur "ENTREPRISE" importé (entrepriseProfile) prime sur le profil
        // enregistré dans Paramètres — celui-ci ne sert que de repli, pour les
        // champs qu'un import ponctuel ne fournit pas.
        const companyInfoOverride = (entrepriseProfile || userPourLogo?.companyLogo || userPourLogo?.companyName || userPourLogo?.rubriqueCodes || userPourLogo?.bulletinCouleur || userPourLogo?.bulletinCanvasLayout) ? {
            nom_entreprise: entrepriseProfile?.raisonSociale || entrepriseProfile?.nom_entreprise || userPourLogo?.companyName || '',
            adresse: entrepriseProfile?.adresse || userPourLogo?.companyAdresse || '',
            numero_cnps: entrepriseProfile?.numeroCnpsEmployeur || entrepriseProfile?.numero_cnps || userPourLogo?.companyNumeroCnps || '',
            numero_contribuable: entrepriseProfile?.numeroContribuable || entrepriseProfile?.numero_contribuable || userPourLogo?.companyNumeroContribuable || '',
            telephone: entrepriseProfile?.telephone || userPourLogo?.companyTelephone || '',
            email: entrepriseProfile?.email || userPourLogo?.companyEmail || '',
            ville: entrepriseProfile?.ville || userPourLogo?.companyVille || '',
            signataire_nom: entrepriseProfile?.signataireNom || entrepriseProfile?.signataire_nom || userPourLogo?.companySignataireNom || '',
            signataire_fonction: entrepriseProfile?.signataireFonction || entrepriseProfile?.signataire_fonction || userPourLogo?.companySignataireFonction || '',
            logo: userPourLogo?.companyLogo || null,
            rubriqueCodes: userPourLogo?.rubriqueCodes ? JSON.parse(userPourLogo.rubriqueCodes) : null,
            bulletinCouleur: userPourLogo?.bulletinCouleur || null,
            bulletinCanvasLayout: userPourLogo?.bulletinCanvasLayout ? JSON.parse(userPourLogo.bulletinCanvasLayout) : null
        } : null;

        // Si l'appelant n'a pas explicitement choisi, on retombe sur le style
        // enregistré dans Paramètres > Modèles de bulletin.
        const templateStyleFinal = templateStyle || userPourLogo?.defaultBulletinStyle || null;

        let result;
        if (employeesData) {
             result = await payrollService.processPayrollJson(
                employeesData,
                zipPath,
                finalTemplatePath,
                mapping,
                htmlTemplate,
                country,
                companyInfoOverride,
                leavesToProcess,
                docxTemplateBase64,
                templateStyleFinal,
                { baseJoursPaie: userPourLogo?.companyBaseJoursPaie, zoneTransport: userPourLogo?.companyZoneTransport }
             );
        } else {
             result = await payrollService.processPayrollFile(
                finalDataPath,
                zipPath,
                finalTemplatePath,
                mapping,
                htmlTemplate,
                country,
                sheetName,
                leavesToProcess,
                docxTemplateBase64,
                templateStyleFinal,
                { baseJoursPaie: userPourLogo?.companyBaseJoursPaie, zoneTransport: userPourLogo?.companyZoneTransport }
             );
        }

        await payrollReq.update({
            status: 'SUCCESS',
            employeeCount: result.count
        });

        // Remplace les bulletins précédents de cette période (régénération idempotente)
        await PayslipRecord.destroy({ where: { periodId: period.id } });
        if (result.perEmployeeResults && result.perEmployeeResults.length > 0) {
            await PayslipRecord.bulkCreate(
                result.perEmployeeResults.map(r => ({ ...r, periodId: period.id }))
            );
        }

        // Décompte selon la source retenue par checkQuota : allocation gratuite
        // mensuelle, ou quota de la formule payante active.
        if (quotaCheck.useFreeMonthly) {
            userObj.freeMonthlyUsed = (userObj.freeMonthlyUsed || 0) + result.count;
        } else {
            userObj.bulletinsUsed = (userObj.bulletinsUsed || 0) + result.count;
        }
        await userObj.save();

        console.log(`✅ ${result.count} bulletins (${result.type}) générés.`);
        await journaliser({
            req, action: regeneration ? 'periode.regeneree' : 'periode.generee', entite: 'periode', entiteId: period.id,
            libelle: `${regeneration ? 'Régénération' : 'Génération'} de la paie ${String(mois).padStart(2, '0')}/${annee} — ${result.count} bulletin(s)`,
            details: { mois, annee, bulletins: result.count }
        });

        res.json({
            success: true,
            message: `${result.count} bulletins générés (${result.type}) !`,
            jobId: payrollReq.id,
            zipUrl: `/api/rh/download/${zipFilename}`,
            periodId: period.id,
            periodStatus: period.status,
            leavesProcessed: leavesToProcess,
            avertissements: result.avertissements || [],
            ...billingService.getSubscriptionSnapshot(userObj, plan),
            stats: {
                employeeCount: result.count,
                totalMasseSalariale: result.totalMasseSalariale,
                totalCnps: result.totalCNPS,
                totalImpots: result.totalImpots
            }
        });

    } catch (error) {
        console.error("Erreur RH:", error);
        res.status(500).json({ error: "Erreur lors du traitement" });
    }
});

// Routes « paieGouvernance » : server/routes/paieGouvernance.js
require('./routes/paieGouvernance')(app, { AuditLog, PayrollPeriod, PayslipRecord, TYPES_ANNUELS, User, authMiddleware, cyclePaie, genererDeclaration, journaliser });

// Résout une plage de période (mois/année début → mois/année fin) depuis les query params,
// avec repli sur l'année civile en cours si rien n'est fourni (comportement par défaut inchangé).
// Filtre en mémoire via un index linéaire mois/année plutôt qu'en SQL, pour gérer simplement une
// plage à cheval sur plusieurs années.
function resolvePeriodRange(req) {
    const now = new Date();
    const debutMois = parseInt(req.query.debutMois) || 1;
    const debutAnnee = parseInt(req.query.debutAnnee) || now.getFullYear();
    const finMois = parseInt(req.query.finMois) || 12;
    const finAnnee = parseInt(req.query.finAnnee) || now.getFullYear();
    return {
        debutMois, debutAnnee, finMois, finAnnee,
        debutIdx: debutAnnee * 12 + debutMois,
        finIdx: finAnnee * 12 + finMois
    };
}

// GET /api/rh/employees/:matricule/stats - Statistiques d'un employé sur une plage de période
// (absences, heures supp, rémunération) agrégées à partir de l'historique de paie.
app.get('/api/rh/employees/:matricule/stats', authMiddleware, async (req, res) => {
    try {
        const matricule = req.params.matricule;
        const range = resolvePeriodRange(req);

        const allPeriods = await PayrollPeriod.findAll({
            where: { userId: req.user.id },
            order: [['annee', 'ASC'], ['mois', 'ASC']]
        });
        const periods = allPeriods.filter(p => {
            const idx = p.annee * 12 + p.mois;
            return idx >= range.debutIdx && idx <= range.finIdx;
        });

        const monthly = [];
        let totalAbsences = 0;
        let totalHeuresSup = 0;
        let totalBrut = 0;
        let moisAvecDonnees = 0;

        for (const period of periods) {
            const record = await PayslipRecord.findOne({ where: { periodId: period.id, matricule } });
            if (record) {
                monthly.push({
                    mois: period.mois,
                    annee: period.annee,
                    absencesJours: record.absencesJours || 0,
                    heuresSupNb: record.heuresSupNb || 0,
                    joursTravailles: record.joursTravailles || 0,
                    brutTotal: record.brutTotal || 0,
                    netAPayer: record.netAPayer || 0
                });
                totalAbsences += record.absencesJours || 0;
                totalHeuresSup += record.heuresSupNb || 0;
                totalBrut += record.brutTotal || 0;
                moisAvecDonnees++;
            }
        }

        res.json({
            success: true,
            matricule,
            debutMois: range.debutMois,
            debutAnnee: range.debutAnnee,
            finMois: range.finMois,
            finAnnee: range.finAnnee,
            monthly,
            totals: {
                totalAbsences,
                totalHeuresSup,
                brutMoyen: moisAvecDonnees > 0 ? Math.round(totalBrut / moisAvecDonnees) : 0,
                moisAvecDonnees
            }
        });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/rh/employees/:matricule/stats :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// GET /api/rh/analytics/company - Analytique RH entreprise (masse salariale, charges patronales,
// absentéisme, coût des heures sup, répartition par poste) agrégée sur une plage de période pour
// tous les employés — fondation du dashboard "SLA RH" (au-dessus des stats par employé).
app.get('/api/rh/analytics/company', authMiddleware, async (req, res) => {
    try {
        const range = resolvePeriodRange(req);

        const allPeriods = await PayrollPeriod.findAll({
            where: { userId: req.user.id },
            order: [['annee', 'ASC'], ['mois', 'ASC']]
        });
        const periods = allPeriods.filter(p => {
            const idx = p.annee * 12 + p.mois;
            return idx >= range.debutIdx && idx <= range.finIdx;
        });

        const monthly = [];
        const posteMap = {}; // poste -> { sumBrut, count, min, max, matricules: Set }
        const employeeMap = {}; // matricule -> { nom, prenom, poste, totalAbsenceDays, spellsCount, totalHeuresSup }

        let masseSalarialeAnnuelle = 0;
        let masseSalarialeNetteAnnuelle = 0;
        let chargesPatronalesAnnuelles = 0;
        let montantHeuresSupAnnuel = 0;
        let totalAbsencesAnnuel = 0;
        let totalJoursTravaillesAnnuel = 0;
        let moisAvecDonnees = 0;

        for (const period of periods) {
            const records = await PayslipRecord.findAll({ where: { periodId: period.id } });
            if (records.length === 0) continue;

            let masseSalarialeBrute = 0;
            let masseSalarialeNette = 0;
            let chargesPatronales = 0;
            let montantHeuresSupMois = 0;
            let absencesJoursMois = 0;
            let joursTravaillesMois = 0;

            for (const r of records) {
                const brut = r.brutTotal || 0;
                const charges = (r.cnpsPF || 0) + (r.cnpsAM || 0) + (r.cnpsAT || 0) + (r.cnpsRetraitePat || 0) + (r.cmuPat || 0);

                masseSalarialeBrute += brut;
                masseSalarialeNette += r.netAPayer || 0;
                chargesPatronales += charges;
                montantHeuresSupMois += r.montantHeuresSup || 0;
                absencesJoursMois += r.absencesJours || 0;
                joursTravaillesMois += r.joursTravailles || 0;

                const poste = r.poste || 'Non renseigné';
                if (!posteMap[poste]) posteMap[poste] = { sumBrut: 0, count: 0, min: brut, max: brut, matricules: new Set() };
                const pAgg = posteMap[poste];
                pAgg.sumBrut += brut;
                pAgg.count++;
                pAgg.min = Math.min(pAgg.min, brut);
                pAgg.max = Math.max(pAgg.max, brut);
                if (r.matricule) pAgg.matricules.add(r.matricule);

                if (r.matricule) {
                    if (!employeeMap[r.matricule]) {
                        employeeMap[r.matricule] = { matricule: r.matricule, nom: r.nom, prenom: r.prenom, poste, totalAbsenceDays: 0, spellsCount: 0, totalHeuresSup: 0 };
                    }
                    const eAgg = employeeMap[r.matricule];
                    eAgg.poste = poste; // dernier poste connu sur l'année
                    eAgg.totalAbsenceDays += r.absencesJours || 0;
                    if ((r.absencesJours || 0) > 0) eAgg.spellsCount++;
                    eAgg.totalHeuresSup += r.heuresSupNb || 0;
                }
            }

            const tauxAbsenteisme = (absencesJoursMois + joursTravaillesMois) > 0
                ? Math.round((absencesJoursMois / (absencesJoursMois + joursTravaillesMois)) * 1000) / 10
                : 0;

            monthly.push({
                mois: period.mois,
                annee: period.annee,
                employeeCount: records.length,
                masseSalarialeBrute: Math.round(masseSalarialeBrute),
                masseSalarialeNette: Math.round(masseSalarialeNette),
                chargesPatronales: Math.round(chargesPatronales),
                montantHeuresSup: Math.round(montantHeuresSupMois),
                tauxAbsenteisme
            });

            masseSalarialeAnnuelle += masseSalarialeBrute;
            masseSalarialeNetteAnnuelle += masseSalarialeNette;
            chargesPatronalesAnnuelles += chargesPatronales;
            montantHeuresSupAnnuel += montantHeuresSupMois;
            totalAbsencesAnnuel += absencesJoursMois;
            totalJoursTravaillesAnnuel += joursTravaillesMois;
            moisAvecDonnees++;
        }

        const byPoste = Object.entries(posteMap).map(([poste, a]) => ({
            poste,
            effectif: a.matricules.size,
            masseSalariale: Math.round(a.sumBrut),
            salaireMoyen: a.count > 0 ? Math.round(a.sumBrut / a.count) : 0,
            salaireMin: Math.round(a.min),
            salaireMax: Math.round(a.max)
        })).sort((a, b) => b.masseSalariale - a.masseSalariale);

        // Bradford Factor = (nb de mois avec absence)² × (total jours d'absence). Approximation :
        // la donnée est mensuelle (pas de suivi jour par jour), donc "spellsCount" compte des mois
        // avec absence, pas de vrais épisodes distincts — indicatif, pas une mesure clinique.
        const employees = Object.values(employeeMap).map(e => ({
            ...e,
            bradfordScore: (e.spellsCount * e.spellsCount) * e.totalAbsenceDays
        })).sort((a, b) => b.bradfordScore - a.bradfordScore);

        res.json({
            success: true,
            debutMois: range.debutMois,
            debutAnnee: range.debutAnnee,
            finMois: range.finMois,
            finAnnee: range.finAnnee,
            monthly,
            byPoste,
            employees,
            totals: {
                masseSalarialeAnnuelle: Math.round(masseSalarialeAnnuelle),
                masseSalarialeNetteAnnuelle: Math.round(masseSalarialeNetteAnnuelle),
                chargesPatronalesAnnuelles: Math.round(chargesPatronalesAnnuelles),
                ratioChargesPatronales: masseSalarialeAnnuelle > 0 ? Math.round((chargesPatronalesAnnuelles / masseSalarialeAnnuelle) * 1000) / 10 : 0,
                coutHeuresSupAnnuel: Math.round(montantHeuresSupAnnuel),
                tauxAbsenteismeMoyen: (totalAbsencesAnnuel + totalJoursTravaillesAnnuel) > 0
                    ? Math.round((totalAbsencesAnnuel / (totalAbsencesAnnuel + totalJoursTravaillesAnnuel)) * 1000) / 10
                    : 0,
                moisAvecDonnees
            }
        });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/rh/analytics/company :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// ─── Génération bulletin individuel (Simulateur manuel) ───────────────────
// Hors quota, délibérément : le bulletin individuel (habituel ou congé, selon
// employee.bulletin_type) reste toujours disponible sans limite, y compris
// pour un compte gratuit — seule la génération groupée (import Excel) et les
// fonctionnalités IA sont comptées dans l'allocation gratuite mensuelle. Voir
// billingService.js.
app.post('/api/rh/generate-single-payslip', singlePayslipAuth, async (req, res) => {
    try {
        // let : la fiche enregistrée est fusionnée plus bas (employé de l'annuaire).
        // En const, cette réassignation levait une TypeError avalée par le catch
        // des absences : ni la fiche ni les congés pris n'étaient jamais pris en compte.
        let { employee } = req.body;
        const { templateStyle } = req.body;
        if (!employee || !employee.nom) {
            return res.status(400).json({ error: 'Données employé manquantes' });
        }

        // Appel anonyme (instance simulateur) : aucun compte, donc ni base de
        // données, ni profil entreprise, ni cumuls. Un modèle HTML fourni par
        // l'appelant est ignoré — il serait rendu tel quel par le navigateur
        // headless, ce qu'on ne concède qu'à un compte identifié.
        const anonymous = !req.user;
        const htmlTemplate = anonymous ? null : req.body.htmlTemplate;

        const userObj = anonymous ? null : await User.findByPk(req.user.id);
        if (!anonymous && !userObj) {
            return res.status(404).json({ error: "Utilisateur non trouvé" });
        }
        if (!anonymous) {
            const moisBulletin = parseInt(employee.mois || new Date().getMonth() + 1);
            const anneeBulletin = parseInt(employee.annee || new Date().getFullYear());
            const close = await PayrollPeriod.findOne({ where: { userId: req.user.id, mois: moisBulletin, annee: anneeBulletin, status: cyclePaie.STATUTS.CLOTUREE } });
            if (close) {
                return res.status(409).json({ error: "Ce mois est clôturé : aucun bulletin ne peut plus y être généré. Rouvrez la période dans « Cycle de paie » ou régularisez sur le mois suivant.", reason: 'periode_cloturee' });
            }
        }
        if (employee.base_jours_paie == null && userObj?.companyBaseJoursPaie) {
            employee.base_jours_paie = userObj.companyBaseJoursPaie;
        }
        if (!employee.zone_transport && userObj?.companyZoneTransport) {
            employee.zone_transport = userObj.companyZoneTransport;
        }

        // ── Enrichissement avec les congés réellement pris (depuis la BDD des absences)
        // On charge toutes les absences de type 'annuel' pour cet employé et on
        // cumule les jours depuis date_dernier_conge (ou début d'année si absent).
        // C'est ce total qui alimente congesPris dans calculateCongesCounters().
        let empRecord = null;
        try {
            const employeeId = anonymous ? null : (employee.employee_id || employee.id || null);
            if (employeeId) {
                const { Op } = require('sequelize');
                const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
                const anneeNum = parseInt(employee.annee || new Date().getFullYear());

                empRecord = await Employee.findOne({ where: { id: employeeId, userId: req.user.id } });
                if (empRecord) {
                    const clientEmp = employeVersClient(empRecord);
                    employee = { ...clientEmp, ...employee };
                }

                // Borne de départ : date_dernier_conge ou 1er janvier de l'année
                let dateRef = null;
                if (employee.date_dernier_conge) {
                    dateRef = new Date(employee.date_dernier_conge);
                } else {
                    const debutAnnee = new Date(anneeNum, 0, 1);
                    const dateEmb = employee.date_embauche ? new Date(employee.date_embauche) : null;
                    dateRef = (dateEmb && dateEmb > debutAnnee) ? dateEmb : debutAnnee;
                }
                const dateRefStr = dateRef.toISOString().slice(0, 10);

                // Borne de fin : dernier jour du mois du bulletin (inclus)
                const dernierJourMois = new Date(anneeNum, moisNum, 0).getDate();
                const dateFinBulletin = `${anneeNum}-${String(moisNum).padStart(2,'0')}-${String(dernierJourMois).padStart(2,'0')}`;

                const absAnnuelles = await Absence.findAll({
                    where: {
                        userId: req.user.id,
                        employeeId: employeeId,
                        type: 'annuel',
                        dateDebut: { [Op.gte]: dateRefStr },
                        dateFin:   { [Op.lte]: dateFinBulletin }
                    }
                });
                const totalJoursPris = absAnnuelles.reduce((sum, a) => sum + (parseFloat(a.jours) || 0), 0);
                employee.absences_prises_total = totalJoursPris;
                console.log(`🗓 Congés pris depuis ${dateRefStr} : ${totalJoursPris}j pour employé ${employeeId}`);
            }
        } catch (absQueryErr) {
            console.warn('⚠️ Impossible de charger les absences annuelles pour le compteur congés :', absQueryErr.message);
        }

        const calculs = payrollService.calculateSinglePayroll(employee);

        // ── Mise à jour automatique des cumuls annuels de paie ──
        if (empRecord) {
            try {
                const anneeNum = parseInt(employee.annee || new Date().getFullYear());
                const moisNum = parseInt(employee.mois || new Date().getMonth() + 1);
                const anneeKey = String(anneeNum);
                const currentCumuls = { ...(empRecord.cumulsPaie || {}) };
                const anneeCumuls = { ...(currentCumuls[anneeKey] || {
                    cumul_brut: empRecord.cumulBrutInitial || 0,
                    cumul_brut_imposable: empRecord.cumulNetImposableInitial || 0,
                    cumul_net_imposable: empRecord.cumulNetImposableInitial || 0,
                    cumul_net: empRecord.cumulNetInitial || 0,
                    cumul_cnps: empRecord.cumulCnpsSalInitial || 0,
                    cumul_its: empRecord.cumulItsInitial || 0,
                    cumul_cmu: empRecord.cumulCmuInitial || 0,
                    cumul_charges_sal: (empRecord.cumulCnpsSalInitial || 0) + (empRecord.cumulItsInitial || 0) + (empRecord.cumulCmuInitial || 0),
                    cumul_charges_pat: empRecord.cumulChargesPatInitial || 0,
                    cumul_jours: empRecord.cumulJoursInitial || 0,
                    cumul_heures_sup: empRecord.cumulHeuresSupInitial || 0
                }) };

                anneeCumuls.cumul_brut = Math.round(((anneeCumuls.cumul_brut || 0) + (calculs.gainsTotaux || 0)) * 100) / 100;
                anneeCumuls.cumul_brut_imposable = Math.round(((anneeCumuls.cumul_brut_imposable || 0) + (calculs.brutImposable || 0)) * 100) / 100;
                anneeCumuls.cumul_net_imposable = anneeCumuls.cumul_brut_imposable;
                anneeCumuls.cumul_net = Math.round(((anneeCumuls.cumul_net || 0) + (calculs.netAPayer || 0)) * 100) / 100;
                anneeCumuls.cumul_cnps = Math.round(((anneeCumuls.cumul_cnps || 0) + (calculs.salarial?.cnps || 0)) * 100) / 100;
                anneeCumuls.cumul_its = Math.round(((anneeCumuls.cumul_its || 0) + (calculs.salarial?.its || 0)) * 100) / 100;
                anneeCumuls.cumul_cmu = Math.round(((anneeCumuls.cumul_cmu || 0) + (calculs.salarial?.cmu || 0)) * 100) / 100;
                anneeCumuls.cumul_charges_sal = Math.round(((anneeCumuls.cumul_charges_sal || 0) + (calculs.salarial?.total || 0)) * 100) / 100;
                anneeCumuls.cumul_charges_pat = Math.round(((anneeCumuls.cumul_charges_pat || 0) + (calculs.patronal?.grandTotal || calculs.patronal?.totalSocial || 0)) * 100) / 100;
                anneeCumuls.cumul_jours = Math.round(((anneeCumuls.cumul_jours || 0) + (calculs.joursTrav || 0)) * 10) / 10;
                anneeCumuls.cumul_heures_sup = Math.round(((anneeCumuls.cumul_heures_sup || 0) + (calculs.nbHeuresSup || 0)) * 10) / 10;
                anneeCumuls.derniere_periode = `${String(moisNum).padStart(2, '0')}/${anneeNum}`;

                currentCumuls[anneeKey] = anneeCumuls;
                empRecord.cumulsPaie = currentCumuls;
                await empRecord.save();
                console.log(`📊 Cumuls de paie incrémentés pour ${empRecord.nom} (${anneeKey}) : Brut = ${anneeCumuls.cumul_brut} F`);
            } catch (cumulErr) {
                console.warn('⚠️ Erreur mise à jour cumuls employé :', cumulErr.message);
            }
        }

        const companyInfo = {
            // Le formulaire de saisie prime ; le profil enregistré dans Paramètres
            // ne sert que de repli pour ce que ce formulaire ne fournit pas.
            nom_entreprise: employee.nom_entreprise || userObj?.companyName || '',
            adresse: employee.adresse || userObj?.companyAdresse || '',
            siege_social: employee.siege_social || userObj?.companyAdresse || '',
            ville: employee.ville || userObj?.companyVille || '',
            // `email`/`telephone` : mêmes noms que companyInfoOverride (génération en
            // lot) et que la feuille ENTREPRISE du classeur Excel — pour que le
            // second modèle par défaut (grille numérotée), qui les affiche, les
            // trouve quel que soit le chemin de génération emprunté.
            email: employee.email_entreprise || userObj?.companyEmail || '',
            telephone: employee.tel_entreprise || userObj?.companyTelephone || '',
            numero_cnps: employee.numero_cnps || userObj?.companyNumeroCnps || '',
            numero_contribuable: employee.numero_contribuable || userObj?.companyNumeroContribuable || '',
            // Le logo est un attribut du compte (Paramètres > Profil Entreprise), pas
            // du formulaire de saisie : on le prend directement sur l'utilisateur
            // authentifié, absent s'il n'en a pas configuré.
            logo: userObj?.companyLogo || null,
            // Numérotation de rubrique du compte (Paramètres > Modèles de bulletin) :
            // il n'existe pas de code universel entre logiciels de paie, donc chaque
            // compte peut redéfinir les siens plutôt que de subir ceux d'ONDA.
            rubriqueCodes: userObj?.rubriqueCodes ? JSON.parse(userObj?.rubriqueCodes) : null,
            bulletinCouleur: userObj?.bulletinCouleur || null,
            bulletinCanvasLayout: userObj?.bulletinCanvasLayout ? JSON.parse(userObj?.bulletinCanvasLayout) : null,
        };

        // Si l'appelant n'a pas explicitement choisi, on retombe sur le style
        // enregistré dans Paramètres > Modèles de bulletin.
        const pdfBuffer = await payrollService.generateSinglePdf(employee, calculs, companyInfo, htmlTemplate, templateStyle || userObj?.defaultBulletinStyle || null);

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
        res.status(500).json({ error: "Erreur lors de la génération" });
    }
});

// ─── Aperçu d'un modèle de bulletin ONDA intégré (Paramètres) ─────────────
// Un salarié fictif, le profil entreprise réel du compte : sert uniquement à
// comparer visuellement les modèles avant d'en choisir un par défaut. Aucun
// impact sur le quota — ce n'est pas un vrai bulletin.
// ─── Catalogue des codes de rubrique (Paramètres > Modèles de bulletin) ───
app.get('/api/rh/rubrique-codes-catalogue', authMiddleware, (req, res) => {
    res.json({ catalogue: payrollService.CATALOGUE_RUBRIQUES, defauts: payrollService.CODE_RUBRIQUE });
});

// ─── Éditeur visuel du modèle « Sur-mesure » (Paramètres) ─────────────────
// Sert la disposition enregistrée du compte (ou la disposition par défaut
// s'il n'a encore rien personnalisé), le catalogue des champs disponibles
// pour un bloc texte, et les dimensions de page — un seul endroit pour ces
// trois informations, jamais recopiées à la main côté client.
app.get('/api/rh/bulletin-canvas-layout', authMiddleware, async (req, res) => {
    try {
        const userObj = await User.findByPk(req.user.id);
        if (!userObj) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        res.json({
            layout: userObj.bulletinCanvasLayout ? JSON.parse(userObj.bulletinCanvasLayout) : payrollService.CANVAS_LAYOUT_DEFAUT,
            layoutParDefaut: payrollService.CANVAS_LAYOUT_DEFAUT,
            champs: payrollService.CANVAS_CHAMPS_DISPONIBLES,
            page: payrollService.CANVAS_PAGE
        });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/rh/bulletin-canvas-layout :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// Conception du modèle « Sur-mesure » par conversation : plutôt que de
// glisser-déposer des blocs, l'utilisateur décrit ce qu'il veut et l'IA
// renvoie directement la disposition (même format que bulletinCanvasLayout),
// que le client prévisualise via /preview-bulletin-style avant d'enregistrer.
app.post('/api/rh/bulletin-canvas-ia', authMiddleware, async (req, res) => {
    try {
        if (!(await gateAiAccess(req, res))) return;
        const { messages, currentLayout, image } = req.body;
        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Message manquant' });
        }
        const resultat = await aiService.genererBulletinCanvasIA(messages, currentLayout, payrollService.CANVAS_CHAMPS_DISPONIBLES, payrollService.CANVAS_PAGE, image || null);
        res.json({ success: true, ...resultat });
    } catch (e) {
        console.error('Erreur IA canvas bulletin:', e.message);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// Import d'un PDF réel comme point de départ du modèle « Sur-mesure » :
// la voie déterministe (docengine) donne des POSITIONS exactes, pas devinées
// par un modèle de vision — la reproduction par photo s'est révélée trop peu
// fidèle pour être proposée telle quelle (voir BulletinCanvasEditor.vue).
// Une fois importée, la disposition se retouche comme n'importe quelle autre
// via /api/rh/bulletin-canvas-ia (le chat).
app.post('/api/rh/bulletin-canvas-from-pdf', authMiddleware, async (req, res) => {
    try {
        const { fileBase64, filename } = req.body;
        if (!fileBase64) return res.status(400).json({ error: 'Fichier manquant' });

        const buffer = decodeDataUrl(fileBase64);
        const result = await docEngine.buildTemplate(buffer, {
            filename: filename || 'modele.pdf',
            nature: 'grid',
            minConfidence: 0.6,
            // Même choix que l'import de bulletin existant : aucune IA dans la
            // détection des variables, un fragment non reconnu par le lexique
            // reste simplement absent de la disposition plutôt qu'inventé.
            useAi: false
        });

        if (!result.ok) {
            const raison = result.reason === 'no-text-layer'
                ? "Ce PDF est un scan sans texte exploitable (image) : l'import déterministe a besoin d'un PDF natif, avec du texte sélectionnable."
                : "Ce PDF n'a pas pu être analysé.";
            return res.status(422).json({ error: raison, reason: result.reason });
        }

        const { layout, stats } = irToCanvasLayout(result, payrollService.CANVAS_PAGE);
        const message = stats.tableauDetecte
            ? `Bulletin importé : tableau des rubriques repéré${stats.showPatronal ? ' (avec charges patronales)' : ''}, ${stats.reconnus} champ(s) d'identité reconnu(s) et repositionné(s). Demandez-moi des ajustements si besoin.`
            : `Bulletin importé, mais je n'ai pas repéré de tableau de rubriques net dans ce PDF — j'ai placé un tableau par défaut, à repositionner. ${stats.reconnus} champ(s) d'identité reconnu(s).`;

        res.json({ success: true, layout, message, stats });
    } catch (e) {
        console.error('Erreur import PDF canvas:', e.message);
        res.status(500).json({ error: "Erreur lors de l'import" });
    }
});

app.post('/api/rh/preview-bulletin-style', authMiddleware, async (req, res) => {
    try {
        const templateStyle = payrollService.STYLES_BULLETIN_DISPONIBLES.includes(req.body.templateStyle) ? req.body.templateStyle : null;
        const userObj = await User.findByPk(req.user.id);
        if (!userObj) return res.status(404).json({ error: 'Utilisateur non trouvé' });

        const employee = {
            pays: 'CI', nom: 'YAO', prenom: 'Kouadio', matricule: 'EMP-001',
            poste: 'Développeur', categorie: 'M2', numero_cnps: '00011223344',
            date_embauche: '2022-03-01', situation_matrimoniale: 'marie', nombre_enfants: 2,
            salaire_base: 250000, sursalaire: 50000, prime_transport: 30000,
            primes: [{ libelle: 'Prime de responsabilité', montant: 40000 }],
            mois: String(new Date().getMonth() + 1), annee: String(new Date().getFullYear()),
            virement: true, base_jours_paie: userObj.companyBaseJoursPaie, zone_transport: userObj.companyZoneTransport
        };
        const calculs = payrollService.calculateSinglePayroll(employee);
        const companyInfo = {
            nom_entreprise: userObj.companyName || 'VOTRE ENTREPRISE',
            adresse: userObj.companyAdresse || '',
            siege_social: userObj.companyAdresse || '',
            ville: userObj.companyVille || '',
            email: userObj.companyEmail || '',
            telephone: userObj.companyTelephone || '',
            numero_cnps: userObj.companyNumeroCnps || '',
            numero_contribuable: userObj.companyNumeroContribuable || '',
            logo: userObj.companyLogo || null,
            // Un brouillon non enregistré (l'utilisateur teste ses codes avant de
            // cliquer sur « Enregistrer ») prime sur ceux déjà sauvegardés.
            rubriqueCodes: req.body.rubriqueCodes || (userObj.rubriqueCodes ? JSON.parse(userObj.rubriqueCodes) : null),
            bulletinCouleur: req.body.bulletinCouleur || userObj.bulletinCouleur || null,
            // Idem : un agencement en cours d'édition dans le canvas (pas encore
            // enregistré) prime sur celui déjà sauvegardé, pour un aperçu fidèle
            // à ce qui est affiché à l'écran au moment du clic.
            bulletinCanvasLayout: req.body.bulletinCanvasLayout || (userObj.bulletinCanvasLayout ? JSON.parse(userObj.bulletinCanvasLayout) : null)
        };
        const pdfBuffer = await payrollService.generateSinglePdf(employee, calculs, companyInfo, null, templateStyle);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="apercu-modele-bulletin.pdf"');
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Erreur aperçu modèle de bulletin:', error);
        res.status(500).json({ error: "Erreur lors de l'aperçu" });
    }
});

// ─── Génération Solde de Tout Compte (PDF) ────────────────────────────────
app.post('/api/rh/generate-stc', async (req, res) => {
    try {
        const { employee, calculs, htmlTemplate } = req.body;
        if (!employee || !employee.nom) {
            return res.status(400).json({ error: 'Données employé manquantes' });
        }
        const pdfBuffer = await payrollService.generateStcPdf(employee, calculs, htmlTemplate);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="STC_${employee.nom}_${employee.prenom || ''}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Erreur génération STC:', error);
        res.status(500).json({ error: "Erreur lors de la génération" });
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
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

app.get('/api/rh/download/:filename', (req, res) => {
    const fileName = req.params.filename;
    if (fileName === 'modele-paie.xlsx') {
        // Un seul classeur pour tout importer : entreprise, salaries, contrats.
        // La composition de la remuneration vit dans CONTRATS, pas dans EMPLOYES :
        // deux endroits pour la meme donnee, c'est la garantie qu'ils divergeront.
        const wb = construireClasseur(XLSX);
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename=modele_import_ONDA.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.send(buf);
    }

    if (fileName === 'modele-presence.xlsx') {
        // Modèle léger pour l'import "fiche de présence" (Saisie Mensuelle) : juste le matricule
        // et les champs variables du mois, sans réimporter toute la fiche employé.
        //
        // Heures sup réparties sur le barème légal ivoirien (CCI 20/07/1977) : les heures
        // "ordinaires" saisies dans heures_sup_nb se répartissent automatiquement sur les
        // deux premiers paliers (1.15 puis 1.5) côté moteur de calcul — l'utilisateur compte
        // ses heures, pas le barème. Les trois autres colonnes couvrent les catégories qui
        // ne peuvent pas être déduites automatiquement (nuit, dimanche/férié).
        const wb = XLSX.utils.book_new();
        const headers = ['matricule', 'jours_travailles', 'heures_sup_nb', 'heures_sup_nuit', 'heures_sup_ferie_jour', 'heures_sup_ferie_nuit', 'absences_jours'];
        const exampleRow = {
            matricule: 'EMP-001', jours_travailles: 26,
            heures_sup_nb: 0, heures_sup_nuit: 0, heures_sup_ferie_jour: 0, heures_sup_ferie_nuit: 0,
            absences_jours: 0
        };
        const ws = XLSX.utils.json_to_sheet([exampleRow], { header: headers });
        ws['!cols'] = headers.map(() => ({ wch: 20 }));
        XLSX.utils.book_append_sheet(wb, ws, 'PRESENCE');

        const aide = XLSX.utils.aoa_to_sheet([
            ['Comment remplir ce modèle'],
            [''],
            ['heures_sup_nb', 'Heures supplémentaires "ordinaires". Réparties automatiquement sur les paliers légaux (41e-46e heure à 1,15 ; au-delà à 1,50).'],
            ['heures_sup_nuit', 'Heures supplémentaires effectuées de nuit (taux légal 1,75).'],
            ['heures_sup_ferie_jour', 'Heures supplémentaires effectuées de jour un dimanche ou jour férié (taux légal 1,75).'],
            ['heures_sup_ferie_nuit', 'Heures supplémentaires effectuées de nuit un dimanche ou jour férié (taux légal 2,00).'],
            ['jours_travailles', 'Facultatif : nombre de jours réellement travaillés. Laissez vide pour un calcul automatique (26 - absences).'],
            ['absences_jours', "Nombre de jours d'absence du mois."]
        ]);
        aide['!cols'] = [{ wch: 22 }, { wch: 90 }];
        XLSX.utils.book_append_sheet(wb, aide, 'MODE_EMPLOI');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename=modele_fiche_presence_ONDA.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.send(buf);
    }

    if (fileName === 'modele-contrats.xlsx') {
        // Modèle pour l'import en masse de contrats (module Contrats & Alertes d'Échéance) —
        // salaire décomposé en base/sursalaire/primes, comme le formulaire manuel.
        const wb = XLSX.utils.book_new();
        const headers = [
            'nom', 'type', 'date_debut', 'date_fin', 'poste',
            'salaire_de_base', 'sursalaire',
            'prime_transport', 'prime_logement', 'prime_fonction', 'prime_responsabilite'
        ];
        const exampleRow = {
            nom: 'KONAN Yao', type: 'CDI', date_debut: '2026-01-15', date_fin: '',
            poste: 'Comptable', salaire_de_base: 300000, sursalaire: 50000,
            prime_transport: 30000, prime_logement: 0, prime_fonction: 0, prime_responsabilite: 0
        };
        const ws = XLSX.utils.json_to_sheet([exampleRow], { header: headers });
        XLSX.utils.book_append_sheet(wb, ws, 'CONTRATS');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename=modele_contrats_ONDA.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.send(buf);
    }

    // Tout le reste — notamment les ZIP de bulletins générés, qui contiennent
    // des données personnelles réelles (salaires, N° CNPS, RIB) — exige d'être
    // connecté et, quand le nom du fichier le permet, d'être le propriétaire
    // du lot. Sans ce garde-fou, n'importe qui pouvait télécharger les
    // bulletins de n'importe quelle entreprise en devinant/énumérant un nom
    // de fichier.
    return authMiddleware(req, res, async () => {
        const safeFileName = path.basename(fileName);
        const filePath = path.join(__dirname, 'uploads', safeFileName);

        const correspondance = safeFileName.match(/^bulletins_(\d+)_[0-9a-f]+\.zip$/);
        if (correspondance) {
            const payrollReq = await PayrollRequest.findByPk(correspondance[1]);
            if (!payrollReq || payrollReq.UserId !== req.user.id) {
                return res.status(403).json({ error: "Vous n'avez pas accès à ce fichier." });
            }
        }

        if (fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).send("Fichier introuvable");
        }
    });
});

// ═══════════════════════════════════════════════════════
// ROUTES RH (EMPLOYÉS, ABSENCES, FORMATIONS, EVALUATIONS)
// ═══════════════════════════════════════════════════════

// --- Employés ---
// Le modèle Sequelize Employee est en camelCase (dateEmbauche, numeroCnps...)
// mais EmployeeDirectory.vue — et le classeur d'import — parlent en snake_case
// (date_embauche, numero_cnps...), comme le reste du moteur de paie. Sans
// cette table de correspondance, `Employee.create({ ...req.body })` ignorait
// silencieusement toute clé snake_case qu'il ne reconnaissait pas : la
// situation matrimoniale, le nombre d'enfants, le n° CNPS, la date d'embauche
// et le salaire net saisis dans la fiche n'étaient JAMAIS enregistrés, sans
// aucune erreur pour le signaler. Cette table sert dans les deux sens.
const CHAMPS_EMPLOYE_SNAKE_VERS_CAMEL = {
    date_embauche: 'dateEmbauche',
    date_naissance: 'dateNaissance',
    date_dernier_conge: 'dateDernierConge',
    numero_cnps: 'numeroCnps',
    situation_matrimoniale: 'situationMatrimoniale',
    nombre_enfants: 'nombreEnfants',
    salaire_net: 'salaireNet',
    salaire_base: 'salaireBase',
    statut_salarie: 'statutSalarie',
    zone_transport: 'zoneTransport',
    mode_paiement: 'modePaiement',
    categorie_professionnelle: 'categorieProfessionnelle',
    cumul_brut_initial: 'cumulBrutInitial',
    cumul_net_imposable_initial: 'cumulNetImposableInitial',
    cumul_net_initial: 'cumulNetInitial',
    cumul_cnps_sal_initial: 'cumulCnpsSalInitial',
    cumul_its_initial: 'cumulItsInitial',
    cumul_cmu_initial: 'cumulCmuInitial',
    cumul_charges_pat_initial: 'cumulChargesPatInitial',
    cumul_heures_sup_initial: 'cumulHeuresSupInitial',
    cumul_jours_initial: 'cumulJoursInitial',
    cumuls_paie: 'cumulsPaie'
};
const CHAMPS_EMPLOYE_CAMEL_VERS_SNAKE = Object.fromEntries(
    Object.entries(CHAMPS_EMPLOYE_SNAKE_VERS_CAMEL).map(([snake, camel]) => [camel, snake])
);
function employeVersModele(corps) {
    const sortie = {};
    for (const [cle, valeur] of Object.entries(corps || {})) {
        sortie[CHAMPS_EMPLOYE_SNAKE_VERS_CAMEL[cle] || cle] = valeur;
    }
    return sortie;
}
const CHAMPS_EMPLOYE_DATE = new Set(['date_embauche', 'date_naissance', 'date_dernier_conge']);
function employeVersClient(emp) {
    const source = emp.toJSON ? emp.toJSON() : emp;
    const sortie = { ...source };
    for (const [camel, snake] of Object.entries(CHAMPS_EMPLOYE_CAMEL_VERS_SNAKE)) {
        if (source[camel] === undefined) continue;
        let valeur = source[camel];
        // Sequelize renvoie un objet Date pour une colonne DATE (sérialisé en
        // ISO complet, ex. "2026-03-01T00:00:00.000Z") — <input type="date">
        // n'accepte que "AAAA-MM-JJ", sinon le champ s'affichait vide à l'édition.
        if (CHAMPS_EMPLOYE_DATE.has(snake) && valeur instanceof Date) valeur = valeur.toISOString().slice(0, 10);
        sortie[snake] = valeur;
    }
    return sortie;
}

// Routes « rhDonnees » : server/routes/rhDonnees.js
require('./routes/rhDonnees')(app, { Absence, Employee, Evaluation, Formation, Template, authMiddleware, differences, employeVersClient, employeVersModele, journaliser });

// Routes « ia » : server/routes/ia.js
require('./routes/ia')(app, { aiService });

// Routes « documents » : server/routes/documents.js
require('./routes/documents')(app, { aiService, analyserModele, authMiddleware, checkConformity, decodeDataUrl, docEngine, extraireOffice, gateAiAccess, listerTypesDocuments, poserVariables, remplirOffice, templateEngine, upload });

// SPA Fallback : Rediriger toutes les requêtes non-API vers l'index.html de Vue
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const indexPath = path.join(__dirname, '../dist/index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    res.status(404).send('Frontend non trouvé. Veuillez exécuter "npm run build".');
});

/**
 * Route API inconnue — TOUTES MÉTHODES CONFONDUES.
 *
 * Le repli précédent ne couvrait que les GET : un POST vers une route
 * inexistante tombait sur le gestionnaire par défaut d'Express, qui répond en
 * HTML. Côté navigateur, le .json() échouait alors sur une page d'erreur, et le
 * message affiché ne disait rien de la vraie cause. Une API doit répondre en
 * JSON même quand elle n'a rien à répondre.
 */
app.all('/api/*', (req, res) => {
    res.status(404).json({
        error: `Route API introuvable : ${req.method} ${req.path}`,
        indice: "Si cette route vient d'être ajoutée, redémarrez le serveur."
    });
});

/**
 * Dernier filet : toute erreur non rattrapée par une route devient une réponse
 * JSON. Sans lui, Express renvoie une page HTML — ou rien du tout — et le
 * navigateur affiche « Unexpected end of JSON input », qui ne désigne pas la
 * cause. Mieux vaut un message exact qu'un symptôme.
 */
app.use((err, req, res, next) => {
    console.error(`❌ Erreur non rattrapée sur ${req.method} ${req.path} :`, err);
    if (res.headersSent) return next(err);
    const statut = err.status || err.statusCode || 500;
    // En dessous de 500, l'erreur est délibérément levée avec un statut (donc
    // un message pensé pour le client). À 500 (exception non prévue), le
    // message brut peut contenir des détails internes (chemins, requêtes SQL,
    // noms de modules...) — jamais à exposer, d'où le message générique.
    const messageClient = statut < 500 && err.message
        ? err.message
        : 'Une erreur interne est survenue. Veuillez réessayer plus tard.';
    res.status(statut).json({
        error: messageClient,
        route: `${req.method} ${req.path}`
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

server.listen(PORT, HOST, () => {
  console.log(`🚀 Serveur Backend lancé sur ${HOST}:${PORT}`);
  console.log(`🔗 URL locale: http://localhost:${PORT}`);
  console.log(`🤖 IA OpenRouter: ${process.env.OPENROUTER_MODEL || 'non configuré (ajoutez .env)'}`);
  
  // En mode Electron, on n'ouvre pas de navigateur externe
  if (process.env.IS_ELECTRON !== 'true' && process.env.NODE_ENV !== 'production') {
      const url = `http://localhost:${PORT}`;
      const startCommand = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      try {
          require('child_process').exec(`${startCommand} ${url}`);
      } catch (err) {
          console.log(`⚠️ Impossible d'ouvrir le navigateur automatiquement.`);
      }
  }
});
