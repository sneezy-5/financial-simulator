// ═══════════════════════════════════════════════════════
// RECONSTRUCTION DU MODÈLE DE DOCUMENT
//
// C'est ici que se fait ce qu'Acrobat appelle « comprendre » un PDF : partir
// d'ordres de dessin sans structure et remonter à des lignes, des paragraphes
// et des tableaux, uniquement par clustering géométrique.
//
// Contrairement à l'extraction, cette étape est heuristique. Elle est réglable
// par les seuils ci-dessous, et chaque décision reste vérifiable puisqu'elle
// ne repose que sur des coordonnées.
// ═══════════════════════════════════════════════════════

const ir = require('./ir');

// ── Seuils de clustering ─────────────────────────────────────────────────────
/** Deux runs sont sur la même ligne si leurs lignes de base sont à moins de ça (× corps). */
const BASELINE_TOL = 0.4;
/** Espace inséré entre deux runs si l'écart dépasse cette fraction du corps. */
const WORD_GAP = 0.22;
/**
 * Au-delà de cet écart (× corps, avec un plancher en points), deux runs sur la
 * même ligne de base ne forment plus une phrase mais deux colonnes distinctes.
 * Sans cette coupure, l'en-tête « raison sociale à gauche / période à droite »
 * ressortait comme une seule ligne de texte incohérente.
 */
const COLUMN_GAP = 3.5;
const COLUMN_GAP_MIN = 18;
/** Deux filets sont considérés colinéaires en deçà de cet écart, en points. */
const SNAP = 2.5;
/** Interligne maximal, en multiples de la hauteur de ligne, pour rester dans le même paragraphe. */
const PARAGRAPH_LEADING = 1.9;

const median = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
};

// ── Lignes de texte ──────────────────────────────────────────────────────────

/**
 * Regroupe les runs en lignes visuelles.
 *
 * pdf.js livre le texte en fragments arbitraires (souvent un par mot, parfois un
 * par changement de police). On les recolle par ligne de base, puis on décide de
 * l'espace entre deux fragments d'après leur écart horizontal réel : un PDF
 * n'encode pas les espaces, il déplace le curseur.
 */
function groupIntoLines(texts) {
    const sorted = [...texts].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const lines = [];

    for (const run of sorted) {
        const tol = Math.max(run.fontSize * BASELINE_TOL, 1.5);
        // La ligne LA PLUS PROCHE, et non la première rencontrée. Deux lignes
        // voisines de corps différents peuvent toutes deux tomber dans la
        // tolérance : « ENTREPRISE » (ligne de base 49,33) se faisait absorber par
        // le titre situé 2 pt plus haut simplement parce qu'il était testé avant,
        // ce qui coupait le nom de l'entreprise en deux blocs superposés.
        const line = lines
            .filter(l =>
                Math.abs(l.baseline - run.y) <= tol &&
                // Une ligne ne peut pas s'étendre indéfiniment : au-delà, c'est une
                // autre colonne de la même bande horizontale.
                run.x >= l.x - 400 && run.x <= l.x2 + 400)
            .sort((a, b) => Math.abs(a.baseline - run.y) - Math.abs(b.baseline - run.y))[0];
        if (line) {
            line.runs.push(run);
            line.x = Math.min(line.x, run.x);
            line.x2 = Math.max(line.x2, run.x2);
            line.baseline = (line.baseline * (line.runs.length - 1) + run.y) / line.runs.length;
        } else {
            lines.push({ runs: [run], x: run.x, x2: run.x2, baseline: run.y });
        }
    }

    const out = [];
    for (const l of lines) {
        l.runs.sort((a, b) => a.x - b.x);
        // Découpe en segments : un écart trop large sépare deux colonnes.
        const segments = [[l.runs[0]]];
        for (let i = 1; i < l.runs.length; i++) {
            const prev = l.runs[i - 1];
            const cur = l.runs[i];
            const gap = cur.x - prev.x2;
            const limit = Math.max(cur.fontSize * COLUMN_GAP, COLUMN_GAP_MIN);
            if (gap > limit) segments.push([cur]);
            else segments[segments.length - 1].push(cur);
        }
        for (const seg of segments) out.push(buildLine(seg, l.baseline));
    }
    return out.filter(l => l.text);
}

/** Assemble un segment de runs en une ligne de texte. */
function buildLine(runs, baseline) {
    let text = '';
    let prev = null;
    for (const r of runs) {
        if (prev && r.x - prev.x2 > r.fontSize * WORD_GAP) text += ' ';
        text += r.str;
        prev = r;
    }
    return {
        x: ir.round(Math.min(...runs.map(r => r.x))),
        x2: ir.round(Math.max(...runs.map(r => r.x2))),
        y: ir.round(baseline),
        text: text.replace(/\s+/g, ' ').trim(),
        runs: runs.map(r => r.id),
        fontSize: median(runs.map(r => r.fontSize)),
        bold: runs.every(r => r.bold),
        italic: runs.every(r => r.italic),
        fontFamily: runs[0].fontFamily,
        color: runs[0].color
    };
}

// ── Tableaux ─────────────────────────────────────────────────────────────────

/** Ramène des valeurs voisines à une valeur commune : les filets ne sont jamais parfaitement alignés. */
function snapValues(values, tol = SNAP) {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    const out = [];
    let group = [];
    for (const v of sorted) {
        if (!group.length || v - group[group.length - 1] <= tol) group.push(v);
        else { out.push(median(group)); group = [v]; }
    }
    if (group.length) out.push(median(group));
    return out.map(v => ir.round(v));
}

/**
 * Reconstruit les tableaux à partir des filets.
 *
 * On regroupe les segments horizontaux et verticaux qui se croisent en composantes
 * connexes : chaque composante ayant au moins deux filets dans chaque sens est un
 * tableau, dont les croisements donnent la grille de cellules.
 *
 * Limite assumée : un tableau sans aucun filet (colonnes alignées à la tabulation)
 * n'est pas détecté ici — il ressortira en blocs de texte, ce qui reste correct
 * visuellement puisque chaque bloc garde sa position.
 */
function detectTables(lines, texts) {
    const hs = lines.filter(l => Math.abs(l.y1 - l.y2) <= 1 && Math.abs(l.x2 - l.x1) > 4)
        .map(l => ({ y: (l.y1 + l.y2) / 2, x1: Math.min(l.x1, l.x2), x2: Math.max(l.x1, l.x2) }));
    const vs = lines.filter(l => Math.abs(l.x1 - l.x2) <= 1 && Math.abs(l.y2 - l.y1) > 4)
        .map(l => ({ x: (l.x1 + l.x2) / 2, y1: Math.min(l.y1, l.y2), y2: Math.max(l.y1, l.y2) }));

    if (hs.length < 2 || vs.length < 2) return { tables: [], usedTextIds: new Set() };

    // Union-find sur « h et v se croisent »
    const n = hs.length + vs.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

    hs.forEach((h, i) => vs.forEach((v, j) => {
        const crosses = v.x >= h.x1 - SNAP && v.x <= h.x2 + SNAP &&
                        h.y >= v.y1 - SNAP && h.y <= v.y2 + SNAP;
        if (crosses) union(i, hs.length + j);
    }));

    const groups = new Map();
    for (let i = 0; i < n; i++) {
        const r = find(i);
        if (!groups.has(r)) groups.set(r, { h: [], v: [] });
        if (i < hs.length) groups.get(r).h.push(hs[i]);
        else groups.get(r).v.push(vs[i - hs.length]);
    }

    const tables = [];
    const usedTextIds = new Set();

    for (const g of groups.values()) {
        const rowEdges = snapValues(g.h.map(h => h.y));
        const colEdges = snapValues(g.v.map(v => v.x));
        if (rowEdges.length < 2 || colEdges.length < 2) continue;

        const x = colEdges[0], y = rowEdges[0];
        const w = colEdges[colEdges.length - 1] - x;
        const h = rowEdges[rowEdges.length - 1] - y;
        if (w < 20 || h < 8) continue;

        const nbRows = rowEdges.length - 1;
        const nbCols = colEdges.length - 1;
        // Cases déjà recouvertes par une cellule fusionnée : elles ne produisent
        // pas de cellule propre.
        const covered = new Set();
        const cells = [];

        for (let r = 0; r < nbRows; r++) {
            for (let c = 0; c < nbCols; c++) {
                if (covered.has(`${r}:${c}`)) continue;

                // Une cellule fusionnée se reconnaît à l'ABSENCE du filet qui
                // devrait la séparer de sa voisine. C'est la seule preuve fiable :
                // « PART SALARIALE » couvre trois colonnes, et sans cette détection
                // son intitulé atterrissait dans une case au hasard tandis que les
                // colonnes voisines ressortaient anonymes (_c3, _c4…).
                let colSpan = 1;
                while (c + colSpan < nbCols &&
                       !hasVerticalRule(g.v, colEdges[c + colSpan], rowEdges[r], rowEdges[r + 1])) {
                    colSpan++;
                }
                let rowSpan = 1;
                while (r + rowSpan < nbRows &&
                       !hasHorizontalRule(g.h, rowEdges[r + rowSpan], colEdges[c], colEdges[c + colSpan])) {
                    rowSpan++;
                }
                for (let dr = 0; dr < rowSpan; dr++) {
                    for (let dc = 0; dc < colSpan; dc++) covered.add(`${r + dr}:${c + dc}`);
                }

                const cx = colEdges[c], cy = rowEdges[r];
                const cw = colEdges[c + colSpan] - cx, ch = rowEdges[r + rowSpan] - cy;
                const inside = texts.filter(t => {
                    const mx = (t.x + t.x2) / 2;
                    // Le y d'un run est sa ligne de base : le corps monte au-dessus.
                    const my = t.y - t.fontSize * 0.35;
                    return mx >= cx - 1 && mx <= cx + cw + 1 && my >= cy - 1 && my <= cy + ch + 1;
                });
                inside.forEach(t => usedTextIds.add(t.id));
                const cellLines = groupIntoLines(inside);
                cells.push({
                    r, c, colSpan, rowSpan,
                    x: ir.round(cx), y: ir.round(cy), w: ir.round(cw), h: ir.round(ch),
                    text: cellLines.map(l => l.text).join(' '),
                    fontSize: cellLines.length ? median(cellLines.map(l => l.fontSize)) : null,
                    bold: cellLines.length ? cellLines.every(l => l.bold) : false,
                    italic: cellLines.length ? cellLines.every(l => l.italic) : false,
                    // Couleur et police du texte : sans elles, un libellé blanc sur
                    // bandeau foncé était réémis en noir, donc illisible.
                    color: cellLines.length ? cellLines[0].color : null,
                    fontFamily: cellLines.length ? cellLines[0].fontFamily : null,
                    align: inferCellAlign(inside, cx, cw),
                    textIds: inside.map(t => t.id)
                });
            }
        }

        tables.push({
            x: ir.round(x), y: ir.round(y), w: ir.round(w), h: ir.round(h),
            colEdges, rowEdges, cells
        });
    }

    return { tables, usedTextIds };
}

/**
 * Un filet vertical sépare-t-il réellement cette bande de lignes à cette abscisse ?
 * Un segment un peu plus court que la bande suffit : les générateurs de PDF
 * n'alignent pas leurs traits au point près.
 */
function hasVerticalRule(vs, x, yTop, yBottom) {
    const height = yBottom - yTop;
    return vs.some(v =>
        Math.abs(v.x - x) <= SNAP &&
        v.y1 <= yTop + Math.max(SNAP, height * 0.3) &&
        v.y2 >= yBottom - Math.max(SNAP, height * 0.3));
}

/** Même chose pour un filet horizontal séparant deux lignes sur une largeur donnée. */
function hasHorizontalRule(hs, y, xLeft, xRight) {
    const width = xRight - xLeft;
    return hs.some(h =>
        Math.abs(h.y - y) <= SNAP &&
        h.x1 <= xLeft + Math.max(SNAP, width * 0.3) &&
        h.x2 >= xRight - Math.max(SNAP, width * 0.3));
}

/** L'alignement d'une cellule se lit dans la marge laissée à gauche et à droite. */
function inferCellAlign(runs, cx, cw) {
    if (!runs.length) return 'left';
    const left = Math.min(...runs.map(r => r.x)) - cx;
    const right = (cx + cw) - Math.max(...runs.map(r => r.x2));
    if (right < left - 3) return 'right';
    if (Math.abs(left - right) <= 3 && left > 4) return 'center';
    return 'left';
}

// ── Paragraphes ──────────────────────────────────────────────────────────────

/**
 * Regroupe les lignes hors tableau en paragraphes.
 *
 * Deux lignes appartiennent au même paragraphe si l'interligne reste proche de
 * l'interligne courant et si le corps ne change pas. Le retrait de première ligne
 * est toléré : c'est justement ce qui signale un début de paragraphe, pas une
 * rupture.
 */
function groupIntoParagraphs(lines, contentBox) {
    const sorted = [...lines].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const blocks = [];
    // Plusieurs blocs restent ouverts en parallele : dans un en-tete a deux
    // colonnes, les lignes de gauche et de droite arrivent entrelacees. Avec un
    // seul bloc courant, chaque ligne cassait le paragraphe de la colonne voisine.
    let open = [];

    for (const line of sorted) {
        const lineHeight = line.fontSize * 1.2;
        const maxGap = lineHeight * PARAGRAPH_LEADING;

        // On ferme ce qui est deja trop haut pour pouvoir accueillir cette ligne.
        open = open.filter(b => line.y - b.lastY <= maxGap);

        const candidates = open.filter(b =>
            Math.abs(line.fontSize - b.fontSize) < 0.6 &&
            line.bold === b.bold &&
            line.italic === b.italic &&
            line.y > b.lastY &&
            overlap(line, b) > 0
        );
        // Le meilleur candidat est celui qui partage le plus de largeur.
        candidates.sort((a, b) => overlap(line, b) - overlap(line, a));
        const target = candidates[0];

        if (target) {
            target.lines.push(line);
            target.x = Math.min(target.x, line.x);
            target.x2 = Math.max(target.x2, line.x2);
            target.lastY = line.y;
        } else {
            const b = {
                lines: [line], x: line.x, x2: line.x2, y: line.y, lastY: line.y,
                fontSize: line.fontSize, bold: line.bold, italic: line.italic,
                fontFamily: line.fontFamily, color: line.color
            };
            blocks.push(b);
            open.push(b);
        }
    }

    blocks.sort((a, b) => (a.y - b.y) || (a.x - b.x));

    return blocks.map((b, i) => {
        const top = ir.round(b.y - b.fontSize);
        return {
            id: `b${i}`,
            x: ir.round(b.x),
            y: top,
            w: ir.round(b.x2 - b.x),
            h: ir.round(b.lastY - b.y + b.fontSize * 1.3),
            text: b.lines.map(l => l.text).join(' '),
            lines: b.lines.map(l => l.text),
            // Géométrie de chaque ligne : c'est elle qui permet d'apparier une
            // colonne d'étiquettes avec une colonne de montants quand le document
            // n'a aucun filet vertical et qu'aucun tableau n'est donc détecté.
            lineBoxes: b.lines.map(l => ({ y: l.y, x: l.x, x2: l.x2 })),
            runs: b.lines.flatMap(l => l.runs),
            fontSize: ir.round(b.fontSize, 1),
            lineHeight: b.lines.length > 1
                ? ir.round((b.lastY - b.y) / (b.lines.length - 1) / b.fontSize, 2)
                : 1.25,
            bold: b.bold,
            italic: b.italic,
            fontFamily: b.fontFamily,
            color: b.color || '#000000',
            align: inferBlockAlign(b, contentBox)
        };
    });
}

/** Largeur commune a une ligne et a un bloc, en points. */
function overlap(line, block) {
    return Math.min(line.x2, block.x2) - Math.max(line.x, block.x);
}

/** Alignement d'un bloc, lu par rapport à la zone de contenu de la page. */
function inferBlockAlign(block, box) {
    const leftGap = block.x - box.x;
    const rightGap = box.x2 - block.x2;
    const boxWidth = box.x2 - box.x;
    const blockWidth = block.x2 - block.x;

    // Le justifié demande trois lignes ET une largeur de vraie colonne de texte.
    // Sans ces garde-fous, un encadré de deux lignes calé à droite (« Période : … /
    // Matricule : … ») passait pour justifié : à la substitution, une valeur plus
    // longue le faisait déborder puis étaler ses mots sur toute la largeur.
    if (block.lines.length >= 3 && blockWidth > boxWidth * 0.5) {
        const allFlush = block.lines.slice(0, -1).every(l => Math.abs(l.x2 - block.x2) < 6);
        if (allFlush && rightGap < 20) return 'justify';
    }
    if (Math.abs(leftGap - rightGap) <= 6 && leftGap > 20) return 'center';
    if (rightGap < leftGap - 20) return 'right';
    return 'left';
}

// ── Entrée du module ─────────────────────────────────────────────────────────

/** Zone réellement occupée par le contenu : approxime les marges du document. */
function computeContentBox(page) {
    const xs = [];
    const x2s = [];
    page.texts.forEach(t => { xs.push(t.x); x2s.push(t.x2); });
    page.lines.forEach(l => { xs.push(Math.min(l.x1, l.x2)); x2s.push(Math.max(l.x1, l.x2)); });
    page.rects.forEach(r => { xs.push(r.x); x2s.push(r.x + r.w); });
    if (!xs.length) return { x: 0, x2: page.width };
    return { x: Math.min(...xs), x2: Math.max(...x2s) };
}

/** Enrichit chaque page de l'IR de ses blocs et de ses tableaux. */
function analyze(doc) {
    for (const page of doc.pages) {
        const contentBox = computeContentBox(page);
        const { tables, usedTextIds } = detectTables(page.lines, page.texts);
        page.tables = tables;

        const free = page.texts.filter(t => !usedTextIds.has(t.id));
        page.blocks = groupIntoParagraphs(groupIntoLines(free), contentBox);
        page.contentBox = { x: ir.round(contentBox.x), x2: ir.round(contentBox.x2) };
    }
    return doc;
}

module.exports = { analyze, groupIntoLines, groupIntoParagraphs, detectTables, snapValues };
