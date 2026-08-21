import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handleFilesIndex from '../handlers/files-index.js'
import handleFilesDetail from '../handlers/files-detail.js'
import handleSchemasDetail from '../handlers/schemas-detail.js'
import handleValidateFile from '../handlers/validate-file.js'
import { createSessionToken } from '../auth.js'
import { readContentFileFromGit } from '../github.js'
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

describe('Content API Endpoints', () => {
  describe('GET /api/files', () => {
    it('returns list of content files and descriptors with 200', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()
      await handleFilesIndex(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { files: string[]; descriptors: unknown[] }
      assert.ok(Array.isArray(body.files))
      assert.ok(body.files.includes('site.json'))
      assert.ok(Array.isArray(body.descriptors))
    })
  })

  describe('GET /api/files/:file', () => {
    it('returns content and revision for valid file', async () => {
      const req = createMockRequest({ method: 'GET', query: { file: 'book.json' } })
      const res = createMockResponse()
      await handleFilesDetail(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { file: string; content: unknown; revision: string }
      assert.equal(body.file, 'book.json')
      assert.ok(body.content)
      assert.ok(body.revision)
    })
  })

  describe('PUT /api/files/:file', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = createMockRequest({ method: 'PUT', query: { file: 'book.json' }, body: {} })
      const res = createMockResponse()
      await handleFilesDetail(req, res)
      assert.equal(res._getStatusCode(), 401)
    })

    it('returns 409 when baseRevision is mismatched', async () => {
      const token = await createSessionToken({ user: 'admin' })
      const req = createMockRequest({
        method: 'PUT',
        query: { file: 'book.json' },
        headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
        body: { baseRevision: 'invalid-sha', content: {} },
      })
      const res = createMockResponse()
      await handleFilesDetail(req, res)
      assert.equal(res._getStatusCode(), 409)
    })

    it('returns 422 on Zod validation failure', async () => {
      const token = await createSessionToken({ user: 'admin' })
      const current = await readContentFileFromGit({ filePath: 'book.json' })
      const req = createMockRequest({
        method: 'PUT',
        query: { file: 'book.json' },
        headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
        body: { baseRevision: current.sha, content: { hero: { title: 12345 } } },
      })
      const res = createMockResponse()
      await handleFilesDetail(req, res)
      assert.equal(res._getStatusCode(), 422)
    })

    it('saves valid content non-destructively', async () => {
      const token = await createSessionToken({ user: 'admin' })
      const current = await readContentFileFromGit({ filePath: 'contact.json' })
      const original = await readFile(path.join(process.cwd(), 'public/content/contact.json'), 'utf-8')

      try {
        const nextContent = {
          ...(current.content as Record<string, unknown>),
          emailLabel: 'Contact us',
        }
        const req = createMockRequest({
          method: 'PUT',
          query: { file: 'contact.json' },
          headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
          body: { baseRevision: current.sha, content: nextContent },
        })
        const res = createMockResponse()
        await handleFilesDetail(req, res)
        assert.equal(res._getStatusCode(), 200)
        const body = res._getBody() as { ok: boolean; file: string }
        assert.equal(body.ok, true)
        assert.equal(body.file, 'contact.json')
      } finally {
        await writeFile(path.join(process.cwd(), 'public/content/contact.json'), original, 'utf-8')
      }
    })
  })

  describe('GET /api/schemas/:id', () => {
    it('returns schema metadata for valid id', async () => {
      const req = createMockRequest({ method: 'GET', query: { id: 'site.json' } })
      const res = createMockResponse()
      await handleSchemasDetail(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { schema: { id: string } }
      assert.equal(body.schema.id, 'site.json')
    })
  })

  describe('POST /api/validate/:file', () => {
    it('validates content payload', async () => {
      const req = createMockRequest({
        method: 'POST',
        query: { file: 'contact.json' },
        body: { title: 'Contact', description: 'desc', mailto: 'a@b.com', emailLabel: 'email' },
      })
      const res = createMockResponse()
      await handleValidateFile(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { ok: boolean }
      assert.equal(body.ok, true)
    })
  })
})
