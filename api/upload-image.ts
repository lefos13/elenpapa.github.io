/**
 * Why this exists:
 * Vercel Serverless Function handling media asset uploads (`POST /api/upload-image`).
 * Receives base64-encoded image data, runs in-memory Sharp optimization and responsive
 * variant generation via `api/lib/image-processor.ts`, and returns the processed asset payloads.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from './lib/auth-guard'
import { formatBytes } from './lib/github'
import { isHttpError, readJsonBody, sendJson } from './lib/http'
import { processUploadedImage } from './lib/image-processor'

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
    size?: number
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    const body = await readJsonBody<UploadImageRequestBody>(req)

    const rawBase64 = String(body?.base64 || body?.fileDataBase64 || body?.data || '').trim()

    const filename = String(
      body?.filename || body?.fileName || body?.name || body?.originalFilename || 'upload.webp',
    ).trim()

    const activeFile = String(body?.activeFile || body?.file || '').trim()
    const fieldPath = String(body?.fieldPath || body?.path || '').trim()
    const previousImagePath = String(body?.previousPath || body?.previousImagePath || '').trim()

    if (!rawBase64) {
      sendJson(res, 400, {
        ok: false,
        error: 'Image base64 payload is missing or empty.',
      })
      return
    }

    let cleanBase64 = rawBase64
    const commaIndex = cleanBase64.indexOf(',')
    if (commaIndex !== -1 && cleanBase64.slice(0, commaIndex).includes(';base64')) {
      cleanBase64 = cleanBase64.slice(commaIndex + 1).trim()
    }

    const inputBuffer = Buffer.from(cleanBase64, 'base64')
    if (!inputBuffer.byteLength) {
      sendJson(res, 400, {
        ok: false,
        error: 'Image payload could not be decoded from base64.',
      })
      return
    }

    const result = await processUploadedImage({
      buffer: inputBuffer,
      originalFilename: filename,
      activeFile,
      fieldPath,
      previousImagePath,
    })

    const variants: UploadedImageVariantResponse[] = result.variants.map((variant) => ({
      path: variant.path,
      bufferBase64: variant.buffer.toString('base64'),
      publicPath: variant.publicPath,
      width: variant.width,
      height: variant.height,
    }))

    const totalOrPrimarySize = result.metadata.size ?? inputBuffer.byteLength
    const sizeLabel = formatBytes(totalOrPrimarySize)

    sendJson(res, 200, {
      ok: true,
      imagePath: result.primaryPublicPath,
      publicPath: result.primaryPublicPath,
      variants,
      sizeLabel,
      metadata: {
        width: result.metadata.width,
        height: result.metadata.height,
        format: result.metadata.format,
        size: result.metadata.size,
      },
    })
  } catch (error) {
    const statusCode = isHttpError(error) ? error.statusCode : 500
    const message = error instanceof Error ? error.message : 'Image upload processing failed.'
    sendJson(res, statusCode, {
      ok: false,
      error: message,
    })
  }
}
