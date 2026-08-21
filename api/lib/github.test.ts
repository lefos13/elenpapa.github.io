import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateGitBlobSha,
  formatBytes,
  isGitHubConfigured,
  getOctokit,
  readContentFileFromGit,
  listContentFilesFromGit,
  listImagesFromGitTree,
  getGitStatusSummary,
  createReviewBranch,
  commitSessionChanges,
  createPullRequestForFinalize,
  getContentFileSha,
  deleteBranch,
} from './github'

describe('github.ts adapter', () => {
  describe('utility functions', () => {
    it('calculateGitBlobSha computes correct Git sha-1', () => {
      const content = 'hello world\n'
      // git hash-object on "hello world\n" produces 3b18e512dba79e4c8300dd08aeb37f8e728b8dad
      const sha = calculateGitBlobSha(content)
      assert.equal(sha, '3b18e512dba79e4c8300dd08aeb37f8e728b8dad')
    })

    it('calculateGitBlobSha handles Buffer input', () => {
      const buf = Buffer.from('hello buffer\n', 'utf-8')
      const sha = calculateGitBlobSha(buf)
      assert.equal(typeof sha, 'string')
      assert.equal(sha.length, 40)
    })

    it('formatBytes formats file sizes appropriately', () => {
      assert.equal(formatBytes(500), '500 B')
      assert.equal(formatBytes(2048), '2.0 KB')
      assert.equal(formatBytes(1024 * 1024 * 3.5), '3.50 MB')
    })

    it('isGitHubConfigured reflects environment state', () => {
      const configured = isGitHubConfigured()
      assert.equal(typeof configured, 'boolean')
    })

    it('getOctokit returns an Octokit instance', () => {
      const client = getOctokit()
      assert.ok(client)
      assert.ok(client.repos)
      assert.ok(client.git)
      assert.ok(client.pulls)
    })

    it('getOctokit creates a custom instance when custom token passed', () => {
      const customClient = getOctokit('ghp_test_token_12345')
      assert.ok(customClient)
      assert.ok(customClient.repos)
    })
  })

  describe('local fallback operations (unconfigured/development mode)', () => {
    it('readContentFileFromGit reads local content files', async () => {
      const result = await readContentFileFromGit({ filePath: 'site.json' })
      assert.ok(result.content)
      assert.ok(result.sha)
      assert.ok(result.rawText)
      assert.equal(typeof result.content, 'object')
    })

    it('readContentFileFromGit normalizes bare filename and full public/content path', async () => {
      const fromBare = await readContentFileFromGit({ filePath: 'home.json' })
      const fromFull = await readContentFileFromGit({ filePath: 'public/content/home.json' })
      assert.deepEqual(fromBare.content, fromFull.content)
    })

    it('readContentFileFromGit throws 404 for missing files', async () => {
      await assert.rejects(
        async () => {
          await readContentFileFromGit({ filePath: 'non-existent-file.json' })
        },
        { statusCode: 404 },
      )
    })

    it('listContentFilesFromGit lists local json files', async () => {
      const files = await listContentFilesFromGit()
      assert.ok(Array.isArray(files))
      assert.ok(files.includes('site.json'))
      assert.ok(files.includes('home.json'))
      assert.ok(files.every((f) => f.endsWith('.json')))
    })

    it('listImagesFromGitTree lists images locally', async () => {
      const images = await listImagesFromGitTree()
      assert.ok(Array.isArray(images))
      if (images.length > 0) {
        const first = images[0]
        assert.ok(first.name)
        assert.ok(first.relativePath)
        assert.ok(first.publicPath.startsWith('/images/'))
        assert.equal(typeof first.bytes, 'number')
        assert.ok(first.sizeLabel)
        assert.ok(first.section)
      }
    })

    it('getGitStatusSummary returns summary object', async () => {
      const summary = await getGitStatusSummary()
      assert.ok(summary)
      assert.equal(typeof summary.branch, 'string')
      assert.equal(typeof summary.clean, 'boolean')
      assert.equal(typeof summary.statusText, 'string')
    })

    it('createReviewBranch returns branch details', async () => {
      const result = await createReviewBranch({
        branchName: 'test-review-branch-123',
      })
      assert.ok(result)
      assert.equal(result.branchName, 'test-review-branch-123')
      assert.ok(result.ref.includes('test-review-branch-123'))
    })

    it('commitSessionChanges throws error if files array is empty', async () => {
      await assert.rejects(
        async () => {
          await commitSessionChanges({
            branch: 'test-branch',
            files: [],
            message: 'empty commit',
          })
        },
        { statusCode: 400 },
      )
    })

    it('getContentFileSha returns sha string', async () => {
      const sha = await getContentFileSha({ filePath: 'site.json' })
      assert.ok(sha)
      assert.equal(typeof sha, 'string')
      assert.equal(sha.length, 40)
    })

    it('createPullRequestForFinalize handles unconfigured environment gracefully', async () => {
      const result = await createPullRequestForFinalize({
        branchName: 'test-review-branch-123',
      })
      assert.ok(result)
      if (!isGitHubConfigured()) {
        assert.equal(result.created, false)
        assert.equal(result.skipped, true)
        assert.ok(result.warning)
      }
    })

    it('deleteBranch handles unconfigured or local gracefully', async () => {
      const result = await deleteBranch({ branchName: 'test-review-branch-123' })
      assert.ok(result)
      assert.equal(typeof result.deleted, 'boolean')
    })
  })
})
