// ═══════════════════════════════════════════════════════
// RENDU HTML DÉTERMINISTE
//
// Émet le gabarit à partir de l'IR, sans aucun appel à l'IA. Le résultat est
// reproductible : deux exécutions sur le même PDF donnent le même HTML, à l'octet.
//
// Deux stratégies, choisies par la nature du document :
//
//  - ABSOLU (grille) — chaque élément à sa coordonnée en mm. La structure est
//    figée, une valeur substituée reste dans sa case.
//  - FLUX (prose) — marges, typographie et interlignes reproduits, le texte coule.
//    Indispensable pour un contrat : figé au millimètre, il se chevaucherait dès
//    qu'un nom substitué serait plus long que celui du document d'origine.
// ═══════════════════════════════════════════════════════

const ir = require('../ir');

const mm = (pt) => ir.ptToMm(pt);

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Les placeholders ne doivent pas être échappés : on les réinjecte après coup. */
function escKeepPlaceholders(s) {
    return esc(s);
}

/**
 * Style inline compact, sans propriété vide.
 *
 * La valeur produite part dans un attribut style="…" : tout guillemet double
 * qu'elle contiendrait refermerait l'attribut. On le neutralise ici plutôt que
 * de compter sur chaque appelant.
 */
function style(props) {
    return Object.entries(props)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}:${String(v).replace(/"/g, "'")}`)
        .join(';');
}

// ── Application des variables détectées ──────────────────────────────────────

/**
 * Index des variables par élément visé, pour savoir quoi remplacer où.
 * On ne garde que les variables réellement identifiées : un candidat sans nom
 * reste du texte fixe, ce qui est le comportement sûr.
 */
function indexVariables(doc, minConfidence) {
    const byCell = new Map();     // "p:t:r:c" → variable
    const byBlockLine = new Map();// "p:blockId:lineIndex" → { variable, sample }
    const byBlock = new Map();    // "p:blockId" → { variable, sample }
    const bySpan = new Map();     // "p:blockId" → [ { start, end, variable } ] sur le texte recollé

    for (const v of doc.variables || []) {
        if (!v.variable || v.confidence < minConfidence) continue;
        if (v.origin === 'table') {
            byCell.set(`${v.pageIndex}:${v.tableIndex}:${v.row}:${v.col}`, v);
        } else if (v.origin === 'block-inline') {
            byBlockLine.set(`${v.pageIndex}:${v.blockId}:${v.lineIndex}`, v);
        } else if (v.origin === 'block-value') {
            byBlock.set(`${v.pageIndex}:${v.blockId}`, v);
        } else if (v.origin === 'span') {
            const key = `${v.pageIndex}:${v.blockId}`;
            if (!bySpan.has(key)) bySpan.set(key, []);
            bySpan.get(key).push(v);
        }
    }
    return { byCell, byBlockLine, byBlock, bySpan };
}

/**
 * Remplace plusieurs portions à l'intérieur d'une même ligne.
 *
 * On parcourt de la fin vers le début : remplacer par la gauche décalerait les
 * positions de tous les spans suivants.
 */
function applySpans(lineText, spans) {
    if (!spans || !spans.length) return null;
    const ordered = [...spans].sort((a, b) => b.start - a.start);
    let out = lineText;
    const pieces = [];
    let tail = lineText.length;

    for (const span of ordered) {
        if (span.start < 0 || span.end > lineText.length) continue;
        pieces.unshift(escKeepPlaceholders(lineText.slice(span.end, tail)));
        pieces.unshift(`{${span.variable}}`);
        tail = span.start;
    }
    pieces.unshift(escKeepPlaceholders(lineText.slice(0, tail)));
    out = pieces.join('');
    return out;
}

/**
 * Remplace dans une cellule la seule portion détectée.
 * Si l'échantillon ne s'y retrouve pas, on substitue la cellule entière plutôt
 * que de laisser une valeur figée.
 */
function substituteInCell(text, hit) {
    const sample = hit.sample || '';
    const idx = sample ? text.lastIndexOf(sample) : -1;
    if (idx < 0) return `{${hit.variable}}`;
    return escKeepPlaceholders(text.slice(0, idx)) +
        `{${hit.variable}}` +
        escKeepPlaceholders(text.slice(idx + sample.length));
}

/** Remplace la valeur repérée par son placeholder, en gardant le libellé intact. */
function applyInline(lineText, hit) {
    if (!hit) return escKeepPlaceholders(lineText);
    const idx = lineText.lastIndexOf(hit.sample);
    if (idx < 0) return escKeepPlaceholders(lineText);
    return escKeepPlaceholders(lineText.slice(0, idx)) + `{${hit.variable}}` + escKeepPlaceholders(lineText.slice(idx + hit.sample.length));
}

// ── Primitives graphiques ────────────────────────────────────────────────────

function renderRect(r) {
    return `<div style="${style({
        position: 'absolute',
        left: mm(r.x) + 'mm', top: mm(r.y) + 'mm',
        width: mm(r.w) + 'mm', height: mm(r.h) + 'mm',
        background: r.fill || 'transparent',
        border: r.stroke ? `${ir.round(r.strokeWidth || 0.5, 2)}pt solid ${r.stroke}` : null
    })}"></div>`;
}

function renderLine(l) {
    const horizontal = Math.abs(l.y1 - l.y2) <= 1;
    const thickness = Math.max(l.width || 0.5, 0.3);
    return `<div style="${style({
        position: 'absolute',
        left: mm(Math.min(l.x1, l.x2)) + 'mm',
        top: mm(Math.min(l.y1, l.y2)) + 'mm',
        width: horizontal ? mm(Math.abs(l.x2 - l.x1)) + 'mm' : `${thickness}pt`,
        height: horizontal ? `${thickness}pt` : mm(Math.abs(l.y2 - l.y1)) + 'mm',
        background: l.color || '#000000'
    })}"></div>`;
}

/**
 * Emplacement réservé pour le logo. On ne redessine pas une image : on garde sa
 * boîte exacte et le système y injectera celle de l'entreprise.
 */
function renderImageSlot(img) {
    return `<div data-onda-logo="1" style="${style({
        position: 'absolute',
        left: mm(img.x) + 'mm', top: mm(img.y) + 'mm',
        width: mm(img.w) + 'mm', height: mm(img.h) + 'mm'
    })}"></div>`;
}

/** Une couleur est-elle trop claire pour être lisible sur fond blanc ? */
function estClair(hex) {
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return false;
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) > 200;
}

function fontProps(el) {
    return {
        'font-family': el.fontFamily || 'Helvetica, Arial, sans-serif',
        'font-size': `${el.fontSize}pt`,
        'font-weight': el.bold ? '700' : '400',
        'font-style': el.italic ? 'italic' : null,
        color: el.color || '#000000'
    };
}

// ── Tableaux ─────────────────────────────────────────────────────────────────

/**
 * Un tableau reste un <table> positionné : un tableau, pas deux cents divs.
 * Les largeurs de colonnes viennent des filets réels, donc exactes.
 */
function renderTable(table, pageIndex, tableIndex, page, vars) {
    const rows = table.rowEdges.length - 1;
    const cols = table.colEdges.length - 1;

    const cols_ = [];
    for (let c = 0; c < cols; c++) {
        cols_.push(`<col style="width:${mm(table.colEdges[c + 1] - table.colEdges[c])}mm">`);
    }

    /**
     * Fond d'une cellule, cherché parmi les aplats extraits.
     *
     * On retient l'aplat qui recouvre l'essentiel de la cellule, et non celui qui
     * la contient entièrement : un bandeau d'en-tête est souvent tracé par bandes
     * qui ne coïncident pas au point près avec les cellules fusionnées. Exiger un
     * recouvrement total laissait « DESIGNATION » et « BASE » sans fond — et leur
     * texte, blanc, devenait invisible sur du blanc.
     */
    const fillAt = (x, y, w, h) => {
        const aire = Math.max(w * h, 1);
        // Les surfaces de MÊME couleur sont cumulées : un bandeau d'en-tête est
        // tracé bande par bande, et chacune ne couvrait que la moitié d'une
        // cellule fusionnée sur deux lignes. Prise isolément, aucune n'atteignait
        // le seuil — « DESIGNATION », en blanc, restait sans fond donc invisible.
        const parCouleur = new Map();
        for (const r of page.rects) {
            if (!r.fill) continue;
            const dx = Math.min(x + w, r.x + r.w) - Math.max(x, r.x);
            const dy = Math.min(y + h, r.y + r.h) - Math.max(y, r.y);
            if (dx <= 0 || dy <= 0) continue;
            parCouleur.set(r.fill, (parCouleur.get(r.fill) || 0) + dx * dy);
        }
        let couleur = null;
        let couverture = 0;
        for (const [fill, commune] of parCouleur) {
            if (commune > couverture) { couverture = commune; couleur = fill; }
        }
        return couleur && couverture / aire >= 0.6 ? couleur : null;
    };

    let html = '';
    for (let r = 0; r < rows; r++) {
        const rowCells = table.cells.filter(c => c.r === r).sort((a, b) => a.c - b.c);
        const height = table.rowEdges[r + 1] - table.rowEdges[r];
        html += `<tr style="height:${mm(height)}mm">`;
        // Une ligne peut n'avoir aucune cellule propre si toutes sont couvertes
        // par un rowspan venu d'au-dessus : le <tr> reste, vide, pour préserver
        // la hauteur de la grille.
        void 0;
        for (const cell of rowCells) {
            const fond = fillAt(cell.x, cell.y, cell.w, cell.h);
            const hit = vars.byCell.get(`${pageIndex}:${tableIndex}:${cell.r}:${cell.c}`);
            // On ne remplace QUE la portion détectée, pas la cellule entière :
            // « 687 420 F » ne doit pas perdre sa devise, ni « 26/30 » son
            // dénominateur. La devise est une mention fixe du document.
            const content = hit ? substituteInCell(cell.text, hit) : escKeepPlaceholders(cell.text);
            // Les fusions sont rendues telles quelles : sans colspan/rowspan, un
            // en-tête « PART SALARIALE » couvrant trois colonnes ressortait
            // coincé dans une seule case, et la grille ne ressemblait plus à
            // l'original.
            const spanAttrs =
                (cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '') +
                (cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '');
            html += `<td${spanAttrs} style="${style({
                border: '0.5pt solid #000000',
                padding: '0.6mm 1.2mm',
                'text-align': cell.align || 'left',
                'vertical-align': 'middle',
                'font-family': cell.fontFamily || null,
                'font-size': cell.fontSize ? `${cell.fontSize}pt` : null,
                'font-weight': cell.bold ? '700' : null,
                'font-style': cell.italic ? 'italic' : null,
                // Un texte clair sans fond est invisible : c'est toujours le signe
                // d'un fond non détecté, jamais une intention. On retombe alors
                // sur le noir plutôt que de rendre la mention illisible.
                color: fond || !estClair(cell.color) ? (cell.color || null) : null,
                background: fond
            })}">${content}</td>`;
        }
        html += '</tr>';
    }

    return `<table style="${style({
        position: 'absolute',
        left: mm(table.x) + 'mm', top: mm(table.y) + 'mm',
        width: mm(table.w) + 'mm',
        'border-collapse': 'collapse',
        'table-layout': 'fixed'
    })}"><colgroup>${cols_.join('')}</colgroup><tbody>${html}</tbody></table>`;
}

// ── Stratégie ABSOLU ─────────────────────────────────────────────────────────

/**
 * Ancre un bloc positionné selon son alignement.
 *
 * Point clé de la robustesse : une valeur substituée est rarement de la même
 * longueur que celle d'origine. Ancré à gauche avec une largeur figée, un bloc
 * aligné à droite se remettait à la ligne dès que la nouvelle valeur était plus
 * longue. On ancre donc du côté où le texte est calé, et on laisse la largeur
 * suivre le contenu — le bloc grandit dans la direction où il y a de la place.
 */
function anchor(block, page) {
    const maxWidth = mm(page.width) + 'mm';
    if (block.align === 'right') {
        return {
            right: mm(page.width - (block.x + block.w)) + 'mm',
            top: mm(block.y) + 'mm',
            width: 'max-content',
            'max-width': maxWidth
        };
    }
    if (block.align === 'center') {
        return {
            left: mm(block.x + block.w / 2) + 'mm',
            top: mm(block.y) + 'mm',
            transform: 'translateX(-50%)',
            width: 'max-content',
            'max-width': maxWidth
        };
    }
    if (block.align === 'justify') {
        // Le texte justifié a besoin d'une largeur ferme pour se répartir.
        return { left: mm(block.x) + 'mm', top: mm(block.y) + 'mm', width: mm(block.w) + 'mm' };
    }
    return {
        left: mm(block.x) + 'mm',
        top: mm(block.y) + 'mm',
        width: 'max-content',
        'max-width': mm(page.width - block.x) + 'mm'
    };
}

function renderPageAbsolute(page, pageIndex, vars) {
    const parts = [];

    // Les aplats servant de fond de cellule sont déjà rendus par le tableau.
    const inTable = (r) => page.tables.some(t =>
        r.x >= t.x - 2 && r.y >= t.y - 2 && r.x + r.w <= t.x + t.w + 2 && r.y + r.h <= t.y + t.h + 2);
    const inTableLine = (l) => page.tables.some(t =>
        Math.min(l.x1, l.x2) >= t.x - 2 && Math.min(l.y1, l.y2) >= t.y - 2 &&
        Math.max(l.x1, l.x2) <= t.x + t.w + 2 && Math.max(l.y1, l.y2) <= t.y + t.h + 2);

    page.rects.filter(r => !inTable(r)).forEach(r => parts.push(renderRect(r)));
    page.lines.filter(l => !inTableLine(l)).forEach(l => parts.push(renderLine(l)));
    page.images.forEach(img => parts.push(renderImageSlot(img)));
    page.tables.forEach((t, ti) => parts.push(renderTable(t, pageIndex, ti, page, vars)));

    for (const block of page.blocks) {
        const whole = vars.byBlock.get(`${pageIndex}:${block.id}`);
        // Les spans portent sur le texte recollé : quand il y en a, le bloc est
        // rendu d'un seul tenant plutôt que ligne à ligne.
        const blockSpans = vars.bySpan.get(`${pageIndex}:${block.id}`);
        const lines = blockSpans
            ? [applySpans((block.lines || [block.text]).join(' '), blockSpans)]
            : (block.lines || [block.text]).map((lineText, li) => {
                if (whole && (block.lines || []).length <= 1) return `{${whole.variable}}`;
                return applyInline(lineText, vars.byBlockLine.get(`${pageIndex}:${block.id}:${li}`));
            });

        parts.push(`<div style="${style({
            position: 'absolute',
            ...anchor(block, page),
            'line-height': block.lineHeight || 1.25,
            'text-align': block.align === 'justify' ? 'justify' : block.align,
            ...fontProps(block)
        })}">${lines.join('<br>')}</div>`);
    }

    return parts.join('\n');
}

// ── Stratégie FLUX ───────────────────────────────────────────────────────────

/**
 * Marges de page, lues sur le contenu réel. Le texte coulera à l'intérieur,
 * ce qui laisse aux valeurs substituées la place de s'allonger.
 */
function pageMargins(page) {
    const box = page.contentBox || { x: 56, x2: page.width - 56 };
    const tops = page.blocks.map(b => b.y).concat(page.tables.map(t => t.y));
    const bottoms = page.blocks.map(b => b.y + b.h).concat(page.tables.map(t => t.y + t.h));
    const top = tops.length ? Math.min(...tops) : 56;
    const bottom = bottoms.length ? page.height - Math.max(...bottoms) : 56;
    return {
        left: Math.max(box.x, 0),
        right: Math.max(page.width - box.x2, 0),
        top: Math.max(top, 0),
        bottom: Math.max(bottom, 20)
    };
}

/**
 * En flux, l'en-tête et le pied restent en absolu : ce sont des repères fixes
 * de la page, pas du texte qui doit couler avec le corps.
 */
function isFixedZone(block, page, margins) {
    return block.y + block.h < margins.top - 4 || block.y > page.height - margins.bottom + 4;
}

function renderPageFlow(page, pageIndex, vars) {
    const margins = pageMargins(page);
    const fixed = [];
    const flow = [];

    page.images.forEach(img => fixed.push(renderImageSlot(img)));
    page.lines.forEach(l => fixed.push(renderLine(l)));
    page.rects.filter(r => r.fill).forEach(r => fixed.push(renderRect(r)));

    // Blocs et tableaux dans l'ordre de lecture
    const flowItems = [
        ...page.blocks.filter(b => !isFixedZone(b, page, margins)).map(b => ({ kind: 'block', y: b.y, b })),
        ...page.tables.map((t, ti) => ({ kind: 'table', y: t.y, t, ti }))
    ].sort((a, b) => a.y - b.y);

    page.blocks.filter(b => isFixedZone(b, page, margins)).forEach(b => {
        fixed.push(`<div style="${style({
            position: 'absolute',
            left: mm(b.x) + 'mm', top: mm(b.y) + 'mm', width: mm(b.w + 6) + 'mm',
            'text-align': b.align, ...fontProps(b)
        })}">${escKeepPlaceholders(b.text)}</div>`);
    });

    let previousBottom = margins.top;
    for (const item of flowItems) {
        if (item.kind === 'table') {
            // En flux, un tableau reste un bloc rigide : c'est une grille.
            const gap = Math.max(item.t.y - previousBottom, 0);
            flow.push(renderFlowTable(item.t, pageIndex, item.ti, page, vars, gap));
            previousBottom = item.t.y + item.t.h;
            continue;
        }
        const b = item.b;
        const gap = Math.max(b.y - previousBottom, 0);
        const whole = vars.byBlock.get(`${pageIndex}:${b.id}`);
        const joined = (b.lines || [b.text]).join(' ');
        const blockSpans = vars.bySpan.get(`${pageIndex}:${b.id}`);
        const text = blockSpans
            ? applySpans(joined, blockSpans)
            : (b.lines || [b.text]).map((lineText, li) => {
                if (whole && (b.lines || []).length <= 1) return `{${whole.variable}}`;
                return applyInline(lineText, vars.byBlockLine.get(`${pageIndex}:${b.id}:${li}`));
            }).join(' ');

        // Retrait de première ligne : c'est ce qui signale un début de paragraphe.
        const indent = b.lines && b.lines.length > 1 ? 0 : Math.max(b.x - margins.left, 0);

        flow.push(`<p style="${style({
            margin: `${mm(gap)}mm 0 0 0`,
            'text-indent': indent > 3 ? mm(indent) + 'mm' : null,
            'margin-left': b.lines && b.lines.length > 1 ? mm(Math.max(b.x - margins.left, 0)) + 'mm' : null,
            'line-height': b.lineHeight || 1.35,
            'text-align': b.align,
            ...fontProps(b)
        })}">${text}</p>`);
        previousBottom = b.y + b.h;
    }

    return { fixed: fixed.join('\n'), flow: flow.join('\n'), margins };
}

function renderFlowTable(table, pageIndex, tableIndex, page, vars, gap) {
    const html = renderTable(table, pageIndex, tableIndex, page, vars)
        .replace(/position:absolute;left:[^;]+;top:[^;]+;/, `margin-top:${mm(gap)}mm;`);
    return html;
}

// ── Entrée du module ─────────────────────────────────────────────────────────

/**
 * Émet le gabarit HTML complet.
 *
 * @param {object} doc      IR analysé et annoté
 * @param {object} options  { nature, minConfidence }
 * @returns {{ html: string, nature: string, variables: string[] }}
 */
function render(doc, options = {}) {
    const nature = options.nature || ir.inferDocumentNature(doc);
    const minConfidence = options.minConfidence ?? 0.6;
    const vars = indexVariables(doc, minConfidence);

    const pages = doc.pages.map((page, pageIndex) => {
        const wPx = mm(page.width);
        const hPx = mm(page.height);

        if (nature === 'grid') {
            return `<div class="onda-page" style="${style({
                position: 'relative',
                width: wPx + 'mm', height: hPx + 'mm',
                'font-family': 'Helvetica, Arial, sans-serif',
                overflow: 'hidden'
            })}">\n${renderPageAbsolute(page, pageIndex, vars)}\n</div>`;
        }

        const { fixed, flow, margins } = renderPageFlow(page, pageIndex, vars);
        return `<div class="onda-page" style="${style({
            position: 'relative',
            width: wPx + 'mm', 'min-height': hPx + 'mm',
            padding: `${mm(margins.top)}mm ${mm(margins.right)}mm ${mm(margins.bottom)}mm ${mm(margins.left)}mm`,
            'font-family': 'Helvetica, Arial, sans-serif'
        })}">\n${fixed}\n${flow}\n</div>`;
    });

    const used = [...new Set((doc.variables || [])
        .filter(v => v.variable && v.confidence >= minConfidence)
        .map(v => v.variable))].sort();

    return { html: pages.join('\n'), nature, variables: used };
}

module.exports = { render, indexVariables };
