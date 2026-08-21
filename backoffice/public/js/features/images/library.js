/**
 * Why this exists:
 * Media library view and image lightbox viewer are exposed through this feature module
 * so the app controller can manage image previews, asset inspection, and lightbox dialogs cleanly.
 */
import { renderImagesLibrary as baseRenderImagesLibrary } from '../../views/images-library.js'

/**
 * Opens the Image Lightbox dialog for the selected image object.
 *
 * @param {Object} image
 * @param {string} image.name
 * @param {string} image.publicPath
 * @param {string} [image.relativePath]
 * @param {string} [image.sizeLabel]
 * @param {string} [image.section]
 * @param {number} [image.bytes]
 */
export function openImageLightbox(image) {
  if (!image || !image.publicPath) return

  let modal = document.querySelector('#image-lightbox-modal')
  if (!modal) {
    modal = createImageLightboxModalElement()
    document.body.appendChild(modal)
  }

  const titleEl = modal.querySelector('#image-lightbox-title') || modal.querySelector('.image-lightbox-title')
  const imgEl = modal.querySelector('#image-lightbox-img') || modal.querySelector('.image-lightbox-img')
  const dimensionEl = modal.querySelector('#image-lightbox-dimension') || modal.querySelector('.image-lightbox-dimension')
  const sizeEl = modal.querySelector('#image-lightbox-size') || modal.querySelector('.image-lightbox-size')
  const sectionEl = modal.querySelector('#image-lightbox-section') || modal.querySelector('.image-lightbox-section')
  const pathEl = modal.querySelector('#image-lightbox-path') || modal.querySelector('.image-lightbox-path')
  const copyBtn = modal.querySelector('#image-lightbox-copy') || modal.querySelector('.btn-copy-path')
  const closeBtn = modal.querySelector('#image-lightbox-close') || modal.querySelector('.btn-close-lightbox')

  if (titleEl) {
    titleEl.textContent = image.name || 'Image Preview'
  }

  if (sizeEl) {
    sizeEl.textContent = image.sizeLabel ? `Size: ${image.sizeLabel}` : ''
  }

  if (sectionEl) {
    sectionEl.textContent = image.section ? `Section: ${image.section}` : ''
  }

  if (pathEl) {
    pathEl.textContent = image.publicPath
  }

  if (dimensionEl) {
    dimensionEl.textContent = 'Calculating dimensions...'
  }

  if (imgEl) {
    imgEl.src = ''
    imgEl.alt = image.name || 'Full-resolution image preview'

    imgEl.onload = () => {
      if (dimensionEl && imgEl.naturalWidth && imgEl.naturalHeight) {
        dimensionEl.textContent = `${imgEl.naturalWidth} × ${imgEl.naturalHeight} px`
      }
    }

    imgEl.onerror = () => {
      if (dimensionEl) {
        dimensionEl.textContent = 'Unable to load image preview'
      }
    }

    imgEl.src = image.publicPath

    // If cached and already loaded
    if (imgEl.complete && imgEl.naturalWidth) {
      if (dimensionEl) {
        dimensionEl.textContent = `${imgEl.naturalWidth} × ${imgEl.naturalHeight} px`
      }
    }
  }

  let copyTimeout = null
  if (copyBtn) {
    copyBtn.textContent = 'Copy Path'
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(image.publicPath)
        copyBtn.textContent = 'Copied!'
        clearTimeout(copyTimeout)
        copyTimeout = setTimeout(() => {
          copyBtn.textContent = 'Copy Path'
        }, 2000)
      } catch {
        copyBtn.textContent = 'Failed to copy'
      }
    }
  }

  function closeModal() {
    clearTimeout(copyTimeout)
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

  if (closeBtn) {
    closeBtn.onclick = closeModal
  }

  modal.onclick = (event) => {
    if (event.target === modal || event.target.dataset?.closeLightbox !== undefined) {
      closeModal()
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
}

function createImageLightboxModalElement() {
  const dialog = document.createElement('dialog')
  dialog.id = 'image-lightbox-modal'
  dialog.className = 'modal image-lightbox-modal'
  dialog.setAttribute('aria-labelledby', 'image-lightbox-title')
  dialog.hidden = true

  dialog.innerHTML = `
    <div class="image-lightbox-content">
      <div class="image-lightbox-header">
        <h3 id="image-lightbox-title" class="image-lightbox-title">Image Preview</h3>
        <button type="button" class="btn-close-lightbox" id="image-lightbox-close" aria-label="Close lightbox">✕</button>
      </div>
      <div class="image-lightbox-view">
        <img id="image-lightbox-img" class="image-lightbox-img" src="" alt="Full preview" />
      </div>
      <div id="image-lightbox-meta" class="image-lightbox-meta">
        <div class="image-lightbox-details">
          <span class="image-lightbox-dimension" id="image-lightbox-dimension">Loading...</span>
          <span class="image-lightbox-size" id="image-lightbox-size"></span>
          <span class="image-lightbox-section" id="image-lightbox-section"></span>
          <code class="image-lightbox-path" id="image-lightbox-path"></code>
        </div>
        <div class="image-lightbox-actions">
          <button type="button" class="btn-copy-path" id="image-lightbox-copy">Copy Path</button>
        </div>
      </div>
    </div>
  `
  return dialog
}

/**
 * Renders the images library with click-to-lightbox support.
 */
export function renderImagesLibrary(options) {
  baseRenderImagesLibrary({
    ...options,
    onPreviewImage: openImageLightbox,
  })
}
