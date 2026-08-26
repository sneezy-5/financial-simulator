// ═══════════════════════════════════════════════════════
// EXTRACTION WORD ET EXCEL
//
// Avantage décisif sur le PDF : ces formats DÉCLARENT leur structure. Un
// tableau est un tableau, une cellule fusionnée le dit, un paragraphe est
// délimité. Rien à reconstruire par clustering géométrique, donc rien à
// deviner — et rien à perdre.
//
// La sortie reprend la structure du moteur de documents (blocs et tableaux),
// ce qui permet de réutiliser tel quel tout le travail de détection déjà fait :
// lexique ivoirien, appariement étiquette/valeur, motifs de prose.
// ═══════════════════════════════════════════════════════

const PizZip = require('pizzip');

let XLSX;
try {
    XLSX = require('xlsx');
} catch (e) {
    console.warn("xlsx n'est pas installé : l'analyse des classeurs Excel est indisponible.");
}

function decoderXml(s) {
    return String(s)
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

// ── Word ─────────────────────────────────────────────────────────────────────

/** Texte d'un fragment XML, tous nœuds <w:t> concaténés. */
function texteDe(fragment) {
    const noeuds = fragment.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
    return noeuds.map(n => decoderXml(n.replace(/<[^>]+>/g, ''))).join('').trim();
}

/** Le fragment porte-t-il une mise en gras ? */
function estGras(fragment) {
    return /<w:b\s*\/>|<w:b\s+[^>]*w:val="(?:1|true|on)"/.test(fragment);
}

/**
 * Découpe le corps d'un document Word en paragraphes et tableaux, dans l'ordre
 * de lecture. Word imbrique <w:p> dans <w:tc> : on traite donc les tableaux
 * d'abord et on retire leur contenu du flux des paragraphes.
 */
function analyserCorpsWord(xml) {
    const elements = [];
    // Découpage de premier niveau : <w:tbl>…</w:tbl> et <w:p>…</w:p>
    const regex = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
    let m;
    let position = 0;

    while ((m = regex.exec(xml)) !== null) {
        // Un <w:p> déjà consommé par un tableau précédent est ignoré.
        if (m.index < position) continue;
        position = m.index + m[0].length;

        if (m[0].startsWith('<w:tbl>')) {
            const table = analyserTableauWord(m[0]);
            if (table) elements.push(table);
        } else {
            const texte = texteDe(m[0]);
            if (texte) elements.push({ type: 'paragraphe', texte, gras: estGras(m[0]) });
        }
    }
    return elements;
}

/** Lignes et cellules d'un tableau Word, fusions comprises. */
function analyserTableauWord(xmlTable) {
    const lignes = xmlTable.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
    if (!lignes.length) return null;

    const cells = [];
    lignes.forEach((ligneXml, r) => {
        const cellules = ligneXml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
        let c = 0;
        for (const celluleXml of cellules) {
            // Word DÉCLARE ses fusions : plus besoin de les déduire de l'absence
            // d'un filet, comme il fallait le faire sur un PDF.
            const span = celluleXml.match(/<w:gridSpan\s+w:val="(\d+)"/);
            const colSpan = span ? parseInt(span[1], 10) : 1;
            const fusionVerticale = /<w:vMerge(?!\s+w:val="restart")/.test(celluleXml);

            cells.push({
                r, c,
                colSpan,
                rowSpan: 1,
                texte: fusionVerticale ? '' : texteDe(celluleXml),
                gras: estGras(celluleXml),
                continuation: fusionVerticale
            });
            c += colSpan;
        }
    });

    const nbCols = Math.max(...cells.map(c => c.c + c.colSpan), 0);
    return { type: 'tableau', lignes: lignes.length, colonnes: nbCols, cells };
}

/**
 * @returns {{ kind:'docx', parties:Array, elements:Array, texte:string }}
 */
function extraireDocx(buffer, options = {}) {
    const zip = new PizZip(buffer);
    const noms = Object.keys(zip.files)
        .filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))
        .sort((a, b) => (a.includes('document') ? -1 : 1) - (b.includes('document') ? -1 : 1));

    if (!noms.length) throw new Error("Ce fichier ne contient pas de document Word lisible.");

    const parties = [];
    for (const nom of noms) {
        const xml = zip.file(nom)?.asText();
        if (!xml) continue;
        parties.push({
            nom,
            role: nom.includes('header') ? 'en-tete' : nom.includes('footer') ? 'pied' : 'corps',
            elements: analyserCorpsWord(xml)
        });
    }

    const elements = parties.flatMap(p => p.elements);
    return {
        kind: 'docx',
        parties,
        elements,
        texte: elements.map(e => e.type === 'paragraphe' ? e.texte : e.cells.map(c => c.texte).join(' ')).join('\n')
    };
}

// ── Excel ────────────────────────────────────────────────────────────────────

/**
 * Un classeur est déjà une grille : chaque feuille devient un tableau, chaque
 * cellule garde ses coordonnées natives (A1, B4…) qui serviront d'ancre pour la
 * substitution.
 */
function extraireXlsx(buffer, options = {}) {
    if (!XLSX) throw new Error("Le module xlsx n'est pas installé.");
    const classeur = XLSX.read(buffer, { type: 'buffer', cellStyles: true });

    const feuilles = classeur.SheetNames.map(nomFeuille => {
        const feuille = classeur.Sheets[nomFeuille];
        const etendue = feuille['!ref'] ? XLSX.utils.decode_range(feuille['!ref']) : null;
        const fusions = (feuille['!merges'] || []).map(f => ({
            r: f.s.r, c: f.s.c,
            colSpan: f.e.c - f.s.c + 1,
            rowSpan: f.e.r - f.s.r + 1
        }));

        const cells = [];
        if (etendue) {
            for (let r = etendue.s.r; r <= etendue.e.r; r++) {
                for (let c = etendue.s.c; c <= etendue.e.c; c++) {
                    const adresse = XLSX.utils.encode_cell({ r, c });
                    const cellule = feuille[adresse];
                    if (!cellule) continue;
                    const texte = String(cellule.w ?? cellule.v ?? '').trim();
                    if (!texte) continue;
                    const fusion = fusions.find(f => f.r === r && f.c === c);
                    cells.push({
                        r: r - etendue.s.r,
                        c: c - etendue.s.c,
                        adresse,
                        texte,
                        colSpan: fusion ? fusion.colSpan : 1,
                        rowSpan: fusion ? fusion.rowSpan : 1,
                        // Une formule n'est pas une donnée à paramétrer : elle se
                        // recalcule seule et la remplacer casserait le classeur.
                        formule: cellule.f || null
                    });
                }
            }
        }

        return {
            nom: nomFeuille,
            lignes: etendue ? etendue.e.r - etendue.s.r + 1 : 0,
            colonnes: etendue ? etendue.e.c - etendue.s.c + 1 : 0,
            cells
        };
    });

    return {
        kind: 'xlsx',
        feuilles,
        elements: feuilles.map(f => ({ type: 'tableau', lignes: f.lignes, colonnes: f.colonnes, cells: f.cells, feuille: f.nom })),
        texte: feuilles.flatMap(f => f.cells.map(c => c.texte)).join('\n')
    };
}

// ── Aiguillage ───────────────────────────────────────────────────────────────

function estDocx(buffer, nom = '') {
    if (/\.docx$/i.test(nom)) return true;
    return buffer && buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && /\.doc$/i.test(nom) === false && !/\.xlsx$/i.test(nom);
}

function extraireOffice(buffer, nom = '') {
    if (/\.xlsx$/i.test(nom) || /\.xlsm$/i.test(nom)) return extraireXlsx(buffer, {});
    if (/\.docx$/i.test(nom)) return extraireDocx(buffer, {});

    // Sans extension fiable : un DOCX contient word/document.xml, un XLSX non.
    try {
        const zip = new PizZip(buffer);
        if (zip.file('word/document.xml')) return extraireDocx(buffer, {});
        if (zip.file('xl/workbook.xml')) return extraireXlsx(buffer, {});
    } catch (e) { /* pas une archive Office */ }

    throw new Error("Format non reconnu : fournissez un .docx ou un .xlsx.");
}

module.exports = {
    extraireOffice, extraireDocx, extraireXlsx,
    analyserCorpsWord, analyserTableauWord, estDocx,
    disponible: () => !!XLSX
};
