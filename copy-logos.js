const fs = require('fs');

fs.copyFileSync(
  'C:/Users/HP/.gemini/antigravity-ide/brain/484f6ab3-4fb8-4cd4-ab53-5e1e42f51353/pwa_logo_192_1786630280608.png',
  'public/pwa-192x192.png'
);

fs.copyFileSync(
  'C:/Users/HP/.gemini/antigravity-ide/brain/484f6ab3-4fb8-4cd4-ab53-5e1e42f51353/pwa_logo_512_1786630296179.png',
  'public/pwa-512x512.png'
);

console.log("Logos copied!");
