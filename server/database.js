const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Support dual SQLite / PostgreSQL (Prêt pour la production SaaS)
let sequelize;
if (process.env.DATABASE_URL) {
    sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        protocol: 'postgres',
        logging: false,
        dialectOptions: {
            ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : false
        }
    });
    console.log('🐘 Initialisation Sequelize avec PostgreSQL.');
} else {
    sequelize = new Sequelize({
        dialect: 'sqlite',
        dialectModule: require('@vscode/sqlite3'),
        storage: process.env.DB_PATH || path.join(__dirname, 'financial_db.sqlite'),
        logging: false
    });
    console.log('📦 Initialisation Sequelize avec SQLite local.');
}

// Modèle VISITE (Analytics & Trafic par pays)
const Visit = sequelize.define('Visit', {
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    ip: {
        type: DataTypes.STRING,
        allowNull: true
    },
    userAgent: {
        type: DataTypes.STRING,
        allowNull: true
    },
    page: {
        type: DataTypes.STRING,
        defaultValue: 'home'
    },
    country: {
        type: DataTypes.STRING,
        defaultValue: 'CI'
    },
    clientId: {
        type: DataTypes.STRING,
        allowNull: true
    }
});

// Modèle UTILISATEUR (Authentification, Crédits, Bloquage & Verification)
const User = sequelize.define('User', {
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    credits: {
        type: DataTypes.INTEGER,
        defaultValue: 5 // Crédits gratuits à l'inscription
    },
    role: {
        type: DataTypes.STRING,
        defaultValue: 'user' // 'user' ou 'admin'
    },
    emailVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    verificationToken: {
        type: DataTypes.STRING,
        allowNull: true
    },
    resetPasswordToken: {
        type: DataTypes.STRING,
        allowNull: true
    },
    resetPasswordExpires: {
        type: DataTypes.DATE,
        allowNull: true
    },
    name: {
        type: DataTypes.STRING,
        defaultValue: ''
    },
    companyName: {
        type: DataTypes.STRING,
        defaultValue: ''
    },
    phone: {
        type: DataTypes.STRING,
        defaultValue: ''
    },
    accountType: {
        type: DataTypes.STRING,
        defaultValue: 'individual' // 'individual' (Libéral / Indépendant) ou 'company' (Entreprise / Cabinet)
    },
    isBlocked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    subscriptionTier: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null // 'starter' ou 'pro'
    },
    subscriptionExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
    },
    bulletinsUsed: {
        type: DataTypes.INTEGER,
        defaultValue: 0 // Compteur de bulletins générés sur la période d'abonnement en cours
    },
    periodStartedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
    },
    companyNumeroCnps: {
        type: DataTypes.STRING,
        allowNull: true // Numéro CNPS employeur, utilisé pour les futures déclarations réglementaires
    },
    companyNumeroContribuable: {
        type: DataTypes.STRING,
        allowNull: true // Numéro contribuable / NIF employeur
    },
    subscriptionIsTrial: {
        type: DataTypes.BOOLEAN,
        defaultValue: false // true tant que l'abonnement en cours est l'essai gratuit de 14 jours
    }
});

// Modèle DEMANDE DE PAIE (Historique RH)
const PayrollRequest = sequelize.define('PayrollRequest', {
    filename: {
        type: DataTypes.STRING,
        allowNull: false
    },
    processedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    employeeCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    status: {
        type: DataTypes.STRING, // 'PENDING', 'SUCCESS', 'ERROR'
        defaultValue: 'PENDING'
    }
});

// Modèle PÉRIODE DE PAIE (mois/année, brouillon → validé — fondation des futures déclarations
// réglementaires CNPS/ITS/CMU, générées à partir des périodes validées)
const PayrollPeriod = sequelize.define('PayrollPeriod', {
    mois: {
        type: DataTypes.INTEGER,
        allowNull: false // 1-12
    },
    annee: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    country: {
        type: DataTypes.STRING,
        defaultValue: 'CI'
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'draft' // 'draft' ou 'validated'
    },
    validatedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
});

// Modèle BULLETIN ENREGISTRÉ (Instantané par salarié au moment de la génération — ne suit pas
// les modifications ultérieures de la fiche salarié, comme il se doit pour un document légal)
const PayslipRecord = sequelize.define('PayslipRecord', {
    nom: { type: DataTypes.STRING, allowNull: true },
    prenom: { type: DataTypes.STRING, allowNull: true },
    matricule: { type: DataTypes.STRING, allowNull: true },
    numeroCnps: { type: DataTypes.STRING, allowNull: true },
    poste: { type: DataTypes.STRING, allowNull: true },
    salaireBase: { type: DataTypes.FLOAT, defaultValue: 0 },
    brutTotal: { type: DataTypes.FLOAT, defaultValue: 0 },
    netAPayer: { type: DataTypes.FLOAT, defaultValue: 0 },
    cnpsSal: { type: DataTypes.FLOAT, defaultValue: 0 },
    cnpsPF: { type: DataTypes.FLOAT, defaultValue: 0 },
    cnpsAM: { type: DataTypes.FLOAT, defaultValue: 0 },
    cnpsAT: { type: DataTypes.FLOAT, defaultValue: 0 },
    cnpsRetraitePat: { type: DataTypes.FLOAT, defaultValue: 0 },
    its: { type: DataTypes.FLOAT, defaultValue: 0 },
    ricf: { type: DataTypes.FLOAT, defaultValue: 0 },
    cmuSal: { type: DataTypes.FLOAT, defaultValue: 0 },
    cmuPat: { type: DataTypes.FLOAT, defaultValue: 0 },
    totalPersonnesCMU: { type: DataTypes.INTEGER, defaultValue: 0 },
    situationMatrimoniale: { type: DataTypes.STRING, allowNull: true },
    nombreEnfants: { type: DataTypes.INTEGER, defaultValue: 0 },
    heuresSupNb: { type: DataTypes.FLOAT, defaultValue: 0 },
    montantHeuresSup: { type: DataTypes.FLOAT, defaultValue: 0 },
    joursTravailles: { type: DataTypes.FLOAT, defaultValue: 0 },
    absencesJours: { type: DataTypes.FLOAT, defaultValue: 0 }
});

// Modèles RH (Multi-tenant via userId)
const Employee = sequelize.define('Employee', {
    prenom: { type: DataTypes.STRING, allowNull: false },
    nom: { type: DataTypes.STRING, allowNull: false },
    matricule: { type: DataTypes.STRING, allowNull: true },
    numeroCnps: { type: DataTypes.STRING, allowNull: true },
    poste: { type: DataTypes.STRING, allowNull: true },
    departement: { type: DataTypes.STRING, allowNull: true },
    dateEmbauche: { type: DataTypes.DATE, allowNull: true },
    dateNaissance: { type: DataTypes.DATE, allowNull: true },
    salaireBase: { type: DataTypes.FLOAT, defaultValue: 0 },
    situationMatrimoniale: { type: DataTypes.STRING, allowNull: true },
    nombreEnfants: { type: DataTypes.INTEGER, defaultValue: 0 },
    genre: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    telephone: { type: DataTypes.STRING, allowNull: true }
});

const Absence = sequelize.define('Absence', {
    type: { type: DataTypes.STRING, allowNull: false }, // 'annuel', 'maladie', etc.
    dateDebut: { type: DataTypes.DATE, allowNull: false },
    dateFin: { type: DataTypes.DATE, allowNull: false },
    jours: { type: DataTypes.FLOAT, allowNull: false },
    commentaire: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING, defaultValue: 'valide' } // 'en_attente', 'valide', 'refuse'
});

const Formation = sequelize.define('Formation', {
    titre: { type: DataTypes.STRING, allowNull: false },
    organisme: { type: DataTypes.STRING, allowNull: true },
    dateFormation: { type: DataTypes.DATE, allowNull: true },
    cout: { type: DataTypes.FLOAT, defaultValue: 0 },
    status: { type: DataTypes.STRING, defaultValue: 'planifie' } // 'planifie', 'termine'
});

const Evaluation = sequelize.define('Evaluation', {
    dateEvaluation: { type: DataTypes.DATE, allowNull: false },
    evaluateur: { type: DataTypes.STRING, allowNull: true },
    note: { type: DataTypes.FLOAT, allowNull: true }, // sur 5 ou 10
    objectifsAtteints: { type: DataTypes.BOOLEAN, defaultValue: false },
    commentaire: { type: DataTypes.TEXT, allowNull: true }
});

// Paramètres Locaux (pour la licence Desktop)
const LocalSettings = sequelize.define('LocalSettings', {
    key: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    value: {
        type: DataTypes.TEXT,
        allowNull: false
    }
});

// Associations RH
User.hasMany(Employee, { foreignKey: 'userId', onDelete: 'CASCADE' });
Employee.belongsTo(User, { foreignKey: 'userId' });

Employee.hasMany(Absence, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
Absence.belongsTo(Employee, { foreignKey: 'employeeId' });
User.hasMany(Absence, { foreignKey: 'userId', onDelete: 'CASCADE' });
Absence.belongsTo(User, { foreignKey: 'userId' });

Employee.hasMany(Formation, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
Formation.belongsTo(Employee, { foreignKey: 'employeeId' });
User.hasMany(Formation, { foreignKey: 'userId', onDelete: 'CASCADE' });
Formation.belongsTo(User, { foreignKey: 'userId' });

Employee.hasMany(Evaluation, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
Evaluation.belongsTo(Employee, { foreignKey: 'employeeId' });
User.hasMany(Evaluation, { foreignKey: 'userId', onDelete: 'CASCADE' });
Evaluation.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(PayrollPeriod, { foreignKey: 'userId', onDelete: 'CASCADE' });
PayrollPeriod.belongsTo(User, { foreignKey: 'userId' });
PayrollPeriod.hasMany(PayslipRecord, { foreignKey: 'periodId', onDelete: 'CASCADE' });
PayslipRecord.belongsTo(PayrollPeriod, { foreignKey: 'periodId' });

// Modèle TRANSACTION (Paiements Paystack)
const Transaction = sequelize.define('Transaction', {
    reference: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    amount: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    credits: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    subscriptionTier: {
        type: DataTypes.STRING,
        allowNull: true // 'starter' ou 'pro' — palier réellement accordé par ce paiement
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'pending' // 'pending', 'success', 'failed'
    }
});

User.hasMany(Transaction, { foreignKey: 'userId', onDelete: 'CASCADE' });
Transaction.belongsTo(User, { foreignKey: 'userId' });

// Modèle FACTURE (Émise à chaque paiement d'abonnement réussi)
const Invoice = sequelize.define('Invoice', {
    invoiceNumber: {
        type: DataTypes.STRING,
        allowNull: true, // renseigné juste après création (dérivé de l'id auto-increment)
        unique: true
    },
    subscriptionTier: {
        type: DataTypes.STRING,
        allowNull: false
    },
    amount: {
        type: DataTypes.INTEGER, // FCFA
        allowNull: false
    },
    reference: {
        type: DataTypes.STRING,
        allowNull: true // référence de paiement Paystack
    },
    pdfPath: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'paid'
    }
});

User.hasMany(Invoice, { foreignKey: 'userId', onDelete: 'CASCADE' });
Invoice.belongsTo(User, { foreignKey: 'userId' });

// Modèle LICENCE (Édition installable "logiciel complet" vendue aux entreprises)
const License = sequelize.define('License', {
    licenseKey: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    companyName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    contactEmail: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'active' // 'active' ou 'revoked'
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: true // null = licence perpétuelle
    },
    installationId: {
        type: DataTypes.STRING,
        allowNull: true // identifiant de l'installation actuellement liée à cette clé
    },
    activatedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    lastVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    price: {
        type: DataTypes.INTEGER,
        defaultValue: 500000 // FCFA
    },
    reference: {
        type: DataTypes.STRING,
        allowNull: true // référence Paystack (achats en libre-service uniquement) ; déduplication
                         // gérée applicativement dans licenseService.js, pas de contrainte UNIQUE ici
                         // (SQLite ne permet pas d'ajouter une colonne UNIQUE via ALTER TABLE)
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
});

// Modèle UTILISATEUR ADMINISTRATEUR (Séparé des clients SaaS)
const AdminUser = sequelize.define('AdminUser', {
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        defaultValue: 'Administrateur ONDA'
    },
    role: {
        type: DataTypes.STRING,
        defaultValue: 'admin' // 'admin' ou 'superadmin'
    },
    lastLogin: {
        type: DataTypes.DATE,
        allowNull: true
    }
});

// Modèle PACK DE CRÉDITS (Tarifs et offres configurables par l'Admin)
const CreditPack = sequelize.define('CreditPack', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    credits: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    price: {
        type: DataTypes.INTEGER, // Prix en FCFA
        allowNull: false
    },
    popular: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
});

// Modèle FORMULE D'ABONNEMENT (Paliers Starter / Pro, configurables par l'Admin)
const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
    code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true // identifiant unique de la ligne tarifaire, ex: 'starter', 'pro', 'starter_annual', 'pro_annual'
    },
    tier: {
        type: DataTypes.STRING,
        allowNull: true // 'starter' ou 'pro' — palier partagé entre le mensuel et l'annuel d'une même formule
    },
    billingCycle: {
        type: DataTypes.STRING,
        defaultValue: 'monthly' // 'monthly' ou 'annual'
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    bulletinLimit: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    price: {
        type: DataTypes.INTEGER, // Prix en FCFA (par mois si mensuel, par an si annuel)
        allowNull: false
    },
    popular: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
});

SubscriptionPlan.hasMany(User, { foreignKey: 'plan_id', onDelete: 'CASCADE' });

// Modèle PRÊT BANCAIRE (Offres bancaires configurables par l'Admin pour la simulation)
const BankLoan = sequelize.define('BankLoan', {
    bankName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    loanName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    country: {
        type: DataTypes.STRING,
        defaultValue: 'CI'
    },
    interestRate: {
        type: DataTypes.FLOAT, // Taux d'intérêt (ex: 8.5)
        allowNull: false
    },
    minAmount: {
        type: DataTypes.INTEGER,
        defaultValue: 500000
    },
    maxAmount: {
        type: DataTypes.INTEGER,
        defaultValue: 30000000
    },
    minDurationMonths: {
        type: DataTypes.INTEGER,
        defaultValue: 6
    },
    maxDurationMonths: {
        type: DataTypes.INTEGER,
        defaultValue: 72
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
});

// Associations
User.hasMany(PayrollRequest);
PayrollRequest.belongsTo(User);

// Synchronisation de la base de données & Seeding Admin / CreditPacks / BankLoans
//
// Note SQLite : `changeColumn` (déclenché par `alter: true` dès qu'un attribut existant
// est jugé différent, ex. quirk PRAGMA table_info sur la colonne `id`) reconstruit la table
// entière (CREATE backup → COPY → DROP → RENAME) mais n'y désactive pas les FK — ce qui fait
// échouer le DROP dès qu'une autre table référence celle-ci. On désactive donc les FK autour
// du sync, comme le fait déjà Sequelize lui-même pour `dropAllTables`.
const isSqlite = sequelize.getDialect() === 'sqlite';
(isSqlite ? sequelize.query('PRAGMA foreign_keys = OFF') : Promise.resolve())
    .then(() => sequelize.sync({ alter: false }))
    .finally(() => (isSqlite ? sequelize.query('PRAGMA foreign_keys = ON') : Promise.resolve()))
    .then(async () => {
        console.log('✅ Base de données synchronisée avec succès (alter: true).');
        
        // Auto-seeding d'un administrateur par défaut si aucun n'existe
        try {
            const adminCount = await AdminUser.count();
            
            let bcrypt;
            try { bcrypt = require('bcrypt'); } catch (e) {}
            
            const defaultEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@eonda.online';
            const defaultPass = process.env.ADMIN_DEFAULT_PASS || 'admin@123';
            
            const hashedPassword = bcrypt ? await bcrypt.hash(defaultPass, 10) : defaultPass;
            
            if (adminCount === 0) {
                await AdminUser.create({
                    email: defaultEmail,
                    password: hashedPassword,
                    name: 'Super Admin ONDA',
                    role: 'admin'
                });
                console.log(`🔑 Compte Administrateur initial créé : ${defaultEmail}`);
            } else {
                const admin = await AdminUser.findOne();
                if (admin) {
                    admin.email = defaultEmail;
                    admin.password = hashedPassword;
                    await admin.save();
                    console.log(`🔑 Compte Administrateur mis à jour : ${defaultEmail}`);
                }
            }
        } catch (seedErr) {
            console.error('⚠️ Erreur lors du seeding AdminUser:', seedErr);
        }

        // Auto-seeding des packs de crédits initiaux si aucun n'existe
        try {
            const packCount = await CreditPack.count();
            if (packCount === 0) {
                await CreditPack.bulkCreate([
                    { name: 'Pack Découverte', credits: 25, price: 2500, popular: false, active: true },
                    { name: 'Pack Pro Standard', credits: 100, price: 9000, popular: true, active: true },
                    { name: 'Pack Entreprise Gold', credits: 300, price: 24000, popular: false, active: true }
                ]);
                console.log('💳 Packs de crédits initiaux créés avec succès.');
            }
        } catch (packErr) {
            console.error('⚠️ Erreur lors du seeding CreditPack:', packErr);
        }

        // ──────────────────────────────────────────────────────────────────
        // Seed des formules d'abonnement : Gratuit & Pro
        // La licence Entreprise (sans limite & expirable) est gérée via la
        // table License — elle est créée manuellement depuis le panneau Admin.
        // ──────────────────────────────────────────────────────────────────
        try {
            const planCount = await SubscriptionPlan.count();
            if (planCount === 0) {
                await SubscriptionPlan.bulkCreate([
                    {
                        code: 'free',
                        tier: 'free',
                        billingCycle: 'monthly',
                        name: 'Gratuit',
                        bulletinLimit: 5,   // 5 bulletins/mois pour tester
                        price: 0,
                        popular: false,
                        active: true
                    },
                    {
                        code: 'pro',
                        tier: 'pro',
                        billingCycle: 'monthly',
                        name: 'Pro',
                        bulletinLimit: 99999, // illimité en pratique
                        price: 35000,
                        popular: true,
                        active: true
                    }
                ]);
                console.log('📋 Formules d\'abonnement initiales (Gratuit / Pro) créées avec succès.');
            } else {
                // Mise à jour du plan Pro si le prix est encore à l'ancien tarif
                const proPlan = await SubscriptionPlan.findOne({ where: { code: 'pro' } });
                if (proPlan && proPlan.price !== 35000) {
                    proPlan.price = 35000;
                    proPlan.bulletinLimit = 99999;
                    proPlan.name = 'Pro';
                    await proPlan.save();
                    console.log('📋 Formule Pro mise à jour : 35 000 FCFA / mois, bulletins illimités.');
                }
                // S'assurer que le plan Gratuit existe
                const freePlan = await SubscriptionPlan.findOne({ where: { code: 'free' } });
                if (!freePlan) {
                    await SubscriptionPlan.create({
                        code: 'free', tier: 'free', billingCycle: 'monthly',
                        name: 'Gratuit', bulletinLimit: 5, price: 0,
                        popular: false, active: true
                    });
                    console.log('📋 Formule Gratuit créée (manquante).');
                }
            }
        } catch (planErr) {
            console.error('⚠️ Erreur lors du seeding SubscriptionPlan:', planErr);
        }

        // Rattrapage : renseigne `tier` sur les lignes mensuelles existantes créées avant son ajout
        // (tier == code pour les 2 formules mensuelles d'origine)
        try {
            const plansMissingTier = await SubscriptionPlan.findAll({ where: { tier: null } });
            for (const p of plansMissingTier) {
                p.tier = p.code;
                await p.save();
            }
        } catch (tierErr) {
            console.error('⚠️ Erreur lors du rattrapage tier SubscriptionPlan:', tierErr);
        }

        // Note : les licences Entreprise (durée et prix libres, bulletins illimités)
        // sont créées manuellement depuis le panneau Admin → Licences Entreprise.
        // Aucun plan annuel automatique n'est généré.

        // Auto-seeding de l'ENSEMBLE des offres de prêts bancaires régionales si moins de 15 offres sont en BD
        try {
            const loanCount = await BankLoan.count();
            if (loanCount < 15) {
                const ALL_INITIAL_LOANS = [
                    // CÔTE D'IVOIRE
                    { bankName: 'BNI', loanName: 'BNI Prêt Consommation', country: 'CI', interestRate: 8.5, minAmount: 500000, maxAmount: 25000000, minDurationMonths: 6, maxDurationMonths: 60, description: 'Crédit consommation rapide pour salariés et fonctionnaires.', active: true },
                    { bankName: 'BNI', loanName: 'BNI Prêt Habitat', country: 'CI', interestRate: 7.5, minAmount: 5000000, maxAmount: 80000000, minDurationMonths: 60, maxDurationMonths: 240, description: 'Prêt immobilier pour acquisition ou construction.', active: true },
                    { bankName: 'BNI', loanName: 'BNI Avance sur Salaire', country: 'CI', interestRate: 10.0, minAmount: 100000, maxAmount: 2000000, minDurationMonths: 1, maxDurationMonths: 6, description: 'Découvert et avance de trésorerie sur salaire.', active: true },

                    { bankName: 'SGCI', loanName: 'SGCI Prêt Oxygène', country: 'CI', interestRate: 8.9, minAmount: 1000000, maxAmount: 35000000, minDurationMonths: 12, maxDurationMonths: 72, description: 'Financement complet de tous vos projets personnels.', active: true },
                    { bankName: 'SGCI', loanName: 'SGCI Prêt Immobilier', country: 'CI', interestRate: 7.9, minAmount: 5000000, maxAmount: 100000000, minDurationMonths: 60, maxDurationMonths: 240, description: 'Acquisition et travaux immobiliers.', active: true },

                    { bankName: 'NSIA Banque', loanName: 'NSIA Prêt Conso Personnel', country: 'CI', interestRate: 8.75, minAmount: 500000, maxAmount: 30000000, minDurationMonths: 6, maxDurationMonths: 60, description: 'Solution souple pour vos besoins d’équipement et de trésorerie.', active: true },
                    { bankName: 'NSIA Banque', loanName: 'NSIA Prêt Habitat UEMOA', country: 'CI', interestRate: 7.5, minAmount: 5000000, maxAmount: 100000000, minDurationMonths: 60, maxDurationMonths: 240, description: 'Prêt immobilier bonifié pour salariés UEMOA.', active: true },

                    { bankName: 'Ecobank', loanName: 'Ecobank Prêt Personnel Avance', country: 'CI', interestRate: 8.75, minAmount: 500000, maxAmount: 20000000, minDurationMonths: 6, maxDurationMonths: 48, description: 'Avance sur salaire et prêt à la consommation.', active: true },
                    { bankName: 'Ecobank', loanName: 'Ecobank Prêt Immobilier', country: 'CI', interestRate: 7.9, minAmount: 5000000, maxAmount: 80000000, minDurationMonths: 60, maxDurationMonths: 180, description: 'Prêt immobilier longue durée.', active: true },

                    { bankName: 'UBA', loanName: 'UBA Prêt Consommation', country: 'CI', interestRate: 9.0, minAmount: 500000, maxAmount: 20000000, minDurationMonths: 6, maxDurationMonths: 60, description: 'Crédit rapide sur salaire domicilié.', active: true },
                    { bankName: 'BSIC', loanName: 'BSIC Crédit Particuliers', country: 'CI', interestRate: 8.5, minAmount: 500000, maxAmount: 25000000, minDurationMonths: 6, maxDurationMonths: 60, description: 'Prêt bancaire souple avec grilles de quotités progressives.', active: true },
                    { bankName: 'BICICI', loanName: 'BICICI Prêt Personnel', country: 'CI', interestRate: 8.5, minAmount: 500000, maxAmount: 30000000, minDurationMonths: 6, maxDurationMonths: 60, description: 'Crédit consommation pour fonctionnaires et salariés du secteur privé.', active: true },
                    { bankName: 'SIB', loanName: 'SIB Prêt Express Conso', country: 'CI', interestRate: 8.8, minAmount: 500000, maxAmount: 30000000, minDurationMonths: 6, maxDurationMonths: 72, description: 'Financement personnel sur mesure par la Société Ivoirienne de Banque.', active: true },

                    { bankName: 'Bridge Bank Group', loanName: 'Bridge Prêt Conso', country: 'CI', interestRate: 8.5, minAmount: 500000, maxAmount: 40000000, minDurationMonths: 6, maxDurationMonths: 72, description: 'Financement jusqu’à 40 millions FCFA sur 6 ans.', active: true },
                    { bankName: 'Bridge Bank Group', loanName: 'Bridge Prêt Immo', country: 'CI', interestRate: 8.5, minAmount: 5000000, maxAmount: 150000000, minDurationMonths: 60, maxDurationMonths: 240, description: 'Acquisition, construction et rénovation immobilière.', active: true },
                    { bankName: 'Bridge Bank Group', loanName: 'Bridge Prêt Express', country: 'CI', interestRate: 12.0, minAmount: 50000, maxAmount: 1000000, minDurationMonths: 1, maxDurationMonths: 6, description: 'Prêt d’urgence pour besoins courants.', active: true },

                    { bankName: 'BDU-CI', loanName: 'Prêt Scolaire BDU-CI', country: 'CI', interestRate: 7.5, minAmount: 150000, maxAmount: 5000000, minDurationMonths: 1, maxDurationMonths: 10, description: 'Avance rentrée scolaire et frais d’études.', active: true },
                    { bankName: 'BDU-CI', loanName: 'Prêt Equipement BDU-CI', country: 'CI', interestRate: 8.5, minAmount: 500000, maxAmount: 15000000, minDurationMonths: 6, maxDurationMonths: 36, description: 'Financement équipement et véhicules.', active: true },

                    // BÉNIN
                    { bankName: 'BOA Bénin', loanName: 'BOA Bénin Prêt Conso', country: 'BJ', interestRate: 9.0, minAmount: 500000, maxAmount: 15000000, minDurationMonths: 6, maxDurationMonths: 48, description: 'Crédit consommation pour salariés au Bénin.', active: true },
                    { bankName: 'BOA Bénin', loanName: 'BOA Bénin Prêt Immobilier', country: 'BJ', interestRate: 7.8, minAmount: 3000000, maxAmount: 60000000, minDurationMonths: 36, maxDurationMonths: 180, description: 'Projets immobiliers au Bénin.', active: true },
                    { bankName: 'Ecobank Bénin', loanName: 'Ecobank Bénin Prêt Personnel', country: 'BJ', interestRate: 8.8, minAmount: 500000, maxAmount: 15000000, minDurationMonths: 6, maxDurationMonths: 48, description: 'Prêt personnel pour salariés du secteur public et privé.', active: true },
                    { bankName: 'NSIA Banque Bénin', loanName: 'NSIA Bénin Crédit Particuliers', country: 'BJ', interestRate: 8.9, minAmount: 500000, maxAmount: 20000000, minDurationMonths: 6, maxDurationMonths: 60, description: 'Solution sur mesure NSIA au Bénin.', active: true },
                    { bankName: 'Coris Bank Bénin', loanName: 'Coris Bank Bénin Prêt Express', country: 'BJ', interestRate: 9.2, minAmount: 300000, maxAmount: 10000000, minDurationMonths: 6, maxDurationMonths: 36, description: 'Financement rapide pour particuliers.', active: true },
                    { bankName: 'BGFIBank Bénin', loanName: 'BGFIBank Bénin Prêt Conso', country: 'BJ', interestRate: 8.9, minAmount: 1000000, maxAmount: 25000000, minDurationMonths: 12, maxDurationMonths: 60, description: 'Offre particuliers BGFIBank Bénin.', active: true },

                    // TOGO
                    { bankName: 'Ecobank Togo', loanName: 'Ecobank Togo Prêt Personnel', country: 'TG', interestRate: 8.8, minAmount: 500000, maxAmount: 15000000, minDurationMonths: 6, maxDurationMonths: 48, description: 'Prêt consommation pour particuliers au Togo.', active: true },
                    { bankName: 'Orabank Togo', loanName: 'Orabank Togo Prêt Express', country: 'TG', interestRate: 8.8, minAmount: 500000, maxAmount: 15000000, minDurationMonths: 6, maxDurationMonths: 48, description: 'Crédit rapide sur salaire au Togo.', active: true },
                    { bankName: 'UTB', loanName: 'UTB Prêt Consommation', country: 'TG', interestRate: 8.75, minAmount: 500000, maxAmount: 12000000, minDurationMonths: 6, maxDurationMonths: 48, description: 'Crédit Union Togolaise de Banque.', active: true },
                    { bankName: 'Coris Bank Togo', loanName: 'Coris Bank Togo Prêt Particuliers', country: 'TG', interestRate: 9.0, minAmount: 300000, maxAmount: 10000000, minDurationMonths: 6, maxDurationMonths: 36, description: 'Prêt aux particuliers au Togo.', active: true },
                    { bankName: 'BOA Togo', loanName: 'BOA Togo Prêt Ma Maison (Immo)', country: 'TG', interestRate: 6.5, minAmount: 500000, maxAmount: 200000000, minDurationMonths: 12, maxDurationMonths: 300, description: 'Financement immobilier longue durée BOA Togo.', active: true },
                    { bankName: 'BOA Togo', loanName: 'BOA Togo Crédit Auto', country: 'TG', interestRate: 8.0, minAmount: 500000, maxAmount: 30000000, minDurationMonths: 12, maxDurationMonths: 60, description: 'Financement véhicule neuf ou d’occasion.', active: true },
                    { bankName: 'NSIA Banque Togo', loanName: 'NSIA Togo Prêt Personnel', country: 'TG', interestRate: 7.5, minAmount: 500000, maxAmount: 10000000, minDurationMonths: 12, maxDurationMonths: 60, description: 'NSIA Banque Togo prêt consommation.', active: true },
                    { bankName: 'NSIA Banque Togo', loanName: 'NSIA Togo Prêt Immobilier', country: 'TG', interestRate: 6.5, minAmount: 500000, maxAmount: 150000000, minDurationMonths: 12, maxDurationMonths: 240, description: 'Financement immobilier NSIA Togo.', active: true },

                    // MALI
                    { bankName: 'BDM-SA', loanName: 'BDM-SA Prêt Consommation', country: 'ML', interestRate: 9.0, minAmount: 500000, maxAmount: 15000000, minDurationMonths: 6, maxDurationMonths: 48, description: 'Banque de Développement du Mali.', active: true },
                    { bankName: 'BMS-SA', loanName: 'BMS-SA Prêt Personnel', country: 'ML', interestRate: 8.9, minAmount: 500000, maxAmount: 15000000, minDurationMonths: 6, maxDurationMonths: 48, description: 'Banque Malienne de Solidarité.', active: true },

                    // BURKINA FASO
                    { bankName: 'Coris Bank International', loanName: 'Coris Bank BF Prêt Conso', country: 'BF', interestRate: 9.0, minAmount: 500000, maxAmount: 15000000, minDurationMonths: 6, maxDurationMonths: 48, description: 'Coris Bank Burkina Faso.', active: true },
                    { bankName: 'BOA Burkina Faso', loanName: 'BOA Burkina Prêt Personnel', country: 'BF', interestRate: 8.9, minAmount: 500000, maxAmount: 15000000, minDurationMonths: 6, maxDurationMonths: 48, description: 'Bank of Africa Burkina Faso.', active: true },

                    // CAMEROUN
                    { bankName: 'Afriland First Bank', loanName: 'Afriland Prêt Conso', country: 'CM', interestRate: 9.5, minAmount: 500000, maxAmount: 20000000, minDurationMonths: 6, maxDurationMonths: 60, description: 'Afriland First Bank Cameroun.', active: true },
                    { bankName: 'Société Générale Cameroun', loanName: 'SG Cameroun Prêt Oxygène', country: 'CM', interestRate: 9.2, minAmount: 1000000, maxAmount: 25000000, minDurationMonths: 12, maxDurationMonths: 60, description: 'SG Cameroun particuliers.', active: true },

                    // SÉNÉGAL
                    { bankName: 'CBAO', loanName: 'CBAO Prêt Personnel', country: 'SN', interestRate: 8.9, minAmount: 500000, maxAmount: 20000000, minDurationMonths: 6, maxDurationMonths: 60, description: 'CBAO Groupe Attijariwafa bank.', active: true },
                    { bankName: 'Société Générale Sénégal', loanName: 'SG Sénégal Prêt Conso', country: 'SN', interestRate: 8.8, minAmount: 1000000, maxAmount: 30000000, minDurationMonths: 12, maxDurationMonths: 60, description: 'Société Générale Sénégal.', active: true },

                    // GABON
                    { bankName: 'BGFIBank Gabon', loanName: 'BGFIBank Gabon Prêt Conso', country: 'GA', interestRate: 9.5, minAmount: 1000000, maxAmount: 30000000, minDurationMonths: 12, maxDurationMonths: 60, description: 'BGFIBank Gabon particuliers.', active: true }
                ];

                for (const loanData of ALL_INITIAL_LOANS) {
                    const [loanObj, created] = await BankLoan.findOrCreate({
                        where: { bankName: loanData.bankName, loanName: loanData.loanName, country: loanData.country },
                        defaults: loanData
                    });
                }
                console.log('🏦 Liste complète des offres de prêts bancaires régionales (35+ banques) chargée en base de données.');
            }
        } catch (loanErr) {
            console.error('⚠️ Erreur lors du seeding complet BankLoan:', loanErr);
        }
    })
    .catch(err => {
        console.error('❌ Erreur de synchronisation de la base de données:', err);
    });

module.exports = { sequelize, Visit, PayrollRequest, User, AdminUser, CreditPack, SubscriptionPlan, BankLoan, Transaction, Invoice, License, PayrollPeriod, PayslipRecord, Employee, Absence, Formation, Evaluation, LocalSettings };



