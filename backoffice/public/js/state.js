/**
 * Why this exists:
 * Shared state creation and state-derived helpers live here so controller logic
 * stays focused on behavior rather than object bootstrapping details.
 */
export function createState() {
  return {
    mode: 'content',
    files: [],
    fileDescriptors: [],
    images: [],
    imageSearchQuery: '',
    /**
     * Why this exists:
     * We track expanded sections (not collapsed ones) so default behavior is
     * collapsed and the stored set only contains explicit user expansions.
     */
    expandedImageSections: new Set(),
    activeFile: '',
    activeSchema: null,
    activeRevision: '',
    activeUsage: [],
    activeViewMode: 'guided',
    originalValue: null,
    draftValue: null,
    validationIssues: [],
    hasConflicts: false,
    draftRecovery: {
      restored: false,
      key: '',
    },
    dirty: false,
    deletedImages: new Set(),
    sessionTouchedPaths: new Set(),
    sessionSemanticChanges: new Map(),
    hasSessionChanges: false,
    gitStatus: null,
    gitBusy: false,
  }
}

export function isSectionCollapsed(state, sectionName) {
  /**
   * Why this behavior exists:
   * Image sections should be collapsed by default for scanability, and only
   * sections explicitly opened by the user stay expanded.
   */
  return !state.expandedImageSections.has(sectionName)
}

export function setSectionCollapsed(state, sectionName, collapsed) {
  if (collapsed) {
    state.expandedImageSections.delete(sectionName)
  } else {
    state.expandedImageSections.add(sectionName)
  }
}
