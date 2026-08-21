/**
 * Why this exists:
 * Image indexing, uploads, optimization triggers, and replacement cleanup are
 * grouped here so asset lifecycle logic stays isolated from request routing.
 */
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { ALLOWED_IMAGE_EXTENSIONS, IMAGE_FOLDER_BY_FILE } from '../constants.mjs'
import { paths } from '../config.mjs'
import { listJsonFiles } from './content-files.mjs'
import { getSafeContentPath, getSafeImagePath } from '../utils/path-guards.mjs'

const execFileAsync = promisify(execFile)
const IMAGE_INDEX_CONCURRENCY = 10
const OPTIMIZER_TIMEOUT_MS = 120_000
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024
const TEMP_IMAGE_MARKER = '-temp'
const ORIGINAL_PATH_RULES = [
  { file: 'site.json', pattern: /^logo\.src$/ },
  { file: 'site.json', pattern: /^seo\./ },
]
const FOLDER_OVERRIDE_RULES = [
  { file: 'site.json', pattern: /^seo\.pages\.[^.]+\.image$/, folder: 'og' },
]

/**
 * Why this exists:
 * Backoffice indexing can touch many files, so bounded concurrency improves
 * responsiveness without opening an unbounded number of file descriptors.
 */
async function mapWithConcurrency(items, concurrency, mapper) {
  if (!items.length) return []
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length))
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()))
  return results
}

export async function listImageFiles(dir = paths.imagesDir, baseDir = dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listImageFiles(absolutePath, baseDir)))
      continue
    }

    const extension = path.extname(entry.name).toLowerCase()
    if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) continue

    files.push(path.relative(baseDir, absolutePath).split(path.sep).join('/'))
  }

  return files.sort((left, right) => left.localeCompare(right))
}

function collectImageUsages(value, jsonPath, output = []) {
  if (typeof value === 'string' && value.startsWith('/images/')) {
    output.push({ imagePath: value, jsonPath })
    return output
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectImageUsages(item, `${jsonPath}[${index}]`, output))
    return output
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = jsonPath ? `${jsonPath}.${key}` : key
      collectImageUsages(item, nextPath, output)
    })
  }

  return output
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function normalizeSearchTerm(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
}

function imageMatchesQuery(image, query) {
  if (!query) return true
  const usageHaystack = image.usages
    .map((usage) => `${usage.file} ${usage.jsonPath}`.toLocaleLowerCase())
    .join(' ')
  const haystack =
    `${image.name} ${image.relativePath} ${image.publicPath} ${image.section} ${usageHaystack}`.toLocaleLowerCase()
  return haystack.includes(query)
}

export async function buildImageIndex(searchTerm = '') {
  const query = normalizeSearchTerm(searchTerm)
  const files = await listJsonFiles(paths.contentDir)
  const usageByImage = new Map()
  const allUsagesByFile = await mapWithConcurrency(files, IMAGE_INDEX_CONCURRENCY, async (file) => {
    const fullPath = getSafeContentPath(file)
    try {
      const rawContent = await readFile(fullPath, 'utf-8')
      const parsed = JSON.parse(rawContent)
      return { file, usages: collectImageUsages(parsed, '') }
    } catch {
      // Ignore unreadable/invalid files here so one broken JSON does not block image browsing.
      return { file, usages: [] }
    }
  })

  allUsagesByFile.forEach(({ file, usages }) => {
    usages.forEach((usage) => {
      if (!usageByImage.has(usage.imagePath)) {
        usageByImage.set(usage.imagePath, [])
      }
      usageByImage.get(usage.imagePath).push({ file, jsonPath: usage.jsonPath })
    })
  })

  const imageFiles = await listImageFiles(paths.imagesDir)
  const images = await mapWithConcurrency(
    imageFiles,
    IMAGE_INDEX_CONCURRENCY,
    async (relativePath) => {
      const fullPath = path.join(paths.imagesDir, relativePath)
      try {
        const fileStats = await stat(fullPath)
        const section = relativePath.includes('/') ? relativePath.split('/')[0] : 'root'
        const publicPath = `/images/${relativePath}`.replace(/\\/g, '/')
        const image = {
          section,
          name: path.basename(relativePath),
          relativePath,
          publicPath,
          bytes: fileStats.size,
          sizeLabel: formatBytes(fileStats.size),
          usages: usageByImage.get(publicPath) ?? [],
        }
        return imageMatchesQuery(image, query) ? image : null
      } catch {
        return null
      }
    },
  )

  return images.filter(Boolean)
}

function sanitizeFileName(filename) {
  const parsed = path.parse(filename)
  const safeName = parsed.name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
  const safeExt = parsed.ext.toLowerCase()

  if (!ALLOWED_IMAGE_EXTENSIONS.has(safeExt)) {
    throw new Error(`Unsupported image extension "${parsed.ext}".`)
  }

  return `${safeName || 'upload'}${safeExt}`
}

/**
 * Why this exists:
 * Unsaved uploads must stay identifiable so they can be safely discarded before
 * git finalize, while still producing unique file names to avoid collisions.
 */
function buildTempUploadName(safeFileName) {
  const parsed = path.parse(safeFileName)
  return `${parsed.name}-${Date.now()}${TEMP_IMAGE_MARKER}${parsed.ext}`
}

function getImageFolderForFile(activeFile) {
  const fileName = path.basename(activeFile || '')
  const folder = IMAGE_FOLDER_BY_FILE[fileName]
  if (!folder) throw new Error('Unsupported content file for image uploads.')
  return folder
}

function isRuleMatch({ rules, fileName, fieldPath }) {
  return rules.some((rule) => rule.file === fileName && rule.pattern.test(fieldPath))
}

function resolveFolderFromPreviousPath(previousImagePath) {
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
 * Why this exists:
 * Image destinations are mostly inferred from the active JSON file, but a few
 * fields (for example SEO OpenGraph images) need explicit folder overrides.
 */
function resolveUploadFolder({ activeFile, fieldPath, previousImagePath }) {
  const fileName = path.basename(activeFile || '')
  const normalizedFieldPath = String(fieldPath ?? '').trim()
  const previousFolder = resolveFolderFromPreviousPath(previousImagePath)
  if (previousFolder) return previousFolder

  const matchingOverride = FOLDER_OVERRIDE_RULES.find(
    (rule) => rule.file === fileName && rule.pattern.test(normalizedFieldPath),
  )
  if (matchingOverride) return matchingOverride.folder

  return getImageFolderForFile(activeFile)
}

function getRelativeOptimizerPath(absoluteImagePath) {
  return path.relative(paths.imagesDir, absoluteImagePath).split(path.sep).join('/')
}

function stripImageQueryAndHash(value) {
  return String(value ?? '')
    .split('#')[0]
    .split('?')[0]
}

function parsePublicImagePath(publicPath) {
  const normalized = stripImageQueryAndHash(publicPath)
  if (!normalized.startsWith('/images/')) return null
  const relativePath = normalized.replace(/^\/images\//, '')
  const parsed = path.posix.parse(relativePath)
  if (!parsed.base) return null
  return {
    normalized,
    relativePath,
    dir: parsed.dir,
    base: parsed.base,
    name: parsed.name,
    ext: parsed.ext,
  }
}

function hasTempMarkerInBaseName(baseName) {
  return baseName.includes(TEMP_IMAGE_MARKER)
}

function removeTempMarker(baseName) {
  return baseName.replace(TEMP_IMAGE_MARKER, '')
}

function canonicalizeResponsiveBaseName(baseName) {
  return baseName.replace(/-\d+w$/i, '')
}

function getTempBaseKey(publicPath) {
  const parsed = parsePublicImagePath(publicPath)
  if (!parsed) return ''
  const canonicalName = canonicalizeResponsiveBaseName(parsed.name)
  if (!hasTempMarkerInBaseName(canonicalName)) return ''
  return `${parsed.dir}/${canonicalName}`
}

function buildPublicPathFromDirAndName(dir, name, ext = '.webp') {
  const directory = dir && dir !== '.' ? `${dir}/` : ''
  return `/images/${directory}${name}${ext}`.replace(/\\/g, '/')
}

function toPublicPathFromAbsoluteImagePath(absolutePath) {
  const relativePath = path.relative(paths.publicDir, absolutePath).split(path.sep).join('/')
  return `/${relativePath}`.replace(/\\/g, '/')
}

async function pathExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function runOptimizerForImage(absoluteImagePath) {
  const relativePath = getRelativeOptimizerPath(absoluteImagePath)
  const scriptPath = path.join(paths.projectRoot, 'scripts', 'optimize-images.js')
  await execFileAsync(process.execPath, [scriptPath, '--file', relativePath], {
    cwd: paths.projectRoot,
    maxBuffer: 1024 * 1024,
    timeout: OPTIMIZER_TIMEOUT_MS,
  })
}

function toWebpPublicPath(publicPath) {
  const parsed = path.posix.parse(publicPath)
  return path.posix.join(parsed.dir, `${parsed.name}.webp`)
}

async function hasImageAtPublicPath(publicPath) {
  try {
    await stat(getSafeImagePath(publicPath))
    return true
  } catch {
    return false
  }
}

/**
 * Why this exists:
 * Some JSON fields must keep original files (SEO/logo compatibility), while
 * most content images should reference optimized `.webp` outputs by default.
 */
function shouldKeepOriginalPath({ activeFile, fieldPath }) {
  const fileName = path.basename(activeFile || '')
  const normalizedFieldPath = String(fieldPath ?? '').trim()
  return isRuleMatch({
    rules: ORIGINAL_PATH_RULES,
    fileName,
    fieldPath: normalizedFieldPath,
  })
}

function isSupportedPublicImagePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return false
  if (value.startsWith('/content/')) return false
  return /\.(png|jpe?g|jfif|webp|svg)$/i.test(stripImageQueryAndHash(value))
}

/**
 * Why this exists:
 * Deletions must support both `/images/*` and root-level public images such as
 * `/logo.png`, while still preventing traversal outside `public/`.
 */
function resolveSafeImageDeletePath(publicPath) {
  const cleanPath = stripImageQueryAndHash(publicPath)
  if (!isSupportedPublicImagePath(cleanPath)) {
    throw new Error('Invalid image path for deletion.')
  }
  if (cleanPath.startsWith('/images/')) {
    return getSafeImagePath(cleanPath)
  }

  const relativePath = cleanPath.replace(/^\/+/, '')
  const fullPath = path.resolve(paths.publicDir, relativePath)
  if (!fullPath.startsWith(`${paths.publicDir}${path.sep}`) && fullPath !== paths.publicDir) {
    throw new Error('Invalid image path.')
  }
  if (fullPath.startsWith(`${paths.contentDir}${path.sep}`) || fullPath === paths.contentDir) {
    throw new Error('Cannot delete content files as images.')
  }
  return fullPath
}

export async function uploadImage(body) {
  const activeFile = String(body.activeFile ?? '')
  const fieldPath = String(body.fieldPath ?? '')
  const previousImagePath = String(body.previousImagePath ?? '')
  const originalName = String(body.fileName ?? '')
  const fileDataBase64 = String(body.fileDataBase64 ?? '')
  const folder = resolveUploadFolder({ activeFile, fieldPath, previousImagePath })
  const safeFileName = sanitizeFileName(originalName)
  const uniqueName = buildTempUploadName(safeFileName)
  const outputDir = folder === 'root' ? paths.imagesDir : path.join(paths.imagesDir, folder)
  const outputPath = path.join(outputDir, uniqueName)
  const relativeForPublic = folder === 'root' ? uniqueName : `${folder}/${uniqueName}`
  const publicImagePath = `/images/${relativeForPublic}`.replace(/\\/g, '/')

  if (!fileDataBase64) throw new Error('Image data is missing.')

  const rawBuffer = Buffer.from(fileDataBase64, 'base64')
  if (!rawBuffer.byteLength) throw new Error('Image payload is empty.')
  if (rawBuffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error('Image is too large. Maximum upload size is 12 MB.')
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, rawBuffer)
  try {
    await runOptimizerForImage(outputPath)
  } catch {
    await unlink(outputPath).catch(() => {})
    throw new Error('Image uploaded, but optimization failed.')
  }

  const keepOriginalPath = shouldKeepOriginalPath({ activeFile, fieldPath })
  if (keepOriginalPath || publicImagePath.endsWith('.svg') || publicImagePath.endsWith('.webp')) {
    return { imagePath: publicImagePath }
  }

  const optimizedPublicPath = toWebpPublicPath(publicImagePath)
  if (await hasImageAtPublicPath(optimizedPublicPath)) {
    return { imagePath: optimizedPublicPath }
  }

  return { imagePath: publicImagePath }
}

function collectTempImagePathsFromContent(value, output = new Set()) {
  if (typeof value === 'string') {
    const parsed = parsePublicImagePath(value)
    if (parsed && hasTempMarkerInBaseName(parsed.name)) {
      output.add(parsed.normalized)
    }
    return output
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectTempImagePathsFromContent(item, output))
    return output
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectTempImagePathsFromContent(item, output))
  }

  return output
}

/*
 * Saved JSON can point at any optimized member of a temp upload family.
 * Finalization needs to rewrite every matching family path so the persisted
 * content never keeps a `-temp` reference after the rename completes.
 */
function replaceImagePathValues(value, replacements) {
  if (typeof value === 'string') {
    const normalized = stripImageQueryAndHash(value)
    if (!replacements.has(normalized)) return value
    return value.replace(normalized, replacements.get(normalized))
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceImagePathValues(item, replacements))
  }

  if (value && typeof value === 'object') {
    const nextObject = {}
    Object.entries(value).forEach(([key, item]) => {
      nextObject[key] = replaceImagePathValues(item, replacements)
    })
    return nextObject
  }

  return value
}

function isTempFamilyMember(fileName, tempFamilyName) {
  const candidateName = path.parse(fileName).name
  return candidateName === tempFamilyName || candidateName.startsWith(`${tempFamilyName}-`)
}

function toRenamedPublicPath({ dir, fileName }) {
  const parsed = path.parse(fileName)
  return buildPublicPathFromDirAndName(dir, removeTempMarker(parsed.name), parsed.ext)
}

/*
 * A temp upload may produce original, webp, and responsive siblings.
 * These files must be renamed as one family so save and later git flows stay
 * aligned with the committed JSON paths.
 */
async function finalizeTempImageFamilyAtPath(tempPublicPath) {
  const parsed = parsePublicImagePath(tempPublicPath)
  if (!parsed) {
    return {
      primaryPath: tempPublicPath,
      replacements: [],
    }
  }

  const tempFamilyName = canonicalizeResponsiveBaseName(parsed.name)
  if (!hasTempMarkerInBaseName(tempFamilyName)) {
    return {
      primaryPath: tempPublicPath,
      replacements: [],
    }
  }

  const absoluteDirectory = path.dirname(getSafeImagePath(parsed.normalized))
  const directoryEntries = await readdir(absoluteDirectory).catch(() => [])
  const candidateFiles = directoryEntries.filter((fileName) =>
    isTempFamilyMember(fileName, tempFamilyName),
  )

  if (!candidateFiles.length) {
    return {
      primaryPath: tempPublicPath,
      replacements: [],
    }
  }

  const renamePlan = candidateFiles.map((fileName) => {
    const sourcePath = path.join(absoluteDirectory, fileName)
    const targetName = `${removeTempMarker(path.parse(fileName).name)}${path.extname(fileName)}`
    const targetPath = path.join(absoluteDirectory, targetName)
    return { fileName, sourcePath, targetName, targetPath }
  })

  const sourcePathSet = new Set(renamePlan.map((entry) => entry.sourcePath))
  for (const entry of renamePlan) {
    if (entry.sourcePath === entry.targetPath) continue
    if (!sourcePathSet.has(entry.targetPath) && (await pathExists(entry.targetPath))) {
      throw new Error(`Cannot finalize image because target already exists: ${entry.targetName}`)
    }
  }

  for (const entry of renamePlan) {
    if (entry.sourcePath === entry.targetPath) continue
    await rename(entry.sourcePath, entry.targetPath)
  }

  const replacements = candidateFiles.map((fileName) => ({
    from: buildPublicPathFromDirAndName(parsed.dir, path.parse(fileName).name, path.extname(fileName)),
    to: toRenamedPublicPath({ dir: parsed.dir, fileName }),
  }))

  const primaryMatch = replacements.find((entry) => entry.from === parsed.normalized)
  return {
    primaryPath: primaryMatch?.to || tempPublicPath.replace(TEMP_IMAGE_MARKER, ''),
    replacements,
  }
}

export async function finalizeTempImagesInContent(content) {
  const tempPaths = Array.from(collectTempImagePathsFromContent(content))
  if (!tempPaths.length) {
    return { content, finalizedImages: [] }
  }

  const replacements = new Map()
  const finalizedImages = []
  const processedFamilies = new Set()

  for (const tempPath of tempPaths) {
    const familyKey = getTempBaseKey(tempPath)
    if (!familyKey || processedFamilies.has(familyKey)) continue
    processedFamilies.add(familyKey)

    const { replacements: familyReplacements } = await finalizeTempImageFamilyAtPath(tempPath)
    familyReplacements.forEach((entry) => {
      replacements.set(entry.from, entry.to)
      if (entry.from !== entry.to) {
        finalizedImages.push(entry)
      }
    })
  }

  for (const tempPath of tempPaths) {
    if (!replacements.has(tempPath)) {
      const finalizedPath = tempPath.replace(TEMP_IMAGE_MARKER, '')
      replacements.set(tempPath, finalizedPath)
      if (finalizedPath !== tempPath) {
        finalizedImages.push({ from: tempPath, to: finalizedPath })
      }
    }
  }

  return {
    content: replaceImagePathValues(content, replacements),
    finalizedImages,
  }
}

async function collectReferencedImagePaths() {
  const files = await listJsonFiles(paths.contentDir)
  const referenced = new Set()

  await Promise.all(
    files.map(async (filePath) => {
      try {
        const fullPath = getSafeContentPath(filePath)
        const raw = await readFile(fullPath, 'utf-8')
        const parsed = JSON.parse(raw)
        collectImageUsages(parsed, '').forEach((usage) => referenced.add(usage.imagePath))
      } catch {
        // Ignore invalid/unreadable files; they are handled by content endpoints.
      }
    }),
  )

  return referenced
}

/**
 * Why this exists:
 * Users can upload and then leave without saving; these temp artifacts should
 * never be pushed, so finalize flow purges unreferenced `-temp` families.
 */
export async function cleanupDanglingTempUploads() {
  const [imageFiles, referencedPaths] = await Promise.all([
    listImageFiles(paths.imagesDir),
    collectReferencedImagePaths(),
  ])

  const referencedTempKeys = new Set(
    Array.from(referencedPaths)
      .map((publicPath) => getTempBaseKey(publicPath))
      .filter(Boolean),
  )
  const candidateTempKeys = new Set(
    imageFiles.map((relativePath) => getTempBaseKey(`/images/${relativePath}`)).filter(Boolean),
  )

  const removedPublicPaths = []
  for (const tempKey of candidateTempKeys) {
    if (referencedTempKeys.has(tempKey)) continue
    const lastSlashIndex = tempKey.lastIndexOf('/')
    const dir = lastSlashIndex >= 0 ? tempKey.slice(0, lastSlashIndex) : '.'
    const baseName = lastSlashIndex >= 0 ? tempKey.slice(lastSlashIndex + 1) : tempKey
    if (!baseName) continue
    const canonicalPublicPath = buildPublicPathFromDirAndName(dir, baseName, '.webp')
    const removedFamilyPaths = await deleteImageWithVariants(canonicalPublicPath)
    removedPublicPaths.push(...removedFamilyPaths)
  }

  return { removedPublicPaths: Array.from(new Set(removedPublicPaths)) }
}

/**
 * Why this exists:
 * Session summaries and UX badges need visibility into unsaved temp uploads
 * without mutating files, so this read-only inspector mirrors cleanup detection.
 */
export async function listPendingTempUploads() {
  const [imageFiles, referencedPaths] = await Promise.all([
    listImageFiles(paths.imagesDir),
    collectReferencedImagePaths(),
  ])

  const referencedTempKeys = new Set(
    Array.from(referencedPaths)
      .map((publicPath) => getTempBaseKey(publicPath))
      .filter(Boolean),
  )
  const candidateTempKeys = new Set(
    imageFiles.map((relativePath) => getTempBaseKey(`/images/${relativePath}`)).filter(Boolean),
  )

  const referenced = []
  const dangling = []
  candidateTempKeys.forEach((tempKey) => {
    const lastSlashIndex = tempKey.lastIndexOf('/')
    const dir = lastSlashIndex >= 0 ? tempKey.slice(0, lastSlashIndex) : '.'
    const baseName = lastSlashIndex >= 0 ? tempKey.slice(lastSlashIndex + 1) : tempKey
    if (!baseName) return
    const canonicalPublicPath = buildPublicPathFromDirAndName(dir, baseName, '.webp')
    if (referencedTempKeys.has(tempKey)) {
      referenced.push(canonicalPublicPath)
    } else {
      dangling.push(canonicalPublicPath)
    }
  })

  return {
    referenced: Array.from(new Set(referenced)),
    dangling: Array.from(new Set(dangling)),
  }
}

export async function deleteImageWithVariants(publicPath) {
  if (!isSupportedPublicImagePath(publicPath)) return []
  const targetPath = resolveSafeImageDeletePath(publicPath)
  const directory = path.dirname(targetPath)
  const basename = path.parse(targetPath).name
  const candidates = new Set([targetPath])
  ALLOWED_IMAGE_EXTENSIONS.forEach((ext) => {
    candidates.add(path.join(directory, `${basename}${ext}`))
  })

  try {
    const filesInDir = await readdir(directory)
    const escapedBaseName = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const responsiveVariantPattern = new RegExp(`^${escapedBaseName}-\\d+w\\.webp$`, 'i')
    for (const fileName of filesInDir) {
      if (responsiveVariantPattern.test(fileName)) {
        candidates.add(path.join(directory, fileName))
      }
    }
  } catch {
    // Directory read errors can be ignored because individual deletes below are idempotent.
  }

  const existingCandidates = await Promise.all(
    Array.from(candidates).map(async (filePath) => {
      const exists = await pathExists(filePath)
      return exists ? filePath : null
    }),
  )
  const existingPaths = existingCandidates.filter(Boolean)

  await Promise.all(
    Array.from(candidates).map(async (filePath) => {
      try {
        await unlink(filePath)
      } catch {
        // Ignore missing files to keep cleanup idempotent.
      }
    }),
  )

  return existingPaths.map((filePath) => toPublicPathFromAbsoluteImagePath(filePath))
}
