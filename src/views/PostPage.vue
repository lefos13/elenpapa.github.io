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

const postImageSrc = computed(() => post.value?.image || '')
const postImageSrcset = ref('')

/**
 * Why this exists:
 * Uploaded images may occasionally miss one srcset candidate size. If the
 * browser picks a missing file, fallback to the base src path immediately.
 */
const handleResponsiveImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (!img || img.dataset.srcsetFallbackApplied === 'true') return
  img.dataset.srcsetFallbackApplied = 'true'
  img.removeAttribute('srcset')
  img.src = img.getAttribute('src') || ''
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

// Dynamic head meta tags for SEO and social sharing
useHead(
  computed(() => ({
    title: post.value?.title || 'Άρθρο',
    meta: [
      // Basic SEO
      {
        name: 'description',
        content: post.value?.summary || 'Συμβουλές για συγγραφείς από την Έλενα Παπαδοπούλου',
      },
      { name: 'robots', content: 'index, follow' },
      { name: 'author', content: 'Έλενα Παπαδοπούλου' },

      // Open Graph (Facebook, LinkedIn, etc.)
      { property: 'og:type', content: 'article' },
      { property: 'og:title', content: post.value?.title || 'Άρθρο' },
      {
        property: 'og:description',
        content: post.value?.summary || 'Συμβουλές για συγγραφείς από την Έλενα Παπαδοπούλου',
      },
      { property: 'og:image', content: ogImageUrl.value },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: post.value?.title || 'Άρθρο' },
      { property: 'og:url', content: canonicalUrl.value },
      { property: 'og:site_name', content: siteName.value },
      { property: 'og:locale', content: siteData.value?.seo.locale || 'el_GR' },

      // Twitter Card
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: post.value?.title || 'Άρθρο' },
      {
        name: 'twitter:description',
        content: post.value?.summary || 'Συμβουλές για συγγραφείς από την Έλενα Παπαδοπούλου',
      },
      { name: 'twitter:image', content: ogImageUrl.value },
      { name: 'twitter:image:alt', content: post.value?.title || 'Άρθρο' },
    ],
    link: [{ rel: 'canonical', href: canonicalUrl.value }],
  })),
)

const fetchData = async () => {
  const [postsData, site] = await Promise.all([content.getPosts(), content.getSite()])
  data.value = postsData
  siteData.value = site
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
      <button @click="goBack" class="back-button" aria-label="Go back">← Πίσω</button>

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
            @error="handleResponsiveImageError"
          />
        </div>
        <h1>{{ post.title }}</h1>
      </div>

      <div class="post-content" v-html="postContentHtml"></div>
    </article>

    <PostsCarousel v-if="post" :exclude-id="postId" :with-diagonal="false" />
  </main>
</template>

<style scoped src="@/styles/views/post-page.css"></style>
