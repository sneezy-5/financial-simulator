<script setup>
import { ref, computed } from 'vue'
import { CR_STRUCTURE, calculerSoldesIntermediaires } from '../../services/financialAnalysisService.js'

const props = defineProps({
  crN: { type: Object, required: true },
  crN1: { type: Object, required: true },
})

const DESCRIPTIONS = {
  productionStockee: "Variation entre les stocks de produits finis/en-cours en fin et en début d'exercice (peut être négative).",
  productionImmobilisee: "Travaux réalisés par l'entreprise pour elle-même et inscrits à l'actif (ex. construction d'un bâtiment en interne).",
  produitsAccessoires: "Produits liés à l'activité mais non directement issus des ventes (locations, commissions...).",
  variationStocksMarchandises: "Différence entre le stock de marchandises en fin et en début d'exercice.",
  variationStocksMP: "Différence entre le stock de matières premières en fin et en début d'exercice.",
  reprisesAmortissementsExploitation: "Annulation d'une dotation aux amortissements/provisions constatée les années précédentes.",
  reprisesProvisionsFinancieres: "Annulation d'une provision financière constatée les années précédentes.",
  produitsHAO: "Produits exceptionnels, hors activité normale (ex. plus-value de cession d'un immeuble).",
  chargesHAO: "Charges exceptionnelles, hors activité normale (ex. valeur comptable d'un bien cédé).",
  participationTravailleurs: "Part du bénéfice reversée aux salariés selon les accords en vigueur.",
}

const activeTooltip = ref(null)
const toggleTooltip = (key) => { activeTooltip.value = activeTooltip.value === key ? null : key }

const sigN = computed(() => calculerSoldesIntermediaires(props.crN))
const sigN1 = computed(() => calculerSoldesIntermediaires(props.crN1))

const formatMontant = (v) => new Intl.NumberFormat('fr-FR').format(Math.round(v || 0))

const LIGNES_SIG = [
  { key: 'valeurAjoutee', label: 'Valeur ajoutée' },
  { key: 'ebe', label: "Excédent brut d'exploitation (EBE)" },
  { key: 'resultatExploitation', label: "Résultat d'exploitation" },
  { key: 'resultatFinancier', label: 'Résultat financier' },
  { key: 'rao', label: 'Résultat des activités ordinaires (RAO)' },
  { key: 'resultatHAO', label: 'Résultat HAO' },
  { key: 'resultatNet', label: 'Résultat net' },
  { key: 'cafg', label: "Capacité d'autofinancement globale (CAFG)" },
]
</script>

<template>
  <div class="cr-form">
    <div class="cr-bloc">
      <div class="postes-header">
        <span></span><span>N-1</span><span>N</span>
      </div>
      <div v-for="section in CR_STRUCTURE" :key="section.section" class="section-bloc">
        <h4 class="section-titre">{{ section.section }}</h4>
        <div v-for="poste in section.postes" :key="poste.key" class="poste-row">
          <div class="poste-label">
            <span class="signe" :class="poste.signe > 0 ? 'plus' : 'moins'">{{ poste.signe > 0 ? '+' : '−' }}</span>
            {{ poste.label }}
            <button v-if="DESCRIPTIONS[poste.key]" type="button" class="info-btn" @click="toggleTooltip(poste.key)" title="Explication">?</button>
            <div v-if="activeTooltip === poste.key" class="tooltip-box">{{ DESCRIPTIONS[poste.key] }}</div>
          </div>
          <input type="number" step="1" v-model.number="crN1[poste.key]" placeholder="0" />
          <input type="number" step="1" v-model.number="crN[poste.key]" placeholder="0" />
        </div>
      </div>
    </div>

    <div class="cr-bloc sig-bloc">
      <h3 class="cote-titre">Soldes intermédiaires de gestion</h3>
      <div class="postes-header">
        <span></span><span>N-1</span><span>N</span>
      </div>
      <div v-for="ligne in LIGNES_SIG" :key="ligne.key" class="sig-row">
        <span>{{ ligne.label }}</span>
        <span :class="{ negatif: sigN1[ligne.key] < 0 }">{{ formatMontant(sigN1[ligne.key]) }}</span>
        <span :class="{ negatif: sigN[ligne.key] < 0 }">{{ formatMontant(sigN[ligne.key]) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cr-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.cr-bloc {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
}

.cote-titre {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--text-dark);
}

.postes-header {
  display: grid;
  grid-template-columns: 1fr 130px 130px;
  gap: 0.75rem;
  padding: 0 0 0.4rem 0;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
@media (max-width: 560px) {
  .postes-header, .poste-row, .sig-row { grid-template-columns: 1fr 90px 90px !important; }
}

.section-bloc { margin-bottom: 1rem; }
.section-titre {
  margin: 0.75rem 0 0.5rem 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary-dark);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.poste-row {
  display: grid;
  grid-template-columns: 1fr 130px 130px;
  gap: 0.75rem;
  align-items: center;
  padding: 0.35rem 0;
  border-bottom: 1px dashed var(--border);
  position: relative;
}
.poste-label {
  font-size: 0.85rem;
  color: var(--text-body);
  display: flex;
  align-items: center;
  gap: 0.4rem;
  position: relative;
}
.signe {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 800;
  flex-shrink: 0;
}
.signe.plus { background: #d1fae5; color: #059669; }
.signe.moins { background: #fee2e2; color: #dc2626; }

.poste-row input {
  padding: 0.4rem 0.5rem;
  font-size: 0.85rem;
  text-align: right;
}

.info-btn {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-muted);
  font-size: 0.65rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.info-btn:hover { border-color: var(--primary); color: var(--primary); }

.tooltip-box {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  width: 260px;
  margin-top: 0.35rem;
  padding: 0.65rem 0.85rem;
  background: var(--text-dark);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.4;
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
}

.sig-bloc {
  background: linear-gradient(165deg, #ecfdf5 0%, #f0fdf4 100%);
  border-color: #a7f3d0;
}
.sig-row {
  display: grid;
  grid-template-columns: 1fr 130px 130px;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px dashed #a7f3d0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dark);
}
.sig-row span:not(:first-child) { text-align: right; }
.sig-row .negatif { color: #dc2626; }
</style>
