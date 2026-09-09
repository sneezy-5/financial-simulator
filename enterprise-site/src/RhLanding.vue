<script setup>
import { ref } from 'vue'
defineEmits(['login', 'legal'])

// Le portail RH ONDA (rh.eonda.online) est la même application que ce site
// embarque en tant que landing : d'où la navigation par URL + paramètre
// ?module=, identique à celle lue dans src/App.vue au démarrage.
const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL || 'https://rh.eonda.online/'
const WHATSAPP_URL = 'https://wa.me/2250151144337'
const appUrl = (module) => module ? `${MAIN_APP_URL}?module=${module}` : MAIN_APP_URL

const modules = [
  {
    icon: 'payments', color: 'emerald',
    title: 'Bulletins de Paie',
    desc: "Calcul précis du salaire brut au net, cotisations CNPS, retenues ITS & IGR par part, primes imposables et non imposables. Édition en PDF certifié.",
    tags: ['Instantané', 'PDF Sécurisé']
  },
  {
    icon: 'upload_file', color: 'sky',
    title: 'Import en Masse',
    desc: "Traitez l'intégralité de votre effectif d'un clic. Déposez un fichier Excel standard et obtenez instantanément 500 bulletins calculés sans délai.",
    tags: ['Gain 4h / mois', 'Excel .xlsx']
  },
  {
    icon: 'policy', color: 'amber',
    title: 'Déclarations Sociales',
    desc: "Bordereaux périodiques CNPS, états DISA annuelle et cotisations FDFP (1.2% apprentissage + 0.6% FC) directement prêts au dépôt sur e-CNPS.",
    tags: ['Bordereau e-CNPS', 'DISA Annuelle']
  },
  {
    icon: 'handshake', color: 'teal',
    title: 'Solde de Tout Compte',
    desc: "Décompte automatisé des indemnités de rupture, préavis non effectué, reliquats de congés payés et édition du certificat de travail légal en 1 clic.",
    tags: ['Code CI Art 16.7']
  },
  {
    icon: 'badge', color: 'purple',
    title: 'Annuaire des Employés',
    desc: "Fiches collaborateurs complètes : situation de famille, nombre de parts IGR, coordonnées bancaires, numéro CNPS et historique des paies.",
    tags: ['Fiches Centralisées']
  },
  {
    icon: 'insights', color: 'indigo',
    title: 'Dashboards & Masse Salariale',
    desc: "Coût global employeur, ratios charges patronales / salaire net, alertes dépassement et ventilations analytiques pour directeurs financiers.",
    tags: ['KPIs DAF & DG']
  },
  {
    icon: 'history_edu', color: 'rose',
    title: 'Générateur de Documents',
    desc: "Contrats types CDI, CDD, conventions de stage, attestations de travail et courriers légaux pré-remplis automatiquement à partir des fiches.",
    tags: ['Conforme Code Travail']
  },
  {
    icon: 'event_available', color: 'orange',
    title: 'Calendrier des Congés',
    desc: "Calcul automatique de l'acquisition des congés (2.2 jours / mois sur la base légale de 26 jours annuels) avec suivi des absences maladie.",
    tags: ['26 Jours / An CI']
  },
  {
    icon: 'notifications_active', color: 'violet',
    title: 'Alertes Contrats CDD',
    desc: "Rappels programmés à J-30, J-15 et J-7 avant les fins de périodes d'essai ou renouvellements pour éviter toute requalification involontaire.",
    tags: ['Zéro Pénalité']
  }
]

const faqs = [
  {
    q: 'Le calcul est-il à jour des dernières réformes fiscales ivoiriennes ?',
    a: "Oui, absolument. Eonda RH intègre les barèmes officiels de l'ITS, de l'IGR selon le nombre de parts familiales, ainsi que les taux patronaux et salariaux de la CNPS (Prestations familiales, Accidents du travail, Régime général de retraite) et les cotisations patronales au FDFP (1,2% taxe d'apprentissage + 0,6% formation continue)."
  },
  {
    q: 'Est-ce vraiment gratuit pour démarrer ?',
    a: "Oui, l'accès aux simulateurs individuels, au calcul du solde de tout compte et aux règles de congés légaux est en libre accès. Aucune carte bancaire n'est exigée lors de votre inscription."
  },
  {
    q: 'Comment puis-je importer les salariés de mon entreprise ?',
    a: "Grâce au module d'importation en masse, vous téléchargez le modèle Excel fourni, collez votre listing d'employés avec leurs salaires de base, et l'outil synchronise instantanément l'annuaire complet et prépare tous les bulletins en quelques secondes."
  },
  {
    q: 'Les déclarations CNPS sont-elles prêtes pour la télédéclaration ?',
    a: "Oui. Le module d'états sociaux compile l'ensemble des rémunérations brutes plafonnées à 70.000 FCFA et 1.647.315 FCFA et produit le bordereau officiel avec la répartition exacte prête pour la saisie sur le portail officiel e-CNPS."
  },
  {
    q: "L'application fonctionne-t-elle sans connexion Internet ?",
    a: "Absolument. En installant la PWA (Progressive Web App) sur votre ordinateur ou votre smartphone, la base locale s'exécute directement sur votre poste de travail grâce à IndexedDB, vous permettant de travailler sans interruption même en cas de coupure de connexion."
  }
]
const openFaq = ref(0)
const toggleFaq = (i) => { openFaq.value = openFaq.value === i ? -1 : i }
</script>

<template>
<div class="w-full font-body-md text-on-surface antialiased overflow-x-hidden">
  <!-- HEADER / NAVBAR -->
  <header class="fixed top-0 w-full z-50 bg-white/85 backdrop-blur-xl border-b border-slate-200/70 transition-all">
    <div class="h-20 max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
      <div class="flex items-center gap-10 min-w-0">
        <a class="flex items-center gap-2.5 sm:gap-3.5 group min-w-0" :href="appUrl()">
          <div class="relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-amber-50/80 border border-emerald-100 shadow-sm group-hover:scale-105 group-hover:shadow-md transition-all flex-shrink-0">
            <img alt="Logo Eonda RH" class="h-7 sm:h-8 w-auto object-contain drop-shadow-sm" src="/logo.png" />
          </div>
          <div class="flex flex-col min-w-0">
            <span class="font-headline-md font-extrabold text-[18px] sm:text-[21px] text-brand-emerald-dark tracking-tight leading-none group-hover:text-primary-container transition-colors whitespace-nowrap">
              EONDA <span class="text-amber-500 font-extrabold">RH</span>
            </span>
            <span class="hidden sm:block text-[11px] font-medium text-slate-500 tracking-wider uppercase mt-1 whitespace-nowrap">Paie &amp; RH Côte d'Ivoire</span>
          </div>
        </a>
        <nav class="hidden lg:flex items-center gap-1">
          <a class="px-4 py-2 rounded-xl text-[14px] font-medium text-slate-600 hover:text-brand-emerald-dark hover:bg-emerald-50/60 transition-all" href="#modules">Modules</a>
          <a class="px-4 py-2 rounded-xl text-[14px] font-medium text-slate-600 hover:text-brand-emerald-dark hover:bg-emerald-50/60 transition-all" href="#apercu">Démonstration</a>
          <a class="px-4 py-2 rounded-xl text-[14px] font-medium text-slate-600 hover:text-brand-emerald-dark hover:bg-emerald-50/60 transition-all" href="#social-proof">Témoignages</a>
          <a class="px-4 py-2 rounded-xl text-[14px] font-medium text-slate-600 hover:text-brand-emerald-dark hover:bg-emerald-50/60 transition-all" href="#tarifs">Tarifs</a>
          <a class="px-4 py-2 rounded-xl text-[14px] font-medium text-slate-600 hover:text-brand-emerald-dark hover:bg-emerald-50/60 transition-all" href="#faq">FAQ</a>
        </nav>
      </div>
      <div class="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <button @click="$emit('login')" class="hidden sm:inline-flex items-center px-4 py-2.5 rounded-xl text-[14px] font-semibold text-slate-700 hover:text-brand-emerald-dark hover:bg-slate-100 transition-colors whitespace-nowrap">
          Se connecter
        </button>
        <a :href="appUrl('hr')" class="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-primary-container to-emerald-700 text-white font-headline-sm font-semibold text-[13px] sm:text-[14px] shadow-[0_4px_14px_rgba(15,91,56,0.25)] hover:shadow-[0_6px_20px_rgba(15,91,56,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition-all whitespace-nowrap">
          <span>Ouvrir l'application</span>
          <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
        </a>
      </div>
    </div>
  </header>

  <main class="w-full pt-20">
    <!-- SECTION 1: HERO -->
    <section class="relative overflow-hidden pt-12 pb-24 lg:pt-16 lg:pb-32 px-4 sm:px-6 lg:px-8 hero-glow-mesh">
      <div class="absolute -top-12 left-1/2 -translate-x-1/2 w-[850px] h-[520px] bg-gradient-to-tr from-emerald-400/25 via-teal-300/20 to-amber-300/25 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div class="absolute top-1/3 -left-20 w-80 h-80 bg-emerald-200/40 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div class="absolute top-1/4 -right-20 w-96 h-96 bg-amber-200/40 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div class="max-w-[1280px] mx-auto flex flex-col items-center text-center">
        <div class="inline-flex items-center gap-2.5 px-4 py-2 rounded-full glass-card border border-emerald-200/80 shadow-sm mb-6 hover:border-emerald-400 transition-colors">
          <span class="font-label-caps text-[12px] font-bold text-brand-emerald-dark tracking-wide uppercase">
            Barèmes Officiels CI 2025 • CNPS • ITS &amp; IGR • FDFP 1.2% + 0.6%
          </span>
        </div>
        <h1 class="font-display-hero text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-extrabold text-slate-900 tracking-tight leading-[1.1] max-w-5xl mx-auto mb-6">
          Votre paie mérite <span class="bg-gradient-to-r from-emerald-700 via-primary to-teal-600 bg-clip-text text-transparent">mieux</span>, plus vite et <span class="underline decoration-amber-400 decoration-wavy decoration-2">sans erreur</span>.
        </h1>
        <p class="font-body-lg text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto mb-8 font-normal leading-relaxed">
          Bulletins réglementaires, congés légaux, contrats et déclarations e-CNPS : l'écosystème RH intuitif pensé pour les directeurs RH, comptables et PME en Côte d'Ivoire.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-4 mb-8">
          <a :href="appUrl('hr')" class="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-700 via-primary to-emerald-800 text-white font-headline-sm font-bold text-[16px] shadow-[0_12px_24px_rgba(15,91,56,0.28)] hover:shadow-[0_16px_32px_rgba(15,91,56,0.38)] hover:-translate-y-1 transition-all">
            <span>Ouvrir l'application maintenant</span>
            <span class="material-symbols-outlined text-[20px]">arrow_forward</span>
          </a>
          <a :href="appUrl('hr')" class="inline-flex items-center gap-2.5 px-7 py-4 rounded-2xl bg-white text-slate-800 font-headline-sm font-semibold text-[15px] border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:-translate-y-0.5 transition-all">
            <span class="material-symbols-outlined text-emerald-600 text-[22px]">download_for_offline</span>
            <span>Installer la PWA (Hors-ligne)</span>
          </a>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-2.5 mb-14">
          <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-100/80 text-emerald-900 border border-emerald-200 font-label-caps text-[12px] font-bold">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            100% Conforme Code Travail CI
          </span>
          <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-sky-100/80 text-sky-900 border border-sky-200 font-label-caps text-[12px] font-bold">
            <span class="w-2 h-2 rounded-full bg-sky-500"></span>
            Bordereau e-CNPS Natif
          </span>
          <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-100/80 text-amber-900 border border-amber-200 font-label-caps text-[12px] font-bold">
            <span class="w-2 h-2 rounded-full bg-amber-500"></span>
            FDFP &amp; ITS Automatisés
          </span>
          <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-purple-100/80 text-purple-900 border border-purple-200 font-label-caps text-[12px] font-bold">
            <span class="w-2 h-2 rounded-full bg-purple-500"></span>
            Mode Hors-Ligne Sécurisé
          </span>
        </div>
        <!-- HERO PRODUCT MOCKUP -->
        <div class="w-full max-w-5xl relative group">
          <div class="absolute -inset-2 sm:-inset-4 bg-gradient-to-r from-emerald-500/30 via-teal-400/30 to-amber-500/30 rounded-3xl blur-2xl opacity-75 group-hover:opacity-100 transition-opacity"></div>
          <div class="relative rounded-2xl lg:rounded-3xl bg-slate-900/90 p-2 sm:p-3 shadow-2xl border border-white/20 backdrop-blur-md">
            <div class="flex items-center justify-between px-3 sm:px-4 py-2.5 mb-2 bg-slate-800/80 rounded-t-xl border-b border-slate-700/50">
              <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-rose-500"></span>
                <span class="w-3 h-3 rounded-full bg-amber-400"></span>
                <span class="w-3 h-3 rounded-full bg-emerald-400"></span>
                <div class="ml-3 hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-900/70 border border-slate-700/50 text-[11px] font-code-cell text-slate-300">
                  <span class="material-symbols-outlined text-[13px] text-emerald-400">lock</span>
                  <span>https://rh.eonda.online/espace-collaborateur</span>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 font-code-cell text-[11px] font-semibold">
                  INDEXED-DB LOCAL • SYNCHRO
                </span>
              </div>
            </div>
            <div class="relative overflow-hidden rounded-xl bg-slate-950">
              <img alt="Interface Eonda RH" class="w-full h-auto object-cover rounded-xl transition-transform duration-700 group-hover:scale-[1.01]" src="/dashboard.png" />
            </div>
          </div>
          <div class="absolute -top-5 -left-3 sm:-left-6 glass-card px-4 py-3 rounded-2xl shadow-float border border-emerald-200 hidden sm:flex items-center gap-3 animate-bounce" style="animation-duration: 4s;">
            <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
              <span class="material-symbols-outlined text-[22px]">verified</span>
            </div>
            <div class="text-left">
              <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-700 font-label-caps">Barème 2025 Actif</div>
              <div class="font-headline-sm text-[14px] font-bold text-slate-800">100% Conforme CNPS CI</div>
            </div>
          </div>
          <div class="absolute -bottom-6 -right-3 sm:-right-6 glass-card px-4 py-3 rounded-2xl shadow-float border border-amber-200 hidden sm:flex items-center gap-3 animate-bounce" style="animation-duration: 5s;">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md">
              <span class="material-symbols-outlined text-[22px]">speed</span>
            </div>
            <div class="text-left">
              <div class="text-[11px] font-bold uppercase tracking-wider text-amber-700 font-label-caps">Vitesse Ultime</div>
              <div class="font-headline-sm text-[14px] font-bold text-slate-800">500 bulletins / 20s</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- SECTION 2: METRIC STRIP -->
    <section class="w-full bg-[#081711] text-white py-12 border-y border-emerald-950">
      <div class="max-w-[1280px] mx-auto px-6 lg:px-8">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          <div class="flex flex-col gap-1.5 border-l-2 border-emerald-500/40 pl-5">
            <span class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-emerald-400">15 Modules</span>
            <span class="font-label-caps text-[12px] font-bold text-emerald-200/80 uppercase tracking-wider">RH Tout-en-un</span>
            <p class="text-slate-400 text-[13px] leading-relaxed">Embauche, bulletins, congés, déclarations sociales et départs</p>
          </div>
          <div class="flex flex-col gap-1.5 border-l-2 border-amber-500/40 pl-5">
            <span class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-amber-400">100% CI</span>
            <span class="font-label-caps text-[12px] font-bold text-amber-200/80 uppercase tracking-wider">Droit &amp; Fiscalité</span>
            <p class="text-slate-400 text-[13px] leading-relaxed">CNPS, régimes retraite, ITS, IGR et FDFP toujours à jour</p>
          </div>
          <div class="flex flex-col gap-1.5 border-l-2 border-sky-500/40 pl-5">
            <span class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-sky-400">0 FCFA</span>
            <span class="font-label-caps text-[12px] font-bold text-sky-200/80 uppercase tracking-wider">Démarrage Gratuit</span>
            <p class="text-slate-400 text-[13px] leading-relaxed">Accès complet immédiat, sans carte bancaire ni abonnement forcé</p>
          </div>
          <div class="flex flex-col gap-1.5 border-l-2 border-teal-500/40 pl-5">
            <span class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-teal-400">PDF + XLS</span>
            <span class="font-label-caps text-[12px] font-bold text-teal-200/80 uppercase tracking-wider">Exports 1-Clic</span>
            <p class="text-slate-400 text-[13px] leading-relaxed">Bordereaux conformes pour le portail e-CNPS et virements bancaires</p>
          </div>
        </div>
      </div>
    </section>

    <!-- SECTION 3: TÉMOIGNAGE -->
    <section class="w-full py-20 lg:py-28 px-6 lg:px-8 bg-gradient-to-b from-white via-emerald-50/30 to-white" id="social-proof">
      <div class="max-w-[1200px] mx-auto">
        <div class="text-center max-w-3xl mx-auto mb-14">
          <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-100 text-emerald-800 font-label-caps text-[12px] font-bold tracking-widest uppercase mb-3">
            Témoignages &amp; Confiance
          </span>
          <h2 class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Adopté par les DRH et gestionnaires de paie en Côte d'Ivoire
          </h2>
          <p class="text-slate-600 text-lg mt-3">
            Des entreprises à Abidjan, San Pedro, Bouaké et dans l'UEMOA font confiance à Eonda RH chaque mois.
          </p>
        </div>
        <div class="relative bg-white rounded-3xl p-6 sm:p-10 lg:p-12 shadow-airtable border border-slate-200/80 overflow-hidden">
          <div class="absolute -right-16 -top-16 w-64 h-64 bg-emerald-100/60 rounded-full blur-3xl pointer-events-none"></div>
          <div class="absolute -left-16 -bottom-16 w-64 h-64 bg-amber-100/50 rounded-full blur-3xl pointer-events-none"></div>
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div class="lg:col-span-5 relative">
              <!-- Emplacement à remplir : photo réelle d'un client à venir -->
              <div class="relative rounded-2xl overflow-hidden shadow-xl border-4 border-white aspect-[4/3] sm:aspect-auto bg-gradient-to-br from-emerald-100 via-emerald-50 to-amber-100 flex items-center justify-center min-h-[220px]">
                <div class="flex flex-col items-center gap-2 text-emerald-700/70">
                  <span class="material-symbols-outlined text-[56px]">account_circle</span>
                  <span class="text-[11px] font-bold uppercase tracking-widest">Photo à ajouter</span>
                </div>
              </div>
              <div class="absolute -bottom-4 -right-4 glass-card px-4 py-2.5 rounded-xl shadow-md border border-emerald-100 flex items-center gap-2">
                <span class="text-xs font-semibold text-slate-700">Plateau, Abidjan • Clôture Paie Réussie</span>
              </div>
            </div>
            <div class="lg:col-span-7 flex flex-col justify-between">
              <div>
                <div class="flex items-center gap-1 text-amber-400 mb-6">
                  <span class="material-symbols-outlined text-[24px]">star</span>
                  <span class="material-symbols-outlined text-[24px]">star</span>
                  <span class="material-symbols-outlined text-[24px]">star</span>
                  <span class="material-symbols-outlined text-[24px]">star</span>
                  <span class="material-symbols-outlined text-[24px]">star</span>
                  <span class="ml-2 text-xs font-bold text-slate-500 font-label-caps uppercase">Témoignage à confirmer</span>
                </div>
                <blockquote class="text-xl sm:text-2xl font-headline-lg font-bold text-slate-900 leading-snug tracking-tight mb-6">
                  « Avec Eonda RH, la clôture mensuelle de paie et la génération des états CNPS ne prennent plus que <span class="text-emerald-700 underline decoration-amber-400 decoration-4">15 minutes</span> contre deux jours auparavant. La conformité fiscale est garantie et nos équipes sont sereines. »
                </blockquote>
              </div>
              <div class="pt-6 border-t border-slate-100 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div class="font-headline-sm font-bold text-slate-900 text-[17px]">Témoignage client — nom à confirmer</div>
                  <div class="text-[14px] text-slate-500 font-medium">Responsable RH &amp; Paie • Entreprise, Abidjan</div>
                </div>
                <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200">
                  <span class="material-symbols-outlined text-[16px] text-emerald-600">verified_user</span>
                  Client Vérifié Eonda
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-12 flex flex-wrap items-center justify-center gap-8 text-slate-400 text-xs sm:text-sm font-medium">
          <span class="flex items-center gap-2 text-slate-600 font-semibold"><span class="material-symbols-outlined text-emerald-600 text-[18px]">verified</span> Conforme DGI &amp; Direction Générale des Impôts</span>
          <span class="flex items-center gap-2 text-slate-600 font-semibold"><span class="material-symbols-outlined text-sky-600 text-[18px]">account_balance</span> Prise en charge Banque UEMOA (XOF)</span>
          <span class="flex items-center gap-2 text-slate-600 font-semibold"><span class="material-symbols-outlined text-amber-600 text-[18px]">health_and_safety</span> Déclarations CNPS &amp; FDFP 2025</span>
        </div>
      </div>
    </section>

    <!-- SECTION 4: 15 MODULES -->
    <section class="w-full py-24 px-6 lg:px-8 bg-slate-50/70 border-t border-slate-200/60" id="modules">
      <div class="max-w-[1280px] mx-auto">
        <div class="text-center max-w-2xl mx-auto mb-16">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-label-caps text-[11px] font-bold tracking-widest uppercase mb-3">
            Plateforme Complète
          </span>
          <h2 class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
            Tout le cycle de paie, au même endroit.
          </h2>
          <p class="font-body-lg text-lg text-slate-600">
            Du contrat d'embauche à la déclaration e-CNPS, chaque étape est couverte par un module dédié qui partage la même source de vérité.
          </p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="m in modules" :key="m.title" :class="`bg-white p-7 rounded-2xl shadow-sm hover:shadow-airtable border border-${m.color}-100/90 transition-all group flex flex-col justify-between hover:-translate-y-1`">
            <div>
              <div :class="`w-12 h-12 rounded-xl bg-${m.color}-500 text-white flex items-center justify-center mb-5 shadow-md group-hover:scale-110 transition-transform`">
                <span class="material-symbols-outlined text-[26px]">{{ m.icon }}</span>
              </div>
              <h3 class="font-headline-md text-xl font-bold text-slate-900 mb-2.5">{{ m.title }}</h3>
              <p class="font-body-md text-slate-600 text-[14px] leading-relaxed mb-6">{{ m.desc }}</p>
            </div>
            <div class="flex items-center gap-2 pt-4 border-t border-slate-100 flex-wrap">
              <span v-for="(t, i) in m.tags" :key="t" :class="i === 0 ? `px-2.5 py-1 rounded-md bg-${m.color}-50 text-${m.color}-700 font-label-caps text-[11px] font-bold` : 'px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-label-caps text-[11px] font-medium'">{{ t }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- SECTION 5: APERÇU CONCRET -->
    <section class="w-full py-24 px-6 lg:px-8 bg-white overflow-hidden" id="apercu">
      <div class="max-w-[1280px] mx-auto flex flex-col gap-28">
        <div class="text-center max-w-2xl mx-auto">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-label-caps text-[11px] font-bold tracking-widest uppercase mb-3">
            L'Aperçu Concret
          </span>
          <h2 class="font-headline-xl text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            Une prise en main immédiate.
          </h2>
          <p class="text-slate-600 text-lg mt-3">
            Découvrez comment Eonda RH transforme la gestion quotidienne de vos ressources humaines.
          </p>
        </div>

        <!-- SPOTLIGHT 1 -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div class="lg:col-span-7 relative group">
            <div class="absolute -inset-2 bg-gradient-to-tr from-emerald-500/20 to-teal-400/20 rounded-3xl blur-xl opacity-75 group-hover:opacity-100 transition-opacity"></div>
            <div class="relative rounded-2xl overflow-hidden bg-slate-900 p-2 sm:p-3 shadow-2xl border border-slate-200/50">
              <img alt="Bureau unifié et Dashboard Eonda RH" class="w-full h-auto object-cover rounded-xl group-hover:scale-[1.01] transition-transform duration-500" src="/dashboard.png" />
            </div>
          </div>
          <div class="lg:col-span-5 flex flex-col gap-5 text-left">
            <span class="font-label-caps text-[12px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-50 w-fit px-3 py-1 rounded-lg">
              Le Bureau Unifié
            </span>
            <h3 class="font-headline-lg text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Vos 15 modules dans une seule fenêtre
            </h3>
            <p class="font-body-lg text-slate-600 text-[16px] leading-relaxed">
              Une interface pensée comme un véritable poste de travail professionnel : vous ouvrez votre navigateur, vous chargez vos données de paie et tout est instantanément synchronisé. Aucune configuration réseau lourde, aucun serveur à administrer.
            </p>
            <ul class="space-y-3 pt-2">
              <li class="flex items-center gap-3 text-slate-700 text-[15px] font-medium">
                <span class="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
                Accès direct aux 15 raccourcis opérationnels
              </li>
              <li class="flex items-center gap-3 text-slate-700 text-[15px] font-medium">
                <span class="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
                Statuts en temps réel : indexation locale &amp; sauvegarde
              </li>
              <li class="flex items-center gap-3 text-slate-700 text-[15px] font-medium">
                <span class="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
                Rappels instantanés des dates de clôture de paie
              </li>
            </ul>
          </div>
        </div>

        <!-- SPOTLIGHT 2 -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div class="lg:col-span-5 order-2 lg:order-1 flex flex-col gap-5 text-left">
            <span class="font-label-caps text-[12px] font-bold text-amber-700 uppercase tracking-widest bg-amber-50 w-fit px-3 py-1 rounded-lg">
              Analytique &amp; Masse Salariale
            </span>
            <h3 class="font-headline-lg text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Pilotez votre masse salariale en temps réel
            </h3>
            <p class="font-body-lg text-slate-600 text-[16px] leading-relaxed">
              Visualisez avec clarté la décomposition de votre masse salariale : salaire net, cotisations CNPS patronales et salariales, quote-part de l'ITS et de la contribution FDFP. Anticipez les variations budgétaires trimestre par trimestre.
            </p>
            <ul class="space-y-3 pt-2">
              <li class="flex items-center gap-3 text-slate-700 text-[15px] font-medium">
                <span class="material-symbols-outlined text-amber-500 text-[20px]">check_circle</span>
                Graphiques dynamiques de répartition par département
              </li>
              <li class="flex items-center gap-3 text-slate-700 text-[15px] font-medium">
                <span class="material-symbols-outlined text-amber-500 text-[20px]">check_circle</span>
                Score de conformité fiscale en temps réel (CNPS &amp; FDFP)
              </li>
              <li class="flex items-center gap-3 text-slate-700 text-[15px] font-medium">
                <span class="material-symbols-outlined text-amber-500 text-[20px]">check_circle</span>
                Comparaison Réalisé vs Prévisionnel budgétaire mensuel
              </li>
            </ul>
          </div>
          <div class="lg:col-span-7 order-1 lg:order-2 relative group">
            <div class="absolute -inset-2 bg-gradient-to-tr from-amber-500/20 to-orange-400/20 rounded-3xl blur-xl opacity-75 group-hover:opacity-100 transition-opacity"></div>
            <div class="relative rounded-2xl overflow-hidden bg-slate-900 p-2 sm:p-3 shadow-2xl border border-slate-200/50">
              <img alt="Dashboard Analytique RH et Graphiques de Masse Salariale" class="w-full h-auto object-cover rounded-xl group-hover:scale-[1.01] transition-transform duration-500" src="/demo-bureau.png" />
            </div>
          </div>
        </div>

        <!-- SPOTLIGHT 3 -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div class="lg:col-span-7 relative">
            <div class="glass-card rounded-2xl p-6 sm:p-8 shadow-airtable border border-slate-200">
              <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                    <span class="material-symbols-outlined text-[20px]">description</span>
                  </div>
                  <div>
                    <div class="font-headline-sm font-bold text-slate-900 text-[15px]">Contrat de Travail à Durée Déterminée (CDD)</div>
                    <div class="text-[12px] text-slate-500">Conforme Art. 14 du Code du Travail de Côte d'Ivoire</div>
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase font-label-caps">Modèle Officiel</span>
              </div>
              <div class="bg-slate-50 p-5 rounded-xl text-slate-700 font-code-cell text-[12px] leading-relaxed border border-slate-200/60 space-y-2">
                <p class="font-bold text-slate-900 uppercase">« ENTRE LES SOUSSIGNÉS : »</p>
                <p><strong class="text-emerald-700">1. L'EMPLOYEUR :</strong> [Raison sociale], SA au capital de [montant] FCFA, immatriculée au RCCM d'Abidjan sous le n° [numéro], N° CNPS [numéro].</p>
                <p><strong class="text-amber-600">2. LE SALARIÉ :</strong> [Nom Prénom], né le [date] à [lieu], nationalité ivoirienne, domicilié à [ville].</p>
                <p class="text-slate-500 italic pt-2">« Article 3 - Rémunération : Le salarié percevra un salaire mensuel catégorique brut de base complété par les indemnités de transport réglementaires... »</p>
              </div>
            </div>
          </div>
          <div class="lg:col-span-5 flex flex-col gap-5 text-left">
            <span class="font-label-caps text-[12px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-50 w-fit px-3 py-1 rounded-lg">
              Documents Juridiques
            </span>
            <h3 class="font-headline-lg text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Contrats et attestations édités sans ressaisie
            </h3>
            <p class="font-body-lg text-slate-600 text-[16px] leading-relaxed">
              Générez vos CDI, CDD, avenants, certificats de travail et attestations de congés en combinant automatiquement les données des employés avec les clauses juridiques ivoiriennes à jour.
            </p>
            <div class="pt-2 flex flex-wrap gap-2">
              <span class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">Contrat CDI / CDD</span>
              <span class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">Attestation de Travail</span>
              <span class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">Reçu pour Solde</span>
              <span class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">Ordre de Mission</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- SECTION 6: WHY -->
    <section class="w-full py-24 px-6 lg:px-8 bg-footer-dark text-white relative">
      <div class="max-w-[1280px] mx-auto">
        <div class="text-center max-w-2xl mx-auto mb-16">
          <span class="font-label-caps text-emerald-400 uppercase tracking-widest text-[11px] font-bold block mb-2">
            Pourquoi Choisir Eonda RH
          </span>
          <h2 class="font-headline-xl text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Conçu pour la paie d'ici.
          </h2>
          <p class="text-slate-400 text-base sm:text-lg mt-3">
            La précision juridique et la flexibilité logicielle adaptées à la réalité économique de nos entreprises.
          </p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div class="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/[0.08] hover:border-emerald-500/50 transition-all flex flex-col gap-4">
            <div class="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <span class="material-symbols-outlined text-[30px]">verified</span>
            </div>
            <h3 class="font-headline-md text-xl font-bold text-white">Conforme à 100%</h3>
            <p class="text-slate-300 text-[15px] leading-relaxed">
              Barèmes officiels du droit du travail ivoirien, règles CNPS, tranches ITS et contribution patronale au FDFP : nous actualisons la plateforme dès qu'une loi de finances paraît.
            </p>
          </div>
          <div class="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/[0.08] hover:border-amber-500/50 transition-all flex flex-col gap-4">
            <div class="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <span class="material-symbols-outlined text-[30px]">bolt</span>
            </div>
            <h3 class="font-headline-md text-xl font-bold text-white">Ultra Rapide &amp; Fluide</h3>
            <p class="text-slate-300 text-[15px] leading-relaxed">
              Un classeur Excel déposé, un clic : l'ensemble des bulletins du mois, le fichier de virement bancaire et les déclarations périodiques sont prêts en quelques secondes.
            </p>
          </div>
          <div class="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/[0.08] hover:border-sky-500/50 transition-all flex flex-col gap-4">
            <div class="w-14 h-14 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
              <span class="material-symbols-outlined text-[30px]">devices</span>
            </div>
            <h3 class="font-headline-md text-xl font-bold text-white">Accessible Partout &amp; Hors-Ligne</h3>
            <p class="text-slate-300 text-[15px] leading-relaxed">
              Sur le Web ou en PWA installable sur PC, Mac ou smartphone. Vos données restent sécurisées sur votre machine grâce à la technologie IndexedDB même en cas de coupure Internet.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- SECTION 7: TARIFS -->
    <section class="w-full py-24 px-6 lg:px-8 bg-slate-50" id="tarifs">
      <div class="max-w-[1100px] mx-auto">
        <div class="text-center max-w-xl mx-auto mb-16">
          <span class="font-label-caps text-emerald-700 uppercase tracking-widest text-[11px] font-bold block mb-2">
            Grille Tarifaire
          </span>
          <h2 class="font-headline-xl text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mb-3">
            Gratuit, vraiment gratuit.
          </h2>
          <p class="font-body-lg text-slate-600 text-lg">
            Les outils essentiels pour calculer et générer votre paie dès aujourd'hui — sans abonnement forcé.
          </p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div class="lg:col-span-6 bg-white p-8 sm:p-10 rounded-3xl shadow-airtable border border-slate-200/80 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-4">
                <span class="font-headline-md text-2xl font-bold text-slate-900">Standard Gratuit</span>
                <span class="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-label-caps text-[11px] font-bold">Pour démarrer</span>
              </div>
              <div class="mb-6">
                <span class="font-display-hero text-4xl sm:text-5xl font-extrabold text-slate-900">0 FCFA</span>
                <span class="text-slate-500 font-medium text-sm"> / mois • Sans engagement</span>
              </div>
              <p class="text-slate-600 text-[14px] mb-6">
                Parfait pour les indépendants, TPE et comptables qui ont besoin de simuler et d'éditer des bulletins certifiés.
              </p>
              <ul class="space-y-3.5 mb-8">
                <li class="flex items-center gap-3 text-slate-700 text-[14px]">
                  <span class="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
                  Simulateur de bulletin de paie complet
                </li>
                <li class="flex items-center gap-3 text-slate-700 text-[14px]">
                  <span class="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
                  Calcul des congés payés légaux (base 26j/an)
                </li>
                <li class="flex items-center gap-3 text-slate-700 text-[14px]">
                  <span class="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
                  Solde de tout compte et indemnités légales
                </li>
                <li class="flex items-center gap-3 text-slate-700 text-[14px]">
                  <span class="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
                  Exports individuels en PDF sécurisé
                </li>
                <li class="flex items-center gap-3 text-slate-700 text-[14px]">
                  <span class="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
                  Barèmes fiscaux Côte d'Ivoire 2025 à jour
                </li>
              </ul>
            </div>
            <a :href="appUrl('hr')" class="w-full py-4 px-6 rounded-xl bg-slate-900 text-white text-center font-headline-sm font-bold text-[15px] hover:bg-brand-emerald-dark hover:shadow-lg transition-all">
              Commencer gratuitement →
            </a>
          </div>
          <div class="lg:col-span-6 bg-[#0B1A14] text-white p-8 sm:p-10 rounded-3xl shadow-2xl border border-emerald-500/30 flex flex-col justify-between relative overflow-hidden">
            <div class="absolute -right-16 -top-16 w-60 h-60 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none"></div>
            <div>
              <div class="flex items-center justify-between mb-4">
                <span class="font-headline-md text-2xl font-bold text-white">Pro &amp; Sur-Mesure</span>
                <span class="px-3 py-1 rounded-full bg-amber-500 text-slate-900 font-label-caps text-[11px] font-bold">PME &amp; Cabinets</span>
              </div>
              <div class="mb-6">
                <span class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-emerald-400">Sur Devis</span>
                <span class="text-slate-400 font-medium text-sm"> / selon volume effectif</span>
              </div>
              <p class="text-slate-300 text-[14px] mb-6">
                Pour les entreprises qui gèrent une équipe grandissante et exigent des déclarations collectives rapides et personnalisées.
              </p>
              <ul class="space-y-3.5 mb-8">
                <li class="flex items-center gap-3 text-slate-200 text-[14px]">
                  <span class="material-symbols-outlined text-emerald-400 text-[20px]">verified</span>
                  Import massif Excel en 1 clic (500+ employés)
                </li>
                <li class="flex items-center gap-3 text-slate-200 text-[14px]">
                  <span class="material-symbols-outlined text-emerald-400 text-[20px]">verified</span>
                  Bordereaux périodiques e-CNPS &amp; DISA prête
                </li>
                <li class="flex items-center gap-3 text-slate-200 text-[14px]">
                  <span class="material-symbols-outlined text-emerald-400 text-[20px]">verified</span>
                  Alertes automatiques fin de contrats CDD
                </li>
                <li class="flex items-center gap-3 text-slate-200 text-[14px]">
                  <span class="material-symbols-outlined text-emerald-400 text-[20px]">verified</span>
                  Logo et entête personnalisés de votre entreprise
                </li>
                <li class="flex items-center gap-3 text-slate-200 text-[14px]">
                  <span class="material-symbols-outlined text-emerald-400 text-[20px]">verified</span>
                  Assistance prioritaire par WhatsApp &amp; Téléphone
                </li>
              </ul>
            </div>
            <a :href="WHATSAPP_URL" target="_blank" rel="noopener" class="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 text-center font-headline-sm font-bold text-[15px] hover:shadow-[0_8px_20px_rgba(16,185,129,0.35)] transition-all">
              Demander une démonstration →
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- SECTION 8: FAQ -->
    <section class="w-full py-24 px-6 lg:px-8 bg-white" id="faq">
      <div class="max-w-[860px] mx-auto">
        <div class="text-center mb-16">
          <span class="font-label-caps text-emerald-700 uppercase tracking-widest text-[11px] font-bold block mb-2">
            Questions Fréquentes
          </span>
          <h2 class="font-headline-xl text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            Tout ce qu'il faut savoir.
          </h2>
        </div>
        <div class="space-y-4">
          <div v-for="(f, i) in faqs" :key="f.q" class="bg-slate-50 rounded-2xl border border-slate-200/80 overflow-hidden transition-all">
            <button @click="toggleFaq(i)" class="faq-toggle w-full p-6 flex items-center justify-between text-left font-headline-sm font-bold text-slate-900 hover:text-emerald-700 transition-colors">
              <span class="text-base sm:text-lg">{{ f.q }}</span>
              <span class="material-symbols-outlined text-slate-400 transition-transform duration-300" :class="{ 'rotate-180': openFaq === i }">expand_more</span>
            </button>
            <div v-show="openFaq === i" class="px-6 pb-6 text-slate-600 leading-relaxed text-[15px]">
              {{ f.a }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- SECTION 9: CTA FINAL -->
    <section class="w-full py-24 px-6 lg:px-8 bg-gradient-to-br from-[#06331e] via-[#0b5434] to-[#042817] text-white relative overflow-hidden">
      <div class="absolute -top-32 -left-32 w-96 h-96 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-amber-400/20 rounded-full blur-3xl pointer-events-none"></div>
      <div class="max-w-[1100px] mx-auto text-center flex flex-col items-center relative z-10">
        <div class="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-6">
          <span class="font-label-caps text-[12px] font-bold text-emerald-200 uppercase tracking-wider">Côte d'Ivoire &amp; Afrique de l'Ouest</span>
        </div>
        <h2 class="font-display-hero text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] max-w-3xl mb-6 text-white">
          Prêt à simplifier votre gestion de paie dès aujourd'hui ?
        </h2>
        <p class="font-body-lg text-emerald-100 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          Créez votre espace de paie en une minute chrono. Aucun paiement préalable, aucun déploiement serveur nécessaire.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-4">
          <a :href="appUrl('hr')" class="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-white text-emerald-900 font-headline-sm font-extrabold text-[16px] shadow-[0_15px_35px_rgba(0,0,0,0.3)] hover:bg-emerald-50 hover:scale-[1.02] active:scale-[0.99] transition-all">
            <span>Ouvrir l'application maintenant</span>
            <span class="material-symbols-outlined text-[20px]">arrow_forward</span>
          </a>
          <a :href="appUrl('hr')" class="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-white/10 text-white font-headline-sm font-bold text-[16px] border border-white/30 backdrop-blur-md hover:bg-white/20 hover:scale-[1.02] transition-all">
            <span class="material-symbols-outlined text-[20px]">install_desktop</span>
            <span>Installer l'application PWA</span>
          </a>
        </div>
      </div>
    </section>
  </main>

  <!-- FOOTER -->
  <footer class="w-full bg-[#050e0a] text-slate-300 pt-20 pb-12 border-t border-emerald-950">
    <div class="max-w-[1280px] mx-auto px-6 lg:px-8">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 pb-16 border-b border-slate-800/80">
        <div class="lg:col-span-2 flex flex-col items-start gap-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-white p-1">
              <img alt="Eonda RH Logo" class="h-7 w-auto object-contain" src="/logo.png" />
            </div>
            <span class="font-headline-md text-2xl font-extrabold text-white tracking-tight">
              EONDA <span class="text-amber-400">RH</span>
            </span>
          </div>
          <p class="text-slate-400 text-sm leading-relaxed max-w-sm">
            La solution de référence pour le calcul de salaire, les cotisations CNPS, la gestion des congés et les formalités RH en Côte d'Ivoire.
          </p>
          <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-800/50 text-emerald-300 text-xs font-semibold">
            Conforme Code du Travail CI 2025
          </div>
        </div>
        <div class="flex flex-col gap-3">
          <span class="text-xs font-bold text-slate-100 uppercase tracking-wider font-label-caps">Produit</span>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" href="#modules">15 Modules RH</a>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" href="#apercu">Moteur de Paie CI</a>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" href="#apercu">Analytique RH</a>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" href="#tarifs">Grille Tarifaire</a>
        </div>
        <div class="flex flex-col gap-3">
          <span class="text-xs font-bold text-slate-100 uppercase tracking-wider font-label-caps">Légal &amp; Conformité</span>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" href="#modules">Déclarations CNPS &amp; DISA</a>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" href="#modules">Réglementation FDFP</a>
          <button @click="$emit('legal', 'cgu')" class="text-left text-sm text-slate-400 hover:text-emerald-400 transition-colors bg-transparent border-none p-0 cursor-pointer font-inherit">Conditions Générales</button>
          <button @click="$emit('legal', 'confidentialite')" class="text-left text-sm text-slate-400 hover:text-emerald-400 transition-colors bg-transparent border-none p-0 cursor-pointer font-inherit">Protection des Données</button>
        </div>
        <div class="flex flex-col gap-3">
          <span class="text-xs font-bold text-slate-100 uppercase tracking-wider font-label-caps">Contact &amp; Support</span>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" href="mailto:info@eonda.online">info@eonda.online</a>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" :href="WHATSAPP_URL" target="_blank" rel="noopener">Assistance WhatsApp Directe</a>
          <span class="text-sm text-slate-400">Plateau, Abidjan - Côte d'Ivoire</span>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" href="#faq">Centre d'aide &amp; FAQ</a>
        </div>
      </div>
      <div class="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <p>© {{ new Date().getFullYear() }} Eonda RH. Tous droits réservés.</p>
        <div class="flex items-center gap-6">
          <span class="inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>CNPS CI</span>
          <span class="inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>FDFP</span>
          <span class="inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>ITS &amp; IGR</span>
          <span class="inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>DGI</span>
        </div>
      </div>
    </div>
  </footer>
</div>
</template>
