/**
 * Why this exists:
 * Optimistic concurrency requires a stable revision token so the server can
 * reject saves when file content changed outside the current editor session.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { getSafeContentPath } from '../utils/path-guards.mjs'

function toRevisionToken(rawContent) {
  return createHash('sha1').update(rawContent).digest('hex')
}

export async function getContentRevision(filePath) {
  const absolutePath = getSafeContentPath(filePath)
  const rawContent = await readFile(absolutePath, 'utf-8')
  return toRevisionToken(rawContent)
}

export async function assertBaseRevision(filePath, baseRevision) {
  const currentRevision = await getContentRevision(filePath)
  if (!baseRevision) {
    return { currentRevision, matched: true }
  }

  const matched = currentRevision === String(baseRevision)
  return { currentRevision, matched }
}
