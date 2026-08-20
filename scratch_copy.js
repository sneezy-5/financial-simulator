const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../enterprise-site/src/App.vue');
const dest = path.join(__dirname, '../src/components/LandingPage.vue');

let content = fs.readFileSync(src, 'utf8');

content = content.replace(/<a :href="MAIN_APP_URL" class="ent-login-link">Se connecter<\/a>/g, `<button @click="$emit('login')" class="ent-login-link" style="background: none; border: none; font: inherit; cursor: pointer;">Se connecter</button>`);
content = content.replace(/<a :href="MAIN_APP_URL" class="ent-cta-btn">Ouvrir l'application en ligne<\/a>/g, `<button @click="$emit('login')" class="ent-cta-btn" style="border: none; font: inherit; cursor: pointer;">Ouvrir l'application en ligne</button>`);
content = content.replace(/<a :href="MAIN_APP_URL" class="pricing-cta pricing-cta-free">Commencer gratuitement →<\/a>/g, `<button @click="$emit('login')" class="pricing-cta pricing-cta-free" style="border: none; font: inherit; cursor: pointer; width: 100%;">Commencer gratuitement →</button>`);
content = content.replace(/<a :href="MAIN_APP_URL" class="pricing-cta pricing-cta-pro">Démarrer l'essai gratuit →<\/a>/g, `<button @click="$emit('login')" class="pricing-cta pricing-cta-pro" style="border: none; font: inherit; cursor: pointer; width: 100%;">Démarrer l'essai gratuit →</button>`);

content = content.replace(/<script setup>/g, `<script setup>\ndefineEmits(['login'])\n`);

fs.writeFileSync(dest, content);
console.log('Fichier copié et adapté avec succès.');
