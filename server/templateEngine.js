// ═══════════════════════════════════════════════════════
// MOTEUR DE TEMPLATE HTML → PDF
// Utilisé par le mode "modèle client reconstruit par l'IA".
// Centralise : résolution des variables, enveloppe HTML, rendu Puppeteer.
// ═══════════════════════════════════════════════════════

const fs = require('fs');

let puppeteer = null;
let puppeteerError = null;

/**
 * Charge puppeteer à la demande.
 *
 * IMPORT DYNAMIQUE, ET NON require() : depuis la version 23, puppeteer est un
 * paquet ESM pur ("type": "module"). Or `require()` d'un module ESM n'existe
 * qu'à partir de Node 22.12, et l'application embarque un node.exe v20 — le
 * chargement échouait donc en production alors qu'il réussissait sous un Node
 * récent. `import()` fonctionne dans tout module CommonJS, quelle que soit la
 * version, et c'est d'ailleurs ce que Node lui-même recommande dans son message.
 *
 * À la demande, et non une fois pour toutes au démarrage : un échec au
 * chargement du module était définitif jusqu'au redémarrage, y compris quand la
 * cause était passagère (une installation npm en cours). Ici, un appel ultérieur
 * retente et repart dès que le module redevient disponible.
 *
 * L'erreur réelle est conservée : afficher « puppeteer n'est pas installé »
 * quelle que soit la cause envoyait chercher au mauvais endroit.
 */
async function getPuppeteer() {
    if (puppeteer) return puppeteer;
    try {
        const mod = await import('puppeteer');
        puppeteer = mod.default || mod;
        puppeteerError = null;
    } catch (e) {
        puppeteerError = e;
        puppeteer = null;
    }
    return puppeteer;
}

/** Formatage FCFA : séparateur d'espace tous les 3 chiffres */
function formatFCFA(val) {
    return Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Résout un chemin pointé dans un objet : "salarial.its" → viewData.salarial.its
 * Retourne undefined si le chemin n'existe pas.
 */
function resolvePath(obj, path) {
    return path.split('.').reduce((acc, part) => {
        if (acc === null || acc === undefined) return undefined;
        return acc[part];
    }, obj);
}

/** Échappe le HTML pour qu'une valeur métier ne casse jamais la structure du document */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Remplit un template HTML avec les données d'un employé.
 *
 * Accepte trois syntaxes de placeholder, insensibles aux espaces internes :
 *   {nom}  {{nom}}  [Nom]  (les crochets ne sont remplacés que s'ils matchent une clé)
 * Les chemins pointés ({salarial.its}) sont résolus récursivement.
 *
 * Un placeholder non résolu devient une chaîne vide et non "0" : afficher un faux
 * montant sur un bulletin de paie est plus grave que de laisser un blanc.
 */
function fillTemplate(html, viewData) {
    if (!html) return '';

    const render = (rawKey) => {
        const key = rawKey.trim();
        const val = resolvePath(viewData, key);
        if (val === undefined || val === null) return null;
        if (typeof val === 'number') return escapeHtml(formatFCFA(val));
        if (typeof val === 'boolean') return val ? 'Oui' : 'Non';
        return escapeHtml(val);
    };

    // {{ cle }} puis { cle } — le double d'abord pour ne pas laisser d'accolade orpheline
    html = html.replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, (m, k) => {
        const v = render(k);
        return v === null ? '' : v;
    });
    html = html.replace(/\{\s*([\w.\-]+)\s*\}/g, (m, k) => {
        const v = render(k);
        return v === null ? '' : v;
    });
    // [Cle] : uniquement si la clé existe réellement, sinon on laisse le texte intact
    // (le modèle du client peut contenir des crochets décoratifs légitimes)
    html = html.replace(/\[\s*([\w.\-]+)\s*\]/g, (m, k) => {
        const v = render(k);
        return v === null ? m : v;
    });

    return html;
}

/**
 * Enveloppe un fragment HTML dans un document A4 imprimable.
 *
 * Aucune ressource externe : le CDN Tailwind compilait ses classes APRÈS le
 * networkidle0 de Puppeteer, ce qui produisait par intermittence un PDF sans
 * aucun style — et systématiquement sur un serveur sans accès Internet.
 * Le HTML produit par l'IA embarque désormais son propre <style>.
 */
/**
 * Un modèle capturé depuis un PDF ne recopie jamais l'image qu'il contenait
 * (logo, photo) — seule sa position est connue (voir docengine/render/htmlRender.js,
 * renderImageSlot). L'emplacement est marqué `data-onda-logo="1"` ; c'est ici,
 * au moment du rendu réel, qu'on y place le logo réellement configuré par ce
 * compte. Sans logo configuré, l'emplacement reste vide plutôt que d'afficher
 * une image qui n'est pas la sienne.
 */
function injectLogoSlot(html, logoDataUrl) {
    if (!html) return html;
    const re = /<div\b[^>]*\bdata-onda-logo="1"[^>]*>\s*<\/div>/gi;
    return html.replace(re, (tag) => {
        const styleMatch = tag.match(/style="([^"]*)"/i);
        const boxStyle = styleMatch ? styleMatch[1] : '';
        if (!logoDataUrl) return '';
        const sep = boxStyle && !boxStyle.trim().endsWith(';') ? ';' : '';
        return `<img data-onda-logo="1" src="${logoDataUrl}" style="${boxStyle}${sep}object-fit:contain;">`;
    });
}

function wrapHtmlDocument(html) {
    if (html.toLowerCase().includes('<html')) return html;
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: #000;
    -webkit-font-smoothing: antialiased;
  }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
  /* Conteneur de page produit par l'IA en mode reproduction fidèle */
  .onda-page { position: relative; width: 210mm; min-height: 297mm; overflow: hidden; page-break-after: always; }
  .onda-page:last-child { page-break-after: auto; }
</style>
</head>
<body>${html}</body>
</html>`;
}

/** Localise un Chrome/Chromium système (VPS Linux sans Chrome bundlé) */
function findChromeExecutable() {
    const commonPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium'
    ];
    for (const p of commonPaths) {
        if (fs.existsSync(p)) return p;
    }
    for (const cmd of ['which chromium-browser', 'which google-chrome']) {
        try {
            const found = require('child_process').execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
            if (found) return found;
        } catch (e) { /* absent, on continue */ }
    }
    return undefined;
}

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

/** Le navigateur manque-t-il, par opposition à une autre panne de lancement ? */
function isMissingBrowser(err) {
    return /could not find (chrome|chromium|browser)|browser was not found|executable doesn't exist/i.test(err.message || '');
}

let chromeInstallAttempted = false;

/**
 * Installe le Chrome de puppeteer. Tentée une seule fois par processus : si elle
 * échoue, la relancer à chaque bulletin bloquerait la génération du lot entier
 * pendant plusieurs minutes.
 */
function installChromeOnce() {
    if (chromeInstallAttempted) return false;
    chromeInstallAttempted = true;
    try {
        console.log('Chrome introuvable : installation automatique par puppeteer…');
        require('child_process').execSync('npx puppeteer browsers install chrome', { stdio: 'pipe' });
        console.log('Installation de Chrome terminée.');
        return true;
    } catch (e) {
        console.error("Installation automatique de Chrome impossible :", e.message);
        return false;
    }
}

/** Lance un navigateur headless configuré pour l'impression PDF */
async function launchBrowser() {
    const pptr = await getPuppeteer();
    if (!pptr) {
        throw new Error(
            "Le module puppeteer n'a pas pu être chargé, la génération PDF depuis un modèle " +
            `est indisponible. Cause : ${(puppeteerError && puppeteerError.message) || 'inconnue'}. ` +
            'Vérifiez l\'installation avec « npm install puppeteer » dans le dossier server.'
        );
    }

    const options = { headless: 'new', executablePath: findChromeExecutable(), args: LAUNCH_ARGS };
    try {
        return await pptr.launch(options);
    } catch (e) {
        // Le module est bien là mais son navigateur manque : c'est réparable sans
        // intervention, et c'est le cas courant sur un serveur fraîchement déployé.
        if (isMissingBrowser(e) && installChromeOnce()) {
            return pptr.launch({ ...options, executablePath: findChromeExecutable() });
        }
        throw e;
    }
}

// A4 en pixels CSS (1px = 1/96 pouce) : 8.27 x 11.69 pouces.
// La fenêtre doit avoir exactement ces proportions, sinon la capture envoyée à
// l'IA pour vérification n'est plus superposable au scan de la page d'origine.
const A4_CSS_WIDTH = 794;
const A4_CSS_HEIGHT = 1123;

/**
 * Prépare une page Puppeteer à partir d'un HTML complet.
 * `domcontentloaded` + attente des polices : le HTML est autonome, attendre le
 * réseau n'ajoute que de la latence (voire un timeout hors ligne).
 */
async function preparePage(browser, fullHtml) {
    const page = await browser.newPage();
    await page.setViewport({ width: A4_CSS_WIDTH, height: A4_CSS_HEIGHT, deviceScaleFactor: 2 });
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    return page;
}

const PDF_OPTIONS = {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
};

/**
 * Chaîne complète : template + données → buffer PDF.
 * `browser` peut être fourni pour mutualiser une instance sur un lot d'employés.
 */
async function renderTemplateToPdf(htmlTemplate, viewData, browser = null) {
    const ownBrowser = !browser;
    const b = browser || await launchBrowser();
    try {
        const filled = injectLogoSlot(fillTemplate(htmlTemplate, viewData), viewData?.logo);
        const page = await preparePage(b, wrapHtmlDocument(filled));
        const pdfBytes = await page.pdf(PDF_OPTIONS);
        await page.close();
        return Buffer.from(pdfBytes);
    } finally {
        if (ownBrowser) await b.close();
    }
}

/**
 * Rend un template en PNG — utilisé par la boucle de vérification de l'IA
 * (on lui renvoie son propre rendu à côté de l'original pour qu'elle corrige).
 *
 * viewData vaut null par défaut : on rend le gabarit SANS le remplir, placeholders
 * apparents. Rempli avec un objet vide, chaque {nom} devenait une case blanche et
 * l'IA, croyant à du texte manquant, réécrivait des valeurs en dur à la place des
 * variables. Placeholders visibles, elle comprend que ce sont des champs.
 */
async function renderTemplateToPng(htmlTemplate, viewData = null) {
    const browser = await launchBrowser();
    try {
        const filled = viewData ? injectLogoSlot(fillTemplate(htmlTemplate, viewData), viewData.logo) : htmlTemplate;
        const page = await preparePage(browser, wrapHtmlDocument(filled));
        // On cadre sur la page elle-même quand le gabarit en déclare une, pour ne
        // pas envoyer à l'IA une bande blanche qu'elle prendrait pour un décalage.
        const target = await page.$('.onda-page');
        const buf = target
            ? await target.screenshot({ type: 'png' })
            : await page.screenshot({ type: 'png', fullPage: true });
        await page.close();
        return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
    } finally {
        await browser.close();
    }
}

module.exports = {
    formatFCFA,
    resolvePath,
    fillTemplate,
    injectLogoSlot,
    wrapHtmlDocument,
    findChromeExecutable,
    launchBrowser,
    preparePage,
    renderTemplateToPdf,
    renderTemplateToPng,
    PDF_OPTIONS
};
