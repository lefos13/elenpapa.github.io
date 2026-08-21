/**
 * Why this exists:
 * Handles on-demand Pull Request creation for existing review branches (`POST /api/git/create-pr`).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth-guard.js'
import { GITHUB_BRANCH } from '../config.js'
import { createPullRequestForFinalize, getCompareUrl } from '../github.js'
import { HttpError, isHttpError, readJsonBody, sendJson } from '../http.js'

export interface CreatePrRequestBody {
  branchName: string
  commitMessage?: string
  title?: string
  body?: string
}

export default async function handleGitCreatePr(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    const body = await readJsonBody<CreatePrRequestBody>(req)
    const branchName = String(body?.branchName ?? '').trim()
    if (!branchName) {
      throw new HttpError(400, 'branchName is required.')
    }

    const prResult = await createPullRequestForFinalize({
      branchName,
      baseBranch: GITHUB_BRANCH || 'main',
      commitMessage: body?.commitMessage,
      title: body?.title,
      body: body?.body,
    })

    sendJson(res, 200, {
      pullRequest: {
        ...prResult,
        compareUrl: getCompareUrl(branchName),
      },
    })
  } catch (error) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, { ok: false, error: error.message })
      return
    }
    const message = error instanceof Error ? error.message : 'PR creation failed.'
    sendJson(res, 500, { ok: false, error: message })
  }
}
