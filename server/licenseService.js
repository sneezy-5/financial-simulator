const crypto = require('crypto');
const { License } = require('./database');

let jwt;
try { jwt = require('jsonwebtoken'); } catch (e) {}

const LICENSE_JWT_SECRET = process.env.LICENSE_JWT_SECRET || 'super-secret-onda-license-key';
const TOKEN_TTL = '7d'; // fenêtre de grâce hors-ligne avant re-vérification obligatoire

// Prix fixe de la licence entreprise en libre-service (doit rester synchronisé avec
// le montant chargé côté enterprise-site/src/App.vue lors de l'appel Paystack).
const ENTERPRISE_LICENSE_PRICE = parseInt(process.env.ENTERPRISE_LICENSE_PRICE) || 500000;

function generateLicenseKey() {
    const chunk = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    return `ONDA-${chunk()}-${chunk()}-${chunk()}-${chunk()}`;
}

function isExpired(license) {
    return !!(license.expiresAt && new Date(license.expiresAt) <= new Date());
}

function issueToken(license, installationId) {
    return jwt.sign(
        { licenseId: license.id, installationId },
        LICENSE_JWT_SECRET,
        { expiresIn: TOKEN_TTL }
    );
}

async function activateLicense(licenseKey, installationId) {
    if (!licenseKey || !installationId) {
        return { ok: false, reason: 'missing_params', message: 'Clé de licence et identifiant d\'installation requis.' };
    }

    const license = await License.findOne({ where: { licenseKey } });
    if (!license) return { ok: false, reason: 'not_found', message: 'Clé de licence invalide.' };
    if (license.status !== 'active') return { ok: false, reason: 'revoked', message: 'Cette licence a été révoquée.' };
    if (isExpired(license)) return { ok: false, reason: 'expired', message: 'Cette licence a expiré.' };

    if (license.installationId && license.installationId !== installationId) {
        return { ok: false, reason: 'already_activated', message: 'Cette licence est déjà activée sur un autre poste. Contactez l\'administrateur pour la transférer.' };
    }

    const now = new Date();
    license.installationId = installationId;
    license.activatedAt = license.activatedAt || now;
    license.lastVerifiedAt = now;
    await license.save();

    const token = issueToken(license, installationId);
    return { ok: true, token, expiresAt: license.expiresAt };
}

async function verifyLicense(licenseKey, installationId) {
    if (!licenseKey || !installationId) {
        return { ok: false, reason: 'missing_params', message: 'Clé de licence et identifiant d\'installation requis.' };
    }

    const license = await License.findOne({ where: { licenseKey } });
    if (!license) return { ok: false, reason: 'not_found', message: 'Clé de licence invalide.' };
    if (license.status !== 'active') return { ok: false, reason: 'revoked', message: 'Cette licence a été révoquée.' };
    if (isExpired(license)) return { ok: false, reason: 'expired', message: 'Cette licence a expiré.' };
    if (license.installationId !== installationId) {
        return { ok: false, reason: 'not_activated', message: 'Cette installation n\'est pas liée à cette licence.' };
    }

    license.lastVerifiedAt = new Date();
    await license.save();

    const token = issueToken(license, installationId);
    return { ok: true, token, expiresAt: license.expiresAt };
}

// Crée une licence en libre-service à partir d'un paiement Paystack confirmé.
// Idempotent par référence de paiement (gère les doubles appels client + webhook).
async function createLicenseFromPayment({ reference, amountPaid, companyName, contactEmail }) {
    const existing = await License.findOne({ where: { reference } });
    if (existing) return { alreadyProcessed: true, license: existing };

    if (amountPaid !== ENTERPRISE_LICENSE_PRICE) {
        return { ok: false, reason: 'amount_mismatch' };
    }

    const license = await License.create({
        licenseKey: generateLicenseKey(),
        companyName,
        contactEmail,
        price: amountPaid,
        reference,
        expiresAt: null // licence perpétuelle pour un achat en libre-service
    });

    return { ok: true, license };
}

module.exports = { generateLicenseKey, activateLicense, verifyLicense, createLicenseFromPayment, ENTERPRISE_LICENSE_PRICE };
