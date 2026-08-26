// ═══════════════════════════════════════════════════════
// TABLEAUX SANS FILETS — reconstruction des lignes par ligne de base
//
// Beaucoup de bulletins ne sont réglés que par des traits horizontaux, parfois
// par aucun. Aucun tableau n'y est détecté, et le regroupement en paragraphes
// agglomère alors chaque colonne en un seul bloc multi-lignes :
//
//   bloc étiquettes : « 1. Salaire de base  2. Prime de Transport  3. Prime… »
//   bloc montants   : « 200 000  30 000  100 000 »
//
// L'information est intacte mais la relation étiquette↔valeur, qui est
// horizontale, a disparu. On la reconstruit ici : les fragments partageant une
// même ligne de base forment une ligne de tableau, le premier est l'étiquette,
// les suivants sont ses valeurs. C'est un tableau virtuel, déduit de la seule
// géométrie.
// ═══════════════════════════════════════════════════════

const lexicon = require('./lexicon');

/** Tolérance de regroupement des lignes de base, en points. */
const ROW_TOL = 2;

/** Une valeur peut-elle occuper une colonne de montants ? */
const RE_NUMERIC = /^-?\d[\d  .,]*$/;
const RE_RATE = /^\d{1,3}(?:[.,]\d{1,3})?\s*%$/;

/**
 * Rassemble toutes les lignes de tous les blocs, repérées par leur position.
 * Chaque entrée sait de quel bloc et de quelle ligne elle vient : c'est ce qui
 * permettra au rendu de substituer au bon endroit.
 */
function collectSegments(page) {
    const segments = [];
    for (const block of page.blocks) {
        const boxes = block.lineBoxes || [];
        (block.lines || []).forEach((text, lineIndex) => {
            const box = boxes[lineIndex];
            if (!box || !text) return;
            segments.push({
                blockId: block.id, lineIndex, text,
                x: box.x, x2: box.x2, y: box.y,
                bold: block.bold
            });
        });
    }
    return segments;
}

/** Regroupe les fragments par ligne de base et trie chaque ligne de gauche à droite. */
function buildRows(segments) {
    const rows = [];
    for (const seg of [...segments].sort((a, b) => (a.y - b.y) || (a.x - b.x))) {
        const row = rows.find(r => Math.abs(r.y - seg.y) <= ROW_TOL);
        if (row) {
            row.cells.push(seg);
            row.y = (row.y * (row.cells.length - 1) + seg.y) / row.cells.length;
        } else {
            rows.push({ y: seg.y, cells: [seg] });
        }
    }
    rows.forEach(r => r.cells.sort((a, b) => a.x - b.x));
    return rows.sort((a, b) => a.y - b.y);
}

/**
 * Repère la ligne d'en-tête et mémorise l'abscisse de chaque colonne.
 * C'est elle qui nomme les suffixes (`_base`, `_taux`) des valeurs en dessous.
 */
function findHeader(rows) {
    for (const row of rows) {
        if (row.cells.length < 2) continue;
        const kinds = row.cells.map(c => headerKind(c.text));
        // Au moins deux colonnes nommées : c'est un en-tête, pas une ligne de données.
        if (kinds.filter(Boolean).length >= 2) {
            return row.cells.map((c, i) => ({ x: c.x, x2: c.x2, kind: kinds[i] }));
        }
    }
    return null;
}

function headerKind(text) {
    const t = lexicon.normalizeLabel(text);
    if (/^montant/.test(t) || /^somme/.test(t) || /^net a payer/.test(t)) return '';
    if (/^base/.test(t) || /^assiette/.test(t)) return '_base';
    if (/^taux/.test(t) || t === '%') return '_taux';
    if (/^nombre/.test(t) || /^qte/.test(t) || /^quantite/.test(t) || /^jours/.test(t) || /^heures/.test(t)) return '_nombre';
    return null;
}

/** Colonne d'en-tête recouvrant le mieux une cellule. */
function suffixFor(header, cell, isLast) {
    if (!header) return isLast ? '' : null;
    let best = null;
    let bestOverlap = 0;
    for (const col of header) {
        const overlap = Math.min(cell.x2, col.x2) - Math.max(cell.x, col.x);
        if (overlap > bestOverlap) { bestOverlap = overlap; best = col; }
    }
    if (best && best.kind !== null) return best.kind;
    return isLast ? '' : null;
}

/**
 * Détecte les variables des lignes reconstruites.
 *
 * @param {object} page      page de l'IR, déjà analysée
 * @param {number} pageIndex
 * @param {Array}  found     accumulateur partagé avec les autres détecteurs
 * @param {Set}    claimed   identifiants déjà attribués, à ne pas réécrire
 */
function detectInRows(page, pageIndex, found, claimed) {
    const rows = buildRows(collectSegments(page));
    const header = findHeader(rows);

    for (const row of rows) {
        if (row.cells.length < 2) continue;

        const labelCell = row.cells[0];
        const entry = lexicon.lookup(labelCell.text, 'grid');

        // Libellé inconnu du lexique : on crée quand même un emplacement, nommé
        // d'après l'intitulé. Sans cela, toute rubrique hors catalogue — une
        // convention collective particulière, un autre pays — restait figée en
        // texte, et le gabarit n'était paramétrable que pour les libellés prévus.
        const provisional = !entry && lexicon.looksLikeRubric(labelCell.text)
            ? lexicon.slugify(labelCell.text)
            : null;
        if (!entry && !provisional) continue;
        const baseVariable = entry ? entry.variable : provisional;

        const values = row.cells.slice(1);
        values.forEach((cell, i) => {
            const isLast = i === values.length - 1;
            const suffix = values.length > 1 ? suffixFor(header, cell, isLast) : '';
            if (suffix === null) return;      // colonne d'annotation, pas de valeur

            const text = cell.text.trim();
            const isRate = RE_RATE.test(text);
            const isNumeric = RE_NUMERIC.test(text);
            // L'étiquette porte la preuve : quand le lexique annonce un montant,
            // on accepte même « 0 », que le motif générique de montant rejette
            // faute de longueur. Une retenue nulle reste une valeur du dossier.
            //
            // Et quand elle annonce un TEXTE ou un CODE — « Nom : », « Emploi : »,
            // « Matricule : » — la valeur n'a aucune raison d'être chiffrée.
            // N'accepter que du numérique laissait toute l'identité du salarié en
            // texte fixe : les noms n'étaient jamais remplacés.
            const attendText = entry &&
                (entry.kind === lexicon.KIND.TEXT || entry.kind === lexicon.KIND.CODE);
            const isTexte = attendText && text.length >= 2 && text.length <= 80 &&
                !lexicon.isTitleOnly(text);

            // Un taux réglementaire n'est pas une donnée du dossier : on le laisse
            // imprimé tel quel plutôt que d'en faire une variable inremplissable.
            if (isRate) return;
            if (!isNumeric && !isTexte) return;
            // Une valeur textuelle n'a ni base ni taux : elle occupe sa seule colonne.
            if (isTexte && suffix) return;

            const id = `${pageIndex}:${cell.blockId}:l${cell.lineIndex}:row`;
            if (claimed.has(id)) return;
            claimed.add(id);

            found.push({
                id,
                origin: 'block-inline',       // le rendu substitue dans cette ligne
                pageIndex,
                blockId: cell.blockId,
                lineIndex: cell.lineIndex,
                label: labelCell.text,
                sample: text,
                kind: isNumeric ? lexicon.KIND.AMOUNT : entry.kind,
                reason: 'ligne reconstruite sans filets',
                variable: baseVariable + suffix,
                mapped: !!entry,
                confidence: entry ? 0.88 : 0.7,
                x: cell.x, y: cell.y, w: cell.x2 - cell.x, h: 0
            });
        });
    }
}

module.exports = { detectInRows, buildRows, collectSegments, findHeader };
