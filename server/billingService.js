const { SubscriptionPlan, User } = require('./database');

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DURATION_MS = 30 * DAY_MS; // 30 jours (mensuel, fallback)
const TRIAL_DURATION_MS = 14 * DAY_MS;

async function getActivePlans() {
    return SubscriptionPlan.findAll({ where: { active: true }, order: [['price', 'ASC']] });
}

async function getPlanByCode(code) {
    if (!code) return null;
    return SubscriptionPlan.findOne({ where: { code } });
}

// Dérive le palier accordé à partir du montant réellement confirmé par Paystack
// (jamais depuis une valeur envoyée par le client) pour empêcher toute manipulation.
async function resolvePlanByAmount(amountFcfa) {
    return SubscriptionPlan.findOne({ where: { active: true, price: amountFcfa } });
}

async function grantSubscription(userId, plan) {
    const user = await User.findByPk(userId);
    if (!user) return null;
    const now = new Date();
    const durationMs = plan.billingCycle === 'annual' ? 365 * DAY_MS : PERIOD_DURATION_MS;
    // Le tier normalisé (pas le code de ligne tarifaire précis) est stocké ici : il reste
    // stable que l'utilisateur soit en mensuel ou en annuel, et les lookups existants par
    // code ('starter'/'pro'/'Entreprise') retrouvent la ligne mensuelle correspondante,
    // qui porte le même bulletinLimit que sa contrepartie annuelle.
    user.subscriptionTier = plan.tier || plan.code;
    user.subscriptionExpiresAt = new Date(now.getTime() + durationMs);
    user.bulletinsUsed = 0;
    user.periodStartedAt = now;
    user.subscriptionIsTrial = false; // un paiement réel supersède toujours un essai gratuit
    await user.save();
    return user;
}

// Accorde l'essai gratuit de 14 jours (niveau Starter) à l'inscription.
async function grantTrial(userId) {
    const user = await User.findByPk(userId);
    if (!user) return null;
    const now = new Date();
    user.subscriptionTier = 'starter';
    user.subscriptionExpiresAt = new Date(now.getTime() + TRIAL_DURATION_MS);
    user.bulletinsUsed = 0;
    user.periodStartedAt = now;
    user.subscriptionIsTrial = true;
    await user.save();
    return user;
}

function isSubscriptionActive(user) {
    return !!(
        user.subscriptionTier &&
        user.subscriptionExpiresAt &&
        new Date(user.subscriptionExpiresAt) > new Date()
    );
}

function getSubscriptionSnapshot(user, plan) {
    const bulletinsLimit = plan ? plan.bulletinLimit : 0;
    const bulletinsUsed = user.bulletinsUsed || 0;
    return {
        subscriptionTier: user.subscriptionTier || null,
        subscriptionExpiresAt: user.subscriptionExpiresAt || null,
        subscriptionIsTrial: !!user.subscriptionIsTrial,
        credits: user.credits || 0,
        bulletinsUsed,
        bulletinsLimit,
        bulletinsRemaining: Math.max(0, bulletinsLimit - bulletinsUsed)
    };
}

// Vérifie qu'un utilisateur peut générer `countNeeded` bulletins supplémentaires
// sur sa période d'abonnement en cours. Blocage strict : pas de dépassement autorisé.
function checkQuota(user, plan, countNeeded) {
    if (user.credits >= countNeeded) {
        return { ok: true, useCredits: true };
    }
    if (!user.subscriptionTier || !user.subscriptionExpiresAt) {
        return { ok: false, reason: 'no_subscription' };
    }
    if (!isSubscriptionActive(user)) {
        return { ok: false, reason: 'subscription_expired' };
    }
    if (!plan) {
        return { ok: false, reason: 'no_subscription' };
    }
    const used = user.bulletinsUsed || 0;
    if (used + countNeeded > plan.bulletinLimit) {
        return { ok: false, reason: 'quota_exceeded' };
    }
    return { ok: true, useCredits: false };
}

function quotaErrorMessage(reason, { plan, user, countNeeded } = {}) {
    switch (reason) {
        case 'no_subscription':
            return "Vous n'avez pas d'abonnement actif et vous n'avez pas/plus de crédits suffisants. Choisissez une formule pour générer des bulletins.";
        case 'subscription_expired': {
            const dateStr = user?.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).toLocaleDateString('fr-FR') : '';
            return `Votre abonnement a expiré${dateStr ? ` le ${dateStr}` : ''}. Renouvelez pour continuer.`;
        }
        case 'quota_exceeded': {
            const used = user?.bulletinsUsed || 0;
            const limit = plan?.bulletinLimit || 0;
            return `Cette génération de ${countNeeded} bulletin(s) dépasserait votre quota mensuel (${used}/${limit} déjà utilisés). Passez à un forfait supérieur ou réduisez le lot.`;
        }
        default:
            return "Quota d'abonnement insuffisant.";
    }
}

module.exports = {
    getActivePlans,
    getPlanByCode,
    resolvePlanByAmount,
    grantSubscription,
    grantTrial,
    isSubscriptionActive,
    getSubscriptionSnapshot,
    checkQuota,
    quotaErrorMessage
};
