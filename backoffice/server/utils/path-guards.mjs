/**
 * Why this exists:
 * Every API path touching the filesystem goes through these guards to prevent
 * directory traversal and to keep writes scoped to allowed project folders.
 */
import path from 'node:path'
import { paths } from '../config.mjs'

function resolveSafePath(baseDir, relativePath) {
  const fullPath = path.resolve(baseDir, relativePath)
  if (!fullPath.startsWith(`${baseDir}${path.sep}`) && fullPath !== baseDir) {
    throw new Error('Invalid file path.')
  }
  return fullPath
}

export function getSafeContentPath(relativePath) {
  const requestedPath = decodeURIComponent(relativePath).replace(/^\/+/, '')
  if (!requestedPath.endsWith('.json')) {
    throw new Error('Only .json files are supported.')
  }
  return resolveSafePath(paths.contentDir, requestedPath)
}

export function getSafeImagePath(publicImagePath) {
  const requestedPath = decodeURIComponent(publicImagePath).replace(/^\/+/, '')
  const normalizedPath = requestedPath.startsWith('images/')
    ? requestedPath
    : `images/${requestedPath}`
  return resolveSafePath(paths.publicDir, normalizedPath)
}
