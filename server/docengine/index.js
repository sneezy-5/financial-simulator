// ═══════════════════════════════════════════════════════
// MOTEUR DE DOCUMENTS — point d'entrée et registres
//
//   Extracteurs  →   Document IR   →  Détecteurs  →  Rendus
//   (pdf, image)     (blocs, filets,   (règles,       (html,
//                     cadres, couleurs)  lexique, IA)   …)
//
// Trois points d'extension, un contrat stable au milieu (ir.js). On ajoute un
// extracteur Word sans toucher au rendu, un lexique Sénégal sans toucher à
// l'extraction, un rendu docx sans toucher à la détection.
//
// Principe directeur : DÉTERMINISTE PAR DÉFAUT, IA EN REPLI EXPLICITE, et toute
// sortie d'IA vérifiée contre le texte réellement extrait du document.
// ═══════════════════════════════════════════════════════

const ir = require('./ir');
const layout = require('./layout');
const pdfExtract = require('./extract/pdfExtract');
const rules = require('./detect/rules');
const htmlRender = require('./render/htmlRender');

// ── Registres ────────────────────────────────────────────────────────────────

/**
 * Version du moteur, à incrémenter dès que l'extraction, la détection ou le
 * rendu changent le gabarit produit.
 *
 * Elle est enregistrée avec chaque modèle analysé. Un gabarit reste figé une
 * fois sauvegardé : sans cette empreinte, un modèle analysé par une version
 * antérieure continuait d'être utilisé indéfiniment, et les correctifs
 * apportés depuis restaient invisibles — un bandeau « NET À PAYER » amputé de
 * son libellé, par exemple, subsistait sans que personne comprenne pourquoi.
 */
const ENGINE_VERSION = 5;

const extractors = new Map();
const detectors = [];
const renderers = new Map();

/**
 * Enregistre un extracteur.
 * @param {string} kind    'pdf', 'image', 'docx'…
 * @param {object} plugin  { test(buffer, meta): boolean, extract(buffer, opts): Promise<IR> }
 */
function registerExtractor(kind, plugin) {
    extractors.set(kind, plugin);
}

/**
 * Enregistre un détecteur de variables. Les détecteurs s'exécutent dans l'ordre
 * de leur `priority` croissante ; chacun voit ce que le précédent a trouvé et
 * ne doit compléter que ce qui manque.
 * @param {object} plugin { name, priority, detect(doc, ctx): Promise<IR>|IR }
 */
function registerDetector(plugin) {
    detectors.push(plugin);
    detectors.sort((a, b) => (a.priority || 50) - (b.priority || 50));
}

/**
 * Enregistre un rendu.
 * @param {string} format 'html', 'docx'…
 * @param {object} plugin { render(doc, options): object }
 */
function registerRenderer(format, plugin) {
    renderers.set(format, plugin);
}

// ── Branchements par défaut ──────────────────────────────────────────────────

registerExtractor('pdf', {
    test: (buffer, meta) =>
        /\.pdf$/i.test(meta?.filename || '') ||
        (buffer && buffer.length > 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF'),
    extract: (buffer, opts) => pdfExtract.extractPdf(buffer, opts)
});

registerDetector({
    name: 'rules',
    priority: 10,
    detect: (doc, ctx) => rules.detect(doc, ctx.nature)
});

registerRenderer('html', htmlRender);

// ── Pipeline ─────────────────────────────────────────────────────────────────

/** Choisit l'extracteur qui accepte ce fichier. */
function pickExtractor(buffer, meta) {
    if (meta?.kind && extractors.has(meta.kind)) return extractors.get(meta.kind);
    for (const plugin of extractors.values()) {
        try {
            if (plugin.test(buffer, meta)) return plugin;
        } catch (e) { /* un test qui échoue ne doit pas bloquer les suivants */ }
    }
    return null;
}

/**
 * Chaîne complète : fichier → gabarit HTML avec variables.
 *
 * @param {Buffer} buffer
 * @param {object} options
 *   filename       nom d'origine, sert à choisir l'extracteur
 *   nature         'grid' | 'prose' | 'auto' (défaut)
 *   minConfidence  seuil en dessous duquel un candidat reste du texte fixe
 *   format         format de sortie (défaut 'html')
 *   maxPages       pages analysées (défaut 5)
 *   aiFallback     fonction async(doc, ctx) appelée pour le résidu, ou null
 * @returns {{ ok, html, nature, variables, ir, diagnostics }}
 */
async function buildTemplate(buffer, options = {}) {
    const extractor = pickExtractor(buffer, options);
    if (!extractor) {
        return { ok: false, reason: 'no-extractor', diagnostics: ["Aucun extracteur ne prend en charge ce format."] };
    }

    let doc;
    try {
        doc = await extractor.extract(buffer, { filename: options.filename, maxPages: options.maxPages });
    } catch (e) {
        // PDF corrompu, chiffré, ou d'une variante que pdf.js refuse. Ce n'est pas
        // une erreur du moteur : c'est un document dont la voie déterministe ne
        // peut rien tirer, et l'appelant doit pouvoir basculer proprement.
        return {
            ok: false,
            reason: 'extraction-failed',
            diagnostics: [`Lecture impossible : ${e.message}`]
        };
    }

    // Un document scanné n'a rien à offrir à la voie déterministe : on le signale
    // à l'appelant, à lui de basculer sur la lecture d'image par l'IA.
    if (!doc.source.hasTextLayer) {
        return {
            ok: false,
            reason: 'no-text-layer',
            ir: doc,
            diagnostics: doc.diagnostics
        };
    }

    doc = layout.analyze(doc);

    const nature = options.nature && options.nature !== 'auto'
        ? options.nature
        : ir.inferDocumentNature(doc);

    const ctx = { nature, options };
    // `useAi: false` retire les détecteurs marqués `ai` (voir aiDetect.js /
    // proseAi.js) — pour un flux qui doit rester strictement déterministe, un
    // fragment non reconnu par le lexique reste du texte fixe plutôt que
    // d'être proposé à un modèle, même sous garde-fous.
    const detectorsActifs = options.useAi === false ? detectors.filter(d => !d.ai) : detectors;
    for (const detector of detectorsActifs) {
        try {
            doc = (await detector.detect(doc, ctx)) || doc;
        } catch (e) {
            // Un détecteur qui échoue ne doit jamais faire perdre l'extraction :
            // le gabarit reste utilisable, simplement avec moins de variables.
            doc.diagnostics.push(`Détecteur « ${detector.name} » ignoré : ${e.message}`);
        }
    }

    const renderer = renderers.get(options.format || 'html');
    if (!renderer) {
        return { ok: false, reason: 'no-renderer', ir: doc, diagnostics: [`Format « ${options.format} » inconnu.`] };
    }

    const out = renderer.render(doc, { nature, minConfidence: options.minConfidence });

    return {
        ok: true,
        engineVersion: ENGINE_VERSION,
        html: out.html,
        nature: out.nature,
        variables: out.variables,
        // Emplacements détectés mais non rattachés au modèle de données : le
        // document est bien paramétrable à cet endroit, il reste à dire avec quoi
        // le remplir. C'est ce que l'interface doit proposer à l'utilisateur.
        unmapped: collectUnmapped(doc, options.minConfidence),
        stats: summarize(doc, out),
        ir: doc,
        diagnostics: doc.diagnostics
    };
}

/** Regroupe les emplacements provisoires, avec leur intitulé d'origine. */
function collectUnmapped(doc, minConfidence) {
    const min = minConfidence ?? 0.6;
    const byVariable = new Map();
    for (const v of doc.variables || []) {
        if (!v.variable || v.confidence < min) continue;
        if (!ir.isProvisionalVariable(v.variable)) continue;
        if (!byVariable.has(v.variable)) {
            byVariable.set(v.variable, { variable: v.variable, label: v.label, samples: [], count: 0 });
        }
        const entry = byVariable.get(v.variable);
        entry.count++;
        if (v.sample && entry.samples.length < 3) entry.samples.push(v.sample);
    }
    return [...byVariable.values()].sort((a, b) => a.variable.localeCompare(b.variable));
}

function summarize(doc, out) {
    const all = doc.variables || [];
    return {
        pages: doc.pages.length,
        textRuns: doc.pages.reduce((n, p) => n + p.texts.length, 0),
        rules: doc.pages.reduce((n, p) => n + p.lines.length, 0),
        rects: doc.pages.reduce((n, p) => n + p.rects.length, 0),
        tables: doc.pages.reduce((n, p) => n + p.tables.length, 0),
        blocks: doc.pages.reduce((n, p) => n + p.blocks.length, 0),
        candidates: all.length,
        identified: all.filter(v => v.variable).length,
        mapped: all.filter(v => v.variable && !ir.isProvisionalVariable(v.variable)).length,
        provisional: all.filter(v => v.variable && ir.isProvisionalVariable(v.variable)).length,
        bySource: all.reduce((acc, v) => {
            const k = v.detectedBy || 'rules';
            acc[k] = (acc[k] || 0) + 1;
            return acc;
        }, {}),
        variables: out.variables.length
    };
}

module.exports = {
    ENGINE_VERSION,
    buildTemplate,
    registerExtractor,
    registerDetector,
    registerRenderer,
    // Exposés pour les modules qui veulent composer eux-mêmes le pipeline
    ir,
    layout,
    rules,
    htmlRender,
    pdfExtract,
    extractors,
    detectors,
    renderers
};
