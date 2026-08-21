<script setup lang="ts">
import { ref, onMounted, onServerPrefetch, watch, nextTick, computed } from 'vue'
import SvgIcon from '@/components/SvgIcon.vue'
import { Swiper, SwiperSlide } from 'swiper/vue'
import type { Swiper as SwiperType } from 'swiper/types'
import { A11y } from 'swiper/modules'
import { content, type PostsContent } from '@/services/content'
import { trackEvent } from '@/utils/analytics'
import { resolveResponsiveSrcset } from '@/utils/responsive-srcset'
import 'swiper/css'

const props = defineProps<{
  excludeId?: number
  withDiagonal?: boolean
}>()

const data = ref<PostsContent | null>(null)
const hasDiagonal = computed(() => props.withDiagonal ?? true)
const heading = computed(() => data.value?.heading ?? 'Featured Posts')
const description = computed(() => data.value?.description ?? '')
const canScrollPrev = ref(false)
const canScrollNext = ref(false)
const swiperInstance = ref<SwiperType>()
const swiperModules = [A11y]

const updateButtons = (swiper?: SwiperType | null) => {
  if (!swiper) {
    canScrollPrev.value = false
    canScrollNext.value = false
    return
  }

  const locked = swiper.isLocked
  canScrollPrev.value = !locked && !swiper.isBeginning
  canScrollNext.value = !locked && !swiper.isEnd
}

const onSwiperReady = (swiper: SwiperType) => {
  swiperInstance.value = swiper
  updateButtons(swiper)
}

const handleStateChange = (swiper: SwiperType) => {
  updateButtons(swiper)
}

const fetchData = async () => {
  data.value = await content.getPosts()
}

onServerPrefetch(fetchData)
onMounted(fetchData)

watch(
  () => data.value?.items?.length,
  async () => {
    await nextTick()
    swiperInstance.value?.update()
    updateButtons(swiperInstance.value)
  },
)

const scrollPrev = () => {
  swiperInstance.value?.slidePrev()
  trackEvent('carousel_nav_click', { location: 'posts', direction: 'prev' })
}

const scrollNext = () => {
  swiperInstance.value?.slideNext()
  trackEvent('carousel_nav_click', { location: 'posts', direction: 'next' })
}

const trackPostClick = (idx: number, title: string) => {
  trackEvent('post_card_click', { location: 'posts', index: idx, title })
}

const getImagePriority = (idx: number): 'high' | 'low' => {
  // Prioritize first 3 images (visible on desktop)
  return idx < 3 ? 'high' : 'low'
}

const getImageLoading = (idx: number): 'eager' | 'lazy' => {
  // Eagerly load first 3 images, lazy load the rest
  return idx < 3 ? 'eager' : 'lazy'
}

const posts = computed(() => {
  const items = data.value?.items ?? []
  // Filter out devOnly posts in production
  const isProd = import.meta.env.PROD
  const excludedIndex = Number.isFinite(props.excludeId ?? NaN) ? props.excludeId : null
  return items
    .map((post, index) => ({ post, index }))
    .filter(
      ({ post, index }) =>
        (!isProd || !post.devOnly) && (excludedIndex === null || index !== excludedIndex),
    )
})
const getPostImageSrc = (imageSrc: string | undefined) => imageSrc || ''
const postImageSrcsetByImage = ref<Record<string, string>>({})

/**
 * Why this exists:
 * Only existing responsive files should be emitted in `srcset`, otherwise the
 * browser may pick a missing candidate and render a broken image.
 */
const ensurePostImageSrcset = (imageSrc: string | undefined) => {
  if (!imageSrc || postImageSrcsetByImage.value[imageSrc] !== undefined) return
  const imageKey = imageSrc
  postImageSrcsetByImage.value[imageKey] = ''
  void resolveResponsiveSrcset(imageKey, [400, 800]).then((resolvedSrcset) => {
    postImageSrcsetByImage.value[imageKey] = resolvedSrcset ?? ''
  })
}

const getPostImageSrcset = (imageSrc: string | undefined) => {
  if (!imageSrc) return ''
  return postImageSrcsetByImage.value[imageSrc] || ''
}

/**
 * Why this exists:
 * Some uploads may not have all responsive variants (e.g. missing 800w file).
 * If the browser selects a missing srcset candidate, we fall back to base src.
 */
const handleResponsiveImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (!img || img.dataset.srcsetFallbackApplied === 'true') return
  img.dataset.srcsetFallbackApplied = 'true'
  img.removeAttribute('srcset')
  // Re-assign src so the browser retries using base image only.
  img.src = img.getAttribute('src') || ''
}

watch(
  posts,
  (entries) => {
    entries.forEach(({ post }) => ensurePostImageSrcset(post.image))
  },
  { immediate: true },
)
</script>

<template>
  <section
    id="posts"
    aria-labelledby="posts-title"
    class="posts-section"
    :class="{ 'diagonal--both-ltr-rtl diagonal-padding--both': hasDiagonal }"
  >
    <div class="container">
      <header class="posts-header" v-reveal>
        <h2 id="posts-title">{{ heading }}</h2>
        <p v-if="description">{{ description }}</p>
      </header>

      <div v-if="!data" class="loading-skeleton">
        <div class="skeleton-slide" v-for="n in 3" :key="n">
          <div class="skeleton-image"></div>
          <div class="skeleton-title"></div>
          <div class="skeleton-text"></div>
        </div>
      </div>

      <div v-else class="carousel-wrapper">
        <button
          class="nav nav-prev"
          @click="scrollPrev"
          :disabled="!canScrollPrev"
          aria-label="Previous posts"
          title="Previous posts"
        >
          <SvgIcon name="chevron-left" class="icon" :width="20" :height="20" ariaHidden />
          <span class="sr-only">Previous</span>
        </button>

        <Swiper
          class="carousel"
          :modules="swiperModules"
          :slides-per-view="1"
          :space-between="16"
          :loop="false"
          :watch-overflow="true"
          :breakpoints="{ 768: { slidesPerView: 2 }, 1024: { slidesPerView: 3 } }"
          @swiper="onSwiperReady"
          @slideChange="handleStateChange"
          @resize="handleStateChange"
          @breakpoint="handleStateChange"
          @toEdge="handleStateChange"
          @fromEdge="handleStateChange"
        >
          <SwiperSlide
            v-for="(entry, idx) in posts"
            :key="entry.index"
            class="carousel__slide"
            :aria-label="`Read post ${idx + 1} of ${posts.length}: ${entry.post.title}`"
          >
            <RouterLink
              :to="`/posts/${entry.index}`"
              class="slide-link"
              @click="trackPostClick(entry.index, entry.post.title)"
            >
              <div class="image-wrapper">
                <img
                  :src="getPostImageSrc(entry.post.image)"
                  :srcset="getPostImageSrcset(entry.post.image)"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 317px"
                  :alt="entry.post.title"
                  :loading="getImageLoading(idx)"
                  :fetchpriority="getImagePriority(idx)"
                  decoding="async"
                  width="400"
                  height="220"
                  @error="handleResponsiveImageError"
                />
              </div>
              <h3>
                {{ entry.post.title }}
              </h3>
              <p v-if="entry.post.summary" class="summary">{{ entry.post.summary }}</p>
            </RouterLink>
          </SwiperSlide>
        </Swiper>

        <button
          class="nav nav-next"
          @click="scrollNext"
          :disabled="!canScrollNext"
          aria-label="Next posts"
          title="Next posts"
        >
          <SvgIcon name="chevron-right" class="icon" :width="20" :height="20" ariaHidden />
          <span class="sr-only">Next</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped src="../styles/components/posts-carousel.css"></style>
