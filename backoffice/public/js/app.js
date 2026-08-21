/**
 * Why this exists:
 * This controller coordinates guided/advanced editing modes, API contracts,
 * draft recovery, and review workflow in a single orchestration layer.
 */
import {
  fetchAuthSession,
  fetchFileContent,
  fetchFiles,
  fetchGitPreview,
  fetchGitStatus,
  fetchImages,
  fetchSchema,
  fetchSessionSummary,
  finalizeGitReview,
  loginAdmin,
  logoutAdmin,
  saveFileContent,
  uploadImageAsset,
  validateFileContent,
} from './api.js'
import {
  FILE_CATEGORIES,
  FILE_USAGE_REFERENCES,
  getCategoryForFile,
  getFileUsageLabel,
} from './constants.js'
import { bindShortcuts } from './app/shortcuts.js'
import { saveDraft, loadDraft, clearDraft } from './app/draft-recovery.js'
import { createToastController } from './app/toasts.js'
import { buildLocalSemanticSummary } from './app/semantic-summary.js'
import {
  buildSessionFinalizePayload,
  clearSessionChanges,
  createSessionChanges,
  registerPendingUpload,
  resolveSessionContent,
  stageContentChange,
} from './app/session-changes.js'
import { UiStatusState, getStatusView } from './app/ui-status.js'
import { initTheme, setTheme } from './app/theme.js'
import { createCommandPalette } from './app/command-palette.js'
import { createState, isSectionCollapsed, setSectionCollapsed } from './state.js'
import { areValuesEqual, cloneValue, toRepoPathFromPublicImagePath } from './utils.js'
import { renderContentEditor } from './views/content-editor.js'
import { renderGuidedContentEditor } from './features/content/guided-editor.js'
import { renderImagesLibrary } from './features/images/library.js'
import { renderVisualDiffViewer } from './features/review/visual-diff.js'

export function createBackofficeApp(elements) {
  const state = createState()
  const sessionChanges = createSessionChanges()
  const toasts = createToastController(elements.toastRoot)
  let imageSearchDebounceTimer = null
  let draftPersistTimer = null
  let reviewCanFinalize = false
  const gitBusyByAction = new Map()

  const commandPalette = createCommandPalette({
    modal: elements.commandPaletteModal,
    input: elements.commandPaletteInput,
    list: elements.commandPaletteList,
    getCommands: () => {
      const commands = []

      state.files.forEach((file) => {
        commands.push({
          id: `file:${file}`,
          title: `Open ${file}`,
          category: 'Files',
          subtitle: getFileUsageLabel(file),
          keywords: [file, getFileUsageLabel(file), getCategoryForFile(file)],
          action: () => openFile(file),
        })
      })

      commands.push({
        id: 'action:save',
        title: 'Save Active File',
        category: 'Actions',
        subtitle: state.activeFile ? `Save changes to ${state.activeFile}` : 'No active file',
        shortcut: '⌘S',
        keywords: ['save', 'persist', 'write'],
        action: async () => {
          if (!elements.saveFile.disabled) {
            elements.saveFile.click()
          }
        },
      })

      commands.push({
        id: 'action:review',
        title: 'Review & Finalize Changes',
        category: 'Actions',
        subtitle: 'Preview changes and create review branch',
        keywords: ['review', 'finalize', 'git', 'publish', 'branch', 'pr'],
        action: async () => {
          if (!elements.openReviewFlow.disabled) {
            elements.openReviewFlow.click()
          }
        },
      })

      commands.push({
        id: 'action:reload',
        title: 'Reload Active File',
        category: 'Actions',
        subtitle: 'Discard unsaved changes and reload from disk',
        shortcut: '⌘R',
        keywords: ['reload', 'revert', 'reset'],
        action: async () => {
          if (!elements.reloadFile.disabled) {
            elements.reloadFile.click()
          }
        },
      })

      commands.push({
        id: 'action:refresh-files',
        title: 'Refresh Files List',
        category: 'Actions',
        keywords: ['refresh', 'files'],
        action: () => elements.refreshFiles.click(),
      })

      commands.push({
        id: 'action:refresh-git',
        title: 'Refresh Git Status',
        category: 'Actions',
        keywords: ['git', 'status', 'fetch', 'pull'],
        action: () => elements.refreshGitStatus.click(),
      })

      commands.push({
        id: 'view:content',
        title: 'View Content Files',
        category: 'Views & Modes',
        keywords: ['content', 'json', 'editor'],
        action: () => elements.modeContent.click(),
      })

      commands.push({
        id: 'view:images',
        title: 'View Media Library',
        category: 'Views & Modes',
        keywords: ['images', 'media', 'library', 'assets', 'photos'],
        action: () => elements.modeImages.click(),
      })

      commands.push({
        id: 'mode:guided',
        title: 'Switch to Guided Mode',
        category: 'Views & Modes',
        keywords: ['guided', 'form', 'simple'],
        action: () => elements.editorModeGuided.click(),
      })

      commands.push({
        id: 'mode:advanced',
        title: 'Switch to Advanced (JSON Tree) Mode',
        category: 'Views & Modes',
        keywords: ['advanced', 'json', 'tree', 'raw'],
        action: () => elements.editorModeJson.click(),
      })

      commands.push({
        id: 'theme:light',
        title: 'Theme: Light',
        category: 'Appearance',
        keywords: ['theme', 'light', 'white'],
        action: () => setTheme('light'),
      })

      commands.push({
        id: 'theme:dark',
        title: 'Theme: Dark',
        category: 'Appearance',
        keywords: ['theme', 'dark', 'night', 'black'],
        action: () => setTheme('dark'),
      })

      commands.push({
        id: 'theme:system',
        title: 'Theme: System Default',
        category: 'Appearance',
        keywords: ['theme', 'system', 'auto'],
        action: () => setTheme('system'),
      })

      return commands
    },
  })
  const DEFAULT_BUTTON_LABELS = {
    refresh: 'Refresh git',
    preview: 'Create Review Branch',
    finalize: 'Finalize & Push',
  }

  const SIDEBAR_COLLAPSED_KEY = 'backoffice:sidebar-collapsed'

  function isFileDirty(filePath) {
    if (filePath === state.activeFile && state.dirty) return true
    if (sessionChanges?.contentByFile?.has(filePath)) return true
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.startsWith(`backoffice:draft:${filePath}:`)) return true
    }
    return false
  }

  function initSidebarCollapse() {
    const isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
    const layoutEl = document.querySelector('.layout')
    if (layoutEl && isCollapsed) {
      layoutEl.classList.add('sidebar-collapsed')
    }
  }

  function toggleSidebarCollapse() {
    const layoutEl = document.querySelector('.layout')
    if (!layoutEl) return
    const isCollapsed = layoutEl.classList.toggle('sidebar-collapsed')
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed))
  }
  function normalizeStatusMode(mode) {
    if (!mode) return UiStatusState.READY
    if (mode === 'dirty') return UiStatusState.UNSAVED
    if (mode === 'ok') return UiStatusState.SYNCED
    if (mode === 'error') return UiStatusState.ERROR
    if (Object.values(UiStatusState).includes(mode)) return mode
    return UiStatusState.READY
  }

  function setUiStatus(nextState, message) {
    const stateKey = nextState || UiStatusState.READY
    const view = getStatusView(stateKey)

    if (elements.statusText) {
      elements.statusText.textContent = message || view.label
      elements.statusText.className = `status-${stateKey}`
    }
    if (elements.statusStrip) {
      elements.statusStrip.dataset.status = stateKey
    }
    if (elements.statusIcon) {
      elements.statusIcon.textContent = view.icon
    }
    if (elements.statusLabel) {
      elements.statusLabel.textContent = message || view.label
      elements.statusLabel.title = message || view.label
    }
  }

  function setGitBusy(nextBusy, action = 'general') {
    const current = gitBusyByAction.get(action) ?? 0
    if (nextBusy) {
      gitBusyByAction.set(action, current + 1)
    } else if (current <= 1) {
      gitBusyByAction.delete(action)
    } else {
      gitBusyByAction.set(action, current - 1)
    }
    state.gitBusy = Array.from(gitBusyByAction.values()).some((count) => count > 0)
    syncToolbarState()
  }

  function isGitActionBusy(action) {
    return (gitBusyByAction.get(action) ?? 0) > 0
  }

  async function runGitTask(action, task) {
    setGitBusy(true, action)
    try {
      return await task()
    } finally {
      setGitBusy(false, action)
    }
  }

  function formatGitStatusCompact(status) {
    if (!status) return 'Git: offline'
    const branch = status.currentBranch || 'main'
    const changeCount = status.changeCount || 0
    if (changeCount > 0) {
      return `${branch} · ${changeCount} change${changeCount === 1 ? '' : 's'}`
    }
    if (status.mainAhead) {
      return `${branch} · ${status.mainAhead} ahead`
    }
    return `${branch} · clean`
  }

  function formatGitStatusDetailed(status) {
    if (!status) return 'Repository status unavailable.'

    const syncLabelByAction = {
      blocked: 'Production updates available (manual sync needed)',
      error: 'Could not check production updates',
      pulled: 'Latest production updates were applied',
      'up-to-date': 'Up to date with production',
    }

    const syncAction = status.sync?.action ?? 'error'
    const syncLabel = syncLabelByAction[syncAction] || 'Status unknown'
    const changesLabel = status.changeCount
      ? `Current changes: ${status.changeCount}`
      : 'Current changes: none'
    const deployLabel = status.mainAhead
      ? `Commits ready for production: ${status.mainAhead}`
      : 'Commits ready for production: none'
    const branchLabel = `Editing branch: ${status.currentBranch}`

    return [branchLabel, syncLabel, changesLabel, deployLabel].join(' | ')
  }

  function renderGitStatus() {
    if (elements.gitStatusText) {
      elements.gitStatusText.textContent = formatGitStatusCompact(state.gitStatus)
      elements.gitStatusText.title = formatGitStatusDetailed(state.gitStatus)
    }
    if (elements.gitStatusPill) {
      elements.gitStatusPill.title = formatGitStatusDetailed(state.gitStatus)
    }
    if (elements.openReviewFlow) {
      const changeCount = state.gitStatus?.changeCount || 0
      elements.openReviewFlow.textContent =
        changeCount > 0 ? `Review (${changeCount})` : 'Publish / Review'
    }
  }

  function markSessionPath(repoPath) {
    if (!repoPath || typeof repoPath !== 'string') return
    const normalized = repoPath.replace(/\\/g, '/')
    if (!normalized.startsWith('public/')) return
    state.sessionTouchedPaths.add(normalized)
    state.hasSessionChanges = true
  }

  function seedSessionPathsFromGitStatus(status) {
    if (!status || !Array.isArray(status.changes)) return
    status.changes.forEach((entry) => {
      if (!entry || typeof entry.path !== 'string') return
      markSessionPath(entry.path)
    })
  }

  function openModal(modal) {
    modal.hidden = false
    document.body.classList.add('modal-open')
  }

  function closeModal(modal) {
    modal.hidden = true
    const isLoginOpen =
      elements.loginModal && (elements.loginModal.open || !elements.loginModal.hidden)
    if (elements.reviewModal.hidden && elements.successModal.hidden && !isLoginOpen) {
      document.body.classList.remove('modal-open')
    }
  }

  function setSessionUser(user) {
    if (elements.sessionUser) {
      elements.sessionUser.hidden = !user
    }
    if (elements.sessionUsername) {
      elements.sessionUsername.textContent = user || 'Admin'
    }
    const initial = user ? String(user).charAt(0).toUpperCase() : 'A'
    if (elements.settingsUserAvatar) {
      elements.settingsUserAvatar.textContent = initial
    }
    if (elements.settingsUserAvatarLg) {
      elements.settingsUserAvatarLg.textContent = initial
    }
  }

  function showLoginModal(errorMessage = '') {
    if (elements.loginError) {
      if (errorMessage) {
        elements.loginError.textContent = errorMessage
        elements.loginError.hidden = false
      } else {
        elements.loginError.textContent = ''
        elements.loginError.hidden = true
      }
    }
    if (elements.loginPassword) {
      elements.loginPassword.value = ''
    }
    if (elements.loginModal) {
      elements.loginModal.hidden = false
      elements.loginModal.setAttribute('open', '')
      if (typeof elements.loginModal.showModal === 'function' && !elements.loginModal.open) {
        try {
          elements.loginModal.showModal()
        } catch {
          // Dialog fallback
        }
      }
      document.body.classList.add('modal-open')
      setTimeout(() => elements.loginPassword?.focus(), 50)
    }
  }

  function hideLoginModal() {
    if (elements.loginModal) {
      elements.loginModal.hidden = true
      elements.loginModal.removeAttribute('open')
      if (typeof elements.loginModal.close === 'function' && elements.loginModal.open) {
        try {
          elements.loginModal.close()
        } catch {
          // Dialog fallback
        }
      }
    }
    if (elements.reviewModal.hidden && elements.successModal.hidden) {
      document.body.classList.remove('modal-open')
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault()
    const username = elements.loginUsername?.value?.trim() || 'admin'
    const password = elements.loginPassword?.value || ''

    if (!password) {
      if (elements.loginError) {
        elements.loginError.textContent = 'Password is required.'
        elements.loginError.hidden = false
      }
      return
    }

    if (elements.loginSubmit) {
      elements.loginSubmit.disabled = true
      elements.loginSubmit.textContent = 'Signing in...'
    }

    try {
      if (elements.loginError) {
        elements.loginError.hidden = true
      }
      const response = await loginAdmin({ username, password })
      hideLoginModal()
      setSessionUser(response.user || username)
      toasts.show('Signed in successfully.', { type: 'ok' })
      await loadBackofficeData()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Invalid credentials.'
      if (elements.loginError) {
        elements.loginError.textContent = msg
        elements.loginError.hidden = false
      }
      setUiStatus(UiStatusState.ERROR, 'Authentication failed.')
    } finally {
      if (elements.loginSubmit) {
        elements.loginSubmit.disabled = false
        elements.loginSubmit.textContent = 'Sign In'
      }
    }
  }

  async function handleLogout() {
    try {
      await logoutAdmin()
      setSessionUser(null)
      toasts.show('Signed out successfully.', { type: 'ok' })
      setUiStatus(UiStatusState.READY, 'Signed out.')
      showLoginModal()
    } catch (error) {
      toasts.show(`Logout failed: ${error instanceof Error ? error.message : String(error)}`, {
        type: 'error',
      })
    }
  }

  async function loadBackofficeData() {
    setUiStatus(UiStatusState.READY, 'Initializing backoffice...')
    await refreshGitStatus({ reloadActiveOnPull: false })
    await loadFiles()
    renderFileList()
    await switchMode('content')
    setUiStatus(UiStatusState.READY, `Loaded ${state.files.length} content file(s).`)
  }

  function setReviewError(errorMessage) {
    const message = errorMessage || 'Unexpected review flow error.'
    elements.reviewErrorText.textContent = message
    elements.reviewErrorText.hidden = false
  }

  function clearReviewError() {
    elements.reviewErrorText.hidden = true
    elements.reviewErrorText.textContent = ''
  }

  function syncDirtyState() {
    if (!state.activeFile) {
      state.dirty = false
      return
    }
    state.dirty = JSON.stringify(state.draftValue) !== JSON.stringify(state.originalValue)
  }

  function scheduleDraftPersist() {
    if (draftPersistTimer) clearTimeout(draftPersistTimer)
    if (!state.activeFile || !state.activeRevision || !state.dirty) return

    draftPersistTimer = setTimeout(() => {
      const key = saveDraft({
        filePath: state.activeFile,
        revision: state.activeRevision,
        value: state.draftValue,
      })
      state.draftRecovery.key = key
    }, 250)
  }

  function renderReviewPreview(preview) {
    clearReviewError()
    if (elements.reviewSummary) {
      elements.reviewSummary.textContent = preview?.summary || 'No diff summary available.'
    }
    if (elements.reviewChangesList) {
      elements.reviewChangesList.innerHTML = ''
    }
    if (elements.reviewSemanticList) {
      elements.reviewSemanticList.innerHTML = ''
    }

    if (elements.reviewDiffContainer) {
      renderVisualDiffViewer({
        container: elements.reviewDiffContainer,
        semanticChanges: state.sessionSemanticChanges,
        rawDiff: preview?.summary || preview || '',
        sessionChanges,
      })
    }

    const hasSemanticChanges = state.sessionSemanticChanges && state.sessionSemanticChanges.size > 0
    const hasPreviewEntries = Boolean(preview?.entries && preview.entries.length > 0)
    const hasSessionPaths = state.sessionTouchedPaths && state.sessionTouchedPaths.size > 0

    if (!hasPreviewEntries && !hasSemanticChanges && !hasSessionPaths) {
      if (elements.reviewChangesList) {
        const empty = document.createElement('li')
        empty.textContent = 'No tracked changes found for this session.'
        elements.reviewChangesList.append(empty)
      }
      reviewCanFinalize = false
      syncToolbarState()
      return
    }

    if (elements.reviewChangesList && preview?.entries) {
      preview.entries.forEach((entry) => {
        const item = document.createElement('li')
        item.textContent = `${entry.code} ${entry.path}`
        elements.reviewChangesList.append(item)
      })
    }

    reviewCanFinalize = true
    syncToolbarState()
  }

  function syncToolbarState() {
    const isContentMode = state.mode === 'content'
    const hasFile = Boolean(state.activeFile)

    elements.reloadFile.disabled = !isContentMode || !hasFile
    elements.saveFile.disabled = !isContentMode || !hasFile || !state.dirty
    elements.refreshGitStatus.disabled = state.gitBusy
    elements.openReviewFlow.disabled = !state.hasSessionChanges || state.dirty || state.gitBusy
    elements.finalizeReviewFlow.disabled = state.gitBusy || !reviewCanFinalize

    elements.editorModeSwitch.hidden = !isContentMode || !hasFile
    elements.editorModeGuided.disabled = !isContentMode || !hasFile
    elements.editorModeJson.disabled = !isContentMode || !hasFile
    elements.editorModeGuided.classList.toggle('is-active', state.activeViewMode === 'guided')
    elements.editorModeJson.classList.toggle('is-active', state.activeViewMode === 'json')

    elements.refreshGitStatus.textContent = isGitActionBusy('refresh')
      ? 'Refreshing...'
      : DEFAULT_BUTTON_LABELS.refresh
    elements.openReviewFlow.textContent = isGitActionBusy('preview')
      ? 'Preparing...'
      : DEFAULT_BUTTON_LABELS.preview
    elements.finalizeReviewFlow.textContent = isGitActionBusy('finalize')
      ? 'Finalizing...'
      : DEFAULT_BUTTON_LABELS.finalize
  }

  function renderFileList() {
    elements.fileList.innerHTML = ''

    if (state.mode !== 'content') {
      elements.fileList.hidden = true
      return
    }

    elements.fileList.hidden = false

    const searchTerm = (elements.fileSearch?.value || '').trim().toLowerCase()

    // Filter files based on searchTerm (matching filename, title, or usage text)
    const filteredFiles = state.files.filter((filePath) => {
      if (!searchTerm) return true
      const descriptor = state.fileDescriptors.find((entry) => entry.file === filePath)
      const usageText = descriptor?.usage?.length
        ? descriptor.usage.join(' ')
        : (FILE_USAGE_REFERENCES?.[filePath] || []).join(' ')
      const searchTarget = `${filePath} ${usageText}`.toLowerCase()
      return searchTarget.includes(searchTerm)
    })

    // Group filtered files by category
    const categoryNames = Object.keys(FILE_CATEGORIES)
    const grouped = new Map()
    categoryNames.forEach((cat) => grouped.set(cat, []))
    grouped.set('Other', [])

    filteredFiles.forEach((filePath) => {
      const category = getCategoryForFile(filePath)
      if (grouped.has(category)) {
        grouped.get(category).push(filePath)
      } else {
        grouped.get('Other').push(filePath)
      }
    })

    let totalRendered = 0

    function renderCategory(categoryName, filesInCategory) {
      if (filesInCategory.length === 0 && searchTerm) {
        return
      }

      const categorySection = document.createElement('li')
      categorySection.className = 'file-category'

      const categoryTitle = document.createElement('div')
      categoryTitle.className = 'file-category-title'

      const titleLabel = document.createElement('span')
      titleLabel.textContent = categoryName

      const countBadge = document.createElement('span')
      countBadge.className = 'file-category-count'
      countBadge.textContent = String(filesInCategory.length)

      categoryTitle.append(titleLabel, countBadge)
      categorySection.append(categoryTitle)

      const categoryList = document.createElement('ul')
      categoryList.className = 'file-category-list'

      filesInCategory.forEach((filePath) => {
        totalRendered += 1
        const descriptor = state.fileDescriptors.find((entry) => entry.file === filePath)
        const listItem = document.createElement('li')
        const button = document.createElement('button')
        button.type = 'button'
        button.classList.toggle('is-active', filePath === state.activeFile)
        button.setAttribute('title', filePath)

        const headerRow = document.createElement('div')
        headerRow.className = 'file-item-header'

        const title = document.createElement('span')
        title.className = 'file-item-title'
        title.textContent = filePath
        headerRow.append(title)

        const dirty = isFileDirty(filePath)
        if (dirty) {
          const dirtyDot = document.createElement('span')
          dirtyDot.className = 'file-item-dirty'
          dirtyDot.textContent = '●'
          dirtyDot.setAttribute('title', 'Unsaved changes')
          dirtyDot.setAttribute('aria-label', 'Unsaved changes')
          headerRow.append(dirtyDot)
        }

        const usage = document.createElement('span')
        usage.className = 'file-item-usage'
        usage.textContent = descriptor?.usage?.length
          ? `Usage: ${descriptor.usage.join(' • ')}`
          : getFileUsageLabel(filePath)

        button.append(headerRow, usage)
        button.addEventListener('click', () => openFile(filePath))
        listItem.append(button)
        categoryList.append(listItem)
      })

      categorySection.append(categoryList)
      elements.fileList.append(categorySection)
    }

    categoryNames.forEach((name) => renderCategory(name, grouped.get(name) || []))

    const otherFiles = grouped.get('Other') || []
    if (otherFiles.length > 0) {
      renderCategory('Other', otherFiles)
    }

    if (totalRendered === 0 && searchTerm) {
      const emptyItem = document.createElement('li')
      emptyItem.className = 'file-category-title'
      emptyItem.textContent = `No files matching "${searchTerm}"`
      elements.fileList.append(emptyItem)
    }
  }

  function renderEditor() {
    if (!state.activeFile) {
      elements.editorRoot.hidden = true
      elements.emptyState.hidden = false
      elements.imagesTools.hidden = true
      elements.imagesRoot.hidden = true
      return
    }

    elements.emptyState.hidden = true
    elements.editorRoot.hidden = false
    elements.imagesTools.hidden = true
    elements.imagesRoot.hidden = true

    const replaceRoot = (nextValue, { rerender = true } = {}) => {
      state.draftValue = nextValue
      state.validationIssues = []
      syncDirtyState()
      syncToolbarState()
      scheduleDraftPersist()
      renderFileList()

      if (state.dirty) {
        setUiStatus(
          UiStatusState.UNSAVED,
          'You have unsaved content changes. Click Save when ready.',
        )
      } else {
        setUiStatus(UiStatusState.READY, 'No unsaved changes.')
      }

      if (rerender) renderEditor()
    }

    if (state.activeViewMode === 'guided') {
      renderGuidedContentEditor({
        mount: elements.editorRoot,
        value: state.draftValue,
        baselineValue: state.originalValue,
        activeFile: state.activeFile,
        schema: state.activeSchema,
        validationIssues: state.validationIssues,
        onReplaceRoot: replaceRoot,
        onStatus: (message, mode = UiStatusState.READY) =>
          setUiStatus(normalizeStatusMode(mode), message),
        onMarkImageForDeletion: (imagePath) => state.deletedImages.add(imagePath),
        uploadImage: async ({ file, fieldPath, previousImagePath }) => {
          const upload = await uploadImageAsset({
            file,
            activeFile: state.activeFile,
            fieldPath,
            previousImagePath,
          })
          registerPendingUpload(sessionChanges, upload)
          if (!upload.variants.length) {
            markSessionPath(toRepoPathFromPublicImagePath(upload.imagePath))
          }
          return upload
        },
        fetchImages: (query) => fetchImages(query),
      })
      return
    }

    renderContentEditor({
      mount: elements.editorRoot,
      value: state.draftValue,
      activeFile: state.activeFile,
      onReplaceRoot: replaceRoot,
      onStatus: (message, mode = UiStatusState.READY) =>
        setUiStatus(normalizeStatusMode(mode), message),
      onMarkImageForDeletion: (imagePath) => state.deletedImages.add(imagePath),
      uploadImage: async ({ file, fieldPath, previousImagePath }) => {
        const upload = await uploadImageAsset({
          file,
          activeFile: state.activeFile,
          fieldPath,
          previousImagePath,
        })
        registerPendingUpload(sessionChanges, upload)
        if (!upload.variants.length) {
          markSessionPath(toRepoPathFromPublicImagePath(upload.imagePath))
        }
        return upload
      },
    })
  }

  function renderImages() {
    elements.editorRoot.hidden = true
    elements.emptyState.hidden = true
    elements.imagesTools.hidden = false
    elements.imagesRoot.hidden = false

    renderImagesLibrary({
      mount: elements.imagesRoot,
      images: state.images,
      isSectionCollapsed: (sectionName) => isSectionCollapsed(state, sectionName),
      setSectionCollapsed: (sectionName, collapsed) =>
        setSectionCollapsed(state, sectionName, collapsed),
      onOpenUsage: async (usage) => {
        await switchMode('content')
        await openFile(usage.file, { force: true })
        setUiStatus(
          UiStatusState.READY,
          `Opened usage location: ${usage.file} -> ${usage.jsonPath}`,
        )
      },
    })
  }

  async function loadFiles() {
    const payload = await fetchFiles()
    state.files = payload.files
    state.fileDescriptors = payload.descriptors
    renderFileList()
  }

  async function loadImages() {
    state.images = await fetchImages(state.imageSearchQuery)
  }

  async function openFile(filePath, { force = false } = {}) {
    if (!force && state.dirty) {
      const confirmed = globalThis.confirm(
        'You have unsaved changes. Discard them and switch file?',
      )
      if (!confirmed) return
    }

    const remoteFilePayload = await fetchFileContent(filePath)
    const filePayload = resolveSessionContent(sessionChanges, filePath, remoteFilePayload)
    const schema = await fetchSchema(filePayload.schemaId || filePath)

    state.activeFile = filePath
    state.activeSchema = schema
    state.activeRevision = filePayload.revision || ''
    state.activeUsage = Array.isArray(filePayload.usage) ? filePayload.usage : []
    state.validationIssues = []
    state.hasConflicts = false
    state.draftRecovery = {
      restored: false,
      key: '',
    }
    state.deletedImages.clear()

    state.originalValue = cloneValue(filePayload.content)
    state.draftValue = cloneValue(filePayload.content)

    const draft = loadDraft({
      filePath: state.activeFile,
      revision: state.activeRevision,
    })
    if (draft && !force) {
      const shouldRestore = globalThis.confirm(
        `A draft was found from ${new Date(draft.savedAt).toLocaleString()}. Restore it?`,
      )
      if (shouldRestore) {
        state.draftValue = cloneValue(draft.value)
        state.draftRecovery = {
          restored: true,
          key: draft.key,
        }
      } else {
        clearDraft({ filePath: state.activeFile, revision: state.activeRevision })
        state.draftRecovery = {
          restored: false,
          key: '',
        }
      }
    }

    syncDirtyState()
    renderFileList()
    elements.currentFile.textContent = filePath
    elements.currentUsage.textContent = state.activeUsage.length
      ? `Used in: ${state.activeUsage.join(' • ')}`
      : getFileUsageLabel(filePath)
    renderEditor()
    syncToolbarState()

    if (state.draftRecovery.restored) {
      setUiStatus(UiStatusState.UNSAVED, 'Draft restored. Review and save when ready.')
      toasts.show({ message: 'Draft restored successfully.', type: 'ok' })
    } else {
      setUiStatus(UiStatusState.READY, 'File loaded. You can start editing in Guided mode.')
    }
  }

  async function saveActiveFile() {
    if (!state.activeFile) return

    setUiStatus(UiStatusState.SAVING, 'Validating content before save...')
    const validation = await validateFileContent({
      filePath: state.activeFile,
      content: state.draftValue,
    })

    if (!validation.ok) {
      state.validationIssues = validation.issues
      renderEditor()
      setUiStatus(
        UiStatusState.ERROR,
        'Some fields need attention before saving. Check messages in the form and try again.',
      )
      toasts.show({
        message: `Validation failed on ${validation.issues.length} field(s).`,
        type: 'error',
        timeoutMs: 5000,
      })
      return
    }

    const deletedImagesSnapshot = Array.from(state.deletedImages)
    const originalSnapshot = cloneValue(state.originalValue)
    const draftSnapshot = cloneValue(state.draftValue)
    const baseRevision = state.activeRevision

    setUiStatus(UiStatusState.SAVING, 'Saving file and finalizing pending image updates...')

    const saveResult = await saveFileContent({
      filePath: state.activeFile,
      content: draftSnapshot,
      deletedImages: deletedImagesSnapshot,
      baseRevision: state.activeRevision,
    })

    const expectedPersistedContent =
      saveResult &&
      typeof saveResult === 'object' &&
      Object.prototype.hasOwnProperty.call(saveResult, 'content')
        ? saveResult.content
        : draftSnapshot

    let latestFilePayload = null
    let persistedContent = expectedPersistedContent
    if (saveResult.persisted !== false) {
      latestFilePayload = await fetchFileContent(state.activeFile)
      persistedContent = latestFilePayload.content
    }
    if (!areValuesEqual(persistedContent, expectedPersistedContent)) {
      throw new Error(
        'Save verification failed because persisted content differs from the current editor state. Reload and try again.',
      )
    }

    stageContentChange(sessionChanges, {
      filePath: state.activeFile,
      content: persistedContent,
      baseRevision: saveResult.revision || baseRevision,
      deletedImages: deletedImagesSnapshot,
    })

    const semanticEntries = buildLocalSemanticSummary({
      before: originalSnapshot,
      after: persistedContent,
    })

    state.sessionSemanticChanges.set(state.activeFile, semanticEntries)
    state.originalValue = cloneValue(persistedContent)
    state.draftValue = cloneValue(persistedContent)
    state.activeRevision = saveResult.revision || latestFilePayload?.revision || state.activeRevision
    state.validationIssues = []
    state.deletedImages.clear()

    clearDraft({ filePath: state.activeFile, revision: baseRevision })

    markSessionPath(`public/content/${state.activeFile}`)
    deletedImagesSnapshot.forEach((publicPath) => {
      markSessionPath(toRepoPathFromPublicImagePath(publicPath))
    })

    const finalizePayload = buildSessionFinalizePayload(
      sessionChanges,
      state.sessionTouchedPaths,
    )
    finalizePayload.assets.forEach((asset) => markSessionPath(asset.path))

    if (saveResult && Array.isArray(saveResult.finalizedImages)) {
      saveResult.finalizedImages.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return
        if (typeof entry.from === 'string') {
          markSessionPath(toRepoPathFromPublicImagePath(entry.from))
        }
        if (typeof entry.to === 'string') {
          markSessionPath(toRepoPathFromPublicImagePath(entry.to))
        }
      })
    }

    syncDirtyState()
    syncToolbarState()
    renderFileList()
    const saveMessage =
      saveResult.persisted === false
        ? 'Saved in this review session. Finalize before closing this tab.'
        : 'Saved successfully. You can now create a review branch.'
    setUiStatus(UiStatusState.SYNCED, saveMessage)
    toasts.show({ message: saveMessage, type: 'ok' })
  }

  async function refreshGitStatus({ reloadActiveOnPull = true } = {}) {
    await runGitTask('refresh', async () => {
      const status = await fetchGitStatus()
      state.gitStatus = status
      seedSessionPathsFromGitStatus(status)
      renderGitStatus()

      if (
        reloadActiveOnPull &&
        status.sync?.action === 'pulled' &&
        state.activeFile &&
        !state.dirty &&
        state.mode === 'content'
      ) {
        await openFile(state.activeFile, { force: true })
      }
    })
  }

  async function openReviewFlow() {
    if (state.dirty) {
      setUiStatus(UiStatusState.ERROR, 'Please save current edits before creating a review branch.')
      return
    }

    const sessionPaths = Array.from(state.sessionTouchedPaths)
    if (!sessionPaths.length) {
      setUiStatus(UiStatusState.ERROR, 'No session changes found to review.')
      return
    }

    await runGitTask('preview', async () => {
      reviewCanFinalize = false
      clearReviewError()
      const [preview, sessionSummary] = await Promise.all([
        fetchGitPreview(sessionPaths),
        fetchSessionSummary(sessionPaths),
      ])
      renderReviewPreview(preview, sessionSummary)
      openModal(elements.reviewModal)
      setUiStatus(UiStatusState.READY, 'Review preview loaded. Finalize when ready.')
    })
  }

  async function finalizeReviewFlow() {
    const sessionPaths = Array.from(state.sessionTouchedPaths)
    if (!sessionPaths.length) {
      setUiStatus(UiStatusState.ERROR, 'No session changes found for finalize flow.')
      return
    }

    await runGitTask('finalize', async () => {
      const result = await finalizeGitReview(
        buildSessionFinalizePayload(sessionChanges, sessionPaths),
      )
      closeModal(elements.reviewModal)
      reviewCanFinalize = false

      elements.createdBranchName.textContent = result.branchName
      elements.createdPrNote.hidden = true
      elements.createdPrNote.textContent = ''
      elements.createdPrLink.hidden = true
      elements.createdPrLink.href = '#'

      const pullRequest = result.pullRequest || null
      if (pullRequest?.created && pullRequest.url) {
        elements.createdPrLink.href = pullRequest.url
        elements.createdPrLink.hidden = false
        elements.createdPrNote.hidden = false
        elements.createdPrNote.textContent =
          `Pull Request #${pullRequest.number || ''} was created automatically.`.trim()
      } else if (pullRequest?.warning) {
        elements.createdPrNote.hidden = false
        elements.createdPrNote.textContent = pullRequest.warning
      }

      openModal(elements.successModal)

      state.sessionTouchedPaths.clear()
      state.sessionSemanticChanges.clear()
      state.hasSessionChanges = false
      clearSessionChanges(sessionChanges)

      syncToolbarState()
      await refreshGitStatus({ reloadActiveOnPull: false })
      setUiStatus(UiStatusState.SYNCED, `Review branch created: ${result.branchName}`)
      toasts.show({
        message:
          pullRequest?.created && pullRequest.url
            ? 'Review branch pushed and Pull Request created.'
            : 'Review branch created and pushed.',
        type: 'ok',
      })
    })
  }

  async function switchMode(nextMode) {
    state.mode = nextMode
    elements.modeContent.classList.toggle('is-active', nextMode === 'content')
    elements.modeImages.classList.toggle('is-active', nextMode === 'images')
    elements.refreshFiles.textContent = nextMode === 'images' ? 'Refresh images' : 'Refresh files'

    if (nextMode === 'content') {
      elements.imagesTools.hidden = true
      elements.currentFile.textContent = state.activeFile || 'Choose a file'
      elements.currentUsage.textContent = state.activeFile
        ? state.activeUsage.length
          ? `Used in: ${state.activeUsage.join(' • ')}`
          : getFileUsageLabel(state.activeFile)
        : 'Usage details will appear here.'

      renderFileList()
      if (state.activeFile) {
        renderEditor()
        setUiStatus(UiStatusState.READY, 'Content editor active.')
      } else {
        elements.imagesRoot.hidden = true
        elements.editorRoot.hidden = true
        elements.emptyState.hidden = false
        setUiStatus(UiStatusState.READY, 'Load a content file from the left panel.')
      }
    } else {
      elements.currentFile.textContent = 'Image library'
      elements.currentUsage.textContent = 'Browse all uploaded images and where they are used.'
      renderFileList()
      await loadImages()
      renderImages()
      setUiStatus(UiStatusState.READY, `Loaded ${state.images.length} image(s).`)
    }

    syncToolbarState()
  }

  function bindEvents() {
    elements.refreshFiles.addEventListener('click', async () => {
      try {
        await refreshGitStatus()
        if (state.mode === 'images') {
          await loadImages()
          renderImages()
          setUiStatus(UiStatusState.READY, `Loaded ${state.images.length} image(s).`)
        } else {
          await loadFiles()
          setUiStatus(UiStatusState.READY, `Loaded ${state.files.length} content file(s).`)
        }
      } catch (error) {
        setUiStatus(
          UiStatusState.ERROR,
          `${error instanceof Error ? error.message : 'Refresh failed.'} Please retry.`,
        )
      }
    })

    elements.modeContent.addEventListener('click', async () => {
      try {
        await switchMode('content')
      } catch (error) {
        setUiStatus(
          UiStatusState.ERROR,
          `${error instanceof Error ? error.message : 'Unable to switch mode.'} Please retry.`,
        )
      }
    })

    elements.modeImages.addEventListener('click', async () => {
      try {
        await switchMode('images')
      } catch (error) {
        setUiStatus(
          UiStatusState.ERROR,
          `${error instanceof Error ? error.message : 'Unable to switch mode.'} Please retry.`,
        )
      }
    })

    elements.editorModeGuided.addEventListener('click', () => {
      if (!state.activeFile) return
      state.activeViewMode = 'guided'
      renderEditor()
      syncToolbarState()
      setUiStatus(UiStatusState.READY, 'Guided mode enabled.')
    })

    elements.editorModeJson.addEventListener('click', () => {
      if (!state.activeFile) return
      state.activeViewMode = 'json'
      renderEditor()
      syncToolbarState()
      setUiStatus(UiStatusState.READY, 'Advanced mode enabled.')
    })

    elements.imageSearch.addEventListener('input', () => {
      state.imageSearchQuery = elements.imageSearch.value
      if (imageSearchDebounceTimer) clearTimeout(imageSearchDebounceTimer)
      imageSearchDebounceTimer = setTimeout(async () => {
        if (state.mode !== 'images') return
        try {
          await loadImages()
          renderImages()
          setUiStatus(
            UiStatusState.READY,
            `Found ${state.images.length} image(s) for "${state.imageSearchQuery.trim()}".`,
          )
        } catch (error) {
          setUiStatus(
            UiStatusState.ERROR,
            `${error instanceof Error ? error.message : 'Image search failed.'} Please try again.`,
          )
        }
      }, 250)
    })

    elements.clearImageSearch.addEventListener('click', async () => {
      elements.imageSearch.value = ''
      state.imageSearchQuery = ''
      if (state.mode !== 'images') return
      try {
        await loadImages()
        renderImages()
        setUiStatus(UiStatusState.READY, `Loaded ${state.images.length} image(s).`)
      } catch (error) {
        setUiStatus(
          UiStatusState.ERROR,
          `${error instanceof Error ? error.message : 'Unable to clear image search.'} Please retry.`,
        )
      }
    })

    elements.reloadFile.addEventListener('click', async () => {
      if (!state.activeFile) return
      try {
        await openFile(state.activeFile, { force: true })
        await refreshGitStatus({ reloadActiveOnPull: false })
      } catch (error) {
        setUiStatus(
          UiStatusState.ERROR,
          `${error instanceof Error ? error.message : 'Reload failed.'} Please retry.`,
        )
      }
    })

    elements.saveFile.addEventListener('click', async () => {
      try {
        await saveActiveFile()
        await refreshGitStatus({ reloadActiveOnPull: false })
      } catch (error) {
        if (error && typeof error === 'object' && error.statusCode === 409) {
          state.hasConflicts = true
          setUiStatus(
            UiStatusState.ERROR,
            'This file changed outside the editor. Reload to merge latest content first.',
          )
          toasts.show({
            message: 'Save blocked due to content conflict. Reload required.',
            type: 'error',
            timeoutMs: 6000,
          })
          return
        }

        setUiStatus(
          UiStatusState.ERROR,
          `${error instanceof Error ? error.message : 'Save failed.'} Please retry.`,
        )
      }
    })

    elements.refreshGitStatus.addEventListener('click', async () => {
      try {
        await refreshGitStatus()
        setUiStatus(UiStatusState.READY, 'Repository status refreshed.')
      } catch (error) {
        setUiStatus(
          UiStatusState.ERROR,
          `${error instanceof Error ? error.message : 'Git refresh failed.'} Please retry.`,
        )
      }
    })

    elements.openReviewFlow.addEventListener('click', async () => {
      try {
        await openReviewFlow()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to open review flow.'
        setReviewError(message)
        setUiStatus(UiStatusState.ERROR, `${message} Please retry.`)
      }
    })

    elements.cancelReviewFlow.addEventListener('click', () => {
      reviewCanFinalize = false
      syncToolbarState()
      closeModal(elements.reviewModal)
    })

    elements.finalizeReviewFlow.addEventListener('click', async () => {
      try {
        await finalizeReviewFlow()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Finalize flow failed.'
        setReviewError(message)
        setUiStatus(UiStatusState.ERROR, `${message} Please retry.`)
      }
    })

    elements.copyBranchName.addEventListener('click', async () => {
      try {
        const branchName = elements.createdBranchName.textContent.trim()
        if (!branchName) return
        await navigator.clipboard.writeText(branchName)
        setUiStatus(UiStatusState.READY, 'Branch name copied to clipboard.')
      } catch (error) {
        setUiStatus(
          UiStatusState.ERROR,
          `${error instanceof Error ? error.message : 'Unable to copy branch name.'} Please retry.`,
        )
      }
    })

    elements.closeSuccessModal.addEventListener('click', () => {
      closeModal(elements.successModal)
    })

    if (elements.loginForm) {
      elements.loginForm.addEventListener('submit', handleLoginSubmit)
    }

    if (elements.logoutButton) {
      elements.logoutButton.addEventListener('click', handleLogout)
    }

    window.addEventListener('backoffice:unauthorized', () => {
      showLoginModal('Session expired or unauthorized. Please sign in again.')
    })

    /**
     * Online saves live in the current browser session until GitHub finalization.
     * The native navigation warning prevents accidental loss during that interval.
     */
    window.addEventListener('beforeunload', (event) => {
      if (!state.dirty && !state.hasSessionChanges) return
      event.preventDefault()
      event.returnValue = ''
    })

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || state.gitBusy) return
      if (!elements.reviewModal.hidden) {
        reviewCanFinalize = false
        syncToolbarState()
        closeModal(elements.reviewModal)
      } else if (!elements.successModal.hidden) {
        closeModal(elements.successModal)
      }
    })

    if (elements.themeSwitcher) {
      elements.themeSwitcher.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-theme-value]')
        if (!btn) return
        const selectedTheme = btn.getAttribute('data-theme-value')
        if (selectedTheme) {
          setTheme(selectedTheme)
        }
      })
    }

    elements.reviewModal.addEventListener('click', (event) => {
      if (event.target !== elements.reviewModal || state.gitBusy) return
      reviewCanFinalize = false
      syncToolbarState()
      closeModal(elements.reviewModal)
    })

    elements.successModal.addEventListener('click', (event) => {
      if (event.target !== elements.successModal || state.gitBusy) return
      closeModal(elements.successModal)
    })
    if (elements.sidebarCollapseBtn) {
      elements.sidebarCollapseBtn.addEventListener('click', toggleSidebarCollapse)
    }

    if (elements.fileSearch) {
      elements.fileSearch.addEventListener('input', () => {
        renderFileList()
      })
    }
    if (elements.cmdPaletteBtn) {
      elements.cmdPaletteBtn.addEventListener('click', () => {
        commandPalette.toggle()
      })
    }
    if (elements.settingsMenuBtn && elements.settingsDropdown) {
      elements.settingsMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const isHidden = elements.settingsDropdown.hidden
        elements.settingsDropdown.hidden = !isHidden
        elements.settingsMenuBtn.setAttribute('aria-expanded', String(isHidden))
      })

      document.addEventListener('click', (e) => {
        if (
          elements.settingsDropdown &&
          !elements.settingsDropdown.hidden &&
          !elements.settingsDropdown.contains(e.target) &&
          !elements.settingsMenuBtn.contains(e.target)
        ) {
          elements.settingsDropdown.hidden = true
          elements.settingsMenuBtn.setAttribute('aria-expanded', 'false')
        }
      })
    }

    if (elements.menuRefreshGit) {
      elements.menuRefreshGit.addEventListener('click', () => {
        if (elements.settingsDropdown) elements.settingsDropdown.hidden = true
        if (elements.refreshGitStatus) elements.refreshGitStatus.click()
      })
    }

    if (elements.menuRefreshFiles) {
      elements.menuRefreshFiles.addEventListener('click', () => {
        if (elements.settingsDropdown) elements.settingsDropdown.hidden = true
        if (elements.refreshFiles) elements.refreshFiles.click()
      })
    }


    bindShortcuts({
      onSave: async () => {
        if (elements.saveFile.disabled) return
        await elements.saveFile.click()
      },
      onReload: async () => {
        if (elements.reloadFile.disabled) return
        await elements.reloadFile.click()
      },
      onCloseModal: () => {
        if (elements.settingsDropdown && !elements.settingsDropdown.hidden) {
          elements.settingsDropdown.hidden = true
          elements.settingsMenuBtn?.setAttribute('aria-expanded', 'false')
          return
        }
        if (commandPalette.isOpen()) {
          commandPalette.close()
          return
        }
        if (!elements.reviewModal.hidden) {
          reviewCanFinalize = false
          syncToolbarState()
          closeModal(elements.reviewModal)
          return
        }
        if (!elements.successModal.hidden) {
          closeModal(elements.successModal)
        }
      },
      onFocusSearch: () => {
        if (state.mode === 'images' && elements.imageSearch) {
          elements.imageSearch.focus()
          elements.imageSearch.select?.()
          return
        }
        if (elements.fileSearch) {
          const layoutEl = document.querySelector('.layout')
          if (layoutEl?.classList.contains('sidebar-collapsed')) {
            toggleSidebarCollapse()
          }
          elements.fileSearch.focus()
          elements.fileSearch.select?.()
        }
      },
      onToggleCommandPalette: () => {
        commandPalette.toggle()
      },
    })
  }

  async function init() {
    initTheme()
    initSidebarCollapse()
    bindEvents()
    try {
      setUiStatus(UiStatusState.READY, 'Checking session...')
      const session = await fetchAuthSession()
      if (!session.authenticated) {
        setUiStatus(UiStatusState.UNSAVED, 'Authentication required.')
        showLoginModal()
        return
      }

      setSessionUser(session.user)
      await loadBackofficeData()
    } catch (error) {
      showLoginModal()
      setUiStatus(
        UiStatusState.ERROR,
        `${error instanceof Error ? error.message : 'Session verification failed.'} Please sign in.`,
      )
    }
  }

  return { init }
}
