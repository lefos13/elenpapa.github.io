import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import statusHandler from './status'
import previewHandler from './preview'
import finalizeHandler from './finalize'
import sessionSummaryHandler from '../session/summary'
import { createSessionToken } from '../lib/auth'
import { AUTH_COOKIE_NAME } from '../lib/config'

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
  query?: Record<string, string | string[]>
  url?: string
}): VercelRequest {
  const headers: Record<string, string> = { ...(options.headers ?? {}) }
  return {
    method: options.method ?? 'GET',
    headers,
    body: options.body,
    query: options.query ?? {},
    url: options.url ?? '/',
    on() {
      return this
    },
  } as unknown as VercelRequest
}

describe('Git & Session API Endpoints', () => {
  describe('GET /api/git/status', () => {
    it('returns status payload', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()

      await statusHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        status: { branch: string; configured: boolean; clean: boolean }
      }
      assert.ok(body.status)
      assert.ok(typeof body.status.branch === 'string')
      assert.ok(typeof body.status.clean === 'boolean')
    })

    it('rejects non-GET methods with 405', async () => {
      const req = createMockRequest({ method: 'POST' })
      const res = createMockResponse()

      await statusHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
    })
  })

  describe('POST /api/git/preview', () => {
    it('returns preview for session paths', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          sessionPaths: ['public/content/site.json', 'public/content/timeline.json'],
        },
      })
      const res = createMockResponse()

      await previewHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        preview: {
          paths: string[]
          entries: Array<{ code: string; path: string }>
          summary: string
        }
      }
      assert.ok(body.preview)
      assert.equal(body.preview.paths.length, 2)
      assert.equal(body.preview.entries.length, 2)
      assert.ok(body.preview.summary.includes('2 file(s) staged'))
    })

    it('handles empty session paths', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { sessionPaths: [] },
      })
      const res = createMockResponse()

      await previewHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        preview: { paths: string[]; entries: Array<{ code: string; path: string }> }
      }
      assert.deepEqual(body.preview.paths, [])
      assert.deepEqual(body.preview.entries, [])
    })

    it('rejects non-POST methods with 405', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()

      await previewHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
    })
  })

  describe('POST /api/git/finalize', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          sessionPaths: ['public/content/site.json'],
        },
      })
      const res = createMockResponse()

      await finalizeHandler(req, res)

      assert.equal(res._getStatusCode(), 401)
      const body = res._getBody() as { ok: boolean; error: string }
      assert.equal(body.ok, false)
    })

    it('returns 400 when authenticated but no files/sessionPaths provided', async () => {
      const token = await createSessionToken({ user: 'admin' })
      const req = createMockRequest({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${token}`,
        },
        body: {
          sessionPaths: [],
          files: [],
        },
      })
      const res = createMockResponse()

      await finalizeHandler(req, res)

      assert.equal(res._getStatusCode(), 400)
      const body = res._getBody() as { ok: boolean; error: string }
      assert.equal(body.ok, false)
    })

    it('finalizes successfully when authenticated with provided files', async () => {
      const token = await createSessionToken({ user: 'admin' })
      const originalSiteContent = await readFile(path.join(process.cwd(), 'public/content/site.json'), 'utf-8')

      try {
        const req = createMockRequest({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: `${AUTH_COOKIE_NAME}=${token}`,
          },
          body: {
            files: [
              {
                path: 'public/content/site.json',
                content: JSON.parse(originalSiteContent),
              },
            ],
            commitMessage: 'Test commit from backoffice',
          },
        })
        const res = createMockResponse()

        await finalizeHandler(req, res)

        assert.equal(res._getStatusCode(), 200)
        const body = res._getBody() as {
          result: {
            branchName: string
            commitMessage: string
            commitSha: string
            pullRequest: { created: boolean }
          }
        }
        assert.ok(body.result)
        assert.ok(body.result.branchName.startsWith('ui-backoffice-'))
        assert.equal(body.result.commitMessage, 'Test commit from backoffice')
        assert.ok(body.result.commitSha)
        assert.ok(typeof body.result.pullRequest.created === 'boolean')
      } finally {
        await writeFile(path.join(process.cwd(), 'public/content/site.json'), originalSiteContent, 'utf-8')
      }
    })

    it('rejects non-POST methods with 405', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()

      await finalizeHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
    })
  })

  describe('GET /api/session/summary', () => {
    it('returns summary for query paths', async () => {
      const req = createMockRequest({
        method: 'GET',
        query: {
          paths: 'public/content/site.json,public/images/test.webp',
        },
      })
      const res = createMockResponse()

      await sessionSummaryHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        summary: {
          touchedPaths: string[]
          changedEntries: Array<{ path: string; name: string; type: string }>
          pendingTempUploads: { dangling: string[] }
        }
      }
      assert.ok(body.summary)
      assert.equal(body.summary.touchedPaths.length, 2)
      assert.equal(body.summary.changedEntries.length, 2)
      assert.equal(body.summary.changedEntries[0].type, 'content')
      assert.equal(body.summary.changedEntries[1].type, 'asset')
      assert.ok(Array.isArray(body.summary.pendingTempUploads.dangling))
    })

    it('handles empty query paths', async () => {
      const req = createMockRequest({
        method: 'GET',
        query: {},
      })
      const res = createMockResponse()

      await sessionSummaryHandler(req, res)

      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as {
        summary: {
          touchedPaths: string[]
          changedEntries: unknown[]
        }
      }
      assert.deepEqual(body.summary.touchedPaths, [])
      assert.deepEqual(body.summary.changedEntries, [])
    })

    it('rejects non-GET methods with 405', async () => {
      const req = createMockRequest({ method: 'POST' })
      const res = createMockResponse()

      await sessionSummaryHandler(req, res)

      assert.equal(res._getStatusCode(), 405)
    })
  })
})
