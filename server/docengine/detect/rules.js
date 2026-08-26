// ═══════════════════════════════════════════════════════
// DÉTECTION DE VARIABLES PAR RÈGLES
//
// Premier passage, sans IA. Deux mécanismes complémentaires :
//
//  1. FORME — un montant, une date, un matricule se reconnaissent à leur motif.
//     Ce sont des candidats : une valeur propre au dossier, donc à remplacer.
//  2. LIBELLÉ — le lexique métier dit à quelle variable correspond une étiquette,
//     et la valeur associée est celle qui se trouve à sa droite ou en dessous.
//
// Ce que ce module ne tranche pas, il le laisse en `candidate` sans variable :
// c'est le résidu que le détecteur IA prendra en charge.
// ═══════════════════════════════════════════════════════

const lexicon = require('./lexicon');
const prosePatterns = require('./prosePatterns');
const rows = require('./rows');

// ── Motifs de forme ──────────────────────────────────────────────────────────

/** Montant : au moins 4 chiffres, groupés ou non (350000, 350 000, 350.000, 1 234 567). */
const RE_AMOUNT = /^-?\d{1,3}(?:[  .,]\d{3})+(?:[.,]\d{1,2})?$|^-?\d{4,}(?:[.,]\d{1,2})?$/;
/** Taux : 8,78% / 6.30 % / 12% */
const RE_RATE = /^\d{1,3}(?:[.,]\d{1,3})?\s*%$/;
/** Date : 01/09/2026, 1-9-26, 21 août 2026 */
const RE_DATE = /^(?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+(?:janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)[a-zé.]*\s+\d{4})$/i;
/** Code : matricule, numéro CNPS — lettres et chiffres mêlés, avec séparateurs. */
const RE_CODE = /^[A-Z0-9]{2,}[-\/.]?[A-Z0-9]{1,}$/i;
/** Nom propre en capitales : « KOUAME », « DIALLO Amadou » */
const RE_UPPER_NAME = /^[A-ZÀ-Þ][A-ZÀ-Þ'\- ]{2,}$/;
/** Blanc à compléter déjà présent dans le document : ______ ou ....... */
const RE_BLANK = /^[_.…\-]{3,}$/;

/** Devises rencontrées en suffixe d'un montant sur les bulletins d'Afrique de l'Ouest. */
const RE_DEVISE = /\s*(?:FCFA|F\s?CFA|XOF|francs?\s*CFA|francs?|F)\s*$/i;

/**
 * Sépare un montant de sa devise : « 697 420 F » → { valeur: '697 420', devise: ' F' }.
 *
 * La devise est une mention FIXE du document : seule la partie chiffrée doit
 * devenir une variable. Sans cette séparation, « 697 420 F » ne correspondait à
 * aucun motif de montant et le net à payer n'était pas détecté du tout.
 */
function splitAmount(text) {
    const t = (text || '').trim();
    const stripped = t.replace(RE_DEVISE, '');
    return stripped && stripped !== t && /\d/.test(stripped)
        ? { value: stripped, hasDevise: true }
        : { value: t, hasDevise: false };
}

/** Décrit la forme d'une valeur, ou null si elle ne ressemble à rien de variable. */
function classifyValue(text) {
    const t = splitAmount(text).value;
    if (!t) return null;
    if (RE_BLANK.test(t)) return { kind: lexicon.KIND.TEXT, confidence: 0.9, reason: 'blanc à compléter' };
    if (RE_RATE.test(t)) return { kind: lexicon.KIND.RATE, confidence: 0.5, reason: 'taux' };
    if (RE_AMOUNT.test(t)) return { kind: lexicon.KIND.AMOUNT, confidence: 0.9, reason: 'montant' };
    if (RE_DATE.test(t)) return { kind: lexicon.KIND.DATE, confidence: 0.85, reason: 'date' };
    // Un décimal court est une donnée : « 2.0 » (parts IGR), « 1,5 » (coefficient).
    // Le motif de montant exige au moins quatre chiffres et le rejetait.
    if (/^-?\d{1,3}[.,]\d{1,2}$/.test(t)) return { kind: lexicon.KIND.AMOUNT, confidence: 0.6, reason: 'décimal' };
    if (RE_UPPER_NAME.test(t) && t.length <= 40) return { kind: lexicon.KIND.TEXT, confidence: 0.4, reason: 'nom propre' };
    if (RE_CODE.test(t) && /\d/.test(t) && t.length <= 20) return { kind: lexicon.KIND.CODE, confidence: 0.5, reason: 'code' };
    return null;
}

/** Le type trouvé est-il compatible avec celui qu'attend le lexique ? */
function kindsAgree(expected, found) {
    if (!expected || !found) return true;
    if (expected === found) return true;
    // Un taux dans une colonne « montant » reste plausible.
    if (expected === lexicon.KIND.AMOUNT && found === lexicon.KIND.RATE) return true;
    // Un numéro d'immatriculation n'est fait que de chiffres : « 00023355 » est
    // classé « montant » par sa forme, alors que le lexique attend un code.
    // Sans cette tolérance, tous les numéros CNPS/CNSS passaient à travers.
    if (expected === lexicon.KIND.CODE && found === lexicon.KIND.AMOUNT) return true;
    if (expected === lexicon.KIND.TEXT) return true;
    return false;
}

// ── Détection dans les tableaux ──────────────────────────────────────────────

/**
 * Dans un tableau, la première colonne porte le libellé et les suivantes les
 * valeurs. On identifie la rubrique via le lexique, puis on marque comme variable
 * chaque cellule de la ligne dont la forme est cohérente.
 *
 * Les colonnes reçoivent un suffixe quand il y en a plusieurs (base, taux,
 * montant) : `salaire_base`, `salaire_base_base`, `salaire_base_taux`.
 */
/**
 * Rôle sémantique de chaque colonne, déduit d'un en-tête sur un ou deux niveaux.
 *
 * Un bulletin ivoirien porte deux lignes d'en-tête :
 *
 *   DESIGNATION | BASE | PART SALARIALE (fusion x3) | PART PATRONALE (fusion x2)
 *               |      | Taux | Gains | Retenues    | Taux | Retenues
 *
 * Le GROUPE donne le côté (salarial / patronal), la SOUS-COLONNE donne la nature
 * (base, taux, gain, retenue). Sans les deux, les colonnes ressortaient anonymes
 * et les variables s'appelaient `_c3`, `_c4` — inexploitables.
 */
function buildColumnRoles(table, headerRowCount = 2) {
    const nbCols = table.colEdges.length - 1;
    const roles = new Array(nbCols).fill(null).map(() => ({ side: null, kind: null }));

    const headerRows = [];
    for (let r = 0; r < headerRowCount; r++) headerRows.push(r);

    for (const r of headerRows) {
        for (const cell of table.cells.filter(c => c.r === r)) {
            const t = lexicon.normalizeLabel(cell.text);
            if (!t) continue;
            const span = cell.colSpan || 1;
            const side = /patronal|employeur/.test(t) ? 'patronal'
                : /salarial|salarie/.test(t) ? 'salarial' : null;
            const kind = columnKind(t);
            for (let c = cell.c; c < cell.c + span && c < nbCols; c++) {
                // Le groupe fusionné pose le côté ; la sous-colonne, plus précise,
                // pose la nature sans écraser le côté hérité.
                if (side) roles[c].side = side;
                if (kind) roles[c].kind = kind;
            }
        }
    }
    return roles;
}

function columnKind(t) {
    if (/^designation|^libelle|^rubrique/.test(t)) return 'label';
    if (/^base|^assiette/.test(t)) return 'base';
    if (/^taux|^%/.test(t)) return 'taux';
    if (/^gain/.test(t)) return 'gains';
    if (/^retenue/.test(t)) return 'retenues';
    if (/^montant|^somme/.test(t)) return 'montant';
    if (/^nombre|^qte|^quantite|^jours|^heures/.test(t)) return 'nombre';
    return null;
}

/**
 * Nom de variable d'une cellule, à partir de la rubrique de sa ligne et du rôle
 * de sa colonne.
 *
 * Le côté de la COLONNE fait autorité : sur la ligne « CNPS - RETRAITE », la
 * colonne salariale porte {salarial.cnps} et la colonne patronale {patronal.cnps}.
 */
function variableForCell(baseVariable, role, isLastValueColumn, entry) {
    if (!role || (!role.kind && !role.side)) {
        return isLastValueColumn ? baseVariable : null;
    }
    if (role.kind === 'label') return null;

    // Une rubrique qui porte les deux parts déclare son nom de chaque côté :
    // « CNPS - RETRAITE » est {cnps_salariale} à gauche et
    // {cnps_retraite_patronale} à droite. Le référentiel nomme, la colonne choisit.
    if (entry && entry.sides && role.side && entry.sides[role.side]) {
        const nom = entry.sides[role.side];
        switch (role.kind) {
            case 'base': return `${nom}_base`;
            case 'taux': return `${nom}_taux`;
            case 'nombre': return `${nom}_nombre`;
            case 'gains': return nom;
            default: return `${nom}_montant`;
        }
    }

    // Un nom canonique du référentiel se suffit à lui-même : la colonne ne fait
    // qu'y ajouter la nature de la valeur.
    if (entry && entry.canonical) {
        switch (role.kind) {
            case 'base':   return `${baseVariable}_base`;
            case 'taux':   return `${baseVariable}_taux`;
            case 'nombre': return `${baseVariable}_nombre`;
            default:       return baseVariable;
        }
    }

    const bare = lexicon.stripSide(baseVariable);
    // Le côté de la COLONNE fait autorité, et il s'applique à toutes les natures :
    // sur la ligne « CNPS - RETRAITE », la colonne patronale porte le taux ET la
    // retenue de l'employeur. Ne l'appliquer qu'aux retenues laissait les taux
    // patronaux nommés {salarial.cnps_taux} — la charge de l'employeur affichée
    // comme une retenue du salarié.
    const scoped = role.side ? `${role.side}.${bare}` : baseVariable;

    switch (role.kind) {
        case 'base':   return `${scoped}_base`;
        case 'taux':   return `${scoped}_taux`;
        case 'nombre': return `${scoped}_nombre`;
        // Un gain est une rémunération versée : il n'appartient à aucun côté.
        case 'gains':  return bare;
        case 'retenues':
        case 'montant':
        default:       return scoped;
    }
}

/**
 * Le texte est-il une DONNÉE, par opposition à un intitulé ?
 *
 * On ne retient que les formes chiffrées. La forme « nom propre » ne compte pas :
 * elle reconnaît toute suite de capitales, donc « DESIGNATION », « BASE » ou
 * « PART SALARIALE » — les en-têtes du bulletin passaient pour des valeurs et
 * la ligne d'en-tête n'était jamais reconnue comme telle.
 */
function isDataValue(text) {
    const shape = classifyValue(text);
    return !!shape && shape.kind !== lexicon.KIND.TEXT;
}

/** Une ligne d'en-tête ne contient aucune donnée chiffrée. */
function isHeaderRow(table, r) {
    const cells = table.cells.filter(c => c.r === r && c.text);
    return cells.length > 0 && cells.every(c => !isDataValue(c.text));
}

/**
 * Détection dans un tableau à en-tête de colonnes (bulletin classique).
 * Chaque ligne porte une rubrique à gauche, ses valeurs à droite.
 */
function detectByColumns(table, pageIndex, tableIndex, roles, headerRowCount, found) {
    const rows = table.rowEdges.length - 1;

    for (let r = headerRowCount; r < rows; r++) {
        const row = table.cells.filter(c => c.r === r).sort((a, b) => a.c - b.c);
        if (row.length < 2) continue;

        const labelCell = row[0];
        const entry = lexicon.lookup(labelCell.text, 'grid');
        const provisional = !entry && lexicon.looksLikeRubric(labelCell.text)
            ? lexicon.slugify(labelCell.text)
            : null;
        if (!entry && !provisional) continue;
        const baseVariable = entry ? entry.variable : provisional;

        const values = row.slice(1);
        values.forEach((cell, i) => {
            if (lexicon.isTitleOnly(cell.text)) return;
            const shape = classifyValue(cell.text);
            if (!shape) return;
            if (entry && !kindsAgree(entry.kind, shape.kind)) return;

            // Un taux de cotisation est une constante de la réglementation, pas une
            // donnée du salarié : le système n'a rien à y mettre. En faire une
            // variable effaçait « 6.3% » du bulletin sans pouvoir le remplacer.
            if (shape.kind === lexicon.KIND.RATE) return;

            const variable = variableForCell(baseVariable, roles[cell.c], i === values.length - 1, entry);
            if (!variable) return;
            const { value: sample } = splitAmount(cell.text);

            found.push({
                id: `${pageIndex}:t${tableIndex}:${r}:${cell.c}`,
                origin: 'table',
                pageIndex, tableIndex, row: r, col: cell.c,
                label: labelCell.text,
                sample,
                kind: shape.kind,
                reason: 'cellule de tableau',
                variable,
                mapped: !!entry,
                confidence: entry ? Math.min(0.95, shape.confidence + 0.2) : 0.7,
                x: cell.x, y: cell.y, w: cell.w, h: cell.h
            });
        });
    }
}

/**
 * Détection dans un tableau SANS en-tête de colonnes : une grille d'étiquettes
 * et de valeurs, comme le bloc « Cumuls » d'un bulletin ivoirien.
 *
 * L'étiquette d'une valeur est celle qui la précède immédiatement sur sa ligne ;
 * à défaut, celle qui la surplombe dans sa colonne. C'est le cas du « NET À
 * PAYER », dont l'intitulé coiffe la case et dont la ligne commence par une tout
 * autre rubrique — sans l'appariement vertical, le net se voyait attribuer le nom
 * de la rubrique voisine, soit un montant faux sous une étiquette officielle.
 */
function detectByPairs(table, pageIndex, tableIndex, found) {
    const cells = table.cells.filter(c => c.text);
    const isLabel = (c) => c.text && !isDataValue(c.text);

    for (const cell of cells) {
        if (lexicon.isTitleOnly(cell.text)) continue;
        const { value } = splitAmount(cell.text);
        let shape = classifyValue(cell.text);

        // Une forme « nom propre » — toute suite de capitales — ne suffit pas à
        // faire une valeur. « NET À PAYER », placé à droite de « Mode de
        // règlement », se voyait attribuer la variable de son voisin et
        // disparaissait du bulletin. On n'accepte du texte que si l'étiquette
        // elle-même annonce du texte.
        const estDonnee = shape && shape.kind !== lexicon.KIND.TEXT;

        // 1. Étiquette immédiatement à gauche, sur la même ligne
        let label = cells
            .filter(c => c.r === cell.r && c.c < cell.c && isLabel(c))
            .sort((a, b) => b.c - a.c)[0];

        // 2. Sinon, étiquette la plus proche au-dessus dans la même colonne
        if (!label) {
            label = cells
                .filter(c => c.c === cell.c && c.r < cell.r && isLabel(c))
                .sort((a, b) => b.r - a.r)[0];
        }
        if (!label) continue;

        const entry = lexicon.lookup(label.text, 'grid');
        const provisional = !entry && lexicon.looksLikeRubric(label.text)
            ? lexicon.slugify(label.text)
            : null;
        if (!entry && !provisional) continue;

        // L'étiquette porte la preuve : quand le lexique annonce un montant, un
        // entier court comme « 26 » est bien une valeur, alors que le motif
        // générique de montant le rejette faute de longueur.
        if (!shape && entry && entry.kind === lexicon.KIND.AMOUNT && /^-?\d+$/.test(value)) {
            shape = { kind: lexicon.KIND.AMOUNT, confidence: 0.7, reason: 'valeur annoncée par son intitulé' };
        }
        if (!shape) continue;
        // Du texte n'est retenu que si le lexique attend du texte à cet endroit.
        const attendText = entry &&
            (entry.kind === lexicon.KIND.TEXT || entry.kind === lexicon.KIND.CODE);
        if (!estDonnee && shape.kind === lexicon.KIND.TEXT && !attendText) continue;
        if (entry && !kindsAgree(entry.kind, shape.kind)) continue;

        found.push({
            id: `${pageIndex}:t${tableIndex}:${cell.r}:${cell.c}`,
            origin: 'table',
            pageIndex, tableIndex, row: cell.r, col: cell.c,
            label: label.text,
            // La devise reste dans le document, seule la partie chiffrée est variable.
            sample: value,
            kind: shape.kind,
            reason: 'grille étiquette/valeur',
            variable: entry ? entry.variable : provisional,
            mapped: !!entry,
            confidence: entry ? 0.9 : 0.7,
            x: cell.x, y: cell.y, w: cell.w, h: cell.h
        });
    }
}

function detectInTable(table, pageIndex, tableIndex, found) {
    const rows = table.rowEdges.length - 1;
    if (rows < 2 || table.colEdges.length - 1 < 2) return;

    // Un vrai en-tête occupe les premières lignes et ne contient aucune valeur.
    let headerRowCount = 0;
    while (headerRowCount < Math.min(2, rows) && isHeaderRow(table, headerRowCount)) headerRowCount++;

    const roles = headerRowCount ? buildColumnRoles(table, headerRowCount) : [];
    const hasColumnSemantics = roles.some(r => r && (r.kind || r.side));

    if (hasColumnSemantics) {
        detectByColumns(table, pageIndex, tableIndex, roles, headerRowCount, found);
    } else {
        detectByPairs(table, pageIndex, tableIndex, found);
    }
}

/** Suffixe de colonne, tiré de l'en-tête quand il est parlant. */
function suffixFor(header, index, total) {
    if (/montant|net a payer|somme/.test(header)) return '';
    if (/base|assiette/.test(header)) return '_base';
    if (/taux|%|pourcent/.test(header)) return '_taux';
    if (/nombre|qte|quantite|jours|heures/.test(header)) return '_nombre';
    // Dernière colonne d'un tableau de paie : c'est le montant.
    return index === total ? '' : `_c${index}`;
}

// ── Détection dans le texte courant ──────────────────────────────────────────

/**
 * Hors tableau, un couple « Libellé : valeur » est souvent dans le même bloc,
 * parfois séparé en deux blocs voisins. On traite les deux cas.
 */
/**
 * Sous quelle rubrique se trouve une ligne : employeur ou salarié ?
 *
 * Un bulletin porte « Nom » des deux côtés. Sans ce contexte, la même variable
 * {nom} était détectée pour la raison sociale ET pour le salarié — et le nom du
 * salarié aurait fini imprimé à la place de celui de l'entreprise.
 */
function sectionContext(block, lineIndex) {
    const lines = block.lines || [block.text];
    for (let i = lineIndex; i >= 0; i--) {
        const t = lexicon.normalizeLabel(lines[i] || '');
        // normalizeLabel a deja retire accents et ponctuation :
        // « SALARIÉ : » arrive ici sous la forme « salarie ».
        if (t === 'employeur' || t.startsWith('employeur ')) return 'employer';
        if (t === 'salarie' || t.startsWith('salarie ')) return 'employee';
        if (t === 'employe' || t.startsWith('employe ')) return 'employee';
    }
    return null;
}

/** Redirige une variable ambiguë selon la rubrique où elle apparaît. */
const EMPLOYER_SCOPED = {
    // Noms du référentiel ivoirien
    salarie_nom: 'employeur_raison_sociale',
    salarie_prenoms: null,
    salarie_matricule: null,
    salarie_numero_cnps: 'employeur_numero_cnps',
    salarie_adresse: 'employeur_adresse',
    // Noms historiques, conservés pour les gabarits déjà enregistrés
    nom: 'nom_entreprise',
    prenom: null,
    matricule: null,
    num_cnps: 'num_cnps_employeur'
};

function scopeVariable(variable, context) {
    if (context !== 'employer') return variable;
    if (!(variable in EMPLOYER_SCOPED)) return variable;
    return EMPLOYER_SCOPED[variable];   // null = à ne pas retenir
}

function detectInBlocks(page, pageIndex, nature, found, claimed = new Set()) {
    page.blocks.forEach((block, bi) => {
        // Cas 1 — « Matricule : M-0412 ». On examine ligne par ligne : un bloc
        // multi-lignes ferait déborder la valeur sur la ligne suivante.
        let matchedInline = false;
        (block.lines || [block.text]).forEach((lineText, li) => {
            if (claimed.has(`${pageIndex}:${block.id}:l${li}:row`)) { matchedInline = true; return; }
            const inline = lineText.match(/^(.{2,40}?)\s*[:：]\s*(.+)$/);
            if (!inline) return;
            const entry = lexicon.lookup(inline[1], nature);
            const shape = classifyValue(inline[2]) || { kind: lexicon.KIND.TEXT, confidence: 0.3, reason: 'valeur après deux-points' };
            if (entry && !kindsAgree(entry.kind, shape.kind)) return;

            // Un « Libellé : valeur » est une structure de formulaire sans
            // ambiguïté : même si le lexique ignore l'intitulé, c'est un champ.
            let scoped;
            if (entry) {
                scoped = scopeVariable(entry.variable, sectionContext(block, li));
            } else if (lexicon.looksLikeRubric(inline[1]) && shape.confidence >= 0.4) {
                scoped = lexicon.slugify(inline[1]);
            }
            if (!scoped) return;
            found.push({
                id: `${pageIndex}:b${bi}:l${li}:inline`,
                origin: 'block-inline',
                pageIndex, blockId: block.id, lineIndex: li,
                label: inline[1].trim(),
                sample: inline[2].trim(),
                kind: shape.kind,
                reason: 'libellé suivi de deux-points',
                variable: scoped,
                mapped: !!entry,
                confidence: entry ? Math.min(0.95, 0.6 + shape.confidence * 0.35) : 0.7,
                x: block.x, y: block.y, w: block.w, h: block.h
            });
            matchedInline = true;
        });
        // Cas 1 bis — « NET À PAYER (D = A – C) 750 150 FCFA » : le libellé et son
        // montant sur la même ligne, sans deux-points. C'est la mise en forme
        // habituelle des bandeaux de total, et c'est la variable la plus
        // importante d'un bulletin — la manquer était le pire des oublis.
        (block.lines || [block.text]).forEach((lineText, li) => {
            if (matchedInline) return;
            if (claimed.has(`${pageIndex}:${block.id}:l${li}:row`)) return;
            const m = lineText.match(/^(.*?[A-Za-zÀ-ÿ)].*?)\s+(-?\d{1,3}(?:[  .]\d{3})+(?:[.,]\d{1,2})?|-?\d{4,}(?:[.,]\d{1,2})?)\s*(?:FCFA|F\s?CFA|XOF|francs?)?\s*$/);
            if (!m) return;
            const entry = lexicon.lookup(m[1], nature);
            if (!entry || entry.kind !== lexicon.KIND.AMOUNT) return;
            found.push({
                id: `${pageIndex}:b${bi}:l${li}:trailing`,
                origin: 'block-inline',
                pageIndex, blockId: block.id, lineIndex: li,
                label: m[1].trim(),
                sample: m[2].trim(),
                kind: lexicon.KIND.AMOUNT,
                reason: 'libellé suivi de son montant',
                variable: entry.variable,
                confidence: 0.9,
                x: block.x, y: block.y, w: block.w, h: block.h
            });
            matchedInline = true;
        });

        if (matchedInline) return;

        // Cas 2 — le bloc entier est une valeur reconnaissable (montant isolé,
        // nom en capitales, date de signature)
        if (lexicon.isTitleOnly(block.text)) return;
        const shape = classifyValue(block.text);
        if (shape) {
            const neighbour = findLabelNeighbour(page, block);
            const entry = neighbour ? lexicon.lookup(neighbour.text, nature) : null;
            const ok = entry
                && kindsAgree(entry.kind, shape.kind)
                && looksLikeLabel(neighbour.text, entry);
            found.push({
                id: `${pageIndex}:b${bi}:value`,
                origin: 'block-value',
                pageIndex, blockId: block.id,
                label: neighbour ? neighbour.text : null,
                sample: block.text,
                kind: shape.kind,
                reason: shape.reason,
                variable: ok ? entry.variable : null,
                confidence: ok ? Math.min(0.9, shape.confidence + 0.2) : shape.confidence * 0.6,
                x: block.x, y: block.y, w: block.w, h: block.h
            });
        }
    });
}

/**
 * Un bloc peut-il servir d'étiquette à un autre ?
 *
 * Un bloc qui porte DÉJÀ sa valeur (« Période de paie : Août 2026 ») n'étiquette
 * pas le bloc suivant : sa valeur est à lui. Sans cette vérification, le titre
 * « DÉTAIL DE LA RÉMUNÉRATION » placé juste en dessous héritait de la variable
 * {periode} et disparaissait du document — un intitulé fixe effacé sur un
 * bulletin officiel, ce qui est bien pire qu'une variable manquée.
 */
function looksLikeLabel(text, entry) {
    const t = (text || '').trim();
    if (!t || t.length > 60) return false;
    // Un deux-points en fin de bloc annonce sans ambiguïté ce qui suit.
    if (/[:：]\s*$/.test(t)) return true;
    if (!entry) return false;
    // Sinon le bloc doit être l'étiquette et rien d'autre : à peine plus long que
    // le libellé reconnu, faute de quoi il contient déjà autre chose.
    const own = lexicon.normalizeLabel(t).length;
    const matched = lexicon.normalizeLabel(entry.matchedLabel || '').length;
    return matched > 0 && own <= matched + 3;
}

/**
 * Cherche l'étiquette d'une valeur : à sa gauche sur la même ligne, sinon
 * immédiatement au-dessus. C'est la convention de lecture de tout formulaire.
 */
function findLabelNeighbour(page, block) {
    const sameRow = page.blocks.filter(b =>
        b.id !== block.id &&
        Math.abs(b.y - block.y) <= block.h * 0.6 &&
        b.x + b.w <= block.x + 2 &&
        block.x - (b.x + b.w) < 120
    ).sort((a, b) => (block.x - (b.x + b.w)) - (block.x - (a.x + a.w)));
    if (sameRow.length) return sameRow[0];

    const above = page.blocks.filter(b =>
        b.id !== block.id &&
        b.y < block.y &&
        block.y - (b.y + b.h) < block.h * 0.8 &&
        Math.abs(b.x - block.x) < 40
    ).sort((a, b) => b.y - a.y);
    return above[0] || null;
}

/**
 * Détection à l'intérieur des phrases, pour les documents rédigés.
 *
 * Un contrat ne met pas ses données dans des cases : « à compter du 01/09/2026 »,
 * « de 485 000 FCFA ». Il faut donc repérer la portion exacte à remplacer à
 * l'intérieur d'une ligne, et laisser la tournure juridique intacte autour.
 */
function detectInProse(page, pageIndex, found) {
    page.blocks.forEach((block) => {
        // Sur le PARAGRAPHE entier, pas ligne par ligne : une tournure comme
        // « représentée par X, en qualité de Y » est presque toujours coupée par
        // un retour à la ligne, et aucun motif ne la reconnaîtrait alors.
        // Le rendu en flux recolle les lignes de la même façon.
        const joined = (block.lines || [block.text]).join(' ');
        for (const span of prosePatterns.findSpans(joined)) {
            found.push({
                id: `${pageIndex}:${block.id}:s${span.start}`,
                origin: 'span',
                pageIndex, blockId: block.id,
                start: span.start, end: span.end,
                label: null,
                sample: span.sample,
                kind: null,
                reason: 'tournure reconnue',
                variable: span.variable,
                confidence: span.confidence,
                x: block.x, y: block.y, w: block.w, h: block.h
            });
        }
    });
}

// ── Entrée du module ─────────────────────────────────────────────────────────

/**
 * Annote l'IR de ses variables candidates.
 * @param {object} doc     document IR analysé par layout.js
 * @param {string} nature  'grid' | 'prose'
 */
function detect(doc, nature) {
    const found = [];
    const claimed = new Set();
    doc.pages.forEach((page, pageIndex) => {
        page.tables.forEach((t, ti) => detectInTable(t, pageIndex, ti, found));
        // Les lignes reconstruites passent AVANT la détection par bloc : elles
        // s'appuient sur la relation étiquette↔valeur, une preuve bien plus forte
        // que la seule forme du texte.
        if (nature === 'grid') rows.detectInRows(page, pageIndex, found, claimed);
        detectInBlocks(page, pageIndex, nature, found, claimed);
        if (nature === 'prose') detectInProse(page, pageIndex, found);
    });

    propagateKnownValues(doc, found, claimed);

    // Une même variable peut être trouvée plusieurs fois (total répété en pied de
    // page) : on garde toutes les occurrences mais on signale les doublons pour
    // que le rendu les remplace toutes par le même placeholder.
    const byVariable = new Map();
    for (const v of found) {
        if (!v.variable) continue;
        if (!byVariable.has(v.variable)) byVariable.set(v.variable, []);
        byVariable.get(v.variable).push(v.id);
    }
    for (const v of found) {
        if (v.variable) v.duplicates = byVariable.get(v.variable).filter(id => id !== v.id);
    }

    doc.variables = found;
    return doc;
}

/**
 * Reporte une valeur déjà identifiée sur ses autres occurrences dans le document.
 *
 * Le net à payer est souvent répété en toutes lettres (« Arrêté le présent
 * bulletin à la somme de : 750 150 francs CFA »). Cette phrase-là ne ressemble à
 * aucun motif d'étiquette, et le montant y restait figé : le bulletin généré se
 * contredisait, affichant 601 800 dans le bandeau et 750 150 dans la mention.
 *
 * On ne propage qu'une valeur sûre (≥ 0,85) et suffisamment longue : reporter
 * « 0 » ou « 30 » partout produirait des remplacements absurdes.
 */
function propagateKnownValues(doc, found, claimed) {
    const known = new Map();
    for (const v of found) {
        if (!v.variable || v.confidence < 0.85) continue;
        if (v.kind !== lexicon.KIND.AMOUNT) continue;
        const sample = (v.sample || '').trim();
        if (sample.length < 5) continue;
        if (!known.has(sample)) known.set(sample, v.variable);
    }
    if (!known.size) return;

    doc.pages.forEach((page, pageIndex) => {
        page.blocks.forEach((block) => {
            (block.lines || [block.text]).forEach((lineText, li) => {
                const already = found.some(v =>
                    v.blockId === block.id && v.lineIndex === li && v.pageIndex === pageIndex);
                if (already) return;
                for (const [sample, variable] of known) {
                    if (!lineText.includes(sample)) continue;
                    // La ligne ne doit pas être QUE ce montant : ce cas relève de
                    // la détection normale, qui l'aurait déjà traité.
                    if (lineText.trim() === sample) continue;
                    found.push({
                        id: `${pageIndex}:${block.id}:l${li}:echo`,
                        origin: 'block-inline',
                        pageIndex, blockId: block.id, lineIndex: li,
                        label: null,
                        sample,
                        kind: lexicon.KIND.AMOUNT,
                        reason: 'reprise d\'une valeur déjà identifiée',
                        variable,
                        confidence: 0.85,
                        x: block.x, y: block.y, w: block.w, h: block.h
                    });
                    break;
                }
            });
        });
    });
}

module.exports = { detect, classifyValue, splitAmount, detectInTable, detectInBlocks, detectInProse, findLabelNeighbour, looksLikeLabel, propagateKnownValues };
