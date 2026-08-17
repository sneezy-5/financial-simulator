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
const { Visit, PayrollRequest, User, AdminUser, CreditPack, BankLoan, Transaction } = require('./database');
const payrollService = require('./payrollService');
const aiService = require('./aiService');
const emailService = require('./emailService');
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
            credits: 5,
            verificationToken: verificationToken
        });

        // Envoi de l'email de vérification (non bloquant)
        emailService.sendVerificationEmail(newUser.email, verificationToken).catch(console.error);

        const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: newUser.id, email: newUser.email, credits: newUser.credits, role: newUser.role } });
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
        res.json({ success: true, token, user: { id: user.id, email: user.email, credits: user.credits, role: user.role } });
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

        const { name, companyName, phone, accountType } = req.body;
        if (name !== undefined) user.name = name;
        if (companyName !== undefined) user.companyName = companyName;
        if (phone !== undefined) user.phone = phone;
        if (accountType !== undefined) user.accountType = accountType;

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
        const { reference, credits, amount } = req.body;
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
            if (paystackAmount < amount) {
                 return res.status(400).json({ error: "Montant payé insuffisant." });
            }

            // Enregistrer ou mettre à jour la transaction
            if (existingTx) {
                existingTx.status = 'success';
                await existingTx.save();
            } else {
                await Transaction.create({
                    reference,
                    amount: paystackAmount,
                    credits,
                    status: 'success',
                    userId
                });
            }

            // Ajouter les crédits
            const user = await User.findByPk(userId);
            user.credits += parseInt(credits) || 0;
            await user.save();

            // Émettre l'événement de notification en temps réel
            io.to(`user_${userId}`).emit('payment_success', {
              credits: user.credits,
              message: `${credits} crédits ajoutés avec succès !`
            });

            return res.json({ success: true, credits: user.credits, message: `${credits} crédits ajoutés avec succès !` });
        } else {
            // Transaction échouée ou invalide
            if (!existingTx) {
                 await Transaction.create({
                    reference,
                    amount: amount || 0,
                    credits: credits || 0,
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

            // Éviter le double traitement
            const existingTx = await Transaction.findOne({ where: { reference } });
            if (existingTx && existingTx.status === 'success') {
                console.log(`ℹ️ Webhook: Transaction ${reference} déjà traitée, ignorée.`);
                return;
            }

            // Extraire les métadonnées (userId, credits envoyés depuis le client)
            const metadata = data.metadata || {};
            const userId = metadata.userId || (data.customer && data.customer.metadata && data.customer.metadata.userId);
            const credits = parseInt(metadata.credits) || 0;

            if (!userId) {
                console.warn(`⚠️ Webhook: userId manquant dans les métadonnées pour ${reference}`);
                return;
            }

            // Enregistrer ou mettre à jour la transaction
            if (existingTx) {
                existingTx.status = 'success';
                existingTx.amount = amountPaid;
                await existingTx.save();
            } else {
                await Transaction.create({
                    reference,
                    amount: amountPaid,
                    credits,
                    status: 'success',
                    userId
                });
            }

            // Créditer l'utilisateur
            const user = await User.findByPk(userId);
            if (user) {
                user.credits += credits;
                await user.save();
                console.log(`✅ Webhook: ${credits} crédits ajoutés à l'utilisateur ${userId} (ref: ${reference})`);

                // Notification temps réel via Socket.IO
                io.to(`user_${userId}`).emit('payment_success', {
                    credits: user.credits,
                    added: credits,
                    reference,
                    message: `${credits} crédits ajoutés via webhook Paystack !`
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
        const { email, password, credits } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis" });

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) return res.status(400).json({ error: "Cet email est déjà utilisé" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            email,
            password: hashedPassword,
            credits: parseInt(credits) >= 0 ? parseInt(credits) : 50,
            emailVerified: true
        });

        res.json({
            success: true,
            user: { id: newUser.id, email: newUser.email, credits: newUser.credits, role: newUser.role, createdAt: newUser.createdAt }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/admin/users/:id/credits - Ajustement manuel des crédits
app.put('/api/admin/users/:id/credits', adminMiddleware, async (req, res) => {
    try {
        const { credits } = req.body;
        const targetUser = await User.findByPk(req.params.id);
        if (!targetUser) return res.status(404).json({ error: "Utilisateur non trouvé" });

        targetUser.credits = Math.max(0, parseInt(credits) || 0);
        await targetUser.save();

        res.json({ success: true, user: { id: targetUser.id, email: targetUser.email, credits: targetUser.credits } });
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
// ROUTES PUBLIQUES DES PACKS DE CRÉDITS
// ==========================================

// GET /api/billing/packs - Liste des offres de crédits actives pour les clients
app.get('/api/billing/packs', async (req, res) => {
    try {
        const packs = await CreditPack.findAll({
            where: { active: true },
            order: [['price', 'ASC']]
        });
        res.json({ success: true, packs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// ROUTES ADMIN DES PACKS DE CRÉDITS (CRUD TARIFS)
// ==========================================

// GET /api/admin/credit-packs - Obtenir la liste complète des packs (Admin)
app.get('/api/admin/credit-packs', adminMiddleware, async (req, res) => {
    try {
        const packs = await CreditPack.findAll({
            order: [['price', 'ASC']]
        });
        res.json({ success: true, packs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/credit-packs - Créer une nouvelle offre / pack de crédits
app.post('/api/admin/credit-packs', adminMiddleware, async (req, res) => {
    try {
        const { name, credits, price, popular, active } = req.body;
        if (!name || !credits || !price) {
            return res.status(400).json({ error: "Nom, quantité de crédits et prix requis" });
        }

        const newPack = await CreditPack.create({
            name,
            credits: parseInt(credits),
            price: parseInt(price),
            popular: Boolean(popular),
            active: active !== undefined ? Boolean(active) : true
        });

        res.json({ success: true, pack: newPack, message: "Pack de crédits créé avec succès !" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/admin/credit-packs/:id - Modifier un pack de crédits
app.put('/api/admin/credit-packs/:id', adminMiddleware, async (req, res) => {
    try {
        const pack = await CreditPack.findByPk(req.params.id);
        if (!pack) return res.status(404).json({ error: "Pack de crédits introuvable" });

        const { name, credits, price, popular, active } = req.body;
        if (name !== undefined) pack.name = name;
        if (credits !== undefined) pack.credits = parseInt(credits);
        if (price !== undefined) pack.price = parseInt(price);
        if (popular !== undefined) pack.popular = Boolean(popular);
        if (active !== undefined) pack.active = Boolean(active);

        await pack.save();
        res.json({ success: true, pack, message: "Pack mis à jour avec succès !" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/credit-packs/:id - Supprimer un pack de crédits
app.delete('/api/admin/credit-packs/:id', adminMiddleware, async (req, res) => {
    try {
        const pack = await CreditPack.findByPk(req.params.id);
        if (!pack) return res.status(404).json({ error: "Pack de crédits introuvable" });

        await pack.destroy();
        res.json({ success: true, message: "Pack de crédits supprimé." });
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

        let sheetName = workbook.SheetNames.find(n =>
            n.toUpperCase() === 'EMPLOYES' || n.toUpperCase() === 'EMPLOYÉS'
        ) || workbook.SheetNames[0];

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

        res.json({ success: true, headers });
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

const cpUpload = upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'template', maxCount: 1 }
]);

app.post('/api/rh/generate-pay-slips', authMiddleware, cpUpload, async (req, res) => {
    try {
        const dataFile = req.files['file'] ? req.files['file'][0] : null;
        const templateFile = req.files['template'] ? req.files['template'][0] : null;
        const mapping = req.body.mapping ? JSON.parse(req.body.mapping) : null;
        const htmlTemplate = req.body.htmlTemplate ? req.body.htmlTemplate : null;
        
        console.log("RAW body employeesData:", req.body.employeesData ? req.body.employeesData.substring(0, 100) + '...' : null);
        const employeesData = req.body.employeesData ? JSON.parse(req.body.employeesData) : null;
        console.log("Parsed employeesData is Array?", Array.isArray(employeesData), "Length:", employeesData ? employeesData.length : 0);

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
                let employesSheetName = workbook.SheetNames.find(n =>
                    n.toUpperCase() === 'EMPLOYES' ||
                    n.toUpperCase() === 'EMPLOYÉS'
                ) || (workbook.SheetNames.length === 1 ? workbook.SheetNames[0] : null);

                if (!employesSheetName) {
                    if (finalDataPath && fs.existsSync(finalDataPath)) fs.unlinkSync(finalDataPath);
                    if (finalTemplatePath && fs.existsSync(finalTemplatePath)) fs.unlinkSync(finalTemplatePath);
                    return res.status(400).json({ error: "Feuille 'EMPLOYES' introuvable dans le fichier Excel." });
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

        const requiredCredits = employeeCount * 5;
        if (userObj.credits < requiredCredits) {
            if (finalDataPath && fs.existsSync(finalDataPath)) fs.unlinkSync(finalDataPath);
            if (finalTemplatePath && fs.existsSync(finalTemplatePath)) fs.unlinkSync(finalTemplatePath);
            return res.status(402).json({ error: `Crédits insuffisants. Il vous faut ${requiredCredits} crédits pour générer ${employeeCount} bulletins de paie (5 crédits par bulletin). Solde actuel : ${userObj.credits} crédits.` });
        }

        const payrollReq = await PayrollRequest.create({
            filename: dataFile ? dataFile.originalname : 'Local_DB_Export',
            status: 'PROCESSING'
        });

        const zipFilename = `bulletins_${payrollReq.id}_${Date.now()}.zip`;
        const zipPath = path.join(__dirname, 'uploads', zipFilename);

        const country = req.body.country || 'CI';
        console.log(`🚀 Démarrage traitement RH (${country}) pour: ${dataFile ? dataFile.originalname : 'Données locales'}`);

        let result;
        if (employeesData) {
             result = await payrollService.processPayrollJson(
                employeesData,
                zipPath,
                finalTemplatePath,
                mapping,
                htmlTemplate,
                country
             );
        } else {
             result = await payrollService.processPayrollFile(
                finalDataPath,
                zipPath,
                finalTemplatePath,
                mapping,
                htmlTemplate,
                country
             );
        }

        await payrollReq.update({
            status: 'SUCCESS',
            employeeCount: result.count
        });

        // Déduction des crédits après traitement réussi
        userObj.credits = Math.max(0, userObj.credits - requiredCredits);
        await userObj.save();

        console.log(`✅ ${result.count} bulletins (${result.type}) générés. ${requiredCredits} crédits consommés.`);

        res.json({
            success: true,
            message: `${result.count} bulletins générés (${result.type}) !`,
            jobId: payrollReq.id,
            zipUrl: `/api/rh/download/${zipFilename}`,
            creditsRemaining: userObj.credits,
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

// ─── Génération bulletin individuel (Simulateur manuel) ───────────────────
app.post('/api/rh/generate-single-payslip', authMiddleware, async (req, res) => {
    try {
        const { employee, htmlTemplate } = req.body;
        if (!employee || !employee.nom) {
            return res.status(400).json({ error: 'Données employé manquantes' });
        }

        // Vérification des crédits (5 crédits par bulletin)
        const userObj = await User.findByPk(req.user.id);
        if (!userObj) {
            return res.status(404).json({ error: "Utilisateur non trouvé" });
        }

        if (userObj.credits < 5) {
            return res.status(402).json({ error: `Crédits insuffisants. Il vous faut 5 crédits pour générer ce bulletin de paie. Votre solde actuel : ${userObj.credits} crédits.` });
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

        // Déduction des crédits après génération réussie
        userObj.credits = Math.max(0, userObj.credits - 5);
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
            'poste', 'categorie', 'date_embauche',
            'nom_entreprise', 'id_employe'
        ];
        const exampleRow = {
            nom: 'KONAN', prenom: 'Yao', matricule: 'EMP-001',
            salaire_base: 350000, sursalaire: 0, prime_transport: 30000,
            prime_logement: 50000, heures_sup_nb: 0,
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
 * COÛT: 1 Crédit IA
 */
app.post('/api/rh/analyze-pdf-template', authMiddleware, async (req, res) => {
    try {
        const { imageBase64 } = req.body;
        if (!imageBase64) return res.status(400).json({ error: 'Image manquante' });

        // Vérification des crédits
        const user = await User.findByPk(req.user.id);
        if (user.credits < 1) {
            return res.status(402).json({ error: 'Crédits insuffisants. Veuillez recharger votre compte.' });
        }

        const htmlTemplate = await aiService.rebuildPayslipTemplate(imageBase64);

        // Déduction du crédit
        user.credits -= 1;
        await user.save();

        res.json({ success: true, htmlTemplate, creditsRemaining: user.credits });
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
