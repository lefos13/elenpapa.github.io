<script setup lang="ts">
import { ref, onMounted, onServerPrefetch, computed, nextTick } from 'vue'
import { useHead } from '@unhead/vue'
import { content, type BookContent } from '@/services/content'
import { usePageSeo } from '@/composables/usePageSeo'
import { trackEvent } from '@/utils/analytics'

// SEO: Set up meta tags and Book schema for the book page
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { siteUrl } = usePageSeo({
  pageKey: 'book',
  path: '/book',
  type: 'website',
  structuredData: [
    {
      '@context': 'https://schema.org',
      '@type': 'Book',
      name: 'Ένα μόνο γράμμα',
      author: {
        '@type': 'Person',
        name: 'Έλενα Παπαδοπούλου',
      },
      inLanguage: 'el',
      description: "Ανακαλύψτε το βιβλίο 'Ένα μόνο γράμμα' της Έλενας Παπαδοπούλου",
    },
  ],
})

declare global {
  interface Window {
    instgrm?: {
      Embeds?: {
        process?: () => void
      }
    }
  }
}

const INSTAGRAM_EMBED_SCRIPT_ID = 'instagram-embed-script'

const ensureInstagramEmbedsReady = async (): Promise<void> => {
  if (document.getElementById(INSTAGRAM_EMBED_SCRIPT_ID)) {
    window.instgrm?.Embeds?.process?.()
    return
  }

  await new Promise<void>((resolve) => {
    const script = document.createElement('script')
    script.id = INSTAGRAM_EMBED_SCRIPT_ID
    script.async = true
    script.defer = true
    script.src = 'https://www.instagram.com/embed.js'
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.body.appendChild(script)
  })

  window.instgrm?.Embeds?.process?.()
}

const data = ref<BookContent | null>(null)

const hero = computed(() => data.value?.hero)
const heroCoverSrc = computed(() => hero.value?.cover || '')
const about = computed(() => data.value?.about)
const eventsSection = computed(() => data.value?.eventsSection)
const events = computed(() => data.value?.events || [])
const preview = computed(() => data.value?.preview)
const hasInstagramEmbeds = computed(() =>
  Boolean(data.value?.events?.some((event) => event.instagramEmbedHtml)),
)

useHead(
  computed(() => {
    if (!hasInstagramEmbeds.value) return {}
    return {
      link: [
        { rel: 'preconnect', href: 'https://www.instagram.com', crossorigin: 'anonymous' },
        { rel: 'dns-prefetch', href: 'https://www.instagram.com' },
      ],
    }
  }),
)

const fetchData = async () => {
  data.value = await content.getBook()
}

onServerPrefetch(fetchData)

onMounted(async () => {
  await fetchData()

  if (!hasInstagramEmbeds.value) return

  await nextTick()
  await ensureInstagramEmbedsReady()
})

const trackOutboundClick = (label: string, href: string, location: string) => {
  trackEvent('outbound_click', { location, label, href })
}
</script>

<template>
  <main id="content" role="main" class="book-page">
    <!-- Hero / Cover -->
    <section v-if="hero" class="book-hero diagonal-padding--bottom diagonal--ltr" v-reveal>
      <div class="container hero-inner">
        <div class="hero-text">
          <h1>{{ hero.title }}</h1>
          <p v-if="hero.tagline" class="tagline">{{ hero.tagline }}</p>
        </div>
        <div class="hero-cover">
          <div class="cover-backdrop"></div>
          <div class="cover-frame">
            <img
              :src="heroCoverSrc"
              :alt="hero.coverAlt || ''"
              loading="eager"
              decoding="async"
              width="300"
              height="450"
              fetchpriority="high"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- About the book -->
    <section v-if="about" class="book-about diagonal--both-ltr diagonal-padding--both" v-reveal>
      <div class="container about-inner">
        <div class="about-copy">
          <h2>{{ about.heading }}</h2>
          <p class="body-text">{{ about.body }}</p>
          <div class="hero-actions">
            <a
              v-if="hero?.goodreadsUrl && hero?.goodreadsLabel"
              class="cta-button"
              :href="hero?.goodreadsUrl"
              target="_blank"
              rel="noreferrer noopener"
              @click="trackOutboundClick(hero.goodreadsLabel, hero.goodreadsUrl, 'book_hero')"
            >
              {{ hero.goodreadsLabel }}
            </a>
            <a
              v-if="hero?.moonlighttalesUrl && hero?.moonlighttalesLabel"
              class="cta-button"
              :href="hero?.moonlighttalesUrl"
              target="_blank"
              rel="noreferrer noopener"
              @click="
                trackOutboundClick(hero.moonlighttalesLabel, hero.moonlighttalesUrl, 'book_hero')
              "
            >
              {{ hero.moonlighttalesLabel }}
            </a>
          </div>
        </div>
        <aside v-if="about.pullQuote" class="about-quote" :aria-label="about.pullQuoteAriaLabel">
          <p class="quote">{{ about.pullQuote }}</p>
        </aside>
      </div>
    </section>

    <!-- Events / photos strip -->
    <section
      v-if="events.length"
      class="book-events"
      aria-labelledby="book-events-heading"
      v-reveal
    >
      <div class="container">
        <header v-if="eventsSection?.heading" class="section-header">
          <h2 id="book-events-heading">{{ eventsSection.heading }}</h2>
          <!-- <p v-if="eventsSection.subtitle" class="section-subtitle">{{ eventsSection.subtitle }}</p> -->
        </header>

        <ul class="events-grid">
          <li v-for="event in events" :key="event.id" class="event-card">
            <div
              v-if="event.instagramEmbedHtml"
              class="event-embed"
              v-html="event.instagramEmbedHtml"
            />
          </li>
        </ul>
      </div>
    </section>

    <!-- Text preview -->
    <section v-if="preview" class="book-preview diagonal--top-ltr diagonal-padding--both" v-reveal>
      <div class="container preview-inner">
        <header class="section-header">
          <h2>{{ preview.heading }}</h2>
          <p v-if="preview.lede" class="section-subtitle">{{ preview.lede }}</p>
        </header>
        <div class="preview-body">
          <p class="preview-excerpt">{{ preview.excerpt }}</p>
          <p v-if="preview.note && preview.previewUrl" class="preview-note">
            <a
              :href="preview.previewUrl"
              target="_blank"
              rel="noopener noreferrer"
              @click="trackOutboundClick(preview.note, preview.previewUrl, 'book_preview')"
              >{{ preview.note }}</a
            >
          </p>
          <p v-else-if="preview.note" class="preview-note">{{ preview.note }}</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped src="../styles/views/book-page.css"></style>
