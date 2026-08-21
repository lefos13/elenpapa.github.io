/**
 * Why this exists:
 * In-memory image processing and responsive variant generator for the Vercel-ready
 * Git-backed CMS. Replaces local filesystem scripts with zero-disk serverless Sharp
 * pipelines that produce buffer blobs ready for atomic GitHub tree commits.
 */

import path from 'node:path'
import sharp from 'sharp'
import {
  ALLOWED_IMAGE_EXTENSIONS,
  FOLDER_OVERRIDE_RULES,
  IMAGE_FOLDER_BY_FILE,
  MAX_UPLOAD_BYTES,
  ORIGINAL_PATH_RULES,
} from './config'
import { HttpError } from './http'

/**
 * Image folder targets that participate in automatic responsive srcset generation.
 */
export const RESPONSIVE_FOLDERS: Record<string, true> = {
  posts: true,
  'posts/webp': true,
  books: true,
  'painted-books': true,
  moonlight: true,
}

/**
 * Target widths for generated responsive variants.
 */
export const RESPONSIVE_WIDTHS = [400, 800] as const

/**
 * Represents a single processed image buffer artifact ready to be committed to Git.
 */
export interface ProcessedImageVariant {
  /**
   * Git repository destination path (e.g. `public/images/books/my-book-1786971412.webp`).
   */
  path: string
  /**
   * Raw in-memory binary buffer of the optimized image.
   */
  buffer: Buffer
  /**
   * Relative public URL path for client-side consumption (e.g. `/images/books/my-book-1786971412.webp`).
   */
  publicPath: string
  /**
   * Pixel width of this variant if known.
   */
  width?: number
  /**
   * Pixel height of this variant if known.
   */
  height?: number
}

/**
 * Metadata describing the primary uploaded and processed image.
 */
export interface ImageMetadata {
  width?: number
  height?: number
  format?: string
  size: number
}

/**
 * Complete result of an image processing operation.
 */
export interface ProcessedImageResult {
  /**
   * Public URL path referencing the primary image (saved to content JSON).
   */
  primaryPublicPath: string
  /**
   * All generated image variants (primary + responsive widths) for Git blob creation.
   */
  variants: ProcessedImageVariant[]
  /**
   * Metadata describing dimensions, format, and byte size.
   */
  metadata: ImageMetadata
}

/**
 * Context options for resolving destination directory.
 */
export interface DestinationFolderOptions {
  activeFile?: string
  fieldPath?: string
  previousImagePath?: string
}

/**
 * Options provided to the main image upload processing pipeline.
 */
export interface ProcessUploadedImageOptions {
  buffer: Buffer
  originalFilename: string
  activeFile?: string
  fieldPath?: string
  previousImagePath?: string
}

/**
 * Normalizes an uploaded filename:
 * - Converts Unicode accents and spaces into clean kebab-case.
 * - Strips unsafe path characters.
 * - Validates file extension against allowed whitelist.
 */
export function sanitizeFileName(filename: string): string {
  const normalized = String(filename ?? '')
    .trim()
    .replace(/\\/g, '/')
  const parsed = path.posix.parse(normalized)

  const safeName = parsed.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.-]+/gu, '-')
    .replace(/_/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
  const safeExt = parsed.ext.toLowerCase()

  if (!ALLOWED_IMAGE_EXTENSIONS.has(safeExt)) {
    throw new HttpError(
      400,
      `Unsupported image extension "${parsed.ext}". Allowed extensions: ${Array.from(
        ALLOWED_IMAGE_EXTENSIONS,
      ).join(', ')}`,
    )
  }

  const baseName = safeName || 'upload'
  return `${baseName}${safeExt}`
}

/**
 * Constructs a unique, collision-resistant filename incorporating a timestamp.
 */
export function buildUniqueImageName(safeName: string, ext: string = '.webp'): string {
  const normalized = safeName.replace(/\\/g, '/')
  const parsed = path.posix.parse(normalized)
  const baseName = parsed.name || safeName
  const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`

  return `${baseName}-${Date.now()}${normalizedExt}`
}

/**
 * Resolves directory from a previously configured image path.
 */
function resolveFolderFromPreviousPath(previousImagePath?: string): string {
  if (typeof previousImagePath !== 'string' || !previousImagePath.startsWith('/images/')) {
    return ''
  }

  const relativePath = previousImagePath.replace(/^\/images\//, '')
  const normalizedPath = path.posix.normalize(relativePath)
  if (!normalizedPath || normalizedPath.startsWith('../') || normalizedPath.includes('/../')) {
    return ''
  }

  const directory = path.posix.dirname(normalizedPath)
  return directory === '.' ? 'root' : directory
}

/**
 * Resolves the destination folder under `public/images/` based on:
 * 1. Previous image path (if updating an existing image).
 * 2. Field-specific override rules (e.g. SEO page image -> 'og').
 * 3. File mapping (e.g. 'book.json' -> 'books', 'posts.json' -> 'posts/webp').
 * 4. Fallback to 'common'.
 */
export function getImageDestinationFolder(options: DestinationFolderOptions = {}): string {
  const { activeFile, fieldPath, previousImagePath } = options

  // 1. Existing image directory retention
  const previousFolder = resolveFolderFromPreviousPath(previousImagePath)
  if (previousFolder) {
    return previousFolder
  }

  const fileName = activeFile ? path.posix.basename(activeFile.replace(/\\/g, '/')) : ''
  const normalizedFieldPath = String(fieldPath ?? '').trim()

  // 2. Field-specific overrides (e.g. OpenGraph images)
  if (fileName && normalizedFieldPath) {
    const matchingOverride = FOLDER_OVERRIDE_RULES.find(
      (rule) => rule.file === fileName && rule.pattern.test(normalizedFieldPath),
    )
    if (matchingOverride) {
      return matchingOverride.folder
    }
  }

  // 3. Content file to folder mapping
  if (fileName && fileName in IMAGE_FOLDER_BY_FILE) {
    return IMAGE_FOLDER_BY_FILE[fileName]
  }

  // 4. Default fallback
  return 'common'
}

/**
 * Checks if a specific content field requires keeping the original image format
 * (for example site logo or SEO metadata where PNG/JPEG is required).
 */
export function shouldKeepOriginalFormat(options: {
  activeFile?: string
  fieldPath?: string
}): boolean {
  const fileName = options.activeFile
    ? path.posix.basename(options.activeFile.replace(/\\/g, '/'))
    : ''
  const normalizedFieldPath = String(options.fieldPath ?? '').trim()
  if (!fileName || !normalizedFieldPath) return false

  return ORIGINAL_PATH_RULES.some(
    (rule) => rule.file === fileName && rule.pattern.test(normalizedFieldPath),
  )
}

/**
 * Core image processing pipeline:
 * - Validates binary payload.
 * - Extracts image dimensions & format.
 * - Leaves SVGs untouched.
 * - Optimizes raster formats to WebP (or keeps format for SEO/logo).
 * - Generates responsive variants (400w, 800w) for eligible directories.
 * - Returns all blobs and metadata ready for Git tree creation.
 */
export async function processUploadedImage(
  options: ProcessUploadedImageOptions,
): Promise<ProcessedImageResult> {
  const { buffer, originalFilename, activeFile, fieldPath, previousImagePath } = options

  if (!buffer || !Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
    throw new HttpError(400, 'Image payload is empty or missing.')
  }

  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    const maxMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))
    throw new HttpError(400, `Image is too large. Maximum upload size is ${maxMb} MB.`)
  }

  const sanitized = sanitizeFileName(originalFilename)
  const parsedSafe = path.posix.parse(sanitized)
  const originalExt = parsedSafe.ext.toLowerCase()
  const baseName = parsedSafe.name

  const folder = getImageDestinationFolder({ activeFile, fieldPath, previousImagePath })
  const keepOriginal = shouldKeepOriginalFormat({ activeFile, fieldPath })
  const isSvg = originalExt === '.svg'
  const folderPrefix = folder === 'root' ? '' : `${folder}/`

  // 1. Vector SVGs: pass through unchanged
  if (isSvg) {
    const uniqueName = buildUniqueImageName(baseName, '.svg')
    const publicPath = `/images/${folderPrefix}${uniqueName}`
    const repoPath = `public/images/${folderPrefix}${uniqueName}`

    let metaWidth: number | undefined
    let metaHeight: number | undefined

    try {
      const svgMeta = await sharp(buffer).metadata()
      metaWidth = svgMeta.width
      metaHeight = svgMeta.height
    } catch {
      // SVGs may not always yield raster dimensions via Sharp; fallback gracefully.
    }

    const primaryVariant: ProcessedImageVariant = {
      path: repoPath,
      buffer,
      publicPath,
      width: metaWidth,
      height: metaHeight,
    }

    return {
      primaryPublicPath: publicPath,
      variants: [primaryVariant],
      metadata: {
        width: metaWidth,
        height: metaHeight,
        format: 'svg',
        size: buffer.byteLength,
      },
    }
  }

  // 2. Raster images: inspect with Sharp
  const sharpInstance = sharp(buffer)
  const metadata = await sharpInstance.metadata()

  if (!metadata.format) {
    throw new HttpError(400, 'Could not decode image format.')
  }

  let primaryBuffer: Buffer
  let primaryExt: string

  if (keepOriginal) {
    primaryExt = originalExt
    // If format is already WebP, apply standard webp compression; otherwise maintain original format
    if (metadata.format === 'png') {
      primaryBuffer = await sharp(buffer).png({ compressionLevel: 9 }).toBuffer()
    } else if (metadata.format === 'jpeg') {
      primaryBuffer = await sharp(buffer).jpeg({ quality: 85 }).toBuffer()
    } else if (metadata.format === 'webp') {
      primaryBuffer = await sharp(buffer).webp({ quality: 85, effort: 4 }).toBuffer()
    } else {
      primaryBuffer = buffer
    }
  } else {
    primaryExt = '.webp'
    primaryBuffer = await sharp(buffer).webp({ quality: 85, effort: 4 }).toBuffer()
  }

  const primaryUniqueName = buildUniqueImageName(baseName, primaryExt)
  const primaryPublicPath = `/images/${folderPrefix}${primaryUniqueName}`
  const primaryRepoPath = `public/images/${folderPrefix}${primaryUniqueName}`

  const primaryMeta = await sharp(primaryBuffer).metadata()
  const primaryVariant: ProcessedImageVariant = {
    path: primaryRepoPath,
    buffer: primaryBuffer,
    publicPath: primaryPublicPath,
    width: primaryMeta.width ?? metadata.width,
    height: primaryMeta.height ?? metadata.height,
  }

  const variants: ProcessedImageVariant[] = [primaryVariant]

  // 3. Generate responsive variants for eligible directories (posts, books, etc.)
  const isResponsive =
    Boolean(RESPONSIVE_FOLDERS[folder]) ||
    Object.keys(RESPONSIVE_FOLDERS).some((target) => folder.startsWith(`${target}/`))
  if (isResponsive && !keepOriginal) {
    const uniqueBase = path.posix.parse(primaryUniqueName).name

    for (const targetWidth of RESPONSIVE_WIDTHS) {
      // Don't upscale if the original image is narrower than target width
      const wBuffer = await sharp(buffer)
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer()

      const wMeta = await sharp(wBuffer).metadata()
      const variantName = `${uniqueBase}-${targetWidth}w.webp`
      const variantPublicPath = `/images/${folderPrefix}${variantName}`
      const variantRepoPath = `public/images/${folderPrefix}${variantName}`

      variants.push({
        path: variantRepoPath,
        buffer: wBuffer,
        publicPath: variantPublicPath,
        width: wMeta.width,
        height: wMeta.height,
      })
    }
  }

  return {
    primaryPublicPath: primaryPublicPath,
    variants,
    metadata: {
      width: primaryVariant.width ?? metadata.width,
      height: primaryVariant.height ?? metadata.height,
      format: keepOriginal ? (metadata.format ?? primaryExt.replace('.', '')) : 'webp',
      size: primaryBuffer.byteLength,
    },
  }
}

/**
 * Returns all related responsive variant public paths (e.g. `-400w.webp`, `-800w.webp`)
 * for an image path to assist with cache invalidation, previews, and deletion.
 */
export function getResponsiveVariantPaths(publicPath: string): string[] {
  if (typeof publicPath !== 'string') return []

  const clean = publicPath.split('#')[0].split('?')[0].trim()
  if (!clean.startsWith('/images/')) return []

  const parsed = path.posix.parse(clean)
  if (!parsed.base) return []

  // Strip existing responsive suffix (e.g. `image-400w` -> `image`)
  const canonicalBase = parsed.name.replace(/-\d+w$/i, '')
  const directory = parsed.dir

  return RESPONSIVE_WIDTHS.map((width) => `${directory}/${canonicalBase}-${width}w.webp`)
}
