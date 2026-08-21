/**
 * Why this exists:
 * Finalize flow can optionally open a GitHub Pull Request automatically after
 * pushing the review branch, so editors can hand over one ready-to-review URL.
 */
import { CREATE_PR_ON_FINALIZE, GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } from '../config.mjs'

const GITHUB_API_BASE = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 15_000

function isConfigured() {
  return Boolean(CREATE_PR_ON_FINALIZE && GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO)
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
export async function createPullRequestForFinalize({ branchName, commitMessage }) {
  if (!isConfigured()) {
    return {
      created: false,
      skipped: true,
      warning:
        'PR auto-create is disabled or missing configuration. Set BACKOFFICE_CREATE_PR_ON_FINALIZE, GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.',
    }
  }

  const title = `Backoffice update: ${commitMessage || branchName}`
  const body = [
    'Automated Pull Request created by Portfolio Backoffice.',
    '',
    `Branch: \`${branchName}\``,
    '',
    'Please review and merge into `main`.',
  ].join('\n')

  try {
    const result = await postPullRequest({
      title,
      head: branchName,
      base: 'main',
      body,
      maintainer_can_modify: true,
    })

    return {
      created: result.created,
      url: result.url,
      number: result.number,
    }
  } catch (error) {
    return {
      created: false,
      warning:
        error instanceof Error
          ? `Branch pushed successfully, but PR creation failed: ${error.message}`
          : 'Branch pushed successfully, but PR creation failed due to an unexpected error.',
    }
  }
}
