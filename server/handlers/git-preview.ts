/**
 * Why this exists:
 * Handler generating change preview (`POST /api/git/preview`).
 * Takes session paths and returns diff preview entries and summary.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import path from 'node:path'
import { readJsonBody, sendJson } from '../http'

interface PreviewRequestBody {
  sessionPaths?: string[]
}

export interface GitPreviewEntry {
  code: string
  path: string
  raw: string
}

export interface GitPreviewResult {
  paths: string[]
  entries: GitPreviewEntry[]
  summary: string
}

function normalizeSessionPaths(sessionPaths: unknown): string[] {
  if (!Array.isArray(sessionPaths)) return []
  const unique = new Set<string>()

  for (const item of sessionPaths) {
    if (typeof item !== 'string') continue
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

export default async function handleGitPreview(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const body = await readJsonBody<PreviewRequestBody>(req)
    const sessionPaths = normalizeSessionPaths(body?.sessionPaths)

    const entries: GitPreviewEntry[] = sessionPaths.map((filePath) => ({
      code: 'M ',
      path: filePath,
      raw: `M  ${filePath}`,
    }))

    const summary =
      sessionPaths.length > 0
        ? `${sessionPaths.length} file(s) staged for review (${sessionPaths.join(', ')})`
        : 'No tracked changes found for this session.'

    const preview: GitPreviewResult = {
      paths: sessionPaths,
      entries,
      summary,
    }

    sendJson(res, 200, { preview })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate git preview.'
    sendJson(res, 500, { ok: false, error: message })
  }
}
