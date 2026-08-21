/**
 * Serverless save decisions and finalize-payload normalization stay independent
 * from request handlers so production persistence rules remain explicit and testable.
 */

import path from 'node:path'
import type { CommitFileEntry } from './github.js'
import { HttpError } from './http.js'

export type ContentSaveStrategy = 'local-filesystem' | 'browser-session' | 'unavailable'

export interface ContentSaveEnvironment {
  isVercel: boolean
  githubConfigured: boolean
}

export interface FinalizeContentInput {
  path: string
  content: unknown
  baseRevision?: string
}

export interface FinalizeAssetInput {
  path: string
  bufferBase64: string
}

export interface FinalizeChangesInput {
  files?: FinalizeContentInput[]
  assets?: FinalizeAssetInput[]
  deletedPaths?: string[]
}

export function getContentSaveStrategy({
  isVercel,
  githubConfigured,
}: ContentSaveEnvironment): ContentSaveStrategy {
  if (githubConfigured) return 'browser-session'
  return isVercel ? 'unavailable' : 'local-filesystem'
}

function normalizeManagedPath(filePath: string, kind: 'content' | 'asset'): string {
  const clean = String(filePath ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  const normalized = path.posix.normalize(clean)

  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new HttpError(400, `Invalid managed ${kind} path.`)
  }

  const isContent =
    kind === 'content' &&
    normalized.startsWith('public/content/') &&
    normalized.endsWith('.json')
  const isAsset =
    kind === 'asset' &&
    normalized.startsWith('public/images/') &&
    /\.(png|jpe?g|jfif|webp|svg)$/i.test(normalized)

  if (!isContent && !isAsset) {
    throw new HttpError(400, `Path is outside the managed ${kind} directory.`)
  }

  return normalized
}

export function buildFinalizeCommitFiles({
  files = [],
  assets = [],
  deletedPaths = [],
}: FinalizeChangesInput): CommitFileEntry[] {
  /**
   * A path-keyed map prevents ambiguous duplicate tree entries. Deletions are
   * applied last so replacing then removing an upload cannot publish stale bytes.
   */
  const commitFiles = new Map<string, CommitFileEntry>()

  for (const file of files) {
    if (!file || typeof file.path !== 'string') continue
    const repoPath = normalizeManagedPath(file.path, 'content')
    commitFiles.set(repoPath, {
      path: repoPath,
      content:
        typeof file.content === 'string'
          ? file.content
          : `${JSON.stringify(file.content, null, 2)}\n`,
    })
  }

  for (const asset of assets) {
    if (!asset || typeof asset.path !== 'string' || typeof asset.bufferBase64 !== 'string') {
      continue
    }
    const repoPath = normalizeManagedPath(asset.path, 'asset')
    const buffer = Buffer.from(asset.bufferBase64, 'base64')
    if (!buffer.length) {
      throw new HttpError(400, `Uploaded asset "${repoPath}" is empty.`)
    }
    commitFiles.set(repoPath, { path: repoPath, content: buffer })
  }

  for (const deletedPath of deletedPaths) {
    if (typeof deletedPath !== 'string') continue
    const repoPath = normalizeManagedPath(deletedPath, 'asset')
    commitFiles.set(repoPath, { path: repoPath, content: null })

    const parsed = path.posix.parse(repoPath)
    const relativeDirectory = parsed.dir.replace(/^public\/images\/?/, '')
    const supportsResponsiveVariants = [
      'posts',
      'posts/webp',
      'books',
      'painted-books',
      'moonlight',
    ].some(
      (directory) =>
        relativeDirectory === directory || relativeDirectory.startsWith(`${directory}/`),
    )

    if (supportsResponsiveVariants && parsed.ext.toLowerCase() === '.webp') {
      const canonicalName = parsed.name.replace(/-\d+w$/i, '')
      for (const width of [400, 800]) {
        const variantPath = path.posix.join(parsed.dir, `${canonicalName}-${width}w.webp`)
        commitFiles.set(variantPath, { path: variantPath, content: null })
      }
    }
  }

  return Array.from(commitFiles.values())
}
