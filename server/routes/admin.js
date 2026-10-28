// Routes — Administration : utilisateurs, statistiques, formules, licences, offres bancaires.
// Extraites telles quelles de server.js (phase 6) ; server.js leur passe ses
// dépendances (middlewares, modèles, services) au moment de l'enregistrement.

module.exports = function enregistrerRoutesAdmin(app, deps) {
    const {
        AdminUser,
        BankLoan,
        Invoice,
        JWT_SECRET,
        License,
        PayrollPeriod,
        PayslipRecord,
        Sequelize,
        SubscriptionPlan,
        Transaction,
        User,
        Visit,
        adminAuthMiddleware,
        bcrypt,
        billingService,
        jwt,
        licenseService
    } = deps;

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
        console.error('❌ Erreur sur POST /api/admin/auth/login :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur GET /api/admin/auth/me :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur GET /api/admin/users :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur POST /api/admin/users :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur PUT /api/admin/users/:id/subscription :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur PUT /api/admin/users/:id/toggle-block :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur DELETE /api/admin/users/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// GET /api/admin/analytics/entonnoir?jours=30 — du visiteur du simulateur à l'inscription Pro
app.get('/api/admin/analytics/entonnoir', adminMiddleware, async (req, res) => {
    try {
        const { Op } = require('sequelize');
        const jours = Math.min(365, Math.max(1, parseInt(req.query.jours) || 30));
        const depuis = new Date(Date.now() - jours * 24 * 3600 * 1000);
        const lignes = await Visit.findAll({ where: { createdAt: { [Op.gte]: depuis } }, attributes: ['page', 'clientId'] });

        const visiteurs = new Set();
        const parEvenement = {};
        for (const l of lignes) {
            const page = l.page || '';
            if (!page.startsWith('evt:')) { if (l.clientId) visiteurs.add(l.clientId); continue; }
            const [, nom, source] = page.split(':');
            const e = parEvenement[nom] || (parEvenement[nom] = { total: 0, uniques: new Set(), sources: {} });
            e.total++;
            if (l.clientId) e.uniques.add(l.clientId);
            if (source) e.sources[source] = (e.sources[source] || 0) + 1;
        }
        const inscriptions = await User.count({ where: { createdAt: { [Op.gte]: depuis } } });
        const uniques = (nom) => parEvenement[nom]?.uniques.size || 0;
        const taux = (a, b) => b ? Math.round((a / b) * 1000) / 10 : 0;

        res.json({
            success: true, jours,
            etapes: [
                { etape: 'Visiteurs', valeur: visiteurs.size },
                { etape: 'Ont simulé', valeur: uniques('simulation'), taux: taux(uniques('simulation'), visiteurs.size) },
                { etape: 'Ont téléchargé un PDF', valeur: uniques('pdf_simulateur'), taux: taux(uniques('pdf_simulateur'), uniques('simulation')) },
                { etape: 'Ont cliqué vers le Pro', valeur: uniques('clic_pro'), taux: taux(uniques('clic_pro'), visiteurs.size) },
                { etape: 'Inscriptions', valeur: inscriptions, taux: taux(inscriptions, uniques('clic_pro')) }
            ],
            evenements: Object.fromEntries(Object.entries(parEvenement).map(([nom, e]) => [nom, { total: e.total, uniques: e.uniques.size, sources: e.sources }]))
        });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/admin/analytics/entonnoir :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur GET /api/admin/analytics/countries :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur GET /api/admin/subscription-plans :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur POST /api/admin/subscription-plans :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur PUT /api/admin/subscription-plans/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur DELETE /api/admin/subscription-plans/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// GET /api/admin/licenses - Liste des licences entreprise (Admin)
app.get('/api/admin/licenses', adminMiddleware, async (req, res) => {
    try {
        const licenses = await License.findAll({ order: [['createdAt', 'DESC']] });
        res.json({ success: true, licenses });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/admin/licenses :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur POST /api/admin/licenses :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur PUT /api/admin/licenses/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur DELETE /api/admin/licenses/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur GET /api/admin/bank-loans :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur POST /api/admin/bank-loans :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur PUT /api/admin/bank-loans/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur DELETE /api/admin/bank-loans/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
};
