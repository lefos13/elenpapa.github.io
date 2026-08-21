/**
 * Why this exists:
 * Request routing is centralized here so endpoint growth stays manageable and
 * service modules can be tested/reused independently from HTTP wiring.
 */
import { BODY_LIMIT_BYTES, HOST, PORT, paths } from './config.mjs'
import {
  listContentFileDescriptors,
  listJsonFiles,
  readContentFile,
  writeContentFile,
} from './services/content-files.mjs'
import {
  createReviewBranchAndPush,
  getGitStatusSummary,
  getSessionChangePreview,
} from './services/git.mjs'
import {
  buildImageIndex,
  cleanupDanglingTempUploads,
  deleteImageWithVariants,
  finalizeTempImagesInContent,
  listPendingTempUploads,
  uploadImage,
} from './services/images.mjs'
import { buildEditorSchema, getSchemaById } from './services/schemas.mjs'
import { assertBaseRevision, getContentRevision } from './services/revision.mjs'
import { validateContentPayload } from './services/validation.mjs'
import { createPullRequestForFinalize } from './services/github.mjs'
import { serveFileFromBaseDir } from './services/static-files.mjs'
import {
  HttpError,
  assertJsonRequest,
  isHttpError,
  readJsonBody,
  sendJson,
  sendText,
} from './utils/http.mjs'

function extractContentPayload(body) {
  const hasContentEnvelope =
    body && typeof body === 'object' && !Array.isArray(body) && Object.hasOwn(body, 'content')
  return hasContentEnvelope ? body.content : body
}

function extractDeletedImages(body) {
  if (body && typeof body === 'object' && Array.isArray(body.deletedImages)) {
    const unique = new Set()
    body.deletedImages.forEach((item) => {
      if (typeof item !== 'string') return
      if (!item.startsWith('/')) return
      if (item.startsWith('/content/')) return
      if (!/\.(png|jpe?g|jfif|webp|svg)(?:[?#].*)?$/i.test(item)) return
      unique.add(item)
    })
    return Array.from(unique)
  }
  return []
}

/**
 * Why this exists:
 * Backoffice endpoints mutate repository files and can run on shared networks,
 * so mutating API calls are restricted to same-origin browser requests.
 */
function assertSameOriginForMutation(req, method, pathname) {
  if (!pathname.startsWith('/api/')) return
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return

  const originHeader = String(req.headers.origin ?? '').trim()
  if (!originHeader) return
  const hostHeader = String(req.headers.host ?? '').trim()
  if (!hostHeader) return

  let originHost = ''
  try {
    originHost = new URL(originHeader).host
  } catch {
    throw new HttpError(403, 'Invalid request origin.')
  }

  if (originHost !== hostHeader) {
    throw new HttpError(403, 'Cross-origin mutation requests are blocked.')
  }
}

export async function handleRequest(req, res) {
  if (!req.url || !req.method) {
    sendText(res, 400, 'Bad request.')
    return
  }

  const url = new URL(req.url, `http://${req.headers.host ?? `${HOST}:${PORT}`}`)
  const pathname = url.pathname
  const method = req.method.toUpperCase()

  try {
    assertSameOriginForMutation(req, method, pathname)
    if (pathname === '/api/auth/login' && method === 'POST') {
      assertJsonRequest(req)
      const body = await readJsonBody(req, BODY_LIMIT_BYTES)
      const password = typeof body?.password === 'string' ? body.password : ''
      const expectedPassword = process.env.ADMIN_PASSWORD || 'admin'
      if (password !== expectedPassword) {
        sendJson(res, 401, { ok: false, error: 'Invalid admin credentials.' })
        return
      }
      const token = Buffer.from(JSON.stringify({ user: body?.username || 'admin', exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64')
      res.setHeader('Set-Cookie', `backoffice_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`)
      sendJson(res, 200, { ok: true, user: body?.username || 'admin' })
      return
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      res.setHeader('Set-Cookie', 'backoffice_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
      sendJson(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/auth/session' && method === 'GET') {
      const cookieHeader = req.headers.cookie || ''
      const match = cookieHeader.match(/backoffice_session=([^;]+)/)
      if (match) {
        try {
          const decoded = JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'))
          if (decoded.exp > Date.now()) {
            sendJson(res, 200, { authenticated: true, user: decoded.user || 'admin' })
            return
          }
        } catch {
          // Invalid cookie, proceed to unauthenticated
        }
      }
      sendJson(res, 200, { authenticated: false })
      return
    }

    if (method === 'GET' && pathname === '/api/files') {
      const files = await listJsonFiles(paths.contentDir)
      const descriptors = await listContentFileDescriptors()
      sendJson(res, 200, { files, descriptors })
      return
    }

    if (method === 'GET' && pathname === '/api/images') {
      const query = url.searchParams.get('q') ?? ''
      const images = await buildImageIndex(query)
      sendJson(res, 200, { images })
      return
    }

    if (method === 'GET' && pathname === '/api/git/status') {
      const status = await getGitStatusSummary()
      sendJson(res, 200, { status })
      return
    }

    if (method === 'GET' && pathname.startsWith('/api/schemas/')) {
      const schemaId = pathname.replace('/api/schemas/', '')
      const content = await readContentFile(schemaId)
      const schema = getSchemaById(schemaId, content)
      sendJson(res, 200, { schema })
      return
    }

    if (method === 'GET' && pathname === '/api/session/summary') {
      const rawPaths = url.searchParams.get('paths') ?? ''
      const sessionPaths = rawPaths
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
      const preview = await getSessionChangePreview(sessionPaths)
      const pendingTempUploads = await listPendingTempUploads()
      sendJson(res, 200, {
        summary: {
          touchedPaths: preview.paths,
          changedEntries: preview.entries,
          pendingTempUploads,
        },
      })
      return
    }

    if (pathname.startsWith('/api/files/')) {
      const relativePath = pathname.replace('/api/files/', '')

      if (method === 'GET') {
        const content = await readContentFile(relativePath)
        const revision = await getContentRevision(relativePath)
        const schema = buildEditorSchema({ filePath: relativePath, content })
        sendJson(res, 200, {
          file: relativePath,
          content,
          revision,
          schemaId: schema.id,
          usage: schema.usage,
        })
        return
      }

      if (method === 'PUT') {
        assertJsonRequest(req)
        const body = await readJsonBody(req, BODY_LIMIT_BYTES)
        const currentContent = await readContentFile(relativePath)
        const revisionCheck = await assertBaseRevision(relativePath, body.baseRevision)
        if (!revisionCheck.matched) {
          sendJson(res, 409, {
            error: 'This file changed elsewhere. Reload to sync latest content before saving.',
            currentRevision: revisionCheck.currentRevision,
          })
          return
        }

        const payloadContent = extractContentPayload(body)
        const validation = validateContentPayload({
          currentContent,
          nextContent: payloadContent,
        })
        if (!validation.ok) {
          sendJson(res, 422, {
            error: 'Validation failed. Please review highlighted fields and try again.',
            issues: validation.issues,
          })
          return
        }

        const { content: nextContent, finalizedImages } =
          await finalizeTempImagesInContent(payloadContent)
        const deletedImages = extractDeletedImages(body)
        await writeContentFile(relativePath, nextContent)
        await Promise.all(deletedImages.map((imagePath) => deleteImageWithVariants(imagePath)))
        const revision = await getContentRevision(relativePath)
        sendJson(res, 200, {
          ok: true,
          file: relativePath,
          content: nextContent,
          finalizedImages,
          revision,
        })
        return
      }
    }

    if (pathname.startsWith('/api/validate/')) {
      if (method === 'POST') {
        assertJsonRequest(req)
        const relativePath = pathname.replace('/api/validate/', '')
        const body = await readJsonBody(req, BODY_LIMIT_BYTES)
        const nextContent = extractContentPayload(body)
        const currentContent = await readContentFile(relativePath)
        const validation = validateContentPayload({
          currentContent,
          nextContent,
        })
        sendJson(res, 200, {
          ok: validation.ok,
          issues: validation.issues,
        })
        return
      }
    }

    if (method === 'POST' && pathname === '/api/upload-image') {
      assertJsonRequest(req)
      const body = await readJsonBody(req, BODY_LIMIT_BYTES)
      const uploaded = await uploadImage(body)
      sendJson(res, 200, uploaded)
      return
    }

    if (method === 'POST' && pathname === '/api/git/preview') {
      assertJsonRequest(req)
      const body = await readJsonBody(req, BODY_LIMIT_BYTES)
      const preview = await getSessionChangePreview(body.sessionPaths)
      sendJson(res, 200, { preview })
      return
    }

    if (method === 'POST' && pathname === '/api/git/finalize') {
      assertJsonRequest(req)
      const body = await readJsonBody(req, BODY_LIMIT_BYTES)
      const cleanup = await cleanupDanglingTempUploads()
      const sessionPaths = [
        ...(Array.isArray(body.sessionPaths) ? body.sessionPaths : []),
        ...cleanup.removedPublicPaths
          .map((publicPath) => `public${publicPath}`)
          .map((repoPath) => repoPath.replace(/\\/g, '/')),
      ]
      const gitResult = await createReviewBranchAndPush(sessionPaths)
      const prResult = await createPullRequestForFinalize({
        branchName: gitResult.branchName,
        commitMessage: gitResult.commitMessage,
      })
      sendJson(res, 200, {
        result: {
          ...gitResult,
          pullRequest: prResult,
        },
      })
      return
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Not found.' })
      return
    }

    if (pathname.startsWith('/images/')) {
      const servedFromPublic = await serveFileFromBaseDir(res, paths.publicDir, pathname)
      if (!servedFromPublic) sendText(res, 404, 'Not found.')
      return
    }

    const servedFromBackoffice = await serveFileFromBaseDir(res, paths.staticDir, pathname)
    if (!servedFromBackoffice) sendText(res, 404, 'Not found.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.'
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, { error: message })
      return
    }
    console.error('Backoffice request error:', error)
    sendJson(res, 400, { error: message })
  }
}
