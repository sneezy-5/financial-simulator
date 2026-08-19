<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
const props = defineProps({
  employees: {
    type: Array,
    required: true,
    default: () => []
  },
  placeholder: {
    type: String,
    default: 'Rechercher un employé (Nom ou Matricule)...'
  }
})

const emit = defineEmits(['select'])

const searchFocused = ref(false)
const searchQuery = ref('')
const wrapperRef = ref(null)

const filteredEmployees = computed(() => {
  if (!searchQuery.value) return props.employees
  const q = searchQuery.value.toLowerCase()
  return props.employees.filter(e => 
    `${e.nom || ''} ${e.prenom || ''} ${e.matricule || ''}`.toLowerCase().includes(q)
  )
})

const selectEmployee = (e) => {
  if (!e) return
  emit('select', e)
  searchQuery.value = ''
  searchFocused.value = false
}

// mousedown (pas click) pour la détection "clic à l'extérieur" : mousedown se termine avant que
// l'événement click ne démarre, donc il ne peut jamais entrer en course avec le @click d'un
// élément de la liste (contrairement à un listener 'click' en capture, qui peut fermer la liste
// avant que le clic sur l'item n'ait eu l'occasion de s'exécuter).
const handleClickOutside = (event) => {
  if (wrapperRef.value && !wrapperRef.value.contains(event.target)) {
    searchFocused.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside, true)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside, true)
})
</script>

<template>
  <div ref="wrapperRef" style="position: relative; width: 100%;">
    <svg style="position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
    <input 
      type="text" 
      v-model="searchQuery"
      @focus="searchFocused = true"
      :placeholder="placeholder" 
      style="width: 100%; padding: 0.6rem 0.75rem 0.6rem 2.2rem; border-radius: 8px; border: 1px solid #e2e8f0; box-sizing: border-box;"
    />
    <div 
      v-if="searchFocused" 
      style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-top: 4px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 50; max-height: 250px; overflow-y: auto;"
    >
      <div 
        v-for="e in filteredEmployees" 
        :key="e.id" 
        @click="selectEmployee(e)" 
        style="padding: 0.75rem 1rem; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between;"
        onmouseover="this.style.background='#f8fafc'"
        onmouseout="this.style.background='white'"
      >
        <div>
          <div style="font-weight: 600; color: #0f172a; font-size: 0.85rem;">{{ e.nom }} {{ e.prenom }}</div>
          <div style="font-size: 0.7rem; color: #64748b;">{{ e.poste || 'Aucun poste renseigné' }}</div>
        </div>
        <span v-if="e.matricule" style="background: #e2e8f0; color: #334155; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">{{ e.matricule }}</span>
      </div>
      <div v-if="filteredEmployees.length === 0" style="padding: 1rem; text-align: center; color: #94a3b8; font-size: 0.85rem;">
        Aucun employé trouvé
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Scoped styles si besoin */
</style>
