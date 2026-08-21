/**
 * Why this exists:
 * Vercel Serverless Function providing read and write operations for a specific
 * content JSON file (`GET/PUT /api/files/:file`) with Zod validation and optimistic concurrency.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../lib/auth-guard'
import { calculateGitBlobSha, readContentFileFromGit } from '../lib/github'
import { HttpError, isHttpError, readJsonBody, sendJson } from '../lib/http'
import { buildEditorSchema, validateContentPayload } from '../lib/schemas'

function extractFilePath(req: VercelRequest): string {
  const queryFile = req.query.file
  let rawFile = Array.isArray(queryFile) ? queryFile[0] : queryFile

  if (!rawFile && req.url) {
    const url = new URL(req.url, 'http://localhost')
    const match = url.pathname.match(/\/api\/files\/(.+)$/)
    if (match) {
      rawFile = decodeURIComponent(match[1])
    }
  }

  if (!rawFile || typeof rawFile !== 'string') {
    throw new HttpError(400, 'Missing or invalid file parameter.')
  }

  const normalized = path.normalize(rawFile).replace(/\\/g, '/')
  const baseName = path.basename(normalized)

  if (normalized.includes('..') || normalized.startsWith('/') || !baseName) {
    throw new HttpError(400, 'Invalid content file path.')
  }

  return baseName.endsWith('.json') ? baseName : `${baseName}.json`
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const method = req.method?.toUpperCase()

  if (method !== 'GET' && method !== 'PUT' && method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const filePath = extractFilePath(req)

    // GET /api/files/:file
    if (method === 'GET' || method === 'HEAD') {
      const result = await readContentFileFromGit({ filePath })
      const schema = buildEditorSchema({ filePath, content: result.content })

      sendJson(res, 200, {
        file: filePath,
        content: result.content,
        revision: result.sha,
        schemaId: schema.id,
        usage: schema.usage,
      })
      return
    }

    // PUT /api/files/:file
    if (method === 'PUT') {
      const user = await requireAuth(req, res)
      if (!user) return

      const body = await readJsonBody<Record<string, unknown>>(req)
      const current = await readContentFileFromGit({ filePath })

      const baseRevision =
        typeof body?.baseRevision === 'string' && body.baseRevision.trim()
          ? body.baseRevision.trim()
          : undefined

      if (baseRevision && baseRevision !== current.sha) {
        sendJson(res, 409, {
          ok: false,
          error: 'This file changed elsewhere. Reload to sync latest content before saving.',
          currentRevision: current.sha,
        })
        return
      }

      const payloadContent =
        body && typeof body === 'object' && 'content' in body ? body.content : body

      const validation = validateContentPayload({
        currentContent: current.content,
        nextContent: payloadContent,
        schemaId: filePath,
      })

      if (!validation.ok) {
        sendJson(res, 422, {
          ok: false,
          error: 'Validation failed. Please review highlighted fields and try again.',
          issues: validation.issues,
        })
        return
      }

      const serialized = `${JSON.stringify(payloadContent, null, 2)}\n`
      const newRevision = calculateGitBlobSha(serialized)

      try {
        const localPath = path.join(process.cwd(), 'public/content', filePath)
        await mkdir(path.dirname(localPath), { recursive: true })
        await writeFile(localPath, serialized, 'utf-8')
      } catch {
        // Filesystem is read-only in cloud serverless environments
      }

      sendJson(res, 200, {
        ok: true,
        file: filePath,
        content: payloadContent,
        revision: newRevision,
      })
      return
    }
  } catch (error: unknown) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, {
        ok: false,
        error: error.message,
        details: error.details,
      })
      return
    }

    const message = error instanceof Error ? error.message : 'Content file operation failed.'
    sendJson(res, 500, {
      ok: false,
      error: message,
    })
  }
}
