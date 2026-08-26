// ═══════════════════════════════════════════════════════
// SERVICE IA - OpenRouter (compatible avec tous les LLMs)
// ═══════════════════════════════════════════════════════

require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
const https = require('https');

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Appel à l'API OpenRouter
 * Le modèle est configurable dans .env sans toucher au code
 */
async function callOpenRouter(messages, options = {}) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    const appName = process.env.APP_NAME || 'ONDA Lite';

    if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
        throw new Error('Clé API OpenRouter non configurée. Ajoutez OPENROUTER_API_KEY dans server/.env');
    }

    const body = JSON.stringify({
        model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1024,
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'openrouter.ai',
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:5173',
                'X-Title': appName,
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        reject(new Error(parsed.error.message || 'Erreur OpenRouter'));
                    } else {
                        resolve(parsed.choices?.[0]?.message?.content || '');
                    }
                } catch (e) {
                    reject(new Error('Réponse invalide de OpenRouter'));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/**
 * Système de prompt pour le conseiller financier
 */
const SYSTEM_PROMPT = `Tu es l'Expert ONDA Lite, conseiller fiscal et financier pour les PME en Côte d'Ivoire.

TON ET STYLE :
- Style : Professionnel, direct, expert et concis.
- Évite le bavardage : Ne commence pas systématiquement par "Bonjour" ou "Salut". Entre directement dans le vif du sujet.
- Emojis : Utilise-les avec parcimonie (max 1 ou 2 par message pour souligner un point clé). Pas d'excès.
- Clarté : Explique les termes techniques brièvement. Privilégie les faits et les calculs précis.
- Variété : Change tes formules de réponse pour ne pas paraître robotique.

RÈGLES MÉTIER :
- Parle TOUJOURS en français.
- Donne des chiffres précis et des actions concrètes (ex: "Provisionnez X FCFA/mois").
- Si tu proposes une action, explique le gain immédiat.

FORMAT :
- Pas de longs paragraphes. Utilise des listes à puces si nécessaire.
- Termine par une recommandation stratégique unique ou 2-3 actions très courtes.

Tu connais parfaitement le Code Général des Impôts de Côte d'Ivoire 2024 :
- Régime Entreprenant TCE (CA ≤ 5M) : 2% commerce, 2.5% autres
- Régime Entreprenant TEE (CA 5M-50M) : 4% commerce, 5% autres (50% réduction avec CGA)
- RME Microentreprises (CA 50M-200M) : 6% du CA (libératoire de TVA et patente)
- RSI Réel Simplifié (CA 200M-500M) : IS sur bénéfice (25%/30%) + IMF min 3M FCFA`;

/**
 * Analyse financière complète d'une entreprise
 */
async function analyserEntreprise(donnees) {
    const { entreprise, resultats, projections } = donnees;

    const context = `
DONNÉES DE L'ENTREPRISE :
- Nom : ${entreprise.nom || 'Non renseigné'}
- Secteur : ${entreprise.secteur}
- CA annuel : ${formatFCFA(entreprise.ca)} FCFA
- Charges fixes annuelles : ${formatFCFA(entreprise.chargesFixes)} FCFA
- Charges variables annuelles : ${formatFCFA(entreprise.chargesVariables)} FCFA
- Nombre d'employés : ${entreprise.employes || 0}
- Adhérent CGA : ${entreprise.cga ? 'Oui' : 'Non'}

RÉSULTATS ACTUELS :
- Régime fiscal : ${resultats.regime.label}
- Impôt annuel : ${formatFCFA(resultats.impot)} FCFA
- Bénéfice net : ${formatFCFA(resultats.beneficeNet)} FCFA
- Marge nette : ${resultats.margeNette?.toFixed(1)}%
- Seuil de rentabilité : ${formatFCFA(resultats.seuilRentabilite)} FCFA
- Paiement mensuel DGI : ${formatFCFA(resultats.impot / 12)} FCFA

PROJECTIONS (scénario réaliste sur 3 ans) :
${projections?.map(p => `  - ${p.annee}: CA ${formatFCFA(p.ca)} → Impôt ${formatFCFA(p.impot)} → Bénéfice net ${formatFCFA(p.beneficeNet)} (Régime: ${p.regime})`).join('\n') || 'Non disponibles'}
`;

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Analyse cette situation financière et donne-moi tes conseils:\n${context}` }
    ];

    return await callOpenRouter(messages, { maxTokens: 1500 });
}

/**
 * Réponse à une question spécifique du chef d'entreprise
 */
async function repondreQuestion(question, contexteEntreprise) {
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
            role: 'user',
            content: `Contexte de mon entreprise: CA annuel ${formatFCFA(contexteEntreprise.ca)} FCFA, secteur ${contexteEntreprise.secteur}, régime ${contexteEntreprise.regime}.
            
Ma question: ${question}`
        }
    ];

    return await callOpenRouter(messages, { maxTokens: 800 });
}

function formatFCFA(val) {
    if (!val && val !== 0) return '?';
    return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Nettoie une réponse LLM : retire les clôtures markdown et tout préambule bavard.
 */
function stripCodeFence(text) {
    let out = (text || '').trim();
    const fence = out.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fence) out = fence[1];
    // Certains modèles préfixent une phrase avant le HTML : on repart du 1er tag
    const firstTag = out.search(/<(!doctype|html|div|section|table|style|body)/i);
    if (firstTag > 0) out = out.slice(firstTag);
    return out.trim();
}

/**
 * Un modèle vision peut refuser une image (contenu jugé sensible, garde-fou du
 * fournisseur...) et répondre par une phrase ordinaire au lieu du gabarit demandé.
 * Sans ce contrôle, cette phrase était acceptée telle quelle comme "le" modèle et
 * s'affichait ensuite à la place du bulletin reproduit.
 */
function looksLikeOndaTemplate(html) {
    return typeof html === 'string' && /<div\s+class=["']onda-page["']/i.test(html.slice(0, 400))
}

/**
 * Sérialise la couche texte extraite par pdf.js en "vérité terrain" pour le modèle.
 *
 * C'est le levier de fidélité le plus important : le modèle n'a plus à faire d'OCR
 * (source d'hallucinations sur les petits caractères), il n'a plus qu'à reproduire
 * une mise en page dont il connaît déjà les chaînes exactes et leurs coordonnées.
 */
function serializeTextLayer(textItems) {
    if (!Array.isArray(textItems) || !textItems.length) return null;
    return textItems
        .map(it => {
            const x = Math.round(it.x);
            const y = Math.round(it.y);
            const size = Math.round((it.fontSize || 0) * 10) / 10;
            const flags = [it.bold ? 'bold' : null, it.italic ? 'italic' : null].filter(Boolean).join(',');
            return `x=${x} y=${y} size=${size}${flags ? ' ' + flags : ''} | ${it.str}`;
        })
        .join('\n');
}

// ═══════════════════════════════════════════════════════
// PROFILS DE DOCUMENTS
//
// Deux natures de documents appellent deux stratégies de reproduction opposées :
//
//  - GRILLE (bulletin de paie, fiche de présence, tableau) : la structure est figée,
//    chaque montant a sa case. On reproduit en positionnement absolu au millimètre.
//
//  - RÉDIGÉ (contrat, attestation, lettre) : c'est de la prose. En absolu, la mise
//    en page exploserait dès qu'un nom substitué serait plus long que l'original.
//    On reproduit les marges, la typographie et les styles de paragraphe, et on
//    laisse le texte couler.
// ═══════════════════════════════════════════════════════

const LAYOUT_ABSOLUTE = `2. POSITIONNEMENT ABSOLU (ce document est une grille figée). Structure obligatoire :
   <div class="onda-page" style="position:relative;width:210mm;height:297mm;font-family:Helvetica,Arial,sans-serif;">
     ... éléments en position:absolute ...
   </div>
   Chaque bloc de texte, filet et cadre est un enfant en position:absolute avec left/top
   exprimés en mm. Convertis les coordonnées fournies (en points PDF, origine en haut à
   gauche) avec : mm = pt * 25.4 / 72.
   Les TABLEAUX de lignes restent des <table> en position:absolute (un tableau positionné,
   pas 200 divs) : c'est le seul cas où le flux normal est autorisé à l'intérieur.`;

const LAYOUT_FLOW = `2. FLUX NORMAL (ce document est un texte rédigé). Structure obligatoire :
   <div class="onda-page" style="width:210mm;min-height:297mm;padding:<marges réelles>;font-family:...;font-size:...;line-height:...;">
     ... <p>, <h1>, <table>, <ul> dans l'ordre de lecture ...
   </div>
   N'utilise PAS position:absolute pour le corps du texte : les valeurs substituées
   ({{nomComplet}}, {{poste}}...) sont plus longues ou plus courtes que celles de
   l'original, et un texte figé au millimètre se chevaucherait ou déborderait.
   Reproduis à la place, en les mesurant sur le document : les marges de page, la
   police, le corps, l'interligne, l'alignement (justifié ou non), les retraits de
   première ligne, les espacements entre paragraphes, la numérotation des articles.
   position:absolute reste réservé à l'en-tête, au pied de page, au logo et aux
   blocs de signature.
   Si le document fait plusieurs pages, produis plusieurs <div class="onda-page">.`;

const COMMON_RULES = `1. FIDÉLITÉ AVANT TOUT. Tu ne redessines pas, tu ne "modernises" pas, tu ne simplifies pas.
   Tu reproduis. Chaque trait, chaque encadré, chaque filet, chaque aplat de couleur,
   chaque alignement et chaque taille de police du document original doit se retrouver
   dans ton HTML. Si le document est laid, ton HTML doit être laid de la même façon.

{LAYOUT}

3. CSS INLINE UNIQUEMENT. Aucune classe utilitaire, aucun framework, aucun <link>,
   aucun <script>, aucune URL externe. Tout le style va dans des attributs style="".
   Le PDF est imprimé hors ligne : toute ressource distante donnerait une page nue.

4. COULEURS ET TRAITS. Lis les couleurs sur l'image et écris-les en hexadécimal exact
   (#1a3d6b, pas "bleu foncé"). Reproduis l'épaisseur des bordures (0.5pt, 1pt...),
   les fonds de cellules d'en-tête, les lignes de séparation.

5. TAILLES DE POLICE. Utilise les tailles réelles fournies dans la couche texte, en pt.
   N'uniformise pas. Si un titre fait 14pt et le corps 7.5pt, écris 14pt et 7.5pt.

6. LOGO / IMAGE. Ne tente pas de redessiner un logo. Réserve son emplacement exact avec :
   <div style="position:absolute;left:Xmm;top:Ymm;width:Wmm;height:Hmm;" data-onda-logo="1"></div>

7. SORTIE. Renvoie UNIQUEMENT le HTML, à partir de <div class="onda-page">.
   Pas de markdown, pas de commentaire, pas d'explication, pas de <html>/<head>/<body>.`;

const PAYSLIP_VARIABLES = `Identité / poste :
  {nom} {prenom} {matricule} {poste} {categorie} {date_embauche} {nom_entreprise}
Période :
  {mois} {annee} {date_jour}
Montants (déjà formatés par le système, à afficher tels quels) :
  {salaire_base} {brut} {netAPayer} {net_imposable}
  {sursalaire} {prime_anciennete} {prime_transport} {indemnite_logement} {heures_sup}
Retenues salariales :
  {salarial.its} {salarial.cn} {salarial.cnps} {salarial.total}
Charges patronales :
  {patronal.cnps} {patronal.prestations_familiales} {patronal.accident_travail} {patronal.total}`;

const HR_DOC_VARIABLES = `Salarié :
  {{nomComplet}} {{poste}} {{dateEntree}} {{salaireAff}}
Entreprise :
  {{entreprise}} {{adresse}}
Signataire :
  {{signataireNom}} {{signatairePoste}}
Lieu et date de rédaction :
  {{lieu}} {{dateDoc}}

Attention : ce sont des DOUBLES accolades. N'invente aucun autre nom de variable :
seuls ces noms-là sont remplis par le système.`;

const DOCUMENT_PROFILES = {
    payslip: {
        nature: "un bulletin de paie (document à structure de grille, montants en colonnes)",
        layout: LAYOUT_ABSOLUTE,
        variables: PAYSLIP_VARIABLES,
        freeFields: `Si une case du document ne correspond à aucune variable de cette liste mais doit
rester saisissable, utilise un placeholder explicite en crochets : [Date], [Lieu], [Signature].`
    },
    hr_document: {
        nature: "un document RH rédigé (contrat de travail, attestation, lettre, avenant, demande)",
        layout: LAYOUT_FLOW,
        variables: HR_DOC_VARIABLES,
        freeFields: `Pour toute mention propre à l'ancien dossier qui n'a pas de variable dédiée
(numéro de contrat, motif, durée d'essai, date de fin...), laisse un blanc à compléter
sous la forme ___________ , exactement comme le ferait un formulaire papier.`
    },
    form: {
        nature: "un formulaire ou une fiche à cases (fiche de présence, demande, bordereau)",
        layout: LAYOUT_ABSOLUTE,
        variables: HR_DOC_VARIABLES,
        freeFields: `Les cases destinées à être remplies à la main restent vides : reproduis leur
cadre et leurs dimensions, sans y mettre de texte.`
    }
};

function getProfile(docType) {
    return DOCUMENT_PROFILES[docType] || DOCUMENT_PROFILES.hr_document;
}

/**
 * Reconstruit le modèle du client en HTML fidèle à partir de son PDF ou de son scan.
 *
 * @param {string} imageBase64 rendu PNG haute résolution de la page 1 (data URL)
 * @param {Array}  textItems   couche texte pdf.js : {str, x, y, fontSize, bold, italic}
 * @param {object} pageSize    {width, height} de la page en points PDF
 * @param {string} docType     clé de DOCUMENT_PROFILES : payslip | hr_document | form
 */
async function rebuildDocumentTemplate(imageBase64, textItems = null, pageSize = null, docType = 'payslip') {
    const profile = getProfile(docType);
    const groundTruth = serializeTextLayer(textItems);
    const dims = pageSize
        ? `Dimensions de la page : ${Math.round(pageSize.width)} x ${Math.round(pageSize.height)} points PDF (origine en haut à gauche).`
        : `Dimensions de la page : A4 (595 x 842 points).`;

    const prompt = `Tu es un intégrateur HTML/CSS expert. Ta mission est un travail d'intégration
pixel-perfect : reproduire à l'identique la mise en page du document ci-joint, sous forme de
gabarit HTML réutilisable pour notre application RH interne. C'est un exercice d'intégration
logicielle standard.

Nature du document : ${profile.nature}.

${dims}

${groundTruth
    ? `COUCHE TEXTE EXACTE DU PDF (vérité terrain — n'invente aucun libellé, n'en omets aucun,
recopie ces chaînes caractère pour caractère ; les coordonnées sont en points, origine en
haut à gauche) :

${groundTruth}

L'image jointe te sert uniquement à lire ce que le texte ne dit pas : les traits, les cadres,
les couleurs, les fonds, les alignements et l'emplacement du logo.`
    : `Aucune couche texte n'a pu être extraite (document scanné) : lis le document sur l'image
jointe, et recopie les libellés avec le plus grand soin.`}

RÈGLES DE REPRODUCTION (impératives) :

${COMMON_RULES.replace('{LAYOUT}', profile.layout)}

VARIABLES À INSÉRER :

Remplace les valeurs propres à l'ancien salarié / à l'ancienne période par ces placeholders.
Tout le reste (libellés, intitulés de rubriques, articles, mentions légales, en-têtes de
colonnes, raison sociale imprimée en dur, numéros d'identification de l'employeur...) est du
texte FIXE que tu recopies mot pour mot.

${profile.variables}

${profile.freeFields}`;

    const messages = [
        {
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageBase64 } }
            ]
        }
    ];

    let responseText;
    try {
        // 16k tokens : à 4k, le HTML d'un document complet était tronqué en plein
        // milieu d'une balise — ce qui produisait un design cassé plutôt qu'infidèle.
        responseText = await callOpenRouter(messages, { maxTokens: 16000, temperature: 0 });
    } catch (e) {
        console.error("Erreur Vision OCR HTML:", e);
        throw new Error("La reconstruction du modèle a échoué.");
    }

    const html = stripCodeFence(responseText);
    if (!looksLikeOndaTemplate(html)) {
        console.error("Réponse IA inexploitable (pas de gabarit) :", html.slice(0, 300));
        throw new Error("La reconstruction n'a pas produit de modèle exploitable pour ce document. Réessayez, ou utilisez un PDF plus net.");
    }
    return html;
}

/**
 * Deuxième passe : on montre au modèle le rendu de son propre HTML à côté de l'original
 * et on lui demande de corriger les écarts. C'est cette boucle qui fait passer le résultat
 * de "ressemblant" à "identique" — un seul aller simple ne suffit jamais.
 *
 * @param {string} originalImage  PNG de la page originale (data URL)
 * @param {string} renderedImage  PNG du rendu du HTML courant (data URL)
 * @param {string} currentHtml    HTML produit à la passe précédente
 * @param {string} docType        clé de DOCUMENT_PROFILES
 */
async function refineDocumentTemplate(originalImage, renderedImage, currentHtml, docType = 'payslip') {
    const profile = getProfile(docType);
    const isFlow = profile.layout === LAYOUT_FLOW;

    const prompt = `Voici deux images :
  - IMAGE 1 : le document ORIGINAL à reproduire.
  - IMAGE 2 : le rendu du HTML actuel (ci-dessous).

Compare-les méthodiquement et corrige le HTML pour supprimer tous les écarts :
  - éléments manquants ou en trop ;
  - ${isFlow
        ? 'marges de page, interligne, espacement entre paragraphes, retraits, justification'
        : 'positions décalées (left/top en mm)'} ;
  - tailles de police, graisses, casse ;
  - traits, cadres, épaisseurs de bordure, couleurs de fond ;
  - alignements (les montants doivent être alignés à droite comme dans l'original) ;
  - largeurs de colonnes des tableaux ;
  - débordements hors de la page ou chevauchements.

Conserve TOUS les placeholders existants à l'identique, sans en renommer aucun.
Garde ${isFlow ? 'le flux normal pour le corps du texte' : 'le positionnement absolu'} et le
CSS inline, sans aucune ressource externe.

Renvoie UNIQUEMENT le HTML corrigé complet, sans markdown ni explication.

HTML ACTUEL :
${currentHtml}`;

    const messages = [
        {
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: originalImage } },
                { type: 'image_url', image_url: { url: renderedImage } }
            ]
        }
    ];

    const responseText = await callOpenRouter(messages, { maxTokens: 16000, temperature: 0 });
    const refined = stripCodeFence(responseText);
    // Garde-fou : une passe de raffinage qui rend un document quasi vide, ou qui
    // n'est plus un gabarit du tout (refus du modèle), est une régression, pas
    // une amélioration — on conserve alors la version précédente.
    if (refined.length < currentHtml.length * 0.5) return currentHtml;
    if (!looksLikeOndaTemplate(refined)) return currentHtml;
    return refined;
}

/**
   (#1a3d6b, pas "bleu foncé"). Reproduis l'épaisseur des bordures (0.5pt, 1pt...),
   les fonds de cellules d'en-tête, les lignes de séparation.

5. TAILLES DE POLICE. Utilise les tailles réelles fournies dans la couche texte, en pt.
   N'uniformise pas. Si un titre fait 14pt et le corps 7.5pt, écris 14pt et 7.5pt.

6. LOGO / IMAGE. Ne tente pas de redessiner un logo. Réserve son emplacement exact avec :
   <div style="position:absolute;left:Xmm;top:Ymm;width:Wmm;height:Hmm;" data-onda-logo="1"></div>

7. SORTIE. Renvoie UNIQUEMENT le HTML, à partir de <div class="onda-page">.
   Pas de markdown, pas de commentaire, pas d'explication, pas de <html>/<head>/<body>.`;

const PAYSLIP_VARIABLES = `Identité / poste :
  {nom} {prenom} {matricule} {poste} {categorie} {date_embauche} {nom_entreprise}
Période :
  {mois} {annee} {date_jour}
Montants (déjà formatés par le système, à afficher tels quels) :
  {salaire_base} {brut} {netAPayer} {net_imposable}
  {sursalaire} {prime_anciennete} {prime_transport} {indemnite_logement} {heures_sup}
Retenues salariales :
  {salarial.its} {salarial.cn} {salarial.cnps} {salarial.total}
Charges patronales :
  {patronal.cnps} {patronal.prestations_familiales} {patronal.accident_travail} {patronal.total}`;

const HR_DOC_VARIABLES = `Salarié :
  {{nomComplet}} {{poste}} {{dateEntree}} {{salaireAff}}
Entreprise :
  {{entreprise}} {{adresse}}
Signataire :
  {{signataireNom}} {{signatairePoste}}
Lieu et date de rédaction :
  {{lieu}} {{dateDoc}}

Attention : ce sont des DOUBLES accolades. N'invente aucun autre nom de variable :
seuls ces noms-là sont remplis par le système.`;

const DOCUMENT_PROFILES = {
    payslip: {
        nature: "un bulletin de paie (document à structure de grille, montants en colonnes)",
        layout: LAYOUT_ABSOLUTE,
        variables: PAYSLIP_VARIABLES,
        freeFields: `Si une case du document ne correspond à aucune variable de cette liste mais doit
rester saisissable, utilise un placeholder explicite en crochets : [Date], [Lieu], [Signature].`
    },
    hr_document: {
        nature: "un document RH rédigé (contrat de travail, attestation, lettre, avenant, demande)",
        layout: LAYOUT_FLOW,
        variables: HR_DOC_VARIABLES,
        freeFields: `Pour toute mention propre à l'ancien dossier qui n'a pas de variable dédiée
(numéro de contrat, motif, durée d'essai, date de fin...), laisse un blanc à compléter
sous la forme ___________ , exactement comme le ferait un formulaire papier.`
    },
    form: {
        nature: "un formulaire ou une fiche à cases (fiche de présence, demande, bordereau)",
        layout: LAYOUT_ABSOLUTE,
        variables: HR_DOC_VARIABLES,
        freeFields: `Les cases destinées à être remplies à la main restent vides : reproduis leur
cadre et leurs dimensions, sans y mettre de texte.`
    }
};

function getProfile(docType) {
    return DOCUMENT_PROFILES[docType] || DOCUMENT_PROFILES.hr_document;
}

/**
 * Reconstruit le modèle du client en HTML fidèle à partir de son PDF ou de son scan.
 *
 * @param {string} imageBase64 rendu PNG haute résolution de la page 1 (data URL)
 * @param {Array}  textItems   couche texte pdf.js : {str, x, y, fontSize, bold, italic}
 * @param {object} pageSize    {width, height} de la page en points PDF
 * @param {string} docType     clé de DOCUMENT_PROFILES : payslip | hr_document | form
 */
async function rebuildDocumentTemplate(imageBase64, textItems = null, pageSize = null, docType = 'payslip') {
    const profile = getProfile(docType);
    const groundTruth = serializeTextLayer(textItems);
    const dims = pageSize
        ? `Dimensions de la page : ${Math.round(pageSize.width)} x ${Math.round(pageSize.height)} points PDF (origine en haut à gauche).`
        : `Dimensions de la page : A4 (595 x 842 points).`;

    const prompt = `Tu es un intégrateur HTML/CSS expert. Ta mission est un travail d'intégration
pixel-perfect : reproduire à l'identique la mise en page du document ci-joint, sous forme de
gabarit HTML réutilisable pour notre application RH interne. C'est un exercice d'intégration
logicielle standard.

Nature du document : ${profile.nature}.

${dims}

${groundTruth
    ? `COUCHE TEXTE EXACTE DU PDF (vérité terrain — n'invente aucun libellé, n'en omets aucun,
recopie ces chaînes caractère pour caractère ; les coordonnées sont en points, origine en
haut à gauche) :

${groundTruth}

L'image jointe te sert uniquement à lire ce que le texte ne dit pas : les traits, les cadres,
les couleurs, les fonds, les alignements et l'emplacement du logo.`
    : `Aucune couche texte n'a pu être extraite (document scanné) : lis le document sur l'image
jointe, et recopie les libellés avec le plus grand soin.`}

RÈGLES DE REPRODUCTION (impératives) :

${COMMON_RULES.replace('{LAYOUT}', profile.layout)}

VARIABLES À INSÉRER :

Remplace les valeurs propres à l'ancien salarié / à l'ancienne période par ces placeholders.
Tout le reste (libellés, intitulés de rubriques, articles, mentions légales, en-têtes de
colonnes, raison sociale imprimée en dur, numéros d'identification de l'employeur...) est du
texte FIXE que tu recopies mot pour mot.

${profile.variables}

${profile.freeFields}`;

    const messages = [
        {
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageBase64 } }
            ]
        }
    ];

    let responseText;
    try {
        // 16k tokens : à 4k, le HTML d'un document complet était tronqué en plein
        // milieu d'une balise — ce qui produisait un design cassé plutôt qu'infidèle.
        responseText = await callOpenRouter(messages, { maxTokens: 16000, temperature: 0 });
    } catch (e) {
        console.error("Erreur Vision OCR HTML:", e);
        throw new Error("La reconstruction du modèle a échoué.");
    }

    const html = stripCodeFence(responseText);
    if (!looksLikeOndaTemplate(html)) {
        console.error("Réponse IA inexploitable (pas de gabarit) :", html.slice(0, 300));
        throw new Error("La reconstruction n'a pas produit de modèle exploitable pour ce document. Réessayez, ou utilisez un PDF plus net.");
    }
    return html;
}

/**
 * Deuxième passe : on montre au modèle le rendu de son propre HTML à côté de l'original
 * et on lui demande de corriger les écarts. C'est cette boucle qui fait passer le résultat
 * de "ressemblant" à "identique" — un seul aller simple ne suffit jamais.
 *
 * @param {string} originalImage  PNG de la page originale (data URL)
 * @param {string} renderedImage  PNG du rendu du HTML courant (data URL)
 * @param {string} currentHtml    HTML produit à la passe précédente
 * @param {string} docType        clé de DOCUMENT_PROFILES
 */
async function refineDocumentTemplate(originalImage, renderedImage, currentHtml, docType = 'payslip') {
    const profile = getProfile(docType);
    const isFlow = profile.layout === LAYOUT_FLOW;

    const prompt = `Voici deux images :
  - IMAGE 1 : le document ORIGINAL à reproduire.
  - IMAGE 2 : le rendu du HTML actuel (ci-dessous).

Compare-les méthodiquement et corrige le HTML pour supprimer tous les écarts :
  - éléments manquants ou en trop ;
  - ${isFlow
        ? 'marges de page, interligne, espacement entre paragraphes, retraits, justification'
        : 'positions décalées (left/top en mm)'} ;
  - tailles de police, graisses, casse ;
  - traits, cadres, épaisseurs de bordure, couleurs de fond ;
  - alignements (les montants doivent être alignés à droite comme dans l'original) ;
  - largeurs de colonnes des tableaux ;
  - débordements hors de la page ou chevauchements.

Conserve TOUS les placeholders existants à l'identique, sans en renommer aucun.
Garde ${isFlow ? 'le flux normal pour le corps du texte' : 'le positionnement absolu'} et le
CSS inline, sans aucune ressource externe.

Renvoie UNIQUEMENT le HTML corrigé complet, sans markdown ni explication.

HTML ACTUEL :
${currentHtml}`;

    const messages = [
        {
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: originalImage } },
                { type: 'image_url', image_url: { url: renderedImage } }
            ]
        }
    ];

    const responseText = await callOpenRouter(messages, { maxTokens: 16000, temperature: 0 });
    const refined = stripCodeFence(responseText);
    // Garde-fou : une passe de raffinage qui rend un document quasi vide, ou qui
    // n'est plus un gabarit du tout (refus du modèle), est une régression, pas
    // une amélioration — on conserve alors la version précédente.
    if (refined.length < currentHtml.length * 0.5) return currentHtml;
    if (!looksLikeOndaTemplate(refined)) return currentHtml;
    return refined;
}

/**
 * Suggère un mapping entre les en-têtes réelles d'un fichier Excel "maison" et les champs
 * standards ONDA (nom, salaire_base, etc.), pour compléter/améliorer le mapping par mots-clés
 * déjà calculé côté frontend. Ne doit jamais faire planter l'import si l'IA se trompe ou échoue :
 * l'appelant filtre déjà les résultats non exploitables.
 */
async function suggestColumnMapping(headers, fields) {
    const fieldsDesc = fields.map(f => `- ${f.key}: ${f.label}`).join('\n');
    const headersDesc = headers.map(h => `- "${h}"`).join('\n');

    const prompt = `Voici les colonnes réelles d'un fichier Excel RH fourni par une entreprise :
${headersDesc}

Voici les champs standards que je dois retrouver :
${fieldsDesc}

Pour chaque champ standard, indique quelle colonne du fichier (parmi la liste ci-dessus, valeur EXACTE et complète, avec la même casse) lui correspond le mieux, ou null si aucune ne correspond clairement.
Réponds UNIQUEMENT en JSON strict, sans texte autour, format : {"cle_du_champ": "en-tête exacte ou null", ...}`;

    const messages = [{ role: 'user', content: prompt }];
    const responseText = await callOpenRouter(messages, { maxTokens: 500, temperature: 0.1 });

    let cleaned = responseText.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);

    const rawMapping = JSON.parse(cleaned.trim());

    // Anti-hallucination : on ne garde que les valeurs qui existent mot pour mot dans les en-têtes réelles
    const validated = {};
    for (const [key, value] of Object.entries(rawMapping)) {
        if (value && headers.includes(value)) {
            validated[key] = value;
        }
    }
    return validated;
}

/**
 * Analyse le texte brut d'un document DOCX (modèle rempli) et demande à l'IA 
 * d'identifier les valeurs réelles et de les faire correspondre aux variables de paie.
 */
async function autoTagDocxTemplate(docxText, variablesList) {
    const prompt = `Voici le texte brut extrait d'un document RH (soit rempli avec des exemples, soit vierge avec des tirets/parenthèses) :
---
${docxText.substring(0, 4000)}
---

Voici la liste des variables disponibles :
${variablesList.join(', ')}

Ta mission : Trouve les données (ex: "Dupont", "1 500 000") OU les zones à remplir (ex: "………", "(Nom et Prénoms)", "___") dans le texte et dis-moi par quelle variable il faut les remplacer.
IMPORTANT : 
1. Retourne UNIQUEMENT les paires où la donnée d'origine ("original") est littéralement présente dans le texte (lettre pour lettre).
2. Ne mappe PAS les libellés statiques (ex: dans "Nom : Dupont", mappe "Dupont" mais pas "Nom :"). 
3. SI le document est vierge, mappe les pointillés ou les indications (ex: "……………" ou "(date et lieu)").
4. Réponds UNIQUEMENT par un tableau JSON strict, sans bloc de code markdown. 

Format attendu :
[
  {"original": "Dupont", "variable": "salarie_nom"},
  {"original": "(Nom et Prénoms)", "variable": "salarie_nom"},
  {"original": "………", "variable": "salaire_base"}
]`;

    const messages = [{ role: 'user', content: prompt }];
    const responseText = await callOpenRouter(messages, { maxTokens: 1000, temperature: 0.1 });

    let cleaned = responseText.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);

    try {
        const parsed = JSON.parse(cleaned.trim());
        if (Array.isArray(parsed)) return parsed;
        return [];
    } catch (e) {
        console.error("Erreur de parsing de l'auto-tagging DOCX:", e, cleaned);
        return [];
    }
}

/**
 * Concepteur du modèle de bulletin « Sur-mesure » par conversation : plutôt
 * que de glisser-déposer des blocs à la main (jugé trop pénible), l'utilisateur
 * décrit ce qu'il veut et l'IA produit directement la disposition —
 * exactement le même format JSON (bulletinCanvasLayout) que payrollService.js
 * (generatePdfDefinitionSurMesure) imprime déjà via absolutePosition, pour
 * qu'un aperçu généré ici soit strictement identique au bulletin final.
 *
 * @param {Array}  messages       historique de conversation [{role, content}]
 * @param {Array}  currentLayout  disposition en cours (pour ITÉRER dessus, pas repartir de zéro à chaque message)
 * @param {Array}  champs         catalogue des champs disponibles pour un bloc texte (CANVAS_CHAMPS_DISPONIBLES)
 * @param {object} page           dimensions de page en points {width, height}
 * @param {string} image          photo/scan d'un bulletin réel à reproduire, en data URL (optionnelle — jointe au DERNIER message utilisateur uniquement, jamais réinjectée aux tours suivants)
 */
async function genererBulletinCanvasIA(messages, currentLayout, champs, page, image = null) {
    const champsTexte = (champs || []).map(c => `- ${c.cle} (${c.groupe}) : ${c.libelle}`).join('\n');

    const systemPrompt = `Tu conçois la mise en page d'un bulletin de paie ivoirien pour l'utilisateur, à partir de ses instructions en français — et, quand une image est jointe à son dernier message, à partir d'une PHOTO d'un vrai bulletin à reproduire.

Si une image est jointe : c'est la référence de vérité. Reproduis-la le plus fidèlement possible avec les blocs disponibles — position et taille de chaque zone de texte, couleurs des bandeaux/encarts, alignements, ce qui est en gras — plutôt que de composer un bulletin générique. Recopie les libellés visibles mot pour mot dans les blocs "text" en texte libre (champ=null) quand ils ne correspondent à aucun champ dynamique de la liste ci-dessous (mentions légales, en-têtes de colonnes propres à ce bulletin...), et utilise un "champ" dynamique dès qu'un texte de la photo correspond clairement à une des données ci-dessous (nom du salarié, matricule, etc.) pour qu'il se mette à jour avec le vrai salarié. Le tableau des rubriques (bloc "table") reproduit l'agencement de colonnes vu sur la photo (avec ou sans charges patronales) mais ses montants restent calculés automatiquement — n'essaie pas de recopier les montants de la photo.

Tu ne réponds JAMAIS en prose libre : ta réponse est TOUJOURS un unique objet JSON strict, sans clôture markdown, de la forme :
{"message": "<1-2 phrases en français expliquant ce que tu as fait ou changé>", "layout": [ <blocs> ]}

Page : ${page.width.toFixed(2)} x ${page.height.toFixed(2)} points PDF (A4 portrait), origine (0,0) en haut à gauche. Toutes les coordonnées et tailles sont en points, jamais en pixels ni en %.

Chaque bloc de "layout" est un objet avec un "id" (chaîne unique, garde le même id d'un tour à l'autre pour un bloc que tu modifies sans le recréer), un "type" parmi :

- "logo" : {id,type,x,y,w,h} — le logo de l'entreprise (image), pas de propriété de style.
- "text" : {id,type,x,y,w,h,champ,texte,fontSize,bold,italics,color,align} — "champ" est soit null (alors "texte" est affiché tel quel, du texte libre), soit une des clés ci-dessous (alors la vraie valeur du salarié/de l'entreprise est injectée à l'impression, "texte" est ignoré) : "align" ∈ left|center|right, "color" en hex.
- "table" : {id,type,x,y,w,h,headerColor,showPatronal,fontSize} — LE tableau des rubriques (gains/retenues, calculé automatiquement) ; un SEUL bloc "table" par disposition ; showPatronal (bool) affiche 2 colonnes patronales en plus.
- "netBox" : {id,type,x,y,w,h,backgroundColor,textColor,fontSize} — encart « Net à payer » en évidence.
- "line" : {id,type,x,y,w,h,color,thickness} — trait horizontal de longueur w.
- "rect" : {id,type,x,y,w,h,backgroundColor,borderColor} — rectangle plein, pour un fond décoratif.
- "watermark" : {id,type,x,y,w,h,texte,color,fontSize,angle} — filigrane en fond de page (texte pivoté).

Champs disponibles pour "champ" d'un bloc "text" :
${champsTexte}

RÈGLES :
- Ne fais JAMAIS déborder un bloc de la page (x+w ≤ ${page.width.toFixed(0)}, y+h ≤ ${page.height.toFixed(0)}).
- Le bloc "table" doit rester assez large pour 6 colonnes lisibles (largeur ≥ 350) ou 8 si showPatronal.
- Si l'utilisateur ne demande qu'un ajustement (couleur, position, taille d'un bloc précis), modifie SEULEMENT ce bloc dans la disposition actuelle fournie ci-dessous, garde tous les autres identiques.
- Si aucune disposition actuelle n'est fournie, pars d'un bulletin complet et cohérent (logo, nom entreprise, titre, période, identité salarié, tableau, net à payer, zone signature) plutôt que d'un bloc isolé.
- N'invente pas de propriété hors de cette liste, n'omets pas "id" ni "type".`;

    const contexte = currentLayout && currentLayout.length
        ? `Disposition actuelle (à modifier selon la dernière demande, pas à reconstruire de zéro) :\n${JSON.stringify(currentLayout)}`
        : 'Aucune disposition existante : propose un premier bulletin complet.';

    const tousMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contexte },
        ...(messages || [])
    ];

    // L'image ne s'attache qu'au tout dernier message utilisateur (la
    // demande courante) — jamais à l'historique, sinon chaque tour suivant
    // renverrait la même image en pièce jointe, gonflant chaque appel pour
    // rien puisque le premier tour l'a déjà exploitée.
    if (image) {
        for (let i = tousMessages.length - 1; i >= 0; i--) {
            if (tousMessages[i].role === 'user') {
                tousMessages[i] = { role: 'user', content: [{ type: 'text', text: tousMessages[i].content }, { type: 'image_url', image_url: { url: image } }] };
                break;
            }
        }
    }

    let responseText;
    try {
        responseText = await callOpenRouter(tousMessages, { maxTokens: image ? 8000 : 6000, temperature: 0.4 });
    } catch (e) {
        console.error('Erreur IA canvas bulletin:', e);
        throw new Error("La conception du modèle a échoué. Réessayez.");
    }

    let parsed;
    try {
        let brut = (responseText || '').trim();
        const fence = brut.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence) brut = fence[1];
        const debut = brut.indexOf('{');
        const fin = brut.lastIndexOf('}');
        if (debut >= 0 && fin > debut) brut = brut.slice(debut, fin + 1);
        parsed = JSON.parse(brut);
    } catch (e) {
        console.error('Réponse IA canvas inexploitable :', responseText?.slice(0, 500));
        throw new Error("L'IA n'a pas produit une disposition exploitable. Reformulez votre demande.");
    }

    const TYPES_VALIDES = new Set(['logo', 'text', 'table', 'netBox', 'line', 'rect', 'watermark']);
    const layout = Array.isArray(parsed.layout) ? parsed.layout
        .filter(b => b && TYPES_VALIDES.has(b.type))
        .map((b, i) => ({
            ...b,
            id: b.id || `${b.type}-${Date.now()}-${i}`,
            x: Math.max(0, Math.min(Number(b.x) || 0, page.width - 10)),
            y: Math.max(0, Math.min(Number(b.y) || 0, page.height - 6)),
            w: Math.max(10, Math.min(Number(b.w) || 100, page.width)),
            h: Math.max(6, Math.min(Number(b.h) || 14, page.height))
        })) : [];

    // Un seul bloc "table" a un sens (payrollService.js n'en imprime qu'un
    // tableau de rubriques) : si l'IA en a produit plusieurs, on ne garde que
    // le premier plutôt que de laisser deux tableaux se superposer.
    let tableauVu = false;
    const layoutFinal = layout.filter(b => {
        if (b.type !== 'table') return true;
        if (tableauVu) return false;
        tableauVu = true;
        return true;
    });

    return { message: parsed.message || 'Voici la disposition proposée.', layout: layoutFinal };
}

module.exports = {
    callOpenRouter, analyserEntreprise, repondreQuestion, rebuildDocumentTemplate,
    refineDocumentTemplate, DOCUMENT_PROFILES, stripCodeFence, suggestColumnMapping,
    SYSTEM_PROMPT, formatFCFA, autoTagDocxTemplate, genererBulletinCanvasIA
};
