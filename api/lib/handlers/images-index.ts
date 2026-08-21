/**
 * Why this exists:
 * Handler listing media library assets (`GET /api/images`).
 * Discovers image files in `public/images/` via Git Tree or local filesystem fallback,
 * maps cross-file usage references from all content JSON files, and supports fuzzy querying.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth-guard'
import {
  listContentFilesFromGit,
  listImagesFromGitTree,
  readContentFileFromGit,
} from '../github'
import { isHttpError, sendJson } from '../http'
import { collectImageUsages, type ImageUsageItem } from '../schemas'

export interface IndexedImageItem {
  name: string
  relativePath: string
  publicPath: string
  bytes: number
  sizeLabel: string
  section: string
  usages: ImageUsageItem[]
}

export default async function handleImagesIndex(req: VercelRequest, res: VercelResponse): Promise<void> {
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
          usages.forEach((usage) => {
            if (!usagesByImage.has(usage.imagePath)) {
              usagesByImage.set(usage.imagePath, [])
            }
            usagesByImage.get(usage.imagePath)?.push({
              file,
              jsonPath: usage.jsonPath,
            })
          })
        } catch {
          // If a file is unreadable, skip without crashing image list
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
          const usageText = img.usages.map((u) => `${u.file} ${u.jsonPath}`).join(' ')
          const haystack = `${img.name} ${img.relativePath} ${img.publicPath} ${img.section} ${usageText}`.toLowerCase()
          return haystack.includes(query)
        })
      : images

    sendJson(res, 200, {
      images: filteredImages,
    })
  } catch (error) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, { ok: false, error: error.message })
      return
    }
    const message = error instanceof Error ? error.message : 'Failed to list images.'
    sendJson(res, 500, { ok: false, error: message })
  }
}
