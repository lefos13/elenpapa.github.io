/**
 * Why this exists:
 * The media picker modal provides an accessible, searchable dialog for choosing
 * existing project images directly from the media library instead of re-uploading assets.
 */
import { fetchImages as defaultFetchImages } from '../../api.js'

/**
 * Opens the Media Picker modal and allows the user to choose an image asset.
 *
 * @param {Object} options
 * @param {(imagePath: string) => void} options.onSelect - Callback when an image is selected
 * @param {string} [options.currentPath] - Initial image path to preselect
 * @param {(query?: string) => Promise<Array<any>>} [options.fetchImages] - Function to fetch images inventory
 */
export async function openMediaPickerModal({
  onSelect,
  currentPath = '',
  fetchImages = defaultFetchImages,
}) {
  let modal = document.querySelector('#media-picker-modal')

  if (!modal) {
    modal = createMediaPickerModalElement()
    document.body.appendChild(modal)
  }

  const searchInput = modal.querySelector('.media-picker-search')
  const gridContainer = modal.querySelector('.media-picker-grid')
  const emptyMessage = modal.querySelector('.media-picker-empty')
  const selectedPathEl = modal.querySelector('.media-picker-selected-path')
  const selectButton = modal.querySelector('.btn-media-select')
  const cancelButton = modal.querySelector('.btn-cancel')
  const closeButton = modal.querySelector('.btn-close-modal')

  let allImages = []
  let selectedPath = currentPath || ''

  function updateSelectionUi() {
    if (selectedPathEl) {
      selectedPathEl.textContent = selectedPath || 'None'
    }
    if (selectButton) {
      selectButton.disabled = !selectedPath
    }

    const cards = gridContainer ? gridContainer.querySelectorAll('.media-picker-card') : []
    cards.forEach((card) => {
      const isSelected = card.dataset.path === selectedPath
      card.classList.toggle('is-selected', isSelected)
      card.setAttribute('aria-selected', isSelected ? 'true' : 'false')
    })
  }

  function renderGrid(query = '') {
    if (!gridContainer) return
    gridContainer.innerHTML = ''

    const cleanQuery = query.trim().toLowerCase()
    const filteredImages = cleanQuery
      ? allImages.filter((image) => {
          const haystack = `${image.name || ''} ${image.section || ''} ${image.relativePath || ''} ${image.publicPath || ''}`.toLowerCase()
          return haystack.includes(cleanQuery)
        })
      : allImages

    if (!filteredImages.length) {
      if (emptyMessage) emptyMessage.hidden = false
      return
    }

    if (emptyMessage) emptyMessage.hidden = true

    filteredImages.forEach((image) => {
      const card = document.createElement('article')
      card.className = 'media-picker-card'
      card.role = 'option'
      card.tabIndex = 0
      card.dataset.path = image.publicPath
      if (image.publicPath === selectedPath) {
        card.classList.add('is-selected')
        card.setAttribute('aria-selected', 'true')
      } else {
        card.setAttribute('aria-selected', 'false')
      }

      const preview = document.createElement('img')
      preview.className = 'media-picker-thumb'
      preview.src = image.publicPath
      preview.alt = image.name || 'Image preview'
      preview.loading = 'lazy'

      const meta = document.createElement('div')
      meta.className = 'media-picker-meta'

      const nameEl = document.createElement('strong')
      nameEl.className = 'media-picker-name'
      nameEl.textContent = image.name || 'Untitled'

      const detailsEl = document.createElement('div')
      detailsEl.className = 'media-picker-details'

      const sectionBadge = document.createElement('span')
      sectionBadge.className = 'media-picker-badge'
      sectionBadge.textContent = image.section || 'general'

      const sizeLabel = document.createElement('span')
      sizeLabel.className = 'media-picker-size'
      sizeLabel.textContent = image.sizeLabel || ''

      detailsEl.append(sectionBadge, sizeLabel)

      const pathEl = document.createElement('code')
      pathEl.className = 'media-picker-path'
      pathEl.textContent = image.publicPath

      meta.append(nameEl, detailsEl, pathEl)
      card.append(preview, meta)

      card.addEventListener('click', () => {
        selectedPath = image.publicPath
        updateSelectionUi()
      })

      card.addEventListener('dblclick', () => {
        selectedPath = image.publicPath
        confirmSelection()
      })

      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          selectedPath = image.publicPath
          updateSelectionUi()
        }
      })

      gridContainer.append(card)
    })

    // If preselected image exists in current filtered view, scroll into view
    if (selectedPath) {
      const selectedCard = gridContainer.querySelector(`[data-path="${selectedPath}"]`)
      if (selectedCard) {
        selectedCard.scrollIntoView({ block: 'nearest' })
      }
    }
  }

  function confirmSelection() {
    if (!selectedPath) return
    closeModal()
    if (typeof onSelect === 'function') {
      onSelect(selectedPath)
    }
  }

  function closeModal() {
    if (modal) {
      modal.hidden = true
      modal.removeAttribute('open')
      if (typeof modal.close === 'function' && modal.open) {
        try {
          modal.close()
        } catch {
          // Dialog fallback
        }
      }
    }
    document.body.classList.remove('modal-open')
    document.removeEventListener('keydown', handleKeydown)
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeModal()
    }
  }

  // Bind close and action listeners
  if (closeButton) {
    closeButton.onclick = closeModal
  }
  if (cancelButton) {
    cancelButton.onclick = closeModal
  }
  if (selectButton) {
    selectButton.onclick = confirmSelection
  }

  // Modal backdrop click
  modal.onclick = (event) => {
    if (event.target === modal) {
      closeModal()
    }
  }

  // Search input filter
  if (searchInput) {
    searchInput.value = ''
    searchInput.oninput = () => {
      renderGrid(searchInput.value)
    }
  }

  document.addEventListener('keydown', handleKeydown)

  // Show modal
  modal.hidden = false
  modal.setAttribute('open', '')
  if (typeof modal.showModal === 'function' && !modal.open) {
    try {
      modal.showModal()
    } catch {
      // Dialog fallback
    }
  }
  document.body.classList.add('modal-open')

  // Initial loading state in grid
  if (gridContainer) {
    gridContainer.innerHTML = '<div class="media-picker-loading">Loading images from library...</div>'
  }
  if (emptyMessage) emptyMessage.hidden = true
  updateSelectionUi()

  setTimeout(() => searchInput?.focus(), 50)

  // Fetch images
  try {
    const fetched = await fetchImages('')
    allImages = Array.isArray(fetched) ? fetched : []
    renderGrid(searchInput?.value || '')
    updateSelectionUi()
  } catch (error) {
    if (gridContainer) {
      gridContainer.innerHTML = `<div class="media-picker-error">Failed to load images: ${error instanceof Error ? error.message : String(error)}</div>`
    }
  }
}

function createMediaPickerModalElement() {
  const dialog = document.createElement('dialog')
  dialog.id = 'media-picker-modal'
  dialog.className = 'modal media-picker-modal'
  dialog.setAttribute('aria-labelledby', 'media-picker-title')
  dialog.hidden = true

  dialog.innerHTML = `
    <div class="modal-panel media-picker-panel">
      <div class="media-picker-header">
        <h3 id="media-picker-title">Choose from Media Library</h3>
        <button type="button" class="btn-close-modal" aria-label="Close dialog">✕</button>
      </div>
      <div class="media-picker-search-bar">
        <input type="search" class="media-picker-search" placeholder="Search images by name, section, or path..." aria-label="Search images" />
      </div>
      <div class="media-picker-body">
        <div class="media-picker-grid" role="listbox" aria-label="Available images"></div>
        <div class="media-picker-empty" hidden>No images found matching your search.</div>
      </div>
      <div class="media-picker-footer modal-actions">
        <div class="media-picker-selection-info">
          <span class="media-picker-selected-label">Selected:</span>
          <code class="media-picker-selected-path">None</code>
        </div>
        <div class="media-picker-actions">
          <button type="button" class="btn-cancel">Cancel</button>
          <button type="button" class="btn-primary btn-media-select" disabled>Select Image</button>
        </div>
      </div>
    </div>
  `
  return dialog
}
