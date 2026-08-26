// ═══════════════════════════════════════════════════════
// DOCUMENT IR — le format pivot du moteur
//
// C'est le contrat entre les trois points d'extension : les extracteurs le
// produisent, les détecteurs de variables l'annotent, les rendus le consomment.
// Tant qu'un module parle cette structure, il se branche sans toucher aux autres.
//
// CONVENTION DE COORDONNÉES, valable partout en aval :
//   points PDF (1pt = 1/72 pouce), origine EN HAUT À GAUCHE, y croissant vers le bas.
// Les extracteurs font la conversion une fois pour toutes ; plus personne
// n'a à se demander dans quel sens va l'axe Y.
// ═══════════════════════════════════════════════════════

const IR_VERSION = 1;

/** Document vide, prêt à être rempli par un extracteur. */
function createDocument(source = {}) {
    return {
        irVersion: IR_VERSION,
        source: {
            kind: source.kind || 'unknown',   // 'pdf' | 'image' | 'docx'
            filename: source.filename || null,
            pageCount: source.pageCount || 0,
            hasTextLayer: source.hasTextLayer !== false
        },
        pages: [],
        variables: [],       // rempli par les détecteurs
        diagnostics: []      // ce que le moteur n'a pas su faire, pour l'appelant
    };
}

function createPage(width, height) {
    return {
        width,
        height,
        // ── Couche brute, telle qu'extraite ──
        texts: [],   // { id, str, x, y, x2, y2, fontSize, bold, italic, color, fontFamily }
        lines: [],   // { x1, y1, x2, y2, width, color }
        rects: [],   // { x, y, w, h, fill, stroke, strokeWidth }
        images: [],  // { x, y, w, h }
        // ── Couche dérivée, produite par le clustering ──
        blocks: [],  // { id, x, y, w, h, text, runs, fontSize, bold, italic, align, color }
        tables: []   // { x, y, w, h, colEdges, rowEdges, cells }
    };
}

// ── Géométrie ────────────────────────────────────────────────────────────────

/** Matrices PDF [a,b,c,d,e,f] : composition, dans le sens utilisé par pdf.js. */
function matMul(m1, m2) {
    return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
}

function applyMat(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const IDENTITY = [1, 0, 0, 1, 0, 0];

/** Composante d'échelle d'une matrice — sert à convertir une épaisseur de trait. */
function matScale(m) {
    return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}

function round(v, d = 2) {
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
}

/** Couleur pdf.js (composantes 0-255, tableau ou objet indexé) → #rrggbb */
function toHex(c) {
    if (!c) return null;
    const g = (i) => Math.max(0, Math.min(255, Math.round(Number(c[i]) || 0)));
    return '#' + [g(0), g(1), g(2)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ── Unités ───────────────────────────────────────────────────────────────────

const PT_PER_MM = 72 / 25.4;

/** Points PDF → millimètres, l'unité dans laquelle le rendu HTML positionne. */
function ptToMm(pt) {
    return round(pt / PT_PER_MM, 2);
}

// ── Utilitaires de lecture ───────────────────────────────────────────────────

/** Tous les blocs de toutes les pages, avec leur index de page. */
function allBlocks(doc) {
    const out = [];
    doc.pages.forEach((p, pageIndex) => p.blocks.forEach(b => out.push({ ...b, pageIndex })));
    return out;
}

/** Toutes les cellules de tous les tableaux, avec leur origine. */
function allCells(doc) {
    const out = [];
    doc.pages.forEach((p, pageIndex) =>
        p.tables.forEach((t, tableIndex) =>
            t.cells.forEach(c => out.push({ ...c, pageIndex, tableIndex }))));
    return out;
}

/**
 * Le document est-il de nature « grille » (bulletin, fiche) ou « rédigé » (contrat) ?
 *
 * Détermine la stratégie de rendu : positionnement absolu pour une grille dont la
 * structure est figée, flux normal pour de la prose — un texte figé au millimètre
 * se chevaucherait dès qu'une valeur substituée serait plus longue que l'originale.
 */
function inferDocumentNature(doc) {
    let cellCount = 0;
    let proseChars = 0;
    let totalChars = 0;
    let numericLines = 0;

    // Un montant seul sur sa ligne : « 200 000 », « 3,6% », « 132 880 »
    const NUMERIC = /^-?\d{1,3}(?:[  .,]\d{3})+(?:[.,]\d{1,2})?$|^-?\d{2,}(?:[.,]\d{1,2})?\s*%?$/;

    for (const page of doc.pages) {
        for (const t of page.tables) {
            // Les cellules non vides comptent : sans elles, un bulletin dont
            // presque tout le texte est en tableau passait pour de la prose.
            const filled = t.cells.filter(c => c.text);
            cellCount += filled.length;
            filled.forEach(c => { totalChars += c.text.length; });
        }
        for (const b of page.blocks) {
            totalChars += b.text.length;
            // Un bloc « rédigé » : phrase longue, pas une étiquette ni un montant
            if (b.text.length > 80 && /[.;:]\s/.test(b.text)) proseChars += b.text.length;
            // Sur les LIGNES et non sur le bloc : une colonne de montants est
            // agglomérée en un seul bloc multi-lignes (« 200 000 30 000 »), que
            // le test appliqué au bloc entier ne reconnaîtrait jamais.
            for (const line of (b.lines || [b.text])) {
                if (NUMERIC.test(line)) numericLines++;
            }
        }
    }

    const proseRatio = totalChars ? proseChars / totalChars : 0;
    if (proseRatio >= 0.35) return 'prose';
    if (cellCount >= 8) return 'grid';

    // Beaucoup de montants isolés, alignés en colonnes : c'est une grille, même
    // sans un seul filet vertical. Beaucoup de bulletins ne sont réglés qu'avec
    // des traits horizontaux — aucun tableau n'y est détecté, et ils basculaient
    // alors en flux, ce qui décalait toutes les colonnes de montants.
    if (numericLines >= 5) return 'grid';

    return 'prose';
}

/**
 * Une variable provisoire est un emplacement détecté par sa structure mais dont
 * le lexique n'a pas su donner le sens métier. Elle est paramétrable, mais elle
 * n'est encore rattachée à aucune donnée du système.
 */
function isProvisionalVariable(name) {
    return typeof name === 'string' && name.startsWith('champ_');
}

module.exports = {
    isProvisionalVariable,
    IR_VERSION,
    createDocument,
    createPage,
    matMul,
    applyMat,
    matScale,
    IDENTITY,
    round,
    toHex,
    PT_PER_MM,
    ptToMm,
    allBlocks,
    allCells,
    inferDocumentNature
};
