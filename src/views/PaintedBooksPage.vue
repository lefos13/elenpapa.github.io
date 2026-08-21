<script setup lang="ts">
import { ref, onMounted, onServerPrefetch, computed } from 'vue'
import { content, type PaintedBooksContent } from '@/services/content'
import { usePageSeo } from '@/composables/usePageSeo'
import { trackEvent } from '@/utils/analytics'

// SEO: Set up meta tags and CreativeWork schema for Painted Books
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { siteUrl } = usePageSeo({
  pageKey: 'paintedBooks',
  path: '/painted-books',
  type: 'website',
  structuredData: [
    {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: 'Ζωγραφισμένα Βιβλία',
      author: {
        '@type': 'Person',
        name: 'Έλενα Παπαδοπούλου',
      },
      inLanguage: 'el',
      description: 'Μια μοναδική συλλογή όπου η τέχνη συναντά τη λογοτεχνία',
    },
  ],
})

const data = ref<PaintedBooksContent | null>(null)

const hero = computed(() => data.value?.hero)
const heroMediaSrc = computed(() => hero.value?.media.src || '')
const heroMediaAlt = computed(() => hero.value?.media.alt || '')
const gallery = computed(() => data.value?.gallery)
const cta = computed(() => data.value?.cta)

// Pagination state
const currentPage = ref(1)
const itemsPerPage = computed(() => gallery.value?.itemsPerPage ?? 4)
const totalItems = computed(() => gallery.value?.items.length ?? 0)
const totalPages = computed(() => Math.ceil(totalItems.value / itemsPerPage.value))

const paginatedItems = computed(() => {
  if (!gallery.value?.items) return []
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return gallery.value.items.slice(start, end)
})

const goToFirst = () => {
  currentPage.value = 1
  trackEvent('gallery_pagination', { location: 'painted_books', action: 'first', page: 1 })
}
const goToLast = () => {
  currentPage.value = totalPages.value
  trackEvent('gallery_pagination', {
    location: 'painted_books',
    action: 'last',
    page: totalPages.value,
  })
}
const goToPrev = () => {
  if (currentPage.value > 1) {
    currentPage.value--
    trackEvent('gallery_pagination', {
      location: 'painted_books',
      action: 'prev',
      page: currentPage.value,
    })
  }
}
const goToNext = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    trackEvent('gallery_pagination', {
      location: 'painted_books',
      action: 'next',
      page: currentPage.value,
    })
  }
}

// Fallback image handling
const placeholderSrc = '/images/common/book-placeholder.svg'
const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (img.src !== placeholderSrc && !img.src.endsWith('book-placeholder.svg')) {
    img.src = placeholderSrc
  }
}

const fetchData = async () => {
  data.value = await content.getPaintedBooks()
}

onServerPrefetch(fetchData)
onMounted(fetchData)

const trackCtaClick = (label: string, href: string) => {
  trackEvent('cta_click', { location: 'painted_books', label, href })
}
</script>

<template>
  <main id="content" role="main" class="painted-books-page">
    <!-- Hero -->
    <section v-if="hero" class="painted-hero diagonal-padding--bottom diagonal--ltr" v-reveal>
      <div class="container hero-inner">
        <div class="hero-copy">
          <h1>{{ hero.title }}</h1>
          <p class="subtitle">{{ hero.subtitle }}</p>
          <p class="description">{{ hero.description }}</p>
        </div>
        <div class="hero-image">
          <div class="image-glow"></div>
          <img
            :src="heroMediaSrc"
            :alt="heroMediaAlt"
            loading="eager"
            decoding="async"
            width="500"
            height="400"
            fetchpriority="high"
            @error="handleImageError"
          />
        </div>
      </div>
    </section>

    <!-- Gallery -->
    <section
      v-if="gallery"
      class="painted-gallery diagonal--both-ltr diagonal-padding--both"
      v-reveal
    >
      <div class="container">
        <header class="section-header">
          <h2>{{ gallery.heading }}</h2>
        </header>
        <ul class="gallery-grid">
          <li v-for="item in paginatedItems" :key="item.id" class="gallery-card">
            <div class="gallery-image">
              <div class="gallery-glow"></div>
              <img
                :src="item.media.src"
                :alt="item.media.alt"
                loading="lazy"
                decoding="async"
                width="300"
                height="400"
                @error="handleImageError"
              />
            </div>
            <div class="gallery-info">
              <h3>{{ item.title }}</h3>
              <p class="author">{{ item.author }}</p>
            </div>
          </li>
        </ul>
        <!-- Pagination controls -->
        <nav v-if="totalPages > 1" class="gallery-pagination" aria-label="Πλοήγηση γκαλερί">
          <button
            class="pagination-btn"
            :disabled="currentPage === 1"
            @click="goToFirst"
            aria-label="Πρώτη σελίδα"
          >
            <span aria-hidden="true">«</span>
          </button>
          <button
            class="pagination-btn"
            :disabled="currentPage === 1"
            @click="goToPrev"
            aria-label="Προηγούμενη σελίδα"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <span class="pagination-info"> {{ currentPage }} / {{ totalPages }} </span>
          <button
            class="pagination-btn"
            :disabled="currentPage === totalPages"
            @click="goToNext"
            aria-label="Επόμενη σελίδα"
          >
            <span aria-hidden="true">›</span>
          </button>
          <button
            class="pagination-btn"
            :disabled="currentPage === totalPages"
            @click="goToLast"
            aria-label="Τελευταία σελίδα"
          >
            <span aria-hidden="true">»</span>
          </button>
        </nav>
      </div>
    </section>

    <!-- CTA -->
    <section v-if="cta" class="painted-cta diagonal-padding--top diagonal--top-ltr" v-reveal>
      <div class="container cta-inner">
        <div class="cta-copy">
          <h2>{{ cta.heading }}</h2>
          <p class="body-text">{{ cta.body }}</p>
        </div>
        <div v-if="cta.buttons?.length" class="cta-actions">
          <template v-for="button in cta.buttons" :key="button.label + button.href">
            <a
              v-if="button.href.startsWith('http')"
              :href="button.href"
              :class="button.variant === 'ghost' ? 'ghost-button' : 'primary-button'"
              target="_blank"
              rel="noreferrer noopener"
              @click="trackCtaClick(button.label, button.href)"
            >
              {{ button.label }}
            </a>
            <RouterLink
              v-else
              :to="button.href"
              :class="button.variant === 'ghost' ? 'ghost-button' : 'primary-button'"
              @click="trackCtaClick(button.label, button.href)"
            >
              {{ button.label }}
            </RouterLink>
          </template>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped src="../styles/views/painted-books-page.css"></style>
