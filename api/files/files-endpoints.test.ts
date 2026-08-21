import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import filesIndexHandler from './index'
import fileDetailHandler from './[file]'
import schemaDetailHandler from '../schemas/[id]'
import validateFileHandler from '../validate/[file]'
import { createSessionToken } from '../lib/auth'
import { readContentFileFromGit } from '../lib/github'

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
  url?: string
  query?: Record<string, string | string[]>
  headers?: Record<string, string>
  body?: unknown
}): VercelRequest {
  return {
    method: options.method ?? 'GET',
    url: options.url ?? '/',
    query: options.query ?? {},
    headers: options.headers ?? {},
    body: options.body,
  } as unknown as VercelRequest
}

describe('Content API Endpoints', () => {
  describe('GET /api/files', () => {
    it('rejects non-GET requests with 405', async () => {
      const req = createMockRequest({ method: 'POST' })
      const res = createMockResponse()

      await filesIndexHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
      assert.deepEqual(res._getBody(), { ok: false, error: 'Method not allowed' })
    })

    it('returns list of content files and descriptors with 200', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()

      await filesIndexHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        files: string[]
        descriptors: Array<{ file: string; title: string; usage: string[]; schemaId: string }>
      }
      assert.ok(Array.isArray(body.files))
      assert.ok(body.files.includes('site.json'))
      assert.ok(body.files.includes('book.json'))
      assert.ok(Array.isArray(body.descriptors))

      const siteDescriptor = body.descriptors.find((d) => d.file === 'site.json')
      assert.ok(siteDescriptor)
      assert.equal(siteDescriptor.schemaId, 'site.json')
      assert.ok(siteDescriptor.usage.length > 0)
    })
  })

  describe('GET /api/files/:file', () => {
    it('rejects unsupported methods with 405', async () => {
      const req = createMockRequest({ method: 'DELETE', query: { file: 'book.json' } })
      const res = createMockResponse()

      await fileDetailHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
    })

    it('rejects invalid or traversal file paths with 400', async () => {
      const req = createMockRequest({ method: 'GET', query: { file: '../package.json' } })
      const res = createMockResponse()

      await fileDetailHandler(req, res)

      assert.equal(res._getStatusCode(), 400)
    })

    it('returns content, revision, and schema info for valid file', async () => {
      const req = createMockRequest({ method: 'GET', query: { file: 'book.json' } })
      const res = createMockResponse()

      await fileDetailHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        file: string
        content: Record<string, unknown>
        revision: string
        schemaId: string
        usage: string[]
      }
      assert.equal(body.file, 'book.json')
      assert.ok(body.content)
      assert.ok(typeof body.revision === 'string' && body.revision.length > 0)
      assert.equal(body.schemaId, 'book.json')
      assert.ok(Array.isArray(body.usage))
    })
  })

  describe('PUT /api/files/:file', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = createMockRequest({
        method: 'PUT',
        query: { file: 'book.json' },
        body: { content: {} },
      })
      const res = createMockResponse()

      await fileDetailHandler(req, res)

      assert.equal(res._getStatusCode(), 401)
    })

    it('returns 409 when baseRevision does not match current file SHA', async () => {
      const token = await createSessionToken({ user: 'admin' })
      const req = createMockRequest({
        method: 'PUT',
        query: { file: 'book.json' },
        headers: { cookie: `backoffice_session=${token}` },
        body: {
          baseRevision: 'mismatched-sha-12345',
          content: { dummy: 'data' },
        },
      })
      const res = createMockResponse()

      await fileDetailHandler(req, res)

      assert.equal(res._getStatusCode(), 409)
      const body = res._getBody() as { ok: boolean; error: string; currentRevision: string }
      assert.equal(body.ok, false)
      assert.ok(body.error.includes('changed elsewhere'))
      assert.ok(body.currentRevision)
    })

    it('returns 422 when payload fails Zod schema validation', async () => {
      const token = await createSessionToken({ user: 'admin' })
      const current = await readContentFileFromGit({ filePath: 'book.json' })

      const req = createMockRequest({
        method: 'PUT',
        query: { file: 'book.json' },
        headers: { cookie: `backoffice_session=${token}` },
        body: {
          baseRevision: current.sha,
          content: {
            hero: { title: 12345 }, // Invalid type for title
          },
        },
      })
      const res = createMockResponse()

      await fileDetailHandler(req, res)

      assert.equal(res._getStatusCode(), 422)
      const body = res._getBody() as { ok: boolean; error: string; issues: unknown[] }
      assert.equal(body.ok, false)
      assert.ok(Array.isArray(body.issues) && body.issues.length > 0)
    })

    it('returns 200 with updated revision on valid PUT', async () => {
      const token = await createSessionToken({ user: 'admin' })
      const current = await readContentFileFromGit({ filePath: 'contact.json' })
      const originalContact = await readFile(path.join(process.cwd(), 'public/content/contact.json'), 'utf-8')

      try {
        const nextContent = {
          ...(current.content as Record<string, unknown>),
          emailLabel: 'Get in touch',
        }

        const req = createMockRequest({
          method: 'PUT',
          query: { file: 'contact.json' },
          headers: { cookie: `backoffice_session=${token}` },
          body: {
            baseRevision: current.sha,
            content: nextContent,
          },
        })
        const res = createMockResponse()

        await fileDetailHandler(req, res)

        assert.equal(res._getStatusCode(), 200)
        const body = res._getBody() as {
          ok: boolean
          file: string
          content: Record<string, unknown>
          revision: string
        }
        assert.equal(body.ok, true)
        assert.equal(body.file, 'contact.json')
        assert.equal(body.content.emailLabel, 'Get in touch')
        assert.ok(typeof body.revision === 'string' && body.revision.length > 0)
      } finally {
        await writeFile(path.join(process.cwd(), 'public/content/contact.json'), originalContact, 'utf-8')
      }
    })
  })

  describe('GET /api/schemas/:id', () => {
    it('returns 405 on non-GET request', async () => {
      const req = createMockRequest({ method: 'POST', query: { id: 'book.json' } })
      const res = createMockResponse()

      await schemaDetailHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
    })

    it('returns schema metadata for valid id', async () => {
      const req = createMockRequest({ method: 'GET', query: { id: 'site.json' } })
      const res = createMockResponse()

      await schemaDetailHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        schema: {
          id: string
          title: string
          sections: Array<{ id: string; label: string }>
          fieldMeta: Record<string, { label: string; control: string }>
        }
      }
      assert.ok(body.schema)
      assert.equal(body.schema.id, 'site.json')
      assert.ok(body.schema.title)
      assert.ok(Array.isArray(body.schema.sections))
      assert.ok(body.schema.fieldMeta)
    })
  })

  describe('POST /api/validate/:file', () => {
    it('returns 405 on non-POST request', async () => {
      const req = createMockRequest({ method: 'GET', query: { file: 'home.json' } })
      const res = createMockResponse()

      await validateFileHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
    })

    it('returns ok: true for valid content payload', async () => {
      const current = await readContentFileFromGit({ filePath: 'home.json' })
      const req = createMockRequest({
        method: 'POST',
        query: { file: 'home.json' },
        body: { content: current.content },
      })
      const res = createMockResponse()

      await validateFileHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { ok: boolean; issues: unknown[] }
      assert.equal(body.ok, true)
      assert.equal(body.issues.length, 0)
    })

    it('returns ok: false and issues array for invalid content payload', async () => {
      const req = createMockRequest({
        method: 'POST',
        query: { file: 'home.json' },
        body: {
          content: {
            hero: { title: 123 }, // Title must be string
          },
        },
      })
      const res = createMockResponse()

      await validateFileHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        ok: boolean
        issues: Array<{ path: string; message: string }>
      }
      assert.equal(body.ok, false)
      assert.ok(body.issues.length > 0)
    })
  })
})
