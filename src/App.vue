<script setup lang="ts">
import { Analytics } from '@vercel/analytics/vue'
import Header from '@/components/Header.vue'
import Footer from '@/components/Footer.vue'
</script>

<template>
  <a href="#content" class="skip-link">Skip to main content</a>
  <Header />
  <RouterView />
  <Footer />
  <Analytics />
</template>

<style scoped>
main {
  display: block;
}
</style>
