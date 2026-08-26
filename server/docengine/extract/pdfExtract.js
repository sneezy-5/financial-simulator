// ═══════════════════════════════════════════════════════
// EXTRACTEUR PDF DÉTERMINISTE
//
// Un PDF n'est pas un document, c'est une liste d'ordres de dessin : « pose le
// glyphe A en (72,481) dans la police F3 corps 7.5 », « trace un trait de (56,120)
// à (539,120) », « remplis ce rectangle en #E8EEF5 ». Aucune notion de paragraphe,
// de tableau ni de titre.
//
// Ce module lit ces ordres et reconstitue la couche brute de l'IR. Aucune IA, aucune
// heuristique : ce qui sort d'ici est exact et reproductible. L'interprétation
// (lignes, paragraphes, tableaux) est le travail de layout.js.
// ═══════════════════════════════════════════════════════

const ir = require('../ir');

let pdfjs;
{
    // pdf.js cherche le module natif `canvas` au chargement et journalise deux
    // avertissements quand il ne le trouve pas. On ne rend rien ici — uniquement
    // getTextContent et getOperatorList — donc le bruit est inutile.
    const realWarn = console.warn;
    const realLog = console.log;
    const mute = (fn) => (...args) => {
        if (typeof args[0] === 'string' && /polyfill|canvas/i.test(args[0])) return;
        fn.apply(console, args);
    };
    console.warn = mute(realWarn);
    console.log = mute(realLog);
    try {
        // Build « legacy » : c'est celle qui fonctionne sous Node en CommonJS.
        pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    } catch (e) {
        realWarn("pdfjs-dist n'est pas installé : l'extraction déterministe est indisponible.");
    } finally {
        console.warn = realWarn;
        console.log = realLog;
    }
}

const OPS = pdfjs ? pdfjs.OPS : {};

/** Segments trop courts : artefacts de contour, pas des filets de mise en page. */
const MIN_RULE_LENGTH = 3;
/** Au-delà, un « trait » est en réalité un rectangle plein (fond de cellule). */
const MAX_RULE_THICKNESS = 2.5;

/**
 * Rejoue la liste d'opérateurs en suivant la matrice courante (CTM).
 *
 * Les coordonnées du flux sont en espace utilisateur ; il faut leur appliquer la
 * CTM pour obtenir la position réelle, puis retourner l'axe Y — PDF compte depuis
 * le bas de la page, tout le reste du moteur depuis le haut.
 */
function extractGraphics(opList, pageHeight) {
    const lines = [];
    const rects = [];
    const images = [];
    const textColors = [];   // couleur de remplissage à chaque showText, dans l'ordre

    let ctm = ir.IDENTITY;
    const stack = [];

    let fillColor = null;
    let strokeColor = null;
    let lineWidth = 1;
    let textMatrix = null;
    // Chemin en attente : construit par constructPath, peint par fill/stroke.
    let pending = null;

    const toPage = (x, y) => {
        const [dx, dy] = ir.applyMat(ctm, x, y);
        return [ir.round(dx), ir.round(pageHeight - dy)];
    };

    for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        const args = opList.argsArray[i];

        switch (fn) {
            case OPS.save:
                stack.push({ ctm, fillColor, strokeColor, lineWidth });
                break;

            case OPS.restore: {
                const s = stack.pop();
                if (s) ({ ctm, fillColor, strokeColor, lineWidth } = s);
                break;
            }

            case OPS.transform:
                ctm = ir.matMul(ctm, args);
                break;

            case OPS.setLineWidth:
                lineWidth = args[0];
                break;

            case OPS.setFillRGBColor:
                fillColor = ir.toHex(args);
                break;

            case OPS.setFillGray:
                fillColor = grayToHex(args[0]);
                break;

            case OPS.setFillCMYKColor:
                fillColor = cmykToHex(args);
                break;

            case OPS.setStrokeRGBColor:
                strokeColor = ir.toHex(args);
                break;

            case OPS.setStrokeGray:
                strokeColor = grayToHex(args[0]);
                break;

            case OPS.constructPath:
                pending = { subOps: Array.from(args[0]), coords: Array.from(args[1]) };
                break;

            case OPS.fill:
            case OPS.eoFill:
            case OPS.fillStroke:
            case OPS.eoFillStroke:
            case OPS.closeFillStroke:
            case OPS.closeEOFillStroke:
                if (pending) {
                    emitPath(pending, { fill: fillColor, stroke: null, lineWidth }, toPage, ctm, lines, rects);
                    pending = null;
                }
                break;

            case OPS.stroke:
            case OPS.closeStroke:
                if (pending) {
                    emitPath(pending, { fill: null, stroke: strokeColor, lineWidth }, toPage, ctm, lines, rects);
                    pending = null;
                }
                break;

            case OPS.endPath:
                pending = null;
                break;

            case OPS.beginText:
                textMatrix = null;
                break;

            case OPS.setTextMatrix:
                textMatrix = args;
                break;

            case OPS.showText:
            case OPS.showSpacedText:
                // Le texte est peint avec la couleur de REMPLISSAGE courante.
                // Sans elle, un libellé blanc sur bandeau foncé ressortait en noir,
                // donc invisible : c'est ce qui arrivait à la ligne « NET À PAYER ».
                //
                // On enregistre la POSITION du tracé, pas seulement son rang :
                // pdf.js découpe getTextContent plus finement que les opérations de
                // dessin (deux fois plus de fragments que de showText sur un
                // bulletin réel), donc une correspondance par index est fausse.
                if (textMatrix) {
                    const [px, py] = toPage(textMatrix[4], textMatrix[5]);
                    textColors.push({ x: px, y: py, color: fillColor || '#000000' });
                }
                break;

            case OPS.paintImageXObject:
            case OPS.paintInlineImageXObject:
            case OPS.paintJpegXObject: {
                // L'image est dessinée dans le carré unité, mise à l'échelle par la CTM.
                const [x0, y0] = toPage(0, 0);
                const [x1, y1] = toPage(1, 1);
                images.push({
                    x: Math.min(x0, x1), y: Math.min(y0, y1),
                    w: Math.abs(x1 - x0), h: Math.abs(y1 - y0)
                });
                break;
            }

            default:
                break;
        }
    }

    return { lines, rects, images, textColors };
}

/** Niveau de gris PDF (0-1) → #rrggbb */
function grayToHex(g) {
    const v = Math.max(0, Math.min(255, Math.round((Number(g) || 0) * 255)));
    return '#' + v.toString(16).padStart(2, '0').repeat(3);
}

/** CMJN PDF (composantes 0-1) → #rrggbb */
function cmykToHex(a) {
    const [c, m, y, k] = [0, 1, 2, 3].map(i => Number(a[i]) || 0);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(255 * (1 - v) * (1 - k))));
    return '#' + [ch(c), ch(m), ch(y)].map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Convertit un chemin en filets et rectangles.
 *
 * Un rectangle très plat n'est pas une surface, c'est un filet : beaucoup de
 * générateurs tracent leurs lignes de tableau ainsi. On les classe en `lines`
 * pour que la détection de tableaux les voie comme des séparateurs.
 */
function emitPath(path, style, toPage, ctm, lines, rects) {
    const { subOps, coords } = path;
    const scale = ir.matScale(ctm);
    const width = ir.round((style.lineWidth || 1) * scale, 2);
    let k = 0;
    let cursor = null;

    for (const op of subOps) {
        if (op === OPS.rectangle) {
            const [rx, ry, rw, rh] = coords.slice(k, k + 4); k += 4;
            const [ax, ay] = toPage(rx, ry);
            const [bx, by] = toPage(rx + rw, ry + rh);
            const x = Math.min(ax, bx), y = Math.min(ay, by);
            const w = Math.abs(bx - ax), h = Math.abs(by - ay);

            if (h <= MAX_RULE_THICKNESS && w > MIN_RULE_LENGTH) {
                lines.push({ x1: x, y1: ir.round(y + h / 2), x2: ir.round(x + w), y2: ir.round(y + h / 2), width: h || width, color: style.fill || style.stroke });
            } else if (w <= MAX_RULE_THICKNESS && h > MIN_RULE_LENGTH) {
                lines.push({ x1: ir.round(x + w / 2), y1: y, x2: ir.round(x + w / 2), y2: ir.round(y + h), width: w || width, color: style.fill || style.stroke });
            } else if (w > 0 && h > 0) {
                rects.push({ x, y, w: ir.round(w), h: ir.round(h), fill: style.fill, stroke: style.stroke, strokeWidth: style.stroke ? width : 0 });
            }
        } else if (op === OPS.moveTo) {
            cursor = toPage(coords[k], coords[k + 1]); k += 2;
        } else if (op === OPS.lineTo) {
            const next = toPage(coords[k], coords[k + 1]); k += 2;
            if (cursor) {
                const dx = Math.abs(next[0] - cursor[0]);
                const dy = Math.abs(next[1] - cursor[1]);
                // On ne retient que l'horizontal et le vertical : les obliques ne
                // structurent pas une mise en page de document administratif.
                if ((dx > MIN_RULE_LENGTH && dy <= 1) || (dy > MIN_RULE_LENGTH && dx <= 1)) {
                    lines.push({ x1: cursor[0], y1: cursor[1], x2: next[0], y2: next[1], width, color: style.stroke || style.fill });
                }
            }
            cursor = next;
        } else if (op === OPS.curveTo) {
            k += 6; cursor = null;
        } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
            k += 4; cursor = null;
        } else if (op === OPS.closePath) {
            // rien à émettre
        }
    }
}

/**
 * Résout la vraie police derrière un nom de ressource.
 *
 * `getTextContent().styles` ne donne qu'une famille générique (« serif ») et des
 * noms opaques (« g_d0_f1 ») : la graisse y est indétectable. Les objets communs
 * de pdf.js, eux, portent le nom PostScript réel (« Times-Bold ») et les
 * indicateurs de graisse et d'italique. C'est exact, pas une heuristique.
 *
 * Prérequis : getOperatorList() doit avoir été appelé, c'est lui qui les résout.
 */
function createFontResolver(page) {
    const cache = new Map();
    return (fontName) => {
        if (!fontName) return null;
        if (cache.has(fontName)) return cache.get(fontName);
        let info = null;
        try {
            const o = page.commonObjs.get(fontName);
            if (o) info = { name: o.name || '', bold: !!(o.bold || o.black), italic: !!o.italic };
        } catch (e) {
            // Police non résolue : on retombera sur le nom générique.
        }
        cache.set(fontName, info);
        return info;
    };
}

/**
 * Retrouve la couleur d'un fragment par sa position.
 *
 * Un seul tracé peut donner plusieurs fragments (pdf.js les recoupe aux
 * changements d'espacement). Le fragment hérite donc du tracé le plus proche à
 * sa gauche SUR LA MÊME LIGNE — c'est-à-dire celui qui l'a effectivement peint.
 */
function createColorLookup(samples) {
    if (!samples.length) return () => null;

    // Regroupement par ligne de base, pour ne comparer que ce qui est comparable
    const byLine = new Map();
    for (const sample of samples) {
        const key = Math.round(sample.y);
        if (!byLine.has(key)) byLine.set(key, []);
        byLine.get(key).push(sample);
    }
    for (const list of byLine.values()) list.sort((a, b) => a.x - b.x);

    return (x, y) => {
        // ±1pt : les arrondis de matrice décalent parfois la ligne de base
        for (const dy of [0, -1, 1]) {
            const list = byLine.get(Math.round(y) + dy);
            if (!list) continue;
            let best = null;
            for (const sample of list) {
                if (sample.x <= x + 0.5) best = sample;
                else break;
            }
            if (best) return best.color;
            // Fragment avant le premier tracé de la ligne : on prend celui-ci
            return list[0].color;
        }
        return null;
    };
}

/** Runs de texte, avec position, corps et graisse — la vérité terrain des libellés. */
async function extractText(page, pageHeight, textColors = []) {
    const content = await page.getTextContent();
    const resolveFont = createFontResolver(page);
    const texts = [];

    const colorAt = createColorLookup(textColors);

    content.items.forEach((item, idx) => {
        const str = (item.str || '').replace(/\s+/g, ' ').trim();
        if (!str) return;

        const [a, b, , d, x, y] = item.transform;
        const fontSize = ir.round(Math.hypot(a, b) || Math.abs(d) || 10, 1);
        const style = content.styles?.[item.fontName] || {};
        const info = resolveFont(item.fontName);
        const family = info?.name || style.fontFamily || item.fontName || '';
        const width = item.width || str.length * fontSize * 0.5;

        texts.push({
            id: `t${idx}`,
            str,
            x: ir.round(x),
            y: ir.round(pageHeight - y),          // ligne de base, origine en haut
            x2: ir.round(x + width),
            y2: ir.round(pageHeight - y + fontSize * 0.25),
            fontSize,
            // Les deux sources comptent : l'indicateur du descripteur de police,
            // ET le nom PostScript. Sur les polices embarquées sous-ensemblées,
            // le descripteur annonce souvent `bold: false` alors que le nom dit
            // « …-Bold » — s'en remettre au seul indicateur perdait tout le gras.
            // « SemiBold »/« Medium » sont volontairement exclus : on ne peut
            // reproduire qu'un binaire normal/gras (aucune police d'origine n'est
            // embarquée), et forcer un semi-gras vers 700 le rendait plus épais
            // que l'original — plus proche du rendu réel de rester en 400.
            bold: (info && info.bold) || /bold|black|heavy/i.test(family),
            italic: (info && info.italic) || /italic|oblique/i.test(family),
            fontFamily: normalizeFontFamily(family),
            color: colorAt(ir.round(x), ir.round(pageHeight - y))
        });
    });

    return texts;
}

/**
 * Un PDF embarque des polices sous-ensemblées aux noms arbitraires
 * (« ABCDEE+Arial-Bold », « g_d0_f1 »). On ne peut pas les restituer fidèlement :
 * on les ramène à une famille générique, la plus proche visuellement.
 */
function normalizeFontFamily(raw) {
    const f = (raw || '').toLowerCase();
    // Apostrophes simples, jamais de guillemets doubles : ces piles finissent
    // dans un attribut style="…" et un guillemet double le refermerait au
    // milieu — la déclaration entière était alors ignorée par le navigateur.
    if (/times|serif|georgia|garamond|book|roman|minion/.test(f) && !/sans/.test(f)) {
        return "Georgia, 'Times New Roman', serif";
    }
    if (/courier|mono|consol/.test(f)) return "'Courier New', monospace";
    return 'Helvetica, Arial, sans-serif';
}

/**
 * Extrait un PDF vers l'IR brut.
 * @param {Buffer} buffer contenu du fichier
 * @param {object} opts   { filename, maxPages }
 */
async function extractPdf(buffer, opts = {}) {
    if (!pdfjs) throw new Error("pdfjs-dist n'est pas installé (npm i pdfjs-dist@3.11.174).");

    const doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        verbosity: 0,
        // Pas de rendu : ni polices système ni canvas requis.
        disableFontFace: true,
        isEvalSupported: false
    }).promise;

    const maxPages = Math.min(doc.numPages, opts.maxPages || 5);
    const out = ir.createDocument({ kind: 'pdf', filename: opts.filename, pageCount: doc.numPages });

    let totalRuns = 0;
    for (let n = 1; n <= maxPages; n++) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        const irPage = ir.createPage(ir.round(viewport.width), ir.round(viewport.height));

        // getOperatorList d'abord : c'est son exécution qui résout les objets
        // communs, donc les vraies polices que extractText va consulter.
        const g = extractGraphics(await page.getOperatorList(), viewport.height);
        irPage.texts = await extractText(page, viewport.height, g.textColors);
        irPage.lines = g.lines;
        irPage.rects = g.rects;
        irPage.images = g.images;

        totalRuns += irPage.texts.length;
        out.pages.push(irPage);
    }

    if (doc.numPages > maxPages) {
        out.diagnostics.push(`Seules les ${maxPages} premières pages sur ${doc.numPages} ont été analysées.`);
    }

    // Un PDF scanné n'a aucun run de texte : la voie déterministe ne peut rien en
    // tirer, l'appelant devra basculer sur la lecture d'image par l'IA.
    out.source.hasTextLayer = totalRuns > 0;
    if (!out.source.hasTextLayer) {
        out.diagnostics.push("Aucune couche texte : document scanné, l'analyse déterministe est impossible.");
    }

    return out;
}

module.exports = { extractPdf, extractGraphics, normalizeFontFamily, isAvailable: () => !!pdfjs };
