<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
defineEmits(['login', 'legal'])

const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL || 'https://rh.eonda.online/'
const WHATSAPP_URL = 'https://wa.me/2250151144337'

const stats = [
  { valeur: '15', label: 'modules RH' },
  { valeur: 'CI', label: 'droit du travail ivoirien' },
  { valeur: '0 FCFA', label: 'pour démarrer' },
  { valeur: 'PDF + Excel', label: 'exports natifs' }
]

const features = [
  {
    titre: 'Bulletins de Paie',
    description: 'Salaire net, cotisations CNPS/CNSS, impôts ITS, génération PDF — sans limite mensuelle.',
    couleur: '#10bf9a',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/></svg>`
  },
  {
    titre: 'Import en Masse',
    description: 'Tous les bulletins de votre effectif générés d\'un coup depuis un simple fichier Excel.',
    couleur: '#38bdf8',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>`
  },
  {
    titre: 'Déclarations Sociales',
    description: 'Bordereau CNPS et liste nominative depuis vos périodes de paie, PDF ou Excel, prêts pour e-CNPS.',
    couleur: '#0d9488',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 3.75h3M9 8.25h6M5.25 3h13.5A2.25 2.25 0 0 1 21 5.25v13.5A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V5.25A2.25 2.25 0 0 1 5.25 3Z"/></svg>`
  },
  {
    titre: 'Solde de Tout Compte',
    description: 'Indemnités de fin de contrat calculées automatiquement, conformes à la législation locale.',
    couleur: '#34d399',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>`
  },
  {
    titre: 'Annuaire des Employés',
    description: 'État civil, contrats, rémunération et situation familiale de chaque salarié, centralisés.',
    couleur: '#60a5fa',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>`
  },
  {
    titre: 'Dashboards & Analytique',
    description: 'Masse salariale, absentéisme et évolution des rémunérations, en graphiques temps réel.',
    couleur: '#f59e0b',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>`
  },
  {
    titre: 'Générateur de Documents',
    description: 'Attestations, contrats et lettres RH pré-remplis avec les données de vos salariés.',
    couleur: '#ec4899',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>`
  },
  {
    titre: 'Calendrier des Congés',
    description: 'Vue mensuelle globale, solde légal (26 j/an) et gestion des absences par salarié.',
    couleur: '#10b981',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`
  },
  {
    titre: 'Alertes Contrats CDD',
    description: 'Notifications automatiques à J-30, J-15 et J-7 avant l\'échéance d\'un contrat.',
    couleur: '#f43f5e',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"/></svg>`
  }
]

const showcases = [
  {
    img: '/dashboard.png',
    tag: 'Le Bureau',
    titre: 'Vos 15 modules dans une seule fenêtre',
    texte: 'Une interface pensée comme un poste de travail : vous ouvrez, vous cliquez, c\'est prêt. Aucune formation nécessaire.',
    couleur: '#10bf9a'
  },
  {
    img: '/demo-bureau.png',
    tag: 'Analytique',
    titre: 'Pilotez votre masse salariale en temps réel',
    texte: 'Coût employeur, charges patronales, taux d\'absentéisme, poids des heures supplémentaires — avec des seuils d\'alerte que vous fixez vous-même.',
    couleur: '#6366f1'
  },
  {
    img: '/document.png',
    tag: 'Documents',
    titre: 'Contrats et attestations, pré-remplis',
    texte: 'Générez CDI, CDD, attestations de travail et lettres RH depuis l\'annuaire, aux articles du Code du travail local.',
    couleur: '#ec4899'
  }
]

const faqs = [
  {
    q: 'Le calcul est-il à jour ?',
    r: 'Oui — barèmes CNPS, ITS et FDFP de la Côte d\'Ivoire à jour, conformes au Code du travail ivoirien.'
  },
  {
    q: 'C\'est vraiment gratuit ?',
    r: 'Le simulateur de bulletin, le calcul de congés payés et le solde de tout compte sont 100 % gratuits — rien à payer, jamais. L\'offre Pro ajoute l\'annuaire illimité, l\'import en masse, les déclarations sociales et les alertes automatiques.'
  },
  {
    q: 'Comment j\'importe mes salariés ?',
    r: 'Un seul classeur Excel — entreprise, employés, contrats — que vous téléchargez pré-formaté depuis l\'application. L\'import génère tous les bulletins du mois en une fois.'
  },
  {
    q: 'Les déclarations CNPS sont-elles incluses ?',
    r: 'Oui : bordereau d\'appel de cotisation et liste nominative, produits depuis vos périodes de paie, en PDF ou Excel, prêts à reporter sur e-CNPS.'
  },
  {
    q: 'Ça fonctionne hors-ligne ?',
    r: 'Oui, ONDA RH Pro s\'installe comme une application (PWA) sur ordinateur et mobile, avec un mode hors-ligne.'
  }
]

const deferredPrompt = ref(null)
let io = null
let safety = null

function onBeforeInstall (e) {
  e.preventDefault()
  deferredPrompt.value = e
}

const revealAll = () => {
  document.querySelectorAll('.ent-page .reveal').forEach((el) => el.classList.add('in'))
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', onBeforeInstall)

  // Sans IntersectionObserver, on montre tout immédiatement : jamais de
  // contenu bloqué en opacity:0 si l'animation ne peut pas se déclencher.
  if (typeof IntersectionObserver === 'undefined') {
    revealAll()
    return
  }

  io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in')
        io.unobserve(entry.target)
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })

  requestAnimationFrame(() => {
    document.querySelectorAll('.ent-page .reveal').forEach((el) => io.observe(el))
  })

  // Filet de sécurité : tout est visible au plus tard après 3 s.
  safety = setTimeout(revealAll, 3000)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  if (io) io.disconnect()
  if (safety) clearTimeout(safety)
})

const handleInstallPWA = async () => {
  if (deferredPrompt.value) {
    deferredPrompt.value.prompt()
    const { outcome } = await deferredPrompt.value.userChoice
    if (outcome === 'accepted') console.log('PWA installée')
    deferredPrompt.value = null
  } else {
    window.location.href = MAIN_APP_URL + '?action=install'
  }
}
</script>

<template>
  <div class="ent-page">
    <!-- ══ HEADER ══ -->
    <header class="ent-header">
      <a :href="MAIN_APP_URL" class="ent-logo-area">
        <img src="/logo.png" alt="ONDA" class="ent-logo-img" />
        <span class="ent-logo-name">ONDA</span>
      </a>
      <nav class="ent-nav">
        <a href="#modules" class="ent-nav-link">Modules</a>
        <a href="#apercu" class="ent-nav-link">Aperçu</a>
        <a href="#tarifs" class="ent-nav-link">Tarifs</a>
        <a href="#faq" class="ent-nav-link">FAQ</a>
      </nav>
      <div class="ent-header-actions">
        <button @click="$emit('login')" class="ent-login-link">Se connecter</button>
        <button @click="$emit('login')" class="btn btn-mint btn-sm">Ouvrir l'app</button>
      </div>
    </header>

    <!-- ══ HERO ══ -->
    <section class="ent-hero">
      <div class="ent-hero-blob ent-hero-blob-a"></div>
      <div class="ent-hero-blob ent-hero-blob-b"></div>

      <div class="ent-hero-inner reveal">
        <h1 class="ent-hero-title">Votre paie<br />mérite mieux.</h1>
        <p class="ent-hero-sub">
          Bulletins, congés, contrats, déclarations CNPS/ITS/FDFP&nbsp;: 15 modules RH conformes
          au droit du travail ivoirien, dans une plateforme claire — accessible partout.
        </p>
        <div class="ent-hero-actions">
          <button @click="$emit('login')" class="btn btn-ink">Ouvrir l'application</button>
          <button @click="handleInstallPWA" class="btn btn-ghost">Installer la PWA</button>
        </div>
        <div class="ent-hero-chips">
          <span>CNPS</span><span>ITS</span><span>FDFP</span><span>CDI / CDD</span><span>100 % gratuit</span>
        </div>
      </div>

      <div class="ent-hero-shot reveal">
        <img src="/dashboard.png" alt="Le bureau ONDA RH Pro" loading="lazy" />
      </div>
    </section>

    <!-- ══ BANDE STATS ══ -->
    <section class="ent-stats reveal">
      <div class="ent-stats-inner">
        <div v-for="s in stats" :key="s.label" class="ent-stat">
          <div class="ent-stat-value">{{ s.valeur }}</div>
          <div class="ent-stat-label">{{ s.label }}</div>
        </div>
      </div>
    </section>

    <!-- ══ MODULES (BENTO) ══ -->
    <section id="modules" class="ent-section ent-section-cream">
      <div class="ent-section-head reveal">
        <span class="ent-kicker">Les modules</span>
        <h2>Tout le cycle de paie,<br />au même endroit.</h2>
        <p>Du contrat d'embauche à la déclaration CNPS, chaque étape est couverte — et parle la même donnée.</p>
      </div>

      <div class="ent-bento reveal">
        <article
          v-for="(f, i) in features"
          :key="f.titre"
          class="ent-feat"
          :class="{ 'ent-feat-lead': i === 0 }"
          :style="{ '--c': f.couleur }"
        >
          <span class="ent-feat-icon" v-html="f.icon"></span>
          <h3>{{ f.titre }}</h3>
          <p>{{ f.description }}</p>
        </article>
      </div>
    </section>

    <!-- ══ APERÇU PRODUIT ══ -->
    <section id="apercu" class="ent-section">
      <div class="ent-section-head reveal">
        <span class="ent-kicker">L'aperçu</span>
        <h2>Une prise en main immédiate.</h2>
      </div>

      <div class="ent-shows">
        <div
          v-for="(sh, i) in showcases"
          :key="sh.titre"
          class="ent-show reveal"
          :class="{ 'ent-show-rev': i % 2 === 1 }"
          :style="{ '--c': sh.couleur }"
        >
          <div class="ent-show-media">
            <img :src="sh.img" :alt="sh.titre" loading="lazy" />
          </div>
          <div class="ent-show-text">
            <span class="ent-show-tag">{{ sh.tag }}</span>
            <h3>{{ sh.titre }}</h3>
            <p>{{ sh.texte }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ POURQUOI ══ -->
    <section class="ent-section ent-section-ink">
      <div class="ent-section-head reveal">
        <span class="ent-kicker ent-kicker-light">Pourquoi ONDA</span>
        <h2>Conçu pour la paie d'ici.</h2>
      </div>
      <div class="ent-why reveal">
        <div class="ent-why-item">
          <h3>Conforme</h3>
          <p>Barèmes et libellés officiels du droit du travail ivoirien, béninois et togolais — mis à jour à chaque réforme.</p>
        </div>
        <div class="ent-why-item">
          <h3>Rapide</h3>
          <p>Un classeur Excel, un clic&nbsp;: tout l'effectif est traité, les bulletins et l'état de paie sortent ensemble.</p>
        </div>
        <div class="ent-why-item">
          <h3>Partout</h3>
          <p>Sur le web, ou installée en application sur votre poste et votre téléphone, avec un mode hors-ligne.</p>
        </div>
      </div>
    </section>

    <!-- ══ TARIFS ══ -->
    <section id="tarifs" class="ent-section ent-section-cream">
      <div class="ent-section-head reveal">
        <span class="ent-kicker">Les tarifs</span>
        <h2>Gratuit,<br />vraiment gratuit.</h2>
        <p>Les outils essentiels pour gérer votre paie, dès aujourd'hui — rien à payer, rien à installer, aucun engagement.</p>
      </div>

      <div class="ent-pricing reveal">
        <div class="ent-plan">
          <div class="ent-plan-name">Gratuit</div>
          <button @click="$emit('login')" class="btn btn-ink btn-block">Commencer gratuitement →</button>
          <ul class="ent-plan-list">
            <li>Simulateur de bulletin de paie</li>
            <li>Calcul de congés payés</li>
            <li>Solde de tout compte</li>
            <li>Paramètres &amp; modèles PDF</li>
            <li>Barèmes Côte d'Ivoire à jour</li>
          </ul>
          <p class="ent-plan-teaser">
            Votre équipe grandit&nbsp;? L'offre <strong>Pro</strong> ajoute l'annuaire illimité, l'import en masse,
            les déclarations sociales et les alertes automatiques.
            <a href="#" @click.prevent="$emit('login')">En savoir plus →</a>
          </p>
        </div>

        <div class="ent-plan ent-plan-custom">
          <div class="ent-plan-custom-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          </div>
          <h3>Une offre sur mesure&nbsp;?</h3>
          <p>Version installable avec vos propres modèles de documents, personnalisés à votre image.</p>
          <a :href="WHATSAPP_URL" target="_blank" rel="noopener" class="btn btn-mint btn-block">Nous contacter →</a>
        </div>
      </div>
    </section>

    <!-- ══ FAQ ══ -->
    <section id="faq" class="ent-section">
      <div class="ent-section-head reveal">
        <span class="ent-kicker">Questions fréquentes</span>
        <h2>Tout ce qu'il faut savoir.</h2>
      </div>
      <div class="ent-faq reveal">
        <details v-for="f in faqs" :key="f.q" class="ent-faq-item">
          <summary>
            {{ f.q }}
            <svg class="ent-faq-chev" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </summary>
          <p>{{ f.r }}</p>
        </details>
      </div>
    </section>

    <!-- ══ CTA FINAL ══ -->
    <section class="ent-cta-band reveal">
      <h2>Prêt à simplifier votre paie&nbsp;?</h2>
      <p>Créez votre espace en une minute. Aucun paiement, aucune installation obligatoire.</p>
      <div class="ent-cta-band-actions">
        <button @click="$emit('login')" class="btn btn-ink">Ouvrir l'application</button>
        <button @click="handleInstallPWA" class="btn btn-ghost btn-ghost-dark">Installer la PWA</button>
      </div>
    </section>

    <!-- ══ FOOTER ══ -->
    <footer class="ent-footer">
      <div class="ent-footer-grid">
        <div class="ent-footer-brand">
          <span class="ent-logo-name">ONDA</span>
          <p>Plateforme de paie &amp; RH pour la Côte d'Ivoire.</p>
        </div>
        <div class="ent-footer-col">
          <h4>Produit</h4>
          <a href="#modules">Modules</a>
          <a href="#tarifs">Tarifs</a>
          <button @click="$emit('login')">Se connecter</button>
        </div>
        <div class="ent-footer-col">
          <h4>Légal</h4>
          <button @click="$emit('legal', 'cgu')">Conditions d'utilisation</button>
          <button @click="$emit('legal', 'confidentialite')">Politique de confidentialité</button>
        </div>
        <div class="ent-footer-col">
          <h4>Contact</h4>
          <a :href="WHATSAPP_URL" target="_blank" rel="noopener">WhatsApp</a>
          <a href="mailto:info@eonda.online">info@eonda.online</a>
        </div>
      </div>
      <div class="ent-footer-base">
        <span>© {{ new Date().getFullYear() }} ONDA — Tous droits réservés.</span>
        <span>Abidjan, Côte d'Ivoire</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

.ent-page {
  --ink: #0b0d12;
  --ink-2: #14171f;
  --paper: #ffffff;
  --cream: #f5f0e7;
  --mint: #10bf9a;
  --mint-bright: #1fd9b2;
  --mint-tint: #e7f8f3;
  --text: #14161c;
  --muted: #5b6472;
  --line: #e8e4db;
  --r-lg: 34px;
  --r-md: 22px;
  --r-sm: 14px;
  --pill: 999px;

  min-height: 100vh;
  background: var(--paper);
  color: var(--text);
  font-family: 'Outfit', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

/* ── reveal on scroll ── */
.reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity .7s cubic-bezier(.2, .7, .2, 1), transform .7s cubic-bezier(.2, .7, .2, 1);
  will-change: opacity, transform;
}
.reveal.in { opacity: 1; transform: none; }

/* ── buttons ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .5rem;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: -0.01em;
  padding: 1rem 1.75rem;
  border-radius: var(--pill);
  text-decoration: none;
  transition: transform .18s ease, box-shadow .18s ease, background .18s ease, color .18s ease;
}
.btn-sm { padding: .55rem 1.1rem; font-size: .9rem; }
.btn-block { display: flex; width: 100%; }
.btn-ink { background: var(--ink); color: #fff; box-shadow: 0 10px 24px -12px rgba(11, 13, 18, .5); }
.btn-ink:hover { transform: translateY(-2px); box-shadow: 0 16px 34px -12px rgba(11, 13, 18, .55); }
.btn-mint { background: var(--mint); color: var(--ink); }
.btn-mint:hover { background: var(--mint-bright); transform: translateY(-2px); }
.btn-ghost { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1.6px rgba(11, 13, 18, .22); }
.btn-ghost:hover { box-shadow: inset 0 0 0 1.6px rgba(11, 13, 18, .55); transform: translateY(-2px); }
.btn-ghost-dark { color: var(--ink); box-shadow: inset 0 0 0 1.6px rgba(11, 13, 18, .28); }

/* ── header ── */
.ent-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: .9rem clamp(1rem, 4vw, 3rem);
  background: rgba(255, 255, 255, .78);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(0, 0, 0, .06);
}
.ent-logo-area { display: flex; align-items: center; gap: .55rem; text-decoration: none; color: var(--ink); }
.ent-logo-img { width: 30px; height: 30px; object-fit: contain; }
.ent-logo-name { font-weight: 800; font-size: 1.25rem; letter-spacing: -0.03em; color: var(--ink); }
.ent-nav { display: flex; gap: 1.75rem; }
.ent-nav-link {
  color: var(--muted); text-decoration: none; font-weight: 600; font-size: .95rem;
  transition: color .15s ease;
}
.ent-nav-link:hover { color: var(--ink); }
.ent-header-actions { display: flex; align-items: center; gap: .75rem; }
.ent-login-link {
  background: none; border: none; cursor: pointer; font-family: inherit;
  color: var(--ink); font-weight: 700; font-size: .95rem; padding: .4rem .6rem;
}
.ent-login-link:hover { color: var(--mint); }

/* ── hero ── */
.ent-hero {
  position: relative;
  max-width: 1180px;
  margin: 0 auto;
  padding: clamp(3.5rem, 8vw, 7rem) clamp(1.25rem, 5vw, 3rem) clamp(2.5rem, 6vw, 4rem);
  text-align: center;
  isolation: isolate;
}
.ent-hero-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  z-index: -1;
  pointer-events: none;
}
.ent-hero-blob-a { width: 460px; height: 460px; background: rgba(16, 191, 154, .28); top: -120px; left: -60px; }
.ent-hero-blob-b { width: 380px; height: 380px; background: rgba(99, 102, 241, .18); top: 40px; right: -80px; }
.ent-hero-inner { max-width: 820px; margin: 0 auto; }
.ent-hero-title {
  margin: 0 0 1.25rem;
  font-weight: 800;
  font-size: clamp(2.75rem, 7.2vw, 5.25rem);
  line-height: .98;
  letter-spacing: -0.045em;
  color: var(--ink);
}
.ent-hero-sub {
  margin: 0 auto 2.25rem;
  max-width: 620px;
  font-size: clamp(1.05rem, 2.2vw, 1.25rem);
  line-height: 1.6;
  color: var(--muted);
}
.ent-hero-actions { display: flex; gap: .9rem; justify-content: center; flex-wrap: wrap; }
.ent-hero-chips {
  display: flex; gap: .55rem; justify-content: center; flex-wrap: wrap;
  margin-top: 2rem;
}
.ent-hero-chips span {
  font-size: .82rem; font-weight: 600; color: var(--muted);
  background: #f4f4f2; border: 1px solid var(--line);
  padding: .35rem .8rem; border-radius: var(--pill);
}
.ent-hero-shot {
  margin: clamp(2.5rem, 6vw, 4.5rem) auto 0;
  max-width: 1060px;
  border-radius: var(--r-lg);
  padding: 10px;
  background: linear-gradient(160deg, rgba(16, 191, 154, .16), rgba(99, 102, 241, .1));
  box-shadow: 0 40px 90px -40px rgba(11, 13, 18, .35);
}
.ent-hero-shot img {
  display: block; width: 100%; height: auto;
  border-radius: calc(var(--r-lg) - 12px);
  border: 1px solid rgba(0, 0, 0, .06);
}

/* ── stats band ── */
.ent-stats { background: var(--ink); color: #fff; }
.ent-stats-inner {
  max-width: 1180px; margin: 0 auto;
  padding: clamp(2rem, 4vw, 3rem) clamp(1.25rem, 5vw, 3rem);
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem;
}
.ent-stat { text-align: center; }
.ent-stat-value {
  font-weight: 800; font-size: clamp(1.6rem, 3.4vw, 2.6rem);
  letter-spacing: -0.03em; color: var(--mint-bright);
}
.ent-stat-label { margin-top: .35rem; font-size: .9rem; color: rgba(255, 255, 255, .62); }

/* ── generic section ── */
.ent-section {
  padding: clamp(4.5rem, 9vw, 8rem) clamp(1.25rem, 5vw, 3rem);
}
.ent-section-cream { background: var(--cream); }
.ent-section-ink { background: var(--ink); color: #fff; }
.ent-section-head { max-width: 720px; margin: 0 auto clamp(2.5rem, 5vw, 4rem); text-align: center; }
.ent-kicker {
  display: inline-block; font-weight: 700; font-size: .8rem; letter-spacing: .12em;
  text-transform: uppercase; color: var(--mint); margin-bottom: 1rem;
}
.ent-kicker-light { color: var(--mint-bright); }
.ent-section-head h2 {
  margin: 0; font-weight: 800; letter-spacing: -0.035em; line-height: 1.05;
  font-size: clamp(2rem, 4.4vw, 3.25rem); color: inherit;
}
.ent-section-ink .ent-section-head h2 { color: #fff; }
.ent-section-head p {
  margin: 1rem auto 0; max-width: 560px; color: var(--muted); font-size: 1.08rem; line-height: 1.6;
}

/* ── bento modules ── */
.ent-bento {
  max-width: 1180px; margin: 0 auto;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.1rem;
}
.ent-feat {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 1.9rem 1.7rem;
  transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
}
.ent-feat:hover {
  transform: translateY(-4px);
  box-shadow: 0 26px 50px -24px rgba(11, 13, 18, .22);
  border-color: var(--c, rgba(11, 13, 18, .25));
  border-color: color-mix(in srgb, var(--c) 55%, var(--line));
}
.ent-feat-lead {
  grid-column: span 2;
  background: #fff;
  background: linear-gradient(150deg, #fff, color-mix(in srgb, var(--c) 8%, #fff));
}
.ent-feat-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 46px; height: 46px; border-radius: var(--r-sm);
  color: var(--c);
  background: #f3f3f0;
  background: color-mix(in srgb, var(--c) 14%, #fff);
  margin-bottom: 1.15rem;
}
.ent-feat-icon :deep(svg) { width: 24px; height: 24px; }
.ent-feat h3 {
  margin: 0 0 .5rem; font-weight: 800; font-size: 1.2rem; letter-spacing: -0.02em; color: var(--ink);
}
.ent-feat-lead h3 { font-size: 1.5rem; }
.ent-feat p { margin: 0; color: var(--muted); font-size: .98rem; line-height: 1.6; }

/* ── product showcase ── */
.ent-shows { max-width: 1120px; margin: 0 auto; display: flex; flex-direction: column; gap: clamp(2.5rem, 6vw, 5rem); }
.ent-show { display: grid; grid-template-columns: 1.1fr 1fr; align-items: center; gap: clamp(2rem, 5vw, 4.5rem); }
.ent-show-rev { direction: rtl; }
.ent-show-rev > * { direction: ltr; }
.ent-show-media {
  border-radius: var(--r-lg);
  padding: clamp(1rem, 3vw, 2rem);
  background: #f4f5f7;
  background: color-mix(in srgb, var(--c) 12%, var(--paper));
  border: 1px solid var(--line);
  border: 1px solid color-mix(in srgb, var(--c) 20%, var(--line));
}
.ent-show-media img {
  display: block; width: 100%; height: auto;
  border-radius: var(--r-sm);
  box-shadow: 0 24px 50px -24px rgba(11, 13, 18, .3);
  border: 1px solid rgba(0, 0, 0, .06);
}
.ent-show-tag {
  display: inline-block; font-weight: 700; font-size: .78rem; letter-spacing: .1em;
  text-transform: uppercase; color: var(--c); margin-bottom: .85rem;
}
.ent-show-text h3 {
  margin: 0 0 .8rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1;
  font-size: clamp(1.5rem, 3vw, 2.1rem); color: var(--ink);
}
.ent-show-text p { margin: 0; color: var(--muted); font-size: 1.08rem; line-height: 1.65; }

/* ── why ── */
.ent-why {
  max-width: 1060px; margin: 0 auto;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem;
}
.ent-why-item {
  background: var(--ink-2);
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: var(--r-md);
  padding: 1.9rem 1.7rem;
}
.ent-why-item h3 {
  margin: 0 0 .7rem; font-weight: 800; font-size: 1.25rem; color: #fff;
}
.ent-why-item h3::before {
  content: ''; display: block; width: 30px; height: 3px; border-radius: 3px;
  background: var(--mint-bright); margin-bottom: .9rem;
}
.ent-why-item p { margin: 0; color: rgba(255, 255, 255, .68); font-size: 1rem; line-height: 1.6; }

/* ── pricing ── */
.ent-pricing {
  max-width: 900px; margin: 0 auto;
  display: grid; grid-template-columns: 1.15fr .85fr; gap: 1.25rem; align-items: start;
}
.ent-plan {
  background: var(--paper); border: 1px solid var(--line);
  border-radius: var(--r-lg); padding: clamp(1.75rem, 4vw, 2.5rem);
  box-shadow: 0 30px 60px -35px rgba(11, 13, 18, .18);
}
.ent-plan-name {
  font-weight: 800; font-size: 1.05rem; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 1.25rem;
}
.ent-plan-list { list-style: none; padding: 0; margin: 1.75rem 0 0; display: flex; flex-direction: column; gap: .8rem; }
.ent-plan-list li {
  position: relative; padding-left: 1.75rem; color: var(--text); font-size: .98rem;
}
.ent-plan-list li::before {
  content: ''; position: absolute; left: 0; top: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: var(--mint-tint) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%230b7a63' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E") center / 12px no-repeat;
}
.ent-plan-teaser {
  margin: 1.75rem 0 0; padding-top: 1.5rem; border-top: 1px solid var(--line);
  color: var(--muted); font-size: .9rem; line-height: 1.6;
}
.ent-plan-teaser a { color: var(--ink); font-weight: 700; text-decoration: none; }
.ent-plan-teaser a:hover { color: var(--mint); }
.ent-plan-custom {
  background: var(--ink); color: #fff; box-shadow: none;
  display: flex; flex-direction: column; gap: .9rem;
}
.ent-plan-custom-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255, 255, 255, .1); color: var(--mint-bright);
  display: flex; align-items: center; justify-content: center;
}
.ent-plan-custom h3 { margin: 0; font-weight: 800; font-size: 1.2rem; color: #fff; }
.ent-plan-custom p { margin: 0 0 .5rem; color: rgba(255, 255, 255, .68); font-size: .95rem; line-height: 1.55; }

/* ── faq ── */
.ent-faq { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: .75rem; }
.ent-faq-item {
  background: var(--paper); border: 1px solid var(--line); border-radius: var(--r-md);
  padding: .35rem 1.4rem;
  transition: border-color .2s ease;
}
.ent-faq-item[open] { border-color: rgba(16, 191, 154, .5); }
.ent-faq-item summary {
  list-style: none; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 1.15rem 0; font-weight: 700; font-size: 1.05rem; color: var(--ink);
}
.ent-faq-item summary::-webkit-details-marker { display: none; }
.ent-faq-chev { flex-shrink: 0; color: var(--muted); transition: transform .22s ease; }
.ent-faq-item[open] .ent-faq-chev { transform: rotate(180deg); color: var(--mint); }
.ent-faq-item p {
  margin: 0; padding: 0 0 1.25rem; color: var(--muted); font-size: 1rem; line-height: 1.65;
}

/* ── final cta ── */
.ent-cta-band {
  background: var(--mint);
  color: var(--ink);
  text-align: center;
  padding: clamp(4rem, 8vw, 6.5rem) clamp(1.25rem, 5vw, 3rem);
}
.ent-cta-band h2 {
  margin: 0 0 .75rem; font-weight: 800; letter-spacing: -0.035em; line-height: 1.05;
  font-size: clamp(2rem, 4.6vw, 3.25rem);
}
.ent-cta-band p { margin: 0 auto 2rem; max-width: 500px; font-size: 1.08rem; color: rgba(11, 13, 18, .72); }
.ent-cta-band-actions { display: flex; gap: .9rem; justify-content: center; flex-wrap: wrap; }

/* ── footer ── */
.ent-footer { background: var(--ink); color: rgba(255, 255, 255, .7); padding: clamp(3rem, 6vw, 4.5rem) clamp(1.25rem, 5vw, 3rem) 2rem; }
.ent-footer-grid {
  max-width: 1120px; margin: 0 auto; display: grid;
  grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 2.5rem;
}
.ent-footer-brand .ent-logo-name { color: #fff; font-size: 1.3rem; }
.ent-footer-brand p { margin: .75rem 0 0; max-width: 300px; font-size: .95rem; line-height: 1.6; }
.ent-footer-col h4 { margin: 0 0 1rem; color: #fff; font-size: .95rem; font-weight: 700; }
.ent-footer-col a, .ent-footer-col button {
  display: block; background: none; border: none; padding: 0; margin-bottom: .6rem; cursor: pointer;
  color: rgba(255, 255, 255, .7); text-decoration: none; font-family: inherit; font-size: .95rem; text-align: left;
}
.ent-footer-col a:hover, .ent-footer-col button:hover { color: var(--mint-bright); }
.ent-footer-base {
  max-width: 1120px; margin: 2.5rem auto 0; padding-top: 1.75rem;
  border-top: 1px solid rgba(255, 255, 255, .1);
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: .5rem;
  font-size: .85rem; color: rgba(255, 255, 255, .5);
}

/* ── responsive ── */
@media (max-width: 960px) {
  .ent-nav { display: none; }
  .ent-bento { grid-template-columns: repeat(2, 1fr); }
  .ent-feat-lead { grid-column: span 2; }
  .ent-show, .ent-show-rev { grid-template-columns: 1fr; direction: ltr; }
  .ent-why { grid-template-columns: 1fr; }
  .ent-pricing { grid-template-columns: 1fr; }
  .ent-stats-inner { grid-template-columns: repeat(2, 1fr); }
  .ent-footer-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .ent-bento { grid-template-columns: 1fr; }
  .ent-feat-lead { grid-column: span 1; }
  .ent-header-actions .btn-mint { display: none; }
  .ent-footer-grid { grid-template-columns: 1fr; gap: 2rem; }
  .btn { width: 100%; }
  .ent-hero-actions, .ent-cta-band-actions { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .reveal { opacity: 1 !important; transform: none !important; transition: none; }
  .btn, .ent-feat, .ent-faq-chev { transition: none !important; }
}
</style>
