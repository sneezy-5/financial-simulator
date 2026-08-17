<script setup>
import { computed } from 'vue'

const props = defineProps({
  resultats: Object,
  params: Object,
  nom: { type: String, default: '' }
})

const NOM_SIMPLE_REGIME = {
  entreprenant_tce: { nom: 'Très Petite Activité', emoji: '', couleur: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
  entreprenant_tee: { nom: 'Petite Entreprise', emoji: '', couleur: '#0284c7', bg: '#eff6ff', border: '#bae6fd' },
  rme:              { nom: 'Microentreprise', emoji: '', couleur: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  rsi:              { nom: 'PME Comptabilité Complète', emoji: '', couleur: '#7c3aed', bg: '#faf5ff', border: '#d8b4fe' },
  rni:              { nom: 'Grande Entreprise', emoji: '', couleur: '#dc2626', bg: '#fff1f2', border: '#fecdd3' },
}

function fmt(val) {
  if (!val && val !== 0) return '—'
  return Math.round(val).toLocaleString('fr-FR') + ' FCFA'
}

const regimeInfo = computed(() => {
  const id = props.resultats?.regime?.id
  return NOM_SIMPLE_REGIME[id] || NOM_SIMPLE_REGIME.entreprenant_tee
})

const tauxPct = computed(() => {
  const r = props.resultats
  if (!r || !r.regime || !props.params?.ca) return null
  const pct = (r.impot / props.params.ca * 100).toFixed(1)
  return pct
})

const mensuel = computed(() => {
  if (!props.resultats?.paiementMensuel) return null
  return props.resultats.paiementMensuel
})

const santeColor = computed(() => {
  const s = props.resultats?.sante
  if (s === 'rouge') return { color: '#dc2626', bg: '#fff1f2', icon: '' }
  if (s === 'orange') return { color: '#d97706', bg: '#fffbeb', icon: '' }
  return { color: '#059669', bg: '#ecfdf5', icon: '' }
})
</script>

<template>
  <div class="resume-card" :style="{ borderTopColor: regimeInfo.couleur }">
    
    <!-- En-tête -->
    <div class="rc-header" :style="{ background: regimeInfo.bg, borderBottom: '1px solid ' + regimeInfo.border }">
      <div class="rc-badge" :style="{ color: regimeInfo.couleur, border: '1px solid ' + regimeInfo.border, background: 'white' }">
        {{ regimeInfo.nom }}
      </div>
      <div class="rc-title">Votre Situation Fiscale en un Coup d'Œil</div>
      <div class="rc-sub" v-if="nom">{{ nom }}</div>
    </div>

    <!-- Grille des chiffres clés -->
    <div class="rc-grid">

      <!-- Revenus -->
      <div class="rc-stat">
        <div class="rc-stat-content">
          <div class="rc-stat-label">Vous gagnez</div>
          <div class="rc-stat-value primary">{{ fmt(params?.ca) }}</div>
          <div class="rc-stat-sub">par an (chiffre d'affaires)</div>
        </div>
      </div>

      <!-- Dépenses -->
      <div class="rc-stat">
        <div class="rc-stat-content">
          <div class="rc-stat-label">Vous dépensez</div>
          <div class="rc-stat-value neutral">{{ fmt(resultats?.totalCharges) }}</div>
          <div class="rc-stat-sub">charges fixes + achats / an</div>
        </div>
      </div>

      <!-- Bénéfice -->
      <div class="rc-stat">
        <div class="rc-stat-content">
          <div class="rc-stat-label">Votre bénéfice brut</div>
          <div class="rc-stat-value" :class="resultats?.benefice >= 0 ? 'good' : 'bad'">
            {{ fmt(resultats?.benefice) }}
          </div>
          <div class="rc-stat-sub">avant impôts</div>
        </div>
      </div>

      <!-- Impôt -->
      <div class="rc-stat impot-stat" :style="{ background: regimeInfo.bg, border: '1px solid ' + regimeInfo.border }">
        <div class="rc-stat-content">
          <div class="rc-stat-label">Impôt à payer à l'État</div>
          <div class="rc-stat-value" :style="{ color: regimeInfo.couleur }">{{ fmt(resultats?.impot) }}</div>
          <div class="rc-stat-sub">par an ({{ tauxPct }}% de vos ventes)</div>
        </div>
      </div>

    </div>

    <!-- Mensualisation -->
    <div v-if="mensuel" class="rc-mensuel">
      <div class="rc-mensuel-label">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
        Mettez de côté chaque mois
      </div>
      <div class="rc-mensuel-amount">{{ fmt(mensuel) }}</div>
      <div class="rc-mensuel-hint">pour ne pas être surpris lors du paiement à la DGI</div>
    </div>

    <!-- Santé financière -->
    <div class="rc-sante" :style="{ background: santeColor.bg }">
      <span class="rc-sante-icon">{{ santeColor.icon }}</span>
      <span class="rc-sante-msg" :style="{ color: santeColor.color }">{{ resultats?.santeMessage }}</span>
    </div>

    <!-- Ce qui signifie votre régime -->
    <div class="rc-regime-explain" :style="{ borderLeft: '3px solid ' + regimeInfo.couleur }">
      <div class="rce-title" :style="{ color: regimeInfo.couleur }">Votre catégorie fiscale : {{ regimeInfo.nom }}</div>
      <div class="rce-desc">
        <template v-if="resultats?.regime?.id === 'entreprenant_tce'">
          Votre activité est dans la plus petite catégorie fiscale. L'État vous demande de payer <strong>{{ tauxPct }}% de vos ventes</strong>, c'est tout. Pas de TVA, pas de comptable.
        </template>
        <template v-else-if="resultats?.regime?.id === 'entreprenant_tee'">
          Vous êtes dans la catégorie "Petite Entreprise". L'État vous demande <strong>{{ tauxPct }}% de vos ventes</strong> par an. Adhérer à un CGA (bureau officiel) vous permettrait de payer 2% au lieu de 4%.
        </template>
        <template v-else-if="resultats?.regime?.id === 'rme'">
          Vous êtes une microentreprise. L'État vous demande <strong>6% de vos ventes</strong> par an, payables en 3 fois. Pas besoin de bilan comptable complet.
        </template>
        <template v-else-if="resultats?.regime?.id === 'rsi'">
          Votre entreprise est assez grande pour être dans la catégorie "Comptabilité Complète". L'impôt se calcule sur votre <strong>bénéfice réel</strong>. Un expert-comptable est obligatoire.
        </template>
        <template v-else>
          Votre entreprise est dans la catégorie des grandes entreprises. Consultez impérativement un expert-comptable agréé DGI.
        </template>
      </div>
    </div>

  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.resume-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-top: 3px solid;
  border-radius: 16px;
  overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;
}

.rc-header {
  padding: 1.25rem 1.5rem;
}
.rc-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.7rem;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}
.rc-title {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 0.15rem;
}
.rc-sub {
  font-size: 0.8rem;
  color: #64748b;
}

.rc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: #f1f5f9;
}
.rc-stat {
  background: white;
  padding: 1.1rem 1.25rem;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}
.rc-stat.impot-stat {
  grid-column: 1 / -1;
  background: white;
}
.rc-stat-icon { font-size: 1.4rem; flex-shrink: 0; margin-top: 2px; }
.rc-stat-content { display: flex; flex-direction: column; gap: 0.15rem; }
.rc-stat-label { font-size: 0.75rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
.rc-stat-value { font-size: 1.15rem; font-weight: 800; }
.rc-stat-value.primary { color: #0f172a; }
.rc-stat-value.neutral { color: #475569; }
.rc-stat-value.good { color: #059669; }
.rc-stat-value.bad { color: #dc2626; }
.rc-stat-sub { font-size: 0.73rem; color: #9ca3af; }

.rc-mensuel {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 1.5rem;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  border-bottom: 1px solid #f1f5f9;
}
.rc-mensuel-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #374151;
  flex-shrink: 0;
}
.rc-mensuel-amount {
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
  flex-shrink: 0;
}
.rc-mensuel-hint {
  font-size: 0.72rem;
  color: #9ca3af;
  line-height: 1.3;
}

.rc-sante {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1.5rem;
}
.rc-sante-icon { font-size: 1rem; }
.rc-sante-msg { font-size: 0.84rem; font-weight: 600; }

.rc-regime-explain {
  padding: 1rem 1.5rem;
  margin: 0 1.25rem 1.25rem;
  border-radius: 8px;
  background: #f8fafc;
}
.rce-title {
  font-size: 0.8rem;
  font-weight: 700;
  margin-bottom: 0.35rem;
}
.rce-desc {
  font-size: 0.85rem;
  color: #374151;
  line-height: 1.6;
}

@media (max-width: 640px) {
  .rc-grid { grid-template-columns: 1fr; }
  .rc-stat.impot-stat { grid-column: 1; }
  .rc-mensuel { flex-wrap: wrap; gap: 0.4rem; }
  .rc-stat { padding: 0.875rem 1rem; }
  .rc-header { padding: 1rem; }
  .rc-sante, .rc-regime-explain { padding: 0.875rem 1rem; }
  .rc-regime-explain { margin: 0 0.875rem 0.875rem; }
}
</style>
