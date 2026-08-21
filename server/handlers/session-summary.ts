/**
 * Why this exists:
 * Handler providing session change summary (`GET /api/session/summary`).
 * Returns touched session paths, field-level changed entries, and pending temporary uploads.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import path from 'node:path'
import { sendJson } from '../http.js'

export interface SessionSummaryResult {
  touchedPaths: string[]
  changedEntries: Array<{
    path: string
    name: string
    type: 'content' | 'asset' | 'unknown'
  }>
  pendingTempUploads: {
    referenced: string[]
    dangling: string[]
    count: number
  }
}

function parseQueryPaths(raw: unknown): string[] {
  if (!raw) return []
  const list: string[] = []

  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (typeof item === 'string') {
        list.push(...item.split(','))
      }
    })
  } else if (typeof raw === 'string') {
    list.push(...raw.split(','))
  }

  const unique = new Set<string>()
  for (const item of list) {
    const clean = item.trim().replace(/\\/g, '/').replace(/^\/+/, '')
    if (!clean) continue
    const normalized = path.posix.normalize(clean)
    if (
      !normalized ||
      normalized === '.' ||
      normalized.startsWith('../') ||
      normalized.includes('/../')
    ) {
      continue
    }
    unique.add(normalized)
  }

  return Array.from(unique)
}

export default async function handleSessionSummary(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const rawPaths = req.query.paths
    const touchedPaths = parseQueryPaths(rawPaths)

    const changedEntries = touchedPaths.map((itemPath) => {
      const fileName = path.posix.basename(itemPath)
      let type: 'content' | 'asset' | 'unknown' = 'unknown'

      if (itemPath.includes('content/') || itemPath.endsWith('.json')) {
        type = 'content'
      } else if (
        itemPath.includes('images/') ||
        /\.(png|jpe?g|webp|svg|jfif)$/i.test(itemPath)
      ) {
        type = 'asset'
      }

      return {
        path: itemPath,
        name: fileName,
        type,
      }
    })

    const summary: SessionSummaryResult = {
      touchedPaths,
      changedEntries,
      pendingTempUploads: {
        referenced: [],
        dangling: [],
        count: 0,
      },
    }

    sendJson(res, 200, { summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve session summary.'
    sendJson(res, 500, { ok: false, error: message })
  }
}
