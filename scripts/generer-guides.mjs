// Génère les pages guides statiques (public/guides/*.html) : du contenu lisible
// par les moteurs de recherche, qui renvoie vers le simulateur prérempli.
//
//   node scripts/generer-guides.mjs
//   SITE_URL=https://simulateur.exemple.ci node scripts/generer-guides.mjs   (+ sitemap.xml et URL canoniques)
//
// Chaque règle et chaque exemple chiffré est calculé par le moteur de paie au
// moment de la génération : une page ne peut pas contredire le simulateur.
// Relancer après toute modification du barème (server/moteur/paieCI.mjs).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculerBulletinCI, BAREMES_CI } from '../server/moteur/paieCI.mjs'

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dossier = path.join(racine, 'public', 'guides')
const SITE = (process.env.SITE_URL || '').replace(/\/$/, '')
const B = BAREMES_CI[BAREMES_CI.length - 1]
const ANNEE = new Date().getFullYear()
const PERIODE = { mois: 1, annee: ANNEE }

const f = (v) => Math.round(v).toLocaleString('fr-FR').replace(/ /g, ' ')
const pct = (t) => (Math.round(t * 10000) / 100).toLocaleString('fr-FR') + ' %'
const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const bulletin = (o) => calculerBulletinCI({ ...PERIODE, situation_matrimoniale: 'celibataire', nombre_enfants: 0, ...o })
const cout = (c) => c.gainsTotaux + c.patronal.grandTotal

// Lien vers le simulateur prérempli (même format que le bouton « Partager »).
function lienSimulateur(donnees, type = 'habituel') {
  const d = Buffer.from(JSON.stringify(donnees), 'utf8').toString('base64')
  return `/?module=hr&type=${type}&country=CI&d=${encodeURIComponent(d)}&utm_source=guide`
}

function page({ fichier, titre, description, h1, chapo, corps, cta }) {
  const canonique = SITE ? `<link rel="canonical" href="${SITE}/guides/${fichier}">` : ''
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(titre)}</title>
<meta name="description" content="${echapper(description)}">
${canonique}
<style>
  :root { --encre: #0f172a; --doux: #475569; --bleu: #1e3a8a; --vert: #047857; --fond: #f8fafc; --ligne: #e2e8f0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--encre); background: var(--fond); line-height: 1.6; }
  main { max-width: 760px; margin: 0 auto; padding: 28px 16px 48px; }
  .fil { font-size: .85rem; color: var(--doux); margin-bottom: 8px; }
  .fil a { color: var(--bleu); }
  h1 { font-size: 1.8rem; line-height: 1.25; margin: 0 0 12px; }
  h2 { font-size: 1.2rem; margin: 32px 0 10px; color: var(--bleu); }
  .chapo { font-size: 1.05rem; color: var(--doux); }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--ligne); border-radius: 10px; overflow: hidden; font-size: .95rem; }
  th, td { padding: 9px 12px; border-bottom: 1px solid var(--ligne); text-align: left; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  th { background: #eff6ff; font-weight: 600; }
  tr.total td { font-weight: 700; background: #f1f5f9; }
  .encadre { background: #fff; border: 1px solid var(--ligne); border-left: 4px solid var(--bleu); border-radius: 10px; padding: 14px 16px; margin: 16px 0; }
  .cta { display: block; margin: 28px 0; padding: 18px; border-radius: 14px; background: var(--encre); color: #e2e8f0; text-decoration: none; }
  .cta strong { display: block; color: #fff; font-size: 1.05rem; }
  .cta span.bouton { display: inline-block; margin-top: 10px; background: #10b981; color: #fff; font-weight: 700; padding: 9px 16px; border-radius: 10px; }
  footer { margin-top: 40px; font-size: .8rem; color: var(--doux); border-top: 1px solid var(--ligne); padding-top: 12px; }
  @media (max-width: 560px) { h1 { font-size: 1.45rem; } th, td { padding: 8px; font-size: .88rem; } }
</style>
</head>
<body>
<main>
  <div class="fil"><a href="/guides/">Guides paie Côte d'Ivoire</a></div>
  <h1>${echapper(h1)}</h1>
  <p class="chapo">${chapo}</p>
  ${corps}
  <a class="cta" href="${cta.lien}"><strong>${echapper(cta.titre)}</strong>${echapper(cta.texte)}<br><span class="bouton">${echapper(cta.bouton)} →</span></a>
  <footer>
    Calculs réalisés avec le moteur de paie ONDA, barème en vigueur depuis le ${B.dateEffet.split('-').reverse().join('/')}.
    Page générée le ${new Date().toLocaleDateString('fr-FR')}. Information générale, ne remplace pas un conseil personnalisé.
  </footer>
</main>
<script>
  // Mesure d'audience anonyme (aucune donnée personnelle).
  try { fetch('/api/stats/evenement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ evenement: 'guide_vu', source: ${JSON.stringify(fichier.replace('.html', ''))}, clientId: localStorage.getItem('onda_client_id') }) }) } catch (e) {}
</script>
</body>
</html>
`
}

// ─── Guide 1 : prime de transport ─────────────────────────────────────────
function guideTransport() {
  const plafond = B.transportExonere.abidjan
  const base = 400000
  const a = bulletin({ salaire_base: base, prime_transport: plafond })
  const b = bulletin({ salaire_base: base, prime_transport: plafond + 20000 })
  const gain = b.netAPayer - a.netAPayer
  return page({
    fichier: 'prime-de-transport-cote-divoire.html',
    titre: `Prime de transport en Côte d'Ivoire : plafond exonéré ${ANNEE}`,
    description: `La prime de transport est exonérée d'ITS et de CNPS jusqu'à ${f(plafond)} FCFA par mois à Abidjan. Au-delà, l'excédent est imposé comme du salaire : exemple chiffré.`,
    h1: `Prime de transport : jusqu'où elle est exonérée`,
    chapo: `En Côte d'Ivoire, l'indemnité de transport n'est ni imposée ni soumise à la CNPS <b>jusqu'à ${f(plafond)} FCFA par mois à Abidjan</b>. Au-delà, l'excédent est traité comme du salaire.`,
    corps: `
  <h2>La règle</h2>
  <div class="encadre">Arrêté du 30 janvier 2020 (secteur privé) : à Abidjan, ${f(plafond)} FCFA par mois exonérés d'ITS et de cotisations CNPS. À Bouaké et dans les autres villes, le plafond est plus bas. Tout ce qui dépasse le plafond rejoint le <b>brut imposable</b>.</div>
  <h2>Exemple : salarié à Abidjan, ${f(base)} FCFA de salaire, célibataire</h2>
  <table>
    <tr><th></th><th class="n">Transport ${f(plafond)}</th><th class="n">Transport ${f(plafond + 20000)}</th></tr>
    <tr><td>Transport exonéré</td><td class="n">${f(a.primeTransport)}</td><td class="n">${f(b.primeTransport)}</td></tr>
    <tr><td>Excédent imposable</td><td class="n">${f(a.primeTransportImposable)}</td><td class="n">${f(b.primeTransportImposable)}</td></tr>
    <tr><td>Brut imposable</td><td class="n">${f(a.brutImposable)}</td><td class="n">${f(b.brutImposable)}</td></tr>
    <tr><td>ITS</td><td class="n">${f(a.salarial.its)}</td><td class="n">${f(b.salarial.its)}</td></tr>
    <tr><td>CNPS salarié</td><td class="n">${f(a.salarial.cnps)}</td><td class="n">${f(b.salarial.cnps)}</td></tr>
    <tr class="total"><td>Net à payer</td><td class="n">${f(a.netAPayer)}</td><td class="n">${f(b.netAPayer)}</td></tr>
  </table>
  <p>Les 20 000 FCFA de transport en plus ne rapportent que <b>${f(gain)} FCFA</b> net au salarié : la différence part en ITS et en CNPS.</p>
  <h2>Pour l'employeur</h2>
  <p>Au-delà du plafond, la prime de transport n'est plus un moyen « sans charges » d'augmenter un salarié : l'excédent coûte autant qu'une hausse de salaire. Le déclarer entièrement exonéré expose à un redressement fiscal et CNPS.</p>`,
    cta: { lien: lienSimulateur({ sb: base, pt: plafond + 20000, zt: 'abidjan' }), titre: 'Faites le calcul avec votre salaire', texte: 'Le simulateur détaille chaque ligne du bulletin et explique chaque montant.', bouton: 'Ouvrir le simulateur' }
  })
}

// ─── Guide 2 : ITS ────────────────────────────────────────────────────────
function guideIts() {
  let prec = 0
  const lignesBareme = B.itsTranches.map(({ plafond, taux }) => {
    const l = `<tr><td>${plafond === Infinity ? `Plus de ${f(prec)}` : `De ${f(prec === 0 ? 0 : prec + 1)} à ${f(plafond)}`}</td><td class="n">${pct(taux)}</td></tr>`
    prec = plafond
    return l
  }).join('')
  const exemples = [
    ['Célibataire, sans enfant', { situation_matrimoniale: 'celibataire', nombre_enfants: 0 }],
    ['Marié(e), sans enfant', { situation_matrimoniale: 'marie', nombre_enfants: 0 }],
    ['Marié(e), 2 enfants', { situation_matrimoniale: 'marie', nombre_enfants: 2 }],
    ['Marié(e), 4 enfants', { situation_matrimoniale: 'marie', nombre_enfants: 4 }]
  ].map(([lib, sit]) => { const c = bulletin({ salaire_base: 400000, prime_transport: 30000, ...sit }); return `<tr><td>${lib}</td><td class="n">${String(c.parts).replace('.', ',')}</td><td class="n">${f(c.salarial.ricf)}</td><td class="n">${f(c.salarial.its)}</td><td class="n">${f(c.netAPayer)}</td></tr>` }).join('')
  return page({
    fichier: 'calcul-its-cote-divoire.html',
    titre: `Calcul de l'ITS ${ANNEE} en Côte d'Ivoire : barème et exemples`,
    description: `Barème de l'impôt sur les traitements et salaires (ITS) en Côte d'Ivoire, réduction pour charges de famille et exemples chiffrés selon la situation.`,
    h1: `Calcul de l'ITS : barème et exemples`,
    chapo: `Depuis la réforme de 2024, l'<b>ITS</b> est l'impôt unique retenu sur les salaires. Il se calcule par tranches sur le brut imposable, puis diminue selon la situation de famille.`,
    corps: `
  <h2>Le barème mensuel</h2>
  <table><tr><th>Brut imposable mensuel (FCFA)</th><th class="n">Taux de la tranche</th></tr>${lignesBareme}</table>
  <p>Chaque taux ne s'applique qu'à la part du salaire comprise dans sa tranche.</p>
  <h2>La réduction pour charges de famille</h2>
  <div class="encadre">Le nombre de parts dépend de la situation : 1 part pour une personne seule, 2 parts pour un couple marié, +0,5 part par enfant (${B.enfantsMaxParts} enfants pris en compte au plus, ${B.partsMax} parts maximum). La réduction vaut <b>(parts − 1) × ${f(B.ricfParDemiPart)} FCFA</b> par mois.</div>
  <h2>Exemples : ${f(400000)} FCFA de salaire de base</h2>
  <table><tr><th>Situation</th><th class="n">Parts</th><th class="n">Réduction</th><th class="n">ITS</th><th class="n">Net</th></tr>${exemples}</table>
  <p>Même salaire, ITS différent : déclarer un mariage ou une naissance au service RH change directement le net.</p>`,
    cta: { lien: lienSimulateur({ sb: 400000, pt: 30000, sm: 'marie', ne: 2 }), titre: 'Calculez votre ITS', texte: 'Saisissez votre salaire et votre situation : le simulateur détaille le calcul tranche par tranche.', bouton: 'Calculer mon ITS' }
  })
}

// ─── Guide 3 : coût employeur ─────────────────────────────────────────────
function guideCoutEmployeur() {
  const lignes = [150000, 300000, 600000, 1200000].map(base => {
    const c = bulletin({ salaire_base: base, prime_transport: 30000 })
    return `<tr><td class="n">${f(base)}</td><td class="n">${f(c.netAPayer)}</td><td class="n">${f(c.patronal.grandTotal)}</td><td class="n">${f(cout(c))}</td></tr>`
  }).join('')
  const C = B.cnps, F = B.fiscalEmployeur
  return page({
    fichier: 'cout-salarie-employeur-cote-divoire.html',
    titre: `Coût d'un salarié pour l'employeur en Côte d'Ivoire (${ANNEE})`,
    description: `Charges patronales en Côte d'Ivoire (CNPS, CMU, CN, FDFP) et coût total d'un salarié selon son salaire : tableau et simulateur gratuit.`,
    h1: `Combien coûte un salarié à l'employeur ?`,
    chapo: `Au-delà du salaire, l'employeur paie des cotisations CNPS, la CMU, la contribution nationale et les taxes FDFP. Voici le coût réel, calculé ligne par ligne.`,
    corps: `
  <h2>Les charges patronales</h2>
  <table>
    <tr><th>Charge</th><th class="n">Taux</th><th>Base</th></tr>
    <tr><td>CNPS — retraite</td><td class="n">${pct(C.tauxRetraitePat)}</td><td>brut, plafonné à ${f(C.plafondRetraite)}</td></tr>
    <tr><td>CNPS — prestations familiales</td><td class="n">${pct(C.tauxPF)}</td><td>brut, plafonné à ${f(C.plafondPfAtAm)}</td></tr>
    <tr><td>CNPS — assurance maternité</td><td class="n">${pct(C.tauxAM)}</td><td>idem</td></tr>
    <tr><td>CNPS — accident du travail</td><td class="n">2 à 5 %</td><td>idem, selon le secteur</td></tr>
    <tr><td>CMU (part employeur)</td><td class="n">${f(B.cmuParPersonne)} FCFA</td><td>par personne couverte</td></tr>
    <tr><td>Contribution nationale (CN)</td><td class="n">${pct(F.tauxCN)}</td><td>brut imposable</td></tr>
    <tr><td>Contribution employeur (CE), expatriés</td><td class="n">${pct(F.tauxCEExpat)}</td><td>brut imposable</td></tr>
    <tr><td>FDFP — apprentissage + formation</td><td class="n">${pct(F.tauxFdfpTA + F.tauxFdfpFPC)}</td><td>brut imposable</td></tr>
  </table>
  <h2>Coût mensuel selon le salaire (salarié local, célibataire, transport 30 000)</h2>
  <table><tr><th class="n">Salaire de base</th><th class="n">Net salarié</th><th class="n">Charges patronales</th><th class="n">Coût total</th></tr>${lignes}</table>
  <p>Le coût total comprend tous les gains versés (salaire, transport…) plus les charges patronales, avec un taux d'accident du travail de 2 %.</p>`,
    cta: { lien: '/?module=hr&type=cout_employeur&country=CI&utm_source=guide', titre: 'Simulez un recrutement ou une augmentation', texte: 'Coût réel d’un poste, effet d’une augmentation sur le net, salaire possible pour un budget donné.', bouton: 'Ouvrir le simulateur employeur' }
  })
}

const guides = [guideTransport(), guideIts(), guideCoutEmployeur()]
const fiches = [
  ['prime-de-transport-cote-divoire.html', 'Prime de transport : jusqu’où elle est exonérée'],
  ['calcul-its-cote-divoire.html', 'Calcul de l’ITS : barème et exemples'],
  ['cout-salarie-employeur-cote-divoire.html', 'Combien coûte un salarié à l’employeur ?']
]

fs.mkdirSync(dossier, { recursive: true })
guides.forEach((html, i) => fs.writeFileSync(path.join(dossier, fiches[i][0]), html))
fs.writeFileSync(path.join(dossier, 'index.html'), page({
  fichier: 'index.html',
  titre: `Guides paie Côte d'Ivoire ${ANNEE}`,
  description: `Guides pratiques sur la paie en Côte d'Ivoire : ITS, prime de transport, coût employeur. Exemples chiffrés et simulateurs gratuits.`,
  h1: `Guides paie Côte d'Ivoire`,
  chapo: 'Comprendre son bulletin et le coût d’un salarié, avec des exemples calculés.',
  corps: `<ul>${fiches.map(([fichier, titre]) => `<li><a href="/guides/${fichier}">${echapper(titre)}</a></li>`).join('')}</ul>`,
  cta: { lien: '/?module=hr&type=habituel&country=CI&utm_source=guide', titre: 'Simulateur de bulletin de paie', texte: 'Gratuit, sans inscription.', bouton: 'Ouvrir le simulateur' }
}))

if (SITE) {
  const urls = ['', ...fiches.map(([f]) => f)].map(f => `  <url><loc>${SITE}/guides/${f}</loc></url>`).join('\n')
  fs.writeFileSync(path.join(racine, 'public', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE}/</loc></url>\n${urls}\n</urlset>\n`)
  fs.writeFileSync(path.join(racine, 'public', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`)
}
console.log(`✓ ${fiches.length + 1} pages générées dans public/guides/${SITE ? ' + sitemap.xml et robots.txt' : ' (SITE_URL absent : pas de sitemap)'}`)
