/**
 * Why this exists:
 * Theme management coordinates light, dark, and system color preferences across
 * the backoffice UI, persisting choices in localStorage and reacting to system
 * preference changes.
 */

const STORAGE_KEY = 'backoffice:theme'
const mediaQuery =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

let currentPreference = 'system'
let mediaListenerAttached = false

/**
 * Resolves current system color scheme preference ('dark' or 'light').
 * @returns {'dark' | 'light'}
 */
function getSystemTheme() {
  if (!mediaQuery) return 'light'
  return mediaQuery.matches ? 'dark' : 'light'
}

/**
 * Resolves a preference to effective 'dark' or 'light'.
 * @param {'light' | 'dark' | 'system'} preference
 * @returns {'dark' | 'light'}
 */
function resolveEffectiveTheme(preference) {
  if (preference === 'dark') return 'dark'
  if (preference === 'light') return 'light'
  return getSystemTheme()
}

/**
 * Updates UI active states on theme buttons or select controls.
 * @param {'light' | 'dark' | 'system'} preference
 */
function updateThemeSwitcherUI(preference) {
  if (typeof document === 'undefined') return
  const switcher = document.querySelector('#theme-switcher')
  if (!switcher) return

  const buttons = switcher.querySelectorAll('[data-theme-value]')
  buttons.forEach((btn) => {
    const val = btn.getAttribute('data-theme-value')
    const isActive = val === preference
    btn.classList.toggle('is-active', isActive)
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false')
  })

  const select = switcher.querySelector('select') || (switcher.tagName === 'SELECT' ? switcher : null)
  if (select && select.value !== preference) {
    select.value = preference
  }
}

/**
 * Applies attributes to documentElement and refreshes switcher controls.
 * @param {'dark' | 'light'} resolvedTheme
 * @param {'light' | 'dark' | 'system'} preference
 */
function applyTheme(resolvedTheme, preference) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolvedTheme)
  document.documentElement.setAttribute('data-theme-preference', preference)
  updateThemeSwitcherUI(preference)
}

/**
 * Handler for system media query changes when preference is set to 'system'.
 */
function onSystemMediaChange() {
  if (currentPreference === 'system') {
    const resolved = getSystemTheme()
    applyTheme(resolved, 'system')
  }
}

/**
 * Gets the current theme preference ('light' | 'dark' | 'system').
 * @returns {'light' | 'dark' | 'system'}
 */
export function getTheme() {
  return currentPreference
}

/**
 * Sets and persists a theme preference, applying styling immediately.
 * @param {'light' | 'dark' | 'system'} theme
 * @returns {'dark' | 'light'} The resolved active theme
 */
export function setTheme(theme) {
  const validThemes = ['light', 'dark', 'system']
  currentPreference = validThemes.includes(theme) ? theme : 'system'

  try {
    localStorage.setItem(STORAGE_KEY, currentPreference)
  } catch (error) {
    console.warn('Unable to persist theme preference in localStorage:', error)
  }

  const resolved = resolveEffectiveTheme(currentPreference)
  applyTheme(resolved, currentPreference)
  return resolved
}

/**
 * Initializes theme from localStorage or system preference.
 * Attaches system media listener if needed.
 * @returns {'dark' | 'light'} The resolved active theme
 */
export function initTheme() {
  let stored = 'system'
  try {
    stored = localStorage.getItem(STORAGE_KEY) || 'system'
  } catch {
    stored = 'system'
  }

  if (!['light', 'dark', 'system'].includes(stored)) {
    stored = 'system'
  }

  currentPreference = stored

  if (mediaQuery && !mediaListenerAttached) {
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onSystemMediaChange)
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(onSystemMediaChange)
    }
    mediaListenerAttached = true
  }

  const resolved = resolveEffectiveTheme(currentPreference)
  applyTheme(resolved, currentPreference)
  return resolved
}
