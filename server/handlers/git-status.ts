/**
 * Why this exists:
 * Handler providing repository status (`GET /api/git/status`).
 * Returns sync state with origin/main, latest commit metadata, and pull request info.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth-guard.js'
import { getGitStatusSummary } from '../github.js'
import { isHttpError, sendJson } from '../http.js'

export default async function handleGitStatus(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    const summary = await getGitStatusSummary()

    const status = {
      ...summary,
      currentBranch: summary.branch,
      mainAhead: summary.ahead,
      mainBehind: summary.behind,
      worktreeDirty: !summary.clean,
      changeCount: summary.clean ? 0 : 1,
      changes: [],
      sync: {
        action: 'up-to-date',
        details: summary.statusText,
      },
    }

    sendJson(res, 200, { status })
  } catch (error) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, { ok: false, error: error.message })
      return
    }
    sendJson(res, 500, { ok: false, error: 'Failed to retrieve git status.' })
  }
}
