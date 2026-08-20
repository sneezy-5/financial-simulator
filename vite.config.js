import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'

try {
  const src = path.join(__dirname, 'enterprise-site/src/App.vue');
  const dest = path.join(__dirname, 'src/components/LandingPage.vue');
  if (fs.existsSync(src)) {
    let content = fs.readFileSync(src, 'utf8');
    content = content.replace(/<a :href="MAIN_APP_URL" class="ent-login-link">Se connecter<\/a>/g, `<button @click="$emit('login')" class="ent-login-link" style="background: none; border: none; font: inherit; cursor: pointer;">Se connecter</button>`);
    content = content.replace(/<a :href="MAIN_APP_URL" class="ent-cta-btn">Ouvrir l'application en ligne<\/a>/g, `<button @click="$emit('login')" class="ent-cta-btn" style="border: none; font: inherit; cursor: pointer;">Ouvrir l'application en ligne</button>`);
    content = content.replace(/<a :href="MAIN_APP_URL" class="pricing-cta pricing-cta-free">Commencer gratuitement →<\/a>/g, `<button @click="$emit('login')" class="pricing-cta pricing-cta-free" style="border: none; font: inherit; cursor: pointer; width: 100%;">Commencer gratuitement →</button>`);
    content = content.replace(/<a :href="MAIN_APP_URL" class="pricing-cta pricing-cta-pro">Démarrer l'essai gratuit →<\/a>/g, `<button @click="$emit('login')" class="pricing-cta pricing-cta-pro" style="border: none; font: inherit; cursor: pointer; width: 100%;">Démarrer l'essai gratuit →</button>`);
    content = content.replace(/<script setup>/g, `<script setup>\ndefineEmits(['login'])\n`);
    fs.writeFileSync(dest, content);
    console.log('--- LandingPage.vue généré avec succès ---');
  }
} catch(e) {
  console.error(e);
}

import { VitePWA } from 'vite-plugin-pwa'


// https://vite.dev/config/
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
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
