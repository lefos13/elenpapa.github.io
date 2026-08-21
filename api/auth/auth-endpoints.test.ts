import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import loginHandler from './login'
import logoutHandler from './logout'
import sessionHandler from './session'
import { createSessionToken } from '../lib/auth'

interface MockResponseOptions {
  headers?: Record<string, string | string[]>
}

function createMockResponse(options: MockResponseOptions = {}) {
  const headers: Record<string, string | string[]> = { ...(options.headers ?? {}) }
  let statusCode = 200
  let body: unknown = null
  let ended = false

  const res = {
    statusCode,
    getHeader(name: string) {
      return headers[name.toLowerCase()] ?? headers[name]
    },
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value
      return res
    },
    status(code: number) {
      statusCode = code
      res.statusCode = code
      return res
    },
    json(data: unknown) {
      body = data
      ended = true
      return res
    },
    writeHead(code: number, responseHeaders?: Record<string, string>) {
      statusCode = code
      res.statusCode = code
      if (responseHeaders) {
        for (const [k, v] of Object.entries(responseHeaders)) {
          headers[k.toLowerCase()] = v
        }
      }
      return res
    },
    end(data?: string) {
      if (data && body === null) {
        try {
          body = JSON.parse(data)
        } catch {
          body = data
        }
      }
      ended = true
      return res
    },
    _getHeaders() {
      return headers
    },
    _getStatusCode() {
      return statusCode
    },
    _getBody() {
      return body
    },
    _isEnded() {
      return ended
    },
  } as unknown as VercelResponse & {
    _getHeaders: () => Record<string, string | string[]>
    _getStatusCode: () => number
    _getBody: () => unknown
    _isEnded: () => boolean
  }

  return res
}

function createMockRequest(options: {
  method?: string
  headers?: Record<string, string>
  body?: unknown
}): VercelRequest {
  return {
    method: options.method ?? 'GET',
    headers: options.headers ?? {},
    body: options.body,
  } as unknown as VercelRequest
}

describe('Auth Endpoints', () => {
  describe('POST /api/auth/login', () => {
    it('returns 405 for non-POST requests', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()

      await loginHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
      assert.deepEqual(res._getBody(), { ok: false, error: 'Method not allowed' })
    })

    it('returns 401 for missing or incorrect password', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { password: 'wrong-password' },
      })
      const res = createMockResponse()

      await loginHandler(req, res)

      assert.equal(res._getStatusCode(), 401)
      const body = res._getBody() as { ok: boolean; error: string }
      assert.equal(body.ok, false)
      assert.equal(body.error, 'Invalid admin credentials.')
    })

    it('returns 200, sets cookie, and defaults user to admin on successful login', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { password: 'admin' },
      })
      const res = createMockResponse()

      await loginHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { ok: boolean; user: string }
      assert.equal(body.ok, true)
      assert.equal(body.user, 'admin')

      const setCookie = res._getHeaders()['set-cookie']
      assert.ok(setCookie, 'Set-Cookie header must be present')
      const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie)
      assert.ok(cookieStr.includes('backoffice_session='))
      assert.ok(cookieStr.includes('HttpOnly'))
      assert.ok(cookieStr.includes('SameSite=Lax'))
    })

    it('returns 200 and uses provided username', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { password: 'admin', username: 'custom-editor' },
      })
      const res = createMockResponse()

      await loginHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { ok: boolean; user: string }
      assert.equal(body.ok, true)
      assert.equal(body.user, 'custom-editor')
    })
  })

  describe('POST /api/auth/logout', () => {
    it('returns 405 for non-POST requests', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()

      await logoutHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
      assert.deepEqual(res._getBody(), { ok: false, error: 'Method not allowed' })
    })

    it('clears auth cookie and returns ok: true', async () => {
      const req = createMockRequest({ method: 'POST' })
      const res = createMockResponse()

      await logoutHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      assert.deepEqual(res._getBody(), { ok: true })

      const setCookie = res._getHeaders()['set-cookie']
      assert.ok(setCookie, 'Set-Cookie header must be present')
      const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie)
      assert.ok(cookieStr.includes('Max-Age=0'))
    })
  })

  describe('GET /api/auth/session', () => {
    it('returns 405 for non-GET requests', async () => {
      const req = createMockRequest({ method: 'POST' })
      const res = createMockResponse()

      await sessionHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
      assert.deepEqual(res._getBody(), { ok: false, error: 'Method not allowed' })
    })

    it('returns authenticated: false when no session cookie or token provided', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()

      await sessionHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      assert.deepEqual(res._getBody(), { authenticated: false })
    })

    it('returns authenticated: true and username with valid session cookie', async () => {
      const token = await createSessionToken({ user: 'cookie-user' })
      const req = createMockRequest({
        method: 'GET',
        headers: {
          cookie: `backoffice_session=${token}`,
        },
      })
      const res = createMockResponse()

      await sessionHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      assert.deepEqual(res._getBody(), { authenticated: true, user: 'cookie-user' })
    })

    it('returns authenticated: true and username with valid Bearer token', async () => {
      const token = await createSessionToken({ user: 'bearer-user' })
      const req = createMockRequest({
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
        },
      })
      const res = createMockResponse()

      await sessionHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      assert.deepEqual(res._getBody(), { authenticated: true, user: 'bearer-user' })
    })

    it('returns authenticated: false when invalid session token provided', async () => {
      const req = createMockRequest({
        method: 'GET',
        headers: {
          cookie: 'backoffice_session=invalid-token',
        },
      })
      const res = createMockResponse()

      await sessionHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      assert.deepEqual(res._getBody(), { authenticated: false })
    })
  })
})
