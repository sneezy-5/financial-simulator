// Routes — Périodes de paie, cycle (contrôles, clôture), audit, plan comptable, déclarations.
// Extraites telles quelles de server.js (phase 6) ; server.js leur passe ses
// dépendances (middlewares, modèles, services) au moment de l'enregistrement.

module.exports = function enregistrerRoutesPaieGouvernance(app, deps) {
    const {
        AuditLog,
        PayrollPeriod,
        PayslipRecord,
        TYPES_ANNUELS,
        User,
        authMiddleware,
        cyclePaie,
        genererDeclaration,
        journaliser
    } = deps;

// ─── Périodes de paie (historique + validation — fondation des futures déclarations) ──────

// GET /api/rh/periods - Liste des périodes de l'utilisateur connecté
app.get('/api/rh/periods', authMiddleware, async (req, res) => {
    try {
        const periods = await PayrollPeriod.findAll({
            where: { userId: req.user.id },
            order: [['annee', 'DESC'], ['mois', 'DESC']]
        });
        const periodsWithCount = await Promise.all(periods.map(async (p) => {
            const employeeCount = await PayslipRecord.count({ where: { periodId: p.id } });
            return { ...p.toJSON(), employeeCount };
        }));
        res.json({ success: true, periods: periodsWithCount });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/rh/periods :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// ─── Cycle de paie : contrôles et changements de statut ───────────────────────
async function bulletinsPrecedents(userId, period) {
    const moisPrec = period.mois === 1 ? 12 : period.mois - 1;
    const anneePrec = period.mois === 1 ? period.annee - 1 : period.annee;
    const prec = await PayrollPeriod.findOne({ where: { userId, mois: moisPrec, annee: anneePrec, country: period.country || 'CI' } });
    return prec ? (await PayslipRecord.findAll({ where: { periodId: prec.id } })).map(r => r.toJSON()) : [];
}

async function controlerPeriode(userId, period) {
    const records = (await PayslipRecord.findAll({ where: { periodId: period.id } })).map(r => r.toJSON());
    return cyclePaie.controlesPeriode({ records, precedents: await bulletinsPrecedents(userId, period), periode: period });
}

// GET /api/rh/periods/:id/controles — anomalies de la période (bloquantes / alertes / infos)
app.get('/api/rh/periods/:id/controles', authMiddleware, async (req, res) => {
    try {
        const period = await PayrollPeriod.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!period) return res.status(404).json({ error: 'Période introuvable' });
        res.json({ success: true, statut: period.status, ...(await controlerPeriode(req.user.id, period)) });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/rh/periods/:id/controles :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// POST /api/rh/periods/:id/statut  { action: 'valider' | 'cloturer' | 'rouvrir', motif? }
app.post('/api/rh/periods/:id/statut', authMiddleware, async (req, res) => {
    try {
        const period = await PayrollPeriod.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!period) return res.status(404).json({ error: 'Période introuvable' });
        const { action, motif } = req.body || {};
        const t = cyclePaie.transition(period.status, action, { motif });
        if (!t.ok) return res.status(400).json({ error: t.erreur });

        // Valider ou clôturer exige l'absence d'anomalie bloquante.
        let controles = null;
        if (action !== 'rouvrir') {
            controles = await controlerPeriode(req.user.id, period);
            if (!controles.cloturable) {
                return res.status(422).json({ error: `${controles.resume.bloquants} anomalie(s) bloquante(s) : corrigez-les puis régénérez la période.`, ...controles });
            }
        }

        const avant = period.status;
        period.status = t.vers;
        if (action === 'valider') period.validatedAt = new Date();
        if (action === 'cloturer') { period.closedAt = new Date(); period.validatedAt = period.validatedAt || new Date(); }
        if (action === 'rouvrir') { period.closedAt = null; period.validatedAt = null; }
        await period.save();

        const libellePeriode = `${String(period.mois).padStart(2, '0')}/${period.annee}`;
        const verbe = { valider: 'Validation', cloturer: 'Clôture', rouvrir: 'Réouverture' }[action];
        await journaliser({
            req, action: { valider: 'periode.validee', cloturer: 'periode.cloturee', rouvrir: 'periode.rouverte' }[action],
            entite: 'periode', entiteId: period.id,
            libelle: `${verbe} de la paie ${libellePeriode}${action === 'rouvrir' ? ' — motif : ' + String(motif).trim() : ''}`,
            details: { statut: { avant, apres: period.status }, motif: motif || null, alertes: controles?.resume?.alertes ?? null }
        });
        res.json({ success: true, period, controles });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/rh/periods/:id/statut :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// GET /api/rh/compta/plan — plan comptable de paie par défaut + personnalisation du compte
app.get('/api/rh/compta/plan', authMiddleware, async (req, res) => {
    try {
        const { PLAN_DEFAUT, JOURNAUX_DEFAUT } = require('../compta/planComptable');
        const u = await User.findByPk(req.user.id, { attributes: ['comptesPaie'] });
        let perso = {};
        try { perso = u?.comptesPaie ? JSON.parse(u.comptesPaie) : {}; } catch { perso = {}; }
        res.json({ success: true, plan: PLAN_DEFAUT, journaux: JOURNAUX_DEFAUT, personnalise: perso });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/rh/compta/plan :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// GET /api/rh/audit?limit=100&entite=periode — journal d'audit du compte (plus récent d'abord)
app.get('/api/rh/audit', authMiddleware, async (req, res) => {
    try {
        const where = { userId: req.user.id };
        if (req.query.entite) where.entite = String(req.query.entite);
        const limite = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
        const lignes = await AuditLog.findAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: limite });
        res.json({ success: true, evenements: lignes.map(l => ({ ...l.toJSON(), details: l.details ? JSON.parse(l.details) : null })) });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/rh/audit :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// GET /api/rh/periods/:id - Détail d'une période + ses bulletins enregistrés
app.get('/api/rh/periods/:id', authMiddleware, async (req, res) => {
    try {
        const period = await PayrollPeriod.findByPk(req.params.id);
        if (!period || period.userId !== req.user.id) {
            return res.status(404).json({ error: "Période introuvable" });
        }
        const records = await PayslipRecord.findAll({ where: { periodId: period.id } });
        res.json({ success: true, period, records });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/rh/periods/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// ─── Déclarations sociales / fiscales (CNPS, ITS, FDFP...) ────────────────────
// Générées à partir de l'historique de paie figé (PayslipRecord). Ce sont des
// AIDES À LA SAISIE sur e-CNPS / e-Impôts, pas des télédéclarations.
//
// GET /api/rh/declarations?type=cnps|cnps-liste|its|fdfp&format=pdf|xlsx|csv&periodIds=1,2,3
// GET /api/rh/declarations?type=disa|livre-annuel|recap-masse|regul-fdfp&format=…&annee=2026
//   periodIds : une période (mensuel) ou trois d'un même trimestre (trimestriel).
app.get('/api/rh/declarations', authMiddleware, async (req, res) => {
    try {
        const type = String(req.query.type || '');
        const format = String(req.query.format || 'pdf');
        const annee = parseInt(req.query.annee, 10);
        let periods;
        if (TYPES_ANNUELS.includes(type)) {
            // État annuel : toutes les périodes CI de l'exercice.
            if (!Number.isFinite(annee)) return res.status(400).json({ error: 'annee requise pour un état annuel.' });
            periods = await PayrollPeriod.findAll({ where: { annee, userId: req.user.id } });
            periods = periods.filter(p => (p.country || 'CI') === 'CI');
            if (!periods.length) return res.status(404).json({ error: `Aucune période de paie enregistrée pour ${annee}.` });
        } else {
            const ids = String(req.query.periodIds || req.query.periodId || '')
                .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
            if (!ids.length) return res.status(400).json({ error: 'periodIds requis.' });
            periods = await PayrollPeriod.findAll({ where: { id: ids, userId: req.user.id } });
            if (periods.length !== ids.length) {
                return res.status(404).json({ error: "Période(s) introuvable(s) ou non autorisée(s)." });
            }
        }
        if (periods.some(p => (p.country || 'CI') !== 'CI')) {
            return res.status(400).json({ error: "Les déclarations ne sont disponibles que pour la Côte d'Ivoire." });
        }

        const records = [];
        for (const p of periods) {
            const recs = await PayslipRecord.findAll({ where: { periodId: p.id } });
            records.push(...recs.map(r => ({ ...r.toJSON(), mois: p.mois, annee: p.annee })));
        }

        const u = await User.findByPk(req.user.id);
        const entreprise = {
            raisonSociale: u?.companyName || '',
            numeroCnps: u?.companyNumeroCnps || '',
            numeroEmployeur: u?.companyNumeroEmployeur || u?.companyNumeroCnps || '',
            numeroContribuable: u?.companyNumeroContribuable || '',
            serviceAssiette: u?.companyServiceAssiette || '',
            comptesPaie: u?.comptesPaie || null,
            adresse: u?.companyAdresse || '',
            telephone: u?.companyTelephone || '',
            ville: u?.companyVille || '',
            signataireNom: u?.companySignataireNom || '',
            tauxAtMp: (u?.companyTauxAtMp ?? null),
            cnpsVersementMensuel: (u?.companyCnpsVersementMensuel ?? null)
        };

        const out = await genererDeclaration({
            type, format, entreprise,
            periodes: periods.map(p => ({ mois: p.mois, annee: p.annee })),
            records
        });

        res.setHeader('Content-Type', out.mime);
        res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
        if (out.partielle) res.setHeader('X-Declaration-Partielle', '1');
        return res.send(out.buffer);
    } catch (e) {
        console.error('❌ Erreur sur GET /api/rh/declarations :', e);
        res.status(400).json({ error: e.message || "Génération impossible." });
    }
});
};
