import { ref } from 'vue'

export const toastState = ref({
  show: false,
  message: '',
  type: 'info'
})

let timeoutId = null

export const showToast = (message, type = 'info') => {
  toastState.value = { show: true, message, type }
  if (timeoutId) clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    toastState.value.show = false
  }, 4000)
}

// Intercept global alert to use toast instead
if (typeof window !== 'undefined') {
  window.appAlert = window.alert;
  window.alert = (message) => {
    showToast(message, 'error'); // Defaults to error for alerts as they are usually validation errors in this app
  }
}
