/**
 * Why this exists:
 * Centralized runtime configuration keeps the server entrypoint thin and
 * prevents scattering environment/path logic across route handlers.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(currentDir, '..', '..')

/**
 * Why this exists:
 * Config values are read during module initialization, so `.env` must load
 * before exporting env-derived constants.
 */
if (typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(path.join(projectRoot, '.env'))
}

export const paths = {
  currentDir,
  projectRoot,
  staticDir: path.join(currentDir, '..', 'public'),
}

paths.publicDir = path.join(paths.projectRoot, 'public')
paths.contentDir = path.join(paths.publicDir, 'content')
paths.imagesDir = path.join(paths.publicDir, 'images')

export const HOST = process.env.BACKOFFICE_HOST ?? '127.0.0.1'
export const PORT = Number(process.env.BACKOFFICE_PORT ?? 4310)
export const BODY_LIMIT_BYTES = 20 * 1024 * 1024
export const CREATE_PR_ON_FINALIZE =
  String(process.env.BACKOFFICE_CREATE_PR_ON_FINALIZE ?? 'false').toLowerCase() === 'true'
export const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN ?? '').trim()
export const GITHUB_OWNER = String(process.env.GITHUB_OWNER ?? '').trim()
export const GITHUB_REPO = String(process.env.GITHUB_REPO ?? '').trim()
