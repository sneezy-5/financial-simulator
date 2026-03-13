<script setup>
import { computed } from 'vue'
import { formatFCFA } from '../../services/taxService.js'

const props = defineProps({ resultats: Object, params: Object })

const isTEE = computed(() => props.resultats?.regime?.id === 'entreprenant_tee')

const ca = computed(() => props.params?.ca || 0)
const taux = computed(() => {
  const id = props.resultats?.regime?.id
  if (id === 'entreprenant_tce') return { normal: 0.02, cga: 0.01 }
  return { normal: 0.04, cga: 0.02 }
})

const impotSansCGA = computed(() => Math.round(ca.value * taux.value.normal))
const impotAvecCGA = computed(() => Math.round(ca.value * taux.value.cga))
const cotisationCGA = 200_000
const economieNette = computed(() => impotSansCGA.value - impotAvecCGA.value - cotisationCGA)
const returnOnCGA = computed(() => cotisationCGA > 0 ? Math.round((economieNette.value / cotisationCGA) * 100) : 0)

// Barre visuelle
const maxVal = computed(() => Math.max(impotSansCGA.value, impotAvecCGA.value + cotisationCGA))
const largeurSansCGA = computed(() => Math.round((impotSansCGA.value / maxVal.value) * 100))
const largeurAvecCGA = computed(() => Math.round(((impotAvecCGA.value + cotisationCGA) / maxVal.value) * 100))
</script>

<template>
  <div class="cga-card">
    <div class="cga-header">
      <div class="cga-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
        </svg>
      </div>
      <div>
        <div class="cga-title">Centre de Gestion Agréé (CGA)</div>
        <div class="cga-sub">Adhérer peut réduire votre impôt de 50%</div>
      </div>
    </div>

    <!-- Pas applicable si pas TEE/TCE -->
    <div v-if="!isTEE" class="not-applicable">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="color:#9ca3af">
        <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/>
      </svg>
      <p>Le CGA ne s'applique qu'au régime Entreprenant TEE. Votre régime actuel ({{ resultats.regime.label }}) n'est pas concerné.</p>
    </div>

    <template v-else>
      <!-- Comparaison visuelle -->
      <div class="comparaison">
        <div class="cmp-col">
          <div class="cmp-label-top">Sans CGA</div>
          <div class="cmp-barre-wrap">
            <div class="cmp-barre sans" :style="{ width: largeurSansCGA + '%' }"></div>
          </div>
          <div class="cmp-montant sans-val">{{ formatFCFA(impotSansCGA) }} FCFA</div>
          <div class="cmp-detail">Taux : {{ (taux.normal * 100).toFixed(0) }}% du CA</div>
        </div>
        <div class="vs-sep">VS</div>
        <div class="cmp-col">
          <div class="cmp-label-top avec">Avec CGA</div>
          <div class="cmp-barre-wrap">
            <div class="cmp-barre avec" :style="{ width: largeurAvecCGA + '%' }"></div>
          </div>
          <div class="cmp-montant avec-val">{{ formatFCFA(impotAvecCGA + cotisationCGA) }} FCFA</div>
          <div class="cmp-detail">Impôt : {{ formatFCFA(impotAvecCGA) }} + Cotisation CGA : {{ formatFCFA(cotisationCGA) }}</div>
        </div>
      </div>

      <!-- Résultat économie -->
      <div class="economie-bloc" :class="economieNette > 0 ? 'positive' : 'neutre'">
        <div v-if="economieNette > 0" class="eco-content">
          <div class="eco-titre">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"/></svg>
            Économie nette annuelle
          </div>
          <div class="eco-montant">{{ formatFCFA(economieNette) }} FCFA / an</div>
          <div class="eco-detail">Retour sur investissement : <strong>{{ returnOnCGA }}%</strong> — pour 200 000 FCFA de cotisation</div>
        </div>
        <div v-else class="eco-nulle">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>
          Avec votre niveau de CA actuel, l'adhésion au CGA n'est pas rentable (cotisation > économie d'impôt).
        </div>
      </div>

      <!-- Ce qu'est un CGA -->
      <div class="cga-explication">
        <div class="expl-titre">Qu'est-ce qu'un CGA ?</div>
        <div class="expl-texte">
          Un Centre de Gestion Agréé est une association qui aide les petits entrepreneurs à tenir leur comptabilité et à déclarer correctement leurs revenus. En échange, la DGI accorde une réduction d'impôt de 50%.
        </div>
        <div class="expl-liste">
          <div class="expl-item ok">Aide à remplir vos déclarations fiscales</div>
          <div class="expl-item ok">Formation et conseils comptables inclus</div>
          <div class="expl-item ok">Réduction d'impôt de 50% accordée par la DGI</div>
          <div class="expl-item info">Cotisation annuelle : environ 150 000 à 250 000 FCFA</div>
        </div>
        <div class="cga-contacts">
          <div class="contact-titre">CGA agréés en Côte d'Ivoire</div>
          <div class="contact-liste">
            <div class="contact-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z"/></svg>
              CGAE-CI — Tél : 27 21 24 09 60 (Abidjan)
            </div>
            <div class="contact-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253M12 10.5a14.235 14.235 0 0 1-7.843 2.082M12 10.5c0 3.866 0 6-4.5 9"/></svg>
              DGI Côte d'Ivoire — dgi.gouv.ci
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.cga-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }

.cga-header { display: flex; align-items: flex-start; gap: 0.75rem; padding: 1.25rem 1.5rem; background: #f8fafc; border-bottom: 1px solid #f1f5f9; }
.cga-icon { width: 34px; height: 34px; background: #f0fdf4; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #15803d; flex-shrink: 0; }
.cga-title { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.cga-sub { font-size: 0.75rem; color: #6b7280; margin-top: 1px; }

.not-applicable { display: flex; align-items: flex-start; gap: 0.625rem; padding: 1.25rem 1.5rem; font-size: 0.82rem; color: #6b7280; }

/* Comparaison */
.comparaison { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem; border-bottom: 1px solid #f1f5f9; }
.cmp-col { flex: 1; display: flex; flex-direction: column; gap: 0.35rem; }
.cmp-label-top { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
.cmp-label-top.avec { color: #15803d; }
.cmp-barre-wrap { height: 12px; background: #f1f5f9; border-radius: 6px; overflow: hidden; }
.cmp-barre { height: 100%; border-radius: 6px; transition: width 0.7s ease; }
.cmp-barre.sans { background: #dc2626; }
.cmp-barre.avec { background: #15803d; }
.cmp-montant { font-size: 1.1rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.sans-val { color: #b91c1c; }
.avec-val { color: #15803d; }
.cmp-detail { font-size: 0.72rem; color: #9ca3af; }
.vs-sep { font-size: 0.8rem; font-weight: 800; color: #9ca3af; flex-shrink: 0; }

/* Économie */
.economie-bloc { margin: 0 1.5rem 1rem; border-radius: 10px; padding: 1rem; }
.economie-bloc.positive { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #bbf7d0; }
.economie-bloc.neutre { background: #fefce8; border: 1px solid #fde68a; }
.eco-content { display: flex; flex-direction: column; gap: 0.3rem; }
.eco-titre { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #15803d; }
.eco-montant { font-size: 1.5rem; font-weight: 800; color: #15803d; }
.eco-detail { font-size: 0.78rem; color: #4b7c55; }
.eco-nulle { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.82rem; color: #78350f; }

/* Explication */
.cga-explication { padding: 1rem 1.5rem; border-top: 1px solid #f1f5f9; }
.expl-titre { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 0.5rem; }
.expl-texte { font-size: 0.82rem; color: #374151; line-height: 1.6; margin-bottom: 0.625rem; }
.expl-liste { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.875rem; }
.expl-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: #374151; }
.expl-item::before { content: ''; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.expl-item.ok::before { background: #15803d; }
.expl-item.info::before { background: #1d4ed8; }

.cga-contacts { background: #f8fafc; border-radius: 8px; padding: 0.75rem; }
.contact-titre { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 0.4rem; }
.contact-liste { display: flex; flex-direction: column; gap: 0.3rem; }
.contact-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: #475569; }

@media (max-width: 640px) {
  .comparaison { flex-direction: column; }
  .vs-sep { align-self: center; }
}
</style>
