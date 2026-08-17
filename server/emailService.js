let nodemailer = null;
try {
    nodemailer = require('nodemailer');
} catch (e) {
    console.warn("⚠️ nodemailer non installé. Les emails fonctionneront en mode SIMULATION.");
}

// Configuration du transporteur d'emails (Nodemailer)
// Supporte SMTP via variables d'environnement (.env)
// Si aucune config SMTP n'est fournie ou si nodemailer manque, un mode SIMULATION s'active automatiquement
const createTransporter = () => {
    if (nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER) {
        const port = parseInt(process.env.SMTP_PORT || '587');
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: port,
            secure: port === 465, // true for 465, false for 587/25
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }
    return null; // Active le mode simulation
};

const transporter = createTransporter();
const FROM_EMAIL = process.env.SMTP_FROM || 'ONDA Financial <noreply@onda-lite.com>';

/**
 * Envoie un email de vérification (OTP) lors de l'inscription
 */
async function sendVerificationEmail(email, otpCode) {
    const textContent = `Bonjour,\n\nVotre code de vérification ONDA est : ${otpCode}\n\nVeuillez saisir ce code dans l'application pour activer votre compte.\n\nMerci,\nL'équipe ONDA`;

    if (transporter) {
        try {
            await transporter.sendMail({
                from: FROM_EMAIL,
                to: email,
                subject: 'ONDA — Votre code de vérification',
                text: textContent
            });
            console.log(`✉️ Email OTP envoyé à ${email}`);
        } catch (err) {
            console.error("❌ Erreur envoi email vérification:", err.message);
        }
    } else {
        console.log(`\n======================================================`);
        console.log(`✉️ [SIMULATION OTP VÉRIFICATION] destinataire: ${email}`);
        console.log(`🔑 Code OTP: ${otpCode}`);
        console.log(`======================================================\n`);
    }
}

/**
 * Envoie un email de réinitialisation de mot de passe (OTP)
 */
async function sendPasswordResetEmail(email, otpCode) {
    const textContent = `Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe.\nVotre code de réinitialisation est : ${otpCode}\n\nCe code expire dans 1 heure.\n\nMerci,\nL'équipe ONDA`;

    if (transporter) {
        try {
            await transporter.sendMail({
                from: FROM_EMAIL,
                to: email,
                subject: 'ONDA — Réinitialisation de mot de passe',
                text: textContent
            });
            console.log(`✉️ Email Reset OTP envoyé à ${email}`);
        } catch (err) {
            console.error("❌ Erreur envoi email reset:", err.message);
        }
    } else {
        console.log(`\n======================================================`);
        console.log(`✉️ [SIMULATION OTP RESET] destinataire: ${email}`);
        console.log(`🔑 Code OTP: ${otpCode}`);
        console.log(`======================================================\n`);
    }
}

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail
};
