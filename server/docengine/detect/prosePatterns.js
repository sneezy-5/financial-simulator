// ═══════════════════════════════════════════════════════
// MOTIFS CONTEXTUELS POUR LES DOCUMENTS RÉDIGÉS
//
// Dans un contrat ou une attestation, les données ne sont pas dans des cases :
// elles sont noyées dans les phrases (« à compter du 01/09/2026 », « de 485 000
// FCFA »). Une détection par bloc entier n'y voit rien.
//
// La formulation juridique est en revanche très stéréotypée : « représentée par
// X, en qualité de Y », « Fait à L, le D ». Ces tournures sont d'excellentes
// ancres, bien plus précises qu'un modèle de langage.
//
// Chaque motif capture la VALEUR dans un groupe nommé, jamais la tournure
// elle-même : le texte fixe doit rester intact.
// ═══════════════════════════════════════════════════════

const D = String.raw`\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}`;
const MOIS = String.raw`janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre`;
const DATE = String.raw`(?:${D}|\d{1,2}(?:er)?\s+(?:${MOIS})\s+\d{4})`;
// Enveloppé dans un groupe non capturant : sans cela, un suffixe ajouté après
// l'interpolation ne s'appliquerait qu'à la seconde alternative.
const MONTANT = String.raw`(?:\d{1,3}(?:[  .]\d{3})+(?:[.,]\d{1,2})?|\d{4,}(?:[.,]\d{1,2})?)`;
/**
 * Un nom propre : chaque mot commence par une capitale.
 *
 * ATTENTION : les motifs qui l'emploient ne doivent PAS porter le drapeau « i ».
 * Insensible à la casse, [A-ZÀ-Þ] accepte aussi les minuscules et le nom déborde
 * sur la suite de la phrase : « TRAORE Fatoumata a été » était capturé en entier,
 * si bien que la substitution supprimait « a été » du certificat.
 */
const NOM = String.raw`(?:M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle)?\s*[A-ZÀ-Þ][\wÀ-ÿ'’\-]*(?:\s+[A-ZÀ-Þ][\wÀ-ÿ'’\-]*){0,3}`;

/**
 * L'ordre compte : les motifs les plus spécifiques passent en premier, et une
 * portion de texte déjà capturée n'est plus proposée aux suivants. Sans cela,
 * « représentée par M. DIALLO » serait aussi capté par le motif générique de nom.
 */
const PATTERNS = [
    {
        variable: ['signataireNom', 'signatairePoste'],
        // « en qualité de » est courant mais pas systématique : « représentée par
        // M. X, Directeur ; » est tout aussi valide, et sans ce motif plus large
        // le nom du signataire tombait dans le motif générique de nom propre —
        // où il se faisait prendre pour celui du salarié.
        re: new RegExp(String.raw`([Rr]eprésentée?\s+par\s+)(${NOM})(\s*,\s*(?:agissant\s+)?(?:en\s+qualité\s+de\s+)?)([^,.;]{3,50})`, 'g'),
        groups: [2, 4]
    },
    {
        variable: ['signataireNom', 'signatairePoste'],
        // Le signataire n'est identifié comme tel que si la mention de l'entreprise
        // suit : « Je soussigné X, Y de la société Z ». Sans cette ancre, une
        // demande de congés — « Je soussigné, Monsieur YAO, Technicien de
        // maintenance » — voyait le DEMANDEUR pris pour un signataire employeur,
        // et sa qualité tronquée à « Technicien ».
        re: new RegExp(String.raw`((?:[Jj]e\s+soussigné\(?e?\)?|[Ll]e\s+soussigné|[Nn]ous\s+soussignés?)\s*,?\s*)(${NOM})(\s*,\s*)([^,.;]{3,60})(?=\s*,?\s*de\s+(?:la\s+)?(?:société|entreprise|l'entreprise|l'établissement))`, 'g'),
        groups: [2, 4]
    },
    {
        variable: ['lieu', 'dateDoc'],
        re: new RegExp(String.raw`(fait\s+à\s+)([^,]{2,40})(\s*,\s*le\s+)(${DATE})`, 'gi'),
        groups: [2, 4]
    },
    {
        variable: 'dateEntree',
        re: new RegExp(String.raw`((?:à\s+compter\s+du|à\s+partir\s+du|depuis\s+le|embauché\(?e?\)?\s+le|prend\s+effet\s+le)\s+)(${DATE})`, 'gi'),
        groups: [2]
    },
    {
        variable: 'dateFinContrat',
        // Placé avant le motif générique « le <date> » : sans cela, la date de
        // fin d'un CDD était prise pour la date du document.
        re: new RegExp(String.raw`((?:jusqu['’]au|prend\s+fin\s+le|prendra\s+fin\s+le|expire\s+le|au\s+terme\s+(?:du\s+contrat\s+)?le|\u00e0\s+la\s+date\s+du)\s+)(${DATE})`, 'gi'),
        groups: [2]
    },
    {
        variable: 'poste',
        re: new RegExp(String.raw`(en\s+qualité\s+de\s+)([^,.;]{3,50})`, 'gi'),
        groups: [2]
    },
    {
        variable: 'salaireAff',
        // Seul le nombre est capturé : la devise (« FCFA ») est une mention fixe
        // du document, elle doit rester telle quelle dans le gabarit.
        re: new RegExp(String.raw`((?:rémunération|salaire|somme|montant)[^.;]{0,60}?\bde\s+)(${MONTANT})`, 'gi'),
        groups: [2]
    },
    {
        variable: 'entreprise',
        re: new RegExp(String.raw`((?:[Ll]a\s+)?[Ss]ociété\s+)(${NOM}(?:\s+(?:SARL|SA|SAS|SUARL|GIE|EURL))?)`, 'g'),
        groups: [2]
    },
    {
        variable: 'nomComplet',
        re: new RegExp(String.raw`((?:[Ee]t\s+)?(?:Monsieur|Madame|Mademoiselle|M\.|Mme|Mlle)\s+)(${NOM})`, 'g'),
        groups: [2]
    },
    {
        variable: 'dateDoc',
        re: new RegExp(String.raw`(\ble\s+)(${DATE})`, 'gi'),
        groups: [2]
    }
];

/**
 * Trouve les portions à remplacer dans un texte.
 *
 * @returns {Array<{start, end, sample, variable, confidence}>} spans disjoints,
 *          triés par position.
 */
function findSpans(text) {
    const spans = [];
    const taken = [];   // intervalles déjà attribués

    const overlaps = (a, b) => taken.some(t => a < t.end && b > t.start);

    for (const pattern of PATTERNS) {
        pattern.re.lastIndex = 0;
        let m;
        while ((m = pattern.re.exec(text)) !== null) {
            // Position de chaque groupe capturé, calculée en recomposant le match
            let cursor = m.index;
            const positions = [];
            for (let g = 1; g < m.length; g++) {
                const part = m[g];
                if (part == null) { positions.push(null); continue; }
                const at = text.indexOf(part, cursor);
                positions.push(at);
                if (at >= 0) cursor = at + part.length;
            }

            const variables = Array.isArray(pattern.variable) ? pattern.variable : [pattern.variable];
            pattern.groups.forEach((groupIndex, i) => {
                const value = m[groupIndex];
                const start = positions[groupIndex - 1];
                if (!value || start == null || start < 0) return;
                const end = start + value.length;
                if (overlaps(start, end)) return;
                taken.push({ start, end });
                spans.push({
                    start, end,
                    sample: value.trim(),
                    variable: variables[i] || variables[0],
                    confidence: 0.8
                });
            });

            // Évite une boucle infinie sur un motif de largeur nulle
            if (m.index === pattern.re.lastIndex) pattern.re.lastIndex++;
        }
    }

    return spans.sort((a, b) => a.start - b.start);
}

module.exports = { findSpans, PATTERNS };
