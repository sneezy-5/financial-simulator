// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL D'AUDIT
//
// `journaliser` ne lève jamais : une trace manquée ne doit pas faire échouer
// l'action métier (générer une paie, enregistrer une fiche…). L'échec est
// signalé dans les logs serveur.
// ═══════════════════════════════════════════════════════════════════════════

const { AuditLog } = require('../database');

// Champs techniques jamais comparés (ils changent à chaque enregistrement).
const IGNORES = new Set(['updatedAt', 'createdAt', 'password', 'id', 'userId']);
// Champs volumineux : on note qu'ils ont changé, sans recopier leur contenu.
const VOLUMINEUX = new Set(['companyLogo', 'bulletinCanvasLayout', 'cumulsPaie', 'rubriqueCodes']);

const normaliser = (v) => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v === undefined || v === '') return null;
    if (typeof v === 'object' && v !== null) return JSON.stringify(v);
    return v;
};

/**
 * Différences champ par champ entre deux états à plat.
 * @returns {{[champ:string]: {avant:any, apres:any}}}
 */
function differences(avant = {}, apres = {}) {
    const champs = new Set([...Object.keys(avant || {}), ...Object.keys(apres || {})]);
    const diff = {};
    for (const c of champs) {
        if (IGNORES.has(c)) continue;
        const a = normaliser(avant?.[c]);
        const b = normaliser(apres?.[c]);
        // 400000 et « 400000 » saisis depuis un formulaire : même valeur.
        if (a === b || (a !== null && b !== null && String(a) === String(b))) continue;
        diff[c] = VOLUMINEUX.has(c) ? { avant: a === null ? null : '(modifié)', apres: b === null ? null : '(modifié)' } : { avant: a, apres: b };
    }
    return diff;
}

/**
 * @param {object} o
 * @param {object} o.req        requête Express (auteur + IP)
 * @param {number} [o.userId]   compte concerné (défaut : l'auteur)
 * @param {string} o.action     ex. 'periode.cloturee'
 * @param {string} o.entite     'periode' | 'salarie' | 'parametres' | 'bulletin'
 * @param {string|number} [o.entiteId]
 * @param {string} o.libelle    phrase lisible
 * @param {object} [o.details]  données complémentaires (changements, motif, effectif…)
 */
async function journaliser({ req, userId, action, entite, entiteId, libelle, details }) {
    try {
        await AuditLog.create({
            userId: userId ?? req?.user?.id,
            auteurId: req?.user?.id ?? null,
            auteurEmail: req?.user?.email ?? null,
            action, entite,
            entiteId: entiteId === undefined || entiteId === null ? null : String(entiteId),
            libelle: libelle ? String(libelle).slice(0, 250) : null,
            details: details ? JSON.stringify(details) : null,
            ip: (req?.headers?.['x-forwarded-for'] || req?.ip || '').toString().split(',')[0].trim() || null
        });
    } catch (e) {
        console.error(`⚠️ Journal d'audit — trace non enregistrée (${action}) :`, e.message);
    }
}

module.exports = { journaliser, differences };
