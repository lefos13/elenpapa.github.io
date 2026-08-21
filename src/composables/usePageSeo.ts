import { computed, ref } from 'vue'
import { useHead } from '@unhead/vue'
import { content, type SiteContent } from '@/services/content'

interface PageSeoOptions {
  pageKey?: 'home' | 'timeline' | 'book' | 'moonlight' | 'paintedBooks'
  title?: string
  description?: string
  image?: string
  path?: string
  type?: 'website' | 'article'
  structuredData?: Array<Record<string, unknown>>
}

/**
 * Composable for managing page SEO metadata
 * Provides consistent meta tags, Open Graph, Twitter Cards, and structured data
 */
export function usePageSeo(options: PageSeoOptions = {}) {
  const siteData = ref<SiteContent | null>(null)

  // Load site data immediately (not in onMounted) so SEO tags are set correctly
  content.getSite().then((data) => {
    siteData.value = data
  })

  const pageConfig = computed(() => {
    if (!options.pageKey || !siteData.value?.seo.pages) return null
    return siteData.value.seo.pages[options.pageKey]
  })

  const siteUrl = computed(() => siteData.value?.seo.siteUrl || '')
  const siteName = computed(() => siteData.value?.seo.siteName || 'Έλενα Παπαδοπούλου')
  const locale = computed(() => siteData.value?.seo.locale || 'el_GR')
  const author = computed(() => siteData.value?.seo.author || 'Έλενα Παπαδοπούλου')

  // Merge custom options with page config, with custom taking priority
  const pageTitle = computed(() => options.title || pageConfig.value?.title || siteName.value)
  const pageDescription = computed(
    () =>
      options.description ||
      pageConfig.value?.description ||
      'Επιμέλεια & διόρθωση κειμένων, μετάφραση βιβλίων και συμβουλευτική για συγγραφείς',
  )
  const pageImage = computed(
    () =>
      options.image ||
      pageConfig.value?.image ||
      siteData.value?.seo.defaultImage ||
      '/images/intro.png',
  )
  const pagePath = computed(() => options.path || pageConfig.value?.path || '/')
  const canonicalUrl = computed(() => `${siteUrl.value}${pagePath.value}`)
  const fullImageUrl = computed(() => {
    const img = pageImage.value
    return img.startsWith('http') ? img : `${siteUrl.value}${img}`
  })

  const pageType = computed(() => options.type || 'website')

  // Set up head meta tags
  useHead(
    computed(() => {
      const meta: Array<{ name?: string; property?: string; content: string }> = [
        // Basic SEO
        { name: 'description', content: pageDescription.value },
        { name: 'robots', content: 'index, follow' },
        { name: 'author', content: author.value },

        // Open Graph
        { property: 'og:type', content: pageType.value },
        { property: 'og:title', content: pageTitle.value },
        { property: 'og:description', content: pageDescription.value },
        { property: 'og:image', content: fullImageUrl.value },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: pageTitle.value },
        { property: 'og:url', content: canonicalUrl.value },
        { property: 'og:site_name', content: siteName.value },
        { property: 'og:locale', content: locale.value },

        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: pageTitle.value },
        { name: 'twitter:description', content: pageDescription.value },
        { name: 'twitter:image', content: fullImageUrl.value },
        { name: 'twitter:image:alt', content: pageTitle.value },
      ]

      const headConfig: {
        title: string
        meta: Array<{ name?: string; property?: string; content: string }>
        link: Array<{ rel: string; href: string }>
        script?: Array<{ type: string; children: string }>
      } = {
        title: pageTitle.value,
        meta,
        link: [{ rel: 'canonical', href: canonicalUrl.value }],
      }

      // Add structured data if provided
      if (options.structuredData && options.structuredData.length > 0) {
        headConfig.script = options.structuredData.map((data) => ({
          type: 'application/ld+json',
          children: JSON.stringify(data),
        }))
      }

      return headConfig
    }),
  )

  return {
    siteUrl,
    siteName,
    locale,
    author,
    pageTitle,
    pageDescription,
    pageImage,
    canonicalUrl,
  }
}
