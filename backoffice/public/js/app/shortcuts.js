/**
 * Why this exists:
 * Keyboard shortcuts speed up repetitive editorial tasks and improve overall
 * usability for frequent backoffice users.
 */

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  )
}

export function bindShortcuts({ onSave, onReload, onCloseModal, onFocusSearch }) {
  function handler(event) {
    const metaOrCtrl = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()

    if (metaOrCtrl && key === 's') {
      event.preventDefault()
      onSave?.()
      return
    }

    if (metaOrCtrl && key === 'r') {
      event.preventDefault()
      onReload?.()
      return
    }

    if (event.key === 'Escape') {
      onCloseModal?.()
      return
    }

    if (event.key === '/' && !metaOrCtrl && !event.altKey && !isTypingTarget(event.target)) {
      event.preventDefault()
      onFocusSearch?.()
    }
  }

  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}
