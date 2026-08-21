/**
 * Why this exists:
 * Handler executing finalization of review sessions (`POST /api/git/finalize`).
 * Creates a unique review branch, commits modified JSON files and image buffers atomically,
 * and opens a Pull Request into main.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth-guard'
import {
  commitSessionChanges,
  createPullRequestForFinalize,
  createReviewBranch,
  readContentFileFromGit,
  type CommitFileEntry,
} from '../github'
import { readJsonBody, sendJson } from '../http'

export interface FinalizeFilePayload {
  path: string
  content: unknown
}

export interface FinalizeRequestBody {
  sessionPaths?: string[]
  commitMessage?: string
  files?: FinalizeFilePayload[]
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

  try {
    const body = await readJsonBody<FinalizeRequestBody>(req)
    const commitFiles: CommitFileEntry[] = []

    if (Array.isArray(body?.files) && body.files.length > 0) {
      for (const item of body.files) {
        if (!item || typeof item.path !== 'string') continue
        commitFiles.push({
          path: normalizeRepoPath(item.path),
          content: formatContentForCommit(item.content),
        })
      }
    } else if (Array.isArray(body?.sessionPaths) && body.sessionPaths.length > 0) {
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

    const branchName = generateReviewBranchName()
    const commitMessage = (body?.commitMessage ?? '').trim() || generateDefaultCommitMessage()

    await createReviewBranch({ branchName, baseBranch: 'main' })

    const commitResult = await commitSessionChanges({
      branch: branchName,
      files: commitFiles,
      message: commitMessage,
    })

    const prResult = await createPullRequestForFinalize({
      branchName,
      baseBranch: 'main',
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
    const message = error instanceof Error ? error.message : 'Git finalize workflow failed.'
    sendJson(res, 500, { ok: false, error: message })
  }
}
