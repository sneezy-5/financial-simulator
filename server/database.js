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
    status: {
        type: DataTypes.STRING,
        defaultValue: 'pending' // 'pending', 'success', 'failed'
    }
});

User.hasMany(Transaction, { foreignKey: 'userId' });
Transaction.belongsTo(User, { foreignKey: 'userId' });

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
sequelize.sync({ alter: true })
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

module.exports = { sequelize, Visit, PayrollRequest, User, AdminUser, CreditPack, BankLoan, Transaction };



