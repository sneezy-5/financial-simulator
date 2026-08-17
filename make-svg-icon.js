const fs = require('fs');
try {
  const logo = fs.readFileSync('public/logo.png');
  const base64 = logo.toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#ffffff" rx="64" />
  <image href="data:image/png;base64,${base64}" x="32" y="32" width="448" height="448" preserveAspectRatio="xMidYMid meet" />
</svg>`;
  fs.writeFileSync('public/icon.svg', svg);
  console.log('icon.svg generated successfully');
} catch(e) {
  console.error(e);
}
