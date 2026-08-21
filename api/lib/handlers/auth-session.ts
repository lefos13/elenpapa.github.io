/**
 * Why this exists:
 * Handler for inspecting current session status (`GET /api/auth/session`).
 * Checks `backoffice_session` HttpOnly cookie or Authorization Bearer header,
 * returning authenticated status and user info.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthenticatedUser } from '../auth-guard'
import { sendJson } from '../http'

export default async function handleAuthSession(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  const user = await getAuthenticatedUser(req)

  if (user) {
    sendJson(res, 200, {
      authenticated: true,
      user: user.user,
    })
    return
  }

  sendJson(res, 200, {
    authenticated: false,
  })
}
