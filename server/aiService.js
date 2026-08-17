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
 * Analyse OCR Vision d'un PDF de bulletin de paie et reconstruit le HTML (RAG HTML-to-PDF)
 */
async function rebuildPayslipTemplate(imageBase64) {
    const prompt = `
Tu es un intégrateur web expert. Voici une image d'un bulletin de paie (template). Ta mission est de reconstruire INTÉGRALEMENT ce bulletin en générant un code HTML.

Règles strictes de DESIGN (TRES IMPORTANT) :
- Tu DOIS utiliser les classes de **Tailwind CSS** pour styliser le document.
- TAILLE DE POLICE : text-xs (12px) pour tout le texte. Les titres de section en text-sm font-bold. Le titre "BULLETIN DE PAIE" en text-base font-bold. N'utilise JAMAIS text-lg, text-xl, text-2xl ou plus grand.
- ESPACEMENT : ULTRA COMPACT. Pas de margin-bottom ni padding excessif. L'espace entre les sections doit être mt-2 max.
- TABLEAU : Observe bien le style du tableau sur l'image. S'il n'y a pas de fond gris, n'en mets pas. S'il n'y a que des lignes horizontales (border-b, border-t), utilise uniquement celles-ci. Aligne TOUS les nombres (colonnes Base, Taux, Montant) et leurs en-têtes à DROITE (text-right). Les lignes du tableau doivent avoir un padding minimal (px-2 py-0.5).
- Ne mets pas de balise <style> ni de <head>. Renvoie uniquement le contenu qui va à l'intérieur de la balise <body>.
- Reproduis la STRUCTURE EXACTE de l'image. 
- ALIGNEMENTS (CRITIQUE) : OBSERVE ATTENTIVEMENT L'IMAGE. 
  - L'en-tête (République, Entreprise) est-il centré ? Centre-le (text-center).
  - Le texte du bandeau "NET À PAYER" est-il aligné à droite ? Aligne-le à droite (text-right ou justify-end).
  - Les colonnes numériques doivent être parfaitement alignées.
- TOUT LE CONTENU DOIT TENIR SUR UNE SEULE PAGE A4. C'est la contrainte N°1.

Règles de FONCTIONNEMENT :
1. Tu dois renvoyer UNIQUEMENT le code HTML (les <div>, <table>, etc.), rien d'autre. Pas de markdown (ne mets pas de \`\`\`html).
2. Remplace les valeurs textuelles par les variables exactes suivantes (incluant les accolades) :
   - {nom_entreprise}
   - {nom}
   - {prenom}
   - {matricule}
   - {poste}
   - {salaireBase}
   - {brut}
   - {salarial.its}
   - {salarial.cnps}
   - {netAPayer}
   - {date_jour}
3. S'il y a des montants non mappés, laisse les montants d'origine.
    `;

    const messages = [
        {
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageBase64 } }
            ]
        }
    ];

    try {
        const responseText = await callOpenRouter(messages, { maxTokens: 4000, temperature: 0.1 });
        
        let htmlContent = responseText.trim();
        
        // Nettoyage classique du markdown
        if (htmlContent.startsWith('\`\`\`html')) htmlContent = htmlContent.substring(7);
        if (htmlContent.startsWith('\`\`\`')) htmlContent = htmlContent.substring(3);
        if (htmlContent.endsWith('\`\`\`')) htmlContent = htmlContent.substring(0, htmlContent.length - 3);
        
        return htmlContent.trim();
    } catch (e) {
        console.error("Erreur Vision OCR HTML:", e);
        throw new Error("La reconstruction IA a échoué.");
    }
}

module.exports = { callOpenRouter, analyserEntreprise, repondreQuestion, rebuildPayslipTemplate, SYSTEM_PROMPT, formatFCFA };
