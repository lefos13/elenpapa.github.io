/**
 * Public types for the browser-held serverless staging contract used by tests
 * and by future typed consumers of the backoffice JavaScript modules.
 */

export interface UploadedVariant {
  path: string
  publicPath: string
  bufferBase64: string
  width?: number
  height?: number
}

export interface PendingUpload {
  imagePath: string
  variants: UploadedVariant[]
}

export interface StagedContent {
  path: string
  content: unknown
  baseRevision: string
}

export interface SessionChanges {
  contentByFile: Map<string, StagedContent>
  uploadsByPublicPath: Map<string, PendingUpload>
  deletedAssetPaths: Set<string>
}

export interface RemoteContentPayload {
  content: unknown
  revision: string
  [key: string]: unknown
}

export function createSessionChanges(): SessionChanges
export function registerPendingUpload(session: SessionChanges, upload: PendingUpload): void
export function stageContentChange(
  session: SessionChanges,
  change: {
    filePath: string
    content: unknown
    baseRevision: string
    deletedImages?: string[]
  },
): void
export function resolveSessionContent(
  session: SessionChanges,
  filePath: string,
  remotePayload: RemoteContentPayload,
): RemoteContentPayload
export function buildSessionFinalizePayload(
  session: SessionChanges,
  sessionPaths: Iterable<string>,
): {
  sessionPaths: string[]
  files: StagedContent[]
  assets: Array<{ path: string; bufferBase64: string }>
  deletedPaths: string[]
}
export function clearSessionChanges(session: SessionChanges): void
