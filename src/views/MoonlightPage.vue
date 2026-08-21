<script setup lang="ts">
import { ref, onMounted, onServerPrefetch, computed } from 'vue'
import { content, type MoonlightContent } from '@/services/content'
import { usePageSeo } from '@/composables/usePageSeo'
import { trackEvent } from '@/utils/analytics'

// SEO: Set up meta tags and Book schema for Moonlight Tales
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { siteUrl } = usePageSeo({
  pageKey: 'moonlight',
  path: '/moonlight',
  type: 'website',
  structuredData: [
    {
      '@context': 'https://schema.org',
      '@type': 'Book',
      name: 'Moonlight Tales',
      author: {
        '@type': 'Person',
        name: 'Έλενα Παπαδοπούλου',
      },
      inLanguage: 'el',
      description: 'Moonlight Tales: Μια συλλογή ιστοριών που εξερευνά το μυστήριο και τη μαγεία',
    },
  ],
})

const data = ref<MoonlightContent | null>(null)

const hero = computed(() => data.value?.hero)
const mission = computed(() => data.value?.mission)
const bubbles = computed(() => data.value?.bubbles)
const bookJournal = computed(() => data.value?.bookJournal)
const releases = computed(() => data.value?.releases)
const cta = computed(() => data.value?.cta)
const socials = computed(() => data.value?.socials ?? [])

const getReleaseImageSrc = (coverSrc: string | undefined) => coverSrc || ''
const getSocialIconSrc = (iconSrc: string | undefined) => iconSrc || ''

const fetchData = async () => {
  data.value = await content.getMoonlight()
}

onServerPrefetch(fetchData)
onMounted(fetchData)

const trackMoonlightLink = (label: string, href: string, location: string) => {
  trackEvent('outbound_click', { location, label, href })
}
</script>

<template>
  <main id="content" role="main" class="moonlight-page">
    <!-- Hero -->
    <section v-if="hero" class="moonlight-hero diagonal--ltr diagonal-padding--bottom" v-reveal>
      <div class="container hero-grid">
        <div class="hero-copy">
          <div class="hero-header">
            <p class="eyebrow">Moonlight Tales</p>
            <h1>{{ hero.title }}</h1>
          </div>
          <p class="subtitle">{{ hero.subtitle }}</p>
          <div class="hero-description-wrapper">
            <p class="description">{{ hero.description }}</p>
          </div>
        </div>

        <div class="hero-media" aria-label="Moonlight Tales media preview">
          <div class="media-frame">
            <div class="media-primary">
              <div class="media-glow"></div>
              <img
                :src="hero.media.primary.src"
                :alt="hero.media.primary.alt"
                loading="eager"
                decoding="async"
                fetchpriority="high"
                width="2850"
                height="1921"
              />
            </div>
            <div v-if="hero.media.secondary" class="media-secondary">
              <img
                :src="hero.media.secondary.src"
                :alt="hero.media.secondary.alt"
                loading="lazy"
                decoding="async"
                width="235"
                height="241"
              />
            </div>
          </div>
        </div>
      </div>
      <!-- stats moved to the bottom of the section -->
      <div v-if="hero.stats?.length" class="hero-stats">
        <article v-for="stat in hero.stats" :key="stat.label" class="stat-pill">
          <span class="stat-value">{{ stat.value }}</span>
          <span class="stat-label">{{ stat.label }}</span>
        </article>
      </div>
    </section>

    <!-- Mission -->
    <section
      v-if="mission"
      class="moonlight-mission diagonal--both-ltr-rtl diagonal-padding--both"
      v-reveal
    >
      <div class="container mission-grid">
        <div class="mission-copy">
          <p class="eyebrow">{{ mission.eyebrow }}</p>
          <h2>{{ mission.heading }}</h2>
        </div>
        <ul class="mission-pillars">
          <li
            v-for="pillar in mission.pillars"
            :key="`${pillar.firstName}-${pillar.lastName}`"
            class="pillar-card"
          >
            <a
              :href="pillar.href"
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="pillar-link"
              :aria-label="`Δείτε περισσότερα για τον/την ${pillar.firstName} ${pillar.lastName}`"
              @click="
                trackMoonlightLink(
                  `${pillar.firstName} ${pillar.lastName}`,
                  pillar.href,
                  'moonlight_mission',
                )
              "
            >
              <div class="pillar-image">
                <img
                  :src="pillar.image.src"
                  :alt="pillar.image.alt"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <h3>
                <span class="pillar-first-name">{{ pillar.firstName }}</span>
                <span class="pillar-last-name">{{ pillar.lastName }}</span>
              </h3>
            </a>
          </li>
        </ul>
      </div>
    </section>

    <!-- Bubble stats -->
    <section
      v-if="bubbles?.items?.length"
      class="moonlight-bubbles diagonal--both-rtl-ltr diagonal-padding--both"
      v-reveal
    >
      <div class="container">
        <header class="section-header">
          <h2>{{ bubbles.heading }}</h2>
        </header>
        <div class="bubble-grid">
          <article v-for="item in bubbles.items" :key="item.label" class="bubble-card">
            <div class="bubble">
              <div class="bubble-core">
                <span class="bubble-value">{{ item.value }}</span>
              </div>
            </div>
            <p class="bubble-label">{{ item.label }}</p>
            <p v-if="item.description" class="bubble-description">{{ item.description }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- Book Journal -->
    <section
      v-if="bookJournal"
      class="moonlight-book-journal diagonal--both-ltr-rtl diagonal-padding--both"
      v-reveal
    >
      <div class="container book-journal-grid">
        <div class="book-journal-media">
          <div class="book-journal-glow"></div>
          <img
            :src="bookJournal.image.src"
            :alt="bookJournal.image.alt"
            loading="lazy"
            decoding="async"
            width="1476"
            height="2000"
          />
        </div>
        <div class="book-journal-content">
          <header class="section-header">
            <h2>{{ bookJournal.heading }}</h2>
            <p class="section-subtitle">{{ bookJournal.description }}</p>
          </header>
          <a
            :href="bookJournal.instagramHighlight.href"
            target="_blank"
            rel="noopener noreferrer nofollow"
            class="instagram-highlight-link"
            :aria-label="`Δείτε τα ${bookJournal.instagramHighlight.label} στο Instagram`"
            @click="
              trackMoonlightLink(
                bookJournal.instagramHighlight.label,
                bookJournal.instagramHighlight.href,
                'moonlight_book_journal',
              )
            "
          >
            <div class="highlight-bubble">
              <img
                :src="bookJournal.instagramHighlight.thumbnailSrc"
                :alt="bookJournal.instagramHighlight.label"
                loading="lazy"
                decoding="async"
              />
            </div>
            <span class="highlight-label">{{ bookJournal.instagramHighlight.label }}</span>
          </a>
        </div>
      </div>
    </section>

    <!-- Releases -->
    <section
      v-if="releases"
      class="moonlight-releases diagonal--both-rtl-ltr diagonal-padding--both"
      v-reveal
    >
      <div class="container">
        <header class="section-header">
          <h2>{{ releases.heading }}</h2>
          <p class="section-subtitle">{{ releases.description }}</p>
        </header>
        <div class="release-grid">
          <article v-for="book in releases.books" :key="book.id" class="release-card">
            <div class="release-cover">
              <img
                :src="getReleaseImageSrc(book.cover)"
                :alt="book.title"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div class="release-body">
              <p class="release-genre">{{ book.genre }}</p>
              <h3>{{ book.title }}</h3>
              <p class="release-tagline">{{ book.tagline }}</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section v-if="cta" class="moonlight-cta diagonal--top-ltr diagonal-padding--both" v-reveal>
      <div class="container cta-inner">
        <div class="cta-copy">
          <h2>{{ cta.heading }}</h2>
        </div>
        <nav
          v-if="socials.length"
          aria-label="Moonlight Tales social media links"
          class="cta-socials"
        >
          <a
            v-for="s in socials"
            :key="s.href"
            :href="s.href"
            target="_blank"
            rel="noopener noreferrer nofollow"
            :aria-label="s.label"
            class="social-link"
            @click="trackMoonlightLink(s.label, s.href, 'moonlight_cta_socials')"
          >
            <img
              :src="getSocialIconSrc(s.icon)"
              :alt="s.label"
              class="social-icon"
              width="40"
              height="40"
              loading="lazy"
              decoding="async"
            />
          </a>
        </nav>
      </div>
    </section>
  </main>
</template>

<style scoped src="@/styles/views/moonlight-page.css"></style>
