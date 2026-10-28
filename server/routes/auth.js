// Routes — Authentification, profil et crédits.
// Extraites telles quelles de server.js (phase 6) ; server.js leur passe ses
// dépendances (middlewares, modèles, services) au moment de l'enregistrement.

module.exports = function enregistrerRoutesAuth(app, deps) {
    const {
        IS_SIMULATOR,
        JWT_SECRET,
        License,
        Sequelize,
        User,
        authMiddleware,
        bcrypt,
        billingService,
        differences,
        emailService,
        journaliser,
        jwt
    } = deps;

// ==========================================
// ROUTES D'AUTHENTIFICATION & CRÉDITS
// ==========================================

app.post('/api/auth/register', async (req, res) => {
    try {
        if (IS_SIMULATOR) {
            return res.status(403).json({ error: "La création de compte n'est pas disponible dans le simulateur. Rendez-vous sur la version ONDA RH Pro." });
        }
        if (!bcrypt) throw new Error("bcrypt non installé");
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis" });

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            if (!existingUser.emailVerified) {
                const newVerificationToken = Math.floor(100000 + Math.random() * 900000).toString();
                existingUser.verificationToken = newVerificationToken;
                existingUser.password = await bcrypt.hash(password, 10); // Update password in case they changed their mind
                await existingUser.save();
                
                emailService.sendVerificationEmail(existingUser.email, newVerificationToken).catch(console.error);
                return res.json({ success: true, requiresVerification: true, message: "Un nouveau code de vérification a été envoyé." });
            }
            return res.status(400).json({ error: "Cet email est déjà utilisé et vérifié" });
        }

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

        res.json({ success: true, requiresVerification: true, message: "Un code de vérification a été envoyé." });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/auth/register :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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

        if (!user.emailVerified) {
            // Renvoyer un nouveau code si l'utilisateur essaie de se connecter sans être vérifié
            const newVerificationToken = Math.floor(100000 + Math.random() * 900000).toString();
            user.verificationToken = newVerificationToken;
            await user.save();
            emailService.sendVerificationEmail(user.email, newVerificationToken).catch(console.error);
            return res.status(403).json({ error: "email_not_verified" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: "Identifiants incorrects" });

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user.id, email: user.email, subscriptionTier: user.subscriptionTier, subscriptionExpiresAt: user.subscriptionExpiresAt, subscriptionIsTrial: user.subscriptionIsTrial, role: user.role } });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/auth/login :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur POST /api/auth/forgot-password :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
        console.error('❌ Erreur sur POST /api/auth/reset-password :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ 
            success: true, 
            message: "Compte vérifié avec succès",
            token, 
            user: { id: user.id, email: user.email, subscriptionTier: user.subscriptionTier, subscriptionExpiresAt: user.subscriptionExpiresAt, subscriptionIsTrial: user.subscriptionIsTrial, role: user.role } 
        });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/auth/verify-otp :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, { attributes: { exclude: ['password'] } });
        if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
        const userJson = user.toJSON();
        // Stocké en JSON (colonne texte) : reparsé pour que le client
        // manipule toujours un objet, jamais une chaîne à re-parser lui-même.
        userJson.rubriqueCodes = userJson.rubriqueCodes ? JSON.parse(userJson.rubriqueCodes) : null;
        userJson.bulletinCanvasLayout = userJson.bulletinCanvasLayout ? JSON.parse(userJson.bulletinCanvasLayout) : null;
        res.json({ success: true, user: userJson });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/auth/me :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// POST /api/auth/activate-license - Activer une licence d'entreprise
app.post('/api/auth/activate-license', authMiddleware, async (req, res) => {
    try {
        const { licenseKey } = req.body;
        if (!licenseKey) return res.status(400).json({ error: "La clé de licence est requise" });

        const license = await License.findOne({ where: { licenseKey } });
        
        if (!license) {
            return res.status(404).json({ error: "Clé de licence invalide ou introuvable" });
        }
        
        if (license.status !== 'active') {
            return res.status(403).json({ error: "Cette licence a été révoquée ou suspendue" });
        }
        
        if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
            return res.status(403).json({ error: "Cette licence a expiré" });
        }
        
        if (license.installationId && license.installationId !== req.user.id.toString()) {
            return res.status(403).json({ error: "Cette licence est déjà activée sur un autre compte" });
        }

        // Marquer la licence comme activée par cet utilisateur
        license.installationId = req.user.id.toString();
        license.activatedAt = new Date();
        await license.save();

        // Mettre à jour l'utilisateur
        const user = await User.findByPk(req.user.id);
        user.subscriptionTier = 'entreprise'; // ou 'pro' selon la nomenclature, mais mettons 'entreprise' 
        user.subscriptionIsTrial = false;
        user.subscriptionExpiresAt = license.expiresAt || null;
        await user.save();

        res.json({ 
            success: true, 
            message: "Licence activée avec succès. Bienvenue dans l'édition Entreprise !",
            user: { id: user.id, email: user.email, subscriptionTier: user.subscriptionTier, subscriptionExpiresAt: user.subscriptionExpiresAt, subscriptionIsTrial: user.subscriptionIsTrial, role: user.role }
        });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/auth/activate-license :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// PUT /api/auth/profile - Mettre à jour le profil (Nom, Entreprise, Téléphone, Type de compte)
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

        const {
            name, companyName, phone, accountType, companyNumeroCnps, companyNumeroContribuable, companyLogo,
            companyAdresse, companyTelephone, companyEmail, companyVille, companySignataireNom, companySignataireFonction,
            companyNumeroEmployeur, companyTauxAtMp, companyCnpsVersementMensuel, companyBaseJoursPaie, companyZoneTransport, companyServiceAssiette, comptesPaie,
            defaultBulletinStyle, rubriqueCodes, bulletinCouleur, bulletinCanvasLayout
        } = req.body;
        if (name !== undefined) user.name = name;
        if (companyName !== undefined) user.companyName = companyName;
        if (phone !== undefined) user.phone = phone;
        if (accountType !== undefined) user.accountType = accountType;
        if (companyNumeroCnps !== undefined) user.companyNumeroCnps = companyNumeroCnps;
        if (companyNumeroContribuable !== undefined) user.companyNumeroContribuable = companyNumeroContribuable;
        if (companyLogo !== undefined) user.companyLogo = companyLogo;
        if (companyAdresse !== undefined) user.companyAdresse = companyAdresse;
        if (companyTelephone !== undefined) user.companyTelephone = companyTelephone;
        if (companyEmail !== undefined) user.companyEmail = companyEmail;
        if (companyVille !== undefined) user.companyVille = companyVille;
        if (companySignataireNom !== undefined) user.companySignataireNom = companySignataireNom;
        if (companySignataireFonction !== undefined) user.companySignataireFonction = companySignataireFonction;
        if (companyNumeroEmployeur !== undefined) user.companyNumeroEmployeur = companyNumeroEmployeur;
        if (companyTauxAtMp !== undefined) user.companyTauxAtMp = (companyTauxAtMp === '' || companyTauxAtMp === null) ? null : parseFloat(companyTauxAtMp);
        if (companyCnpsVersementMensuel !== undefined) user.companyCnpsVersementMensuel = (companyCnpsVersementMensuel === '' || companyCnpsVersementMensuel === null) ? null : !!companyCnpsVersementMensuel;
        if (companyServiceAssiette !== undefined) user.companyServiceAssiette = companyServiceAssiette || null;
        if (comptesPaie !== undefined) {
            // Seuls des numéros de compte (3 à 12 chiffres) et deux codes journaux courts sont acceptés.
            const propres = {};
            for (const [cle, val] of Object.entries(comptesPaie || {})) {
                const v = String(val || '').trim();
                if (/^journal(Paie|Od)$/.test(cle) ? /^[A-Z0-9]{1,8}$/i.test(v) : /^\d{3,12}$/.test(v)) propres[cle] = v;
            }
            user.comptesPaie = Object.keys(propres).length ? JSON.stringify(propres) : null;
        }
        if (companyZoneTransport !== undefined) user.companyZoneTransport = ['abidjan', 'bouake', 'interieur'].includes(companyZoneTransport) ? companyZoneTransport : null;
        if (companyBaseJoursPaie !== undefined) user.companyBaseJoursPaie = [26, 30].includes(parseInt(companyBaseJoursPaie)) ? parseInt(companyBaseJoursPaie) : null;
        if (defaultBulletinStyle !== undefined) user.defaultBulletinStyle = defaultBulletinStyle;
        // Stocké en JSON (colonne texte) ; { } explicitement envoyé remet aux
        // valeurs par défaut ONDA plutôt que de laisser d'anciens codes traîner.
        if (rubriqueCodes !== undefined) user.rubriqueCodes = rubriqueCodes ? JSON.stringify(rubriqueCodes) : null;
        if (bulletinCouleur !== undefined) user.bulletinCouleur = bulletinCouleur || null;
        if (bulletinCanvasLayout !== undefined) user.bulletinCanvasLayout = bulletinCanvasLayout ? JSON.stringify(bulletinCanvasLayout) : null;

        const changementsProfil = differences(
            Object.fromEntries(user.changed() ? user.changed().map(c => [c, user.previous(c)]) : []),
            Object.fromEntries(user.changed() ? user.changed().map(c => [c, user.get(c)]) : [])
        );
        await user.save();
        if (Object.keys(changementsProfil).length) {
            await journaliser({ req, action: 'parametres.modifies', entite: 'parametres', entiteId: user.id, libelle: 'Modification du profil entreprise / paramètres de paie', details: { changements: changementsProfil } });
        }
        const updatedUser = user.toJSON();
        delete updatedUser.password;
        updatedUser.rubriqueCodes = updatedUser.rubriqueCodes ? JSON.parse(updatedUser.rubriqueCodes) : null;
        updatedUser.bulletinCanvasLayout = updatedUser.bulletinCanvasLayout ? JSON.parse(updatedUser.bulletinCanvasLayout) : null;

        res.json({ success: true, user: updatedUser, message: "Profil mis à jour avec succès !" });
    } catch (e) {
        console.error('❌ Erreur sur PUT /api/auth/profile :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
};
