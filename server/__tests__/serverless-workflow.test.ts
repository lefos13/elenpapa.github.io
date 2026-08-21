import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildFinalizeCommitFiles,
  getContentSaveStrategy,
} from '../serverless-workflow.js'

describe('serverless backoffice workflow', () => {
  describe('getContentSaveStrategy', () => {
    it('stages content in the browser session when GitHub backs a Vercel deployment', () => {
      assert.equal(
        getContentSaveStrategy({ isVercel: true, githubConfigured: true }),
        'browser-session',
      )
    })

    it('rejects production saves when no durable GitHub backend is configured', () => {
      assert.equal(
        getContentSaveStrategy({ isVercel: true, githubConfigured: false }),
        'unavailable',
      )
    })

    it('keeps local filesystem persistence for local development', () => {
      assert.equal(
        getContentSaveStrategy({ isVercel: false, githubConfigured: false }),
        'local-filesystem',
      )
    })

    it('uses browser staging whenever reads are GitHub-backed, including local API emulation', () => {
      assert.equal(
        getContentSaveStrategy({ isVercel: false, githubConfigured: true }),
        'browser-session',
      )
    })
  })

  describe('buildFinalizeCommitFiles', () => {
    it('combines JSON, uploaded assets, and deletions into one atomic commit payload', () => {
      const files = buildFinalizeCommitFiles({
        files: [
          {
            path: 'public/content/site.json',
            content: { title: 'Updated online' },
            baseRevision: 'base-sha',
          },
        ],
        assets: [
          {
            path: 'public/images/root/hero-new.webp',
            bufferBase64: Buffer.from('image-bytes').toString('base64'),
          },
        ],
        deletedPaths: ['public/images/books/hero-old.webp'],
      })

      assert.deepEqual(files, [
        {
          path: 'public/content/site.json',
          content: '{\n  "title": "Updated online"\n}\n',
        },
        {
          path: 'public/images/root/hero-new.webp',
          content: Buffer.from('image-bytes'),
        },
        {
          path: 'public/images/books/hero-old.webp',
          content: null,
        },
        {
          path: 'public/images/books/hero-old-400w.webp',
          content: null,
        },
        {
          path: 'public/images/books/hero-old-800w.webp',
          content: null,
        },
      ])
    })

    it('rejects finalize paths outside managed content and image directories', () => {
      assert.throws(
        () =>
          buildFinalizeCommitFiles({
            files: [{ path: 'package.json', content: {} }],
          }),
        { statusCode: 400 },
      )
    })
  })
})
