import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handleGitStatus from '../handlers/git-status.js'
import handleGitPreview from '../handlers/git-preview.js'
import handleGitFinalize from '../handlers/git-finalize.js'
import handleSessionSummary from '../handlers/session-summary.js'
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

describe('Git Endpoints', () => {
  describe('GET /api/git/status', () => {
    it('returns status payload', async () => {
      const req = createMockRequest({ method: 'GET' })
      const res = createMockResponse()
      await handleGitStatus(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { status: { branch: string } }
      assert.ok(body.status)
    })
  })

  describe('POST /api/git/preview', () => {
    it('returns preview for session paths', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { sessionPaths: ['public/content/site.json'] },
      })
      const res = createMockResponse()
      await handleGitPreview(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { preview: { paths: string[] } }
      assert.ok(Array.isArray(body.preview.paths))
    })
  })

  describe('POST /api/git/finalize', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = createMockRequest({ method: 'POST', body: {} })
      const res = createMockResponse()
      await handleGitFinalize(req, res)
      assert.equal(res._getStatusCode(), 401)
    })

    it('finalizes successfully when authenticated with files', async () => {
      const token = await createSessionToken({ user: 'admin' })
      const originalSite = await readFile(path.join(process.cwd(), 'public/content/site.json'), 'utf-8')

      try {
        const req = createMockRequest({
          method: 'POST',
          headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
          body: {
            files: [{ path: 'public/content/site.json', content: JSON.parse(originalSite) }],
            commitMessage: 'Test finalize',
          },
        })
        const res = createMockResponse()
        await handleGitFinalize(req, res)
        assert.equal(res._getStatusCode(), 200)
        const body = res._getBody() as { result: { branchName: string; commitSha: string } }
        assert.ok(body.result)
        assert.ok(body.result.branchName.startsWith('ui-backoffice-'))
      } finally {
        await writeFile(path.join(process.cwd(), 'public/content/site.json'), originalSite, 'utf-8')
      }
    })
  })

  describe('GET /api/session/summary', () => {
    it('returns summary for query paths', async () => {
      const req = createMockRequest({ method: 'GET', query: { paths: 'public/content/site.json' } })
      const res = createMockResponse()
      await handleSessionSummary(req, res)
      assert.equal(res._getStatusCode(), 200)
      const body = res._getBody() as { summary: { touchedPaths: string[] } }
      assert.ok(Array.isArray(body.summary.touchedPaths))
    })
  })
})
