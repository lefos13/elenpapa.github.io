/**
 * Why this exists:
 * Handler listing all editable content JSON files and their
 * operational metadata descriptors (`GET /api/files`) for the Backoffice sidebar.
 */

import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { listContentFilesFromGit } from '../github'
import { isHttpError, sendJson } from '../http'
import { listContentFileDescriptors } from '../schemas'

export default async function handleFilesIndex(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const files = await listContentFilesFromGit()
    const statsMap: Record<string, { size?: number; updatedAt?: string }> = {}

    // Gather local filesystem stats where available
    await Promise.all(
      files.map(async (file) => {
        try {
          const filePath = path.join(process.cwd(), 'public/content', file)
          const fileStat = await stat(filePath)
          statsMap[file] = {
            size: fileStat.size,
            updatedAt: fileStat.mtime.toISOString(),
          }
        } catch {
          // File stats may not exist in pure Git / remote environments
        }
      }),
    )

    const descriptors = listContentFileDescriptors(files, statsMap)

    sendJson(res, 200, {
      files,
      descriptors,
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

    const message = error instanceof Error ? error.message : 'Failed to list content files.'
    sendJson(res, 500, {
      ok: false,
      error: message,
    })
  }
}
