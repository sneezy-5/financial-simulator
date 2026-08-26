// ═══════════════════════════════════════════════════════
// EXTRACTION DE MODÈLE À PARTIR D'UN DOCUMENT UPLOADÉ
//
// Prépare ce que l'IA doit recevoir pour reproduire fidèlement un document :
// une image haute résolution ET, quand le fichier en contient une, la couche
// texte exacte du PDF avec ses coordonnées.
//
// Partagé par l'import de paie et le générateur de documents RH : les deux
// écrans avaient chacun leur copie, et seule l'une des deux était corrigée.
// ═══════════════════════════════════════════════════════

const PDFJS_VERSION = '3.11.174'
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`

// Résolution de rendu envoyée à l'IA. À scale 1.5, les caractères de 7pt d'un
// bulletin devenaient illisibles et le modèle hallucinait les libellés.
const AI_RENDER_SCALE = 3

/** Charge pdf.js une seule fois et résout quand il est réellement utilisable. */
let pdfJsPromise = null
export function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (pdfJsPromise) return pdfJsPromise

  pdfJsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('pdfjs-lib')
    const script = existing || document.createElement('script')
    script.id = 'pdfjs-lib'
    script.src = `${PDFJS_BASE}/pdf.min.js`
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`
      resolve(window.pdfjsLib)
    }
    script.onerror = () => reject(new Error('Chargement de la librairie PDF impossible.'))
    if (!existing) document.head.appendChild(script)
  })
  return pdfJsPromise
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    r.readAsArrayBuffer(file)
  })
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    r.readAsDataURL(file)
  })
}

/**
 * Extrait le texte du PDF avec ses coordonnées exactes.
 *
 * C'est la pièce maîtresse de la fidélité : plutôt que de demander à l'IA de faire
 * de l'OCR sur une image (et d'inventer des libellés), on lui fournit les chaînes
 * réelles du PDF avec leur position et leur corps. Elle n'a plus qu'à reproduire
 * la mise en page, pas à deviner le contenu.
 */
async function extractTextLayer(page, viewport) {
  const content = await page.getTextContent()
  const items = []

  for (const item of content.items) {
    const str = (item.str || '').trim()
    if (!str) continue

    // transform = [scaleX, skewY, skewX, scaleY, x, y], origine en bas à gauche
    const [a, b, , d, x, y] = item.transform
    const fontSize = Math.hypot(a, b) || Math.abs(d) || 10
    const fontName = item.fontName || ''
    const style = content.styles?.[fontName] || {}
    const family = style.fontFamily || fontName

    items.push({
      str,
      x: Math.round(x * 10) / 10,
      // Bascule vers une origine en haut à gauche, sur la ligne de base du texte
      y: Math.round((viewport.height - y) * 10) / 10,
      fontSize: Math.round(fontSize * 10) / 10,
      bold: /bold|black|heavy|semibold/i.test(family) || (style.fontWeight || 0) >= 600,
      italic: /italic|oblique/i.test(family)
    })
  }

  // Ordre de lecture : de haut en bas, puis de gauche à droite
  items.sort((p1, p2) => (Math.abs(p1.y - p2.y) > 2 ? p1.y - p2.y : p1.x - p2.x))
  return items
}

/**
 * Prépare un fichier uploadé (PDF ou image scannée) pour l'analyse IA.
 *
 * @param {File} file          le document du client
 * @param {HTMLCanvasElement} canvas  canvas de travail (peut être masqué)
 * @returns {{imageBase64: string, textItems: Array|null, pageSize: object|null, pageCount: number}}
 */
export async function prepareTemplateSource(file, canvas) {
  if (!canvas) throw new Error('Canvas de rendu indisponible.')
  const name = (file.name || '').toLowerCase()

  if (name.endsWith('.pdf')) {
    const pdfjsLib = await loadPdfJs()
    const data = new Uint8Array(await readAsArrayBuffer(file))
    const pdf = await pdfjsLib.getDocument(data).promise
    const page = await pdf.getPage(1)

    const viewport = page.getViewport({ scale: AI_RENDER_SCALE })
    const ctx = canvas.getContext('2d')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: ctx, viewport }).promise

    const base = page.getViewport({ scale: 1 })
    return {
      // PNG et non JPEG : la compression avec perte brouillait les traits fins
      // et les petits caractères, les deux choses que l'IA doit justement lire.
      imageBase64: canvas.toDataURL('image/png'),
      textItems: await extractTextLayer(page, base),
      pageSize: { width: base.width, height: base.height },
      pageCount: pdf.numPages,
      // Le fichier lui-même : c'est lui qui permet au serveur d'employer la voie
      // déterministe (géométrie exacte) plutôt que de faire deviner l'IA.
      fileBase64: await readAsDataUrl(file),
      filename: file.name
    }
  }

  if ((file.type || '').startsWith('image/')) {
    const dataUrl = await readAsDataUrl(file)
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("Image illisible."))
      el.src = dataUrl
    })
    const ctx = canvas.getContext('2d')
    canvas.width = img.width
    canvas.height = img.height
    ctx.drawImage(img, 0, 0)
    // Un scan n'a pas de couche texte : la voie déterministe ne peut rien en
    // tirer, le serveur basculera sur la lecture d'image par l'IA.
    return {
      imageBase64: canvas.toDataURL('image/png'),
      textItems: null, pageSize: null, pageCount: 1,
      fileBase64: null, filename: file.name
    }
  }

  throw new Error('Format non supporté. Utilisez un PDF, un JPG ou un PNG.')
}

/**
 * Demande au backend la reconstruction du modèle.
 *
 * @param {object} source   résultat de prepareTemplateSource
 * @param {string} docType  payslip | hr_document | form (voir DOCUMENT_PROFILES côté serveur)
 * @param {number} refinePasses  passes de correction rendu → comparaison → correctif
 */
export async function requestTemplateReconstruction(source, docType, refinePasses = 1) {
  const token = localStorage.getItem('auth_token')
  if (!token) throw new Error("Vous devez être connecté pour utiliser l'Intelligence Artificielle.")

  const response = await fetch('/api/rh/analyze-pdf-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      imageBase64: source.imageBase64,
      textItems: source.textItems,
      pageSize: source.pageSize,
      fileBase64: source.fileBase64,
      filename: source.filename,
      docType,
      refinePasses
    })
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 402) {
      throw new Error('Crédits insuffisants. Rechargez votre compte pour continuer.')
    }
    throw new Error(result.error || "Erreur lors de l'analyse du modèle")
  }
  if (!result.htmlTemplate) throw new Error("Aucun gabarit exploitable n'a pu être produit.")
  // `unmapped` liste les champs repérés dans le document dont le système ne
  // connaît pas encore la donnée correspondante. Ils sont paramétrables, mais
  // resteront vides tant qu'ils ne sont pas rattachés.
  result.unmapped = result.unmapped || []
  return result
}

/**
 * Variante compatible avec les appelants qui n'attendent que le HTML.
 * `requestTemplateReconstruction` renvoie désormais aussi le moteur employé et
 * les variables détectées, utiles pour informer l'utilisateur.
 */
export async function requestTemplateHtml(source, docType, refinePasses = 1) {
  const r = await requestTemplateReconstruction(source, docType, refinePasses)
  return r.htmlTemplate
}

/**
 * Un gabarit capturé depuis un PDF ne recopie jamais l'image qu'il contenait
 * (logo, photo) — seule sa position est connue. Cette fonction doit rester
 * identique à injectLogoSlot() côté serveur (templateEngine.js) : c'est elle
 * qui place le logo réellement configuré du compte à cet emplacement, ou
 * retire le cadre vide si aucun logo n'est configuré.
 */
export function injectLogoSlot(html, logoDataUrl) {
  if (!html) return html
  const re = /<div\b[^>]*\bdata-onda-logo="1"[^>]*>\s*<\/div>/gi
  return html.replace(re, (tag) => {
    const styleMatch = tag.match(/style="([^"]*)"/i)
    const boxStyle = styleMatch ? styleMatch[1] : ''
    if (!logoDataUrl) return ''
    const sep = boxStyle && !boxStyle.trim().endsWith(';') ? ';' : ''
    return `<img data-onda-logo="1" src="${logoDataUrl}" style="${boxStyle}${sep}object-fit:contain;">`
  })
}

/**
 * Remplace les {variable} et {objet.champ} d'un gabarit par des valeurs réelles,
 * pour un aperçu "rempli" — notamment comparer visuellement un gabarit capturé
 * au PDF dont il est issu, plutôt que de se fier à un simple verdict textuel.
 */
export function fillTemplatePlaceholders(html, viewData = {}) {
  const formatFCFA = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  let out = html || ''
  for (const key of Object.keys(viewData)) {
    const val = viewData[key]
    if (typeof val === 'object' && val !== null) {
      for (const subKey of Object.keys(val)) {
        const subVal = val[subKey]
        const strVal = typeof subVal === 'number' ? formatFCFA(subVal) : (subVal || '')
        out = out.replace(new RegExp(`\\{${key}\\.${subKey}\\}`, 'g'), strVal)
      }
    }
    const strVal = typeof val === 'number' ? formatFCFA(val) : (val || '')
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), strVal)
  }
  // Uniquement les jetons qui ressemblent à un nom de variable (lettres,
  // chiffres, points) : un `{...}` plus large pourrait être une règle CSS
  // échappée à l'inline (accolades d'un bloc de style), qu'il ne faut jamais
  // effacer sous peine de rendre toute la mise en page invisible.
  return out.replace(/\{[a-zA-Z_][a-zA-Z0-9_.]*\}/g, '')
}

/** Enveloppe d'aperçu — doit rester identique à wrapHtmlDocument() côté serveur. */
export function wrapPreviewHtml(html) {
  if (!html) return ''
  if (html.toLowerCase().includes('<html')) return html
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Helvetica, Arial, sans-serif; color: #000; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
  .onda-page { position: relative; width: 210mm; min-height: 297mm; overflow: hidden; }
</style>
</head>
<body>${html}</body>
</html>`
}
