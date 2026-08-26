// ═══════════════════════════════════════════════════════
// DÉTECTEUR IA POUR LES DOCUMENTS RÉDIGÉS
//
// Dans une grille, la structure porte le sens : une valeur à droite d'un libellé
// connu est identifiable sans comprendre la langue. Dans un contrat ou une
// attestation, la structure ne porte rien — le sens est entièrement dans la
// phrase.
//
// Les motifs de prosePatterns.js couvrent les tournures les plus stéréotypées
// (« représentée par X, en qualité de Y »), mais ils reconnaissent la FORME, pas
// le SENS. « Je soussigné » désigne l'employeur dans un contrat et le salarié
// dans une demande de congés : aucun motif ne peut trancher, seule la
// compréhension du document le peut.
//
// C'est donc ici, et seulement ici, que le modèle de langue est le bon outil.
// Le déterminisme n'est pas abandonné pour autant : il encadre l'IA.
//
//   AVANT  — le texte soumis est extrait exactement du PDF, jamais deviné.
//   APRÈS  — chaque portion proposée doit exister TELLE QUELLE dans ce texte,
//            son nom doit appartenir au catalogue, et elle ne doit pas empiéter
//            sur une détection déjà acquise. Tout le reste est rejeté.
//
// La substitution finale reste une recherche de sous-chaîne exacte : le modèle
// ne peut ni réécrire le document, ni en déplacer un mot.
// ═══════════════════════════════════════════════════════

const lexicon = require('./lexicon');

/** Catalogue fermé des variables d'un document RH rédigé. */
const PROSE_VARIABLES = [
    { name: 'nomComplet', desc: "nom et prénoms du salarié concerné par le document" },
    { name: 'poste', desc: "emploi ou fonction du salarié" },
    { name: 'dateEntree', desc: "date d'embauche ou de début du contrat" },
    { name: 'dateSortie', desc: "date de fin de contrat ou de départ" },
    { name: 'salaireAff', desc: "montant de la rémunération" },
    { name: 'entreprise', desc: "raison sociale de l'employeur" },
    { name: 'adresse', desc: "adresse ou siège de l'employeur" },
    { name: 'signataireNom', desc: "nom de la personne qui SIGNE le document au nom de l'employeur" },
    { name: 'signatairePoste', desc: "qualité du signataire (Directeur Général, DRH…)" },
    { name: 'matricule', desc: "matricule ou numéro d'immatriculation du salarié" },
    { name: 'lieu', desc: "ville de rédaction du document" },
    { name: 'dateDoc', desc: "date de rédaction du document" },
    { name: 'dateDebutConge', desc: "date de début d'une période de congés ou d'absence" },
    { name: 'dateFinConge', desc: "date de fin d'une période de congés ou d'absence" },
    { name: 'nombreJours', desc: "nombre de jours (congés, préavis, essai…)" },
    { name: 'soldeConges', desc: "solde de congés acquis" },
    { name: 'motif', desc: "motif invoqué (licenciement, avertissement, absence…)" }
];

const CATALOGUE = new Set(PROSE_VARIABLES.map(v => v.name));

/** Paragraphes soumis au modèle, dans l'ordre de lecture. */
function collectParagraphs(doc) {
    const out = [];
    doc.pages.forEach((page, pageIndex) => {
        page.blocks.forEach(block => {
            const text = (block.lines || [block.text]).join(' ').trim();
            // Un titre isolé ne contient pas de donnée ; un pavé trop long coûte
            // cher pour rien.
            if (text.length < 12 || text.length > 1200) return;
            if (lexicon.isTitleOnly(text)) return;
            out.push({ pageIndex, blockId: block.id, text });
        });
    });
    return out;
}

function buildPrompt(paragraphs, alreadyFound) {
    const corpus = paragraphs
        .map(p => `[${p.pageIndex}:${p.blockId}] ${p.text}`)
        .join('\n\n');

    const catalogue = PROSE_VARIABLES
        .map(v => `  ${v.name} — ${v.desc}`)
        .join('\n');

    const deja = alreadyFound.length
        ? `\nDéjà identifié, à ne pas reprendre : ${alreadyFound.join(', ')}.\n`
        : '';

    return `Tu prépares un gabarit réutilisable à partir d'un document RH existant.

Repère dans le texte ci-dessous les portions qui sont des DONNÉES PROPRES À CE DOSSIER
(noms, dates, montants, durées) et qui devront être remplacées pour un autre salarié.
Tout le reste — formules juridiques, mentions légales, titres — est du texte fixe.

Variables autorisées, et elles seules :
${catalogue}
${deja}
Attention au SENS, pas seulement à la tournure : « je soussigné » introduit l'employeur
dans une attestation, mais le salarié lui-même dans une demande de congés. Choisis la
variable d'après le rôle réel de la personne dans CE document.

TEXTE :
${corpus}

Réponds UNIQUEMENT par un tableau JSON :
[{"bloc": "<identifiant entre crochets>", "texte": "<portion EXACTE, recopiée caractère pour caractère>", "variable": "<nom du catalogue>"}]

La portion doit être la valeur seule, sans la formule qui l'introduit :
pour « à compter du 01/09/2023 », la portion est « 01/09/2023 », pas « à compter du 01/09/2023 ».
N'inclus que ce dont tu es sûr : une omission se corrige à la main, une erreur met une
fausse donnée sur un document officiel.`;
}

function parseJsonArray(text) {
    let t = (text || '').trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const a = t.indexOf('['), b = t.lastIndexOf(']');
    if (a < 0 || b <= a) return [];
    try {
        const parsed = JSON.parse(t.slice(a, b + 1));
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

/**
 * @param {function} callModel async (prompt) => string
 */
function createProseAiDetector(callModel, opts = {}) {
    const maxParagraphs = opts.maxParagraphs ?? 40;

    return {
        name: 'ai-prose',
        priority: 80,   // après les règles, avant le détecteur de résidu
        ai: true,       // filtré par `useAi: false` (voir index.js)
        async detect(doc, ctx) {
            if (typeof callModel !== 'function' || ctx.nature !== 'prose') return doc;

            const paragraphs = collectParagraphs(doc).slice(0, maxParagraphs);
            if (!paragraphs.length) return doc;

            const dejaVu = [...new Set((doc.variables || []).filter(v => v.variable).map(v => v.variable))];
            const raw = await callModel(buildPrompt(paragraphs, dejaVu));
            const proposals = parseJsonArray(raw);

            const byBlock = new Map(paragraphs.map(p => [`${p.pageIndex}:${p.blockId}`, p]));
            // Portions déjà attribuées, pour ne pas superposer deux variables.
            const taken = new Map();
            for (const v of doc.variables || []) {
                if (v.origin !== 'span' || !v.variable) continue;
                const key = `${v.pageIndex}:${v.blockId}`;
                if (!taken.has(key)) taken.set(key, []);
                taken.get(key).push({ start: v.start, end: v.end });
            }

            let accepted = 0, rejected = 0;
            for (const p of proposals) {
                const key = String(p?.bloc || '').replace(/[[\]]/g, '');
                const para = byBlock.get(key);
                const portion = typeof p?.texte === 'string' ? p.texte.trim() : '';

                // Trois vérifications, toutes obligatoires.
                if (!para || !portion || !CATALOGUE.has(p.variable)) { rejected++; continue; }
                // La portion doit exister TELLE QUELLE : c'est ce qui interdit au
                // modèle d'inventer, de reformuler ou de corriger le document.
                const start = para.text.indexOf(portion);
                if (start < 0) { rejected++; continue; }
                const end = start + portion.length;

                const spans = taken.get(key) || [];
                if (spans.some(s => start < s.end && end > s.start)) { rejected++; continue; }
                spans.push({ start, end });
                taken.set(key, spans);

                doc.variables.push({
                    id: `${para.pageIndex}:${para.blockId}:s${start}:ai`,
                    origin: 'span',
                    pageIndex: para.pageIndex,
                    blockId: para.blockId,
                    start, end,
                    label: null,
                    sample: portion,
                    kind: null,
                    reason: 'portion identifiée par IA',
                    variable: p.variable,
                    mapped: true,
                    confidence: 0.8,
                    detectedBy: 'ai'
                });
                accepted++;
            }

            doc.diagnostics.push(
                `IA sur texte rédigé : ${paragraphs.length} paragraphes soumis, ${accepted} portions retenues, ${rejected} rejetées.`
            );
            return doc;
        }
    };
}

module.exports = { createProseAiDetector, collectParagraphs, buildPrompt, parseJsonArray, PROSE_VARIABLES };
