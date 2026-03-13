<script setup>
import { computed } from 'vue'
import { formatFCFA } from '../../services/taxService.js'

const props = defineProps({ resultats: Object })

const annee = new Date().getFullYear()
const today = new Date(); today.setHours(0, 0, 0, 0)

function makeEvt(m, j, action, type, desc) {
  const date = new Date(annee, m - 1, j)
  const jr = Math.ceil((date - today) / 86_400_000)
  const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  return { date, moisLabel: MOIS[m - 1], jourLabel: j, action, type, description: desc,
    joursRestants: jr, passe: jr < 0, urgent: jr >= 0 && jr <= 30 }
}

const calendriers = {
  entreprenant_tce: [
    makeEvt(1,31,'Déclaration du CA annuel (DGI)','critique','Obligatoire : En cas d\'oubli, la DGI vous taxe d\'office avec une amende de 100%.'),
    makeEvt(3,31,'Paiement de la patente annuelle','critique','Vital : Sans preuve de paiement, risque de fermeture immédiate (scellés) lors d\'un contrôle.'),
    makeEvt(12,1,'Préparer la déclaration','info','Rassemblez vos reçus pour éviter les erreurs de calcul en Janvier.'),
  ],
  entreprenant_tee: [
    makeEvt(1,31,'Déclaration du CA annuel','critique','Obligatoire : C\'est la base de votre impôt. Le défaut de déclaration entraîne une pénalité de 100%.'),
    makeEvt(3,31,'Paiement de la patente annuelle','critique','Indispensable : C\'est votre autorisation d\'exercer. Risque de fermeture de l\'établissement.'),
    makeEvt(4,30,'1er acompte d\'impôt','important','50% de l\'impôt annuel — pour éviter les intérêts de retard de 10%.'),
    makeEvt(7,31,'2ème acompte d\'impôt','important','Solde de l\'impôt annuel.'),
    makeEvt(11,1,'Vérification CA cumulé','info','Vérifiez que vous ne dépassez pas les 50 millions FCFA.'),
  ],
  rme: [
    makeEvt(1,31,'Déclaration du CA annuel','critique','La DGI exige cette déclaration pour valider votre maintien au régime RME.'),
    makeEvt(3,31,'Paiement de la patente','critique','Obligatoire pour obtenir votre macaron fiscal de l\'année en cours.'),
    makeEvt(4,30,'1er acompte IS','critique','Le non-paiement bloque vos futures attestations de régularité fiscale (ARF).'),
    makeEvt(7,31,'2ème acompte IS','critique','Deuxième tiers provisionnel.'),
    makeEvt(12,15,'3ème acompte IS','critique','Solde final de l\'impôt annuel.'),
  ],
  rsi: [
    makeEvt(3,31,'Dépôt du Bilan (Liasse Fiscale)','critique','Extrêmement grave : Le retard bloque toute activité bancaire et douanière. Expert-Comptable obligatoire.'),
    makeEvt(4,30,'1er acompte IS','critique','Paiement de 25% de l\'impôt de l\'année précédente.'),
    makeEvt(7,31,'2ème acompte IS','critique','Deuxième quart.'),
    makeEvt(10,31,'3ème acompte IS','critique','Troisième quart.'),
    makeEvt(12,31,'4ème acompte IS','critique','Dernier quart.'),
  ],
}

const events = computed(() => {
  const id = props.resultats?.regime?.id
  return (calendriers[id] || calendriers.entreprenant_tee).sort((a, b) => a.date - b.date)
})

const prochainEvent = computed(() => events.value.find(e => !e.passe))

const COULEURS = {
  critique: { color: '#b91c1c', bg: '#fee2e2', border: '#fecaca', dot: '#dc2626' },
  important: { color: '#b45309', bg: '#fefce8', border: '#fde68a', dot: '#d97706' },
  info: { color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6' },
}

function urgenceLabel(evt) {
  if (evt.passe) return 'Passé'
  if (evt.joursRestants === 0) return "Aujourd'hui !"
  if (evt.urgent) return `Dans ${evt.joursRestants} jours`
  if (evt.joursRestants <= 90) return `Dans ${evt.joursRestants} jours`
  const moisRestants = Math.ceil(evt.joursRestants / 30)
  return `Dans ~${moisRestants} mois`
}
</script>

<template>
  <div class="cal-card">
    <div class="cal-header">
      <div class="cal-title-wrap">
        <div class="cal-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>
          </svg>
        </div>
        <div>
          <div class="cal-title">Calendrier fiscal {{ annee }}</div>
          <div class="cal-sub">{{ resultats.regime.label }} — Vos échéances DGI</div>
        </div>
      </div>

      <!-- Prochain événement -->
      <div v-if="prochainEvent" class="prochain-badge" :style="{ background: prochainEvent.urgent ? '#fee2e2' : '#eff6ff', color: prochainEvent.urgent ? '#b91c1c' : '#1e40af', border: '1px solid ' + (prochainEvent.urgent ? '#fecaca' : '#bfdbfe') }">
        <svg v-if="prochainEvent.urgent" xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
        <span>Prochain : {{ prochainEvent.action }} — {{ urgenceLabel(prochainEvent) }}</span>
      </div>
    </div>

    <div class="timeline">
      <div v-for="(evt, i) in events" :key="i" class="timeline-item" :class="{ passe: evt.passe }">
        <!-- Date -->
        <div class="tl-date">
          <div class="tl-mois">{{ evt.moisLabel }}</div>
          <div class="tl-jour">{{ String(evt.jourLabel).padStart(2, '0') }}</div>
        </div>

        <!-- Connecteur -->
        <div class="tl-connector">
          <div class="tl-dot" :style="{ background: evt.passe ? '#d1d5db' : COULEURS[evt.type].dot }"></div>
          <div class="tl-line" v-if="i < events.length - 1"></div>
        </div>

        <!-- Contenu -->
        <div class="tl-content">
          <div class="tl-badge-row">
            <span class="tl-tag" :style="evt.passe ? { background: '#f1f5f9', color: '#9ca3af', border: '1px solid #e2e8f0' } : { background: COULEURS[evt.type].bg, color: COULEURS[evt.type].color, border: '1px solid ' + COULEURS[evt.type].border }">
              {{ evt.passe ? 'Passé' : evt.type === 'critique' ? 'Critique' : evt.type === 'important' ? 'Important' : 'Info' }}
            </span>
            <span class="tl-timing" :class="{ urgent: evt.urgent && !evt.passe }">{{ urgenceLabel(evt) }}</span>
          </div>
          <div class="tl-action" :class="{ passe: evt.passe }">{{ evt.action }}</div>
          <div v-if="evt.description" class="tl-desc">{{ evt.description }}</div>
        </div>
      </div>
    </div>

    <!-- Légende explicative -->
    <div class="cal-legend no-print">
      <div class="leg-source">Source : Code Général des Impôts (CGI) Côte d'Ivoire</div>
      <div class="leg-item">
        <span class="leg-dot critique"></span>
        <div><strong>Critique :</strong> Sanctions pénales, amendes (10-100%) ou fermeture.</div>
      </div>
      <div class="leg-item">
        <span class="leg-dot important"></span>
        <div><strong>Important :</strong> Intérêts de retard et pénalités de recouvrement.</div>
      </div>
      <div class="leg-item">
        <span class="leg-dot info"></span>
        <div><strong>Conseil :</strong> Bonne gestion pour éviter les erreurs de déclaration.</div>
      </div>
    </div>

    <div class="cal-footer">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>
      En cas de doute, contactez votre Centre des Impôts local ou la DGI au 22 21 10 90.
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.cal-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }

.cal-header { padding: 1.25rem 1.5rem; background: #f8fafc; border-bottom: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 0.75rem; }
.cal-title-wrap { display: flex; align-items: flex-start; gap: 0.75rem; }
.cal-icon { width: 34px; height: 34px; background: #eff6ff; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #1d4ed8; flex-shrink: 0; }
.cal-title { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.cal-sub { font-size: 0.75rem; color: #6b7280; margin-top: 1px; }

.prochain-badge { display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.75rem; border-radius: 8px; font-size: 0.78rem; font-weight: 600; }

/* Timeline */
.timeline { padding: 1rem 1.5rem; display: flex; flex-direction: column; }
.timeline-item { display: flex; gap: 0.875rem; }

.tl-date { width: 52px; flex-shrink: 0; text-align: right; padding-top: 0.25rem; }
.tl-mois { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; font-weight: 600; }
.tl-jour { font-size: 1rem; font-weight: 800; color: #374151; line-height: 1; }
.timeline-item.passe .tl-mois, .timeline-item.passe .tl-jour { color: #d1d5db; }

.tl-connector { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
.tl-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 0.35rem; }
.tl-line { width: 2px; background: #f1f5f9; flex: 1; min-height: 24px; margin: 4px 0; }

.tl-content { flex: 1; padding-bottom: 1.25rem; }
.tl-badge-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem; }
.tl-tag { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.5rem; border-radius: 4px; }
.tl-timing { font-size: 0.72rem; color: #9ca3af; }
.tl-timing.urgent { color: #b91c1c; font-weight: 700; }
.tl-action { font-size: 0.85rem; font-weight: 600; color: #0f172a; line-height: 1.3; }
.tl-action.passe { color: #9ca3af; text-decoration: line-through; }
.tl-desc { font-size: 0.75rem; color: #6b7280; margin-top: 0.2rem; line-height: 1.4; }

.cal-footer { padding: 0.75rem 1.5rem; border-top: 1px solid #f1f5f9; display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: #9ca3af; }

/* Légende */
.cal-legend {
  padding: 1rem 1.5rem;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.leg-source {
  font-size: 0.65rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.4rem;
}
.leg-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.4;
}
.leg-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
}
.leg-dot.critique { background: #dc2626; box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1); }
.leg-dot.important { background: #d97706; box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.1); }
.leg-dot.info { background: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

@media (max-width: 640px) {
  .cal-header { padding: 1rem; }
  .timeline { padding: 0.75rem 1rem; }
  .tl-date { width: 42px; }
  .tl-jour { font-size: 0.875rem; }
}
</style>
