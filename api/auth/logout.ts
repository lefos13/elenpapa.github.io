/**
 * Why this exists:
 * Vercel Serverless Function handling admin session termination (`POST /api/auth/logout`).
 * Clears the `backoffice_session` HttpOnly cookie and responds with success.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearAuthCookie } from '../lib/auth'
import { sendJson } from '../lib/http'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  clearAuthCookie(res)

  sendJson(res, 200, {
    ok: true,
  })
}
