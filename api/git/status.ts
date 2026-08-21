/**
 * Why this exists:
 * Vercel Serverless Function providing repository status (`GET /api/git/status`).
 * Returns sync state with origin/main, latest commit metadata, and pull request info.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getGitStatusSummary } from '../lib/github'
import { sendJson } from '../lib/http'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const summary = await getGitStatusSummary()

    // Provide complete status including backward-compatible properties for admin UI
    const status = {
      ...summary,
      currentBranch: summary.branch,
      mainAhead: summary.ahead,
      mainBehind: summary.behind,
      worktreeDirty: !summary.clean,
      changeCount: summary.clean ? 0 : 1,
      changes: [],
      sync: {
        action: summary.configured ? 'up-to-date' : 'up-to-date',
        details: summary.statusText,
      },
    }

    sendJson(res, 200, { status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve git status.'
    sendJson(res, 500, { ok: false, error: message })
  }
}
