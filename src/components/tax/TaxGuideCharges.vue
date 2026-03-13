<script setup>
import { computed } from 'vue'

const props = defineProps({ secteur: String })

const guides = {
  commerce: {
    label: 'Commerce / Boutique',
    deductibles: [
      { item: 'Achats de marchandises', desc: 'Le prix payé à vos fournisseurs pour votre stock' },
      { item: 'Loyer du magasin', desc: 'Y compris le pas de porte (amorti)' },
      { item: 'Électricité / Eau pro', desc: 'Factures CIE/SODECI du magasin uniquement' },
      { item: 'Salaires des vendeurs', desc: 'Y compris les charges sociales CNPS' },
      { item: 'Emballages / Sacs', desc: 'Tout ce qui sert à emballer vos produits' },
    ],
    nonDeductibles: [
      { item: 'Loyer personnel', desc: 'Votre maison n\'est pas déductible de l\'impôt pro' },
      { item: 'Dépenses familiales', desc: 'Nourriture, frais de scolarité, etc.' },
      { item: 'Amendes routières', desc: 'Les amendes ne sont jamais déductibles' },
    ]
  },
  restauration: {
    label: 'Restauration / Maquis',
    deductibles: [
      { item: 'Achats nourriture / boissons', desc: 'Produits frais, épicerie, boissons pour la vente' },
      { item: 'Gaz de cuisson', desc: 'Recharges de bouteilles de gaz pour la cuisine' },
      { item: 'Loyer de l\'espace', desc: 'Maquis, restaurant ou terrasse commerciale' },
      { item: 'Personnel de salle / cuisine', desc: 'Salaires et gratifications déclarées' },
      { item: 'Décoration / Vaisselle', desc: 'Renouvellement des assiettes, verres et nappes' },
    ],
    nonDeductibles: [
      { item: 'Consommation personnelle', desc: 'Ce que vous mangez vous-même au restaurant' },
      { item: 'Cadeaux somptueux', desc: 'Sauf si c\'est pour la promotion directe du restaurant' },
    ]
  },
  artisanat: {
    label: 'Boulangerie / Artisanat',
    deductibles: [
      { item: 'Matières premières', desc: 'Farine, levure, sel, beurre, sucre' },
      { item: 'Électricité du four', desc: 'Souvent le plus gros poste de dépense' },
      { item: 'Maintenance matériel', desc: 'Réparation du four, pétrisseuse, climatisation' },
      { item: 'Emballages pain/pâtisserie', desc: 'Sacs en papier et boîtes' },
      { item: 'Livraison', desc: 'Carburant et entretien du véhicule de livraison' },
    ],
    nonDeductibles: [
      { item: 'Vêtements de ville', desc: 'Seulement les tenues de travail (tabliers, etc.) sont déductibles' },
      { item: 'Dépenses de santé privées', desc: 'Sauf mutuelle d\'entreprise pour le personnel' },
    ]
  },
  services: {
    label: 'Services / Informatique',
    deductibles: [
      { item: 'Abonnement Internet', desc: 'Ligne dédiée pro ou part pro de la connexion' },
      { item: 'Licences logiciels', desc: 'Logiciels de gestion, création, abonnements SaaS' },
      { item: 'Petit matériel', desc: 'Claviers, souris, câbles, toners' },
      { item: 'Formation pro', desc: 'Cours pour améliorer vos compétences techniques' },
      { item: 'Frais bancaires pro', desc: 'Tenue de compte, commissions de virement' },
    ],
    nonDeductibles: [
      { item: 'Équipements de luxe', desc: 'Sauf si strictement nécessaire à l\'activité' },
    ]
  }
}

const guideActuel = computed(() => guides[props.secteur] || guides.commerce)
</script>

<template>
  <div class="guide-card">
    <div class="guide-header">
      <div class="guide-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18c-2.305 0-4.408.867-6 2.292m0-14.25v14.25"/>
        </svg>
      </div>
      <div>
        <div class="guide-title">Guide des charges déductibles</div>
        <div class="guide-sub">Pour votre activité : {{ guideActuel.label }}</div>
      </div>
    </div>

    <div class="guide-body">
      <!-- Déductibles -->
      <div class="guide-section">
        <div class="gs-title ok">Ce que vous pouvez déduire</div>
        <div class="gs-list">
          <div v-for="item in guideActuel.deductibles" :key="item.item" class="gs-item ok">
            <div class="gsi-name">{{ item.item }}</div>
            <div class="gsi-desc">{{ item.desc }}</div>
          </div>
        </div>
      </div>

      <!-- Non déductibles -->
      <div class="guide-section">
        <div class="gs-title no">Ce que vous ne pouvez PAS déduire</div>
        <div class="gs-list">
          <div v-for="item in guideActuel.nonDeductibles" :key="item.item" class="gs-item no">
            <div class="gsi-name">{{ item.item }}</div>
            <div class="gsi-desc">{{ item.desc }}</div>
          </div>
        </div>
      </div>

      <div class="guide-tip">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/></svg>
        <span><strong>Conseil :</strong> Pour déduire une charge, vous devez impérativement avoir une facture normale à votre nom.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.guide-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }

.guide-header { display: flex; align-items: flex-start; gap: 0.75rem; padding: 1.25rem 1.5rem; background: #f8fafc; border-bottom: 1px solid #f1f5f9; }
.guide-icon { width: 34px; height: 34px; background: #fdf4ff; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #9333ea; flex-shrink: 0; }
.guide-title { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.guide-sub { font-size: 0.75rem; color: #6b7280; margin-top: 1px; }

.guide-body { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }

.guide-section { display: flex; flex-direction: column; gap: 0.625rem; }
.gs-title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
.gs-title.ok { color: #15803d; }
.gs-title.no { color: #b91c1c; }

.gs-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.625rem; }
.gs-item { padding: 0.75rem; border-radius: 8px; border: 1px solid; display: flex; flex-direction: column; gap: 0.2rem; }
.gs-item.ok { background: #f0fdf4; border-color: #bbf7d0; }
.gs-item.no { background: #fef2f2; border-color: #fecaca; }

.gsi-name { font-size: 0.8rem; font-weight: 700; color: #111827; }
.gsi-desc { font-size: 0.72rem; color: #4b5563; line-height: 1.35; }

.guide-tip { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.75rem; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 0.8rem; color: #1e40af; line-height: 1.4; }
.guide-tip svg { flex-shrink: 0; margin-top: 2px; }

@media (max-width: 640px) {
  .gs-list { grid-template-columns: 1fr; }
  .guide-header, .guide-body { padding-left: 1rem; padding-right: 1rem; }
}
</style>
