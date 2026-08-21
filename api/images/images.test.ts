import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import imagesHandler from './index'
import uploadImageHandler from '../upload-image'
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
    get statusCode() {
      return statusCode
    },
    set statusCode(code: number) {
      statusCode = code
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()] ?? headers[name]
    },
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value
      return res
    },
    status(code: number) {
      statusCode = code
      return res
    },
    json(data: unknown) {
      body = data
      ended = true
      return res
    },
    writeHead(code: number, responseHeaders?: Record<string, string>) {
      statusCode = code
      if (responseHeaders) {
        Object.entries(responseHeaders).forEach(([k, v]) => {
          headers[k.toLowerCase()] = v
        })
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
    _getHeaders(): Record<string, string | string[]>
    _getStatusCode(): number
    _getBody(): unknown
    _isEnded(): boolean
  }

  return res
}

function createMockRequest(options: {
  method?: string
  headers?: Record<string, string>
  query?: Record<string, string | string[]>
  body?: unknown
}): VercelRequest {
  const req = {
    method: options.method ?? 'GET',
    headers: options.headers ?? {},
    query: options.query ?? {},
    body: options.body,
    on: (_event: string, callback: () => void) => {
      if (_event === 'end') callback()
      return req
    },
  } as unknown as VercelRequest
  return req
}

// 1x1 transparent PNG base64 for testing
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// Simple valid SVG string base64
const SAMPLE_SVG_BASE64 = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red" /></svg>',
).toString('base64')

describe('Media & Image API Endpoints', () => {
  describe('GET /api/images', () => {
    it('returns 405 for non-GET HTTP methods', async () => {
      const req = createMockRequest({ method: 'POST' })
      const res = createMockResponse()

      await imagesHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
      const body = res._getBody() as { ok: boolean; error: string }
      assert.equal(body.ok, false)
      assert.equal(body.error, 'Method not allowed')
    })

    it('returns 401 when unauthenticated', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()

      await imagesHandler(req, res)

      assert.equal(res._getStatusCode(), 401)
      const body = res._getBody() as { ok: boolean; error: string }
      assert.equal(body.ok, false)
      assert.equal(body.error, 'Unauthorized')
    })

    it('returns image list with mapped usages for authenticated user', async () => {
      const token = await createSessionToken({ user: 'test-admin' })
      const req = createMockRequest({
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
        },
      })
      const res = createMockResponse()

      await imagesHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { ok: boolean; images: unknown[] }
      assert.equal(body.ok, true)
      assert.ok(Array.isArray(body.images))
      assert.ok(body.images.length > 0)

      const firstImage = body.images[0] as {
        name: string
        relativePath: string
        publicPath: string
        bytes: number
        sizeLabel: string
        section: string
        usages: Array<{ file: string; jsonPath: string }>
      }
      assert.ok(typeof firstImage.name === 'string')
      assert.ok(typeof firstImage.relativePath === 'string')
      assert.ok(firstImage.publicPath.startsWith('/images/'))
      assert.ok(typeof firstImage.sizeLabel === 'string')
      assert.ok(Array.isArray(firstImage.usages))
    })

    it('filters images when ?q= search parameter is provided', async () => {
      const token = await createSessionToken({ user: 'test-admin' })
      const req = createMockRequest({
        method: 'GET',
        query: { q: 'logo' },
        headers: {
          authorization: `Bearer ${token}`,
        },
      })
      const res = createMockResponse()

      await imagesHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        ok: boolean
        images: Array<{
          name: string
          relativePath: string
          publicPath: string
          section: string
          usages: Array<{ file: string; jsonPath: string }>
        }>
      }
      assert.ok(
        body.images.every((img) => {
          const usageString = img.usages.map((u) => `${u.file} ${u.jsonPath}`).join(' ')
          const allText =
            `${img.name} ${img.relativePath} ${img.publicPath} ${img.section} ${usageString}`.toLowerCase()
          return allText.includes('logo')
        }),
      )
    })
  })

  describe('POST /api/upload-image', () => {
    it('returns 405 for non-POST HTTP methods', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()

      await uploadImageHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
      const body = res._getBody() as { ok: boolean; error: string }
      assert.equal(body.ok, false)
    })

    it('returns 401 when unauthenticated', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { base64: SAMPLE_PNG_BASE64 },
      })
      const res = createMockResponse()

      await uploadImageHandler(req, res)

      assert.equal(res._getStatusCode(), 401)
    })

    it('returns 400 when image base64 data is missing', async () => {
      const token = await createSessionToken({ user: 'test-admin' })
      const req = createMockRequest({
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: { filename: 'test.png' },
      })
      const res = createMockResponse()

      await uploadImageHandler(req, res)

      assert.equal(res._getStatusCode(), 400)
      const body = res._getBody() as { ok: boolean; error: string }
      assert.equal(body.ok, false)
      assert.ok(body.error.includes('missing or empty'))
    })

    it('processes raster image upload to WebP with responsive variants for books', async () => {
      const token = await createSessionToken({ user: 'test-admin' })
      const req = createMockRequest({
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: {
          base64: SAMPLE_PNG_BASE64,
          filename: 'new-book-cover.png',
          activeFile: 'book.json',
          fieldPath: 'hero.coverImage',
        },
      })
      const res = createMockResponse()

      await uploadImageHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        ok: boolean
        imagePath: string
        publicPath: string
        variants: Array<{ path: string; bufferBase64: string; publicPath: string }>
        sizeLabel: string
        metadata: { width?: number; height?: number; format?: string; size?: number }
      }

      assert.equal(body.ok, true)
      assert.ok(body.publicPath.startsWith('/images/books/'))
      assert.ok(body.publicPath.endsWith('.webp'))
      assert.equal(body.imagePath, body.publicPath)
      assert.ok(Array.isArray(body.variants))
      assert.ok(body.variants.length >= 1)
      assert.equal(body.metadata.format, 'webp')
      assert.ok(typeof body.sizeLabel === 'string')
    })

    it('supports data URL base64 prefixes', async () => {
      const token = await createSessionToken({ user: 'test-admin' })
      const dataUrl = `data:image/png;base64,${SAMPLE_PNG_BASE64}`
      const req = createMockRequest({
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: {
          fileDataBase64: dataUrl,
          fileName: 'logo.png',
          activeFile: 'site.json',
          fieldPath: 'logo.src',
        },
      })
      const res = createMockResponse()

      await uploadImageHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        ok: boolean
        publicPath: string
        metadata: { format?: string }
      }

      assert.equal(body.ok, true)
      // Site logo should retain original png format per ORIGINAL_PATH_RULES
      assert.ok(body.publicPath.endsWith('.png'))
    })

    it('processes SVG image upload without rasterization', async () => {
      const token = await createSessionToken({ user: 'test-admin' })
      const req = createMockRequest({
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: {
          base64: SAMPLE_SVG_BASE64,
          filename: 'custom-icon.svg',
          activeFile: 'home.json',
          fieldPath: 'icon',
        },
      })
      const res = createMockResponse()

      await uploadImageHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        ok: boolean
        publicPath: string
        metadata: { format?: string }
      }

      assert.equal(body.ok, true)
      assert.ok(body.publicPath.endsWith('.svg'))
      assert.equal(body.metadata.format, 'svg')
    })
  })
})
