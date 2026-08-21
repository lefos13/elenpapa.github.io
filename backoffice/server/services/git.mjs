/**
 * Why this exists:
 * Git synchronization and review-branch automation are centralized here so the
 * backoffice can enforce a consistent content-review workflow at scale.
 */
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { paths } from '../config.mjs'

const execFileAsync = promisify(execFile)
const MAIN_BRANCH = 'main'
const GIT_COMMAND_TIMEOUT_MS = 15_000
const MANAGED_PATH_PREFIXES = ['public/']
let gitOperationQueue = Promise.resolve()

function withGitLock(operation) {
  const queued = gitOperationQueue.then(operation, operation)
  gitOperationQueue = queued.catch(() => {})
  return queued
}

async function runGit(args, { allowFailure = false } = {}) {
  const effectiveArgs = ['-c', 'core.quotepath=false', ...args]
  try {
    const { stdout, stderr } = await execFileAsync('git', effectiveArgs, {
      cwd: paths.projectRoot,
      maxBuffer: 1024 * 1024 * 4,
      timeout: GIT_COMMAND_TIMEOUT_MS,
    })
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 }
  } catch (error) {
    const stdout = String(error.stdout ?? '').trim()
    const stderr = String(error.stderr ?? '').trim()
    const code = typeof error.code === 'number' ? error.code : 1
    if (allowFailure) {
      return { stdout, stderr, code }
    }
    throw new Error(stderr || stdout || `Git command failed: git ${effectiveArgs.join(' ')}`)
  }
}

/**
 * Why this exists:
 * `git status --porcelain` can return quoted paths (spaces/unicode), and for
 * some repos even octal-escaped UTF-8 bytes. We decode that format once so all
 * later git commands receive valid, real repository paths.
 */
function decodePorcelainQuotedPath(pathValue) {
  const value = String(pathValue ?? '').trim()
  if (!(value.startsWith('"') && value.endsWith('"') && value.length >= 2)) {
    return value
  }

  const inner = value.slice(1, -1)
  const bytes = []
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index]
    if (char !== '\\') {
      bytes.push(...Buffer.from(char, 'utf8'))
      continue
    }

    const next = inner[index + 1]
    if (!next) {
      bytes.push('\\'.charCodeAt(0))
      continue
    }

    if (/[0-7]/.test(next)) {
      let octal = next
      let consumed = 1
      for (let offset = 2; offset <= 3; offset += 1) {
        const candidate = inner[index + offset]
        if (!candidate || !/[0-7]/.test(candidate)) break
        octal += candidate
        consumed += 1
      }
      bytes.push(Number.parseInt(octal, 8))
      index += consumed
      continue
    }

    const escapeMap = {
      '"': '"',
      '\\': '\\',
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      v: '\v',
    }
    const decoded = escapeMap[next] ?? next
    bytes.push(...Buffer.from(decoded, 'utf8'))
    index += 1
  }

  return Buffer.from(bytes).toString('utf8')
}

function parsePorcelainLine(rawLine) {
  const normalizedLine = String(rawLine ?? '').trimEnd()
  let code = '??'
  let rawPath = ''

  /**
   * Why this parsing exists:
   * Git porcelain output can vary between one or two status columns depending
   * on repository state/config, so path extraction must be resilient.
   */
  if (normalizedLine.length >= 3 && normalizedLine[2] === ' ') {
    code = normalizedLine.slice(0, 2)
    rawPath = normalizedLine.slice(3).trim()
  } else {
    const fallbackMatch = normalizedLine.match(/^(\S+)\s+(.*)$/)
    if (fallbackMatch) {
      code = fallbackMatch[1].padEnd(2, ' ').slice(0, 2)
      rawPath = fallbackMatch[2].trim()
    } else {
      code = normalizedLine.slice(0, 2).padEnd(2, ' ')
      rawPath = normalizedLine.slice(2).trim()
    }
  }

  const normalizedPath = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) : rawPath
  return {
    code,
    path: decodePorcelainQuotedPath(normalizedPath).replace(/\\/g, '/'),
    raw: normalizedLine,
  }
}

async function getCurrentBranch() {
  const result = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'])
  return result.stdout
}

async function getPorcelainStatus(pathspec = []) {
  const args = ['status', '--porcelain', '--untracked-files=all']
  if (pathspec.length) args.push('--', ...pathspec)
  const result = await runGit(args)
  if (!result.stdout) return []
  return result.stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parsePorcelainLine)
}

async function getMainAheadBehindCounts() {
  const result = await runGit(
    ['rev-list', '--left-right', '--count', `${MAIN_BRANCH}...origin/${MAIN_BRANCH}`],
    { allowFailure: true },
  )
  if (result.code !== 0 || !result.stdout) {
    return { ahead: 0, behind: 0 }
  }
  const [aheadRaw = '0', behindRaw = '0'] = result.stdout.split(/\s+/)
  return {
    ahead: Number.parseInt(aheadRaw, 10) || 0,
    behind: Number.parseInt(behindRaw, 10) || 0,
  }
}

function normalizeSessionPaths(sessionPaths) {
  const unique = new Set()
  ;(Array.isArray(sessionPaths) ? sessionPaths : []).forEach((entry) => {
    if (typeof entry !== 'string') return
    const trimmed = entry.trim().replace(/\\/g, '/').replace(/^\.\//, '')
    if (!trimmed) return

    const normalized = path.posix.normalize(trimmed)
    if (!normalized || normalized === '.') return
    if (normalized.startsWith('/') || normalized.startsWith('../') || normalized.includes('/../')) {
      return
    }
    if (!isManagedContentPath(normalized)) return
    unique.add(normalized)
  })
  return Array.from(unique)
}

function isManagedContentPath(repoPath) {
  return MANAGED_PATH_PREFIXES.some((prefix) => repoPath.startsWith(prefix))
}

function buildAutoBranchName(date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('')
  const randomSuffix = Math.random().toString(36).slice(2, 6)
  return `codex/ui-backoffice-${stamp}-${randomSuffix}`
}

function buildAutoCommitMessage(date = new Date()) {
  const dateStamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  return `ui-backoffice-${dateStamp}`
}

async function syncMainWithOriginUnsafe() {
  const fetchResult = await runGit(['fetch', 'origin', MAIN_BRANCH], { allowFailure: true })
  if (fetchResult.code !== 0) {
    return {
      action: 'error',
      details: fetchResult.stderr || fetchResult.stdout || 'Unable to fetch from origin/main.',
    }
  }

  const currentBranch = await getCurrentBranch()
  const workingTreeStatus = await getPorcelainStatus()
  const { ahead, behind } = await getMainAheadBehindCounts()

  const sync = {
    action: 'up-to-date',
    details: '',
  }

  if (behind > 0) {
    const worktreeClean = workingTreeStatus.length === 0
    if (currentBranch === MAIN_BRANCH && worktreeClean && ahead === 0) {
      await runGit(['pull', '--ff-only', 'origin', MAIN_BRANCH])
      sync.action = 'pulled'
      sync.details = `Pulled ${behind} commit(s) from origin/${MAIN_BRANCH}.`
    } else {
      sync.action = 'blocked'
      sync.details =
        currentBranch !== MAIN_BRANCH
          ? `Cannot auto-pull because current branch is "${currentBranch}" (requires "${MAIN_BRANCH}").`
          : 'Cannot auto-pull because working tree is not clean or local main has diverged.'
    }
  }

  return sync
}

export async function syncMainWithOrigin() {
  return withGitLock(() => syncMainWithOriginUnsafe())
}

async function getGitStatusSummaryUnsafe() {
  const sync = await syncMainWithOriginUnsafe()
  const [currentBranch, statusEntries, mainCounts] = await Promise.all([
    getCurrentBranch(),
    getPorcelainStatus(),
    getMainAheadBehindCounts(),
  ])

  return {
    currentBranch,
    mainAhead: mainCounts.ahead,
    mainBehind: mainCounts.behind,
    worktreeDirty: statusEntries.length > 0,
    changeCount: statusEntries.length,
    changes: statusEntries,
    sync,
  }
}

export async function getGitStatusSummary() {
  return withGitLock(() => getGitStatusSummaryUnsafe())
}

async function getSessionChangePreviewUnsafe(sessionPathsInput) {
  const sessionPaths = normalizeSessionPaths(sessionPathsInput)
  if (!sessionPaths.length) {
    return { paths: [], entries: [], summary: 'No valid session paths were provided.' }
  }

  const entries = await getPorcelainStatus(sessionPaths)
  const diffStat = await runGit(['diff', '--stat', '--', ...sessionPaths], { allowFailure: true })
  const summary = diffStat.stdout || 'No unstaged diff output.'

  return {
    paths: sessionPaths,
    entries,
    summary,
  }
}

export async function getSessionChangePreview(sessionPathsInput) {
  return withGitLock(() => getSessionChangePreviewUnsafe(sessionPathsInput))
}

async function createReviewBranchAndPushUnsafe(sessionPathsInput) {
  const sessionPaths = normalizeSessionPaths(sessionPathsInput)
  if (!sessionPaths.length) {
    throw new Error('Cannot create review branch without valid managed session changes.')
  }

  const sync = await syncMainWithOriginUnsafe()
  const mainCountsAfterSync = await getMainAheadBehindCounts()
  if (sync.action === 'error') {
    throw new Error(`Cannot continue review flow: ${sync.details}`)
  }
  if (mainCountsAfterSync.behind > 0) {
    throw new Error(
      `Cannot continue review flow because local "${MAIN_BRANCH}" is behind origin/${MAIN_BRANCH}. Refresh and sync first.`,
    )
  }

  const currentBranch = await getCurrentBranch()
  if (currentBranch !== MAIN_BRANCH) {
    throw new Error(
      `Review branch flow must start from "${MAIN_BRANCH}". Current branch: "${currentBranch}".`,
    )
  }

  const allChanges = await getPorcelainStatus()
  const sessionSet = new Set(sessionPaths)
  const managedChanges = allChanges.filter((entry) => isManagedContentPath(entry.path))
  const unrelatedChanges = managedChanges.filter((entry) => !sessionSet.has(entry.path))

  if (unrelatedChanges.length > 0) {
    const sample = unrelatedChanges.slice(0, 8).map((entry) => entry.path)
    throw new Error(
      `Unrelated git changes detected outside session scope: ${sample.join(', ')}${unrelatedChanges.length > 8 ? ' ...' : ''}`,
    )
  }

  const sessionPreview = await getSessionChangePreviewUnsafe(sessionPaths)
  if (!sessionPreview.entries.length) {
    throw new Error('No git-tracked changes found for the current backoffice session.')
  }
  /**
   * Why this exists:
   * Session path scope can include cleanup candidates that no longer exist
   * (for example discarded temp uploads). We stage only concrete changed paths
   * from git status to avoid pathspec failures during `git add`.
   */
  const stagePaths = Array.from(
    new Set(
      sessionPreview.entries
        .map((entry) => entry?.path)
        .filter((entryPath) => typeof entryPath === 'string' && entryPath.trim()),
    ),
  )
  if (!stagePaths.length) {
    throw new Error('No stageable changes found for the current backoffice session.')
  }

  const now = new Date()
  const branchName = buildAutoBranchName(now)
  const commitMessage = buildAutoCommitMessage(now)
  let createdBranch = false

  try {
    await runGit(['checkout', '-b', branchName])
    createdBranch = true
    await runGit(['add', '-A', '--', ...stagePaths])

    const stagedCheck = await runGit(['diff', '--cached', '--quiet', '--', ...stagePaths], {
      allowFailure: true,
    })
    if (stagedCheck.code === 0) {
      throw new Error('No staged changes were found for commit.')
    }

    await runGit(['commit', '-m', commitMessage])
    await runGit(['push', '-u', 'origin', branchName])

    const commitHashResult = await runGit(['rev-parse', '--short', 'HEAD'])
    return {
      branchName,
      commitMessage,
      commitHash: commitHashResult.stdout,
    }
  } finally {
    if (createdBranch) {
      await runGit(['checkout', MAIN_BRANCH], { allowFailure: true })
    }
  }
}

export async function createReviewBranchAndPush(sessionPathsInput) {
  return withGitLock(() => createReviewBranchAndPushUnsafe(sessionPathsInput))
}
