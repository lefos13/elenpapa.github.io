<script setup lang="ts">
import { ref, onMounted, onServerPrefetch, computed } from 'vue'
import { content, type TimelineContent } from '@/services/content'

const data = ref<TimelineContent | null>(null)
const timelineItems = computed(() => (data.value?.items ?? []).slice().reverse())
const getTimelineCoverSrc = (coverSrc: string | undefined) => coverSrc || ''
const placeholderSrc = '/images/common/book-placeholder.svg'

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (img.src !== placeholderSrc && !img.src.endsWith('book-placeholder.svg')) {
    img.src = placeholderSrc
  }
}

// Fetch data both on server (SSG) and client
const fetchData = async () => {
  data.value = await content.getTimeline()
}

// SSG: Prefetch data during server-side rendering
onServerPrefetch(fetchData)

// Client: Fetch data on mount (for hydration and client-side navigation)
onMounted(fetchData)
</script>

<template>
  <section id="timeline" class="timeline-section">
    <div class="container timeline">
      <h2 class="section-title">Εργογραφία</h2>
      <div class="timeline-grid" aria-hidden="false">
        <div class="timeline-column timeline-column--left">
          <article
            v-for="(item, idx) in timelineItems.filter((_, i) => i % 2 === 0)"
            :key="`left-${idx}`"
            class="entry reveal--pageflip-left"
            v-reveal="{ threshold: 0.2, rootMargin: '0px 0px -10% 0px', once: true }"
          >
            <span class="branch" aria-hidden="true"></span>
            <img
              class="cover"
              :src="getTimelineCoverSrc(item.cover)"
              :alt="item.title"
              loading="lazy"
              decoding="async"
              width="200"
              height="280"
              @error="handleImageError"
            />
            <div class="meta">
              <h3>{{ item.title }}</h3>
              <span class="year">{{ item.year }}</span>
              <p class="blurb">{{ item.blurb }}</p>
              <p class="actions">{{ item.actions }}</p>
            </div>
          </article>
        </div>
        <div class="timeline-divider" aria-hidden="true"></div>
        <div class="timeline-column timeline-column--right">
          <article
            v-for="(item, idx) in timelineItems.filter((_, i) => i % 2 === 1)"
            :key="`right-${idx}`"
            class="entry entry--right reveal--pageflip-right"
            v-reveal="{ threshold: 0.2, rootMargin: '0px 0px -10% 0px', once: true }"
          >
            <span class="branch" aria-hidden="true"></span>
            <img
              class="cover"
              :src="getTimelineCoverSrc(item.cover)"
              :alt="item.title"
              loading="lazy"
              decoding="async"
              width="200"
              height="280"
              @error="handleImageError"
            />
            <div class="meta">
              <h3>{{ item.title }}</h3>
              <span class="year">{{ item.year }}</span>
              <p class="blurb">{{ item.blurb }}</p>
              <p class="actions">{{ item.actions }}</p>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="../styles/components/book-timeline.css"></style>
