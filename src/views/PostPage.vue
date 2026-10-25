<script setup lang="ts">
import { ref, onMounted, onServerPrefetch, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { content, type PostsContent, type SiteContent } from '@/services/content'
import PostsCarousel from '@/components/PostsCarousel.vue'
import { trackEvent } from '@/utils/analytics'
import { resolveResponsiveSrcset } from '@/utils/responsive-srcset'

const route = useRoute()
const router = useRouter()
const data = ref<PostsContent | null>(null)
const siteData = ref<SiteContent | null>(null)
const postContentHtml = ref<string>('')

const postId = computed(() => {
  const id = route.params.id
  return typeof id === 'string' ? parseInt(id, 10) : 0
})

const post = computed(() => {
  if (!data.value?.items || isNaN(postId.value)) return null
  const foundPost = data.value.items[postId.value]
  // Hide devOnly posts in production
  if (foundPost?.devOnly && import.meta.env.PROD) return null
  return foundPost
})

const postImageFallback = '/images/common/book-placeholder.svg'
const postImageSrc = computed(() => post.value?.image || postImageFallback)
const postImageSrcset = ref('')

const handlePostImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (!img || img.src.endsWith('book-placeholder.svg')) return

  // First retry without srcset (one responsive variant may be missing),
  // then fall back to the shared placeholder if the base image is also gone.
  if (img.dataset.srcsetFallbackApplied !== 'true') {
    img.dataset.srcsetFallbackApplied = 'true'
    img.removeAttribute('srcset')
    img.src = img.getAttribute('src') || ''
    return
  }

  img.src = postImageFallback
}

watch(
  postImageSrc,
  (imageSrc) => {
    if (!imageSrc) {
      postImageSrcset.value = ''
      return
    }
    const currentImageSrc = imageSrc
    void resolveResponsiveSrcset(currentImageSrc, [400, 800]).then((resolvedSrcset) => {
      if (postImageSrc.value === currentImageSrc) {
        postImageSrcset.value = resolvedSrcset ?? ''
      }
    })
  },
  { immediate: true },
)

// Fetch HTML content from the file path (SSR reads from disk, client uses fetch)
const fetchPostContent = async () => {
  if (!post.value?.contentHtml) {
    postContentHtml.value = ''
    return
  }
  if (!import.meta.env.SSR && postContentHtml.value) return
  try {
    if (import.meta.env.SSR) {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const contentPath = post.value.contentHtml.replace(/^\//, '')
      const filePath = path.join(process.cwd(), 'public', contentPath)
      postContentHtml.value = await fs.readFile(filePath, 'utf-8')
      return
    }

    const response = await fetch(post.value.contentHtml)
    if (response.ok) {
      postContentHtml.value = await response.text()
    }
  } catch (error) {
    console.error('Failed to fetch post content:', error)
  }
}

// SEO: Use site configuration for base URL
const siteUrl = computed(() => siteData.value?.seo.siteUrl || '')
const siteName = computed(() => siteData.value?.seo.siteName || 'Έλενα Παπαδοπούλου')

const canonicalUrl = computed(() => `${siteUrl.value}/posts/${postId.value}`)

// Use generated OG images for social sharing (beautiful templates with title + description)
const ogImageUrl = computed(() => `${siteUrl.value}/images/og/post-${postId.value}.png`)

const postTitle = computed(() => post.value?.title || 'Άρθρο')
const postDescription = computed(() => {
  const summary = post.value?.summary || 'Συμβουλές για συγγραφείς από την Έλενα Παπαδοπούλου'
  if (summary.length <= 158) return summary
  return `${summary.slice(0, 157).replace(/\s+\S*$/, '')}…`
})
const postRobots = computed(() => (post.value ? 'index, follow' : 'noindex, nofollow'))
const headTitle = computed(() =>
  postTitle.value.length > 45 ? postTitle.value : `${postTitle.value} | Έλενα Παπαδοπούλου`,
)

// Schema.org data for the article + its breadcrumb trail.
const postSchema = computed(() => {
  if (!post.value) return null
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${canonicalUrl.value}#article`,
        headline: postTitle.value,
        description: postDescription.value,
        image: ogImageUrl.value,
        url: canonicalUrl.value,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl.value },
        author: {
          '@type': 'Person',
          name: 'Έλενα Παπαδοπούλου',
          url: siteUrl.value,
        },
        publisher: {
          '@type': 'Person',
          name: 'Έλενα Παπαδοπούλου',
          url: siteUrl.value,
        },
        inLanguage: 'el',
        isPartOf: { '@type': 'WebSite', '@id': `${siteUrl.value}/#website` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl.value}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Αρχική',
            item: `${siteUrl.value}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Άρθρα',
            item: `${siteUrl.value}/#posts`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: postTitle.value,
            item: canonicalUrl.value,
          },
        ],
      },
    ],
  }
})

// The stored article markup may contain its own <h1>; demote it so the page has one top-level heading.
const renderedPostContent = computed(() =>
  postContentHtml.value
    .replace(/<h1(\s[^>]*)?>/gi, '<h2$1>')
    .replace(/<\/h1>/gi, '</h2>'),
)

// Dynamic head meta tags for SEO and social sharing
useHead(
  computed(() => {
    const head: {
      title: string
      meta: Array<{ name?: string; property?: string; content: string }>
      link: Array<{ rel: string; href: string }>
      script?: Array<{ type: string; textContent: string }>
    } = {
      title: headTitle.value,
      meta: [
        // Basic SEO
        { name: 'description', content: postDescription.value },
        { name: 'robots', content: postRobots.value },
        { name: 'author', content: 'Έλενα Παπαδοπούλου' },

        // Open Graph (Facebook, LinkedIn, etc.)
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: postTitle.value },
        { property: 'og:description', content: postDescription.value },
        { property: 'og:image', content: ogImageUrl.value },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: postTitle.value },
        { property: 'og:url', content: canonicalUrl.value },
        { property: 'og:site_name', content: siteName.value },
        { property: 'og:locale', content: siteData.value?.seo.locale || 'el_GR' },

        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: postTitle.value },
        { name: 'twitter:description', content: postDescription.value },
        { name: 'twitter:image', content: ogImageUrl.value },
        { name: 'twitter:image:alt', content: postTitle.value },
      ],
      link: [{ rel: 'canonical', href: canonicalUrl.value }],
    }

    if (postSchema.value) {
      head.script = [
        {
          type: 'application/ld+json',
          textContent: JSON.stringify(postSchema.value),
        },
      ]
    }

    return head
  }),
)

const fetchData = async () => {
  const [postsData, site] = await Promise.all([content.getPosts(), content.getSite()])
  data.value = postsData
  siteData.value = site

  const src = post.value?.image
  if (src) {
    const resolved = await resolveResponsiveSrcset(src, [400, 800])
    if (postImageSrc.value === src) postImageSrcset.value = resolved ?? ''
  }

  await fetchPostContent()
}

onServerPrefetch(fetchData)

onMounted(async () => {
  await fetchData()
  // Redirect if post doesn't exist
  if (!post.value) {
    router.push('/')
  }
})

watch(
  () => postId.value,
  async () => {
    postContentHtml.value = ''
    await fetchData()
    if (!post.value) {
      router.push('/')
    }
  },
)

const goBack = () => {
  trackEvent('post_back_click', { location: 'post', id: postId.value })
  router.push('/')
}
</script>

<template>
  <main id="content" role="main" class="post-page">
    <article v-if="post" class="container">
      <nav class="breadcrumbs" aria-label="Διαδρομή πλοήγησης">
        <RouterLink to="/">Αρχική</RouterLink>
        <span aria-hidden="true">/</span>
        <RouterLink to="/#posts">Άρθρα</RouterLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{{ post.title }}</span>
      </nav>
      <button @click="goBack" class="back-button" aria-label="Επιστροφή στην αρχική">← Πίσω</button>

      <div class="post-header">
        <div class="image-wrapper">
          <img
            :src="postImageSrc"
            :srcset="postImageSrcset"
            sizes="(max-width: 768px) 100vw, 800px"
            :alt="post.title"
            loading="eager"
            decoding="async"
            fetchpriority="high"
            width="800"
            height="440"
            @error="handlePostImageError"
          />
        </div>
        <h1>{{ post.title }}</h1>
      </div>

      <div class="post-content" v-html="renderedPostContent"></div>
    </article>

    <PostsCarousel v-if="post" :exclude-id="postId" :with-diagonal="false" />
  </main>
</template>

<style scoped src="@/styles/views/post-page.css"></style>
