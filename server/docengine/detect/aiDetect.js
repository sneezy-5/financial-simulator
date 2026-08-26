// ═══════════════════════════════════════════════════════
// DÉTECTEUR IA — uniquement sur le résidu
//
// Le lexique et les règles traitent l'essentiel. Ce détecteur ne voit que ce
// qu'ils n'ont pas su nommer, et il ne fait qu'une chose : classer du texte déjà
// extrait. Il ne dessine rien, ne positionne rien, n'invente aucun libellé.
//
// ANTI-HALLUCINATION : chaque réponse est confrontée à l'inventaire réellement
// extrait du document. Un identifiant inconnu, un nom de variable hors catalogue
// ou un extrait qui ne figure pas dans le PDF est rejeté sans discussion.
// C'est le même garde-fou que suggestColumnMapping applique déjà à l'import Excel.
// ═══════════════════════════════════════════════════════

const lexicon = require('./lexicon');

/** Catalogue fermé : l'IA ne peut proposer que ces noms-là. */
const GRID_VARIABLES = [
    'nom', 'prenom', 'matricule', 'poste', 'categorie', 'date_embauche', 'num_cnps',
    'nom_entreprise', 'adresse', 'periode', 'mois', 'annee', 'date_jour',
    'salaire_base', 'sursalaire', 'prime_anciennete', 'prime_transport',
    'indemnite_logement', 'heures_sup', 'prime_rendement', 'brut', 'net_imposable',
    'salarial.its', 'salarial.cn', 'salarial.cnps', 'salarial.total',
    'patronal.cnps', 'patronal.prestations_familiales', 'patronal.accident_travail',
    'patronal.total', 'netAPayer', 'jours_travailles', 'taux_horaire'
];

const PROSE_VARIABLES = [
    'nomComplet', 'poste', 'dateEntree', 'salaireAff',
    'entreprise', 'adresse', 'signataireNom', 'signatairePoste', 'lieu', 'dateDoc'
];

function catalogueFor(nature) {
    return nature === 'prose' ? PROSE_VARIABLES : GRID_VARIABLES;
}

/**
 * Inventaire de ce que l'IA a le droit de nommer : les candidats que les règles
 * n'ont pas tranchés, plus les cellules et blocs restés sans variable.
 *
 * On envoie du texte, jamais d'image : le modèle n'a aucune raison de refaire
 * de l'OCR sur un document dont on connaît déjà les chaînes exactes.
 */
function buildResidue(doc, nature) {
    // Une variable PROVISOIRE n'est pas un acquis : c'est un emplacement dont on
    // ignore le sens métier. On la soumet donc au modèle, qui peut la promouvoir
    // vers le catalogue. Si elle n'y trouve pas sa place, elle reste telle quelle
    // et l'utilisateur la rattachera lui-même — on ne la perd jamais.
    const isProvisional = (v) => lexicon.isProvisional(v.variable);
    const assigned = new Set(
        (doc.variables || []).filter(v => v.variable && !isProvisional(v)).map(v => v.id)
    );
    const items = [];

    // 1. Candidats non nommés, et emplacements provisoires à confirmer
    for (const v of doc.variables || []) {
        if (assigned.has(v.id)) continue;
        items.push({
            id: v.id,
            label: v.label || null,
            text: v.sample,
            kind: v.kind,
            where: v.origin,
            provisional: isProvisional(v) ? v.variable : null
        });
    }

    // 2. Cellules de tableau restées neutres, avec le libellé de leur ligne
    doc.pages.forEach((page, pi) => {
        page.tables.forEach((t, ti) => {
            const labelOf = (r) => (t.cells.find(c => c.r === r && c.c === 0) || {}).text || null;
            t.cells.forEach(cell => {
                const id = `${pi}:t${ti}:${cell.r}:${cell.c}`;
                if (assigned.has(id) || !cell.text || cell.c === 0) return;
                if (items.some(i => i.id === id)) return;
                if (lexicon.isTitleOnly(cell.text)) return;
                items.push({ id, label: labelOf(cell.r), text: cell.text, kind: null, where: 'table' });
            });
        });

        // 3. Blocs hors tableau non traités
        page.blocks.forEach(b => {
            const id = `${pi}:${b.id}`;
            if (assigned.has(id) || items.some(i => i.id === id)) return;
            if (lexicon.isTitleOnly(b.text)) return;
            if (b.text.length > 300) return;   // un paragraphe entier n'est pas une valeur
            items.push({ id, label: null, text: b.text, kind: null, where: 'block-value' });
        });
    });

    return items;
}

function buildPrompt(items, nature, catalogue) {
    const inventory = items
        .map(i => {
            const label = i.label ? `"${i.label}"` : '—';
            const note = i.provisional ? ' | champ déjà repéré, à nommer si tu le peux' : '';
            return `${i.id} | libellé: ${label} | texte: "${i.text}"${note}`;
        })
        .join('\n');

    return `Tu analyses un modèle de document RH (${nature === 'prose' ? 'contrat, attestation, lettre' : 'bulletin de paie, fiche'}) pour le transformer en gabarit réutilisable.

Voici les fragments de texte que notre analyse automatique n'a pas su classer. Pour chacun,
dis s'il s'agit d'une DONNÉE PROPRE AU DOSSIER (à remplacer par une variable) ou d'un TEXTE
FIXE (libellé, mention légale, en-tête de colonne, titre — à conserver tel quel).

Noms de variables autorisés, et eux seuls :
${catalogue.join(', ')}

FRAGMENTS :
${inventory}

Réponds UNIQUEMENT par un tableau JSON, sans texte autour :
[{"id": "<identifiant exact du fragment>", "variable": "<nom du catalogue>", "confidence": 0.0-1.0}]

N'inclus QUE les fragments qui sont réellement des données du dossier. Omets tous les autres :
une omission est sans conséquence, une erreur met une fausse valeur sur un document officiel.`;
}

function parseJsonArray(text) {
    let t = (text || '').trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const start = t.indexOf('[');
    const end = t.lastIndexOf(']');
    if (start < 0 || end <= start) return [];
    try {
        const parsed = JSON.parse(t.slice(start, end + 1));
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

/**
 * Construit le détecteur. `callModel` est injecté pour que le moteur ne dépende
 * pas d'un fournisseur d'IA particulier — et pour que les tests puissent le
 * remplacer par une fonction déterministe.
 *
 * @param {function} callModel async (prompt) => string
 * @param {object}   opts      { minResidue, maxItems }
 */
function createAiDetector(callModel, opts = {}) {
    const minResidue = opts.minResidue ?? 1;
    const maxItems = opts.maxItems ?? 80;

    return {
        name: 'ai-residue',
        priority: 90,   // toujours après les règles
        ai: true,       // filtré par `useAi: false` (voir index.js)
        async detect(doc, ctx) {
            if (typeof callModel !== 'function') return doc;

            const catalogue = catalogueFor(ctx.nature);
            const items = buildResidue(doc, ctx.nature).slice(0, maxItems);
            if (items.length < minResidue) return doc;

            const raw = await callModel(buildPrompt(items, ctx.nature, catalogue));
            const proposals = parseJsonArray(raw);

            const byId = new Map(items.map(i => [i.id, i]));
            const allowed = new Set(catalogue);
            let accepted = 0;
            let rejected = 0;

            for (const p of proposals) {
                const item = byId.get(p?.id);
                // Trois vérifications, toutes obligatoires : l'identifiant doit
                // exister, le nom doit être au catalogue, et la confiance doit être
                // exploitable. Le reste part à la poubelle sans état d'âme.
                if (!item || !allowed.has(p.variable)) { rejected++; continue; }
                const confidence = Math.min(0.85, Math.max(0, Number(p.confidence) || 0.6));
                if (confidence < 0.5) { rejected++; continue; }

                const existing = (doc.variables || []).find(v => v.id === item.id);
                if (existing) {
                    // Le lexique fait foi : l'IA ne peut que combler un vide ou
                    // promouvoir un emplacement provisoire vers le catalogue.
                    if (existing.variable && !lexicon.isProvisional(existing.variable)) continue;
                    existing.variable = p.variable;
                    existing.mapped = true;
                    existing.confidence = confidence;
                    existing.detectedBy = 'ai';
                } else {
                    doc.variables.push({
                        id: item.id,
                        origin: item.where,
                        ...idToLocation(item.id),
                        label: item.label,
                        sample: item.text,
                        kind: item.kind,
                        reason: 'classé par IA',
                        variable: p.variable,
                        confidence,
                        detectedBy: 'ai'
                    });
                }
                accepted++;
            }

            doc.diagnostics.push(
                `IA sur le résidu : ${items.length} fragments soumis, ${accepted} retenus, ${rejected} rejetés.`
            );
            return doc;
        }
    };
}

/** Retrouve la position visée à partir de l'identifiant du fragment. */
function idToLocation(id) {
    const table = id.match(/^(\d+):t(\d+):(\d+):(\d+)$/);
    if (table) {
        return { pageIndex: +table[1], tableIndex: +table[2], row: +table[3], col: +table[4] };
    }
    const blockLine = id.match(/^(\d+):(b\d+):l(\d+):/);
    if (blockLine) return { pageIndex: +blockLine[1], blockId: blockLine[2], lineIndex: +blockLine[3] };
    const block = id.match(/^(\d+):(b\d+)/);
    if (block) return { pageIndex: +block[1], blockId: block[2] };
    return {};
}

module.exports = { createAiDetector, buildResidue, buildPrompt, parseJsonArray, GRID_VARIABLES, PROSE_VARIABLES };
