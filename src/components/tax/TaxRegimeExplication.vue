<script setup>
const props = defineProps({ resultats: Object })

const explications = {
  entreprenant_tce: {
    couleur: '#0369a1', bg: '#eff6ff', border: '#bfdbfe',
    nomSimple: 'Très Petite Activité',
    titre: 'Vous êtes dans la catégorie la plus simple — bienvenue !',
    positif: [
      'Vous ne récoltez PAS la TVA sur vos ventes (c\'est plus simple pour vous)',
      'Vous payez seulement 2% de ce que vous encaissez — rien d\'autre',
      'Pas de comptable obligatoire — gardez juste vos reçus dans un classeur',
      'Une seule déclaration par an à la DGI, en janvier seulement',
    ],
    attention: [
      'Si vous commencez à vendre plus de 5 000 000 FCFA / an → votre taux passe à 4%',
      'Gardez vos tickets de caisse, bons de commande et reçus de vente',
    ],
    action: 'Tenez un simple cahier de caisse : notez chaque vente et chaque dépense. C\'est tout ce que l\'État vous demande !',
    actionLabel: '✅ Votre seule obligation',
  },
  entreprenant_tee: {
    couleur: '#0284c7', bg: '#eff6ff', border: '#bfdbfe',
    nomSimple: 'Petite Entreprise',
    titre: 'Votre entreprise est bien lancée — voici vos obligations',
    positif: [
      'Vous ne récoltez PAS la TVA sur vos ventes (pas de formalité complexe)',
      'Vous payez 4% de vos ventes — ou seulement 2% si vous avez un CGA',
      'Pas de bilan comptable complet obligatoire — un simple livre de compte suffit',
      'Renouvelez votre patente chaque mars à la DGI de votre commune',
    ],
    attention: [
      'Si vous dépassez 50 000 000 FCFA / an → taux passe à 6% (catégorie RME)',
      'Adhérer à un CGA vous permet de payer 2% au lieu de 4% — économie importante !',
      'Gardez TOUTES vos factures d\'achat et de vente',
    ],
    action: 'Ouvrez un compte bancaire professionnel séparé de votre argent personnel. Inscrivez chaque entrée et chaque sortie d\'argent.',
    actionLabel: '💡 Bonne pratique recommandée',
  },
  rme: {
    couleur: '#0f766e', bg: '#f0fdfa', border: '#99f6e4',
    nomSimple: 'Microentreprise',
    titre: 'Votre activité est bien établie — restez organisé',
    positif: [
      'Pas de TVA à collecter — vos clients ne paient pas de TVA sur vos factures',
      'Vous payez 6% de vos ventes annuelles, en 3 fois dans l\'année',
      'Une comptabilité simplifiée est acceptée (pas besoin de bilan complet)',
    ],
    attention: [
      'Un suivi mensuel de votre trésorerie est fortement conseillé',
      'Si vous dépassez 200 000 000 FCFA / an → vous devrez faire une comptabilité complète',
      'Conservez toutes vos factures pendant au moins 5 ans',
    ],
    action: 'Mettez de côté 6% de chaque paiement reçu dès que vous l\'encaissez — dans un compte ou une enveloppe dédiée. Vous éviterez les mauvaises surprises à la DGI.',
    actionLabel: '💡 Conseil de trésorerie',
  },
  rsi: {
    couleur: '#7c3aed', bg: '#faf5ff', border: '#e9d5ff',
    nomSimple: 'PME avec Comptabilité Complète',
    titre: 'Votre entreprise est une vraie PME — prenez un expert-comptable',
    positif: [
      'L\'impôt est calculé sur votre bénéfice réel — si vos charges sont élevées, votre impôt baisse',
      'Vous pouvez récupérer la TVA payée sur vos achats professionnels',
      'Plus de charges à déduire = moins d\'impôt à payer',
    ],
    attention: [
      'Un bilan comptable annuel est OBLIGATOIRE par la loi (pas de choix)',
      'Faites appel à un expert-comptable agréé par la DGI',
      'Vous payez un minimum de 3 000 000 FCFA d\'impôt même si votre bénéfice est nul',
      'L\'impôt se règle en 4 fois dans l\'année (acomptes trimestriels)',
    ],
    action: 'Engagez un expert-comptable agréé DGI dès maintenant. Son coût sera largement compensé par les économies fiscales réalisées et l\'évitement des pénalités.',
    actionLabel: '🚨 Action obligatoire — Ne pas attendre',
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
      <h3 class="re-nom-simple" :style="{ color: expl.couleur }">{{ expl.nomSimple || resultats.regime.label }}</h3>
      <h4 class="re-titre">{{ expl.titre }}</h4>
    </div>

    <div class="re-body">
      <!-- Ce que ça veut dire -->
      <div class="section">
        <div class="section-label ok">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
          Ce que ça signifie pour vous
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
          Ce qu'il faut surveiller
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
.re-nom-simple { font-size: 1.15rem; font-weight: 800; margin: 0 0 0.3rem; }
.re-titre { font-size: 0.88rem; font-weight: 500; color: #374151; margin: 0; }

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
