/**
 * Why this exists:
 * Static file serving is reused for both backoffice assets and `/images/*`.
 * Keeping it isolated avoids route-handler bloat as endpoints grow.
 */
import path from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { MIME_TYPES } from '../constants.mjs'
import { sendText } from '../utils/http.mjs'

export async function serveFileFromBaseDir(res, baseDir, requestPath) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath
  const encodedPath = normalizedPath.replace(/^\/+/, '')
  let safePath = encodedPath

  try {
    safePath = decodeURIComponent(encodedPath)
  } catch {
    sendText(res, 400, 'Invalid path encoding.')
    return false
  }

  const absolutePath = path.join(baseDir, safePath)
  if (!absolutePath.startsWith(`${baseDir}${path.sep}`) && absolutePath !== baseDir) {
    sendText(res, 400, 'Invalid path.')
    return false
  }

  try {
    const fileMeta = await stat(absolutePath)
    if (!fileMeta.isFile()) return false

    const ext = path.extname(absolutePath)
    const mimeType = MIME_TYPES[ext] ?? 'application/octet-stream'
    const fileContent = await readFile(absolutePath)
    res.writeHead(200, { 'content-type': mimeType })
    res.end(fileContent)
    return true
  } catch {
    return false
  }
}
