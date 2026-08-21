/**
 * Why this exists:
 * Single unified Vercel Serverless Function catch-all router (`/api/*`).
 * Consolidates all authentication, content CRUD, schema metadata, Sharp image processing,
 * and Git review workflow endpoints into a single serverless function to comply with
 * Vercel Hobby plan's 12-function limit (uses 1/12 functions).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import handleAuthLogin from '../server/handlers/auth-login.js'
import handleAuthLogout from '../server/handlers/auth-logout.js'
import handleAuthSession from '../server/handlers/auth-session.js'
import handleFilesDetail from '../server/handlers/files-detail.js'
import handleFilesIndex from '../server/handlers/files-index.js'
import handleGitFinalize from '../server/handlers/git-finalize.js'
import handleGitPreview from '../server/handlers/git-preview.js'
import handleGitStatus from '../server/handlers/git-status.js'
import handleImagesIndex from '../server/handlers/images-index.js'
import handleSchemasDetail from '../server/handlers/schemas-detail.js'
import handleSessionSummary from '../server/handlers/session-summary.js'
import handleUploadImage from '../server/handlers/upload-image.js'
import handleValidateFile from '../server/handlers/validate-file.js'
import { sendJson } from '../server/http.js'

function resolvePathname(req: VercelRequest): string {
  let pathname = ''

  if (req.url) {
    try {
      pathname = new URL(req.url, 'http://localhost').pathname
    } catch {
      pathname = req.url.split('?')[0] || ''
    }
  }

  // Handle Vercel rewrite catch-all query parameter fallback
  if (!pathname || pathname === '/' || pathname === '/api' || pathname.startsWith('/api/[...path]')) {
    const queryPath = req.query?.path
    if (Array.isArray(queryPath)) {
      pathname = `/api/${queryPath.join('/')}`
    } else if (typeof queryPath === 'string' && queryPath.length > 0) {
      pathname = `/api/${queryPath}`
    }
  }

  // Clean trailing slashes except for root
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }

  return pathname
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const pathname = resolvePathname(req)

  // Auth routes
  if (pathname === '/api/auth/login') {
    return handleAuthLogin(req, res)
  }
  if (pathname === '/api/auth/logout') {
    return handleAuthLogout(req, res)
  }
  if (pathname === '/api/auth/session') {
    return handleAuthSession(req, res)
  }

  // Content files listing
  if (pathname === '/api/files') {
    return handleFilesIndex(req, res)
  }

  // Content file detail
  if (pathname.startsWith('/api/files/')) {
    const file = pathname.replace(/^\/api\/files\//, '')
    req.query = { ...req.query, file }
    return handleFilesDetail(req, res)
  }

  // Schema metadata
  if (pathname.startsWith('/api/schemas/')) {
    const id = pathname.replace(/^\/api\/schemas\//, '')
    req.query = { ...req.query, id }
    return handleSchemasDetail(req, res)
  }

  // Content validation
  if (pathname.startsWith('/api/validate/')) {
    const file = pathname.replace(/^\/api\/validate\//, '')
    req.query = { ...req.query, file }
    return handleValidateFile(req, res)
  }

  // Media library
  if (pathname === '/api/images') {
    return handleImagesIndex(req, res)
  }

  // Image upload & Sharp optimization
  if (pathname === '/api/upload-image') {
    return handleUploadImage(req, res)
  }

  // Git status
  if (pathname === '/api/git/status') {
    return handleGitStatus(req, res)
  }

  // Git preview
  if (pathname === '/api/git/preview') {
    return handleGitPreview(req, res)
  }

  // Git finalize
  if (pathname === '/api/git/finalize') {
    return handleGitFinalize(req, res)
  }

  // Session summary
  if (pathname === '/api/session/summary') {
    return handleSessionSummary(req, res)
  }

  // Fallback 404
  sendJson(res, 404, {
    ok: false,
    error: `API route not found: ${req.method} ${pathname}`,
  })
}
