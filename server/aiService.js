// ═══════════════════════════════════════════════════════
// SERVICE IA - OpenRouter (compatible avec tous les LLMs)
// ═══════════════════════════════════════════════════════

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const https = require('https');

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Appel à l'API OpenRouter
 * Le modèle est configurable dans .env sans toucher au code
 */
async function callOpenRouter(messages, options = {}) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
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

module.exports = { callOpenRouter, analyserEntreprise, repondreQuestion, SYSTEM_PROMPT, formatFCFA };
