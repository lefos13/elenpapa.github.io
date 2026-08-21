/**
 * Why this exists:
 * Draft recovery protects editors from accidental refresh/navigation losses by
 * persisting unsaved edits keyed to file + revision state.
 */
import { cloneValue } from '../utils.js'

const STORAGE_PREFIX = 'backoffice:draft:'

function makeDraftKey(filePath, revision) {
  return `${STORAGE_PREFIX}${filePath}:${revision || 'unknown'}`
}

function listDraftKeysForFile(filePath) {
  const keys = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key) continue
    if (key.startsWith(`${STORAGE_PREFIX}${filePath}:`)) keys.push(key)
  }
  return keys
}

export function saveDraft({ filePath, revision, value }) {
  if (!filePath) return ''
  const key = makeDraftKey(filePath, revision)
  const payload = {
    savedAt: new Date().toISOString(),
    value,
  }
  localStorage.setItem(key, JSON.stringify(payload))
  return key
}

export function loadDraft({ filePath, revision }) {
  const key = makeDraftKey(filePath, revision)
  const raw = localStorage.getItem(key)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return {
      key,
      savedAt: parsed.savedAt || '',
      value: cloneValue(parsed.value),
    }
  } catch {
    return null
  }
}

export function clearDraft({ filePath, revision }) {
  if (!filePath) return
  if (revision) {
    localStorage.removeItem(makeDraftKey(filePath, revision))
  }
  listDraftKeysForFile(filePath).forEach((key) => localStorage.removeItem(key))
}
