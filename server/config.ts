/**
 * Why this exists:
 * Centralized runtime configuration and constants for the Vercel Serverless API.
 * Encapsulates environment variable reading, defaults, and content/image routing rules.
 */

export const GITHUB_TOKEN: string = String(process.env.GITHUB_TOKEN ?? '').trim()
export const GITHUB_OWNER: string = String(process.env.GITHUB_OWNER ?? '').trim()
export const GITHUB_REPO: string = String(process.env.GITHUB_REPO ?? '').trim()
export const GITHUB_BRANCH: string = String(process.env.GITHUB_BRANCH ?? 'main').trim()

export const AUTH_SECRET: string = String(
  process.env.AUTH_SECRET ??
    process.env.JWT_SECRET ??
    'development-insecure-auth-secret-key-change-in-production',
).trim()

export const ADMIN_PASSWORD: string = String(process.env.ADMIN_PASSWORD ?? 'admin')
export const ADMIN_PASSWORD_HASH: string = String(process.env.ADMIN_PASSWORD_HASH ?? '').trim()

export const CREATE_PR_ON_FINALIZE: boolean =
  String(
    process.env.CREATE_PR_ON_FINALIZE ?? process.env.BACKOFFICE_CREATE_PR_ON_FINALIZE ?? 'false',
  ).toLowerCase() === 'true'

export const AUTH_COOKIE_NAME: string = String(process.env.AUTH_COOKIE_NAME ?? 'backoffice_session')

export const BODY_LIMIT_BYTES: number = 20 * 1024 * 1024
export const MAX_UPLOAD_BYTES: number = 12 * 1024 * 1024

/**
 * Maps content JSON filenames to their primary image target directory under `public/images/`.
 */
export const IMAGE_FOLDER_BY_FILE: Record<string, string> = {
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

/**
 * Image extensions supported by backoffice uploads and media indexing.
 */
export const ALLOWED_IMAGE_EXTENSIONS: Set<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.webp',
  '.svg',
])

/**
 * Human-readable usage references for each content file, displayed in the backoffice editor.
 */
export const FILE_USAGE_REFERENCES: Record<string, string[]> = {
  'book.json': ['Book page (/book)'],
  'contact.json': ['Home page contact section (/)'],
  'home.json': ['Home page hero/intro (/)'],
  'moonlight.json': ['Moonlight page (/moonlight)'],
  'painted-books.json': ['Painted Books page (/painted-books)'],
  'posts.json': ['Home page posts carousel (/)', 'Post pages (/posts/:id)'],
  'publishers.json': ['Home page publishers section (/)'],
  'services.json': ['Home page services section (/)'],
  'site.json': ['Global layout: header/footer/SEO (all pages)'],
  'timeline.json': ['Timeline page (/timeline)', 'Home page timeline carousel (/)'],
}

/**
 * Rules specifying fields whose image paths should retain original extensions or paths.
 */
export const ORIGINAL_PATH_RULES: Array<{ file: string; pattern: RegExp }> = [
  { file: 'site.json', pattern: /^logo\.src$/ },
  { file: 'site.json', pattern: /^seo\./ },
]

/**
 * Rules specifying target folder overrides for specific content fields.
 */
export const FOLDER_OVERRIDE_RULES: Array<{
  file: string
  pattern: RegExp
  folder: string
}> = [{ file: 'site.json', pattern: /^seo\.pages\.[^.]+\.image$/, folder: 'og' }]

/**
 * Standard MIME types used for HTTP headers.
 */
export const MIME_TYPES: Record<string, string> = {
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
