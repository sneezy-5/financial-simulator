// Routes — Intelligence artificielle (OpenRouter).
// Extraites telles quelles de server.js (phase 6) ; server.js leur passe ses
// dépendances (middlewares, modèles, services) au moment de l'enregistrement.

module.exports = function enregistrerRoutesIa(app, deps) {
    const {
        aiService
    } = deps;

// ═══════════════════════════════════════════════════════
// ROUTES IA - OpenRouter
// ═══════════════════════════════════════════════════════

// Ces deux routes sont volontairement publiques (simulateur fiscal, sans
// compte à créer) — donc jamais protégées par des crédits. Sans aucun
// garde-fou, elles restaient un robinet à appels IA totalement ouvert à
// quiconque sur Internet. Limiteur mémoire minimal (par IP), suffisant pour
// écarter le scraping/abus automatisé sans exiger de connexion.
const aiRateLimitHits = new Map();
const AI_RATE_LIMIT_MAX = 10;
const AI_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 heure
function limiterIaPublique(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'inconnu';
    const now = Date.now();
    const entry = aiRateLimitHits.get(ip);
    if (!entry || now - entry.debut > AI_RATE_LIMIT_WINDOW_MS) {
        aiRateLimitHits.set(ip, { debut: now, count: 1 });
        return next();
    }
    if (entry.count >= AI_RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans quelques minutes.' });
    }
    entry.count++;
    next();
}
// Purge périodique pour ne pas laisser grossir la map indéfiniment.
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of aiRateLimitHits) {
        if (now - entry.debut > AI_RATE_LIMIT_WINDOW_MS) aiRateLimitHits.delete(ip);
    }
}, AI_RATE_LIMIT_WINDOW_MS).unref();

/**
 * POST /api/ai/analyse
 * Analyse complète de la situation financière d'une entreprise
 */
app.post('/api/ai/analyse', limiterIaPublique, async (req, res) => {
    try {
        const { entreprise, resultats, projections } = req.body;
        if (!entreprise || !entreprise.ca) {
            return res.status(400).json({ error: 'Données entreprise manquantes' });
        }
        const analyse = await aiService.analyserEntreprise({ entreprise, resultats, projections });
        res.json({ success: true, analyse });
    } catch (e) {
        console.error('Erreur IA analyse:', e.message);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

/**
 * POST /api/ai/chat
 * Réponse à une question spécifique du chef d'entreprise
 */
app.post('/api/ai/chat', limiterIaPublique, async (req, res) => {
    try {
        const { question, contexte } = req.body;
        if (!question) {
            return res.status(400).json({ error: 'Question manquante' });
        }
        const reponse = await aiService.repondreQuestion(question, contexte || {});
        res.json({ success: true, reponse });
    } catch (e) {
        console.error('Erreur IA chat:', e.message);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
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
};
