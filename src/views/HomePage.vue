<script setup lang="ts">
import Hero from '@/components/Hero.vue'
import Introduction from '@/components/Introduction.vue'
import Services from '@/components/Services.vue'
import PostsCarousel from '@/components/PostsCarousel.vue'
import Publishers from '@/components/Publishers.vue'
import ContactForm from '@/components/ContactForm.vue'
import { usePageSeo } from '@/composables/usePageSeo'

// SEO: Set up meta tags and structured data for homepage
usePageSeo({
  pageKey: 'home',
  path: '/',
  type: 'website',
  structuredData: [
    // WebSite schema
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Έλενα Παπαδοπούλου',
      url: 'https://editopia.gr',
      description:
        'Επιμέλεια & διόρθωση κειμένων, μετάφραση βιβλίων και αξιολόγηση χειρογράφων. Συμβουλευτική για συγγραφείς.',
      inLanguage: 'el',
    },
    // Person schema for author
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Έλενα Παπαδοπούλου',
      url: 'https://editopia.gr',
      jobTitle: 'Συγγραφέας, Επιμελήτρια & Σύμβουλος Εκδόσεων',
      description:
        'Συγγραφέας και επαγγελματίας επιμελήτρια: επιμέλεια & διόρθωση κειμένων, μετάφραση βιβλίων και αξιολόγηση χειρογράφων.',
      sameAs: [
        'https://www.facebook.com/share/1Evoke3mqs/',
        'https://www.instagram.com/elle._.papadopoulou',
        'https://www.tiktok.com/@elle._.papadopoulou',
        'https://www.goodreads.com/ellepapadopoulou',
        'https://www.linkedin.com/in/eleni-papadopoulou-30',
      ],
    },
  ],
})
</script>

<template>
  <main id="content" role="main">
    <Hero />
    <Introduction />
    <Services />
    <PostsCarousel :with-diagonal="true" />
    <Publishers />
    <ContactForm />
  </main>
</template>

<style scoped src="@/styles/views/home-page.css"></style>
