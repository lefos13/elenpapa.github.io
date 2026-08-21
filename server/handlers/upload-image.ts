/**
 * Why this exists:
 * Handler for media asset uploads (`POST /api/upload-image`).
 * Receives base64-encoded image data, runs in-memory Sharp optimization and responsive
 * variant generation via `api/lib/image-processor.ts`, and returns the processed asset payloads.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth-guard'
import { formatBytes } from '../github'
import { isHttpError, readJsonBody, sendJson } from '../http'
import { processUploadedImage } from '../image-processor'

export interface UploadImageRequestBody {
  base64?: string
  fileDataBase64?: string
  data?: string
  filename?: string
  fileName?: string
  name?: string
  originalFilename?: string
  activeFile?: string
  file?: string
  fieldPath?: string
  path?: string
  previousPath?: string
  previousImagePath?: string
}

export interface UploadedImageVariantResponse {
  path: string
  bufferBase64: string
  publicPath: string
  width?: number
  height?: number
}

export interface UploadImageResponse {
  ok: boolean
  imagePath: string
  publicPath: string
  variants: UploadedImageVariantResponse[]
  sizeLabel: string
  metadata: {
    width?: number
    height?: number
    format?: string
    size: number
  }
}

export default async function handleUploadImage(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    const body = await readJsonBody<UploadImageRequestBody>(req)

    const rawBase64 = body?.base64 || body?.fileDataBase64 || body?.data || ''
    if (!rawBase64) {
      sendJson(res, 400, { ok: false, error: 'Missing image base64 data.' })
      return
    }

    const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, '')
    const buffer = Buffer.from(cleanBase64, 'base64')

    if (!buffer.length) {
      sendJson(res, 400, { ok: false, error: 'Invalid or empty image data.' })
      return
    }

    const originalFilename =
      body?.filename || body?.fileName || body?.name || body?.originalFilename || 'upload.png'
    const activeFile = body?.activeFile || body?.file || ''
    const fieldPath = body?.fieldPath || body?.path || ''
    const previousImagePath = body?.previousPath || body?.previousImagePath || ''

    const processed = await processUploadedImage({
      buffer,
      originalFilename,
      activeFile,
      fieldPath,
      previousImagePath,
    })

    const variants: UploadedImageVariantResponse[] = processed.variants.map((v) => ({
      path: v.path,
      bufferBase64: v.buffer.toString('base64'),
      publicPath: v.publicPath,
      width: v.width,
      height: v.height,
    }))

    const responsePayload: UploadImageResponse = {
      ok: true,
      imagePath: processed.primaryPublicPath,
      publicPath: processed.primaryPublicPath,
      variants,
      sizeLabel: formatBytes(processed.metadata.size),
      metadata: processed.metadata,
    }

    sendJson(res, 200, responsePayload)
  } catch (error) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, { ok: false, error: error.message })
      return
    }
    const message = error instanceof Error ? error.message : 'Image upload processing failed.'
    sendJson(res, 500, { ok: false, error: message })
  }
}
