<script setup>
defineEmits(['login'])

import { ref, onMounted, computed } from 'vue'
defineEmits(['login'])

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'
const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL || 'https://rh.eonda.online/'
const WHATSAPP_URL = 'https://wa.me/225151144337'

const features = [
  {
    titre: 'Bulletins de Paie',
    description: 'Calcul du salaire net, cotisations CNPS/CNSS et impôts ITS, génération PDF, sans limite mensuelle.',
    couleur: '#c084fc',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/></svg>`
  },
  {
    titre: 'Import en Masse',
    description: 'Générez tous les bulletins de votre effectif d\'un coup à partir d\'un simple fichier Excel.',
    couleur: '#38bdf8',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>`
  },
  {
    titre: 'Solde de Tout Compte',
    description: 'Calcul automatisé des indemnités de fin de contrat, conforme à la législation locale.',
    couleur: '#34d399',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>`
  },
  {
    titre: 'Annuaire & Données Locales',
    description: 'Gestion complète des employés, données stockées sur votre serveur — confidentialité totale.',
    couleur: '#60a5fa',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>`
  },
  {
    titre: 'Dashboards & Analytique',
    description: 'Suivi de la masse salariale, alertes d\'absentéisme et graphiques d\'évolution des rémunérations.',
    couleur: '#f59e0b',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>`
  },
  {
    titre: 'Générateur de Documents',
    description: 'Attestations, contrats, lettres d\'avertissement générés automatiquement depuis l\'annuaire.',
    couleur: '#ec4899',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>`
  },
  {
    titre: 'Calendrier des Congés',
    description: 'Vue globale mensuelle, suivi du solde légal (26 jours/an) et gestion des absences.',
    couleur: '#10b981',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`
  },
  {
    titre: 'Alertes Contrats CDD',
    description: 'Notifications automatiques (J-30, J-15, J-7) avant la fin d\'un contrat à durée déterminée.',
    couleur: '#f43f5e',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"/></svg>`
  }
]

const deferredPrompt = ref(null)
const plans = ref([])
const plansLoading = ref(true)

const priceFree = computed(() => {
  const p = plans.value.find(x => x.code === 'free' || x.code === 'starter')
  return p ? p.price.toLocaleString('fr-FR') : '0'
})

const pricePro = computed(() => {
  const p = plans.value.find(x => x.code === 'pro')
  return p ? p.price.toLocaleString('fr-FR') : '35 000'
})

const priceEnterprise = computed(() => {
  const p = plans.value.find(x => x.code.toLowerCase() === 'entreprise' || x.code === 'enterprise')
  return p ? p.price.toLocaleString('fr-FR') : '300 000'
})

onMounted(async () => {
  // PWA Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
  })

  // Chargement des tarifs
  try {
    const res = await fetch(`${API_URL}/billing/plans`)
    if (res.ok) {
      const data = await res.json()
      plans.value = data.plans || []
    }
  } catch (err) {
    console.error('Erreur chargement des tarifs:', err)
  } finally {
    plansLoading.value = false
  }
})

const handleInstallPWA = async () => {
  if (deferredPrompt.value) {
    deferredPrompt.value.prompt()
    const { outcome } = await deferredPrompt.value.userChoice
    if (outcome === 'accepted') {
      console.log('PWA installée')
    }
    deferredPrompt.value = null
  } else {
    // Si pas de prompt disponible, on redirige vers l'app avec un paramètre pour forcer l'install si possible
    window.location.href = MAIN_APP_URL + '?action=install'
  }
}

</script>

<template>
  <div class="ent-page">
    <header class="ent-header">
      <a :href="MAIN_APP_URL" class="ent-logo-area">
        <img src="/logo.png" alt="ONDA Logo" class="ent-logo-img" />
        <span class="ent-logo-name">ONDA</span>
      </a>
      <div class="ent-header-actions">
        <button @click="$emit('login')" class="ent-login-link" style="border:none; cursor:pointer;">Se connecter</button>
      </div>
    </header>

    <section class="ent-hero">
      <h1 class="ent-hero-title">ONDA RH Pro</h1>
      <p class="ent-hero-sub">
        Toute la gestion de la paie, 13 modules RH complets (Dashboards, Congés, Contrats, Documents) accessibles partout via notre plateforme SaaS sécurisée et 100% Confidentielle.
      </p>
      <div class="ent-hero-actions">
        <button @click="$emit('login')" class="ent-cta-btn" style="border:none; cursor:pointer;">Ouvrir l'application en ligne</button>
        <button @click="handleInstallPWA" class="ent-cta-btn-secondary">Installer l'application (PWA)</button>
      </div>
    </section>

    <section class="ent-features">
      <div v-for="f in features" :key="f.titre" class="ent-feature-card" :style="{ '--f-color': f.couleur }">
        <div class="ent-feature-icon" v-html="f.icon"></div>
        <h3>{{ f.titre }}</h3>
        <p>{{ f.description }}</p>
      </div>
    </section>

    <!-- SECTION DEMO -->
    <section class="ent-demo">
      <div class="demo-header">
        <h2>Un Espace de Travail Moderne et Fluide</h2>
        <p>Découvrez l'interface de ONDA RH Pro, pensée pour une prise en main immédiate.</p>
      </div>
      <div class="demo-gallery">
        <div class="demo-item">
          <img src="/dashboard.png" alt="Bureau ONDA RH Pro" />
          <div class="demo-caption">
            <h4>Le Bureau Central</h4>
            <p>Accédez instantanément à vos 13 modules RH via une interface visuelle claire et personnalisée.</p>
          </div>
        </div>
        <div class="demo-item reverse">
          <div class="demo-caption">
            <h4>Analytique & Dashboards</h4>
            <p>Pilotez votre masse salariale et suivez l'absentéisme en temps réel avec des graphiques interactifs.</p>
          </div>
          <img src="/demo-bureau.png" alt="Dashboard RH Analytique" />
        </div>
        <div class="demo-item">
          <img src="/document.png" alt="Générateur de documents RH" />
          <div class="demo-caption">
            <h4>Générateur de Documents</h4>
            <p>Automatisez la création de vos contrats, attestations et lettres RH, pré-remplis avec les données de vos salariés.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- PRICING SECTION -->
    <section class="ent-pricing-section">
      <div class="pricing-header">
        <h2>Commencez gratuitement, évoluez quand vous êtes prêt</h2>
        <p>Pas de carte bancaire requise pour démarrer. Passez au Pro en quelques secondes.</p>
      </div>

      <div class="pricing-cards">
        <!-- FREE -->
        <div class="pricing-card pricing-free">
          <div class="pricing-card-top">
            <div class="pricing-plan-name">Gratuit</div>
            <div class="pricing-amount">
              <span class="pricing-price">{{ priceFree }}</span>
              <span class="pricing-currency">FCFA / mois</span>
            </div>
            <p class="pricing-desc">Les outils essentiels pour simuler et comprendre la paie, sans engagement.</p>
            <button @click="$emit('login')" class="pricing-cta pricing-cta-free" style="border:none; cursor:pointer; width:100%;">Commencer gratuitement →</button>
          </div>
          <ul class="pricing-features">
            <li><span class="feat-icon feat-ok">✓</span> Simulateur de bulletin de paie</li>
            <li><span class="feat-icon feat-ok">✓</span> Calcul de congés payés</li>
            <li><span class="feat-icon feat-ok">✓</span> Solde de tout compte</li>
            <li><span class="feat-icon feat-ok">✓</span> Paramètres & modèles PDF</li>
            <li><span class="feat-icon feat-ok">✓</span> CI, Bénin, Togo</li>
            <li class="feat-disabled"><span class="feat-icon feat-no">✗</span> Annuaire illimité</li>
            <li class="feat-disabled"><span class="feat-icon feat-no">✗</span> Historique bulletins</li>
            <li class="feat-disabled"><span class="feat-icon feat-no">✗</span> Import Excel en masse</li>
            <li class="feat-disabled"><span class="feat-icon feat-no">✗</span> Alertes contrats CDD</li>
            <li class="feat-disabled"><span class="feat-icon feat-no">✗</span> Générateur de documents</li>
          </ul>
        </div>

        <!-- PRO -->
        <div class="pricing-card pricing-pro">
          <div class="pricing-popular-badge">⭐ Le plus populaire</div>
          <div class="pricing-card-top">
            <div class="pricing-plan-name">Pro (Cloud)</div>
            <div class="pricing-amount">
              <span class="pricing-price" v-if="!plansLoading">{{ pricePro }}</span>
              <span class="pricing-price" v-else>...</span>
              <span class="pricing-currency">FCFA / mois</span>
            </div>
            <p class="pricing-desc">La gestion RH complète pour les PME et cabinets comptables hébergée sur nos serveurs sécurisés.</p>
            <button @click="$emit('login')" class="pricing-cta pricing-cta-pro" style="border:none; cursor:pointer; width:100%;">Démarrer l'essai gratuit →</button>
          </div>
          <ul class="pricing-features">
            <li><span class="feat-icon feat-ok">✓</span> <strong>Tout le plan Gratuit</strong></li>
            <li><span class="feat-icon feat-ok">✓</span> Annuaire employés illimité</li>
            <li><span class="feat-icon feat-ok">✓</span> Historique complet des bulletins</li>
            <li><span class="feat-icon feat-ok">✓</span> Import Excel → bulletins en masse</li>
            <li><span class="feat-icon feat-ok">✓</span> Alertes contrats CDD (J-30, J-15, J-7)</li>
            <li><span class="feat-icon feat-ok">✓</span> Rappels par e-mail automatiques</li>
            <li><span class="feat-icon feat-ok">✓</span> Générateur de documents RH</li>
            <li><span class="feat-icon feat-ok">✓</span> Dashboards & analytique masse salariale</li>
            <li><span class="feat-icon feat-ok">✓</span> Gestion absences & congés (calendrier)</li>
            <li><span class="feat-icon feat-ok">✓</span> Support prioritaire WhatsApp</li>
          </ul>
        </div>

        <!-- ENTREPRISE (LICENCE) -->
        <div class="pricing-card pricing-enterprise">
          <div class="pricing-card-top">
            <div class="pricing-plan-name">Entreprise (Licence)</div>
            <div class="pricing-amount">
              <span class="pricing-price" v-if="!plansLoading">{{ priceEnterprise }}</span>
              <span class="pricing-price" v-else>...</span>
              <span class="pricing-currency">FCFA / achat unique</span>
            </div>
            <p class="pricing-desc">Logiciel complet hors-ligne, installé une seule fois sur votre machine. Sans abonnement, ni frais cachés.</p>
            <a :href="WHATSAPP_URL" target="_blank" class="pricing-cta pricing-cta-enterprise">Contacter les ventes →</a>
          </div>
          <ul class="pricing-features">
            <li><span class="feat-icon feat-ok">✓</span> <strong>Fonctionnalités RH hors-ligne</strong></li>
            <li><span class="feat-icon feat-ok">✓</span> Paiement unique (clé d'activation)</li>
            <li><span class="feat-icon feat-ok">✓</span> Installation autonome via exécutable (.exe)</li>
            <li><span class="feat-icon feat-ok">✓</span> Base de données locale (100% privé)</li>
            <li><span class="feat-icon feat-warn">⚠</span> <em>Aucune mise à jour logicielle</em></li>
            <li><span class="feat-icon feat-warn">⚠</span> <em>Aucune maintenance technique</em></li>
            <li><span class="feat-icon feat-warn">⚠</span> <em>Pas d'accès aux futurs modules</em></li>
            <li><span class="feat-icon feat-warn">⚠</span> <em>Pas d'accès à l'IA</em></li>
          </ul>
        </div>
      </div>

      <p class="pricing-mobile-money">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px; color: #10b981;"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
        Paiement accepté via <strong>Mobile Money</strong> (Wave, Orange Money, MTN MoMo) et carte bancaire.
      </p>
    </section>

    <section class="ent-contact">
      <h2>Une question avant de vous lancer ?</h2>
      <div class="ent-contact-links">
        <a :href="WHATSAPP_URL" target="_blank" rel="noopener" class="ent-contact-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.23 8.23 0 0 1-1.26-4.37c0-4.55 3.7-8.25 8.26-8.25 2.21 0 4.28.86 5.84 2.42a8.2 8.2 0 0 1 2.42 5.84c0 4.55-3.71 8.23-8.26 8.23z"/></svg>
          WhatsApp
        </a>
        <a href="mailto:info@eonda.online" class="ent-contact-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>
          info@eonda.online
        </a>
      </div>
    </section>

    <footer class="ent-footer">
      <p>ONDA — Plateforme Financière &amp; Paie</p>
      <p>Contact : <a href="mailto:info@eonda.online">info@eonda.online</a></p>
    </footer>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

.ent-page {
  min-height: 100vh;
  background: #f8fafc;
  color: #0f172a;
  font-family: 'Outfit', system-ui, -apple-system, sans-serif;
  overflow-x: hidden;
}

.ent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 4rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  position: sticky;
  top: 0;
  z-index: 50;
}

.ent-logo-area {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
}

.ent-logo-img {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.ent-logo-name {
  font-weight: 800;
  font-size: 1.3rem;
  background: linear-gradient(135deg, #4f46e5 0%, #ec4899 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.02em;
}

.ent-feature-card p {
  color: #64748b;
  font-size: 1.05rem;
  line-height: 1.6;
  margin: 0;
}

/* DEMO SECTION */
.ent-demo {
  padding: 5rem 2rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
}

.demo-header {
  text-align: center;
  max-width: 700px;
  margin: 0 auto 4rem auto;
}

.demo-header h2 {
  color: #0f172a;
  font-size: 2.25rem;
  margin-bottom: 1rem;
}

.demo-header p {
  color: #64748b;
  font-size: 1.1rem;
}

.demo-gallery {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 4rem;
}

.demo-item {
  display: flex;
  align-items: center;
  gap: 3rem;
  background: #ffffff;
  padding: 2rem;
  border-radius: 24px;
  box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08);
  border: 1px solid #f1f5f9;
}

.demo-item.reverse {
  flex-direction: row-reverse;
}

.demo-item img {
  width: 55%;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  border: 1px solid #e2e8f0;
  object-fit: cover;
}

.demo-caption {
  flex: 1;
}

.demo-caption h4 {
  font-size: 1.75rem;
  color: #0f172a;
  margin-bottom: 1rem;
}

.demo-caption p {
  color: #475569;
  font-size: 1.1rem;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .demo-item, .demo-item.reverse {
    flex-direction: column;
    padding: 1.5rem;
  }
  .demo-item img {
    width: 100%;
  }
}

.ent-header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.ent-login-link {
  color: #0f172a;
  font-size: 0.95rem;
  font-weight: 700;
  text-decoration: none;
  background: #f1f5f9;
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  transition: all 0.2s;
}

.ent-login-link:hover {
  background: #e2e8f0;
  color: #4f46e5;
}

.ent-back-link {
  color: #64748b;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}

.ent-back-link:hover {
  color: #4f46e5;
}

.ent-hero {
  text-align: center;
  padding: 8rem 1.5rem 6rem;
  max-width: 900px;
  margin: 0 auto;
  position: relative;
}

.ent-hero::before {
  content: '';
  position: absolute;
  top: -100px;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(236, 72, 153, 0.05) 50%, transparent 70%);
  z-index: -1;
  pointer-events: none;
}

.ent-hero-badge {
  display: inline-block;
  background: rgba(238, 242, 255, 0.8);
  color: #4f46e5;
  border: 1px solid rgba(199, 210, 254, 0.6);
  font-weight: 700;
  font-size: 0.85rem;
  padding: 0.4rem 1rem;
  border-radius: 99px;
  margin-bottom: 1.5rem;
  backdrop-filter: blur(4px);
}

.ent-hero-title {
  font-size: 4.5rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  margin: 0 0 1.5rem 0;
  color: #0f172a;
  line-height: 1.1;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.ent-hero-sub {
  font-size: 1.25rem;
  color: #475569;
  line-height: 1.6;
  margin: 0 auto 3rem auto;
  max-width: 700px;
}

.ent-hero-actions {
  display: flex;
  gap: 1.25rem;
  justify-content: center;
  flex-wrap: wrap;
}

.ent-cta-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #4f46e5 0%, #ec4899 100%);
  color: #ffffff;
  text-decoration: none;
  padding: 1rem 2.5rem;
  border-radius: 99px;
  font-weight: 700;
  font-size: 1.05rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
  cursor: pointer;
  box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.4);
}

.ent-cta-btn:hover {
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 20px 30px -10px rgba(236, 72, 153, 0.5);
}

.ent-cta-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  color: #0f172a;
  text-decoration: none;
  padding: 1rem 2.5rem;
  border-radius: 99px;
  font-weight: 700;
  font-size: 1.05rem;
  border: 1px solid #cbd5e1;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

.ent-cta-btn-secondary:hover {
  background: #ffffff;
  border-color: #94a3b8;
  transform: translateY(-3px);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
}

.ent-features {
  padding: 6rem 2rem;
  max-width: 1300px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2.5rem;
}

.ent-feature-card {
  background: #ffffff;
  border: 1px solid #f1f5f9;
  border-radius: 1.5rem;
  padding: 2.5rem 2rem;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
}

.ent-feature-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.08);
  border-color: var(--f-color, #4f46e5);
}

.ent-feature-card::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background: var(--f-color, #4f46e5);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.ent-feature-card:hover::after {
  opacity: 1;
}

.ent-feature-icon {
  width: 56px;
  height: 56px;
  color: var(--f-color, #4f46e5);
  margin-bottom: 1.5rem;
  background: rgba(248, 250, 252, 1);
  padding: 12px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ent-feature-card h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
}

.ent-feature-card p {
  margin: 0;
  font-size: 1rem;
  color: #64748b;
  line-height: 1.6;
}

.ent-compare {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem 1.5rem 3rem;
  text-align: center;
}

.ent-compare h2 {
  font-size: 1.4rem;
  font-weight: 800;
  margin-bottom: 1.5rem;
}

.ent-compare-table-wrap {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  background: #ffffff;
}

.ent-compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  text-align: left;
}

.ent-compare-table th {
  background: #f8fafc;
  padding: 0.85rem 1.1rem;
  font-weight: 800;
  color: #0f172a;
  border-bottom: 1px solid #e2e8f0;
}

.ent-compare-table td {
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid #f1f5f9;
  color: #475569;
}

.ent-compare-critere {
  font-weight: 700;
  color: #0f172a !important;
}

.ent-compare-entreprise {
  color: #4f46e5 !important;
  font-weight: 600;
}

.ent-pricing {
  max-width: 500px;
  margin: 0 auto;
  padding: 1rem 1.5rem 3rem;
}

.ent-pricing-card {
  background: #0f172a;
  color: #ffffff;
  border-radius: 1.25rem;
  padding: 2rem;
  text-align: center;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
}

.ent-pricing-label {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.ent-pricing-amount {
  font-size: 2.5rem;
  font-weight: 800;
  margin: 0.5rem 0;
}

.ent-pricing-amount span {
  font-size: 1.1rem;
  font-weight: 600;
  color: #94a3b8;
}

.ent-pricing-sub {
  font-size: 0.85rem;
  color: #94a3b8;
  margin-bottom: 1.5rem;
}

.ent-pricing-list {
  list-style: none;
  padding: 0;
  margin: 0;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

/* Styles pour les sections supprimées (pricing, faq, etc) retirés */

.ent-contact {
  max-width: 500px;
  margin: 0 auto;
  padding: 1rem 1.5rem 3rem;
  text-align: center;
}

.ent-contact h2 {
  font-size: 1.15rem;
  font-weight: 800;
  margin-bottom: 1.25rem;
}

.ent-contact-links {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}

.ent-contact-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  color: #0f172a;
  font-weight: 700;
  font-size: 0.875rem;
  padding: 0.65rem 1.25rem;
  border-radius: 0.6rem;
  text-decoration: none;
  transition: all 0.2s;
}

.ent-contact-link:hover {
  border-color: #4f46e5;
  color: #4f46e5;
}

.ent-footer {
  text-align: center;
  padding: 2rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  color: #94a3b8;
  font-size: 0.8rem;
}

.ent-footer a {
  color: #4f46e5;
  text-decoration: none;
}

@media (max-width: 640px) {
  .ent-hero-title {
    font-size: 1.6rem;
  }
}

/* ═══ PRICING SECTION ═══ */
.ent-pricing-section {
  padding: 6rem 2rem;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border-top: 1px solid #e2e8f0;
}

.pricing-header {
  text-align: center;
  max-width: 650px;
  margin: 0 auto 4rem auto;
}

.pricing-badge {
  display: inline-block;
  background: #eef2ff;
  color: #4f46e5;
  border: 1px solid #c7d2fe;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.35rem 0.9rem;
  border-radius: 99px;
  margin-bottom: 1.25rem;
  letter-spacing: 0.03em;
}

.pricing-header h2 {
  font-size: 2.25rem;
  font-weight: 900;
  color: #0f172a;
  margin: 0 0 1rem 0;
  letter-spacing: -0.02em;
}

.pricing-header p {
  color: #64748b;
  font-size: 1.05rem;
}

.pricing-cards {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  align-items: start;
}

.pricing-card {
  background: #ffffff;
  border-radius: 1.5rem;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  position: relative;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03);
}

.pricing-pro {
  border: 2px solid #4f46e5;
  box-shadow: 0 20px 40px -10px rgba(79, 70, 229, 0.2);
  transform: scale(1.02);
}

.pricing-enterprise {
  border: 2px solid #0f172a;
}

.pricing-popular-badge {
  background: linear-gradient(135deg, #4f46e5 0%, #ec4899 100%);
  color: white;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.5rem;
  letter-spacing: 0.02em;
}

.pricing-card-top {
  padding: 2rem;
  border-bottom: 1px solid #f1f5f9;
}

.pricing-plan-name {
  font-size: 1rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin-bottom: 1rem;
}

.pricing-pro .pricing-plan-name {
  color: #4f46e5;
}

.pricing-amount {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.pricing-price {
  font-size: 2.75rem;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: -0.03em;
}

.pricing-currency {
  font-size: 0.9rem;
  color: #64748b;
  font-weight: 600;
}

.pricing-desc {
  color: #64748b;
  font-size: 0.9rem;
  line-height: 1.5;
  margin: 0 0 1.5rem 0;
}

.pricing-cta {
  display: block;
  text-align: center;
  padding: 0.85rem 1.5rem;
  border-radius: 99px;
  font-weight: 700;
  font-size: 0.95rem;
  text-decoration: none;
  transition: all 0.2s;
}

.pricing-cta-free {
  background: #f1f5f9;
  color: #0f172a;
  border: 1px solid #e2e8f0;
}

.pricing-cta-free:hover {
  background: #e2e8f0;
}

.pricing-cta-enterprise {
  background: #0f172a;
  color: #ffffff;
  border: 1px solid #0f172a;
}

.pricing-cta-enterprise:hover {
  background: #1e293b;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
}

.pricing-cta-pro {
  background: linear-gradient(135deg, #4f46e5 0%, #ec4899 100%);
  color: white;
  box-shadow: 0 8px 20px -5px rgba(79, 70, 229, 0.4);
}

.pricing-cta-pro:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 25px -5px rgba(79, 70, 229, 0.5);
}

.pricing-features {
  list-style: none;
  padding: 1.75rem 2rem;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pricing-features li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.9rem;
  color: #334155;
}

.feat-disabled {
  color: #94a3b8 !important;
}

.feat-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 800;
  flex-shrink: 0;
}

.feat-ok {
  background: #d1fae5;
  color: #059669;
}

.feat-no {
  background: #f1f5f9;
  color: #94a3b8;
}

.pricing-mobile-money {
  text-align: center;
  color: #64748b;
  font-size: 0.9rem;
  margin-top: 2.5rem;
}

@media (max-width: 720px) {
  .pricing-cards {
    grid-template-columns: 1fr;
  }
  .pricing-pro {
    transform: none;
  }
}
</style>
