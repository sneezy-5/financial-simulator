import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { registerSW } from 'virtual:pwa-register'
import './services/toast.js'
import VueApexCharts from 'vue3-apexcharts'

// Enregistrement du service worker pour la PWA
registerSW({ immediate: true })

const app = createApp(App)
app.use(VueApexCharts)
app.component('apexchart', VueApexCharts)
app.mount('#app')
