/**
 * Why this exists:
 * Request guard to authenticate backoffice API endpoints via session cookie
 * or Authorization Bearer header, responding with 401 if unauthenticated.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseCookies, verifySessionToken, type SessionPayload } from './auth'
import { AUTH_COOKIE_NAME } from './config'
import { sendJson } from './http'

/**
 * Extracts session token from incoming request (Cookie first, then Bearer header).
 */
export async function getAuthenticatedUser(req: IncomingMessage): Promise<SessionPayload | null> {
  const cookies = parseCookies(req)
  const cookieToken = cookies[AUTH_COOKIE_NAME]

  if (cookieToken) {
    const payload = await verifySessionToken(cookieToken)
    if (payload) return payload
  }

  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim()
    const payload = await verifySessionToken(bearerToken)
    if (payload) return payload
  }

  return null
}

/**
 * Ensures the request is authenticated.
 * Returns the authenticated user session payload, or sends a 401 response and returns null.
 */
export async function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<SessionPayload | null> {
  const user = await getAuthenticatedUser(req)

  if (!user) {
    sendJson(res, 401, {
      ok: false,
      error: 'Unauthorized',
      message: 'Authentication required to access this endpoint.',
    })
    return null
  }

  return user
}
