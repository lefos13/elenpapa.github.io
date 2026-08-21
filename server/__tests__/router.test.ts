import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import routerHandler from '../router.js'
import { createSessionToken } from '../auth.js'
import { AUTH_COOKIE_NAME } from '../config.js'

function createMockRequest(options: {
  method?: string
  url?: string
  query?: Record<string, string | string[]>
  body?: unknown
  headers?: Record<string, string>
}): VercelRequest {
  return {
    method: options.method ?? 'GET',
    url: options.url ?? '/api/files',
    query: options.query ?? {},
    body: options.body,
    headers: options.headers ?? {},
  } as unknown as VercelRequest
}

function createMockResponse() {
  const headers: Record<string, string | string[]> = {}
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
    _getStatusCode: () => number
    _getBody: () => unknown
    _isEnded: () => boolean
  }

  return res
}

describe('Unified Catch-All Router (api/[...path].ts)', () => {
  it('routes GET /api/auth/session', async () => {
    const req = createMockRequest({ method: 'GET', url: '/api/auth/session' })
    const res = createMockResponse()

    await routerHandler(req, res)

    assert.equal(res._getStatusCode(), 200)
    const body = res._getBody() as { authenticated: boolean }
    assert.equal(body.authenticated, false)
  })

  it('routes POST /api/auth/login and sets session', async () => {
    const req = createMockRequest({
      method: 'POST',
      url: '/api/auth/login',
      body: { password: 'admin', username: 'editor' },
      headers: { 'content-type': 'application/json' },
    })
    const res = createMockResponse()

    await routerHandler(req, res)

    assert.equal(res._getStatusCode(), 200)
    const body = res._getBody() as { ok: boolean; user: string }
    assert.equal(body.ok, true)
    assert.equal(body.user, 'editor')
  })

  it('routes GET /api/files', async () => {
    const req = createMockRequest({ method: 'GET', url: '/api/files' })
    const res = createMockResponse()

    await routerHandler(req, res)

    assert.equal(res._getStatusCode(), 200)
    const body = res._getBody() as { files: string[] }
    assert.ok(Array.isArray(body.files))
    assert.ok(body.files.includes('site.json'))
  })

  it('routes GET /api/files/contact.json', async () => {
    const req = createMockRequest({ method: 'GET', url: '/api/files/contact.json' })
    const res = createMockResponse()

    await routerHandler(req, res)

    assert.equal(res._getStatusCode(), 200)
    const body = res._getBody() as { file: string; content: unknown }
    assert.equal(body.file, 'contact.json')
    assert.ok(body.content)
  })

  it('routes GET /api/schemas/book.json', async () => {
    const req = createMockRequest({ method: 'GET', url: '/api/schemas/book.json' })
    const res = createMockResponse()

    await routerHandler(req, res)

    assert.equal(res._getStatusCode(), 200)
    const body = res._getBody() as { schema: { id: string } }
    assert.equal(body.schema.id, 'book.json')
  })

  it('routes GET /api/git/status', async () => {
    const req = createMockRequest({ method: 'GET', url: '/api/git/status' })
    const res = createMockResponse()

    await routerHandler(req, res)

    assert.equal(res._getStatusCode(), 200)
    const body = res._getBody() as { status: { branch: string } }
    assert.ok(body.status)
  })

  it('routes GET /api/images with authentication', async () => {
    const token = await createSessionToken({ user: 'admin' })
    const req = createMockRequest({
      method: 'GET',
      url: '/api/images',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
    })
    const res = createMockResponse()

    await routerHandler(req, res)

    assert.equal(res._getStatusCode(), 200)
    const body = res._getBody() as { images: unknown[] }
    assert.ok(Array.isArray(body.images))
  })

  it('returns 404 for unknown API route', async () => {
    const req = createMockRequest({ method: 'GET', url: '/api/nonexistent-route' })
    const res = createMockResponse()

    await routerHandler(req, res)

    assert.equal(res._getStatusCode(), 404)
    const body = res._getBody() as { ok: boolean; error: string }
    assert.equal(body.ok, false)
    assert.ok(body.error.includes('not found'))
  })
})
