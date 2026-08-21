/**
 * Why this exists:
 * The command palette (Cmd+K / Ctrl+K) provides power-user keyboard navigation
 * to open files, execute editor actions, switch modes, and toggle themes instantly.
 */

export function createCommandPalette({
  modal,
  input,
  list,
  getCommands,
  onExecute,
}) {
  let isOpen = false
  let selectedIndex = 0
  let currentFilteredCommands = []

  function open() {
    if (!modal) return
    isOpen = true
    modal.hidden = false
    document.body.classList.add('modal-open')
    if (typeof modal.showModal === 'function' && !modal.open) {
      try {
        modal.showModal()
      } catch {
        // Fallback for non-standard dialog implementations
      }
    }
    if (input) {
      input.value = ''
      input.focus()
    }
    renderResults('')
  }

  function close() {
    if (!modal) return
    isOpen = false
    modal.hidden = true
    document.body.classList.remove('modal-open')
    if (typeof modal.close === 'function' && modal.open) {
      try {
        modal.close()
      } catch {
        // Fallback
      }
    }
  }

  function toggle() {
    if (isOpen) {
      close()
    } else {
      open()
    }
  }

  function renderResults(query = '') {
    if (!list) return
    const allCommands = typeof getCommands === 'function' ? getCommands() : []
    const normalized = query.trim().toLowerCase()

    currentFilteredCommands = allCommands.filter((cmd) => {
      if (!normalized) return true
      const inTitle = cmd.title.toLowerCase().includes(normalized)
      const inCategory = cmd.category?.toLowerCase().includes(normalized)
      const inSubtitle = cmd.subtitle?.toLowerCase().includes(normalized)
      const inKeywords = Array.isArray(cmd.keywords)
        ? cmd.keywords.some((k) => k.toLowerCase().includes(normalized))
        : false
      return inTitle || inCategory || inSubtitle || inKeywords
    })

    list.innerHTML = ''
    selectedIndex = Math.min(selectedIndex, Math.max(0, currentFilteredCommands.length - 1))

    if (currentFilteredCommands.length === 0) {
      const emptyItem = document.createElement('li')
      emptyItem.className = 'command-palette-empty'
      emptyItem.textContent = `No matching commands for "${query}"`
      list.append(emptyItem)
      return
    }

    // Group commands by category
    let lastCategory = null

    currentFilteredCommands.forEach((cmd, idx) => {
      if (cmd.category && cmd.category !== lastCategory) {
        lastCategory = cmd.category
        const header = document.createElement('li')
        header.className = 'command-palette-category'
        header.textContent = cmd.category
        header.setAttribute('aria-hidden', 'true')
        list.append(header)
      }

      const item = document.createElement('li')
      item.className = 'command-palette-item'
      if (idx === selectedIndex) {
        item.classList.add('is-selected')
        item.setAttribute('aria-selected', 'true')
      }

      const titleSpan = document.createElement('span')
      titleSpan.className = 'command-palette-title'
      titleSpan.textContent = cmd.title

      item.append(titleSpan)

      if (cmd.subtitle) {
        const subSpan = document.createElement('span')
        subSpan.className = 'command-palette-subtitle'
        subSpan.textContent = cmd.subtitle
        item.append(subSpan)
      }

      if (cmd.shortcut) {
        const shortcutKbd = document.createElement('kbd')
        shortcutKbd.className = 'command-palette-shortcut'
        shortcutKbd.textContent = cmd.shortcut
        item.append(shortcutKbd)
      }

      item.addEventListener('mouseenter', () => {
        selectedIndex = idx
        updateSelectionHighlight()
      })

      item.addEventListener('click', () => {
        executeCommand(cmd)
      })

      list.append(item)
    })

    scrollSelectedIntoView()
  }

  function updateSelectionHighlight() {
    if (!list) return
    const items = list.querySelectorAll('.command-palette-item')
    items.forEach((item, idx) => {
      if (idx === selectedIndex) {
        item.classList.add('is-selected')
        item.setAttribute('aria-selected', 'true')
      } else {
        item.classList.remove('is-selected')
        item.removeAttribute('aria-selected')
      }
    })
    scrollSelectedIntoView()
  }

  function scrollSelectedIntoView() {
    if (!list) return
    const selectedEl = list.querySelector('.command-palette-item.is-selected')
    if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }

  function executeCommand(cmd) {
    close()
    if (typeof cmd.action === 'function') {
      cmd.action()
    }
    if (typeof onExecute === 'function') {
      onExecute(cmd)
    }
  }

  // Setup input events
  if (input) {
    input.addEventListener('input', (e) => {
      selectedIndex = 0
      renderResults(e.target.value)
    })

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (currentFilteredCommands.length > 0) {
          selectedIndex = (selectedIndex + 1) % currentFilteredCommands.length
          updateSelectionHighlight()
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (currentFilteredCommands.length > 0) {
          selectedIndex =
            (selectedIndex - 1 + currentFilteredCommands.length) % currentFilteredCommands.length
          updateSelectionHighlight()
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const targetCmd = currentFilteredCommands[selectedIndex]
        if (targetCmd) {
          executeCommand(targetCmd)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    })
  }

  // Modal backdrop click
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        close()
      }
    })
  }

  return {
    open,
    close,
    toggle,
    isOpen: () => isOpen,
  }
}
