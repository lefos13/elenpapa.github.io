/**
 * Why this exists:
 * Handler executing finalization of review sessions (`POST /api/git/finalize`).
 * Creates a unique review branch, commits modified JSON files and image buffers atomically,
 * and opens a Pull Request into main.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth-guard.js'
import { GITHUB_BRANCH } from '../config.js'
import {
  commitSessionChanges,
  createPullRequestForFinalize,
  createReviewBranch,
  deleteBranch,
  isGitHubConfigured,
  readContentFileFromGit,
  type CommitFileEntry,
} from '../github.js'
import { HttpError, isHttpError, readJsonBody, sendJson } from '../http.js'
import {
  buildFinalizeCommitFiles,
  type FinalizeAssetInput,
  type FinalizeContentInput,
} from '../serverless-workflow.js'

export interface FinalizeRequestBody {
  sessionPaths?: string[]
  commitMessage?: string
  files?: FinalizeContentInput[]
  assets?: FinalizeAssetInput[]
  deletedPaths?: string[]
}

export interface FinalizeResultPayload {
  branchName: string
  commitMessage: string
  commitSha: string
  pullRequest: {
    created: boolean
    skipped?: boolean
    url?: string
    number?: number | null
    warning?: string
    compareUrl?: string
  }
}

function normalizeRepoPath(filePath: string): string {
  const clean = filePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (clean.startsWith('public/')) return clean
  if (clean.startsWith('content/')) return `public/${clean}`
  if (clean.endsWith('.json')) return `public/content/${clean}`
  return `public/${clean}`
}

function generateReviewBranchName(date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 6)
  return `ui-backoffice-${yyyy}-${mm}-${dd}-${rand}`
}

function generateDefaultCommitMessage(date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `ui-backoffice-${yyyy}-${mm}-${dd}`
}

function formatContentForCommit(content: unknown): string | Buffer {
  if (Buffer.isBuffer(content)) return content
  if (typeof content === 'string') {
    if (content.startsWith('data:') && content.includes(';base64,')) {
      return Buffer.from(content.split(';base64,')[1], 'base64')
    }
    return content
  }
  return `${JSON.stringify(content, null, 2)}\n`
}

export default async function handleGitFinalize(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  const user = await requireAuth(req, res)
  if (!user) return

  let branchName = ''

  try {
    if (process.env.VERCEL === '1' && !isGitHubConfigured()) {
      throw new HttpError(
        503,
        'Online finalization requires GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO to be configured.',
      )
    }

    const body = await readJsonBody<FinalizeRequestBody>(req)
    let commitFiles: CommitFileEntry[] = buildFinalizeCommitFiles({
      files: body?.files,
      assets: body?.assets,
      deletedPaths: body?.deletedPaths,
    })

    /**
     * Every staged JSON file carries the GitHub revision it was loaded from.
     * Rechecking before branch creation prevents publishing over newer main content.
     */
    for (const file of body?.files ?? []) {
      if (!file?.baseRevision) continue
      const fileName = normalizeRepoPath(file.path).split('/').pop() || ''
      const current = await readContentFileFromGit({ filePath: fileName })
      if (current.sha !== file.baseRevision) {
        throw new HttpError(
          409,
          `"${fileName}" changed in GitHub after it was loaded. Reload it before finalizing.`,
        )
      }
    }

    if (!commitFiles.length && Array.isArray(body?.sessionPaths) && body.sessionPaths.length > 0) {
      commitFiles = []
      for (const rawPath of body.sessionPaths) {
        if (typeof rawPath !== 'string') continue
        const repoPath = normalizeRepoPath(rawPath)
        if (repoPath.endsWith('.json')) {
          const fileName = repoPath.split('/').pop() || ''
          try {
            const { content } = await readContentFileFromGit({ filePath: fileName })
            commitFiles.push({
              path: repoPath,
              content: formatContentForCommit(content),
            })
          } catch {
            // Ignore unreadable paths
          }
        }
      }
    }

    if (!commitFiles.length) {
      sendJson(res, 400, {
        ok: false,
        error: 'No files provided to finalize.',
      })
      return
    }

    branchName = generateReviewBranchName()
    const commitMessage = (body?.commitMessage ?? '').trim() || generateDefaultCommitMessage()
    const baseBranch = GITHUB_BRANCH || 'main'

    await createReviewBranch({ branchName, baseBranch })

    const commitResult = await commitSessionChanges({
      branch: branchName,
      files: commitFiles,
      message: commitMessage,
    })

    const prResult = await createPullRequestForFinalize({
      branchName,
      baseBranch,
      commitMessage,
    })

    const responsePayload: { result: FinalizeResultPayload } = {
      result: {
        branchName,
        commitMessage,
        commitSha: commitResult.commitSha,
        pullRequest: prResult,
      },
    }

    sendJson(res, 200, responsePayload)
  } catch (error) {
    if (branchName) {
      await deleteBranch({ branchName }).catch(() => undefined)
    }

    if (isHttpError(error)) {
      sendJson(res, error.statusCode, { ok: false, error: error.message, details: error.details })
      return
    }

    const message = error instanceof Error ? error.message : 'Git finalize workflow failed.'
    sendJson(res, 500, { ok: false, error: message })
  }
}
