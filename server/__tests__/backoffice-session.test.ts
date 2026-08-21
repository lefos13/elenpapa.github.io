import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSessionFinalizePayload,
  createSessionChanges,
  registerPendingUpload,
  resolveSessionContent,
  stageContentChange,
} from '../../backoffice/public/js/app/session-changes.js'

describe('browser backoffice session changes', () => {
  it('uses staged content after a serverless save while its GitHub base revision is current', () => {
    const session = createSessionChanges()
    stageContentChange(session, {
      filePath: 'site.json',
      content: { title: 'Browser-staged' },
      baseRevision: 'sha-1',
    })

    assert.deepEqual(
      resolveSessionContent(session, 'site.json', {
        content: { title: 'GitHub main' },
        revision: 'sha-1',
      }),
      { content: { title: 'Browser-staged' }, revision: 'sha-1' },
    )
  })

  it('builds finalization data only from saved content and its referenced uploads', () => {
    const session = createSessionChanges()
    registerPendingUpload(session, {
      imagePath: '/images/root/used.webp',
      variants: [
        {
          path: 'public/images/root/used.webp',
          publicPath: '/images/root/used.webp',
          bufferBase64: Buffer.from('used').toString('base64'),
        },
      ],
    })
    registerPendingUpload(session, {
      imagePath: '/images/root/unsaved.webp',
      variants: [
        {
          path: 'public/images/root/unsaved.webp',
          publicPath: '/images/root/unsaved.webp',
          bufferBase64: Buffer.from('unsaved').toString('base64'),
        },
      ],
    })
    stageContentChange(session, {
      filePath: 'site.json',
      content: { hero: { image: '/images/root/used.webp' } },
      baseRevision: 'sha-1',
      deletedImages: ['/images/root/old.webp'],
    })

    assert.deepEqual(buildSessionFinalizePayload(session, ['public/content/site.json']), {
      sessionPaths: ['public/content/site.json'],
      files: [
        {
          path: 'public/content/site.json',
          content: { hero: { image: '/images/root/used.webp' } },
          baseRevision: 'sha-1',
        },
      ],
      assets: [
        {
          path: 'public/images/root/used.webp',
          bufferBase64: Buffer.from('used').toString('base64'),
        },
      ],
      deletedPaths: ['public/images/root/old.webp'],
    })
  })
})
