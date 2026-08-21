<script setup lang="ts">
import { ref, onMounted, onServerPrefetch, computed } from 'vue'
import { useHead } from '@unhead/vue'
import BookTimeline from '@/components/BookTimeline.vue'
import { content, type TimelineContent } from '@/services/content'
import { usePageSeo } from '@/composables/usePageSeo'

// SEO: Set up meta tags for Timeline/Bibliography
usePageSeo({
  pageKey: 'timeline',
  path: '/timeline',
  type: 'website',
})

const data = ref<TimelineContent | null>(null)

const fetchData = async () => {
  data.value = await content.getTimeline()
}

onServerPrefetch(fetchData)
onMounted(fetchData)

const itemListSchema = computed(() => {
  const items = (data.value?.items ?? []).slice().reverse()
  if (!items.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Εργογραφία - Έλενα Παπαδοπούλου',
    description: 'Η πλήρης εργογραφία: βιβλία, μεταφράσεις, επιμέλειες και συνεργασίες',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.title,
    })),
  }
})

useHead(
  computed(() => {
    if (!itemListSchema.value) return {}
    return {
      script: [
        {
          type: 'application/ld+json',
          children: JSON.stringify(itemListSchema.value),
        },
      ],
    }
  }),
)
</script>

<template>
  <main id="content" role="main">
    <BookTimeline />
  </main>
</template>

<style scoped src="@/styles/views/timeline-page.css"></style>
