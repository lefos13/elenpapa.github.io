/**
 * Why this exists:
 * Standardized HTTP response helpers, error types, and body-parsing utilities
 * for Vercel Serverless Functions and Node.js request lifecycles.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { MIME_TYPES } from './config'

/**
 * Custom HTTP error class carrying an HTTP status code and optional structured details.
 */
export class HttpError extends Error {
  readonly statusCode: number
  readonly details?: unknown

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.details = details
    Object.setPrototypeOf(this, HttpError.prototype)
  }
}

/**
 * Type guard to check whether an unknown error is an instance of HttpError or matches its shape.
 */
export function isHttpError(error: unknown): error is HttpError {
  if (error instanceof HttpError) return true
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as Record<string, unknown>).statusCode === 'number' &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  )
}

/**
 * Ensures the incoming request specifies `application/json` in its Content-Type header.
 * Throws a 415 HttpError if not satisfied.
 */
export function assertJsonRequest(req: IncomingMessage): void {
  const header = String(req.headers['content-type'] ?? '').toLowerCase()
  if (!header.includes('application/json')) {
    throw new HttpError(415, 'Request content type must be application/json.')
  }
}

/**
 * Response type allowing standard Node ServerResponse as well as VercelResponse helper methods.
 */
type CompatibleResponse = ServerResponse & {
  status?: (code: number) => CompatibleResponse
  json?: (data: unknown) => void
  send?: (body: unknown) => void
}

/**
 * Sends a JSON response with strict no-cache headers to prevent stale admin UI reads.
 */
export function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const compatRes = res as CompatibleResponse

  if (typeof compatRes.setHeader === 'function') {
    compatRes.setHeader('Content-Type', MIME_TYPES['.json'] ?? 'application/json; charset=utf-8')
    compatRes.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    compatRes.setHeader('Pragma', 'no-cache')
    compatRes.setHeader('Expires', '0')
  }

  if (typeof compatRes.status === 'function') {
    const statusRes = compatRes.status(statusCode)
    if (typeof statusRes?.json === 'function') {
      statusRes.json(payload)
      return
    }
  }

  res.statusCode = statusCode
  if (typeof res.writeHead === 'function') {
    try {
      res.writeHead(statusCode, {
        'content-type': MIME_TYPES['.json'] ?? 'application/json; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        pragma: 'no-cache',
        expires: '0',
      })
    } catch {}
  }
  res.end(JSON.stringify(payload))
}

/**
 * Sends a plain text response with no-cache headers.
 */
export function sendText(res: ServerResponse, statusCode: number, message: string): void {
  const compatRes = res as CompatibleResponse

  if (typeof compatRes.setHeader === 'function') {
    compatRes.setHeader('Content-Type', MIME_TYPES['.txt'] ?? 'text/plain; charset=utf-8')
    compatRes.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  }

  if (typeof compatRes.status === 'function') {
    const statusRes = compatRes.status(statusCode)
    if (typeof statusRes?.send === 'function') {
      statusRes.send(message)
      return
    }
  }

  res.statusCode = statusCode
  if (typeof res.writeHead === 'function') {
    try {
      res.writeHead(statusCode, {
        'content-type': MIME_TYPES['.txt'] ?? 'text/plain; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      })
    } catch {}
  }
  res.end(message)
}

/**
 * Request type supporting both standard Node stream and pre-parsed Vercel body.
 */
type CompatibleRequest = IncomingMessage & {
  body?: unknown
}

/**
 * Reads and parses the JSON request body.
 * Transparently supports pre-parsed bodies (Vercel Serverless) as well as raw stream reading.
 */
export async function readJsonBody<T = unknown>(
  req: IncomingMessage,
  limitBytes: number = 12 * 1024 * 1024,
): Promise<T> {
  const compatReq = req as CompatibleRequest

  // If already parsed by serverless runtime (e.g. Vercel)
  if (compatReq.body !== undefined && compatReq.body !== null) {
    if (typeof compatReq.body === 'object') {
      return compatReq.body as T
    }
    if (typeof compatReq.body === 'string') {
      if (!compatReq.body.trim()) {
        return {} as T
      }
      try {
        return JSON.parse(compatReq.body) as T
      } catch {
        throw new HttpError(400, 'Request body must be valid JSON.')
      }
    }
  }

  return new Promise<T>((resolve, reject) => {
    let body = ''
    let completed = false

    const fail = (error: Error) => {
      if (completed) return
      completed = true
      reject(error)
    }

    req.on('data', (chunk: Buffer | string) => {
      if (completed) return
      body += chunk
      if (Buffer.byteLength(body) > limitBytes) {
        req.destroy()
        fail(new HttpError(413, 'Payload too large.'))
      }
    })

    req.on('end', () => {
      if (completed) return
      try {
        if (!body.trim()) {
          completed = true
          resolve({} as T)
          return
        }
        completed = true
        resolve(JSON.parse(body) as T)
      } catch {
        fail(new HttpError(400, 'Request body must be valid JSON.'))
      }
    })

    req.on('error', () => fail(new HttpError(400, 'Failed to read request body.')))
  })
}
