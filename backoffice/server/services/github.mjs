/**
 * Why this exists:
 * Finalize flow can optionally open a GitHub Pull Request automatically after
 * pushing the review branch, so editors can hand over one ready-to-review URL.
 */
import {
  CREATE_PR_ON_FINALIZE,
  GITHUB_BRANCH,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_TOKEN,
} from '../config.mjs'

const GITHUB_API_BASE = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 15_000

function isConfigured(force = false) {
  if (force) {
    return Boolean(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO)
  }
  return Boolean(CREATE_PR_ON_FINALIZE && GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO)
}

export function getGitHubConfig() {
  return {
    configured: Boolean(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO),
    autoCreatePr: CREATE_PR_ON_FINALIZE,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    branch: GITHUB_BRANCH || 'main',
  }
}

export function getCompareUrl(branchName) {
  if (!GITHUB_OWNER || !GITHUB_REPO || !branchName) return ''
  const base = GITHUB_BRANCH || 'main'
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${base}...${encodeURIComponent(branchName)}?expand=1`
}

async function postPullRequest(payload) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${GITHUB_TOKEN}`,
        'content-type': 'application/json',
        'user-agent': 'portfolio-backoffice',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      const errorMessage =
        json?.message ||
        `GitHub PR API responded with status ${response.status}. Check token/repo permissions.`
      throw new Error(errorMessage)
    }

    return {
      created: true,
      url: json.html_url || '',
      number: Number(json.number) || null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Why this exists:
 * PR creation should never block the already-successful git finalize workflow;
 * failures are reported as warnings while branch push remains the source of truth.
 */
export async function createPullRequestForFinalize({
  branchName,
  commitMessage,
  title,
  body,
  force = false,
}) {
  const compareUrl = getCompareUrl(branchName)

  if (!isConfigured(force)) {
    return {
      created: false,
      skipped: true,
      compareUrl,
      warning:
        'PR auto-create is disabled or missing configuration. Set BACKOFFICE_CREATE_PR_ON_FINALIZE, GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.',
    }
  }

  const prTitle = title || `Backoffice update: ${commitMessage || branchName}`
  const prBody =
    body ||
    [
      'Automated Pull Request created by Portfolio Backoffice.',
      '',
      `Branch: \`${branchName}\``,
      `Base: \`${GITHUB_BRANCH || 'main'}\``,
      '',
      'Please review and merge into `main`.',
    ].join('\n')

  try {
    const result = await postPullRequest({
      title: prTitle,
      head: branchName,
      base: GITHUB_BRANCH || 'main',
      body: prBody,
      maintainer_can_modify: true,
    })

    return {
      created: result.created,
      url: result.url,
      number: result.number,
      compareUrl,
    }
  } catch (error) {
    return {
      created: false,
      compareUrl,
      warning:
        error instanceof Error
          ? `Branch pushed successfully, but PR creation failed: ${error.message}`
          : 'Branch pushed successfully, but PR creation failed due to an unexpected error.',
    }
  }
}
