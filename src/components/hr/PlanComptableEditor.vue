<script setup>
import { ref, computed, onMounted } from 'vue'
import { updateProfile } from '../../services/auth.js'
import { showToast } from '../../services/toast.js'

// Plan comptable de paie : numéros par défaut (SYSCOHADA, repris de LOGIPAIE)
// que l'entreprise peut remplacer compte par compte. Laisser vide = défaut.
const plan = ref({})
const journaux = ref({ paie: 'PAIE', od: 'OD' })
const saisie = ref({})
const chargement = ref(true)
const enregistrement = ref(false)

const groupes = computed(() => {
  const g = {}
  for (const [cle, def] of Object.entries(plan.value)) (g[def.groupe] ||= []).push({ cle, ...def })
  return g
})

onMounted(async () => {
  try {
    const res = await fetch('/api/rh/compta/plan', { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    plan.value = data.plan
    journaux.value = data.journaux
    saisie.value = { ...data.personnalise }
  } catch (e) {
    showToast('Impossible de charger le plan comptable.', 'error')
  } finally {
    chargement.value = false
  }
})

const valide = (cle, v) => !v || (/^journal/.test(cle) ? /^[A-Z0-9]{1,8}$/i.test(v) : /^\d{3,12}$/.test(v))
const erreurs = computed(() => Object.entries(saisie.value).filter(([k, v]) => !valide(k, String(v || '').trim())).map(([k]) => k))

const enregistrer = async () => {
  if (erreurs.value.length) { showToast('Numéros invalides : 3 à 12 chiffres par compte, 1 à 8 caractères par code journal.', 'error'); return }
  enregistrement.value = true
  try {
    const propres = Object.fromEntries(Object.entries(saisie.value).map(([k, v]) => [k, String(v || '').trim()]).filter(([, v]) => v))
    await updateProfile({ comptesPaie: propres })
    showToast('Plan comptable enregistré.', 'success')
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error')
  } finally {
    enregistrement.value = false
  }
}

const reinitialiser = () => { saisie.value = {} }
</script>

<template>
  <div class="pc-wrap">
    <p class="pc-intro">
      Comptes utilisés par le <b>journal de paie</b>, le <b>journal des OD</b> et la <b>provision pour congés</b>
      (module Déclarations). Les numéros par défaut suivent le SYSCOHADA révisé ; remplacez seulement ceux qui
      diffèrent de votre plan de comptes. Un champ vide reprend le compte par défaut.
    </p>
    <div v-if="chargement" class="pc-vide">Chargement…</div>
    <template v-else>
      <div class="pc-groupe">
        <h4>Codes journaux</h4>
        <div class="pc-ligne">
          <label>Journal de paie</label>
          <input v-model="saisie.journalPaie" :placeholder="journaux.paie" :class="{ erreur: erreurs.includes('journalPaie') }" />
        </div>
        <div class="pc-ligne">
          <label>Journal des opérations diverses</label>
          <input v-model="saisie.journalOd" :placeholder="journaux.od" :class="{ erreur: erreurs.includes('journalOd') }" />
        </div>
      </div>
      <div v-for="(comptes, nom) in groupes" :key="nom" class="pc-groupe">
        <h4>{{ nom }}</h4>
        <div v-for="c in comptes" :key="c.cle" class="pc-ligne">
          <label>{{ c.libelle }}</label>
          <input v-model="saisie[c.cle]" :placeholder="c.compte" inputmode="numeric" :class="{ erreur: erreurs.includes(c.cle) }" />
        </div>
      </div>
      <div class="pc-actions">
        <button class="pc-btn" :disabled="enregistrement" @click="enregistrer">{{ enregistrement ? 'Enregistrement…' : 'Enregistrer le plan comptable' }}</button>
        <button class="pc-btn pc-btn-gris" type="button" @click="reinitialiser">Revenir aux comptes par défaut</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pc-wrap { max-width: 760px; }
.pc-intro { font-size: 0.88rem; color: #475569; line-height: 1.55; margin: 0 0 16px; }
.pc-vide { padding: 2rem; text-align: center; color: #64748b; }
.pc-groupe { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; background: #fff; }
.pc-groupe h4 { margin: 0 0 8px; font-size: 0.85rem; color: #1e3a8a; }
.pc-ligne { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; }
.pc-ligne label { font-size: 0.85rem; color: #334155; }
.pc-ligne input { width: 130px; padding: 6px 10px; border-radius: 8px; border: 1px solid #e2e8f0; font-family: Consolas, monospace; text-align: right; }
.pc-ligne input.erreur { border-color: #ef4444; background: #fef2f2; }
.pc-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.pc-btn { padding: 9px 16px; border-radius: 10px; border: none; background: #1e3a8a; color: #fff; font-weight: 600; cursor: pointer; }
.pc-btn:disabled { opacity: 0.6; }
.pc-btn-gris { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
@media (max-width: 560px) { .pc-ligne { flex-direction: column; align-items: stretch; } .pc-ligne input { width: 100%; } }
</style>
