<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
defineEmits(['login', 'legal'])

// Deux applications ONDA en ligne :
//  - l'Espace RH & Paie      → rh.eonda.online
//  - les outils de simulation → simulateur.eonda.online
// Chaque service s'ouvre via le paramètre ?module= (et ?type= pour un sous-outil).
const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL || 'https://rh.eonda.online/'
const SIM_APP_URL = import.meta.env.VITE_SIM_APP_URL || 'https://simulateur.eonda.online/'
const WHATSAPP_URL = 'https://wa.me/2250151144337'

const appUrl = (module) => module ? `${MAIN_APP_URL}?module=${module}` : MAIN_APP_URL
const simUrl = (query) => query ? `${SIM_APP_URL}?${query}` : `${SIM_APP_URL}?module=home`

// Les outils ONDA déjà en ligne, avec lien direct pour y accéder.
const services = [
  {
    titre: 'Espace RH & Paie',
    kicker: 'Paie',
    url: appUrl('hr'),
    lien: 'Ouvrir l’Espace RH',
    description: 'Toute la chaîne de paie, du contrat à la déclaration.',
    points: ['Bulletins conformes (brut → net)', 'Cotisations CNPS / CNSS, ITS, FDFP', 'Déclarations sociales', 'Annuaire, congés, contrats CDD', 'Solde de tout compte', 'Générateur de documents'],
    couleur: '#10bf9a',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/></svg>`
  },
  {
    titre: 'Comprendre le Crédit',
    kicker: 'Crédit',
    url: simUrl('module=loan'),
    lien: 'Ouvrir le simulateur',
    description: 'Simuler un prêt bancaire avant de signer.',
    points: ['Mensualité, coût total, part des intérêts', 'Taux nominal vs TEG', 'Capacité d’emprunt & taux d’endettement', 'Quotité cessible, reste à vivre', 'Tableau d’amortissement', 'Scoring du profil emprunteur'],
    couleur: '#38bdf8',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z"/></svg>`
  },
  {
    titre: 'Fiscalité PME',
    kicker: 'Fiscalité',
    url: simUrl('module=tax'),
    lien: 'Ouvrir le comparateur',
    description: 'Comparer les impôts et choisir son régime.',
    points: ['Comparatif d’impôts entreprise', 'Aide au choix de régime (TPS / réel)', 'Estimation de la charge fiscale', 'Projections sur plusieurs exercices'],
    couleur: '#34d399',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"/></svg>`
  },
  {
    titre: 'Santé Financière',
    kicker: 'Gestion',
    url: simUrl('module=outils_pro'),
    lien: 'Ouvrir les outils',
    description: 'Fixer ses prix et surveiller sa rentabilité.',
    points: ['Calcul du prix de vente', 'Marge brute et taux de marge', 'Point mort / seuil de rentabilité', 'Charges fixes vs variables'],
    couleur: '#60a5fa',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>`
  }
]

// Outils 100 % gratuits, accessibles sans compte (sur le simulateur).
const outilsGratuits = [
  { titre: 'Simuler un bulletin', url: simUrl('module=bulletin') },
  { titre: 'Calcul de congés payés', url: simUrl('module=hr&type=conges') },
  { titre: 'Solde de tout compte', url: simUrl('module=hr&type=solde') }
]

// Révélation au défilement (léger, sans dépendance).
let io = null
let safety = null

const revealAll = () => {
  document.querySelectorAll('.ent-page .reveal').forEach((el) => el.classList.add('in'))
}

onMounted(() => {
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

  safety = setTimeout(revealAll, 3000)
})

onBeforeUnmount(() => {
  if (io) io.disconnect()
  if (safety) clearTimeout(safety)
})
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
        <a href="#services" class="ent-nav-link">Les outils</a>
        <a :href="appUrl('hr')" class="ent-nav-link">Espace RH</a>
        <a :href="simUrl()" class="ent-nav-link">Simulateurs</a>
      </nav>
      <div class="ent-header-actions">
        <button @click="$emit('login')" class="ent-login-link">Se connecter</button>
        <a :href="MAIN_APP_URL" class="btn btn-mint btn-sm">Ouvrir l'Espace RH</a>
      </div>
    </header>

    <!-- ══ HERO ══ -->
    <section class="ent-hero">
      <div class="ent-hero-blob ent-hero-blob-a"></div>
      <div class="ent-hero-blob ent-hero-blob-b"></div>

      <div class="ent-hero-inner reveal">
        <h1 class="ent-hero-title">Les outils ONDA,<br />au même endroit.</h1>
        <p class="ent-hero-sub">
          Paie &amp; gestion RH, simulation de crédit, fiscalité PME, rentabilité.
          Tout ce qu'on a développé est en ligne — cliquez pour y accéder.
        </p>
        <div class="ent-hero-actions">
          <a href="#services" class="btn btn-ink">Voir les outils</a>
          <a :href="appUrl('hr')" class="btn btn-ghost">Ouvrir l'Espace RH</a>
        </div>
        <div class="ent-hero-chips">
          <span>Paie &amp; RH</span><span>Crédit</span><span>Fiscalité PME</span><span>Rentabilité</span><span>CI · Bénin · Togo</span>
        </div>
      </div>

      <div class="ent-hero-shot reveal">
        <img src="/dashboard.png" alt="Le bureau ONDA" loading="lazy" />
      </div>
    </section>

    <!-- ══ SERVICES ONDA ══ -->
    <section id="services" class="ent-section">
      <div class="ent-section-head reveal">
        <span class="ent-kicker">Les outils</span>
        <h2>Développés, en ligne,<br />prêts à l'emploi.</h2>
        <p>Chaque outil s'ouvre directement — l'Espace RH sur son application, les simulateurs sur la leur.</p>
      </div>

      <div class="ent-svc-grid reveal">
        <article
          v-for="s in services"
          :key="s.titre"
          class="ent-svc"
          :style="{ '--c': s.couleur }"
        >
          <span class="ent-svc-icon" v-html="s.icon"></span>
          <span class="ent-svc-kicker">{{ s.kicker }}</span>
          <h3>{{ s.titre }}</h3>
          <p class="ent-svc-desc">{{ s.description }}</p>
          <ul class="ent-svc-list">
            <li v-for="p in s.points" :key="p">{{ p }}</li>
          </ul>
          <a :href="s.url" class="btn btn-ink btn-block btn-sm">{{ s.lien }} →</a>
        </article>
      </div>

      <div class="ent-free reveal">
        <span class="ent-free-label">100 % gratuit, sans compte</span>
        <div class="ent-free-links">
          <a v-for="o in outilsGratuits" :key="o.titre" :href="o.url" class="ent-free-chip">
            {{ o.titre }} →
          </a>
        </div>
      </div>
    </section>

    <!-- ══ FOOTER ══ -->
    <footer class="ent-footer">
      <div class="ent-footer-grid">
        <div class="ent-footer-brand">
          <span class="ent-logo-name">ONDA</span>
          <p>Plateforme d'outils financiers &amp; de paie pour la Côte d'Ivoire, le Bénin et le Togo.</p>
        </div>
        <div class="ent-footer-col">
          <h4>Services</h4>
          <a :href="appUrl('hr')">Espace RH &amp; Paie</a>
          <a :href="simUrl('module=loan')">Simulateur de crédit</a>
          <a :href="simUrl('module=tax')">Fiscalité PME</a>
          <a :href="simUrl('module=outils_pro')">Santé financière</a>
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

/* ── services ONDA ── */
.ent-svc-grid {
  max-width: 1180px; margin: 0 auto;
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.1rem;
}
.ent-svc {
  display: flex; flex-direction: column;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 1.9rem 1.7rem;
  transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
}
.ent-svc:hover {
  transform: translateY(-4px);
  box-shadow: 0 26px 50px -24px rgba(11, 13, 18, .22);
  border-color: color-mix(in srgb, var(--c) 55%, var(--line));
}
.ent-svc-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 46px; height: 46px; border-radius: var(--r-sm);
  color: var(--c);
  background: color-mix(in srgb, var(--c) 14%, #fff);
  margin-bottom: 1rem;
}
.ent-svc-icon :deep(svg) { width: 24px; height: 24px; }
.ent-svc-kicker {
  font-size: .74rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;
  color: var(--c);
}
.ent-svc h3 {
  margin: .35rem 0 .4rem; font-weight: 800; font-size: 1.3rem; letter-spacing: -0.02em; color: var(--ink);
}
.ent-svc-desc { margin: 0 0 1rem; color: var(--muted); font-size: .98rem; line-height: 1.55; }
.ent-svc-list {
  list-style: none; margin: 0 0 1.5rem; padding: 0;
  display: flex; flex-direction: column; gap: .45rem;
}
.ent-svc-list li {
  position: relative; padding-left: 1.35rem;
  font-size: .92rem; color: var(--text); line-height: 1.45;
}
.ent-svc-list li::before {
  content: ''; position: absolute; left: 0; top: .45rem;
  width: 7px; height: 7px; border-radius: 999px; background: var(--c);
}
.ent-svc .btn { margin-top: auto; }

.ent-free {
  max-width: 1180px; margin: 2.5rem auto 0;
  display: flex; flex-wrap: wrap; align-items: center; gap: 1rem 1.5rem;
  padding: 1.4rem 1.6rem;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
  background: var(--mint-tint);
}
.ent-free-label { font-weight: 800; color: var(--ink); font-size: .95rem; }
.ent-free-links { display: flex; flex-wrap: wrap; gap: .6rem; }
.ent-free-chip {
  font-size: .88rem; font-weight: 700; text-decoration: none;
  color: var(--ink);
  background: #fff;
  border: 1px solid var(--line);
  border-radius: var(--pill);
  padding: .5rem 1rem;
  transition: transform .18s ease, border-color .18s ease;
}
.ent-free-chip:hover { transform: translateY(-2px); border-color: var(--mint); }

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
  .ent-svc-grid { grid-template-columns: 1fr; }
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
