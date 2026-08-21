import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handleAuthLogin from '../handlers/auth-login'
import handleAuthLogout from '../handlers/auth-logout'
import handleAuthSession from '../handlers/auth-session'
import { createSessionToken } from '../auth'
import { AUTH_COOKIE_NAME } from '../config'

function createMockRequest(options: {
  method?: string
  url?: string
  body?: unknown
  headers?: Record<string, string>
}): VercelRequest {
  return {
    method: options.method ?? 'GET',
    url: options.url ?? '/',
    body: options.body,
    headers: options.headers ?? {},
    query: {},
  } as unknown as VercelRequest
}

function createMockResponse() {
  const headers: Record<string, string | string[]> = {}
  let statusCode = 200
  let body: unknown = null

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
      return res
    },
    _getStatusCode() {
      return statusCode
    },
    _getBody() {
      return body
    },
    _getHeaders() {
      return headers
    },
  } as unknown as VercelResponse & {
    _getStatusCode: () => number
    _getBody: () => unknown
    _getHeaders: () => Record<string, string | string[]>
  }

  return res
}

describe('Auth Endpoints', () => {
  describe('POST /api/auth/login', () => {
    it('returns 405 for non-POST requests', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()
      await handleAuthLogin(req, res)
      assert.equal(res._getStatusCode(), 405)
    })

    it('returns 401 for missing or incorrect password', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { password: 'wrong-password' },
        headers: { 'content-type': 'application/json' },
      })
      const res = createMockResponse()
      await handleAuthLogin(req, res)
      assert.equal(res._getStatusCode(), 401)
    })

    it('returns 200 and sets cookie on successful login', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { password: 'admin', username: 'admin' },
        headers: { 'content-type': 'application/json' },
      })
      const res = createMockResponse()
      await handleAuthLogin(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { ok: boolean; user: string }
      assert.equal(body.ok, true)
      assert.equal(body.user, 'admin')
      const setCookie = res._getHeaders()['set-cookie']
      assert.ok(setCookie)
      assert.ok(String(setCookie).includes(AUTH_COOKIE_NAME))
    })
  })

  describe('POST /api/auth/logout', () => {
    it('clears auth cookie and returns ok: true', async () => {
      const req = createMockRequest({ method: 'POST' })
      const res = createMockResponse()
      await handleAuthLogout(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { ok: boolean }
      assert.equal(body.ok, true)
      const setCookie = res._getHeaders()['set-cookie']
      assert.ok(setCookie)
      assert.ok(String(setCookie).includes('Max-Age=0'))
    })
  })

  describe('GET /api/auth/session', () => {
    it('returns authenticated: false when unauthenticated', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()
      await handleAuthSession(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { authenticated: boolean }
      assert.equal(body.authenticated, false)
    })

    it('returns authenticated: true when valid cookie is provided', async () => {
      const token = await createSessionToken({ user: 'admin' })
      const req = createMockRequest({
        method: 'GET',
        headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
      })
      const res = createMockResponse()
      await handleAuthSession(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { authenticated: boolean; user: string }
      assert.equal(body.authenticated, true)
      assert.equal(body.user, 'admin')
    })
  })
})
