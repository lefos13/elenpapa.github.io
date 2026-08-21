import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handleImagesIndex from '../handlers/images-index'
import handleUploadImage from '../handlers/upload-image'
import { createSessionToken } from '../auth'
import { AUTH_COOKIE_NAME } from '../config'

function createMockRequest(options: {
  method?: string
  url?: string
  query?: Record<string, string | string[]>
  body?: unknown
  headers?: Record<string, string>
}): VercelRequest {
  return {
    method: options.method ?? 'GET',
    url: options.url ?? '/',
    query: options.query ?? {},
    body: options.body,
    headers: options.headers ?? {},
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
  } as unknown as VercelResponse & {
    _getStatusCode: () => number
    _getBody: () => unknown
  }

  return res
}

describe('Images Endpoints', () => {
  describe('GET /api/images', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()
      await handleImagesIndex(req, res)
      assert.equal(res._getStatusCode(), 401)
    })

    it('returns image list when authenticated', async () => {
      const token = await createSessionToken({ user: 'admin' })
      const req = createMockRequest({
        method: 'GET',
        headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
      })
      const res = createMockResponse()
      await handleImagesIndex(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { images: unknown[] }
      assert.ok(Array.isArray(body.images))
    })
  })

  describe('POST /api/upload-image', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = createMockRequest({ method: 'POST', body: {} })
      const res = createMockResponse()
      await handleUploadImage(req, res)
      assert.equal(res._getStatusCode(), 401)
    })

    it('processes image upload when authenticated', async () => {
      const token = await createSessionToken({ user: 'admin' })
      // 1x1 transparent PNG base64
      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
      const req = createMockRequest({
        method: 'POST',
        headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
        body: {
          base64,
          filename: 'test-icon.png',
          activeFile: 'books.json',
        },
      })
      const res = createMockResponse()
      await handleUploadImage(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { ok: boolean; publicPath: string }
      assert.equal(body.ok, true)
      assert.ok(body.publicPath.endsWith('.webp'))
    })
  })
})
