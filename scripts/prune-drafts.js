import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Why this exists:
 * `devOnly` posts stay in the source JSON so the local backoffice can edit them,
 * but their titles and HTML must not ship in the public build or be crawlable.
 * Keeping array positions intact preserves every other `/posts/:id` URL.
 */
const distDir = join(process.cwd(), 'dist')
const publicPostsPath = join(distDir, 'content', 'posts.json')

const readPosts = async () => {
  try {
    return JSON.parse(await readFile(publicPostsPath, 'utf-8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

const draftPlaceholder = {
  title: '',
  image: '',
  url: '#',
  summary: '',
  contentHtml: '',
  devOnly: true,
}

const pruneDrafts = async () => {
  const data = await readPosts()
  if (!data || !Array.isArray(data.items)) {
    console.log('ℹ️  No built posts.json found; skipping draft pruning.')
    return
  }

  const draftIndexes = []
  data.items = data.items.map((post, index) => {
    if (!post?.devOnly) return post
    draftIndexes.push(index)
    return { ...draftPlaceholder }
  })

  if (!draftIndexes.length) {
    console.log('✅ No devOnly posts in the public build.')
    return
  }

  await writeFile(publicPostsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
  await Promise.all(
    draftIndexes.map((index) =>
      rm(join(distDir, 'content', 'posts', `${index}.html`), { force: true }),
    ),
  )

  console.log(
    `✅ Removed ${draftIndexes.length} devOnly post(s) from dist (indexes ${draftIndexes.join(', ')}).`,
  )
}

pruneDrafts().catch((error) => {
  console.error('❌ Failed to prune devOnly posts:', error)
  process.exit(1)
})
