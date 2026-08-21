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
import { getFileUsageLabel } from './constants.js'
import { bindShortcuts } from './app/shortcuts.js'
import { saveDraft, loadDraft, clearDraft } from './app/draft-recovery.js'
import { createToastController } from './app/toasts.js'
import { buildLocalSemanticSummary } from './app/semantic-summary.js'
import { UiStatusState, getStatusView } from './app/ui-status.js'
import { createState, isSectionCollapsed, setSectionCollapsed } from './state.js'
import { areValuesEqual, cloneValue, toRepoPathFromPublicImagePath } from './utils.js'
import { renderContentEditor } from './views/content-editor.js'
import { renderGuidedContentEditor } from './features/content/guided-editor.js'
import { renderImagesLibrary } from './features/images/library.js'

export function createBackofficeApp(elements) {
  const state = createState()
  const toasts = createToastController(elements.toastRoot)
  let imageSearchDebounceTimer = null
  let draftPersistTimer = null
  let reviewCanFinalize = false
  const gitBusyByAction = new Map()
  const DEFAULT_BUTTON_LABELS = {
    refresh: 'Refresh git',
    preview: 'Create Review Branch',
    finalize: 'Finalize & Push',
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

    elements.statusText.textContent = message || view.label
    elements.statusText.className = `status-${stateKey}`
    elements.statusStrip.dataset.status = stateKey
    elements.statusIcon.textContent = view.icon
    elements.statusLabel.textContent = view.label
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

  function formatGitStatusText(status) {
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
    elements.gitStatusText.textContent = formatGitStatusText(state.gitStatus)
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
      if (user) {
        elements.sessionUser.hidden = false
        if (elements.sessionUsername) {
          elements.sessionUsername.textContent = user
        }
      } else {
        elements.sessionUser.hidden = true
      }
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

  function renderReviewPreview(preview, sessionSummary) {
    clearReviewError()
    elements.reviewSummary.textContent = preview.summary || 'No diff summary available.'
    elements.reviewChangesList.innerHTML = ''
    elements.reviewSemanticList.innerHTML = ''

    const semanticEntries = []
    state.sessionSemanticChanges.forEach((entries, filePath) => {
      entries.forEach((entry) => {
        semanticEntries.push({
          filePath,
          ...entry,
        })
      })
    })

    if (semanticEntries.length) {
      semanticEntries.forEach((entry) => {
        const item = document.createElement('li')
        item.textContent = `${entry.filePath}: ${entry.path || 'root'} (${entry.label}) ${entry.before ? `from "${entry.before}"` : ''}${entry.after ? ` to "${entry.after}"` : ''}`
        elements.reviewSemanticList.append(item)
      })
    } else {
      const fallback = document.createElement('li')
      fallback.textContent = 'No field-level summary captured yet. Saved files will appear here.'
      elements.reviewSemanticList.append(fallback)
    }

    if (sessionSummary?.pendingTempUploads?.dangling?.length) {
      const tempNotice = document.createElement('li')
      tempNotice.textContent = `Pending temp uploads to discard before push: ${sessionSummary.pendingTempUploads.dangling.length}`
      elements.reviewSemanticList.append(tempNotice)
    }

    if (!preview.entries.length) {
      const empty = document.createElement('li')
      empty.textContent = 'No tracked changes found for this session.'
      elements.reviewChangesList.append(empty)
      reviewCanFinalize = false
      syncToolbarState()
      return
    }

    preview.entries.forEach((entry) => {
      const item = document.createElement('li')
      item.textContent = `${entry.code} ${entry.path}`
      elements.reviewChangesList.append(item)
    })

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
    state.files.forEach((filePath) => {
      const descriptor = state.fileDescriptors.find((entry) => entry.file === filePath)
      const listItem = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.classList.toggle('is-active', filePath === state.activeFile)

      const title = document.createElement('span')
      title.className = 'file-item-title'
      title.textContent = filePath

      const usage = document.createElement('span')
      usage.className = 'file-item-usage'
      usage.textContent = descriptor?.usage?.length
        ? `Usage: ${descriptor.usage.join(' • ')}`
        : getFileUsageLabel(filePath)

      const meta = document.createElement('span')
      meta.className = 'file-item-usage'
      const bytes = descriptor?.sizeBytes
      const updatedAt = descriptor?.updatedAt
      const unsavedTag = filePath === state.activeFile && state.dirty ? ' • Unsaved changes' : ''
      meta.textContent = `${bytes ? `Size: ${(bytes / 1024).toFixed(1)} KB` : ''}${updatedAt ? ` • Updated: ${new Date(updatedAt).toLocaleString()}` : ''}${unsavedTag}`

      button.append(title, usage, meta)
      button.addEventListener('click', () => openFile(filePath))
      listItem.append(button)
      elements.fileList.append(listItem)
    })
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
        activeFile: state.activeFile,
        schema: state.activeSchema,
        validationIssues: state.validationIssues,
        onReplaceRoot: replaceRoot,
        onStatus: (message, mode = UiStatusState.READY) =>
          setUiStatus(normalizeStatusMode(mode), message),
        onMarkImageForDeletion: (imagePath) => state.deletedImages.add(imagePath),
        uploadImage: async ({ file, fieldPath, previousImagePath }) => {
          const imagePath = await uploadImageAsset({
            file,
            activeFile: state.activeFile,
            fieldPath,
            previousImagePath,
          })
          markSessionPath(toRepoPathFromPublicImagePath(imagePath))
          return imagePath
        },
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
        const imagePath = await uploadImageAsset({
          file,
          activeFile: state.activeFile,
          fieldPath,
          previousImagePath,
        })
        markSessionPath(toRepoPathFromPublicImagePath(imagePath))
        return imagePath
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

    const filePayload = await fetchFileContent(filePath)
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

    const latestFilePayload = await fetchFileContent(state.activeFile)
    const persistedContent = latestFilePayload.content
    if (!areValuesEqual(persistedContent, expectedPersistedContent)) {
      throw new Error(
        'Save verification failed because on-disk content differs from the current editor state. Reload and try again.',
      )
    }

    const semanticEntries = buildLocalSemanticSummary({
      before: originalSnapshot,
      after: persistedContent,
    })

    state.sessionSemanticChanges.set(state.activeFile, semanticEntries)
    state.originalValue = cloneValue(persistedContent)
    state.draftValue = cloneValue(persistedContent)
    state.activeRevision = saveResult.revision || latestFilePayload.revision || state.activeRevision
    state.validationIssues = []
    state.deletedImages.clear()

    clearDraft({ filePath: state.activeFile, revision: state.activeRevision })

    markSessionPath(`public/content/${state.activeFile}`)
    deletedImagesSnapshot.forEach((publicPath) => {
      markSessionPath(toRepoPathFromPublicImagePath(publicPath))
    })

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
    setUiStatus(UiStatusState.SYNCED, 'Saved successfully. You can now create a review branch.')
    toasts.show({ message: 'Content saved successfully.', type: 'ok' })
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
      const result = await finalizeGitReview(sessionPaths)
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
        if (state.mode !== 'images') return
        elements.imageSearch.focus()
      },
    })
  }

  async function init() {
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
