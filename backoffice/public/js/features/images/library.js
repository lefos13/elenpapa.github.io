/**
 * Why this exists:
 * Images view is exposed through a feature module path so the app controller
 * can scale without importing legacy view files directly.
 */
export { renderImagesLibrary } from '../../views/images-library.js'
