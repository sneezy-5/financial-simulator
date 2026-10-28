// Suivi anonyme de l'entonnoir simulateur → Pro (aucun montant, aucune donnée
// de paie : uniquement le nom de l'étape). Silencieux en cas d'erreur.

const dejaEnvoyes = new Set()

function identifiantVisiteur() {
  try {
    let id = localStorage.getItem('onda_client_id')
    if (!id) {
      id = 'c_' + Math.random().toString(36).substring(2, 11)
      localStorage.setItem('onda_client_id', id)
    }
    return id
  } catch {
    return null
  }
}

/**
 * @param {string} evenement  simulation | pdf_simulateur | net_vers_brut | partage | explication | cout_employeur | guide_vu | clic_pro
 * @param {object} [options]
 * @param {string} [options.source]   d'où vient l'action (ex. 'bulletin', 'cout_employeur')
 * @param {boolean} [options.unique]  n'envoyer qu'une fois par chargement de page
 */
export function suivre(evenement, { source, unique = false } = {}) {
  const cle = `${evenement}:${source || ''}`
  if (unique && dejaEnvoyes.has(cle)) return
  dejaEnvoyes.add(cle)
  try {
    fetch('/api/stats/evenement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evenement, source, clientId: identifiantVisiteur() }),
      keepalive: true
    }).catch(() => {})
  } catch { /* silencieux */ }
}
