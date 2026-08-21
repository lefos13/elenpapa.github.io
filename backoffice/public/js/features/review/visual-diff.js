/**
 * Why this exists:
 * Rich visual diff viewer gives content editors a clear, human-friendly comparison
 * of modified fields, uploaded images, and formatted raw git changes before finalizing
 * a review branch.
 */

import { isManagedImagePublicPath } from '../../utils.js'

/**
 * Escapes HTML characters to prevent XSS.
 * @param {any} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Formats a byte number to human-readable size.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Estimates byte size from a base64 payload.
 * @param {string} base64
 * @returns {number}
 */
function estimateBase64Bytes(base64) {
  if (!base64 || typeof base64 !== 'string') return 0
  return Math.round((base64.length * 3) / 4)
}

/**
 * Maps common image file extensions to their MIME type.
 * @param {string} filePath
 * @returns {string}
 */
function getMimeType(filePath) {
  const ext = String(filePath || '').split('.').pop()?.toLowerCase()
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    jfif: 'image/jpeg',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    gif: 'image/gif',
  }
  return map[ext] || 'image/png'
}

/**
 * Normalizes semantic changes into a Map of filePath -> entry[].
 * @param {Map<string, any[]> | Record<string, any[]> | any[]} semanticChanges
 * @returns {Map<string, any[]>}
 */
function normalizeSemanticChanges(semanticChanges) {
  const normalized = new Map()

  if (semanticChanges instanceof Map) {
    semanticChanges.forEach((entries, filePath) => {
      if (Array.isArray(entries) && entries.length > 0) {
        normalized.set(filePath, [...entries])
      }
    })
    return normalized
  }

  if (Array.isArray(semanticChanges)) {
    semanticChanges.forEach((entry) => {
      if (!entry) return
      const filePath = entry.filePath || 'content.json'
      if (!normalized.has(filePath)) normalized.set(filePath, [])
      normalized.get(filePath).push(entry)
    })
    return normalized
  }

  if (semanticChanges && typeof semanticChanges === 'object') {
    Object.entries(semanticChanges).forEach(([filePath, entries]) => {
      if (Array.isArray(entries) && entries.length > 0) {
        normalized.set(filePath, [...entries])
      }
    })
  }

  return normalized
}

/**
 * Extracts and consolidates all image modifications from session changes and semantic entries.
 * @param {{ sessionChanges?: any, semanticMap?: Map<string, any[]> }} param0
 * @returns {any[]}
 */
function extractImageChanges({ sessionChanges, semanticMap }) {
  const imageChanges = []
  const seenPaths = new Set()

  // 1. Process staged image uploads from sessionChanges.uploadsByPublicPath
  if (sessionChanges?.uploadsByPublicPath) {
    const uploads =
      sessionChanges.uploadsByPublicPath instanceof Map
        ? Array.from(sessionChanges.uploadsByPublicPath.entries())
        : Object.entries(sessionChanges.uploadsByPublicPath)

    uploads.forEach(([publicPath, upload]) => {
      if (seenPaths.has(publicPath)) return
      seenPaths.add(publicPath)

      const variants = Array.isArray(upload.variants) ? upload.variants : []
      const primaryVariant =
        variants.find((variant) => variant.publicPath === publicPath) || variants[0]

      const mime = getMimeType(publicPath)
      const newPreview = primaryVariant?.bufferBase64
        ? `data:${mime};base64,${primaryVariant.bufferBase64}`
        : publicPath

      const estimatedBytes = primaryVariant?.size || estimateBase64Bytes(primaryVariant?.bufferBase64)
      const sizeLabel = estimatedBytes ? formatBytes(estimatedBytes) : ''

      const dimensionLabel =
        primaryVariant?.width && primaryVariant?.height
          ? `${primaryVariant.width}×${primaryVariant.height}`
          : ''

      const metaParts = [dimensionLabel, sizeLabel].filter(Boolean)
      if (variants.length > 1) {
        metaParts.push(`${variants.length} formats`)
      }

      imageChanges.push({
        type: 'addition',
        path: publicPath,
        newSrc: newPreview,
        newMeta: metaParts.join(' · '),
        oldSrc: null,
        oldMeta: null,
      })
    })
  }

  // 2. Process field-level image modifications from semantic changes
  if (semanticMap) {
    semanticMap.forEach((entries, filePath) => {
      entries.forEach((entry) => {
        const isBeforeImage = isManagedImagePublicPath(entry.before)
        const isAfterImage = isManagedImagePublicPath(entry.after)

        if (!isBeforeImage && !isAfterImage) return

        if (isBeforeImage && isAfterImage && entry.before !== entry.after) {
          // Image replacement
          const existing = imageChanges.find((item) => item.path === entry.after)
          if (existing) {
            existing.type = 'replacement'
            existing.oldSrc = entry.before
            existing.fieldInfo = `${filePath} → ${entry.path || 'root'}`
          } else {
            imageChanges.push({
              type: 'replacement',
              path: entry.after,
              oldSrc: entry.before,
              oldMeta: entry.before,
              newSrc: entry.after,
              newMeta: entry.after,
              fieldInfo: `${filePath} → ${entry.path || 'root'}`,
            })
            seenPaths.add(entry.after)
          }
        } else if (isAfterImage && !isBeforeImage) {
          // Image added in field
          if (!seenPaths.has(entry.after)) {
            seenPaths.add(entry.after)
            imageChanges.push({
              type: 'addition',
              path: entry.after,
              newSrc: entry.after,
              newMeta: '',
              oldSrc: null,
              oldMeta: null,
              fieldInfo: `${filePath} → ${entry.path || 'root'}`,
            })
          }
        } else if (isBeforeImage && !isAfterImage) {
          // Image removed in field
          if (!seenPaths.has(entry.before)) {
            seenPaths.add(entry.before)
            imageChanges.push({
              type: 'deletion',
              path: entry.before,
              oldSrc: entry.before,
              oldMeta: 'Removed from content',
              newSrc: null,
              newMeta: null,
              fieldInfo: `${filePath} → ${entry.path || 'root'}`,
            })
          }
        }
      })
    })
  }

  // 3. Process deleted assets from sessionChanges.deletedAssetPaths
  if (sessionChanges?.deletedAssetPaths) {
    const deletedList =
      sessionChanges.deletedAssetPaths instanceof Set
        ? Array.from(sessionChanges.deletedAssetPaths)
        : Array.isArray(sessionChanges.deletedAssetPaths)
          ? sessionChanges.deletedAssetPaths
          : []

    deletedList.forEach((repoPath) => {
      const publicPath = repoPath.startsWith('public/') ? repoPath.slice(6) : repoPath
      if (seenPaths.has(publicPath)) return
      seenPaths.add(publicPath)

      imageChanges.push({
        type: 'deletion',
        path: publicPath,
        oldSrc: publicPath,
        oldMeta: 'Asset marked for deletion',
        newSrc: null,
        newMeta: null,
      })
    })
  }

  return imageChanges
}

/**
 * Returns badge label and modifier class for a semantic diff entry.
 * @param {{ label?: string, before?: any, after?: any }} entry
 * @returns {{ badgeText: string, badgeClass: string }}
 */
function getChangeBadge(entry) {
  const label = String(entry.label || '').toLowerCase()
  const hasBefore = entry.before !== '' && entry.before !== null && entry.before !== undefined
  const hasAfter = entry.after !== '' && entry.after !== null && entry.after !== undefined

  if (label.includes('added') || (!hasBefore && hasAfter)) {
    return { badgeText: 'Added', badgeClass: 'diff-badge-added' }
  }
  if (label.includes('removed') || label.includes('deleted') || (hasBefore && !hasAfter)) {
    return { badgeText: 'Deleted', badgeClass: 'diff-badge-deleted' }
  }
  if (label.includes('type')) {
    return { badgeText: 'Type Changed', badgeClass: 'diff-badge-type' }
  }
  if (label.includes('size')) {
    return { badgeText: 'List Resized', badgeClass: 'diff-badge-modified' }
  }
  return { badgeText: 'Modified', badgeClass: 'diff-badge-modified' }
}

/**
 * Renders syntax-highlighted git diff lines.
 * @param {string} rawDiffText
 * @returns {string}
 */
function renderGitDiffLines(rawDiffText) {
  if (!rawDiffText || !rawDiffText.trim()) {
    return '<div class="diff-line diff-line-context">No unstaged diff output available.</div>'
  }

  const lines = rawDiffText.split('\n')
  return lines
    .map((line) => {
      const escaped = escapeHtml(line)
      if (line.startsWith('+++') || line.startsWith('---')) {
        return `<div class="diff-line diff-line-meta">${escaped}</div>`
      }
      if (line.startsWith('+')) {
        return `<div class="diff-line diff-line-add"><span class="diff-line-marker">+</span><span class="diff-line-text">${escapeHtml(line.slice(1))}</span></div>`
      }
      if (line.startsWith('-')) {
        return `<div class="diff-line diff-line-del"><span class="diff-line-marker">-</span><span class="diff-line-text">${escapeHtml(line.slice(1))}</span></div>`
      }
      if (line.startsWith('@@')) {
        return `<div class="diff-line diff-line-chunk">${escaped}</div>`
      }
      if (
        line.startsWith('diff ') ||
        line.startsWith('index ') ||
        line.startsWith('new file') ||
        line.startsWith('deleted file')
      ) {
        return `<div class="diff-line diff-line-meta">${escaped}</div>`
      }
      return `<div class="diff-line diff-line-context">${escaped}</div>`
    })
    .join('')
}

/**
 * Renders the Visual Diff Viewer component into the specified container.
 *
 * @param {object} params
 * @param {HTMLElement} params.container - DOM element to render into
 * @param {Map<string, any[]> | Record<string, any[]> | any[]} params.semanticChanges - Content field changes
 * @param {string | object} params.rawDiff - Raw git diff string or preview object
 * @param {object} [params.sessionChanges] - Staged session uploads and deleted assets
 * @param {(tabKey: string) => void} [params.onOpenDiffTab] - Callback when active tab changes
 */
export function renderVisualDiffViewer({
  container,
  semanticChanges,
  rawDiff,
  sessionChanges,
  onOpenDiffTab,
}) {
  if (!container) return

  // 1. Prepare data
  const semanticMap = normalizeSemanticChanges(semanticChanges)
  let totalVisualChanges = 0
  semanticMap.forEach((entries) => {
    totalVisualChanges += entries.length
  })

  const imageChanges = extractImageChanges({ sessionChanges, semanticMap })
  const imageCount = imageChanges.length

  let rawDiffText = ''
  let diffFileCount = 0
  if (typeof rawDiff === 'string') {
    rawDiffText = rawDiff
  } else if (rawDiff && typeof rawDiff === 'object') {
    rawDiffText = rawDiff.summary || ''
    if (Array.isArray(rawDiff.entries)) {
      diffFileCount = rawDiff.entries.length
      if (!rawDiffText && diffFileCount > 0) {
        rawDiffText = rawDiff.entries.map((e) => `${e.code} ${e.path}`).join('\n')
      }
    }
  }

  // 2. Build HTML Markup
  const visualCountLabel = totalVisualChanges > 0 ? totalVisualChanges : semanticMap.size
  const visualTabBadge = visualCountLabel > 0 ? ` (${visualCountLabel})` : ' (0)'
  const imageTabBadge = imageCount > 0 ? ` (${imageCount})` : ' (0)'

  container.innerHTML = `
    <div class="diff-viewer">
      <div class="diff-tabs" role="tablist" aria-label="Review diff tabs">
        <button
          type="button"
          role="tab"
          class="diff-tab-btn is-active"
          data-tab="visual"
          aria-selected="true"
          aria-controls="diff-panel-visual"
          id="diff-tab-btn-visual"
        >
          <span class="diff-tab-icon">📝</span>
          <span class="diff-tab-title">Visual Changes</span>
          <span class="diff-tab-count">${visualTabBadge}</span>
        </button>
        <button
          type="button"
          role="tab"
          class="diff-tab-btn"
          data-tab="images"
          aria-selected="false"
          aria-controls="diff-panel-images"
          id="diff-tab-btn-images"
        >
          <span class="diff-tab-icon">🖼️</span>
          <span class="diff-tab-title">Image Changes</span>
          <span class="diff-tab-count">${imageTabBadge}</span>
        </button>
        <button
          type="button"
          role="tab"
          class="diff-tab-btn"
          data-tab="raw"
          aria-selected="false"
          aria-controls="diff-panel-raw"
          id="diff-tab-btn-raw"
        >
          <span class="diff-tab-icon">💻</span>
          <span class="diff-tab-title">Raw Git Diff</span>
        </button>
      </div>

      <div class="diff-tab-content">
        <!-- Visual Changes Tab Panel -->
        <div
          id="diff-panel-visual"
          class="diff-tab-panel is-active"
          data-tab-panel="visual"
          role="tabpanel"
          aria-labelledby="diff-tab-btn-visual"
        >
          ${renderVisualChangesTab(semanticMap)}
        </div>

        <!-- Image Changes Tab Panel -->
        <div
          id="diff-panel-images"
          class="diff-tab-panel"
          data-tab-panel="images"
          role="tabpanel"
          aria-labelledby="diff-tab-btn-images"
          hidden
        >
          ${renderImageChangesTab(imageChanges)}
        </div>

        <!-- Raw Git Diff Tab Panel -->
        <div
          id="diff-panel-raw"
          class="diff-tab-panel"
          data-tab-panel="raw"
          role="tabpanel"
          aria-labelledby="diff-tab-btn-raw"
          hidden
        >
          <div class="diff-raw-toolbar">
            <span class="diff-raw-info">
              ${diffFileCount > 0 ? `<strong>${diffFileCount}</strong> file${diffFileCount === 1 ? '' : 's'} staged for review` : 'Git diff inspection'}
            </span>
            <button type="button" class="diff-copy-btn btn-copy-raw-diff" aria-label="Copy raw diff to clipboard">
              <span class="diff-copy-icon">📋</span>
              <span class="diff-copy-text">Copy raw diff</span>
            </button>
          </div>
          <pre class="diff-raw-pre modal-summary"><code>${renderGitDiffLines(rawDiffText)}</code></pre>
        </div>
      </div>
    </div>
  `

  // 3. Tab switching interactivity
  const tabButtons = container.querySelectorAll('.diff-tab-btn')
  const tabPanels = container.querySelectorAll('.diff-tab-panel')

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab')
      if (!targetTab) return

      tabButtons.forEach((otherBtn) => {
        const isActive = otherBtn === btn
        otherBtn.classList.toggle('is-active', isActive)
        otherBtn.setAttribute('aria-selected', isActive ? 'true' : 'false')
      })

      tabPanels.forEach((panel) => {
        const isTarget = panel.getAttribute('data-tab-panel') === targetTab
        panel.classList.toggle('is-active', isTarget)
        panel.hidden = !isTarget
      })

      if (typeof onOpenDiffTab === 'function') {
        onOpenDiffTab(targetTab)
      }
    })
  })

  // 4. Copy raw diff button interactivity
  const copyBtn = container.querySelector('.diff-copy-btn')
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(rawDiffText)
        const textSpan = copyBtn.querySelector('.diff-copy-text')
        const iconSpan = copyBtn.querySelector('.diff-copy-icon')
        if (textSpan) textSpan.textContent = 'Copied!'
        if (iconSpan) iconSpan.textContent = '✓'
        copyBtn.classList.add('is-copied')

        setTimeout(() => {
          if (textSpan) textSpan.textContent = 'Copy raw diff'
          if (iconSpan) iconSpan.textContent = '📋'
          copyBtn.classList.remove('is-copied')
        }, 2000)
      } catch (err) {
        console.warn('Clipboard copy failed:', err)
      }
    })
  }
}

/**
 * Renders the Visual Changes tab content.
 * @param {Map<string, any[]>} semanticMap
 * @returns {string}
 */
function renderVisualChangesTab(semanticMap) {
  if (semanticMap.size === 0) {
    return `
      <div class="diff-empty-state">
        <span class="diff-empty-icon">📝</span>
        <p class="diff-empty-title">No visual content changes in this session.</p>
        <p class="diff-empty-desc">Any content fields you edit and save will appear here as side-by-side comparisons.</p>
      </div>
    `
  }

  const cardsHtml = Array.from(semanticMap.entries())
    .map(([filePath, entries]) => {
      const changeCount = entries.length
      const rowsHtml = entries
        .map((entry) => {
          const { badgeText, badgeClass } = getChangeBadge(entry)
          const hasBefore = entry.before !== '' && entry.before !== null && entry.before !== undefined
          const hasAfter = entry.after !== '' && entry.after !== null && entry.after !== undefined

          let compareHtml = ''
          if (hasBefore && hasAfter) {
            compareHtml = `
              <div class="diff-val-col diff-val-col-old">
                <span class="diff-val-tag">Before:</span>
                <div class="diff-val-old diff-old-val">${escapeHtml(entry.before)}</div>
              </div>
              <div class="diff-val-arrow" aria-hidden="true">➔</div>
              <div class="diff-val-col diff-val-col-new">
                <span class="diff-val-tag">After:</span>
                <div class="diff-val-new diff-new-val">${escapeHtml(entry.after)}</div>
              </div>
            `
          } else if (hasAfter && !hasBefore) {
            compareHtml = `
              <div class="diff-val-col diff-val-col-new diff-val-col-single">
                <span class="diff-val-tag">Added:</span>
                <div class="diff-val-new diff-new-val">${escapeHtml(entry.after)}</div>
              </div>
            `
          } else if (hasBefore && !hasAfter) {
            compareHtml = `
              <div class="diff-val-col diff-val-col-old diff-val-col-single">
                <span class="diff-val-tag">Removed:</span>
                <div class="diff-val-old diff-old-val">${escapeHtml(entry.before)}</div>
              </div>
            `
          } else {
            compareHtml = `
              <div class="diff-val-col diff-val-col-single">
                <div class="diff-val-empty">Value updated</div>
              </div>
            `
          }

          return `
            <div class="diff-field-row">
              <div class="diff-field-header">
                <span class="diff-field-path"><code>${escapeHtml(entry.path || '(root)')}</code></span>
                <span class="diff-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
                ${entry.label && entry.label !== badgeText ? `<span class="diff-field-label">${escapeHtml(entry.label)}</span>` : ''}
              </div>
              <div class="diff-values-compare">
                ${compareHtml}
              </div>
            </div>
          `
        })
        .join('')

      return `
        <div class="diff-card">
          <div class="diff-card-header">
            <div class="diff-card-file">
              <span class="diff-card-icon">📄</span>
              <strong class="diff-card-filename">${escapeHtml(filePath)}</strong>
            </div>
            <span class="diff-card-badge">${changeCount} field change${changeCount === 1 ? '' : 's'}</span>
          </div>
          <div class="diff-card-body">
            ${rowsHtml}
          </div>
        </div>
      `
    })
    .join('')

  return `<div class="diff-cards-grid">${cardsHtml}</div>`
}

/**
 * Renders the Image Changes tab content.
 * @param {any[]} imageChanges
 * @returns {string}
 */
function renderImageChangesTab(imageChanges) {
  if (imageChanges.length === 0) {
    return `
      <div class="diff-empty-state">
        <span class="diff-empty-icon">🖼️</span>
        <p class="diff-empty-title">No image modifications in this session.</p>
        <p class="diff-empty-desc">Uploaded, replaced, or removed media assets will appear here with side-by-side previews.</p>
      </div>
    `
  }

  const cardsHtml = imageChanges
    .map((change) => {
      let badgeClass = 'diff-badge-added'
      let badgeText = 'Added'
      if (change.type === 'replacement') {
        badgeClass = 'diff-badge-modified'
        badgeText = 'Replaced'
      } else if (change.type === 'deletion') {
        badgeClass = 'diff-badge-deleted'
        badgeText = 'Deleted'
      }

      let bodyHtml = ''
      if (change.type === 'replacement') {
        bodyHtml = `
          <div class="diff-image-compare">
            <div class="diff-image-box diff-image-box-old">
              <span class="diff-image-box-label">Original Asset</span>
              <div class="diff-image-preview-wrapper">
                <img
                  src="${escapeHtml(change.oldSrc)}"
                  alt="Original Asset"
                  loading="lazy"
                  onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                />
                <div class="diff-image-fallback" style="display:none;"><span>Image Preview</span></div>
              </div>
              ${change.oldMeta ? `<span class="diff-image-meta">${escapeHtml(change.oldMeta)}</span>` : ''}
            </div>

            <div class="diff-image-arrow" aria-hidden="true">➔</div>

            <div class="diff-image-box diff-image-box-new">
              <span class="diff-image-box-label">Replacement (Staged)</span>
              <div class="diff-image-preview-wrapper">
                <img
                  src="${escapeHtml(change.newSrc)}"
                  alt="Replacement Asset"
                  loading="lazy"
                  onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                />
                <div class="diff-image-fallback" style="display:none;"><span>Image Preview</span></div>
              </div>
              ${change.newMeta ? `<span class="diff-image-meta">${escapeHtml(change.newMeta)}</span>` : ''}
            </div>
          </div>
        `
      } else if (change.type === 'addition') {
        bodyHtml = `
          <div class="diff-image-compare diff-image-compare-single">
            <div class="diff-image-box diff-image-box-new">
              <span class="diff-image-box-label">New Upload (Staged)</span>
              <div class="diff-image-preview-wrapper">
                <img
                  src="${escapeHtml(change.newSrc)}"
                  alt="New Upload"
                  loading="lazy"
                  onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                />
                <div class="diff-image-fallback" style="display:none;"><span>Image Preview</span></div>
              </div>
              ${change.newMeta ? `<span class="diff-image-meta">${escapeHtml(change.newMeta)}</span>` : ''}
            </div>
          </div>
        `
      } else if (change.type === 'deletion') {
        bodyHtml = `
          <div class="diff-image-compare diff-image-compare-single">
            <div class="diff-image-box diff-image-box-old diff-image-box-deleted">
              <span class="diff-image-box-label">Marked for Deletion</span>
              <div class="diff-image-preview-wrapper diff-image-deleted-wrapper">
                <img
                  src="${escapeHtml(change.oldSrc)}"
                  alt="Deleted Asset"
                  loading="lazy"
                  onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                />
                <div class="diff-image-fallback" style="display:none;"><span>Deleted Asset</span></div>
              </div>
              ${change.oldMeta ? `<span class="diff-image-meta">${escapeHtml(change.oldMeta)}</span>` : ''}
            </div>
          </div>
        `
      }

      return `
        <div class="diff-card diff-image-card">
          <div class="diff-card-header">
            <div class="diff-card-file">
              <span class="diff-badge ${badgeClass}">${badgeText}</span>
              <code class="diff-image-dest-path">${escapeHtml(change.path)}</code>
            </div>
            ${change.fieldInfo ? `<span class="diff-image-field-info">${escapeHtml(change.fieldInfo)}</span>` : ''}
          </div>
          <div class="diff-card-body">
            ${bodyHtml}
          </div>
        </div>
      `
    })
    .join('')

  return `<div class="diff-cards-grid diff-image-cards-grid">${cardsHtml}</div>`
}
