/**
 * Why this exists:
 * Handler retrieving the editor form schema definition and metadata
 * for a specific content type (`GET /api/schemas/:id`).
 */

import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readContentFileFromGit } from '../github'
import { HttpError, isHttpError, sendJson } from '../http'
import { getSchemaById } from '../schemas'

function extractSchemaId(req: VercelRequest): string {
  const queryId = req.query.id
  let rawId = Array.isArray(queryId) ? queryId[0] : queryId

  if (!rawId && req.url) {
    const url = new URL(req.url, 'http://localhost')
    const match = url.pathname.match(/\/api\/schemas\/(.+)$/)
    if (match) {
      rawId = decodeURIComponent(match[1])
    }
  }

  if (!rawId || typeof rawId !== 'string') {
    throw new HttpError(400, 'Missing or invalid schema id parameter.')
  }

  const normalized = path.normalize(rawId).replace(/\\/g, '/')
  const baseName = path.basename(normalized)

  if (normalized.includes('..') || normalized.startsWith('/') || !baseName) {
    throw new HttpError(400, 'Invalid schema id.')
  }

  return baseName.endsWith('.json') ? baseName : `${baseName}.json`
}

export default async function handleSchemasDetail(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const schemaId = extractSchemaId(req)
    const { content } = await readContentFileFromGit({ filePath: schemaId })
    const schema = getSchemaById(schemaId, content)

    sendJson(res, 200, {
      schema,
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

    const message = error instanceof Error ? error.message : 'Failed to retrieve schema.'
    sendJson(res, 500, {
      ok: false,
      error: message,
    })
  }
}
