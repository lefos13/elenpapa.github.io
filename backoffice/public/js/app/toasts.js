/**
 * Why this exists:
 * A centralized toast layer keeps user feedback consistent across save, upload,
 * validation, and git flows without scattering ad-hoc status messaging.
 */

export function createToastController(root) {
  function show({ message, type = 'info', timeoutMs = 3500 }) {
    if (!root || !message) return

    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`
    toast.textContent = message
    root.append(toast)

    const remove = () => {
      if (toast.parentElement) toast.parentElement.removeChild(toast)
    }

    setTimeout(remove, timeoutMs)
  }

  return { show }
}
