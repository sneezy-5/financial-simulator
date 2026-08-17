import { ref } from 'vue'

export const confirmState = ref({
  show: false,
  title: '',
  message: '',
  confirmLabel: 'Confirmer',
  cancelLabel: 'Annuler',
  type: 'danger', // 'danger' | 'warning' | 'info'
  resolve: null
})

/**
 * Affiche une popup de confirmation personnalisée.
 * Retourne une Promise<boolean> : true si confirmé, false si annulé.
 * 
 * Usage:
 *   const ok = await showConfirm('Voulez-vous supprimer cet élément ?')
 *   if (ok) { ... }
 */
export const showConfirm = (message, { title = 'Confirmation', confirmLabel = 'Confirmer', cancelLabel = 'Annuler', type = 'danger' } = {}) => {
  return new Promise((resolve) => {
    confirmState.value = {
      show: true,
      title,
      message,
      confirmLabel,
      cancelLabel,
      type,
      resolve
    }
  })
}

export const resolveConfirm = (result) => {
  if (confirmState.value.resolve) {
    confirmState.value.resolve(result)
  }
  confirmState.value.show = false
}

// Override native confirm()
if (typeof window !== 'undefined') {
  window.confirm = (message) => {
    // For synchronous compat, we show toast and return true by default
    // But all code should use showConfirm() directly
    showConfirm(message)
    return false // Don't execute the action immediately
  }
}
