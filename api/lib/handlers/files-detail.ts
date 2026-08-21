/**
 * Why this exists:
 * Handler providing read and write operations for a specific
 * content JSON file (`GET/PUT /api/files/:file`) with Zod validation and optimistic concurrency.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth-guard'
import { calculateGitBlobSha, readContentFileFromGit } from '../github'
import { HttpError, isHttpError, readJsonBody, sendJson } from '../http'
import { buildEditorSchema, validateContentPayload } from '../schemas'

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

export default async function handleFilesDetail(req: VercelRequest, res: VercelResponse): Promise<void> {
  const method = req.method?.toUpperCase()

  if (method !== 'GET' && method !== 'PUT' && method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const fileName = extractFilePath(req)

    if (method === 'GET' || method === 'HEAD') {
      const { content, sha } = await readContentFileFromGit({ filePath: fileName })
      const schema = buildEditorSchema({ filePath: fileName, content })

      sendJson(res, 200, {
        file: fileName,
        content,
        revision: sha,
        schemaId: schema.id,
        usage: schema.usage,
      })
      return
    }

    if (method === 'PUT') {
      const user = await requireAuth(req, res)
      if (!user) return

      const body = await readJsonBody<{
        baseRevision?: string
        content?: unknown
        deletedImages?: string[]
      }>(req)

      const { content: currentContent, sha: currentSha } = await readContentFileFromGit({
        filePath: fileName,
      })

      if (body?.baseRevision && body.baseRevision !== currentSha) {
        sendJson(res, 409, {
          ok: false,
          error: 'This file changed elsewhere. Reload to sync latest content before saving.',
          currentRevision: currentSha,
        })
        return
      }

      const payloadContent =
        body && typeof body === 'object' && 'content' in body ? body.content : body

      const validation = validateContentPayload({
        currentContent,
        nextContent: payloadContent,
        schemaId: fileName,
      })

      if (!validation.ok) {
        sendJson(res, 422, {
          ok: false,
          error: 'Validation failed. Please review highlighted fields and try again.',
          issues: validation.issues,
        })
        return
      }

      const formattedJson = `${JSON.stringify(payloadContent, null, 2)}\n`
      const nextSha = calculateGitBlobSha(formattedJson)

      try {
        const localPath = path.join(process.cwd(), 'public/content', fileName)
        await mkdir(path.dirname(localPath), { recursive: true })
        await writeFile(localPath, formattedJson, 'utf-8')
      } catch {
        // In read-only serverless environments, local disk write may not apply
      }

      sendJson(res, 200, {
        ok: true,
        file: fileName,
        content: payloadContent,
        revision: nextSha,
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

    const message = error instanceof Error ? error.message : 'Operation failed on content file.'
    sendJson(res, 500, {
      ok: false,
      error: message,
    })
  }
}
