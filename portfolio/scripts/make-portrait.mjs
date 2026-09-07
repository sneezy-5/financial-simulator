// Génère un portrait PLACEHOLDER dans src/assets/portrait.jpg (800x1000).
// Remplace ensuite ce fichier par ta vraie photo (même nom, même dossier).
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const initials = (process.argv[2] || 'AA')
  .replace(/[^\p{L}\s]/gu, '')
  .trim()
  .split(/\s+/)
  .map((w) => w[0])
  .slice(0, 2)
  .join('')
  .toUpperCase();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f766e"/>
      <stop offset="1" stop-color="#134e4a"/>
    </linearGradient>
  </defs>
  <rect width="800" height="1000" fill="url(#g)"/>
  <circle cx="400" cy="400" r="150" fill="rgba(255,255,255,0.14)"/>
  <text x="400" y="400" fill="#fff" font-family="Georgia, serif" font-size="130"
        text-anchor="middle" dominant-baseline="central">${initials}</text>
  <text x="400" y="640" fill="rgba(255,255,255,0.75)" font-family="Arial, sans-serif"
        font-size="30" text-anchor="middle">photo à remplacer</text>
</svg>`;

await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(join(__dirname, '..', 'src', 'assets', 'portrait.jpg'));
console.log('src/assets/portrait.jpg généré (placeholder)');
