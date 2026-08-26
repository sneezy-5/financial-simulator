// ═══════════════════════════════════════════════════════
// ÉDITION DE DOCUMENTS WORD
//
// Le principe qui rend cette voie supérieure au PDF : on ne reconstruit rien.
// Le fichier d'origine reste le document, on n'y remplace que du texte à
// l'intérieur des nœuds <w:t>. Styles, tableaux, marges, en-têtes, images :
// tout est conservé à l'octet près, parce qu'on n'y touche pas.
// ═══════════════════════════════════════════════════════

const PizZip = require('pizzip');

/**
 * Parties d'un document Word qui portent du texte visible.
 * Les en-têtes et pieds de page en font partie : la raison sociale et les
 * mentions légales s'y trouvent presque toujours, et les ignorer laissait ces
 * zones non paramétrables.
 */
function partiesTexte(zip) {
    return Object.keys(zip.files).filter(nom =>
        /^word\/(document|header\d*|footer\d*)\.xml$/.test(nom));
}

/** Décode les entités XML d'un contenu de nœud texte. */
function decoderXml(s) {
    return String(s)
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

/** Encode un texte pour l'insérer dans un nœud XML. */
function encoderXml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Extrait le texte brut d'un document Word.
 * @param {Buffer} docxBuffer
 * @param {object} options  { inclureEnTetes: true }
 * @returns {string}
 */
function extractTextFromDocx(docxBuffer, options = {}) {
    try {
        const zip = new PizZip(docxBuffer);
        const parties = options.inclureEnTetes === false
            ? ['word/document.xml']
            : partiesTexte(zip);

        return parties
            .map(nom => {
                const xml = zip.file(nom)?.asText();
                if (!xml) return '';
                const noeuds = xml.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
                return noeuds.map(n => decoderXml(n.replace(/<[^>]+>/g, ''))).join(' ');
            })
            .filter(Boolean)
            .join('\n');
    } catch (e) {
        console.error("Erreur PizZip lors de l'extraction DOCX :", e.message);
        return '';
    }
}

/**
 * Remplace des fragments de texte dans un document Word, même lorsque le texte
 * d'origine est réparti sur plusieurs balises <w:t> — ce que Word fait dès qu'un
 * mot est corrigé ou partiellement mis en forme.
 *
 * @param {Buffer} docxBuffer
 * @param {Array<{original: string, variable: string}>} replacements
 * @param {object} options { inclureEnTetes: true, toutesOccurrences: true }
 * @returns {{ buffer: Buffer, remplaces: number, introuvables: Array<string> }}
 */
function replaceTextAcrossTags(docxBuffer, replacements, options = {}) {
    const zip = new PizZip(docxBuffer);
    const parties = options.inclureEnTetes === false
        ? ['word/document.xml']
        : partiesTexte(zip);

    let remplaces = 0;
    const trouves = new Set();

    for (const nom of parties) {
        let xml = zip.file(nom)?.asText();
        if (!xml) continue;

        for (const rep of replacements || []) {
            if (!rep || !rep.original || !rep.variable) continue;
            const resultat = remplacerDansNoeuds(
                xml,
                rep.original,
                `{${rep.variable}}`,
                options.toutesOccurrences !== false
            );
            if (resultat.remplacements > 0) {
                xml = resultat.xml;
                remplaces += resultat.remplacements;
                trouves.add(rep.original);
            }
        }
        zip.file(nom, xml);
    }

    const introuvables = (replacements || [])
        .filter(r => r && r.original && !trouves.has(r.original))
        .map(r => r.original);

    return {
        buffer: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
        remplaces,
        introuvables
    };
}

/**
 * Remplace une chaîne dans les nœuds texte d'un XML Word.
 *
 * ITÉRATIF, ET NON RÉCURSIF. La version récursive se rappelait après chaque
 * remplacement réussi : dès que le texte inséré contenait le texte cherché —
 * remplacer « comptable » par « {comptable} », cas parfaitement courant — la
 * pile débordait. On avance donc un curseur derrière chaque remplacement.
 */
function remplacerDansNoeuds(xml, recherche, remplacement, toutesOccurrences = true) {
    let courant = xml;
    let remplacements = 0;
    let departRecherche = 0;
    // Garde-fou : un document Word normal ne contient pas mille occurrences du
    // même fragment ; au-delà, mieux vaut s'arrêter que boucler.
    const MAX = 1000;

    while (remplacements < MAX) {
        const noeuds = listerNoeudsTexte(courant);
        if (!noeuds.length) break;

        const texteComplet = noeuds.map(n => n.texte).join('');
        const position = texteComplet.indexOf(recherche, departRecherche);
        if (position < 0) break;

        const fin = position + recherche.length;
        let longueur = 0;
        let iDebut = -1, iFin = -1, offsetDebut = 0, offsetFin = 0;

        for (let i = 0; i < noeuds.length; i++) {
            const taille = noeuds[i].texte.length;
            if (iDebut === -1 && longueur + taille > position) {
                iDebut = i;
                offsetDebut = position - longueur;
            }
            if (iDebut !== -1 && longueur + taille >= fin) {
                iFin = i;
                offsetFin = fin - longueur;
                break;
            }
            longueur += taille;
        }
        if (iDebut === -1 || iFin === -1) break;

        courant = reconstruire(courant, noeuds, iDebut, iFin, offsetDebut, offsetFin, remplacement);
        remplacements++;

        // On reprend APRÈS le texte inséré : sans cela, un remplacement qui
        // contient sa propre cible serait retrouvé indéfiniment.
        departRecherche = position + remplacement.length;
        if (!toutesOccurrences) break;
    }

    return { xml: courant, remplacements };
}

function listerNoeudsTexte(xml) {
    const regex = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
    const noeuds = [];
    let m;
    while ((m = regex.exec(xml)) !== null) {
        noeuds.push({
            ouvrant: m[1],
            texte: decoderXml(m[2]),
            fermant: m[3],
            debut: m.index,
            fin: m.index + m[0].length
        });
    }
    return noeuds;
}

/**
 * Réécrit le XML en insérant le remplacement, en conservant intactes toutes les
 * balises situées entre les nœuds touchés (mise en forme des runs, sauts, etc.).
 */
function reconstruire(xml, noeuds, iDebut, iFin, offsetDebut, offsetFin, remplacement) {
    let sortie = xml.substring(0, noeuds[iDebut].debut);

    if (iDebut === iFin) {
        const n = noeuds[iDebut];
        const texte = n.texte.substring(0, offsetDebut) + remplacement + n.texte.substring(offsetFin);
        sortie += `${forcerEspaces(n.ouvrant)}${encoderXml(texte)}${n.fermant}`;
    } else {
        for (let i = iDebut; i <= iFin; i++) {
            const n = noeuds[i];
            if (i > iDebut) sortie += xml.substring(noeuds[i - 1].fin, n.debut);

            let texte;
            if (i === iDebut) texte = n.texte.substring(0, offsetDebut) + remplacement;
            else if (i === iFin) texte = n.texte.substring(offsetFin);
            else texte = '';

            sortie += `${forcerEspaces(n.ouvrant)}${encoderXml(texte)}${n.fermant}`;
        }
    }

    sortie += xml.substring(noeuds[iFin].fin);
    return sortie;
}

/**
 * Word supprime les espaces de début et de fin d'un nœud texte sauf si
 * xml:space="preserve" y figure. Un placeholder collé à son libellé
 * (« Nom : {nom} ») y perdrait son espace.
 */
function forcerEspaces(ouvrant) {
    if (/xml:space=/.test(ouvrant)) return ouvrant;
    return ouvrant.replace(/^<w:t/, '<w:t xml:space="preserve"');
}

module.exports = {
    extractTextFromDocx,
    replaceTextAcrossTags,
    remplacerDansNoeuds,
    partiesTexte
};
