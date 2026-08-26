// ═══════════════════════════════════════════════════════
// ANALYSE D'UN MODÈLE WORD OU EXCEL
//
// Produit une PROPOSITION, pas un résultat définitif : chaque emplacement
// repéré est présenté à l'utilisateur, qui valide ou fait réanalyser. Rien
// n'est appliqué à son modèle sans son accord.
//
// Réutilise intégralement le référentiel ivoirien et les motifs de prose : le
// travail de détection ne dépend pas du format d'entrée, seulement de la
// structure — et Word et Excel la déclarent au lieu de la faire deviner.
// ═══════════════════════════════════════════════════════

const lexicon = require('../detect/lexicon');
const rules = require('../detect/rules');
const prosePatterns = require('../detect/prosePatterns');
const { typeDocument, controlerCompletude } = require('./typesDocuments');

/** Un texte est-il une donnée chiffrée, par opposition à un intitulé ? */
function estDonnee(texte) {
    const forme = rules.classifyValue(texte);
    return !!forme && forme.kind !== lexicon.KIND.TEXT;
}

function nettoyer(texte) {
    return String(texte || '').trim();
}

/**
 * Un emplacement à paramétrer : le texte exact à remplacer, la variable
 * proposée, et de quoi permettre à l'utilisateur de juger.
 */
function emplacement({ original, variable, libelle, ou, raison, mappe, confiance }) {
    return {
        original: nettoyer(original),
        variable,
        libelle: nettoyer(libelle) || null,
        ou,
        raison,
        mappe: mappe !== false,
        confiance
    };
}

// ── Paragraphes ──────────────────────────────────────────────────────────────

/**
 * « ARTICLE 3 : EMPLOI ET MISSIONS », « Annexe n°1 : Les Termes de Référence »,
 * un sommaire — un repère de structure suivi de son intitulé, jamais une
 * donnée à paramétrer, même si la forme ressemble à « Nom : KOUAME Awa ». Un
 * contrat réel en est plein (sommaire, titres d'articles) : sans cette
 * exclusion, chaque titre devenait un emplacement à remplir, et le gabarit
 * perdait sa propre table des matières au premier remplissage.
 */
const RE_REPERE_STRUCTURE = /^(article|annexe|chapitre|section|titre|paragraphe)\s*[°n]*\s*\d/i;

/**
 * « Nom : KOUAME Awa » — structure de formulaire sans ambiguïté : ce qui suit
 * les deux-points est une donnée, quel que soit le libellé.
 */
function analyserParagraphe(texte, nature, ou) {
    const trouves = [];
    const inline = texte.match(/^(.{2,45}?)\s*[:：]\s*(.+)$/);

    if (inline) {
        const libelle = inline[1].trim();
        const valeur = inline[2].trim();
        const entree = RE_REPERE_STRUCTURE.test(libelle) ? null : lexicon.lookup(libelle, nature);
        const provisoire = !entree && !RE_REPERE_STRUCTURE.test(libelle) && lexicon.looksLikeRubric(libelle) ? lexicon.slugify(libelle) : null;

        if ((entree || provisoire) && valeur && !lexicon.isTitleOnly(valeur)) {
            trouves.push(emplacement({
                original: valeur,
                variable: entree ? entree.variable : provisoire,
                libelle, ou,
                raison: 'libellé suivi de deux-points',
                mappe: !!entree,
                confiance: entree ? 0.9 : 0.7
            }));
            return trouves;
        }
    }

    // Texte rédigé : les données sont noyées dans la phrase.
    if (nature === 'prose') {
        for (const span of prosePatterns.findSpans(texte)) {
            trouves.push(emplacement({
                original: span.sample,
                variable: span.variable,
                libelle: null, ou,
                raison: 'tournure reconnue',
                confiance: span.confidence
            }));
        }
    }
    return trouves;
}

// ── Tableaux ─────────────────────────────────────────────────────────────────

/**
 * Une ligne de tableau porte son intitulé à gauche et ses valeurs à droite.
 * Les en-têtes de colonnes, quand ils existent, précisent la nature de chaque
 * valeur (base, taux, montant) et le côté (salarial ou patronal).
 */
function analyserTableau(table, nature, ou) {
    const trouves = [];
    const parLigne = new Map();
    for (const cell of table.cells) {
        if (!parLigne.has(cell.r)) parLigne.set(cell.r, []);
        parLigne.get(cell.r).push(cell);
    }

    // En-tête : première ligne sans aucune donnée chiffrée.
    const lignes = [...parLigne.keys()].sort((a, b) => a - b);
    const roles = new Map();
    let premiereLigneDonnees = 0;

    // Une ligne n'est un EN-TÊTE que si elle DÉCLARE des colonnes. Sans cette
    // exigence, « Nom | KOUAME Awa » — deux textes, aucun chiffre — passait pour
    // un en-tête et l'identité du salarié disparaissait de l'analyse.
    const roleColonne = (t) => {
        if (/^designation|^libelle|^rubrique|^intitule/.test(t)) return 'label';
        if (/^base|^assiette/.test(t)) return 'base';
        if (/^taux|^%/.test(t)) return 'taux';
        if (/^montant|^somme|^gain|^retenue/.test(t)) return '';
        if (/^nombre|^quantite|^qte|^jours|^heures/.test(t)) return 'nombre';
        return null;
    };

    for (const r of lignes.slice(0, 2)) {
        const cellules = parLigne.get(r).filter(c => nettoyer(c.texte));
        if (cellules.length < 2 || cellules.some(c => estDonnee(c.texte))) break;

        const declarations = cellules.map(c => {
            const t = lexicon.normalizeLabel(c.texte);
            return {
                cell: c,
                cote: /patronal|employeur/.test(t) ? 'patronal' : /salarial|salarie/.test(t) ? 'salarial' : null,
                genre: roleColonne(t)
            };
        });
        // Au moins deux colonnes nommées, ou un regroupement salarial/patronal.
        const nommees = declarations.filter(d => d.genre !== null || d.cote).length;
        if (nommees < 2) break;

        for (const d of declarations) {
            for (let c = d.cell.c; c < d.cell.c + (d.cell.colSpan || 1); c++) {
                const actuel = roles.get(c) || {};
                roles.set(c, {
                    cote: d.cote || actuel.cote,
                    genre: d.genre !== null ? d.genre : actuel.genre
                });
            }
        }
        premiereLigneDonnees = r + 1;
    }

    for (const r of lignes) {
        if (r < premiereLigneDonnees) continue;
        const cellules = parLigne.get(r).sort((a, b) => a.c - b.c);
        const intitule = cellules.find(c => nettoyer(c.texte) && !estDonnee(c.texte));
        if (!intitule) continue;

        const entree = lexicon.lookup(intitule.texte, nature);
        const provisoire = !entree && lexicon.looksLikeRubric(intitule.texte)
            ? lexicon.slugify(intitule.texte) : null;
        if (!entree && !provisoire) continue;

        // Quand le lexique annonce un TEXTE ou un CODE — « Nom », « Emploi »,
        // « Matricule » — la valeur n'a aucune raison d'être chiffrée. N'accepter
        // que du numérique laissait toute l'identité du salarié en texte figé.
        const attendText = entree &&
            (entree.kind === lexicon.KIND.TEXT || entree.kind === lexicon.KIND.CODE);

        for (const cell of cellules) {
            if (cell === intitule) continue;
            const texte = nettoyer(cell.texte);
            if (!texte || lexicon.isTitleOnly(texte)) continue;
            const acceptable = estDonnee(texte) ||
                (attendText && texte.length >= 2 && texte.length <= 80);
            if (!acceptable) continue;
            // Une formule Excel se recalcule seule : la remplacer casserait le
            // classeur au lieu de le paramétrer.
            if (cell.formule) continue;

            const forme = rules.classifyValue(texte);
            // Un taux de cotisation est une constante réglementaire, pas une
            // donnée du salarié.
            if (forme && forme.kind === lexicon.KIND.RATE) continue;

            const role = roles.get(cell.c) || {};
            let variable = entree ? entree.variable : provisoire;
            if (entree && entree.sides && role.cote && entree.sides[role.cote]) {
                variable = entree.sides[role.cote];
            }
            if (role.genre === 'base') variable += '_base';

            trouves.push(emplacement({
                original: texte,
                variable,
                libelle: intitule.texte,
                ou: cell.adresse ? `${ou} · ${cell.adresse}` : `${ou} · ligne ${r + 1}`,
                raison: 'ligne de tableau',
                mappe: !!entree,
                confiance: entree ? 0.9 : 0.7
            }));
        }
    }
    return trouves;
}

// ── Analyse complète ─────────────────────────────────────────────────────────

/**
 * @param {object} extrait  sortie de extraireOffice()
 * @param {string} codeType type de document choisi dans les paramètres
 * @returns {{ emplacements, variables, completude, nature, resume }}
 */
function analyserModele(extrait, codeType) {
    const type = typeDocument(codeType);
    const nature = type.nature === 'auto'
        ? (extrait.elements.some(e => e.type === 'tableau') ? 'grid' : 'prose')
        : type.nature;

    const emplacements = [];
    const parties = extrait.parties || [{ role: 'corps', elements: extrait.elements }];

    for (const partie of parties) {
        const ou = partie.feuille || partie.nom || partie.role || 'corps';
        for (const element of partie.elements || []) {
            if (element.type === 'paragraphe') {
                emplacements.push(...analyserParagraphe(element.texte, nature, ou));
            } else if (element.type === 'tableau') {
                emplacements.push(...analyserTableau(element, nature, element.feuille || ou));
            }
        }
    }

    // Un même texte ne peut désigner qu'une seule variable : à doublon, la
    // proposition la plus sûre l'emporte. Mais on conserve TOUTES ses
    // occurrences : un montant répété — le net en chiffres puis en toutes
    // lettres — doit être remplacé partout, pas seulement au premier endroit.
    const parOriginal = new Map();
    for (const e of emplacements) {
        if (!e.original || !e.variable) continue;
        const existant = parOriginal.get(e.original);
        if (!existant) {
            parOriginal.set(e.original, { ...e, occurrences: [e.ou] });
        } else {
            if (!existant.occurrences.includes(e.ou)) existant.occurrences.push(e.ou);
            if (e.confiance > existant.confiance) {
                existant.variable = e.variable;
                existant.libelle = e.libelle;
                existant.raison = e.raison;
                existant.mappe = e.mappe;
                existant.confiance = e.confiance;
            }
        }
    }
    const retenus = [...parOriginal.values()];

    const variables = [...new Set(retenus.map(e => e.variable))].sort();
    const completude = controlerCompletude(codeType, variables);

    return {
        nature,
        typeDocument: { code: codeType, ...type },
        emplacements: retenus,
        variables,
        completude,
        resume: {
            elements: extrait.elements.length,
            emplacements: retenus.length,
            rattaches: retenus.filter(e => e.mappe).length,
            provisoires: retenus.filter(e => !e.mappe).length
        }
    };
}

module.exports = { analyserModele, analyserParagraphe, analyserTableau };
