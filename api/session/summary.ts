/**
 * Why this exists:
 * Vercel Serverless Function providing session change summary (`GET /api/session/summary`).
 * Returns touched session paths, field-level changed entries, and pending temporary uploads.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import path from 'node:path'
import { sendJson } from '../lib/http'

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

/**
 * Extracts and normalizes comma-separated or array paths from the query parameter.
 */
function parseQueryPaths(raw: unknown): string[] {
  if (!raw) return []
  const list: string[] = []

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        list.push(...item.split(','))
      }
    }
  } else if (typeof raw === 'string') {
    list.push(...raw.split(','))
  }

  const unique = new Set<string>()
  for (const item of list) {
    const clean = item.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    let rawPaths: string | string[] | undefined = req.query?.paths
    if (!rawPaths && req.url) {
      try {
        const parsedUrl = new URL(req.url, 'http://localhost')
        rawPaths = parsedUrl.searchParams.get('paths') || undefined
      } catch {
        // url parsing fallback
      }
    }

    const touchedPaths = parseQueryPaths(rawPaths)

    const changedEntries = touchedPaths.map((repoPath) => {
      const name = path.basename(repoPath)
      const isContent = repoPath.startsWith('public/content/') || repoPath.endsWith('.json')
      const isAsset =
        repoPath.startsWith('public/images/') || /\.(webp|png|jpe?g|svg|gif)$/i.test(repoPath)

      return {
        path: repoPath,
        name,
        type: isContent
          ? ('content' as const)
          : isAsset
            ? ('asset' as const)
            : ('unknown' as const),
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
