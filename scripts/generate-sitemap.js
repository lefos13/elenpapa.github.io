import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DEFAULT_SITE_URL = 'https://editopia.gr'

const baseRoutes = [
  // Main pages (highest priority)
  { path: '/', priority: 1.0, changefreq: 'monthly' },
  { path: '/timeline', priority: 0.9, changefreq: 'monthly' },
  { path: '/book', priority: 0.9, changefreq: 'monthly' },

  // Secondary pages
  { path: '/moonlight', priority: 0.8, changefreq: 'monthly' },
  { path: '/painted-books', priority: 0.8, changefreq: 'monthly' },
]

const getPostRoutes = async () => {
  const postsPath = join(process.cwd(), 'public', 'content', 'posts.json')
  try {
    const raw = await readFile(postsPath, 'utf-8')
    const data = JSON.parse(raw)
    const items = Array.isArray(data?.items) ? data.items : []
    return items
      .map((post, index) => ({ post, index }))
      .filter(({ post }) => !post?.devOnly)
      .map(({ index }) => ({
        path: `/posts/${index}`,
        priority: 0.6,
        changefreq: 'monthly',
      }))
  } catch (error) {
    console.warn('⚠️  Could not read posts.json for sitemap generation:', error)
    return []
  }
}

const getSiteUrl = async () => {
  const sitePath = join(process.cwd(), 'public', 'content', 'site.json')
  try {
    const raw = await readFile(sitePath, 'utf-8')
    const data = JSON.parse(raw)
    return data?.seo?.siteUrl || DEFAULT_SITE_URL
  } catch (error) {
    console.warn('⚠️  Could not read site.json for sitemap generation:', error)
    return DEFAULT_SITE_URL
  }
}

// Generate XML sitemap
const generateSitemap = (siteUrl, routes) => {
  const lastmod = new Date().toISOString().split('T')[0] // YYYY-MM-DD format

  const urlEntries = routes
    .map(
      (route) => `  <url>
    <loc>${siteUrl}${route.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`
}

// Write sitemap to public directory
const writeSitemap = async () => {
  const postRoutes = await getPostRoutes()
  const allRoutes = [...baseRoutes, ...postRoutes]
  const siteUrl = await getSiteUrl()
  const xml = generateSitemap(siteUrl, allRoutes)
  const outputPath = join(process.cwd(), 'public/sitemap.xml')

  try {
    await writeFile(outputPath, xml, 'utf-8')
    console.log('✅ Sitemap generated successfully at public/sitemap.xml')
    console.log(`   Total URLs: ${allRoutes.length}`)
  } catch (error) {
    console.error('❌ Failed to generate sitemap:', error)
    process.exit(1)
  }
}

writeSitemap()
