// Génère public/og-default.png (1200x630) à partir d'un SVG.
// À relancer si tu changes le nom : `node scripts/make-og.mjs "Ton Nom"`
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] || 'Portfolio';
const tagline = process.argv[3] || "Concepteur d'outils financiers";

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#14130f"/>
  <rect x="0" y="0" width="1200" height="8" fill="#0f766e"/>
  <text x="80" y="300" fill="#f4f1ea" font-family="Georgia, serif" font-size="76" font-weight="500">${esc(name)}</text>
  <text x="80" y="370" fill="#c3bdb0" font-family="Arial, sans-serif" font-size="34">${esc(tagline)}</text>
  <text x="80" y="560" fill="#928c7e" font-family="Arial, sans-serif" font-size="26">Paie · Crédit · Fiscalité · Afrique de l'Ouest</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(join(__dirname, '..', 'public', 'og-default.png'));
console.log('public/og-default.png généré');
