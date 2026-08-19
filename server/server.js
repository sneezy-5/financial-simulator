require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const crypto = require('crypto');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const { Sequelize } = require('sequelize');
const { Visit, PayrollRequest, User, AdminUser, SubscriptionPlan, BankLoan, Transaction, Invoice, License, PayrollPeriod, PayslipRecord } = require('./database');
const payrollService = require('./payrollService');
const aiService = require('./aiService');
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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.set('trust proxy', true);

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

const upload = multer({ dest: 'uploads/' });

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
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

// ==========================================
// ROUTES D'AUTHENTIFICATION & CRÉDITS
// ==========================================

app.post('/api/auth/register', async (req, res) => {
    try {
        if (!bcrypt) throw new Error("bcrypt non installé");
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis" });

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) return res.status(400).json({ error: "Cet email est déjà utilisé" });

        const hashedPassword = await bcrypt.hash(password, 10);
        // Generate a 6-digit OTP code (e.g. 123456)
        const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

        const newUser = await User.create({
            email,
            password: hashedPassword,
            verificationToken: verificationToken
        });

        // Essai gratuit de 14 jours (niveau Starter) accordé automatiquement à l'inscription
        const trialUser = await billingService.grantTrial(newUser.id);

        // Envoi de l'email de vérification (non bloquant)
        emailService.sendVerificationEmail(newUser.email, verificationToken).catch(console.error);

        const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: newUser.id, email: newUser.email, subscriptionTier: trialUser.subscriptionTier, subscriptionExpiresAt: trialUser.subscriptionExpiresAt, subscriptionIsTrial: trialUser.subscriptionIsTrial, role: newUser.role } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        if (!bcrypt) throw new Error("bcrypt non installé");
        const { email, password } = req.body;

        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(401).json({ error: "Identifiants incorrects" });

        if (user.isBlocked) {
            return res.status(403).json({ error: "Votre compte a été suspendu par un administrateur." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: "Identifiants incorrects" });

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user.id, email: user.email, subscriptionTier: user.subscriptionTier, subscriptionExpiresAt: user.subscriptionExpiresAt, subscriptionIsTrial: user.subscriptionIsTrial, role: user.role } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(404).json({ error: "Aucun compte associé à cet email" });

        const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 heure
        await user.save();

        emailService.sendPasswordResetEmail(user.email, resetToken).catch(console.error);

        res.json({ success: true, message: "Un code de réinitialisation a été envoyé à votre adresse email" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        if (!bcrypt) throw new Error("bcrypt non installé");
        const { otp, newPassword, email } = req.body;

        if (!otp || !newPassword || !email) {
            return res.status(400).json({ error: "Code OTP, email et nouveau mot de passe requis" });
        }

        const user = await User.findOne({ 
            where: { 
                email,
                resetPasswordToken: otp,
                resetPasswordExpires: { [Sequelize.Op.gt]: new Date() }
            }
        });

        if (!user) {
            return res.status(400).json({ error: "Code OTP invalide ou expiré" });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        res.json({ success: true, message: "Mot de passe réinitialisé avec succès" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Nouvelle route pour vérifier le code OTP
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) return res.status(400).json({ error: "Email et code OTP requis" });

        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });

        if (user.verificationToken !== otp) {
            return res.status(400).json({ error: "Code OTP incorrect" });
        }

        user.emailVerified = true;
        user.verificationToken = null;
        await user.save();

        res.json({ success: true, message: "Compte vérifié avec succès" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, { attributes: { exclude: ['password'] } });
        if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
        res.json({ success: true, user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/auth/profile - Mettre à jour le profil (Nom, Entreprise, Téléphone, Type de compte)
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

        const { name, companyName, phone, accountType, companyNumeroCnps, companyNumeroContribuable } = req.body;
        if (name !== undefined) user.name = name;
        if (companyName !== undefined) user.companyName = companyName;
        if (phone !== undefined) user.phone = phone;
        if (accountType !== undefined) user.accountType = accountType;
        if (companyNumeroCnps !== undefined) user.companyNumeroCnps = companyNumeroCnps;
        if (companyNumeroContribuable !== undefined) user.companyNumeroContribuable = companyNumeroContribuable;

        await user.save();
        const updatedUser = user.toJSON();
        delete updatedUser.password;

        res.json({ success: true, user: updatedUser, message: "Profil mis à jour avec succès !" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

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
app.post('/api/billing/paystack/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
        console.error('❌ Webhook: PAYSTACK_WEBHOOK_SECRET non configuré');
        return res.sendStatus(500);
    }

    // Valider la signature Paystack
    const hash = crypto.createHmac('sha512', secret)
        .update(req.body)
        .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
        console.warn('⚠️ Webhook Paystack: signature invalide');
        return res.sendStatus(400);
    }

    let event;
    try {
        event = JSON.parse(req.body.toString());
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

// POST /api/admin/auth/login - Connexion Administrateur Dédiée
app.post('/api/admin/auth/login', async (req, res) => {
    try {
        if (!bcrypt) throw new Error("bcrypt non installé");
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Email et mot de passe admin requis" });

        const admin = await AdminUser.findOne({ where: { email } });
        if (!admin) return res.status(401).json({ error: "Identifiants Administrateur incorrects" });

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(401).json({ error: "Identifiants Administrateur incorrects" });

        admin.lastLogin = new Date();
        await admin.save();

        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: admin.role, scope: 'admin' },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({
            success: true,
            token,
            admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin/auth/me - Profil Administrateur connecté
app.get('/api/admin/auth/me', adminAuthMiddleware, async (req, res) => {
    try {
        res.json({
            success: true,
            admin: { id: req.admin.id, email: req.admin.email, name: req.admin.name, role: req.admin.role }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const adminMiddleware = adminAuthMiddleware;

// GET /api/admin/users - Liste des utilisateurs inscrits
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
        const { search } = req.query;
        const whereClause = {};
        if (search) {
            whereClause.email = { [Sequelize.Op.like]: `%${search}%` };
        }
        const users = await User.findAll({
            where: whereClause,
            attributes: { exclude: ['password'] },
            order: [['createdAt', 'DESC']]
        });
        res.json({ success: true, users });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/users - Création manuelle d'un utilisateur par un Admin
app.post('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
        if (!bcrypt) throw new Error("bcrypt non installé");
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis" });

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) return res.status(400).json({ error: "Cet email est déjà utilisé" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            email,
            password: hashedPassword,
            emailVerified: true
        });

        res.json({
            success: true,
            user: { id: newUser.id, email: newUser.email, subscriptionTier: newUser.subscriptionTier, subscriptionExpiresAt: newUser.subscriptionExpiresAt, role: newUser.role, createdAt: newUser.createdAt }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/admin/users/:id/subscription - Octroi/prolongation manuelle d'un abonnement
// (ex : paiement Mobile Money reçu hors Paystack)
app.put('/api/admin/users/:id/subscription', adminMiddleware, async (req, res) => {
    try {
        const { tier, days } = req.body;
        const targetUser = await User.findByPk(req.params.id);
        if (!targetUser) return res.status(404).json({ error: "Utilisateur non trouvé" });

        if (!tier) {
            // Désactivation manuelle de l'abonnement
            targetUser.subscriptionTier = null;
            targetUser.subscriptionExpiresAt = null;
            targetUser.bulletinsUsed = 0;
            targetUser.periodStartedAt = null;
            await targetUser.save();
            return res.json({ success: true, user: { id: targetUser.id, email: targetUser.email, subscriptionTier: null, subscriptionExpiresAt: null, bulletinsUsed: 0 } });
        }

        const plan = await billingService.getPlanByCode(tier);
        if (!plan) return res.status(400).json({ error: "Palier d'abonnement inconnu." });

        const durationDays = parseInt(days) > 0 ? parseInt(days) : 30;
        const now = new Date();
        targetUser.subscriptionTier = plan.tier || plan.code;
        targetUser.subscriptionExpiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
        targetUser.bulletinsUsed = 0;
        targetUser.periodStartedAt = now;
        targetUser.subscriptionIsTrial = false;
        await targetUser.save();

        res.json({
            success: true,
            user: { id: targetUser.id, email: targetUser.email, subscriptionTier: targetUser.subscriptionTier, subscriptionExpiresAt: targetUser.subscriptionExpiresAt, bulletinsUsed: targetUser.bulletinsUsed }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/admin/users/:id/toggle-block - Blocage / Déblocage d'un compte
app.put('/api/admin/users/:id/toggle-block', adminMiddleware, async (req, res) => {
    try {
        const targetUser = await User.findByPk(req.params.id);
        if (!targetUser) return res.status(404).json({ error: "Utilisateur non trouvé" });

        targetUser.isBlocked = !targetUser.isBlocked;
        await targetUser.save();

        res.json({ 
            success: true, 
            isBlocked: targetUser.isBlocked, 
            message: targetUser.isBlocked ? `Compte de ${targetUser.email} suspendu.` : `Compte de ${targetUser.email} réactivé.` 
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/users/:id - Suppression d'un compte
app.delete('/api/admin/users/:id', adminMiddleware, async (req, res) => {
    try {
        const targetUser = await User.findByPk(req.params.id);
        if (!targetUser) return res.status(404).json({ error: "Utilisateur non trouvé" });

        // Nettoyage manuel des associations pour SQLite
        const periods = await PayrollPeriod.findAll({ where: { userId: targetUser.id } });
        for (const p of periods) {
            await PayslipRecord.destroy({ where: { periodId: p.id } });
        }
        await PayrollPeriod.destroy({ where: { userId: targetUser.id } });
        await Transaction.destroy({ where: { userId: targetUser.id } });
        await Invoice.destroy({ where: { userId: targetUser.id } });

        await targetUser.destroy();
        res.json({ success: true, message: `Utilisateur ${targetUser.email} supprimé avec succès.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin/analytics/countries - Statistiques de trafic par pays
app.get('/api/admin/analytics/countries', adminMiddleware, async (req, res) => {
    try {
        const countryStats = await Visit.findAll({
            attributes: ['country', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
            group: ['country'],
            order: [[Sequelize.literal('count'), 'DESC']]
        });
        res.json({ success: true, countryStats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// ROUTES PUBLIQUES DES FORMULES D'ABONNEMENT
// ==========================================

// GET /api/billing/plans - Liste des formules d'abonnement actives pour les clients
app.get('/api/billing/plans', async (req, res) => {
    try {
        const plans = await billingService.getActivePlans();
        res.json({ success: true, plans });
    } catch (e) {
        res.status(500).json({ error: e.message });
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
        res.status(500).json({ error: e.message });
    }
});

// GET /api/billing/invoices/:id/download - Télécharger le PDF d'une facture (propriétaire uniquement)
app.get('/api/billing/invoices/:id/download', authMiddleware, async (req, res) => {
    try {
        const invoice = await Invoice.findByPk(req.params.id);
        if (!invoice || invoice.userId !== req.user.id) {
            return res.status(404).json({ error: "Facture introuvable" });
        }
        if (!invoice.pdfPath || !fs.existsSync(invoice.pdfPath)) {
            return res.status(404).json({ error: "Fichier de facture introuvable" });
        }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
        fs.createReadStream(invoice.pdfPath).pipe(res);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// ROUTES ADMIN DES FORMULES D'ABONNEMENT (CRUD TARIFS)
// ==========================================

// GET /api/admin/subscription-plans - Obtenir la liste complète des formules (Admin)
app.get('/api/admin/subscription-plans', adminMiddleware, async (req, res) => {
    try {
        const plans = await SubscriptionPlan.findAll({
            order: [['price', 'ASC']]
        });
        res.json({ success: true, plans });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/subscription-plans - Créer une nouvelle formule d'abonnement
app.post('/api/admin/subscription-plans', adminMiddleware, async (req, res) => {
    try {
        const { code, tier, billingCycle, name, bulletinLimit, price, popular, active } = req.body;
        if (!code || !name || !bulletinLimit || !price) {
            return res.status(400).json({ error: "Code, nom, volume de bulletins et prix requis" });
        }

        const newPlan = await SubscriptionPlan.create({
            code,
            tier: tier || code,
            billingCycle: billingCycle || 'monthly',
            name,
            bulletinLimit: parseInt(bulletinLimit),
            price: parseInt(price),
            popular: Boolean(popular),
            active: active !== undefined ? Boolean(active) : true
        });

        res.json({ success: true, plan: newPlan, message: "Formule d'abonnement créée avec succès !" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/admin/subscription-plans/:id - Modifier une formule d'abonnement
app.put('/api/admin/subscription-plans/:id', adminMiddleware, async (req, res) => {
    try {
        const plan = await SubscriptionPlan.findByPk(req.params.id);
        if (!plan) return res.status(404).json({ error: "Formule d'abonnement introuvable" });

        const { code, tier, billingCycle, name, bulletinLimit, price, popular, active } = req.body;
        if (code !== undefined) plan.code = code;
        if (tier !== undefined) plan.tier = tier;
        if (billingCycle !== undefined) plan.billingCycle = billingCycle;
        if (name !== undefined) plan.name = name;
        if (bulletinLimit !== undefined) plan.bulletinLimit = parseInt(bulletinLimit);
        if (price !== undefined) plan.price = parseInt(price);
        if (popular !== undefined) plan.popular = Boolean(popular);
        if (active !== undefined) plan.active = Boolean(active);

        await plan.save();
        res.json({ success: true, plan, message: "Formule mise à jour avec succès !" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/subscription-plans/:id - Supprimer une formule d'abonnement
app.delete('/api/admin/subscription-plans/:id', adminMiddleware, async (req, res) => {
    try {
        const plan = await SubscriptionPlan.findByPk(req.params.id);
        if (!plan) return res.status(404).json({ error: "Formule d'abonnement introuvable" });

        await plan.destroy();
        res.json({ success: true, message: "Formule d'abonnement supprimée." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// LICENCES ENTREPRISE (Édition installable)
// ==========================================

// POST /api/licenses/activate - Active une licence sur une installation (première utilisation)
app.post('/api/licenses/activate', async (req, res) => {
    try {
        const { licenseKey, installationId } = req.body;
        const result = await licenseService.activateLicense(licenseKey, installationId);
        if (!result.ok) return res.status(400).json({ error: result.message, reason: result.reason });
        res.json({ success: true, token: result.token, expiresAt: result.expiresAt });
    } catch (e) {
        res.status(500).json({ error: e.message });
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
        res.status(500).json({ error: e.message });
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

// GET /api/admin/licenses - Liste des licences entreprise (Admin)
app.get('/api/admin/licenses', adminMiddleware, async (req, res) => {
    try {
        const licenses = await License.findAll({ order: [['createdAt', 'DESC']] });
        res.json({ success: true, licenses });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/licenses - Créer une nouvelle licence (la clé n'est retournée qu'une fois)
app.post('/api/admin/licenses', adminMiddleware, async (req, res) => {
    try {
        const { companyName, contactEmail, expiresAt, price, notes } = req.body;
        if (!companyName) return res.status(400).json({ error: "Nom de l'entreprise requis" });

        const license = await License.create({
            licenseKey: licenseService.generateLicenseKey(),
            companyName,
            contactEmail: contactEmail || null,
            expiresAt: expiresAt || null,
            price: price !== undefined ? parseInt(price) : 500000,
            notes: notes || null
        });

        res.json({ success: true, license, message: "Licence créée avec succès. Transmettez la clé à l'entreprise." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/admin/licenses/:id - Modifier une licence (prolonger, révoquer, réinitialiser l'activation)
app.put('/api/admin/licenses/:id', adminMiddleware, async (req, res) => {
    try {
        const license = await License.findByPk(req.params.id);
        if (!license) return res.status(404).json({ error: "Licence introuvable" });

        const { companyName, contactEmail, status, expiresAt, price, notes, resetActivation } = req.body;
        if (companyName !== undefined) license.companyName = companyName;
        if (contactEmail !== undefined) license.contactEmail = contactEmail;
        if (status !== undefined) license.status = status;
        if (expiresAt !== undefined) license.expiresAt = expiresAt || null;
        if (price !== undefined) license.price = parseInt(price);
        if (notes !== undefined) license.notes = notes;
        if (resetActivation) {
            license.installationId = null;
            license.activatedAt = null;
        }

        await license.save();
        res.json({ success: true, license, message: "Licence mise à jour avec succès !" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/licenses/:id - Supprimer une licence
app.delete('/api/admin/licenses/:id', adminMiddleware, async (req, res) => {
    try {
        const license = await License.findByPk(req.params.id);
        if (!license) return res.status(404).json({ error: "Licence introuvable" });

        await license.destroy();
        res.json({ success: true, message: "Licence supprimée." });
    } catch (e) {
        res.status(500).json({ error: e.message });
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
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin/bank-loans - Liste complète des offres bancaires (Admin)
app.get('/api/admin/bank-loans', adminMiddleware, async (req, res) => {
    try {
        const loans = await BankLoan.findAll({
            order: [['country', 'ASC'], ['bankName', 'ASC']]
        });
        res.json({ success: true, loans });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/bank-loans - Créer une nouvelle offre de prêt bancaire
app.post('/api/admin/bank-loans', adminMiddleware, async (req, res) => {
    try {
        const { bankName, loanName, country, interestRate, minAmount, maxAmount, minDurationMonths, maxDurationMonths, description, active } = req.body;
        if (!bankName || !loanName || !interestRate) {
            return res.status(400).json({ error: "Nom de banque, nom de prêt et taux d'intérêt requis" });
        }

        const newLoan = await BankLoan.create({
            bankName,
            loanName,
            country: country || 'CI',
            interestRate: parseFloat(interestRate),
            minAmount: parseInt(minAmount) || 500000,
            maxAmount: parseInt(maxAmount) || 30000000,
            minDurationMonths: parseInt(minDurationMonths) || 6,
            maxDurationMonths: parseInt(maxDurationMonths) || 72,
            description: description || '',
            active: active !== undefined ? Boolean(active) : true
        });

        res.json({ success: true, loan: newLoan, message: "Offre de prêt bancaire créée avec succès !" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/admin/bank-loans/:id - Modifier une offre de prêt bancaire
app.put('/api/admin/bank-loans/:id', adminMiddleware, async (req, res) => {
    try {
        const loan = await BankLoan.findByPk(req.params.id);
        if (!loan) return res.status(404).json({ error: "Offre de prêt introuvable" });

        const { bankName, loanName, country, interestRate, minAmount, maxAmount, minDurationMonths, maxDurationMonths, description, active } = req.body;
        if (bankName !== undefined) loan.bankName = bankName;
        if (loanName !== undefined) loan.loanName = loanName;
        if (country !== undefined) loan.country = country;
        if (interestRate !== undefined) loan.interestRate = parseFloat(interestRate);
        if (minAmount !== undefined) loan.minAmount = parseInt(minAmount);
        if (maxAmount !== undefined) loan.maxAmount = parseInt(maxAmount);
        if (minDurationMonths !== undefined) loan.minDurationMonths = parseInt(minDurationMonths);
        if (maxDurationMonths !== undefined) loan.maxDurationMonths = parseInt(maxDurationMonths);
        if (description !== undefined) loan.description = description;
        if (active !== undefined) loan.active = Boolean(active);

        await loan.save();
        res.json({ success: true, loan, message: "Offre mise à jour !" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/bank-loans/:id - Supprimer une offre de prêt bancaire
app.delete('/api/admin/bank-loans/:id', adminMiddleware, async (req, res) => {
    try {
        const loan = await BankLoan.findByPk(req.params.id);
        if (!loan) return res.status(404).json({ error: "Offre de prêt introuvable" });

        await loan.destroy();
        res.json({ success: true, message: "Offre de prêt supprimée." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// ROUTES RH (Extraction & PDF)
// ==========================================

app.post('/api/rh/extract-headers', upload.single('file'), (req, res) => {
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
        res.status(500).json({ error: error.message || "Erreur de lecture du fichier" });
    }
});

app.post('/api/rh/extract-data', upload.single('file'), (req, res) => {
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
        res.status(500).json({ error: error.message || "Erreur de lecture du fichier" });
    }
});

// POST /api/rh/smart-mapping - Suggestions de mapping de colonnes par IA (en overlay du mapping
// par mots-clés déjà calculé côté frontend ; ne bloque jamais l'import en cas d'échec)
app.post('/api/rh/smart-mapping', authMiddleware, async (req, res) => {
    try {
        const { headers, fields } = req.body;
        if (!Array.isArray(headers) || headers.length === 0 || !Array.isArray(fields) || fields.length === 0) {
            return res.status(400).json({ error: "En-têtes et champs standards requis." });
        }
        const mapping = await aiService.suggestColumnMapping(headers, fields);
        res.json({ success: true, mapping });
    } catch (e) {
        console.error('Erreur smart mapping IA:', e.message);
        res.status(500).json({ error: e.message });
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
        const country = req.body.country || 'CI';
        const mois = parseInt(req.body.mois) || (new Date().getMonth() + 1);
        const annee = parseInt(req.body.annee) || new Date().getFullYear();

        console.log("RAW body employeesData:", req.body.employeesData ? req.body.employeesData.substring(0, 100) + '...' : null);
        const employeesData = req.body.employeesData ? JSON.parse(req.body.employeesData) : null;
        console.log("Parsed employeesData is Array?", Array.isArray(employeesData), "Length:", employeesData ? employeesData.length : 0);

        const leavesToProcess = req.body.leavesToProcess ? JSON.parse(req.body.leavesToProcess) : [];

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

        const plan = await billingService.getPlanByCode(userObj.subscriptionTier);
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

        // Historique de paie (fondation des futures déclarations CNPS/ITS/CMU) : la période est
        // validée dès sa première génération — pas d'étape de confirmation manuelle séparée — et
        // reste régénérable à volonté pour permettre de corriger une erreur de saisie.
        let period = await PayrollPeriod.findOne({ where: { userId: userObj.id, mois, annee, country } });
        if (!period) {
            period = await PayrollPeriod.create({ userId: userObj.id, mois, annee, country, status: 'validated', validatedAt: new Date() });
        } else if (period.status !== 'validated') {
            period.status = 'validated';
            period.validatedAt = new Date();
            await period.save();
        }

        const payrollReq = await PayrollRequest.create({
            filename: dataFile ? dataFile.originalname : 'Local_DB_Export',
            status: 'PROCESSING'
        });

        const zipFilename = `bulletins_${payrollReq.id}_${Date.now()}.zip`;
        const zipPath = path.join(__dirname, 'uploads', zipFilename);

        console.log(`🚀 Démarrage traitement RH (${country}) pour: ${dataFile ? dataFile.originalname : 'Données locales'}`);

        let result;
        if (employeesData) {
             result = await payrollService.processPayrollJson(
                employeesData,
                zipPath,
                finalTemplatePath,
                mapping,
                htmlTemplate,
                country,
                leavesToProcess
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
                leavesToProcess
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

        // Incrémentation du quota consommé ou décrémentation des crédits
        if (quotaCheck.useCredits) {
            userObj.credits -= result.count;
        } else {
            userObj.bulletinsUsed = (userObj.bulletinsUsed || 0) + result.count;
        }
        await userObj.save();

        console.log(`✅ ${result.count} bulletins (${result.type}) générés.`);

        res.json({
            success: true,
            message: `${result.count} bulletins générés (${result.type}) !`,
            jobId: payrollReq.id,
            zipUrl: `/api/rh/download/${zipFilename}`,
            periodId: period.id,
            periodStatus: period.status,
            leavesProcessed: leavesToProcess,
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
        res.status(500).json({ error: error.message || "Erreur lors du traitement" });
    }
});

// ─── Périodes de paie (historique + validation — fondation des futures déclarations) ──────

// GET /api/rh/periods - Liste des périodes de l'utilisateur connecté
app.get('/api/rh/periods', authMiddleware, async (req, res) => {
    try {
        const periods = await PayrollPeriod.findAll({
            where: { userId: req.user.id },
            order: [['annee', 'DESC'], ['mois', 'DESC']]
        });
        const periodsWithCount = await Promise.all(periods.map(async (p) => {
            const employeeCount = await PayslipRecord.count({ where: { periodId: p.id } });
            return { ...p.toJSON(), employeeCount };
        }));
        res.json({ success: true, periods: periodsWithCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/rh/periods/:id - Détail d'une période + ses bulletins enregistrés
app.get('/api/rh/periods/:id', authMiddleware, async (req, res) => {
    try {
        const period = await PayrollPeriod.findByPk(req.params.id);
        if (!period || period.userId !== req.user.id) {
            return res.status(404).json({ error: "Période introuvable" });
        }
        const records = await PayslipRecord.findAll({ where: { periodId: period.id } });
        res.json({ success: true, period, records });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

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
        res.status(500).json({ error: e.message });
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
        res.status(500).json({ error: e.message });
    }
});

// ─── Génération bulletin individuel (Simulateur manuel) ───────────────────
app.post('/api/rh/generate-single-payslip', authMiddleware, async (req, res) => {
    try {
        const { employee, htmlTemplate } = req.body;
        if (!employee || !employee.nom) {
            return res.status(400).json({ error: 'Données employé manquantes' });
        }

        // Vérification du quota d'abonnement (1 bulletin)
        const userObj = await User.findByPk(req.user.id);
        if (!userObj) {
            return res.status(404).json({ error: "Utilisateur non trouvé" });
        }

        const plan = await billingService.getPlanByCode(userObj.subscriptionTier);
        const quotaCheck = billingService.checkQuota(userObj, plan, 1);
        if (!quotaCheck.ok) {
            return res.status(402).json({
                error: billingService.quotaErrorMessage(quotaCheck.reason, { plan, user: userObj, countNeeded: 1 }),
                reason: quotaCheck.reason,
                ...billingService.getSubscriptionSnapshot(userObj, plan)
            });
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

        const pdfBuffer = await payrollService.generateSinglePdf(employee, calculs, companyInfo, htmlTemplate);

        // Incrémentation du quota consommé après génération réussie
        userObj.bulletinsUsed = (userObj.bulletinsUsed || 0) + 1;
        await userObj.save();

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
        // Génération dynamique du modèle avec les colonnes exactes du Smart Mapping
        const wb = XLSX.utils.book_new();

        // Feuille EMPLOYES avec les colonnes attendues
        const employeHeaders = [
            'nom', 'prenom', 'matricule', 'salaire_base', 'sursalaire',
            'prime_transport', 'prime_logement', 'heures_sup_nb',
            'jours_travailles', 'absences_jours',
            'poste', 'categorie', 'date_embauche',
            'nom_entreprise', 'id_employe'
        ];
        const exampleRow = {
            nom: 'KONAN', prenom: 'Yao', matricule: 'EMP-001',
            salaire_base: 350000, sursalaire: 0, prime_transport: 30000,
            prime_logement: 50000, heures_sup_nb: 0,
            jours_travailles: 26, absences_jours: 0,
            poste: 'Comptable', categorie: 'Agent de maîtrise',
            date_embauche: '2020-01-15',
            nom_entreprise: 'MA SOCIETE SARL', id_employe: 1
        };
        const wsEmployes = XLSX.utils.json_to_sheet([exampleRow], { header: employeHeaders });
        XLSX.utils.book_append_sheet(wb, wsEmployes, 'EMPLOYES');

        // Feuille INFORMATIONS_ENTREPRISE
        const entrepriseData = [{
            nom_entreprise: 'MA SOCIETE SARL',
            adresse: 'Abidjan, Cocody',
            telephone: '+225 07 00 00 00',
            cnps_employeur: 'CNPS-00000',
            regime_fiscal: 'Réel simplifié'
        }];
        const wsEntreprise = XLSX.utils.json_to_sheet(entrepriseData);
        XLSX.utils.book_append_sheet(wb, wsEntreprise, 'INFORMATIONS_ENTREPRISE');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename=modele_paie_ONDA.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.send(buf);
    }

    if (fileName === 'modele-presence.xlsx') {
        // Modèle léger pour l'import "fiche de présence" (Saisie Mensuelle) : juste le matricule
        // et les champs variables du mois, sans réimporter toute la fiche employé.
        const wb = XLSX.utils.book_new();
        const headers = ['matricule', 'jours_travailles', 'heures_sup_nb', 'absences_jours'];
        const exampleRow = { matricule: 'EMP-001', jours_travailles: 26, heures_sup_nb: 0, absences_jours: 0 };
        const ws = XLSX.utils.json_to_sheet([exampleRow], { header: headers });
        XLSX.utils.book_append_sheet(wb, ws, 'PRESENCE');

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
        current: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        available: [
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Gratuit)' },
            { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku (Équilibré)' },
            { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (OpenAI)' },
            { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Gratuit)' },
        ]
    });
});

/**
 * POST /api/rh/analyze-pdf-template
 * Analyse OCR Vision du PDF pour l'auto-mapping HTML-to-PDF
 * Inclus sans coût supplémentaire pour tout utilisateur connecté.
 */
app.post('/api/rh/analyze-pdf-template', authMiddleware, async (req, res) => {
    try {
        const { imageBase64 } = req.body;
        if (!imageBase64) return res.status(400).json({ error: 'Image manquante' });

        const htmlTemplate = await aiService.rebuildPayslipTemplate(imageBase64);

        res.json({ success: true, htmlTemplate });
    } catch (e) {
        console.error('Erreur IA Auto-Mapping:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Gestion globale des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur Backend lancé sur le port ${PORT}`);
  console.log(`🔗 URL locale: http://localhost:${PORT}`);
  console.log(`🤖 IA OpenRouter: ${process.env.OPENROUTER_MODEL || 'non configuré (ajoutez .env)'}`);
});
