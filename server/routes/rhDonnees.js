// Routes — Données RH : salariés, modèles, absences, formations, évaluations.
// Extraites telles quelles de server.js (phase 6) ; server.js leur passe ses
// dépendances (middlewares, modèles, services) au moment de l'enregistrement.

module.exports = function enregistrerRoutesRhDonnees(app, deps) {
    const {
        Absence,
        Employee,
        Evaluation,
        Formation,
        Template,
        authMiddleware,
        differences,
        employeVersClient,
        employeVersModele,
        journaliser
    } = deps;

app.get('/api/hr/employees', authMiddleware, async (req, res) => {
    try {
        const employees = await Employee.findAll({ where: { userId: req.user.id } });
        res.json({ employees: employees.map(employeVersClient) });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/hr/employees :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.post('/api/hr/employees', authMiddleware, async (req, res) => {
    try {
        const emp = await Employee.create({ ...employeVersModele(req.body), userId: req.user.id });
        await journaliser({ req, action: 'salarie.cree', entite: 'salarie', entiteId: emp.id, libelle: `Création de la fiche ${emp.prenom} ${emp.nom}` });
        res.json({ employee: employeVersClient(emp) });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/hr/employees :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.put('/api/hr/employees/:id', authMiddleware, async (req, res) => {
    try {
        const emp = await Employee.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!emp) return res.status(404).json({ error: 'Employé introuvable' });
        const avant = emp.toJSON();
        await emp.update(employeVersModele(req.body));
        const changements = differences(avant, emp.toJSON());
        if (Object.keys(changements).length) {
            await journaliser({ req, action: 'salarie.modifie', entite: 'salarie', entiteId: emp.id, libelle: `Modification de la fiche ${emp.prenom} ${emp.nom}`, details: { changements } });
        }
        res.json({ employee: employeVersClient(emp) });
    } catch (e) {
        console.error('❌ Erreur sur PUT /api/hr/employees/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.delete('/api/hr/employees/:id', authMiddleware, async (req, res) => {
    try {
        const emp = await Employee.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!emp) return res.status(404).json({ error: 'Employé introuvable' });
        await journaliser({ req, action: 'salarie.supprime', entite: 'salarie', entiteId: emp.id, libelle: `Suppression de la fiche ${emp.prenom} ${emp.nom}`, details: { fiche: { matricule: emp.matricule, salaireBase: emp.salaireBase } } });
        await emp.destroy();
        res.json({ success: true });
    } catch (e) {
        console.error('❌ Erreur sur DELETE /api/hr/employees/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// --- Modèles de documents ---
// L'id est fourni par le client (créé côté frontend avant le premier
// enregistrement) : on cherche donc la ligne existante avant de choisir entre
// mise à jour et création, plutôt que d'exposer un POST/PUT séparés.
app.get('/api/hr/templates', authMiddleware, async (req, res) => {
    try {
        const lignes = await Template.findAll({ where: { userId: req.user.id } });
        const templates = lignes.map(l => JSON.parse(l.payload));
        res.json({ templates });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/hr/templates :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.post('/api/hr/templates', authMiddleware, async (req, res) => {
    try {
        const templateId = req.body.id ? String(req.body.id) : ('tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
        const template = { ...req.body, id: templateId };
        const payload = JSON.stringify(template);
        const existante = await Template.findOne({ where: { templateId, userId: req.user.id } });
        if (existante) {
            existante.payload = payload;
            await existante.save();
        } else {
            await Template.create({ templateId, userId: req.user.id, payload });
        }
        res.json({ template });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/hr/templates :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.delete('/api/hr/templates/:id', authMiddleware, async (req, res) => {
    try {
        await Template.destroy({ where: { templateId: req.params.id, userId: req.user.id } });
        res.json({ success: true });
    } catch (e) {
        console.error('❌ Erreur sur DELETE /api/hr/templates/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// --- Absences / Congés ---
// Le modèle Absence n'a pas de colonne `employeNom` — le nom vient de
// l'employé lié (`include: [Employee]`), jamais dupliqué en stockage pour ne
// pas diverger si la fiche est renommée. Sans cet aplatissement, le calendrier
// (CongesManager.vue) recevait `employeNom: undefined` et plantait sur
// `.split(' ')` dès que l'absence provenait du serveur plutôt que du repli
// localStorage.
function absenceVersClient(abs) {
    const source = abs.toJSON ? abs.toJSON() : abs;
    const emp = source.Employee;
    const nomComplet = emp ? `${emp.prenom || ''} ${emp.nom || ''}`.trim() : '';
    return { ...source, employeNom: nomComplet || 'Inconnu' };
}

app.get('/api/hr/absences', authMiddleware, async (req, res) => {
    try {
        const absences = await Absence.findAll({ where: { userId: req.user.id }, include: [Employee] });
        res.json({ absences: absences.map(absenceVersClient) });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/hr/absences :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.post('/api/hr/absences', authMiddleware, async (req, res) => {
    try {
        const { employeNom, ...corps } = req.body; // ignoré : recalculé depuis l'employé lié
        const created = await Absence.create({ ...corps, userId: req.user.id });
        const abs = await Absence.findByPk(created.id, { include: [Employee] });
        res.json({ absence: absenceVersClient(abs) });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/hr/absences :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.put('/api/hr/absences/:id', authMiddleware, async (req, res) => {
    try {
        const abs = await Absence.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!abs) return res.status(404).json({ error: 'Absence introuvable' });
        const { employeNom, ...corps } = req.body;
        await abs.update(corps);
        const misAJour = await Absence.findByPk(abs.id, { include: [Employee] });
        res.json({ absence: absenceVersClient(misAJour) });
    } catch (e) {
        console.error('❌ Erreur sur PUT /api/hr/absences/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.delete('/api/hr/absences/:id', authMiddleware, async (req, res) => {
    try {
        const abs = await Absence.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!abs) return res.status(404).json({ error: 'Absence introuvable' });
        await abs.destroy();
        res.json({ success: true });
    } catch (e) {
        console.error('❌ Erreur sur DELETE /api/hr/absences/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// --- Formations ---
app.get('/api/hr/formations', authMiddleware, async (req, res) => {
    try {
        const formations = await Formation.findAll({ where: { userId: req.user.id }, include: [Employee] });
        res.json({ formations });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/hr/formations :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.post('/api/hr/formations', authMiddleware, async (req, res) => {
    try {
        const form = await Formation.create({ ...req.body, userId: req.user.id });
        res.json({ formation: form });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/hr/formations :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.put('/api/hr/formations/:id', authMiddleware, async (req, res) => {
    try {
        const form = await Formation.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!form) return res.status(404).json({ error: 'Formation introuvable' });
        await form.update(req.body);
        res.json({ formation: form });
    } catch (e) {
        console.error('❌ Erreur sur PUT /api/hr/formations/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.delete('/api/hr/formations/:id', authMiddleware, async (req, res) => {
    try {
        const form = await Formation.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!form) return res.status(404).json({ error: 'Formation introuvable' });
        await form.destroy();
        res.json({ success: true });
    } catch (e) {
        console.error('❌ Erreur sur DELETE /api/hr/formations/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

// --- Evaluations ---
app.get('/api/hr/evaluations', authMiddleware, async (req, res) => {
    try {
        const evaluations = await Evaluation.findAll({ where: { userId: req.user.id }, include: [Employee] });
        res.json({ evaluations });
    } catch (e) {
        console.error('❌ Erreur sur GET /api/hr/evaluations :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.post('/api/hr/evaluations', authMiddleware, async (req, res) => {
    try {
        const eval = await Evaluation.create({ ...req.body, userId: req.user.id });
        res.json({ evaluation: eval });
    } catch (e) {
        console.error('❌ Erreur sur POST /api/hr/evaluations :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.put('/api/hr/evaluations/:id', authMiddleware, async (req, res) => {
    try {
        const eval = await Evaluation.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!eval) return res.status(404).json({ error: 'Evaluation introuvable' });
        await eval.update(req.body);
        res.json({ evaluation: eval });
    } catch (e) {
        console.error('❌ Erreur sur PUT /api/hr/evaluations/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
app.delete('/api/hr/evaluations/:id', authMiddleware, async (req, res) => {
    try {
        const eval = await Evaluation.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!eval) return res.status(404).json({ error: 'Evaluation introuvable' });
        await eval.destroy();
        res.json({ success: true });
    } catch (e) {
        console.error('❌ Erreur sur DELETE /api/hr/evaluations/:id :', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
};
