/**
 * Why this exists:
 * Shared constants for file routing, MIME typing, and content-to-image folder
 * ownership live in one place so future features can evolve predictably.
 */
export const IMAGE_FOLDER_BY_FILE = {
  'book.json': 'books',
  'contact.json': 'common',
  'home.json': 'root',
  'moonlight.json': 'moonlight',
  'painted-books.json': 'painted-books',
  'posts.json': 'posts/webp',
  'publishers.json': 'publishers',
  'services.json': 'services',
  'site.json': 'root',
  'timeline.json': 'books',
}

export const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.jfif', '.webp', '.svg'])

export const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jfif': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}
