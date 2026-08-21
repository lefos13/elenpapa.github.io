<script setup lang="ts">
import Header from '@/components/Header.vue'
import Footer from '@/components/Footer.vue'
</script>

<template>
  <a href="#content" class="skip-link">Skip to main content</a>
  <Header />
  <RouterView />
  <Footer />
</template>

<style scoped>
main {
  display: block;
}
</style>
