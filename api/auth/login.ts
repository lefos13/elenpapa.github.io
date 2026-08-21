/**
 * Why this exists:
 * Vercel Serverless Function handling admin authentication (`POST /api/auth/login`).
 * Validates admin credentials, issues a signed JWT session cookie (`backoffice_session`),
 * and returns the authenticated user details.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createSessionToken, setAuthCookie, verifyAdminPassword } from '../lib/auth'
import { readJsonBody, sendJson } from '../lib/http'

interface LoginRequestBody {
  username?: string
  password?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const body = await readJsonBody<LoginRequestBody>(req)
    const password = typeof body?.password === 'string' ? body.password : ''
    const username =
      typeof body?.username === 'string' && body.username.trim().length > 0
        ? body.username.trim()
        : 'admin'

    if (!verifyAdminPassword(password)) {
      sendJson(res, 401, {
        ok: false,
        error: 'Invalid admin credentials.',
      })
      return
    }

    const token = await createSessionToken({ user: username })
    setAuthCookie(res, token)

    sendJson(res, 200, {
      ok: true,
      user: username,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed.'
    sendJson(res, 500, {
      ok: false,
      error: message,
    })
  }
}
