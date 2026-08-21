/**
 * Why this exists:
 * Authentication utilities for signing/verifying session tokens via `jose`,
 * managing secure HttpOnly session cookies, and validating admin credentials.
 */

import crypto from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { ADMIN_PASSWORD, ADMIN_PASSWORD_HASH, AUTH_COOKIE_NAME, AUTH_SECRET } from './config.js'

export interface SessionPayload extends JWTPayload {
  user: string
  role?: string
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(AUTH_SECRET)
}

/**
 * Appends a header to a ServerResponse without overwriting existing entries.
 */
function appendHeader(res: ServerResponse, name: string, value: string): void {
  const existing = res.getHeader(name)
  if (!existing) {
    res.setHeader(name, value)
  } else if (Array.isArray(existing)) {
    res.setHeader(name, [...existing, value])
  } else {
    res.setHeader(name, [String(existing), value])
  }
}

/**
 * Creates an HMAC SHA-256 signed JWT session token with a default 7-day expiration.
 */
export async function createSessionToken(
  payload: { user: string; role?: string; [key: string]: unknown },
  expiresIn: string = '7d',
): Promise<string> {
  const secretKey = getSecretKey()
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey)
}

/**
 * Verifies a JWT session token and returns the decoded payload, or null if invalid/expired.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const secretKey = getSecretKey()
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    })
    return payload as SessionPayload
  } catch {
    return null
  }
}

/**
 * Parses all cookies from the incoming request's `Cookie` header into a key-value record.
 */
export function parseCookies(req: IncomingMessage): Record<string, string> {
  const cookieHeader = req.headers.cookie
  const cookies: Record<string, string> = {}
  if (!cookieHeader) return cookies

  const parts = cookieHeader.split(';')
  for (let i = 0; i < parts.length; i++) {
    const cookie = parts[i]?.trim()
    if (!cookie) continue
    const eqIdx = cookie.indexOf('=')
    if (eqIdx !== -1) {
      const key = cookie.substring(0, eqIdx).trim()
      const val = cookie.substring(eqIdx + 1).trim()
      cookies[key] = decodeURIComponent(val)
    }
  }

  return cookies
}

/**
 * Sets an HttpOnly, Secure (in production), SameSite=Lax session cookie on the response.
 */
export function setAuthCookie(
  res: ServerResponse,
  token: string,
  maxAgeSeconds: number = 7 * 24 * 60 * 60,
): void {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
  const secureFlag = isProduction ? '; Secure' : ''
  const cookieValue = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly${secureFlag}; SameSite=Lax`
  appendHeader(res, 'Set-Cookie', cookieValue)
}

/**
 * Clears the session cookie by setting Max-Age to 0 and expiration in the past.
 */
export function clearAuthCookie(res: ServerResponse): void {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
  const secureFlag = isProduction ? '; Secure' : ''
  const cookieValue = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`
  appendHeader(res, 'Set-Cookie', cookieValue)
}

/**
 * Validates the submitted admin password against ADMIN_PASSWORD_HASH or ADMIN_PASSWORD using timing-safe comparisons.
 */
export function verifyAdminPassword(password: string): boolean {
  if (!password) return false

  // 1. If ADMIN_PASSWORD_HASH (SHA-256 hex) is provided
  if (ADMIN_PASSWORD_HASH) {
    const computedHash = crypto.createHash('sha256').update(password).digest('hex')
    const computedBuf = Buffer.from(computedHash, 'utf-8')
    const expectedBuf = Buffer.from(ADMIN_PASSWORD_HASH, 'utf-8')

    if (computedBuf.length !== expectedBuf.length) {
      crypto.timingSafeEqual(computedBuf, computedBuf)
      return false
    }
    return crypto.timingSafeEqual(computedBuf, expectedBuf)
  }

  // 2. Direct comparison with ADMIN_PASSWORD (default 'admin' for local dev)
  const inputBuf = Buffer.from(password, 'utf-8')
  const expectedBuf = Buffer.from(ADMIN_PASSWORD, 'utf-8')

  if (inputBuf.length !== expectedBuf.length) {
    crypto.timingSafeEqual(inputBuf, inputBuf)
    return false
  }

  return crypto.timingSafeEqual(inputBuf, expectedBuf)
}
