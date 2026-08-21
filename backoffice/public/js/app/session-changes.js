/**
 * Vercel functions cannot retain edited files between requests, so saved JSON and
 * processed image bytes remain in the authenticated browser session until finalize.
 */

import { cloneValue, collectImagePaths, toRepoPathFromPublicImagePath } from '../utils.js'

export function createSessionChanges() {
  return {
    contentByFile: new Map(),
    uploadsByPublicPath: new Map(),
    deletedAssetPaths: new Set(),
  }
}

export function registerPendingUpload(session, upload) {
  if (!upload?.imagePath || !Array.isArray(upload.variants)) return
  session.uploadsByPublicPath.set(upload.imagePath, {
    imagePath: upload.imagePath,
    variants: upload.variants.map((variant) => ({ ...variant })),
  })
}

export function stageContentChange(
  session,
  { filePath, content, baseRevision, deletedImages = [] },
) {
  const path = `public/content/${filePath}`
  session.contentByFile.set(filePath, {
    path,
    content: cloneValue(content),
    baseRevision,
  })

  /**
   * Pending uploads never existed in GitHub and therefore need no delete entry.
   * Existing assets remain marked until a later save references them again.
   */
  deletedImages.forEach((publicPath) => {
    if (session.uploadsByPublicPath.has(publicPath)) return
    const repoPath = toRepoPathFromPublicImagePath(publicPath)
    if (repoPath) session.deletedAssetPaths.add(repoPath)
  })

  collectImagePaths(content).forEach((publicPath) => {
    const repoPath = toRepoPathFromPublicImagePath(publicPath)
    if (repoPath) session.deletedAssetPaths.delete(repoPath)
  })
}

export function resolveSessionContent(session, filePath, remotePayload) {
  const staged = session.contentByFile.get(filePath)
  if (!staged || staged.baseRevision !== remotePayload.revision) return remotePayload

  return {
    ...remotePayload,
    content: cloneValue(staged.content),
    revision: staged.baseRevision,
  }
}

export function buildSessionFinalizePayload(session, sessionPaths) {
  const files = Array.from(session.contentByFile.values()).map((file) => ({
    path: file.path,
    content: cloneValue(file.content),
    baseRevision: file.baseRevision,
  }))
  const referencedImages = new Set()
  files.forEach((file) => collectImagePaths(file.content, []).forEach((path) => referencedImages.add(path)))

  const assets = []
  session.uploadsByPublicPath.forEach((upload, publicPath) => {
    if (!referencedImages.has(publicPath)) return
    upload.variants.forEach((variant) => {
      assets.push({
        path: variant.path,
        bufferBase64: variant.bufferBase64,
      })
    })
  })

  return {
    sessionPaths: Array.from(sessionPaths),
    files,
    assets,
    deletedPaths: Array.from(session.deletedAssetPaths),
  }
}

export function clearSessionChanges(session) {
  session.contentByFile.clear()
  session.uploadsByPublicPath.clear()
  session.deletedAssetPaths.clear()
}
