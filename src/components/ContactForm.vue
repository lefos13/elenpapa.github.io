<script setup lang="ts">
import { ref, onMounted, onServerPrefetch } from 'vue'
import { content, type ContactContent } from '@/services/content'
import { trackEvent } from '@/utils/analytics'

const data = ref<ContactContent | null>(null)

const fetchData = async () => {
  data.value = await content.getContact()
}

onServerPrefetch(fetchData)
onMounted(fetchData)

const trackContactClick = (mailto: string | undefined) => {
  trackEvent('contact_email_click', {
    location: 'contact',
    href: mailto || '',
  })
}
</script>

<template>
  <section id="contact" class="contact-section" v-reveal>
    <div class="container">
      <h2>{{ data?.title }}</h2>
      <p class="desc">{{ data?.description }}</p>

      <div v-if="data?.mailto" class="contact-action">
        <a :href="data.mailto" class="contact-link" @click="trackContactClick(data?.mailto)">
          {{ data.emailLabel || data.mailto.replace('mailto:', '') }}
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped src="../styles/components/contact-form.css"></style>
