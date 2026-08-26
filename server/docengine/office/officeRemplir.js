// ═══════════════════════════════════════════════════════
// POSE DES VARIABLES ET REMPLISSAGE
//
// Deux opérations distinctes, volontairement séparées :
//
//   POSER   — une fois, après validation par l'utilisateur : on remplace dans
//             SON fichier les valeurs repérées par {variable}. Le résultat est
//             le gabarit, conservé tel quel.
//   REMPLIR — à chaque génération : on remplace {variable} par la donnée du
//             salarié.
//
// Dans les deux cas on ne touche qu'au texte. Styles, tableaux, en-têtes,
// images, largeurs de colonnes : rien n'est reconstruit, donc rien ne peut se
// dégrader.
// ═══════════════════════════════════════════════════════

const PizZip = require('pizzip');
const { replaceTextAcrossTags } = require('../../docxEditor');

let XLSX;
try {
    XLSX = require('xlsx');
} catch (e) { /* signalé à l'usage */ }

// ── Word ─────────────────────────────────────────────────────────────────────

/**
 * Transforme le modèle du client en gabarit.
 * @param {Buffer} buffer
 * @param {Array<{original, variable}>} emplacements  validés par l'utilisateur
 */
function poserVariablesDocx(buffer, emplacements) {
    // Les textes les plus longs d'abord : « 750 150 FCFA » doit être traité
    // avant « 750 150 », sans quoi le premier remplacement couperait le second
    // en plein milieu.
    const ordonnes = [...emplacements]
        .filter(e => e && e.original && e.variable)
        .sort((a, b) => b.original.length - a.original.length);

    return replaceTextAcrossTags(buffer, ordonnes);
}

/** Remplit un gabarit Word avec les données d'un salarié. */
function remplirDocx(buffer, donnees) {
    const zip = new PizZip(buffer);
    const parties = Object.keys(zip.files)
        .filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));

    const nonResolues = new Set();

    for (const nom of parties) {
        let xml = zip.file(nom)?.asText();
        if (!xml) continue;

        // Les placeholders peuvent être coupés entre plusieurs <w:t> par Word.
        // On recolle donc le texte, on substitue, puis on réinjecte.
        xml = substituerDansXml(xml, donnees, nonResolues);
        zip.file(nom, xml);
    }

    return {
        buffer: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
        nonResolues: [...nonResolues]
    };
}

/**
 * Substitue les {variable} d'un XML Word.
 *
 * Word coupe volontiers un mot en plusieurs nœuds : « {salarie » dans l'un,
 * « _nom} » dans l'autre. Une substitution nœud par nœud raterait ces cas. On
 * fusionne donc les nœuds d'un même paragraphe avant de substituer.
 */
function substituerDansXml(xml, donnees, nonResolues) {
    return xml.replace(/(<w:p[ >][\s\S]*?<\/w:p>)/g, (paragraphe) => {
        if (!paragraphe.includes('{')) return paragraphe;

        const noeuds = [...paragraphe.matchAll(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g)];
        if (!noeuds.length) return paragraphe;

        const complet = noeuds.map(n => n[2]).join('');
        if (!/\{[\w.\-]+\}/.test(complet)) return paragraphe;

        const substitue = complet.replace(/\{([\w.\-]+)\}/g, (motif, cle) => {
            const valeur = resoudre(donnees, cle);
            if (valeur === undefined || valeur === null) {
                nonResolues.add(cle);
                // Un placeholder non résolu devient vide : afficher un faux
                // montant sur un document officiel serait pire qu'un blanc.
                return '';
            }
            return echapper(formater(valeur));
        });

        // Tout le texte substitué va dans le premier nœud, les autres sont vidés :
        // c'est la seule façon sûre de réécrire un texte qui traversait
        // plusieurs nœuds, et la mise en forme du premier run s'applique.
        let premier = true;
        return paragraphe.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (tag, ouvrant, texte, fermant) => {
            const balise = /xml:space=/.test(ouvrant) ? ouvrant : ouvrant.replace(/^<w:t/, '<w:t xml:space="preserve"');
            if (premier) { premier = false; return `${balise}${substitue}${fermant}`; }
            return `${balise}${fermant}`;
        });
    });
}

// ── Excel ────────────────────────────────────────────────────────────────────

function poserVariablesXlsx(buffer, emplacements) {
    if (!XLSX) throw new Error("Le module xlsx n'est pas installé.");
    const classeur = XLSX.read(buffer, { type: 'buffer', cellStyles: true });

    const parTexte = new Map();
    for (const e of emplacements || []) {
        if (e && e.original && e.variable) parTexte.set(String(e.original).trim(), e.variable);
    }

    let remplaces = 0;
    for (const nomFeuille of classeur.SheetNames) {
        const feuille = classeur.Sheets[nomFeuille];
        for (const adresse of Object.keys(feuille)) {
            if (adresse.startsWith('!')) continue;
            const cellule = feuille[adresse];
            // Une formule se recalcule : on ne la remplace jamais par un
            // placeholder, sous peine de casser le classeur.
            if (cellule.f) continue;
            const texte = String(cellule.w ?? cellule.v ?? '').trim();
            const variable = parTexte.get(texte);
            if (!variable) continue;
            cellule.t = 's';
            cellule.v = `{${variable}}`;
            delete cellule.w;
            remplaces++;
        }
    }

    return {
        buffer: XLSX.write(classeur, { type: 'buffer', bookType: 'xlsx', cellStyles: true }),
        remplaces
    };
}

function remplirXlsx(buffer, donnees) {
    if (!XLSX) throw new Error("Le module xlsx n'est pas installé.");
    const classeur = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
    const nonResolues = new Set();

    for (const nomFeuille of classeur.SheetNames) {
        const feuille = classeur.Sheets[nomFeuille];
        for (const adresse of Object.keys(feuille)) {
            if (adresse.startsWith('!')) continue;
            const cellule = feuille[adresse];
            if (cellule.f) continue;
            const texte = String(cellule.v ?? '');
            if (!/\{[\w.\-]+\}/.test(texte)) continue;

            let numerique = null;
            const substitue = texte.replace(/\{([\w.\-]+)\}/g, (motif, cle) => {
                const valeur = resoudre(donnees, cle);
                if (valeur === undefined || valeur === null) { nonResolues.add(cle); return ''; }
                if (typeof valeur === 'number') numerique = valeur;
                return formater(valeur);
            });

            // Une cellule qui ne contenait QUE le placeholder retrouve son type
            // numérique : c'est ce qui permet aux formules et aux totaux du
            // classeur de continuer à fonctionner.
            if (numerique !== null && /^\{[\w.\-]+\}$/.test(texte.trim())) {
                cellule.t = 'n';
                cellule.v = numerique;
            } else {
                cellule.t = 's';
                cellule.v = substitue;
            }
            delete cellule.w;
        }
    }

    return {
        buffer: XLSX.write(classeur, { type: 'buffer', bookType: 'xlsx', cellStyles: true }),
        nonResolues: [...nonResolues]
    };
}

// ── Communs ──────────────────────────────────────────────────────────────────

/** Résout un chemin pointé : « salarial.its » → donnees.salarial.its */
function resoudre(objet, chemin) {
    return String(chemin).split('.').reduce((acc, part) => {
        if (acc === null || acc === undefined) return undefined;
        return acc[part];
    }, objet);
}

function formater(valeur) {
    if (typeof valeur === 'number') {
        return Math.round(valeur).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    if (typeof valeur === 'boolean') return valeur ? 'Oui' : 'Non';
    return String(valeur);
}

function echapper(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Aiguillage ───────────────────────────────────────────────────────────────

function poserVariables(buffer, emplacements, format) {
    return format === 'xlsx'
        ? poserVariablesXlsx(buffer, emplacements)
        : poserVariablesDocx(buffer, emplacements);
}

function remplir(buffer, donnees, format) {
    return format === 'xlsx' ? remplirXlsx(buffer, donnees) : remplirDocx(buffer, donnees);
}

module.exports = {
    poserVariables, remplir,
    poserVariablesDocx, remplirDocx,
    poserVariablesXlsx, remplirXlsx,
    resoudre, formater
};
