import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { VitePWA } from 'vite-plugin-pwa'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const assetsToCopy = ['logo.png', 'dashboard.png', 'demo-bureau.png', 'document.png', 'favicon.ico'];
  const sourceDir = path.join(__dirname, 'enterprise-site/public');
  const destDir = path.join(__dirname, 'public');
  
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (const asset of assetsToCopy) {
    const srcFile = path.join(sourceDir, asset);
    const destFile = path.join(destDir, asset);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
      console.log(`Copié ${asset} dans public/`);
    }
  }
} catch(e) {
  console.error(e);
}// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: false
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      }
    }
  }
})
