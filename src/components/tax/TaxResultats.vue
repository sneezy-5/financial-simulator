<script setup>
import { formatFCFA } from '../../services/taxService.js'

const props = defineProps({
  resultats: Object,
  suggestions: Array,
  nom: String,
})

const r = props.resultats

const santeMap = {
  vert: { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', label: 'Bonne santé financière' },
  orange: { color: '#b45309', bg: '#fffbeb', border: '#fde68a', label: 'À surveiller' },
  rouge: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', label: 'Situation difficile' },
}
const sante = santeMap[r.sante] || santeMap.vert

const iconesSante = {
  vert: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`,
  orange: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>`,
  rouge: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>`,
}
</script>

<template>
  <div class="res-card">

    <!-- En-tête avec statut de santé -->
    <div class="res-header" :style="{ background: sante.bg, borderBottom: '1px solid ' + sante.border }">
      <div class="health-badge" :style="{ color: sante.color, background: 'white', border: '1px solid ' + sante.border }">
        <span v-html="iconesSante[r.sante]"></span>
        {{ sante.label }}
      </div>
      <div class="res-meta">
        <span class="res-name">{{ nom || 'Votre entreprise' }}</span>
        <span class="regime-tag" :style="{ color: '#0f766e', background: '#f0fdfa', border: '1px solid #99f6e4' }">{{ r.regime.label }}</span>
      </div>
      <p class="health-msg" :style="{ color: sante.color }">{{ r.santeMessage }}</p>
    </div>

    <!-- Grille de stats principales -->
    <div class="stats-grid">
      <div class="stat">
        <div class="stat-label">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"/></svg>
          Impôt annuel
        </div>
        <div class="stat-value">{{ formatFCFA(r.impot) }}</div>
        <div class="stat-sub">{{ r.detail }}</div>
      </div>
      <div class="stat">
        <div class="stat-label">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
          À payer chaque mois
        </div>
        <div class="stat-value">{{ formatFCFA(r.paiementMensuel) }}</div>
        <div class="stat-sub">À provisionner régulièrement</div>
      </div>
      <div class="stat" :class="r.beneficeNet < 0 ? 'stat-danger' : 'stat-success'">
        <div class="stat-label">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
          Bénéfice net (après impôt)
        </div>
        <div class="stat-value">{{ formatFCFA(r.beneficeNet) }}</div>
        <div class="stat-sub">Ce qu'il vous reste réellement</div>
      </div>
      <div class="stat">
        <div class="stat-label">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/></svg>
          Marge nette
        </div>
        <div class="stat-value" :style="{ color: r.margeNette < 10 ? '#b91c1c' : r.margeNette < 20 ? '#b45309' : '#15803d' }">
          {{ r.margeNette.toFixed(1) }}%
        </div>
        <div class="stat-sub">Sur 100 FCFA de ventes</div>
      </div>
    </div>

    <!-- IMF notice -->
    <div v-if="r.imfApplique" class="notice notice-warn">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
      <div>
        <strong>IMF appliqué :</strong> Votre bénéfice étant faible, la DGI applique l'Impôt Minimum Forfaitaire de
        <strong>{{ formatFCFA(r.imf) }} FCFA</strong> (minimum légal = 3 000 000 FCFA).
      </div>
    </div>

    <!-- Alerte régime -->
    <div v-if="r.alerteRegime" class="notice notice-info">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>
      <div>{{ r.alerteRegime }}</div>
    </div>

    <!-- Seuil de rentabilité -->
    <div class="seuil-section">
      <div class="section-title">Seuil de rentabilité</div>
      <div class="seuil-bar-track">
        <div class="seuil-bar-fill" :style="{ width: Math.min(100, (r.seuilRentabilite / Math.max(r.regime.caMax || r.seuilRentabilite * 2, 1)) * 100) + '%' }"></div>
      </div>
      <div class="seuil-labels">
        <span>0 FCFA</span>
        <span>{{ formatFCFA(r.seuilRentabilite) }} FCFA</span>
      </div>
      <p class="seuil-msg" :style="{ color: r.auDessusDuSeuil ? '#15803d' : '#b91c1c' }">
        <span v-html="r.auDessusDuSeuil
          ? `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' viewBox='0 0 24 24' stroke-width='2' stroke='currentColor'><path stroke-linecap='round' stroke-linejoin='round' d='m4.5 12.75 6 6 9-13.5'/></svg>`
          : `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' viewBox='0 0 24 24' stroke-width='2' stroke='currentColor'><path stroke-linecap='round' stroke-linejoin='round' d='M6 18 18 6M6 6l12 12'/></svg>`
        "></span>
        {{ r.auDessusDuSeuil ? 'Votre activité est viable — vous dépassez votre seuil de rentabilité.' : 'Attention : vos charges dépassent encore vos revenus.' }}
      </p>
    </div>

    <!-- Suggestions -->
    <div v-if="suggestions?.length" class="suggestions">
      <div class="section-title">Recommandations</div>
      <div class="suggestions-list">
        <div v-for="s in suggestions" :key="s.titre" class="suggestion">
          <div class="sugg-icon-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/></svg>
          </div>
          <div class="sugg-content">
            <div class="sugg-titre">{{ s.titre }}</div>
            <div class="sugg-desc">{{ s.description }}</div>
            <div class="sugg-action">{{ s.action }}</div>
            <div v-if="s.economie" class="sugg-economie">Économie estimée : {{ formatFCFA(s.economie) }} FCFA / an</div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.res-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }

.res-header { padding: 1.25rem 1.5rem; }
.health-badge { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.75rem; border-radius: 20px; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.625rem; }
.health-badge span { display: flex; }
.res-meta { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.res-name { font-size: 1rem; font-weight: 700; color: #0f172a; }
.regime-tag { font-size: 0.72rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 20px; }
.health-msg { margin: 0.5rem 0 0; font-size: 0.83rem; font-weight: 600; }

/* Stats */
.stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); border-top: 1px solid #f1f5f9; }
.stat { padding: 1.25rem 1.5rem; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; }
.stat:nth-child(2n) { border-right: none; }
.stat-label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.5rem; }
.stat-label svg { flex-shrink: 0; }
.stat-value { font-size: 1.35rem; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.stat-sub { font-size: 0.72rem; color: #94a3b8; margin-top: 0.15rem; }
.stat-success .stat-value { color: #15803d; }
.stat-danger .stat-value { color: #b91c1c; }

/* Notices */
.notice { display: flex; align-items: flex-start; gap: 0.625rem; padding: 0.875rem 1.5rem; font-size: 0.83rem; line-height: 1.5; }
.notice svg { flex-shrink: 0; margin-top: 1px; }
.notice-warn { background: #fffbeb; border-top: 1px solid #fde68a; color: #78350f; }
.notice-info { background: #eff6ff; border-top: 1px solid #bfdbfe; color: #1e40af; }

/* Seuil */
.seuil-section { padding: 1.25rem 1.5rem; border-top: 1px solid #f1f5f9; }
.section-title { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 0.75rem; }
.seuil-bar-track { height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; margin-bottom: 0.35rem; }
.seuil-bar-fill { height: 100%; background: linear-gradient(90deg, #15803d, #16a34a); border-radius: 4px; transition: width 0.7s; }
.seuil-labels { display: flex; justify-content: space-between; font-size: 0.7rem; color: #94a3b8; margin-bottom: 0.5rem; }
.seuil-msg { display: flex; align-items: center; gap: 0.35rem; font-size: 0.83rem; font-weight: 600; margin: 0; }
.seuil-msg span { display: flex; }

/* Suggestions */
.suggestions { padding: 1.25rem 1.5rem; border-top: 1px solid #f1f5f9; }
.suggestions-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.75rem; }
.suggestion { display: flex; gap: 0.75rem; padding: 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; }
.sugg-icon-wrap { width: 32px; height: 32px; background: #eff6ff; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #2563eb; flex-shrink: 0; }
.sugg-titre { font-size: 0.875rem; font-weight: 700; color: #0f172a; margin-bottom: 0.2rem; }
.sugg-desc { font-size: 0.8rem; color: #64748b; margin-bottom: 0.25rem; }
.sugg-action { font-size: 0.8rem; color: #0f766e; font-weight: 600; }
.sugg-economie { font-size: 0.75rem; color: #15803d; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 0.2rem 0.5rem; display: inline-block; margin-top: 0.35rem; }

@media (max-width: 640px) {
  .stats-grid { grid-template-columns: 1fr; }
  .stat { border-right: none; }
}
</style>
