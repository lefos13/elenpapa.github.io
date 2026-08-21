/**
 * Why this exists:
 * Vercel Serverless Function performing draft validation against registered Zod schemas
 * and structural templates (`POST /api/validate/:file`) before persisting edits.
 */

import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readContentFileFromGit } from '../lib/github'
import { HttpError, isHttpError, readJsonBody, sendJson } from '../lib/http'
import { validateContentPayload } from '../lib/schemas'

function extractFilePath(req: VercelRequest): string {
  const queryFile = req.query.file
  let rawFile = Array.isArray(queryFile) ? queryFile[0] : queryFile

  if (!rawFile && req.url) {
    const url = new URL(req.url, 'http://localhost')
    const match = url.pathname.match(/\/api\/validate\/(.+)$/)
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
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const filePath = extractFilePath(req)
    const body = await readJsonBody<Record<string, unknown>>(req)
    const nextContent = body && typeof body === 'object' && 'content' in body ? body.content : body

    let currentContent: unknown = undefined
    try {
      const current = await readContentFileFromGit({ filePath })
      currentContent = current.content
    } catch {
      // If current file cannot be read, fall back to pure Zod schema validation
    }

    const validation = validateContentPayload({
      currentContent,
      nextContent,
      schemaId: filePath,
    })

    sendJson(res, 200, {
      ok: validation.ok,
      issues: validation.issues,
    })
  } catch (error: unknown) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, {
        ok: false,
        error: error.message,
        details: error.details,
      })
      return
    }

    const message = error instanceof Error ? error.message : 'Validation request failed.'
    sendJson(res, 500, {
      ok: false,
      error: message,
    })
  }
}
