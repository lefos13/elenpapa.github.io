/**
 * Why this exists:
 * GitHub API client and Git Data API adapter for the Vercel Serverless backoffice.
 * Provides atomic multi-file commits, review-branch workflows, and content/image
 * file synchronization backed by Octokit with seamless local filesystem fallbacks
 * when GitHub credentials are omitted during local development.
 */

import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { Octokit } from '@octokit/rest'
import {
  ALLOWED_IMAGE_EXTENSIONS,
  GITHUB_BRANCH,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_TOKEN,
} from './config.js'
import { HttpError } from './http.js'

/**
 * Singleton Octokit client instance when running in configured cloud environments.
 */
let cachedOctokit: Octokit | null = null

/**
 * Determines whether the GitHub API is fully configured with token and repository coordinates.
 */
export function isGitHubConfigured(): boolean {
  return Boolean(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO)
}

/**
 * Returns a configured Octokit client instance.
 * Reuses the singleton instance when using the default token.
 */
export function getOctokit(customToken?: string): Octokit {
  if (customToken) {
    return new Octokit({
      auth: customToken,
      userAgent: 'portfolio-backoffice/1.0.0',
    })
  }

  if (cachedOctokit) {
    return cachedOctokit
  }

  const token = GITHUB_TOKEN || undefined
  cachedOctokit = new Octokit({
    auth: token,
    userAgent: 'portfolio-backoffice/1.0.0',
  })

  return cachedOctokit
}

/**
 * Formats a raw byte count into a human-readable size label (e.g. "124.5 KB").
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Calculates a standard Git blob SHA-1 hash for a string or buffer.
 */
export function calculateGitBlobSha(content: string | Buffer): string {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8')
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex')
}

/**
 * Normalizes a content file path to its repository-relative form starting with `public/content/`.
 */
function normalizeContentPath(filePath: string): string {
  const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')
  if (cleanPath.startsWith('public/content/')) {
    return cleanPath
  }
  if (cleanPath.startsWith('content/')) {
    return `public/${cleanPath}`
  }
  if (!cleanPath.includes('/')) {
    return `public/content/${cleanPath}`
  }
  return cleanPath
}

export interface ReadContentFileParams {
  filePath: string
  branch?: string
  owner?: string
  repo?: string
}

export interface ReadContentFileResult<T = Record<string, unknown> | unknown[]> {
  content: T
  sha: string
  rawText: string
}

/**
 * Reads a JSON content file from GitHub repository ref, or local filesystem if unconfigured.
 */
export async function readContentFileFromGit<T = Record<string, unknown> | unknown[]>({
  filePath,
  branch = GITHUB_BRANCH || 'main',
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO,
}: ReadContentFileParams): Promise<ReadContentFileResult<T>> {
  const repoPath = normalizeContentPath(filePath)

  if (isGitHubConfigured()) {
    const octokit = getOctokit()

    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: repoPath,
        ref: branch,
      })

      const data = response.data

      if (Array.isArray(data)) {
        throw new HttpError(400, `Expected file but found directory at "${repoPath}".`)
      }

      if ('content' in data && typeof data.content === 'string') {
        const rawText =
          data.encoding === 'base64'
            ? Buffer.from(data.content, 'base64').toString('utf-8')
            : data.content

        try {
          const content = JSON.parse(rawText) as T
          return {
            content,
            sha: data.sha,
            rawText,
          }
        } catch {
          throw new HttpError(500, `Failed to parse JSON content from "${repoPath}".`)
        }
      }

      // If file is too large for getContent response body (>1MB), fetch blob directly
      if ('sha' in data && data.sha) {
        const blobResponse = await octokit.git.getBlob({
          owner,
          repo,
          file_sha: data.sha,
        })

        const rawText = Buffer.from(blobResponse.data.content, 'base64').toString('utf-8')
        const content = JSON.parse(rawText) as T
        return {
          content,
          sha: data.sha,
          rawText,
        }
      }

      throw new HttpError(404, `Content file "${repoPath}" could not be retrieved from GitHub.`)
    } catch (error: unknown) {
      if (error instanceof HttpError) throw error

      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as Record<string, unknown>).status)
          : null

      if (status === 404) {
        throw new HttpError(404, `Content file "${repoPath}" not found on branch "${branch}".`)
      }

      const message = error instanceof Error ? error.message : 'Unknown GitHub API error'
      throw new HttpError(status || 500, `GitHub error reading "${repoPath}": ${message}`)
    }
  }

  // Local filesystem fallback
  const localAbsolutePath = path.join(process.cwd(), repoPath)
  try {
    const rawText = await readFile(localAbsolutePath, 'utf-8')
    const content = JSON.parse(rawText) as T
    const sha = calculateGitBlobSha(rawText)
    return {
      content,
      sha,
      rawText,
    }
  } catch (error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as Record<string, unknown>).code)
        : ''

    if (code === 'ENOENT') {
      throw new HttpError(404, `Content file "${repoPath}" not found on local filesystem.`)
    }

    const message = error instanceof Error ? error.message : 'File read error'
    throw new HttpError(500, `Error reading local file "${repoPath}": ${message}`)
  }
}

export interface ListContentFilesParams {
  branch?: string
  owner?: string
  repo?: string
}

/**
 * Lists all `.json` content filenames located under `public/content/`.
 */
export async function listContentFilesFromGit({
  branch = GITHUB_BRANCH || 'main',
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO,
}: ListContentFilesParams = {}): Promise<string[]> {
  if (isGitHubConfigured()) {
    const octokit = getOctokit()

    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: 'public/content',
        ref: branch,
      })

      if (Array.isArray(response.data)) {
        return response.data
          .filter((item) => item.type === 'file' && item.name.endsWith('.json'))
          .map((item) => item.name)
          .sort((left, right) => left.localeCompare(right))
      }
    } catch {
      // Fall back to git tree search if directory contents request failed
    }

    try {
      const treeResponse = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: branch,
        recursive: '1',
      })

      return (treeResponse.data.tree || [])
        .filter(
          (item) =>
            item.type === 'blob' &&
            item.path &&
            item.path.startsWith('public/content/') &&
            item.path.endsWith('.json'),
        )
        .map((item) => path.basename(item.path!))
        .sort((left, right) => left.localeCompare(right))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpError(
        500,
        `Failed to list content files from GitHub branch "${branch}": ${message}`,
      )
    }
  }

  // Local filesystem fallback
  const contentDir = path.join(process.cwd(), 'public/content')
  try {
    const entries = await readdir(contentDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new HttpError(500, `Failed to list local content files: ${message}`)
  }
}

export interface GitImageItem {
  name: string
  relativePath: string
  publicPath: string
  bytes: number
  sizeLabel: string
  section: string
  sha: string
}

export interface ListImagesParams {
  branch?: string
  owner?: string
  repo?: string
}

/**
 * Lists all image files under `public/images/` using the Git Tree API or local filesystem.
 */
export async function listImagesFromGitTree({
  branch = GITHUB_BRANCH || 'main',
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO,
}: ListImagesParams = {}): Promise<GitImageItem[]> {
  if (isGitHubConfigured()) {
    const octokit = getOctokit()

    try {
      const treeResponse = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: branch,
        recursive: '1',
      })

      const items: GitImageItem[] = []

      for (const item of treeResponse.data.tree || []) {
        if (item.type !== 'blob' || !item.path || !item.path.startsWith('public/images/')) {
          continue
        }

        const ext = path.extname(item.path).toLowerCase()
        if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
          continue
        }

        const relativePath = item.path.replace(/^public\/images\//, '')
        const section = relativePath.includes('/') ? relativePath.split('/')[0] : 'root'
        const bytes = typeof item.size === 'number' ? item.size : 0

        items.push({
          name: path.basename(item.path),
          relativePath,
          publicPath: `/images/${relativePath}`,
          bytes,
          sizeLabel: formatBytes(bytes),
          section,
          sha: item.sha || '',
        })
      }

      return items.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpError(
        500,
        `Failed to list images from Git tree on branch "${branch}": ${message}`,
      )
    }
  }

  // Local filesystem fallback
  const imagesDir = path.join(process.cwd(), 'public/images')

  async function scanDir(currentDir: string): Promise<GitImageItem[]> {
    const results: GitImageItem[] = []
    let entries
    try {
      entries = await readdir(currentDir, { withFileTypes: true })
    } catch {
      return []
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        results.push(...(await scanDir(fullPath)))
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) continue

        const relativeToImages = path.relative(imagesDir, fullPath).replace(/\\/g, '/')
        const section = relativeToImages.includes('/') ? relativeToImages.split('/')[0] : 'root'
        const fileStat = await stat(fullPath).catch(() => ({ size: 0 }))
        const bytes = fileStat.size

        results.push({
          name: entry.name,
          relativePath: relativeToImages,
          publicPath: `/images/${relativeToImages}`,
          bytes,
          sizeLabel: formatBytes(bytes),
          section,
          sha: '',
        })
      }
    }

    return results
  }

  const items = await scanDir(imagesDir)
  return items.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

export interface GitStatusSummary {
  branch: string
  ahead: number
  behind: number
  clean: boolean
  statusText: string
  configured: boolean
  latestCommit?: {
    sha: string
    message: string
    date: string
    author: string
  }
  openPullRequestsCount?: number
}

/**
 * Returns a summary of repository sync state and recent commit metadata.
 */
export async function getGitStatusSummary({
  branch = GITHUB_BRANCH || 'main',
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO,
}: { branch?: string; owner?: string; repo?: string } = {}): Promise<GitStatusSummary> {
  if (isGitHubConfigured()) {
    const octokit = getOctokit()

    try {
      const [commitResponse, pullsResponse] = await Promise.all([
        octokit.repos.getCommit({
          owner,
          repo,
          ref: branch,
        }),
        octokit.pulls
          .list({
            owner,
            repo,
            state: 'open',
            per_page: 10,
          })
          .catch(() => ({ data: [] })),
      ])

      const commit = commitResponse.data
      const author = commit.commit.author?.name || commit.commit.committer?.name || 'GitHub'
      const date =
        commit.commit.committer?.date || commit.commit.author?.date || new Date().toISOString()
      const message = commit.commit.message.split('\n')[0] || 'Update content'

      return {
        branch,
        ahead: 0,
        behind: 0,
        clean: true,
        statusText: 'Synced with GitHub repository',
        configured: true,
        latestCommit: {
          sha: commit.sha.slice(0, 7),
          message,
          date,
          author,
        },
        openPullRequestsCount: pullsResponse.data?.length ?? 0,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        branch,
        ahead: 0,
        behind: 0,
        clean: true,
        statusText: `GitHub API query error: ${message}`,
        configured: true,
      }
    }
  }

  return {
    branch: 'main',
    ahead: 0,
    behind: 0,
    clean: true,
    statusText: 'Local development mode (Git/GitHub API disabled)',
    configured: false,
  }
}

export interface CreateReviewBranchParams {
  branchName: string
  baseBranch?: string
  owner?: string
  repo?: string
}

export interface CreateReviewBranchResult {
  branchName: string
  ref: string
  sha: string
  local?: boolean
}

/**
 * Creates a new Git reference (branch) for a review session, branched from the base branch.
 */
export async function createReviewBranch({
  branchName,
  baseBranch = GITHUB_BRANCH || 'main',
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO,
}: CreateReviewBranchParams): Promise<CreateReviewBranchResult> {
  if (isGitHubConfigured()) {
    const octokit = getOctokit()

    try {
      // 1. Get base branch commit SHA
      const { data: refData } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      })
      const baseSha = refData.object.sha

      // 2. Create new branch ref
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      })

      return {
        branchName,
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpError(
        500,
        `Failed to create review branch "${branchName}" from "${baseBranch}": ${message}`,
      )
    }
  }

  return {
    branchName,
    ref: `refs/heads/${branchName}`,
    sha: 'local-development-sha',
    local: true,
  }
}

export interface CommitFileEntry {
  path: string
  content: string | Buffer
}

export interface CommitSessionChangesParams {
  branch: string
  files: CommitFileEntry[]
  message: string
  owner?: string
  repo?: string
}

export interface CommitSessionChangesResult {
  commitSha: string
  treeSha: string
}

/**
 * Performs an atomic multi-file commit on the specified branch using the GitHub Git Data API.
 * Blobs, Git Tree, Git Commit, and Ref update are orchestrated in sequence.
 */
export async function commitSessionChanges({
  branch,
  files,
  message,
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO,
}: CommitSessionChangesParams): Promise<CommitSessionChangesResult> {
  if (files.length === 0) {
    throw new HttpError(400, 'Cannot commit an empty list of files.')
  }

  if (isGitHubConfigured()) {
    const octokit = getOctokit()

    try {
      // 1. Get latest commit SHA on the target branch
      const { data: refData } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      })
      const baseCommitSha = refData.object.sha

      // 2. Get base tree SHA from base commit
      const { data: commitData } = await octokit.git.getCommit({
        owner,
        repo,
        commit_sha: baseCommitSha,
      })
      const baseTreeSha = commitData.tree.sha

      // 3. Create Blobs in parallel for all modified/added files
      const treeItems = await Promise.all(
        files.map(async (file) => {
          const isBuffer = Buffer.isBuffer(file.content)
          const cleanPath = file.path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')
          const contentStr = isBuffer
            ? file.content.toString('base64')
            : typeof file.content === 'string'
              ? file.content
              : String(file.content)

          const { data: blob } = await octokit.git.createBlob({
            owner,
            repo,
            content: contentStr,
            encoding: isBuffer ? 'base64' : 'utf-8',
          })
          return {
            path: cleanPath,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: blob.sha,
          }
        }),
      )

      // 4. Create new Git tree with base_tree to preserve unmodified files
      const { data: newTree } = await octokit.git.createTree({
        owner,
        repo,
        base_tree: baseTreeSha,
        tree: treeItems,
      })

      // 5. Create new Git commit pointing to the new tree and parent commit
      const { data: newCommit } = await octokit.git.createCommit({
        owner,
        repo,
        message,
        tree: newTree.sha,
        parents: [baseCommitSha],
      })

      // 6. Atomically update the branch reference to the new commit
      await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
        force: false,
      })

      return {
        commitSha: newCommit.sha,
        treeSha: newTree.sha,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new HttpError(500, `Failed to commit session changes to branch "${branch}": ${message}`)
    }
  }

  // Local filesystem fallback: write modified files to disk
  for (const file of files) {
    const cleanPath = file.path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')
    const fullPath = path.join(process.cwd(), cleanPath)
    await mkdir(path.dirname(fullPath), { recursive: true })
    if (Buffer.isBuffer(file.content)) {
      await writeFile(fullPath, file.content)
    } else {
      await writeFile(fullPath, file.content, 'utf-8')
    }
  }

  const simulatedCommitSha = `local-${Date.now()}`
  return {
    commitSha: simulatedCommitSha,
    treeSha: `tree-${simulatedCommitSha}`,
  }
}

export interface CreatePullRequestParams {
  branchName: string
  baseBranch?: string
  title?: string
  body?: string
  commitMessage?: string
  owner?: string
  repo?: string
}

export interface CreatePullRequestResult {
  created: boolean
  url?: string
  number?: number | null
  warning?: string
  skipped?: boolean
}

/**
 * Opens a GitHub Pull Request for the review branch when configured.
 * Does not throw on API failures; returns a structured result with warning message.
 */
export async function createPullRequestForFinalize({
  branchName,
  baseBranch = GITHUB_BRANCH || 'main',
  title,
  body,
  commitMessage,
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO,
}: CreatePullRequestParams): Promise<CreatePullRequestResult> {
  if (!isGitHubConfigured()) {
    return {
      created: false,
      skipped: true,
      warning: 'PR creation skipped: GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO is not configured.',
    }
  }

  const prTitle = title || `Backoffice update: ${commitMessage || branchName}`
  const prBody =
    body ||
    [
      'Automated Pull Request created by Portfolio Backoffice.',
      '',
      `Review Branch: \`${branchName}\``,
      `Target Branch: \`${baseBranch}\``,
      '',
      'Please review the content changes and merge when ready.',
    ].join('\n')

  const octokit = getOctokit()

  try {
    const response = await octokit.pulls.create({
      owner,
      repo,
      head: branchName,
      base: baseBranch,
      title: prTitle,
      body: prBody,
      maintainer_can_modify: true,
    })

    return {
      created: true,
      url: response.data.html_url,
      number: response.data.number,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      created: false,
      warning: `Review branch pushed successfully, but Pull Request creation failed: ${message}`,
    }
  }
}

/**
 * Retrieves the Git SHA of a specific content file for optimistic concurrency checking.
 */
export async function getContentFileSha({
  filePath,
  branch = GITHUB_BRANCH || 'main',
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO,
}: ReadContentFileParams): Promise<string> {
  const result = await readContentFileFromGit({ filePath, branch, owner, repo })
  return result.sha
}

/**
 * Deletes a review branch reference from GitHub.
 */
export async function deleteBranch({
  branchName,
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO,
}: {
  branchName: string
  owner?: string
  repo?: string
}): Promise<{ deleted: boolean; warning?: string }> {
  if (!isGitHubConfigured()) {
    return { deleted: true }
  }

  const octokit = getOctokit()
  try {
    await octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    })
    return { deleted: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      deleted: false,
      warning: `Failed to delete branch "${branchName}": ${message}`,
    }
  }
}
