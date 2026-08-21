<script setup lang="ts">
import { ref, onMounted, onServerPrefetch, computed, watch } from 'vue'
import { content, type PublishersContent } from '@/services/content'
import { resolveResponsiveSrcset } from '@/utils/responsive-srcset'

const data = ref<PublishersContent | null>(null)

const fetchData = async () => {
  data.value = await content.getPublishers()
}

onServerPrefetch(fetchData)
onMounted(fetchData)

const heading = computed(() => data.value?.heading ?? '')
const description = computed(() => data.value?.description ?? '')
const publishers = computed(() => data.value?.items ?? [])
const getPublisherLogoSrc = (logoSrc: string | undefined) => logoSrc || ''
const getPublisherLogoAlt = (logoAlt: string | undefined) => logoAlt || ''
const publisherLogoSrcsetByImage = ref<Record<string, string>>({})

const getPublisherLogoSrcset = (logoSrc: string | undefined) => {
  if (!logoSrc || logoSrc.endsWith('.svg')) return ''
  return publisherLogoSrcsetByImage.value[logoSrc] || ''
}

const ensurePublisherLogoSrcset = (logoSrc: string | undefined) => {
  if (
    !logoSrc ||
    logoSrc.endsWith('.svg') ||
    publisherLogoSrcsetByImage.value[logoSrc] !== undefined
  )
    return
  const logoKey = logoSrc
  publisherLogoSrcsetByImage.value[logoKey] = ''
  void resolveResponsiveSrcset(logoKey, [120, 240]).then((resolvedSrcset) => {
    publisherLogoSrcsetByImage.value[logoKey] = resolvedSrcset ?? ''
  })
}

/**
 * Why this exists:
 * Keep publisher logos rendering even when a generated responsive size is missing.
 */
const handleResponsiveImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (!img || img.dataset.srcsetFallbackApplied === 'true') return
  img.dataset.srcsetFallbackApplied = 'true'
  img.removeAttribute('srcset')
  img.src = img.getAttribute('src') || ''
}

watch(
  publishers,
  (items) => {
    items.forEach((publisher) => ensurePublisherLogoSrcset(publisher.logo?.src))
  },
  { immediate: true },
)
</script>

<template>
  <section
    id="publishers"
    v-reveal
    aria-labelledby="publishers-title"
    class="publishers-section diagonal--top-rtl diagonal-padding--both"
  >
    <div class="container">
      <header class="publishers-header">
        <h2 id="publishers-title">{{ heading }}</h2>
        <p v-if="description" class="publishers-description">{{ description }}</p>
      </header>
      <ul class="publishers-grid">
        <li v-for="publisher in publishers" :key="publisher.name" class="publisher-card">
          <div v-if="publisher.logo" class="publisher-logo">
            <img
              :src="getPublisherLogoSrc(publisher.logo.src)"
              :srcset="getPublisherLogoSrcset(publisher.logo.src)"
              sizes="(max-width: 768px) 80px, 120px"
              :alt="getPublisherLogoAlt(publisher.logo.alt)"
              loading="lazy"
              decoding="async"
              width="120"
              height="120"
              @error="handleResponsiveImageError"
            />
          </div>
          <div class="publisher-info">
            <h3>{{ publisher.name }}</h3>
            <p v-if="publisher.description" class="publisher-description">
              {{ publisher.description }}
            </p>
            <ul v-if="publisher.services?.length" class="publisher-services">
              <li v-for="(service, idx) in publisher.services" :key="idx">{{ service }}</li>
            </ul>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped src="@/styles/components/publishers.css"></style>
