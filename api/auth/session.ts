/**
 * Why this exists:
 * Vercel Serverless Function inspecting current session status (`GET /api/auth/session`).
 * Checks `backoffice_session` HttpOnly cookie or Authorization Bearer header,
 * returning authenticated status and user info.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthenticatedUser } from '../lib/auth-guard'
import { sendJson } from '../lib/http'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
