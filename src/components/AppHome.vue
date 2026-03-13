<script setup>
const emit = defineEmits(['navigate'])

const modules = [
  {
    id: 'loan',
    titre: 'Simulateur de Prêt',
    sous: 'Banques & Crédit',
    description: 'Évaluez votre capacité d\'emprunt et comparez les offres de toutes les banques partenaires.',
    avantages: ['Toutes les banques CI', 'Calcul de mensualité', 'Analyse d\'éligibilité'],
    couleur: '#1d4ed8',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z"/></svg>`,
  },
  {
    id: 'tax',
    titre: 'Calculateur d\'Impôt',
    sous: 'PME — Fiscalité 2024',
    description: 'Calculez exactement ce que vous devez payer selon votre chiffre d\'affaires et votre régime fiscal.',
    avantages: ['4 régimes fiscaux CI', 'Projections 1 à 5 ans', 'Conseils personnalisés'],
    couleur: '#0f766e',
    badge: 'Nouveau',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"/></svg>`,
  },
  {
    id: 'hr',
    titre: 'Espace RH',
    sous: 'Bulletins de Paie',
    description: 'Générez des bulletins de paie conformes au droit ivoirien avec calcul CNPS, ITS et CMU.',
    avantages: ['Calcul CNPS & ITS', 'Bulletins PDF', 'Masse salariale'],
    couleur: '#9333ea',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/></svg>`,
  },
  {
    id: 'outils_pro',
    titre: 'Boîte à Outils Pro',
    sous: 'Finance & Gestion',
    description: 'CNPS, Optimisation des prix, Score de santé et Capacité de crédit.',
    avantages: ['Simulateur CNPS', 'Prix de vente net', 'Score ONDA'],
    couleur: '#2563eb',
    badge: 'Nouveau',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l5.654-4.654m5.896-2.613l.617-.923a2.25 2.25 0 00-.933-3.26 2.25 2.25 0 01-2.206-2.22V5.25A2.25 2.25 0 009 3H5.25A2.25 2.25 0 003 5.25v3.75A2.25 2.25 0 005.25 11.25h2.206c.98 0 1.815.7 2.004 1.66l.047.234c.11.55.421 1.04.869 1.38z"/></svg>`,
  },
]
</script>

<template>
  <div class="home-page">
    <!-- Header -->
    <header class="home-header">
      <div class="home-header-inner">
        <div class="logo-area">
          <div class="logo-icon">
            <img src="/logo.png?v=2" alt="Onda Logo" style="width: 100%; height: 100%; object-fit: contain;">
          </div>
          <div>
            <div class="logo-name">ONDA Lite</div>
            <div class="logo-sub">Côte d'Ivoire</div>
          </div>
        </div>
        <div class="header-tag">Outils financiers</div>
      </div>
    </header>

    <!-- Intro -->
    <div class="home-intro">
      <h1>Votre assistant financier</h1>
      <p>Simple, fiable et adapté aux entreprises ivoiriennes</p>
    </div>

    <!-- Modules -->
    <div class="modules-section">
      <p class="modules-label">Choisissez un outil</p>
      <div class="modules-grid">
        <div
          v-for="m in modules"
          :key="m.id"
          class="module-card"
          @click="emit('navigate', m.id)"
        >
          <div class="card-top">
            <div class="module-icon-wrap" :style="{ color: m.couleur, background: m.couleur + '14' }">
              <span v-html="m.icon" class="module-icon-svg"></span>
            </div>
            <span v-if="m.badge" class="new-badge" :style="{ color: m.couleur, background: m.couleur + '14', border: '1px solid ' + m.couleur + '30' }">{{ m.badge }}</span>
          </div>

          <div class="module-sous" :style="{ color: m.couleur }">{{ m.sous }}</div>
          <h2 class="module-titre">{{ m.titre }}</h2>
          <p class="module-desc">{{ m.description }}</p>

          <ul class="module-avantages">
            <li v-for="a in m.avantages" :key="a">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" :style="{ color: m.couleur }">
                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
              </svg>
              <span>{{ a }}</span>
            </li>
          </ul>

          <div class="card-footer" :style="{ borderTopColor: m.couleur + '20' }">
            <span class="card-cta" :style="{ color: m.couleur }">Ouvrir</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" :style="{ color: m.couleur }">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="home-footer">
      Sources : DGI Côte d'Ivoire &middot; pme.gouv.ci &middot; Code Général des Impôts 2024 &middot; Simulation indicative
    </footer>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }

.home-page {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  font-family: 'Inter', system-ui, sans-serif;
}

/* Header */
.home-header {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 0 1.5rem;
  height: 60px;
  display: flex;
  align-items: center;
}
.home-header-inner {
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logo-area { display: flex; align-items: center; gap: 0.625rem; }
.logo-icon {
  width: 36px; height: 36px;
  /* background: #1d4ed8; */
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: white;
}
.logo-name { font-size: 1rem; font-weight: 700; color: #0f172a; line-height: 1.2; }
.logo-sub { font-size: 0.7rem; color: #94a3b8; font-weight: 500; }
.header-tag { font-size: 0.75rem; color: #64748b; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 0.25rem 0.75rem; border-radius: 20px; }

/* Intro */
.home-intro {
  text-align: center;
  padding: 3rem 1.5rem 1.5rem;
}
.home-intro h1 { font-size: 1.875rem; font-weight: 700; color: #0f172a; margin: 0 0 0.5rem; letter-spacing: -0.02em; }
.home-intro p { color: #64748b; font-size: 1rem; margin: 0; }

/* Modules */
.modules-section { padding: 0 1.5rem 3rem; max-width: 1100px; margin: 0 auto; width: 100%; }
.modules-label { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 1rem; }
.modules-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }

/* Card */
.module-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.module-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.07);
  transform: translateY(-2px);
}

.card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }

.module-icon-wrap {
  width: 44px; height: 44px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.module-icon-svg { width: 22px; height: 22px; display: flex; }
.module-icon-svg :deep(svg) { width: 22px; height: 22px; }

.new-badge { font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 20px; }

.module-sous { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; }
.module-titre { font-size: 1.05rem; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.3; }
.module-desc { font-size: 0.83rem; color: #64748b; line-height: 1.6; flex: 1; margin: 0; }

.module-avantages { list-style: none; padding: 0; margin: 0.25rem 0 0; display: flex; flex-direction: column; gap: 0.3rem; }
.module-avantages li { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: #475569; }

.card-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 1rem;
  margin-top: 0.5rem;
  border-top: 1px solid;
}
.card-cta { font-size: 0.85rem; font-weight: 600; }

/* Footer */
.home-footer {
  text-align: center;
  padding: 1.25rem;
  color: #94a3b8;
  font-size: 0.75rem;
  border-top: 1px solid #f1f5f9;
  margin-top: auto;
}

@media (max-width: 768px) {
  .modules-grid { grid-template-columns: 1fr; }
  .home-intro h1 { font-size: 1.5rem; }
  .home-intro { padding: 2rem 1rem 1.25rem; }
  .modules-section { padding: 0 1rem 2rem; }
}
@media (min-width: 769px) and (max-width: 1024px) {
  .modules-grid { grid-template-columns: 1fr 1fr; }
}
</style>
