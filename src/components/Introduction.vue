<script setup lang="ts">
import { ref, onMounted, onServerPrefetch, computed, watch } from 'vue'
import { content, type HomeContent } from '@/services/content'
import { resolveResponsiveSrcset } from '@/utils/responsive-srcset'

const home = ref<HomeContent | null>(null)
const isLoading = ref(true)
const introImageSrc = computed(() => home.value?.intro.image.src || '')
const introImageAlt = computed(() => home.value?.intro.image.alt || 'Intro image')
const introImageSrcset = ref('')
const milestoneIconSrcsetByIcon = ref<Record<string, string>>({})

// Helper for milestone icons
const getMilestoneIconSrc = (iconSrc: string | undefined) => iconSrc || ''

const ensureMilestoneIconSrcset = (iconSrc: string | undefined) => {
  if (!iconSrc || milestoneIconSrcsetByIcon.value[iconSrc] !== undefined) return
  const iconKey = iconSrc
  milestoneIconSrcsetByIcon.value[iconKey] = ''
  void resolveResponsiveSrcset(iconKey, [100, 200]).then((resolvedSrcset) => {
    milestoneIconSrcsetByIcon.value[iconKey] = resolvedSrcset ?? ''
  })
}

const getMilestoneIconSrcset = (iconSrc: string | undefined) => {
  if (!iconSrc) return ''
  ensureMilestoneIconSrcset(iconSrc)
  return milestoneIconSrcsetByIcon.value[iconSrc] || ''
}

/**
 * Why this exists:
 * Avoid broken milestone/intro images when one responsive candidate is missing.
 */
const handleResponsiveImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (!img || img.dataset.srcsetFallbackApplied === 'true') return
  img.dataset.srcsetFallbackApplied = 'true'
  img.removeAttribute('srcset')
  img.src = img.getAttribute('src') || ''
}

// Placeholder items to prevent CLS during initial load
const placeholderEducation = [
  { degree: '', institution: '', year: '', icon: '' },
  { degree: '', institution: '', year: '', icon: '' },
  { degree: '', institution: '', year: '', icon: '' },
  { degree: '', institution: '', year: '', icon: '' },
]

const displayedEducation = computed(
  () => home.value?.education || (isLoading.value ? placeholderEducation : []),
)

const fetchData = async () => {
  home.value = await content.getHome()
  isLoading.value = false
}

onServerPrefetch(fetchData)
onMounted(fetchData)

watch(
  introImageSrc,
  (src) => {
    if (!src) {
      introImageSrcset.value = ''
      return
    }
    const currentSrc = src
    void resolveResponsiveSrcset(currentSrc, [400, 800]).then((resolvedSrcset) => {
      if (introImageSrc.value === currentSrc) introImageSrcset.value = resolvedSrcset ?? ''
    })
  },
  { immediate: true },
)

watch(
  displayedEducation,
  (education) => {
    education.forEach((milestone) => ensureMilestoneIconSrcset(milestone.icon))
  },
  { immediate: true },
)
</script>

<template>
  <section id="intro" v-reveal class="intro-section diagonal--ltr">
    <div class="container intro">
      <div class="text">
        <h2>{{ home?.intro.title }}</h2>
        <p v-html="home?.intro.text"></p>
        <RouterLink to="/timeline" class="cta-button">Δείτε την Εργογραφία μου</RouterLink>
      </div>
      <div class="image">
        <div class="backdrop"></div>
        <img
          v-if="home"
          :src="introImageSrc"
          :srcset="introImageSrcset"
          sizes="(max-width: 768px) 100vw, 400px"
          :alt="introImageAlt"
          loading="lazy"
          decoding="async"
          width="400"
          height="500"
          @error="handleResponsiveImageError"
        />
      </div>
    </div>

    <!-- Education Milestones -->
    <div class="container education-milestones">
      <div class="milestone-grid">
        <div
          v-for="(milestone, index) in displayedEducation"
          :key="milestone.degree + '-' + (milestone.year ?? index)"
          class="milestone-card"
          :class="{ 'milestone-card--loading': isLoading }"
        >
          <div class="bubble">
            <div class="bubble-icon">
              <img
                v-if="milestone.icon"
                :src="getMilestoneIconSrc(milestone.icon)"
                :srcset="getMilestoneIconSrcset(milestone.icon)"
                sizes="98px"
                :alt="milestone.degree + ' icon'"
                class="bubble-svg"
                loading="eager"
                fetchpriority="high"
                decoding="async"
                width="98"
                height="98"
                @error="handleResponsiveImageError"
              />
            </div>
          </div>
          <div class="milestone-content">
            <h3>{{ milestone.degree }}</h3>
            <p class="institution">{{ milestone.institution }}</p>
            <p class="year">{{ milestone.year }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="../styles/components/introduction.css"></style>
