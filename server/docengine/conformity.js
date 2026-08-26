// ═══════════════════════════════════════════════════════
// CONTRÔLE DE CONFORMITÉ
//
// Le moteur déterministe produit un gabarit reproductible, mais rien ne
// garantissait qu'il soit FIDÈLE : une colonne mal alignée, un filet manquant ou
// une variable posée au mauvais endroit passaient inaperçus jusqu'à ce qu'un
// bulletin sorte à l'impression.
//
// Ce module ferme la boucle. On rend le gabarit produit, on le place à côté du
// document d'origine, et on demande au modèle de relever les écarts.
//
// PRINCIPE : l'IA CONSTATE, elle ne corrige pas. Elle n'a aucun accès au gabarit
// et ne peut donc rien y réécrire — son verdict est un rapport rendu à
// l'utilisateur, pas une modification silencieuse. Le document reste le produit
// d'une chaîne déterministe ; on y ajoute seulement un regard.
// ═══════════════════════════════════════════════════════

const VERDICTS = ['identique', 'ecarts_mineurs', 'ecarts_majeurs', 'image_illisible'];

function buildPrompt(variables, unmapped) {
    const listeVariables = variables.length
        ? variables.map(v => `{${v}}`).join(', ')
        : '(aucune)';
    const listeNonRattachees = unmapped && unmapped.length
        ? unmapped.map(u => `{${u.variable}} (« ${u.label} »)`).join(', ')
        : '(aucune)';

    return `Tu contrôles la reproduction d'un document administratif.

IMAGE 1 : le document ORIGINAL fourni par le client.
IMAGE 2 : le gabarit reconstruit automatiquement, affiché avec ses variables
apparentes sous la forme {nom_de_variable}.

Un gabarit conforme reproduit la mise en page à l'identique — mêmes colonnes,
mêmes filets, mêmes fonds, mêmes graisses, mêmes alignements — et remplace par
une variable EXACTEMENT les valeurs propres au dossier, en laissant intacts les
intitulés, les mentions légales et les taux réglementaires.

Variables posées : ${listeVariables}
Variables sans donnée associée (elles s'afficheront vides) : ${listeNonRattachees}

Relève :
1. Les écarts de MISE EN PAGE entre les deux images.
2. Les valeurs de l'original qui auraient dû devenir des variables et sont restées figées.
3. Les textes fixes de l'original (intitulés, mentions) qui ont été remplacés par une
   variable à tort — c'est le défaut le plus grave, il efface une mention officielle.
4. Les variables dont le NOM ne correspond pas à ce que la ligne désigne
   (par exemple une charge patronale nommée comme une retenue salariale).

Réponds UNIQUEMENT en JSON :
{
  "verdict": "identique" | "ecarts_mineurs" | "ecarts_majeurs",
  "ecarts": [{"zone": "<où, en clair>", "probleme": "<ce qui diffère>", "gravite": "faible"|"moyenne"|"haute"}],
  "valeurs_oubliees": ["<texte de l'original qui devrait être une variable>"],
  "textes_effaces": ["<mention fixe remplacée à tort par une variable>"]
}

Sois précis et sobre : ne signale que ce que tu vois réellement sur les images.
Un rapport vide est une réponse valable si la reproduction est fidèle.

IMPÉRATIF : si l'une des deux images est vide, uniforme, illisible ou ne montre
pas un document, réponds exactement {"verdict":"image_illisible","ecarts":[],
"valeurs_oubliees":[],"textes_effaces":[]} et rien d'autre. N'invente jamais
d'écart à partir d'une image que tu ne peux pas lire : un rapport plausible tiré
d'une page blanche est pire que pas de rapport du tout, car il donne une fausse
assurance sur un document officiel.`;
}

function parseReport(raw) {
    let t = (raw || '').trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
        const parsed = JSON.parse(t.slice(a, b + 1));
        if (!parsed || typeof parsed !== 'object') return null;
        return {
            verdict: VERDICTS.includes(parsed.verdict) ? parsed.verdict : 'ecarts_mineurs',
            ecarts: Array.isArray(parsed.ecarts)
                ? parsed.ecarts
                    .filter(e => e && typeof e.probleme === 'string')
                    .slice(0, 20)
                    .map(e => ({
                        zone: String(e.zone || '').slice(0, 120),
                        probleme: String(e.probleme).slice(0, 300),
                        gravite: ['faible', 'moyenne', 'haute'].includes(e.gravite) ? e.gravite : 'moyenne'
                    }))
                : [],
            valeursOubliees: Array.isArray(parsed.valeurs_oubliees)
                ? parsed.valeurs_oubliees.filter(x => typeof x === 'string').slice(0, 20)
                : [],
            textesEfaces: Array.isArray(parsed.textes_effaces)
                ? parsed.textes_effaces.filter(x => typeof x === 'string').slice(0, 20)
                : []
        };
    } catch (e) {
        return null;
    }
}

/**
 * Compare le gabarit produit au document d'origine.
 *
 * @param {object} deps
 *   renderPng(html)  → data URL du rendu du gabarit
 *   askModel(prompt, images) → réponse texte du modèle
 * @param {object} input
 *   html, originalImage, variables, unmapped
 * @returns {object|null} rapport, ou null si le contrôle n'a pas pu être mené
 */
async function checkConformity({ renderPng, askModel }, { html, originalImage, variables = [], unmapped = [] }) {
    if (!originalImage || typeof askModel !== 'function' || typeof renderPng !== 'function') return null;

    let renderedImage;
    try {
        // Gabarit NON rempli : les variables restent apparentes, ce qui permet de
        // voir où elles ont été posées. Rempli, on ne saurait plus distinguer une
        // valeur substituée d'un texte resté figé.
        renderedImage = await renderPng(html);
    } catch (e) {
        return { verdict: 'indisponible', raison: `Rendu impossible : ${e.message}`, ecarts: [], valeursOubliees: [], textesEfaces: [] };
    }

    try {
        const raw = await askModel(buildPrompt(variables, unmapped), [originalImage, renderedImage]);
        const report = parseReport(raw);
        if (!report) {
            return { verdict: 'indisponible', raison: 'Réponse du modèle inexploitable.', ecarts: [], valeursOubliees: [], textesEfaces: [] };
        }
        if (report.verdict === 'image_illisible') {
            return {
                verdict: 'indisponible',
                raison: "L'image du document d'origine n'est pas exploitable : contrôle non concluant.",
                ecarts: [], valeursOubliees: [], textesEfaces: []
            };
        }
        return report;
    } catch (e) {
        // Le contrôle est un supplément : son échec ne doit jamais empêcher de
        // livrer le gabarit, qui reste valable sans lui.
        return { verdict: 'indisponible', raison: e.message, ecarts: [], valeursOubliees: [], textesEfaces: [] };
    }
}

module.exports = { checkConformity, buildPrompt, parseReport, VERDICTS };
