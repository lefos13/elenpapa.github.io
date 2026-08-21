<script setup lang="ts">
import { ref, onMounted, onServerPrefetch, computed } from 'vue'
import { content, type HomeContent } from '@/services/content'
import { trackEvent } from '@/utils/analytics'

const home = ref<HomeContent | null>(null)
const heroBackgroundImage = computed(() => home.value?.hero.backgroundImage || '')
const heroTitle = computed(() => home.value?.hero.title || '')
const heroSubtitle = computed(() => home.value?.hero.subtitle || '')

const scrollToContact = () => {
  trackEvent('cta_click', { location: 'hero', target: 'contact' })
  const contactSection = document.getElementById('contact')
  if (contactSection) {
    contactSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const fetchData = async () => {
  home.value = await content.getHome()
}

onServerPrefetch(fetchData)
onMounted(fetchData)
</script>

<template>
  <section
    id="home"
    class="hero"
    v-reveal
    :style="home ? { backgroundImage: `url(${heroBackgroundImage})` } : {}"
  >
    <div class="overlay">
      <div class="container inner">
        <h1 class="title">{{ heroTitle }}</h1>
        <p class="subtitle">{{ heroSubtitle }}</p>
        <button
          class="cta-button"
          @click="scrollToContact"
          aria-label="Ας συνεργαστούμε - επικοινωνήστε μαζί μου"
        >
          Ας συνεργαστούμε
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped src="../styles/components/hero.css"></style>
