const { SubscriptionPlan, User } = require('./database');

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DURATION_MS = 30 * DAY_MS; // 30 jours (mensuel, fallback)
const TRIAL_DURATION_MS = 30 * DAY_MS; // 1 mois d'essai Pro, sans carte bancaire

// Allocation gratuite mensuelle (hors essai, hors abonnement payant) : partagée
// entre bulletins groupés et fonctionnalités IA — un pool commun de 5 par mois
// glissant, pas 5 de chaque. Le bulletin individuel (et sa variante congé) et
// le solde de tout compte restent hors de ce quota : voir /api/rh/generate-
// single-payslip et /api/rh/generate-stc, jamais passés à checkQuota.
const FREE_MONTHLY_LIMIT = 5;
const FREE_MONTHLY_RESET_MS = 30 * DAY_MS;

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

// Accorde l'essai gratuit d'un mois — niveau Pro complet, sans paiement.
// Sur le code 'pro' précisément : un ancien code 'starter' était utilisé ici
// alors qu'aucun plan de ce nom n'existe dans SubscriptionPlan, ce qui cassait
// silencieusement le quota dès que les 5 crédits de bienvenue étaient épuisés
// (getPlanByCode('starter') renvoyait null, et l'essai se retrouvait bloqué
// exactement comme un compte sans abonnement).
async function grantTrial(userId) {
    const user = await User.findByPk(userId);
    if (!user) return null;
    const now = new Date();
    user.subscriptionTier = 'pro';
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
    const freeMonthlyUsed = user.freeMonthlyUsed || 0;
    return {
        subscriptionTier: user.subscriptionTier || null,
        subscriptionExpiresAt: user.subscriptionExpiresAt || null,
        subscriptionIsTrial: !!user.subscriptionIsTrial,
        credits: user.credits || 0,
        bulletinsUsed,
        bulletinsLimit,
        bulletinsRemaining: Math.max(0, bulletinsLimit - bulletinsUsed),
        // Allocation gratuite mensuelle : pertinente surtout hors abonnement
        // payant actif, mais toujours renvoyée pour que le client puisse
        // l'afficher (ex: "2/5 gratuits restants ce mois-ci").
        freeMonthlyUsed,
        freeMonthlyLimit: FREE_MONTHLY_LIMIT,
        freeMonthlyRemaining: Math.max(0, FREE_MONTHLY_LIMIT - freeMonthlyUsed)
    };
}

// Fait glisser l'allocation gratuite mensuelle à zéro dès que 30 jours se sont
// écoulés depuis le dernier rechargement (ou qu'elle n'a encore jamais été
// initialisée). Persiste immédiatement : c'est une écriture, pas une simple
// lecture, pour ne pas la refaire à chaque appel dans la même fenêtre.
async function ensureFreeMonthlyPeriod(user) {
    const now = new Date();
    const dernier = user.freeMonthlyResetAt ? new Date(user.freeMonthlyResetAt) : null;
    if (!dernier || (now - dernier) >= FREE_MONTHLY_RESET_MS) {
        user.freeMonthlyUsed = 0;
        user.freeMonthlyResetAt = now;
        await user.save();
    }
}

// Vérifie qu'un utilisateur peut générer `countNeeded` bulletins supplémentaires
// (génération groupée uniquement — le bulletin individuel n'appelle jamais
// cette fonction, voir le commentaire sur FREE_MONTHLY_LIMIT plus haut).
// Binaire : abonnement Pro (ou supérieur) actif = quota de la formule ; sinon
// = allocation gratuite mensuelle. Pas de palier intermédiaire à crédits — un
// abonnement Pro est ce qui donne accès, il n'y a rien à acheter à la pièce.
// Appeler ensureFreeMonthlyPeriod(user) avant, pour que freeMonthlyUsed soit à
// jour.
function checkQuota(user, plan, countNeeded) {
    if (isSubscriptionActive(user) && plan) {
        const used = user.bulletinsUsed || 0;
        if (used + countNeeded > plan.bulletinLimit) {
            return { ok: false, reason: 'quota_exceeded' };
        }
        return { ok: true };
    }
    const usedFree = user.freeMonthlyUsed || 0;
    if (usedFree + countNeeded > FREE_MONTHLY_LIMIT) {
        return { ok: false, reason: 'free_quota_exceeded' };
    }
    return { ok: true, useFreeMonthly: true };
}

// Les fonctions IA (reconstruction de modèle, mapping intelligent, canvas IA...)
// coûtent un vrai appel de modèle facturé au token. Même règle et même pool
// que checkQuota (freeMonthlyUsed) : Pro actif = illimité, sinon 5 par mois
// partagés avec la génération groupée de bulletins. Appeler
// ensureFreeMonthlyPeriod(user) avant.
function checkAiAccess(user) {
    if (isSubscriptionActive(user)) {
        return { ok: true };
    }
    const usedFree = user.freeMonthlyUsed || 0;
    if (usedFree + 1 > FREE_MONTHLY_LIMIT) {
        return { ok: false, reason: 'free_quota_exceeded' };
    }
    return { ok: true, useFreeMonthly: true };
}

function quotaErrorMessage(reason, { plan, user, countNeeded } = {}) {
    switch (reason) {
        case 'subscription_expired': {
            const dateStr = user?.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).toLocaleDateString('fr-FR') : '';
            return `Votre abonnement a expiré${dateStr ? ` le ${dateStr}` : ''}. Renouvelez pour continuer.`;
        }
        case 'quota_exceeded': {
            const used = user?.bulletinsUsed || 0;
            const limit = plan?.bulletinLimit || 0;
            return `Cette génération de ${countNeeded} bulletin(s) dépasserait votre quota mensuel (${used}/${limit} déjà utilisés). Passez à un forfait supérieur ou réduisez le lot.`;
        }
        case 'free_quota_exceeded':
            return `Vous avez atteint votre allocation gratuite de ${FREE_MONTHLY_LIMIT} par mois (bulletins groupés et fonctionnalités IA confondus). Elle se renouvelle automatiquement dans 30 jours, ou passez à un forfait payant pour un accès illimité.`;
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
    ensureFreeMonthlyPeriod,
    checkQuota,
    checkAiAccess,
    quotaErrorMessage,
    FREE_MONTHLY_LIMIT
};
