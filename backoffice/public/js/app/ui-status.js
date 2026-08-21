/**
 * Why this exists:
 * Typed UI status states keep editor feedback clear and consistent for
 * non-technical users across content editing and deployment workflows.
 */

export const UiStatusState = {
  READY: 'ready',
  UNSAVED: 'unsaved',
  SAVING: 'saving',
  SYNCED: 'synced',
  ERROR: 'error',
}

const STATUS_VIEW = {
  [UiStatusState.READY]: {
    icon: '●',
    label: 'Ready',
  },
  [UiStatusState.UNSAVED]: {
    icon: '●',
    label: 'Unsaved changes',
  },
  [UiStatusState.SAVING]: {
    icon: '●',
    label: 'Saving in progress',
  },
  [UiStatusState.SYNCED]: {
    icon: '●',
    label: 'Saved and synced',
  },
  [UiStatusState.ERROR]: {
    icon: '●',
    label: 'Needs attention',
  },
}

export function getStatusView(state) {
  return STATUS_VIEW[state] || STATUS_VIEW[UiStatusState.READY]
}
