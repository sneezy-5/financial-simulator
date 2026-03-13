<script setup>
import { ref } from 'vue'
import { MODELES_COMMERCE, formatFCFA } from '../../services/taxService.js'

const emit = defineEmits(['select'])

const modeleSelectionne = ref(null)

function choisir(modele) {
  modeleSelectionne.value = modele.id
  emit('select', modele)
}
</script>

<template>
  <div class="modeles-section">
    <div class="modeles-header">
      <div class="modeles-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="color:#1d4ed8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"/>
        </svg>
        <span>Démarrage rapide</span>
      </div>
      <p class="modeles-sub">Choisissez votre type de commerce — les champs se rempliront automatiquement</p>
    </div>

    <div class="modeles-grid">
      <button
        v-for="m in MODELES_COMMERCE"
        :key="m.id"
        class="modele-card"
        :class="{ selected: modeleSelectionne === m.id }"
        :style="modeleSelectionne === m.id ? { borderColor: m.couleur, background: m.bg } : {}"
        @click="choisir(m)"
        type="button"
      >
        <div class="modele-icon" :style="{ color: modeleSelectionne === m.id ? m.couleur : '#475569', background: modeleSelectionne === m.id ? m.couleur + '18' : '#f1f5f9' }">
          <span v-html="m.icon"></span>
        </div>
        <span class="modele-label" :style="modeleSelectionne === m.id ? { color: m.couleur, fontWeight: '700' } : {}">{{ m.label }}</span>
        <span v-if="modeleSelectionne === m.id" class="modele-check" :style="{ color: m.couleur }">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
          </svg>
        </span>
      </button>
    </div>

    <!-- Détail du modèle sélectionné -->
    <transition name="fade">
      <div v-if="modeleSelectionne" class="modele-detail">
        <template v-for="m in MODELES_COMMERCE" :key="m.id">
          <div v-if="m.id === modeleSelectionne" class="detail-inner" :style="{ borderColor: m.couleur + '40', background: m.bg }">
            <div class="detail-row">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" :style="{ color: m.couleur }">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"/>
              </svg>
              <span><strong>CA exemple :</strong> {{ formatFCFA(m.caExempleAnnuel) }} FCFA / an</span>
            </div>
            <div class="detail-row">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="color:#64748b">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>
              </svg>
              <span><strong>Charges fixes :</strong> {{ m.descChargesFixes }}</span>
            </div>
            <div class="detail-row">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="color:#64748b">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/>
              </svg>
              <span><strong>Charges variables :</strong> {{ m.descChargesVar }}</span>
            </div>
            <p class="detail-hint">Les valeurs ci-dessus sont des estimations typiques. Vous pouvez les modifier après.</p>
          </div>
        </template>
      </div>
    </transition>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }

.modeles-section { padding: 1.25rem 1.75rem 0; }

.modeles-header { margin-bottom: 0.875rem; }
.modeles-title { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin-bottom: 0.25rem; }
.modeles-sub { font-size: 0.78rem; color: #6b7280; margin: 0; }

.modeles-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.modele-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.75rem 0.5rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: white;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  text-align: center;
}
.modele-card:hover { border-color: #94a3b8; background: #f8fafc; transform: translateY(-1px); }
.modele-card.selected { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

.modele-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; flex-shrink: 0; }
.modele-icon :deep(svg) { width: 18px; height: 18px; }

.modele-label { font-size: 0.72rem; font-weight: 500; color: #475569; line-height: 1.3; transition: all 0.15s; }

.modele-check { position: absolute; top: 5px; right: 5px; }

/* Détail */
.modele-detail { margin-top: 0.75rem; }
.detail-inner { border: 1px solid; border-radius: 10px; padding: 0.875rem 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
.detail-row { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.8rem; color: #374151; line-height: 1.4; }
.detail-row svg { flex-shrink: 0; margin-top: 2px; }
.detail-hint { font-size: 0.72rem; color: #9ca3af; margin: 0.25rem 0 0; }

.fade-enter-active, .fade-leave-active { transition: all 0.2s; }
.fade-enter-from { opacity: 0; transform: translateY(-6px); }
.fade-leave-to { opacity: 0; }

@media (max-width: 640px) {
  .modeles-section { padding: 1rem; }
  .modeles-grid { grid-template-columns: repeat(2, 1fr); gap: 0.375rem; }
  .modele-card { padding: 0.625rem 0.375rem; }
  .modele-label { font-size: 0.68rem; }
}
@media (min-width: 641px) and (max-width: 900px) {
  .modeles-grid { grid-template-columns: repeat(4, 1fr); }
}
</style>
