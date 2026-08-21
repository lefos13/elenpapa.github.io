/**
 * Why this exists:
 * Vercel Serverless Function finalizing a backoffice editing session (`POST /api/git/finalize`).
 * Creates a unique review branch, commits modified JSON files and image assets atomically,
 * and opens an automated GitHub Pull Request into the base branch (`main`).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../lib/auth-guard'
import {
  commitSessionChanges,
  createPullRequestForFinalize,
  createReviewBranch,
  readContentFileFromGit,
  type CommitFileEntry,
} from '../lib/github'
import { readJsonBody, sendJson } from '../lib/http'

export interface FinalizeFilePayload {
  path: string
  content: string | Buffer | Record<string, unknown> | unknown[]
}

export interface FinalizeRequestBody {
  sessionPaths?: string[]
  commitMessage?: string
  files?: FinalizeFilePayload[]
}

export interface FinalizeResultPayload {
  result: {
    branchName: string
    commitMessage: string
    commitSha: string
    pullRequest: {
      created: boolean
      url?: string
      number?: number
      warning?: string
      skipped?: boolean
    }
  }
}

/**
 * Normalizes content path to repository root relative path.
 */
function normalizeRepoPath(filePath: string): string {
  const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')
  if (cleanPath.startsWith('public/')) {
    return cleanPath
  }
  if (cleanPath.startsWith('content/') || cleanPath.startsWith('images/')) {
    return `public/${cleanPath}`
  }
  if (!cleanPath.includes('/')) {
    return `public/content/${cleanPath}`
  }
  return cleanPath
}

/**
 * Generates an automated branch name following ui-backoffice-YYYY-MM-DD-xxxx convention.
 */
function generateReviewBranchName(date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const randomSuffix = Math.random().toString(36).slice(2, 6)
  return `ui-backoffice-${yyyy}-${mm}-${dd}-${randomSuffix}`
}

/**
 * Generates a default commit message.
 */
function generateDefaultCommitMessage(date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `ui-backoffice-${yyyy}-${mm}-${dd}`
}

/**
 * Formats incoming content representation into string or Buffer for Git Blob creation.
 */
function formatContentForCommit(content: unknown): string | Buffer {
  if (Buffer.isBuffer(content)) {
    return content
  }
  if (typeof content === 'string') {
    return content
  }
  if (typeof content === 'object' && content !== null) {
    return JSON.stringify(content, null, 2) + '\n'
  }
  return String(content ?? '')
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  // 1. Authentication check
  const authUser = await requireAuth(req, res)
  if (!authUser) {
    return
  }

  try {
    const body = await readJsonBody<FinalizeRequestBody>(req)
    const filesToCommit: CommitFileEntry[] = []

    // 2. Process directly provided files
    if (Array.isArray(body?.files) && body.files.length > 0) {
      for (const item of body.files) {
        if (item && typeof item.path === 'string' && item.path.trim()) {
          const repoPath = normalizeRepoPath(item.path)
          filesToCommit.push({
            path: repoPath,
            content: formatContentForCommit(item.content),
          })
        }
      }
    }

    // 3. If files list was not provided, read content from sessionPaths
    if (
      filesToCommit.length === 0 &&
      Array.isArray(body?.sessionPaths) &&
      body.sessionPaths.length > 0
    ) {
      for (const rawPath of body.sessionPaths) {
        if (typeof rawPath !== 'string' || !rawPath.trim()) continue
        const repoPath = normalizeRepoPath(rawPath)
        try {
          const fileResult = await readContentFileFromGit({ filePath: repoPath })
          filesToCommit.push({
            path: repoPath,
            content: fileResult.rawText,
          })
        } catch {
          // If file could not be read (e.g. deleted or binary image asset), continue
        }
      }
    }

    if (filesToCommit.length === 0) {
      sendJson(res, 400, {
        ok: false,
        error: 'Cannot finalize review: no valid files or sessionPaths provided to commit.',
      })
      return
    }

    const now = new Date()
    const branchName = generateReviewBranchName(now)
    const commitMessage =
      typeof body?.commitMessage === 'string' && body.commitMessage.trim().length > 0
        ? body.commitMessage.trim()
        : generateDefaultCommitMessage(now)

    // 4. Create review branch
    await createReviewBranch({ branchName })

    // 5. Commit session changes
    const commitResult = await commitSessionChanges({
      branch: branchName,
      files: filesToCommit,
      message: commitMessage,
    })

    // 6. Create pull request
    const prResult = await createPullRequestForFinalize({
      branchName,
      commitMessage,
    })

    sendJson(res, 200, {
      result: {
        branchName,
        commitMessage,
        commitSha: commitResult.commitSha,
        pullRequest: {
          created: prResult.created,
          url: prResult.url,
          number: prResult.number ?? undefined,
          warning: prResult.warning,
          skipped: prResult.skipped,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to finalize review.'
    sendJson(res, 500, {
      ok: false,
      error: message,
    })
  }
}
