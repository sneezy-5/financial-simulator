const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Initialisation de SQLite (Fichier database.sqlite à la racine du serveur)
const sequelize = new Sequelize({
    dialect: 'sqlite',
    dialect: 'sqlite',
    // Utilisation d'un nouveau fichier pour éviter les conflits de permissions avec l'ancien fichier git-tracké
    storage: process.env.DB_PATH || path.join(__dirname, 'financial_db.sqlite'),
    logging: false // Mettre à true pour voir les requêtes SQL dans la console
});

// Modèle VISITE (Analytics)
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

// Synchronisation (Création des tables si elles n'existent pas)
sequelize.sync().then(() => {
    console.log('📦 Base de données SQLite synchronisée.');
});

module.exports = { sequelize, Visit, PayrollRequest };
