/**
 * Why this exists:
 * Some uploaded images do not have every responsive variant generated
 * (for example missing `-800w.webp` when source is smaller). This helper
 * builds srcset values using only files that actually exist.
 */
const srcsetPromiseCache = new Map<string, Promise<string>>()
const imageExistsPromiseCache = new Map<string, Promise<boolean>>()
const sourceCandidatesPromiseCache = new Map<string, Promise<string[]>>()

function toCandidateUrl(imageSrc: string, width: number) {
  const basePath = imageSrc.replace(/\.[^.]+$/, '')
  const encodedPath = encodeURI(basePath)
  return `${encodedPath}-${width}w.webp`
}

async function imageExistsViaImage(url: string) {
  return new Promise<boolean>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = url
  })
}

async function imageExistsClient(url: string) {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    // Some static hosts reject HEAD; fall back to a decoded image probe.
    if (response.status === 405) return imageExistsViaImage(url)
    return response.ok
  } catch {
    return false
  }
}

async function imageExistsSsr(url: string) {
  // Static node:* imports would break the client bundle; this branch only runs during SSR.
  const path = await import('node:path')
  const fs = await import('node:fs/promises')
  // Candidate URLs are URI-encoded; filesystem paths are not.
  const publicRelative = decodeURIComponent(url).replace(/^\//, '')
  const absolutePath = path.join(process.cwd(), 'public', publicRelative)
  try {
    await fs.access(absolutePath)
    return true
  } catch {
    return false
  }
}

async function imageExists(url: string) {
  // `import.meta.env.SSR` is reliable even when vite-ssg mocks `window` during rendering.
  if (import.meta.env.SSR || typeof window === 'undefined') return imageExistsSsr(url)
  return imageExistsClient(url)
}

async function imageExistsCached(url: string) {
  const cached = imageExistsPromiseCache.get(url)
  if (cached) return cached
  const load = imageExists(url)
  imageExistsPromiseCache.set(url, load)
  return load
}

export async function resolveExistingImageCandidates(candidateUrls: string[]) {
  const normalized = candidateUrls.filter((url): url is string => Boolean(url))
  if (!normalized.length) return []
  const cacheKey = normalized.join('|')
  const cached = sourceCandidatesPromiseCache.get(cacheKey)
  if (cached) return cached

  const load = (async () => {
    const existing: string[] = []
    for (const url of normalized) {
      if (await imageExistsCached(url)) {
        existing.push(url)
      }
    }
    return existing
  })()

  sourceCandidatesPromiseCache.set(cacheKey, load)
  return load
}

export async function resolveResponsiveSrcset(imageSrc: string, candidateWidths: number[]) {
  if (!imageSrc) return ''
  const cacheKey = `${imageSrc}|${candidateWidths.join(',')}`
  const cached = srcsetPromiseCache.get(cacheKey)
  if (cached) return cached

  const load = (async () => {
    const entries: string[] = []
    for (const width of candidateWidths) {
      const candidateUrl = toCandidateUrl(imageSrc, width)
      if (await imageExistsCached(candidateUrl)) {
        entries.push(`${candidateUrl} ${width}w`)
      }
    }
    return entries.join(', ')
  })()

  srcsetPromiseCache.set(cacheKey, load)
  return load
}
