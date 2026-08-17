import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { registerSW } from 'virtual:pwa-register'
import './services/toast.js'

// Enregistrement du service worker pour la PWA
registerSW({ immediate: true })

createApp(App).mount('#app')
