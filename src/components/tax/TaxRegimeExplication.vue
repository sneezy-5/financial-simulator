<script setup>
const props = defineProps({ resultats: Object })

const explications = {
  entreprenant_tce: {
    couleur: '#0369a1', bg: '#eff6ff', border: '#bfdbfe',
    titre: 'Très petite activité — Simplicité maximale',
    positif: [
      'Vous ne collectez PAS la TVA sur vos ventes',
      'Vous payez seulement 2% de votre CA total par an',
      'Pas de comptable obligatoire — gardez juste vos reçus',
      'Une seule déclaration par an à la DGI (en janvier)',
    ],
    attention: [
      'Si votre CA dépasse 5 000 000 FCFA → régime TEE (4%)',
      'Conservez vos reçus de vente et d\'achat dans un classeur',
    ],
    action: 'Tenez un cahier de caisse : notez chaque vente et chaque dépense. C\'est tout ce qu\'on vous demande.',
    actionLabel: 'Votre seule obligation',
  },
  entreprenant_tee: {
    couleur: '#0284c7', bg: '#eff6ff', border: '#bfdbfe',
    titre: 'Petite entreprise — Régime libératoire',
    positif: [
      'Vous ne collectez PAS la TVA sur vos ventes',
      'Vous payez 4% du CA — ou seulement 2% avec un CGA',
      'Pas de bilan comptable complet obligatoire',
      'Patente annuelle à renouveler chaque mars',
    ],
    attention: [
      'Si votre CA dépasse 50 000 000 FCFA → régime RME (6%)',
      'En adhérant à un CGA, vous économisez 50% de votre impôt',
      'Gardez toutes vos factures d\'achat et de vente',
    ],
    action: 'Ouvrez un compte bancaire professionnel séparé de vos finances personnelles. Notez chaque entrée et sortie.',
    actionLabel: 'Bonne pratique recommandée',
  },
  rme: {
    couleur: '#0f766e', bg: '#f0fdfa', border: '#99f6e4',
    titre: 'Microentreprise — Régime réel simplifié',
    positif: [
      'Régime encore simplifié — pas de TVA à collecter',
      'Impôt fixé à 6% du CA annuel, payable en 3 fois',
      'Comptabilité simplifiée acceptée',
    ],
    attention: [
      'Un suivi mensuel de caisse est fortement recommandé',
      'CA > 200 millions FCFA → régime RSI (comptabilité complète obligatoire)',
      'Conservez toutes vos factures pendant 5 ans minimum',
    ],
    action: 'Provisionnez 6% de chaque encaissement dès réception. Mettez-le dans un compte séparé ou une enveloppe dédiée.',
    actionLabel: 'Provisionnement recommandé',
  },
  rsi: {
    couleur: '#7c3aed', bg: '#faf5ff', border: '#e9d5ff',
    titre: 'Régime réel simplifié — Comptabilité complète',
    positif: [
      'Impôt calculé sur le bénéfice réel — plus juste si charges élevées',
      'TVA récupérable sur vos achats professionnels',
      'Possibilité de déduire plus de charges',
    ],
    attention: [
      'Un bilan comptable annuel est OBLIGATOIRE par la loi',
      'Faites appel à un expert-comptable agréé DGI',
      'IMF minimum de 3 000 000 FCFA même si bénéfice nul',
      'Impôt payé en 4 acomptes trimestriels',
    ],
    action: 'Engagez dès maintenant un expert-comptable agréé DGI. Le coût est compensé par les économies fiscales et l\'évitement des pénalités.',
    actionLabel: 'Action obligatoire',
  },
}

const expl = explications[props.resultats?.regime?.id] || explications.entreprenant_tee
</script>

<template>
  <div class="regexpl-card" :style="{ borderTopColor: expl.couleur }">
    <div class="re-header" :style="{ background: expl.bg, borderBottom: '1px solid ' + expl.border }">
      <div class="re-regime-tag" :style="{ color: expl.couleur, background: 'white', border: '1px solid ' + expl.border }">
        {{ resultats.regime.label }}
      </div>
      <h3 class="re-titre">{{ expl.titre }}</h3>
    </div>

    <div class="re-body">
      <!-- Ce que ça veut dire -->
      <div class="section">
        <div class="section-label ok">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
          Ce que ça veut dire pour vous
        </div>
        <div class="items-list">
          <div v-for="p in expl.positif" :key="p" class="list-item ok">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" :style="{ color: expl.couleur }"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
            <span>{{ p }}</span>
          </div>
        </div>
      </div>

      <!-- Points d'attention -->
      <div class="section">
        <div class="section-label warn">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
          Points d'attention
        </div>
        <div class="items-list">
          <div v-for="a in expl.attention" :key="a" class="list-item warn">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="color:#b45309"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
            <span>{{ a }}</span>
          </div>
        </div>
      </div>

      <!-- Action recommandée -->
      <div class="action-bloc" :style="{ background: expl.bg, border: '1px solid ' + expl.border }">
        <div class="action-label" :style="{ color: expl.couleur }">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/></svg>
          {{ expl.actionLabel }}
        </div>
        <p class="action-texte">{{ expl.action }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.regexpl-card { background: white; border: 1px solid #e2e8f0; border-top: 3px solid; border-radius: 14px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }

.re-header { padding: 1.25rem 1.5rem; }
.re-regime-tag { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
.re-titre { font-size: 0.95rem; font-weight: 700; color: #0f172a; margin: 0; }

.re-body { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }

.section { display: flex; flex-direction: column; gap: 0.5rem; }
.section-label { display: flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.section-label.ok { color: #15803d; }
.section-label.warn { color: #b45309; }

.items-list { display: flex; flex-direction: column; gap: 0.375rem; }
.list-item { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.84rem; color: #374151; line-height: 1.4; }
.list-item svg { flex-shrink: 0; margin-top: 2px; }

.action-bloc { padding: 0.875rem 1rem; border-radius: 10px; }
.action-label { display: flex; align-items: center; gap: 0.375rem; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.3rem; }
.action-texte { font-size: 0.84rem; color: #374151; line-height: 1.55; margin: 0; }

@media (max-width: 640px) {
  .re-header, .re-body { padding: 1rem; }
}
</style>
