/**
 * Why this exists:
 * Network calls are isolated in one module so endpoint changes and payload
 * evolution do not cascade through view/controller code.
 */
const API_TIMEOUT_MS = 30_000

export async function apiRequest(url, options = {}) {
  /**
   * Why this exists:
   * Timeouts prevent the UI from getting stuck indefinitely when a network
   * request or server-side git/image operation hangs unexpectedly.
   */
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  let response

  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...options.headers,
      },
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }
    throw error
  } finally {
    clearTimeout(timeoutHandle)
  }

  let payload = {}

  try {
    payload = await response.json()
  } catch {
    payload = {}
  }
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('backoffice:unauthorized', {
        detail: { url, payload },
      }),
    )
  }

  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed.')
    error.statusCode = response.status
    error.payload = payload
    throw error
  }
  return payload
}

export async function fetchFiles() {
  const payload = await apiRequest('/api/files')
  const files = Array.isArray(payload.files) ? payload.files : []
  const descriptors = Array.isArray(payload.descriptors) ? payload.descriptors : []
  return { files, descriptors }
}

export async function fetchImages(query) {
  const trimmedQuery = query.trim()
  const url = trimmedQuery ? `/api/images?q=${encodeURIComponent(trimmedQuery)}` : '/api/images'
  const payload = await apiRequest(url)
  return Array.isArray(payload.images) ? payload.images : []
}

export async function fetchFileContent(filePath) {
  const encodedFile = encodeURIComponent(filePath)
  const payload = await apiRequest(`/api/files/${encodedFile}`)
  return {
    content: payload.content,
    revision: payload.revision || '',
    schemaId: payload.schemaId || filePath,
    usage: Array.isArray(payload.usage) ? payload.usage : [],
  }
}

export async function saveFileContent({ filePath, content, deletedImages, baseRevision }) {
  const encodedFile = encodeURIComponent(filePath)
  return apiRequest(`/api/files/${encodedFile}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content,
      deletedImages,
      baseRevision,
    }),
  })
}

export async function fetchSchema(schemaId) {
  const encodedSchema = encodeURIComponent(schemaId)
  const payload = await apiRequest(`/api/schemas/${encodedSchema}`)
  return payload.schema
}

export async function validateFileContent({ filePath, content }) {
  const encodedFile = encodeURIComponent(filePath)
  const payload = await apiRequest(`/api/validate/${encodedFile}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  return {
    ok: Boolean(payload.ok),
    issues: Array.isArray(payload.issues) ? payload.issues : [],
  }
}

export async function uploadImageAsset({ file, activeFile, fieldPath, previousImagePath }) {
  const fileDataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unable to read selected image.'))
        return
      }
      const commaIndex = reader.result.indexOf(',')
      resolve(reader.result.slice(commaIndex + 1))
    }
    reader.onerror = () => reject(new Error('Unable to read selected image.'))
    reader.readAsDataURL(file)
  })

  const payload = await apiRequest('/api/upload-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      activeFile,
      fieldPath,
      previousImagePath,
      fileName: file.name,
      fileDataBase64,
    }),
  })

  return payload.imagePath
}

export async function fetchGitStatus() {
  const payload = await apiRequest('/api/git/status')
  return payload.status
}

export async function fetchGitPreview(sessionPaths) {
  const payload = await apiRequest('/api/git/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionPaths }),
  })
  return payload.preview
}

export async function finalizeGitReview(sessionPaths) {
  const payload = await apiRequest('/api/git/finalize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionPaths }),
  })
  return payload.result
}

export async function fetchSessionSummary(sessionPaths) {
  const normalizedPaths = Array.isArray(sessionPaths)
    ? sessionPaths.filter((entry) => typeof entry === 'string' && entry.trim())
    : []
  const query = normalizedPaths.length
    ? `?paths=${encodeURIComponent(normalizedPaths.join(','))}`
    : ''
  const payload = await apiRequest(`/api/session/summary${query}`)
  return payload.summary
}

export async function loginAdmin(credentials) {
  const payloadBody =
    typeof credentials === 'string'
      ? { password: credentials, username: 'admin' }
      : {
          password: credentials?.password || '',
          username: credentials?.username || 'admin',
        }

  const payload = await apiRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payloadBody),
  })
  return payload
}

export async function logoutAdmin() {
  const payload = await apiRequest('/api/auth/logout', {
    method: 'POST',
  })
  return payload
}

export async function fetchAuthSession() {
  const payload = await apiRequest('/api/auth/session')
  return {
    authenticated: Boolean(payload?.authenticated),
    user: payload?.user || null,
  }
}
