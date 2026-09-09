<script setup>
import { ref } from 'vue'
defineEmits(['login', 'legal'])

// Portail ONDA : présente les 5 outils de la plateforme. Chaque carte renvoie
// directement vers l'application correspondante (rh.eonda.online pour l'Espace
// RH, simulateur public pour les autres outils, gratuits et sans compte).
const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL || 'https://rh.eonda.online/'
const SIM_APP_URL = import.meta.env.VITE_SIM_APP_URL || 'https://simulateur.eonda.online/'
const WHATSAPP_URL = 'https://wa.me/2250151144337'

const appUrl = (module) => module ? `${MAIN_APP_URL}?module=${module}` : MAIN_APP_URL
const simUrl = (query) => query ? `${SIM_APP_URL}?${query}` : `${SIM_APP_URL}?module=home`

const outils = [
  {
    id: 'rh', icon: 'payments', color: 'emerald',
    kicker: 'Paie & RH',
    title: 'Eonda RH',
    desc: "Bulletins de paie, cotisations CNPS, déclarations e-CNPS, congés, contrats et solde de tout compte — la chaîne de paie complète.",
    tags: ['15 Modules', 'Conforme CI'],
    href: appUrl('landing'),
    cta: "Ouvrir l'Espace RH",
  },
  {
    id: 'loan', icon: 'account_balance', color: 'sky',
    kicker: 'Crédit',
    title: 'Comprendre le Crédit',
    desc: "Simulez vos mensualités, votre TEG et votre capacité d'emprunt avant de signer un prêt bancaire.",
    tags: ['Mensualité', 'Scoring'],
    href: simUrl('module=loan'),
    cta: 'Ouvrir le simulateur',
  },
  {
    id: 'tax', icon: 'request_quote', color: 'amber',
    kicker: 'Fiscalité',
    title: 'Fiscalité PME',
    desc: "Comparez les régimes d'imposition et estimez votre charge fiscale selon votre chiffre d'affaires.",
    tags: ['Choix du Régime', 'TPS & Réel'],
    href: simUrl('module=tax'),
    cta: 'Ouvrir le comparateur',
  },
  {
    id: 'outils_pro', icon: 'insights', color: 'rose',
    kicker: 'Gestion',
    title: 'Santé Financière',
    desc: 'Prix de vente, marge brute et seuil de rentabilité — pilotez la rentabilité de votre activité.',
    tags: ['Point Mort', 'Marge Brute'],
    href: simUrl('module=outils_pro'),
    cta: 'Ouvrir les outils',
  },
  {
    id: 'analyse_financiere', icon: 'monitoring', color: 'teal',
    kicker: 'Bilan OHADA',
    title: 'Analyse Financière',
    desc: '26 ratios financiers et score de financement bancaire à partir de votre Bilan et Compte de Résultat SYSCOHADA.',
    tags: ['26 Ratios', 'Export PDF & Excel'],
    href: simUrl('module=analyse_financiere'),
    cta: "Analyser mon bilan",
  },
]
</script>

<template>
<div class="w-full font-body-md text-on-surface antialiased overflow-x-hidden">
  <!-- HEADER -->
  <header class="fixed top-0 w-full z-50 bg-white/85 backdrop-blur-xl border-b border-slate-200/70 transition-all">
    <div class="h-20 max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
      <div class="flex items-center gap-10 min-w-0">
        <a class="flex items-center gap-2.5 sm:gap-3.5 group min-w-0" href="#">
          <div class="relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-amber-50/80 border border-emerald-100 shadow-sm group-hover:scale-105 group-hover:shadow-md transition-all flex-shrink-0">
            <img alt="Logo ONDA" class="h-7 sm:h-8 w-auto object-contain drop-shadow-sm" src="/logo.png" />
          </div>
          <div class="flex flex-col min-w-0">
            <span class="font-headline-md font-extrabold text-[18px] sm:text-[21px] text-brand-emerald-dark tracking-tight leading-none group-hover:text-primary-container transition-colors whitespace-nowrap">
              ONDA
            </span>
            <span class="hidden sm:block text-[11px] font-medium text-slate-500 tracking-wider uppercase mt-1 whitespace-nowrap">Plateforme Financière &amp; Paie</span>
          </div>
        </a>
        <nav class="hidden lg:flex items-center gap-1">
          <a class="px-4 py-2 rounded-xl text-[14px] font-medium text-slate-600 hover:text-brand-emerald-dark hover:bg-emerald-50/60 transition-all" href="#outils">Les outils</a>
          <a class="px-4 py-2 rounded-xl text-[14px] font-medium text-slate-600 hover:text-brand-emerald-dark hover:bg-emerald-50/60 transition-all" :href="appUrl('landing')">Espace RH</a>
          <a class="px-4 py-2 rounded-xl text-[14px] font-medium text-slate-600 hover:text-brand-emerald-dark hover:bg-emerald-50/60 transition-all" :href="simUrl()">Simulateurs</a>
        </nav>
      </div>
      <div class="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <button @click="$emit('login')" class="hidden sm:inline-flex items-center px-4 py-2.5 rounded-xl text-[14px] font-semibold text-slate-700 hover:text-brand-emerald-dark hover:bg-slate-100 transition-colors whitespace-nowrap">
          Se connecter
        </button>
        <a :href="appUrl('landing')" class="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-primary-container to-emerald-700 text-white font-headline-sm font-semibold text-[13px] sm:text-[14px] shadow-[0_4px_14px_rgba(15,91,56,0.25)] hover:shadow-[0_6px_20px_rgba(15,91,56,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition-all whitespace-nowrap">
          <span>Ouvrir l'application</span>
          <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
        </a>
      </div>
    </div>
  </header>

  <main class="w-full pt-20">
    <!-- HERO -->
    <section class="relative overflow-hidden pt-12 pb-24 lg:pt-16 lg:pb-32 px-4 sm:px-6 lg:px-8 hero-glow-mesh">
      <div class="absolute -top-12 left-1/2 -translate-x-1/2 w-[850px] h-[520px] bg-gradient-to-tr from-emerald-400/25 via-teal-300/20 to-amber-300/25 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div class="absolute top-1/3 -left-20 w-80 h-80 bg-emerald-200/40 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div class="absolute top-1/4 -right-20 w-96 h-96 bg-amber-200/40 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div class="max-w-[1280px] mx-auto flex flex-col items-center text-center">
        <div class="inline-flex items-center gap-2.5 px-4 py-2 rounded-full glass-card border border-emerald-200/80 shadow-sm mb-6 hover:border-emerald-400 transition-colors">
          <span class="font-label-caps text-[12px] font-bold text-brand-emerald-dark tracking-wide uppercase">
            5 outils • Conformes Côte d'Ivoire • Démarrage gratuit
          </span>
        </div>
        <h1 class="font-display-hero text-4xl sm:text-5xl md:text-6xl lg:text-[68px] font-extrabold text-slate-900 tracking-tight leading-[1.1] max-w-5xl mx-auto mb-6">
          Vos décisions financières, <span class="bg-gradient-to-r from-emerald-700 via-primary to-teal-600 bg-clip-text text-transparent">au clair</span>.
        </h1>
        <p class="font-body-lg text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto mb-8 font-normal leading-relaxed">
          Paie &amp; RH, simulation de crédit, fiscalité PME, santé financière et analyse de bilan OHADA — tout ce qu'ONDA a développé, réuni au même endroit et conforme au droit d'ici.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-4 mb-10">
          <a href="#outils" class="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-700 via-primary to-emerald-800 text-white font-headline-sm font-bold text-[16px] shadow-[0_12px_24px_rgba(15,91,56,0.28)] hover:shadow-[0_16px_32px_rgba(15,91,56,0.38)] hover:-translate-y-1 transition-all">
            <span>Voir les outils</span>
            <span class="material-symbols-outlined text-[20px]">arrow_downward</span>
          </a>
          <a :href="appUrl('landing')" class="inline-flex items-center gap-2.5 px-7 py-4 rounded-2xl bg-white text-slate-800 font-headline-sm font-semibold text-[15px] border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:-translate-y-0.5 transition-all">
            <span>Ouvrir l'Espace RH</span>
            <span class="material-symbols-outlined text-emerald-600 text-[20px]">arrow_forward</span>
          </a>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-2.5 mb-14">
          <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-100/80 text-emerald-900 border border-emerald-200 font-label-caps text-[12px] font-bold">Paie &amp; RH</span>
          <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-sky-100/80 text-sky-900 border border-sky-200 font-label-caps text-[12px] font-bold">Crédit</span>
          <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-100/80 text-amber-900 border border-amber-200 font-label-caps text-[12px] font-bold">Fiscalité PME</span>
          <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-rose-100/80 text-rose-900 border border-rose-200 font-label-caps text-[12px] font-bold">Santé Financière</span>
          <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-100/80 text-teal-900 border border-teal-200 font-label-caps text-[12px] font-bold">Bilan OHADA</span>
        </div>

        <!-- Hero mockup -->
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
                  <span>https://eonda.online</span>
                </div>
              </div>
            </div>
            <div class="relative overflow-hidden rounded-xl bg-slate-950">
              <img alt="Plateforme ONDA" class="w-full h-auto object-cover rounded-xl transition-transform duration-700 group-hover:scale-[1.01]" src="/dashboard.png" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- METRIC STRIP -->
    <section class="w-full bg-[#081711] text-white py-12 border-y border-emerald-950">
      <div class="max-w-[1280px] mx-auto px-6 lg:px-8">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          <div class="flex flex-col gap-1.5 border-l-2 border-emerald-500/40 pl-5">
            <span class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-emerald-400">5 Outils</span>
            <span class="font-label-caps text-[12px] font-bold text-emerald-200/80 uppercase tracking-wider">Une Plateforme</span>
            <p class="text-slate-400 text-[13px] leading-relaxed">Paie, crédit, fiscalité, rentabilité et analyse de bilan</p>
          </div>
          <div class="flex flex-col gap-1.5 border-l-2 border-amber-500/40 pl-5">
            <span class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-amber-400">100% CI</span>
            <span class="font-label-caps text-[12px] font-bold text-amber-200/80 uppercase tracking-wider">Droit &amp; Fiscalité</span>
            <p class="text-slate-400 text-[13px] leading-relaxed">CNPS, DGI, OHADA/SYSCOHADA, toujours à jour</p>
          </div>
          <div class="flex flex-col gap-1.5 border-l-2 border-sky-500/40 pl-5">
            <span class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-sky-400">0 FCFA</span>
            <span class="font-label-caps text-[12px] font-bold text-sky-200/80 uppercase tracking-wider">Démarrage Gratuit</span>
            <p class="text-slate-400 text-[13px] leading-relaxed">Simulateurs accessibles sans carte bancaire</p>
          </div>
          <div class="flex flex-col gap-1.5 border-l-2 border-teal-500/40 pl-5">
            <span class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-teal-400">PDF + XLS</span>
            <span class="font-label-caps text-[12px] font-bold text-teal-200/80 uppercase tracking-wider">Exports 1-Clic</span>
            <p class="text-slate-400 text-[13px] leading-relaxed">Bulletins, bordereaux et fiches d'analyse exportables</p>
          </div>
        </div>
      </div>
    </section>

    <!-- LES 5 OUTILS -->
    <section class="w-full py-24 px-6 lg:px-8 bg-slate-50/70 border-t border-slate-200/60" id="outils">
      <div class="max-w-[1280px] mx-auto">
        <div class="text-center max-w-2xl mx-auto mb-16">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-label-caps text-[11px] font-bold tracking-widest uppercase mb-3">
            Les Outils ONDA
          </span>
          <h2 class="font-headline-xl text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
            Développés, en ligne, prêts à l'emploi.
          </h2>
          <p class="font-body-lg text-lg text-slate-600">
            Chaque outil s'ouvre directement — l'Espace RH sur sa propre page, les simulateurs sur leur application dédiée.
          </p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="o in outils" :key="o.id" :class="`bg-white p-7 rounded-2xl shadow-sm hover:shadow-airtable border border-${o.color}-100/90 transition-all group flex flex-col justify-between hover:-translate-y-1`">
            <div>
              <div :class="`w-12 h-12 rounded-xl bg-${o.color}-500 text-white flex items-center justify-center mb-5 shadow-md group-hover:scale-110 transition-transform`">
                <span class="material-symbols-outlined text-[26px]">{{ o.icon }}</span>
              </div>
              <span :class="`font-label-caps text-[11px] font-bold uppercase tracking-widest text-${o.color}-700`">{{ o.kicker }}</span>
              <h3 class="font-headline-md text-xl font-bold text-slate-900 mt-1 mb-2.5">{{ o.title }}</h3>
              <p class="font-body-md text-slate-600 text-[14px] leading-relaxed mb-6">{{ o.desc }}</p>
            </div>
            <div>
              <div class="flex items-center gap-2 pt-4 mb-4 border-t border-slate-100 flex-wrap">
                <span v-for="(t, i) in o.tags" :key="t" :class="i === 0 ? `px-2.5 py-1 rounded-md bg-${o.color}-50 text-${o.color}-700 font-label-caps text-[11px] font-bold` : 'px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-label-caps text-[11px] font-medium'">{{ t }}</span>
              </div>
              <a :href="o.href" class="inline-flex items-center gap-1.5 text-[14px] font-bold" :class="`text-${o.color}-700 hover:text-${o.color}-800`">
                {{ o.cta }} <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>

        <div class="mt-10 flex flex-wrap items-center justify-center gap-2 p-5 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60">
          <span class="font-label-caps text-[12px] font-bold text-emerald-800 uppercase tracking-wide mr-2">100% gratuit, sans compte :</span>
          <a :href="simUrl('module=bulletin')" class="px-3 py-1.5 rounded-full bg-white border border-emerald-200 text-[13px] font-semibold text-slate-700 hover:border-emerald-400">Simuler un bulletin →</a>
          <a :href="simUrl('module=hr&type=conges')" class="px-3 py-1.5 rounded-full bg-white border border-emerald-200 text-[13px] font-semibold text-slate-700 hover:border-emerald-400">Calcul de congés →</a>
          <a :href="simUrl('module=hr&type=solde')" class="px-3 py-1.5 rounded-full bg-white border border-emerald-200 text-[13px] font-semibold text-slate-700 hover:border-emerald-400">Solde de tout compte →</a>
        </div>
      </div>
    </section>

    <!-- CONFORMITÉ -->
    <section class="w-full py-16 px-6 lg:px-8 bg-white">
      <div class="max-w-[1000px] mx-auto flex flex-wrap items-center justify-center gap-8 text-slate-400 text-xs sm:text-sm font-medium">
        <span class="flex items-center gap-2 text-slate-600 font-semibold"><span class="material-symbols-outlined text-emerald-600 text-[18px]">verified</span> Conforme DGI &amp; Direction Générale des Impôts</span>
        <span class="flex items-center gap-2 text-slate-600 font-semibold"><span class="material-symbols-outlined text-sky-600 text-[18px]">account_balance</span> Prise en charge Banque UEMOA (XOF)</span>
        <span class="flex items-center gap-2 text-slate-600 font-semibold"><span class="material-symbols-outlined text-teal-600 text-[18px]">policy</span> Référentiel OHADA/SYSCOHADA révisé</span>
        <span class="flex items-center gap-2 text-slate-600 font-semibold"><span class="material-symbols-outlined text-amber-600 text-[18px]">health_and_safety</span> Déclarations CNPS &amp; FDFP 2025</span>
      </div>
    </section>

    <!-- CTA FINAL -->
    <section class="w-full py-24 px-6 lg:px-8 bg-gradient-to-br from-[#06331e] via-[#0b5434] to-[#042817] text-white relative overflow-hidden">
      <div class="absolute -top-32 -left-32 w-96 h-96 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-amber-400/20 rounded-full blur-3xl pointer-events-none"></div>
      <div class="max-w-[1100px] mx-auto text-center flex flex-col items-center relative z-10">
        <div class="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-6">
          <span class="font-label-caps text-[12px] font-bold text-emerald-200 uppercase tracking-wider">Côte d'Ivoire &amp; Afrique de l'Ouest</span>
        </div>
        <h2 class="font-display-hero text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] max-w-3xl mb-6 text-white">
          Prêt à mettre vos finances au clair ?
        </h2>
        <p class="font-body-lg text-emerald-100 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          Choisissez un outil et commencez en une minute chrono. Aucun paiement préalable, aucun déploiement serveur nécessaire.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-4">
          <a href="#outils" class="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-white text-emerald-900 font-headline-sm font-extrabold text-[16px] shadow-[0_15px_35px_rgba(0,0,0,0.3)] hover:bg-emerald-50 hover:scale-[1.02] active:scale-[0.99] transition-all">
            <span>Voir les outils</span>
            <span class="material-symbols-outlined text-[20px]">arrow_forward</span>
          </a>
          <a :href="WHATSAPP_URL" target="_blank" rel="noopener" class="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-white/10 text-white font-headline-sm font-bold text-[16px] border border-white/30 backdrop-blur-md hover:bg-white/20 hover:scale-[1.02] transition-all">
            <span class="material-symbols-outlined text-[20px]">chat</span>
            <span>Parler sur WhatsApp</span>
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
              <img alt="ONDA Logo" class="h-7 w-auto object-contain" src="/logo.png" />
            </div>
            <span class="font-headline-md text-2xl font-extrabold text-white tracking-tight">ONDA</span>
          </div>
          <p class="text-slate-400 text-sm leading-relaxed max-w-sm">
            Plateforme d'outils financiers et de paie pour la Côte d'Ivoire : Eonda RH, simulation de crédit, fiscalité PME, santé financière et analyse de bilan OHADA.
          </p>
        </div>
        <div class="flex flex-col gap-3">
          <span class="text-xs font-bold text-slate-100 uppercase tracking-wider font-label-caps">Outils</span>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" :href="appUrl('landing')">Eonda RH — Paie</a>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" :href="simUrl('module=loan')">Simulateur de Crédit</a>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" :href="simUrl('module=tax')">Fiscalité PME</a>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" :href="simUrl('module=outils_pro')">Santé Financière</a>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" :href="simUrl('module=analyse_financiere')">Analyse Financière OHADA</a>
        </div>
        <div class="flex flex-col gap-3">
          <span class="text-xs font-bold text-slate-100 uppercase tracking-wider font-label-caps">Légal</span>
          <button @click="$emit('legal', 'cgu')" class="text-left text-sm text-slate-400 hover:text-emerald-400 transition-colors bg-transparent border-none p-0 cursor-pointer font-inherit">Conditions Générales</button>
          <button @click="$emit('legal', 'confidentialite')" class="text-left text-sm text-slate-400 hover:text-emerald-400 transition-colors bg-transparent border-none p-0 cursor-pointer font-inherit">Protection des Données</button>
        </div>
        <div class="flex flex-col gap-3">
          <span class="text-xs font-bold text-slate-100 uppercase tracking-wider font-label-caps">Contact &amp; Support</span>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" href="mailto:info@eonda.online">info@eonda.online</a>
          <a class="text-sm text-slate-400 hover:text-emerald-400 transition-colors" :href="WHATSAPP_URL" target="_blank" rel="noopener">Assistance WhatsApp</a>
          <span class="text-sm text-slate-400">Plateau, Abidjan - Côte d'Ivoire</span>
        </div>
      </div>
      <div class="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <p>© {{ new Date().getFullYear() }} ONDA. Tous droits réservés.</p>
        <div class="flex items-center gap-6">
          <span class="inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>CNPS CI</span>
          <span class="inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>FDFP</span>
          <span class="inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-teal-400"></span>OHADA</span>
          <span class="inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>DGI</span>
        </div>
      </div>
    </div>
  </footer>
</div>
</template>
