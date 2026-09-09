<script setup>
import { ref, computed } from 'vue'
import { BILAN_ACTIF_STRUCTURE, BILAN_PASSIF_STRUCTURE, verifierEquilibreBilan } from '../../services/financialAnalysisService.js'

const props = defineProps({
  bilanN: { type: Object, required: true },
  bilanN1: { type: Object, required: true },
})

// Explications pour les postes les moins évidents (pattern TOOLTIPS de TaxCalculatorEntreprise.vue)
const DESCRIPTIONS = {
  chargesImmobilisees: "Frais engagés qui profitent à plusieurs exercices (frais d'établissement, charges à répartir) plutôt qu'à la seule année en cours.",
  actifCirculantHAO: "Créances liées à des opérations exceptionnelles (hors activité normale de l'entreprise), par exemple la vente d'un immeuble.",
  ecartConversionActif: "Perte de change latente sur une créance ou dette en devise étrangère, constatée à la clôture.",
  primesEtReserves: "Bénéfices des exercices précédents mis de côté (réserve légale, statutaire...) au lieu d'être distribués.",
  apporteursCapitalNonAppele: "Part du capital souscrit par les associés mais pas encore réclamée par l'entreprise — vient en déduction du capital.",
  subventionsInvestissement: "Aides reçues (État, bailleur) pour financer un investissement, rattachées aux capitaux propres.",
  provisionsReglementees: "Provisions constituées pour bénéficier d'un avantage fiscal, sans lien avec un risque réel identifié.",
  dettesLocationAcquisition: "Dettes liées à un contrat de crédit-bail ou location avec option d'achat, traité comme un financement.",
  dettesCirculantesHAO: "Dettes liées à des opérations exceptionnelles hors activité normale (ex. achat d'un immeuble à crédit).",
  clientsAvancesRecues: "Acomptes déjà encaissés auprès de clients pour des livraisons ou prestations pas encore réalisées.",
  ecartConversionPassif: 'Gain de change latent sur une créance ou dette en devise étrangère, constaté à la clôture.',
}

const activeTooltip = ref(null)
const toggleTooltip = (key) => { activeTooltip.value = activeTooltip.value === key ? null : key }

const equilibreN = computed(() => verifierEquilibreBilan(props.bilanN))
const equilibreN1 = computed(() => verifierEquilibreBilan(props.bilanN1))

const formatMontant = (v) => new Intl.NumberFormat('fr-FR').format(Math.round(v || 0))
</script>

<template>
  <div class="bilan-form">
    <div class="equilibre-row">
      <div class="equilibre-banner" :class="equilibreN1.equilibre ? 'ok' : 'ko'">
        <span class="ex-label">Exercice N-1</span>
        <span v-if="equilibreN1.equilibre">✓ Bilan équilibré — {{ formatMontant(equilibreN1.totalActif) }} FCFA</span>
        <span v-else>⚠ Écart de {{ formatMontant(Math.abs(equilibreN1.ecart)) }} FCFA (Actif {{ formatMontant(equilibreN1.totalActif) }} / Passif {{ formatMontant(equilibreN1.totalPassif) }})</span>
      </div>
      <div class="equilibre-banner" :class="equilibreN.equilibre ? 'ok' : 'ko'">
        <span class="ex-label">Exercice N</span>
        <span v-if="equilibreN.equilibre">✓ Bilan équilibré — {{ formatMontant(equilibreN.totalActif) }} FCFA</span>
        <span v-else>⚠ Écart de {{ formatMontant(Math.abs(equilibreN.ecart)) }} FCFA (Actif {{ formatMontant(equilibreN.totalActif) }} / Passif {{ formatMontant(equilibreN.totalPassif) }})</span>
      </div>
    </div>

    <div class="bilan-cote">
      <h3 class="cote-titre">ACTIF</h3>
      <div class="postes-header">
        <span></span><span>N-1</span><span>N</span>
      </div>
      <div v-for="section in BILAN_ACTIF_STRUCTURE" :key="section.section" class="section-bloc">
        <h4 class="section-titre">{{ section.section }}</h4>
        <div v-for="poste in section.postes" :key="poste.key" class="poste-row">
          <div class="poste-label">
            {{ poste.label }}
            <button v-if="DESCRIPTIONS[poste.key]" type="button" class="info-btn" @click="toggleTooltip(poste.key)" title="Explication">?</button>
            <div v-if="activeTooltip === poste.key" class="tooltip-box">{{ DESCRIPTIONS[poste.key] }}</div>
          </div>
          <input type="number" step="1" v-model.number="bilanN1.actif[poste.key]" placeholder="0" />
          <input type="number" step="1" v-model.number="bilanN.actif[poste.key]" placeholder="0" />
        </div>
      </div>
      <div class="total-row">
        <span>TOTAL GÉNÉRAL ACTIF</span>
        <span>{{ formatMontant(equilibreN1.totalActif) }}</span>
        <span>{{ formatMontant(equilibreN.totalActif) }}</span>
      </div>
    </div>

    <div class="bilan-cote">
      <h3 class="cote-titre">PASSIF</h3>
      <div class="postes-header">
        <span></span><span>N-1</span><span>N</span>
      </div>
      <div v-for="section in BILAN_PASSIF_STRUCTURE" :key="section.section" class="section-bloc">
        <h4 class="section-titre">{{ section.section }}</h4>
        <div v-for="poste in section.postes" :key="poste.key" class="poste-row">
          <div class="poste-label">
            {{ poste.label }}
            <button v-if="DESCRIPTIONS[poste.key]" type="button" class="info-btn" @click="toggleTooltip(poste.key)" title="Explication">?</button>
            <div v-if="activeTooltip === poste.key" class="tooltip-box">{{ DESCRIPTIONS[poste.key] }}</div>
          </div>
          <input type="number" step="1" v-model.number="bilanN1.passif[poste.key]" placeholder="0" />
          <input type="number" step="1" v-model.number="bilanN.passif[poste.key]" placeholder="0" />
        </div>
      </div>
      <div class="total-row">
        <span>TOTAL GÉNÉRAL PASSIF</span>
        <span>{{ formatMontant(equilibreN1.totalPassif) }}</span>
        <span>{{ formatMontant(equilibreN.totalPassif) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bilan-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.equilibre-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
@media (max-width: 700px) {
  .equilibre-row { grid-template-columns: 1fr; }
}
.equilibre-banner {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  font-size: 0.85rem;
  font-weight: 600;
  border: 1px solid transparent;
}
.equilibre-banner.ok { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
.equilibre-banner.ko { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
.ex-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.75; }

.bilan-cote {
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
  .postes-header, .poste-row, .total-row { grid-template-columns: 1fr 90px 90px !important; }
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

.total-row {
  display: grid;
  grid-template-columns: 1fr 130px 130px;
  gap: 0.75rem;
  margin-top: 0.5rem;
  padding: 0.6rem 0;
  border-top: 2px solid var(--text-dark);
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--text-dark);
}
.total-row span:not(:first-child) { text-align: right; }
</style>
