/**
 * Why this exists:
 * Vercel Serverless Function listing media library assets (`GET /api/images`).
 * Discovers image files in `public/images/` via Git Tree or local filesystem fallback,
 * maps cross-file usage references from all content JSON files, and supports fuzzy querying.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../lib/auth-guard'
import {
  listContentFilesFromGit,
  listImagesFromGitTree,
  readContentFileFromGit,
} from '../lib/github'
import { isHttpError, sendJson } from '../lib/http'
import { collectImageUsages, type ImageUsageItem } from '../lib/schemas'

export interface IndexedImageItem {
  name: string
  relativePath: string
  publicPath: string
  bytes: number
  sizeLabel: string
  section: string
  usages: ImageUsageItem[]
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    const contentFiles = await listContentFilesFromGit()
    const usagesByImage = new Map<string, ImageUsageItem[]>()

    await Promise.all(
      contentFiles.map(async (file) => {
        try {
          const { content } = await readContentFileFromGit({ filePath: file })
          const usages = collectImageUsages(content, '')
          for (const usage of usages) {
            const cleanImagePath = usage.imagePath.split('?')[0].split('#')[0]
            let existing = usagesByImage.get(cleanImagePath)
            if (!existing) {
              existing = []
              usagesByImage.set(cleanImagePath, existing)
            }
            existing.push({
              file,
              jsonPath: usage.jsonPath,
            })
          }
        } catch {
          // Gracefully ignore individual unreadable or invalid content files
        }
      }),
    )

    const treeImages = await listImagesFromGitTree()
    const images: IndexedImageItem[] = treeImages.map((img) => ({
      name: img.name,
      relativePath: img.relativePath,
      publicPath: img.publicPath,
      bytes: img.bytes,
      sizeLabel: img.sizeLabel,
      section: img.section,
      usages: usagesByImage.get(img.publicPath) ?? [],
    }))

    const queryRaw = req.query.q
    const queryStr = Array.isArray(queryRaw) ? queryRaw[0] : queryRaw
    const query = (queryStr ?? '').trim().toLowerCase()

    const filteredImages = query
      ? images.filter((img) => {
          const usageHaystack = img.usages
            .map((u) => `${u.file} ${u.jsonPath}`.toLowerCase())
            .join(' ')
          const haystack =
            `${img.name} ${img.relativePath} ${img.publicPath} ${img.section} ${usageHaystack}`.toLowerCase()
          return haystack.includes(query)
        })
      : images

    sendJson(res, 200, {
      ok: true,
      images: filteredImages,
    })
  } catch (error) {
    const statusCode = isHttpError(error) ? error.statusCode : 500
    const message = error instanceof Error ? error.message : 'Failed to retrieve image list.'
    sendJson(res, statusCode, {
      ok: false,
      error: message,
    })
  }
}
