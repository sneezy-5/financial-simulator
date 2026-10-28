// Routes — Modèles de documents : PDF, Word, Office.
// Extraites telles quelles de server.js (phase 6) ; server.js leur passe ses
// dépendances (middlewares, modèles, services) au moment de l'enregistrement.

module.exports = function enregistrerRoutesDocuments(app, deps) {
    const {
        aiService,
        analyserModele,
        authMiddleware,
        checkConformity,
        decodeDataUrl,
        docEngine,
        extraireOffice,
        gateAiAccess,
        listerTypesDocuments,
        poserVariables,
        remplirOffice,
        templateEngine,
        upload
    } = deps;

/**
 * POST /api/rh/analyze-pdf-template
 * Reconstruit le modèle uploadé par le client en gabarit HTML.
 *
 * Deux voies, dans cet ordre :
 *
 *  1. DÉTERMINISTE (docengine) — quand le PDF a une couche texte. On lit la
 *     géométrie réelle du fichier : runs de texte, filets, cadres, aplats. Le
 *     résultat est exact, reproductible, instantané et gratuit. L'IA n'intervient
 *     que pour nommer les variables que le lexique métier n'a pas tranchées.
 *
 *  2. VISION IA — repli pour les documents scannés, qui n'ont aucune couche
 *     exploitable. Le modèle lit l'image et reconstruit la mise en page, puis
 *     vérifie son propre rendu.
 *
 * Les deux voies peuvent appeler un modèle IA (nommage de variable, contrôle
 * de conformité, ou reconstruction complète en vision) : un abonnement payant
 * actif donne un accès illimité, sinon chaque appel consomme un crédit.
 */
app.post('/api/rh/analyze-pdf-template', authMiddleware, async (req, res) => {
    try {
        if (!(await gateAiAccess(req, res))) return;
    } catch (e) {
        console.error('❌ Erreur sur POST /api/rh/analyze-pdf-template :', e);
        return res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
    const { imageBase64, textItems, pageSize, refinePasses, docType, fileBase64, engine: forced } = req.body;

    // ── Voie 1 : extraction déterministe ──
    if (fileBase64 && forced !== 'ai') {
        try {
            const buffer = decodeDataUrl(fileBase64);
            const result = await docEngine.buildTemplate(buffer, {
                filename: req.body.filename || 'modele.pdf',
                nature: natureFor(docType),
                minConfidence: 0.6,
                // Bulletin : aucune IA dans la détection des variables, même bornée à
                // un catalogue fermé — demande explicite. Ce qui n'est pas reconnu
                // par le lexique déterministe reste du texte fixe du modèle importé.
                useAi: docType !== 'payslip'
            });

            if (result.ok) {
                // Contrôle de conformité : on remet le gabarit produit face au
                // document d'origine et le modèle relève les écarts. Il constate,
                // il ne corrige pas — le gabarit reste le produit d'une chaîne
                // déterministe, on y ajoute seulement un regard.
                let conformity = null;
                if (imageBase64 && req.body.checkConformity !== false) {
                    conformity = await checkConformity({
                        renderPng: (html) => templateEngine.renderTemplateToPng(html),
                        askModel: (prompt, images) => aiService.callOpenRouter([{
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                ...images.map(url => ({ type: 'image_url', image_url: { url } }))
                            ]
                        }], { maxTokens: 1200, temperature: 0 })
                    }, {
                        html: result.html,
                        originalImage: imageBase64,
                        variables: result.variables,
                        unmapped: result.unmapped
                    });
                }

                return res.json({
                    success: true,
                    engine: 'deterministic',
                    conformity,
                    engineVersion: result.engineVersion,
                    htmlTemplate: result.html,
                    nature: result.nature,
                    variables: result.variables,
                    // Emplacements repérés mais non rattachés au modèle de
                    // données : l'interface peut proposer à l'utilisateur de leur
                    // associer une donnée, plutôt que de les laisser vides.
                    unmapped: result.unmapped,
                    stats: result.stats,
                    diagnostics: result.diagnostics
                });
            }
            console.log(`Moteur déterministe indisponible (${result.reason}) : repli sur la vision IA.`);
        } catch (e) {
            // Un PDF exotique ne doit pas faire échouer la requête : on bascule.
            console.warn('Extraction déterministe impossible, repli sur la vision IA :', e.message);
        }
    }

    // ── Voie 2 : vision IA ──
    try {
        if (!imageBase64) return res.status(400).json({ error: 'Image manquante' });

        let htmlTemplate = await aiService.rebuildDocumentTemplate(imageBase64, textItems, pageSize, docType);

        // Boucle de vérification : on rend le HTML produit, on le remontre au modèle
        // à côté de l'original, et il corrige ses propres écarts. C'est ce qui fait
        // la différence entre "ressemblant" et "identique".
        const requested = parseInt(refinePasses, 10);
        const passes = Math.min(Number.isNaN(requested) ? 1 : Math.max(requested, 0), 3);
        for (let i = 0; i < passes; i++) {
            try {
                const renderedImage = await templateEngine.renderTemplateToPng(htmlTemplate);
                htmlTemplate = await aiService.refineDocumentTemplate(imageBase64, renderedImage, htmlTemplate, docType);
            } catch (refineErr) {
                // Le raffinage est un bonus : s'il échoue (Chrome absent, quota IA),
                // on livre la première passe plutôt que de perdre tout le travail.
                console.warn('Passe de raffinage ignorée:', refineErr.message);
                break;
            }
        }

        res.json({ success: true, engine: 'ai-vision', engineVersion: 0, htmlTemplate });
    } catch (e) {
        console.error('Erreur IA Auto-Mapping:', e.message);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

/** Le type de document de l'interface donne la stratégie de mise en page. */
function natureFor(docType) {
    if (docType === 'hr_document') return 'prose';
    if (docType === 'payslip' || docType === 'form') return 'grid';
    return 'auto';
}

/**
 * POST /api/rh/upload-template
 * Uploads a document (Word/Excel) and returns it as base64 so the frontend can save it to its LocalDb.
 */
app.post('/api/rh/upload-template', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
        
        const fs = require('fs');
        const buffer = fs.readFileSync(req.file.path);
        
        res.json({
            success: true,
            fileBase64: buffer.toString('base64'),
            replacements: []
        });
    } catch (e) {
        console.error('Erreur upload-template:', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    } finally {
        if (req.file && require('fs').existsSync(req.file.path)) {
            require('fs').unlinkSync(req.file.path);
        }
    }
});

/**
 * POST /api/rh/fill-docx
 * Reçoit le base64 d'un modèle Word et les données à injecter.
 * Retourne le document final en base64.
 */
app.post('/api/rh/fill-docx', authMiddleware, async (req, res) => {
    try {
        const { fileBase64, docData } = req.body;
        if (!fileBase64 || !docData) {
            return res.status(400).json({ error: 'Données manquantes (fileBase64 ou docData)' });
        }

        const PizZip = require('pizzip');
        const Docxtemplater = require('docxtemplater');

        // Décoder le base64
        const content = decodeDataUrl(fileBase64);
        const zip = new PizZip(content);

        // Configurer docxtemplater
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            nullGetter() {
                // Si une variable n'existe pas, on laisse vide plutôt qu'un "undefined" moche.
                return "";
            }
        });

        // Rendre le document
        doc.render(docData);

        const buf = doc.getZip().generate({
            type: 'nodebuffer',
            compression: 'DEFLATE',
        });

        res.json({
            success: true,
            fileBase64: buf.toString('base64'),
            filename: `document_genere_${Date.now()}.docx`
        });
    } catch (e) {
        console.error('Erreur remplissage DOCX:', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});

/**
 * POST /api/rh/generate-payroll-docx
 * Reçoit un modèle Word et un tableau de données employés.
 * Génère un bulletin Word pour chaque employé et renvoie un fichier ZIP contenant tous les bulletins.
 */
app.post('/api/rh/generate-payroll-docx', authMiddleware, async (req, res) => {
    try {
        const { fileBase64, employeesData } = req.body;
        if (!fileBase64 || !Array.isArray(employeesData) || employeesData.length === 0) {
            return res.status(400).json({ error: 'Données manquantes (fileBase64 ou employeesData vide)' });
        }

        const PizZip = require('pizzip');
        const Docxtemplater = require('docxtemplater');

        // Créer un nouveau ZIP maître qui contiendra tous les bulletins DOCX
        const masterZip = new PizZip();

        // Décoder le modèle DOCX (qui est lui-même un zip)
        const templateContent = decodeDataUrl(fileBase64);

        employeesData.forEach((empData, index) => {
            // À chaque itération, recréer l'instance PizZip à partir du modèle vierge
            const zip = new PizZip(templateContent);
            
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                nullGetter() { return ""; }
            });

            // Rendre le document avec les données de cet employé
            doc.render(empData);

            // Obtenir le buffer DOCX généré
            const buf = doc.getZip().generate({
                type: 'nodebuffer',
                compression: 'DEFLATE',
            });

            // Déterminer le nom du fichier
            const filename = empData._filename || `Bulletin_${empData.nomComplet || index}.docx`;
            
            // Ajouter le fichier DOCX généré dans le ZIP maître
            masterZip.file(filename, buf);
        });

        // Générer le fichier ZIP maître
        const masterZipBuffer = masterZip.generate({
            type: 'nodebuffer',
            compression: 'DEFLATE',
        });

        res.json({
            success: true,
            zipBase64: masterZipBuffer.toString('base64'),
            filename: `Bulletins_de_Paie_${new Date().toISOString().slice(0, 7)}.zip`
        });

    } catch (e) {
        console.error('Erreur génération ZIP DOCX:', e);
        res.status(500).json({ error: "Une erreur interne est survenue. Veuillez réessayer plus tard." });
    }
});
/**
 * ═══════════════════════════════════════════════════════
 * MODÈLES WORD ET EXCEL
 *
 * Trois routes, correspondant aux trois temps de la boucle de validation :
 *
 *   1. types      — la liste des types de documents, pour le sélecteur
 *   2. analyser   — le moteur PROPOSE les emplacements, sans rien modifier
 *   3. gabarit    — l'utilisateur ayant validé, on pose les variables
 *
 * Rien n'est appliqué au fichier du client tant qu'il n'a pas validé. Tant
 * qu'il n'a pas cliqué, son modèle est intact et il peut faire réanalyser.
 * ═══════════════════════════════════════════════════════
 */

app.get('/api/rh/office/types', authMiddleware, (req, res) => {
    res.json({ success: true, types: listerTypesDocuments() });
});

app.post('/api/rh/office/analyser', authMiddleware, async (req, res) => {
    try {
        if (!(await gateAiAccess(req, res))) return;
        const { fileBase64, filename, docType } = req.body;
        if (!fileBase64) return res.status(400).json({ error: 'Aucun fichier fourni.' });

        const buffer = decodeDataUrl(fileBase64);
        const extrait = extraireOffice(buffer, filename || '');
        const analyse = analyserModele(extrait, docType || 'autre');

        res.json({
            success: true,
            format: extrait.kind,
            nature: analyse.nature,
            typeDocument: analyse.typeDocument,
            emplacements: analyse.emplacements,
            variables: analyse.variables,
            completude: analyse.completude,
            resume: analyse.resume,
            // Aperçu du document tel qu'il deviendra, variables apparentes :
            // c'est ce que l'utilisateur regarde pour valider ou faire réanalyser.
            apercu: construireApercu(extrait, analyse.emplacements)
        });
    } catch (e) {
        console.error('Analyse du modèle Office :', e.message);
        res.status(400).json({ error: "Requête invalide." });
    }
});

app.post('/api/rh/office/gabarit', authMiddleware, async (req, res) => {
    try {
        const { fileBase64, filename, emplacements } = req.body;
        if (!fileBase64) return res.status(400).json({ error: 'Aucun fichier fourni.' });
        if (!Array.isArray(emplacements) || !emplacements.length) {
            return res.status(400).json({ error: 'Aucun emplacement validé.' });
        }

        const buffer = decodeDataUrl(fileBase64);
        const format = /\.xlsx$/i.test(filename || '') ? 'xlsx' : 'docx';
        const resultat = poserVariables(buffer, emplacements, format);

        res.json({
            success: true,
            format,
            gabaritBase64: resultat.buffer.toString('base64'),
            remplaces: resultat.remplaces ?? emplacements.length,
            introuvables: resultat.introuvables || []
        });
    } catch (e) {
        console.error('Génération du gabarit Office :', e.message);
        res.status(400).json({ error: "Requête invalide." });
    }
});

/**
 * POST /api/rh/office/remplir
 *
 * Generation depuis un gabarit valide : les {variables} recoivent les donnees
 * du salarie. Le fichier d'origine n'est pas reconstruit, donc la mise en page
 * du client est rendue a l'identique : c'est tout l'interet de cette voie.
 */
app.post('/api/rh/office/remplir', authMiddleware, async (req, res) => {
    try {
        const { gabaritBase64, format, donnees } = req.body;
        if (!gabaritBase64) return res.status(400).json({ error: 'Aucun gabarit fourni.' });
        if (!donnees || typeof donnees !== 'object') {
            return res.status(400).json({ error: 'Aucune donnee a injecter.' });
        }

        const buffer = decodeDataUrl(gabaritBase64);
        const type = format === 'xlsx' ? 'xlsx' : 'docx';
        const resultat = remplirOffice(buffer, donnees, type);

        res.json({
            success: true,
            format: type,
            fileBase64: resultat.buffer.toString('base64'),
            // Les variables sans donnee sont laissees vides et signalees : sur un
            // document officiel, un blanc vaut mieux qu'un montant invente.
            nonResolues: resultat.nonResolues || []
        });
    } catch (e) {
        console.error('Remplissage du gabarit Office :', e.message);
        res.status(400).json({ error: "Requête invalide." });
    }
});

/**
 * Aperçu textuel du document avec les variables en place.
 *
 * On ne rend pas le fichier — il n'a pas changé, et le rendre demanderait un
 * convertisseur. On montre son CONTENU tel qu'il sera, ce qui suffit pour juger
 * si les variables sont aux bons endroits.
 */
function construireApercu(extrait, emplacements) {
    const parTexte = new Map();
    for (const e of emplacements || []) {
        if (e && e.original && e.variable) parTexte.set(e.original, e.variable);
    }
    const marquer = (texte) => {
        const t = String(texte || '').trim();
        const variable = parTexte.get(t);
        return variable ? { texte: `{${variable}}`, variable } : { texte: t, variable: null };
    };

    const lignes = [];
    for (const element of extrait.elements || []) {
        if (element.type === 'paragraphe') {
            let texte = element.texte;
            for (const [original, variable] of parTexte) {
                if (texte.includes(original)) texte = texte.split(original).join(`{${variable}}`);
            }
            lignes.push({ type: 'paragraphe', gras: !!element.gras, texte });
        } else if (element.type === 'tableau') {
            const parLigne = new Map();
            for (const cell of element.cells) {
                if (!parLigne.has(cell.r)) parLigne.set(cell.r, []);
                parLigne.get(cell.r).push(cell);
            }
            const rangs = [...parLigne.keys()].sort((a, b) => a - b).map(r =>
                parLigne.get(r).sort((a, b) => a.c - b.c).map(cell => {
                    const m = marquer(cell.texte);
                    return { ...m, colSpan: cell.colSpan || 1, gras: !!cell.gras };
                }));
            lignes.push({ type: 'tableau', feuille: element.feuille || null, rangs });
        }
    }
    return lignes;
}
};
