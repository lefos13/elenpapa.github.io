/**
 * Why this exists:
 * Handler for admin authentication (`POST /api/auth/login`).
 * Validates admin credentials, issues a signed JWT session cookie (`backoffice_session`),
 * and returns the authenticated user details.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  assertAuthConfigured,
  createSessionToken,
  setAuthCookie,
  verifyAdminPassword,
} from '../auth.js'
import { isHttpError, readJsonBody, sendJson } from '../http.js'

interface LoginRequestBody {
  username?: string
  password?: string
}

export default async function handleAuthLogin(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    assertAuthConfigured()
    const body = await readJsonBody<LoginRequestBody>(req, 8 * 1024)
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
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, { ok: false, error: error.message })
      return
    }
    sendJson(res, 500, {
      ok: false,
      error: 'Authentication failed.',
    })
  }
}
