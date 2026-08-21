# Portfolio Project Overview

## Purpose

Single-page Vue 3 + Vite portfolio for a Greek author/editor (Elena Papadopoulou). Showcases book editing, translation, and writing services with sections: hero, intro, book timeline, services, posts carousel, contact form, and footer.

## Tech Stack

- **Core**: Vue 3.5+ (Composition API, `<script setup>`), TypeScript, Vite 7+
- **Routing**: Vue Router 4 (6 routes: home, timeline, book, moonlight, painted-books, posts/:id)
- **Forms**: VeeValidate + @vee-validate/zod for validation with ARIA error messages
- **Animations**: GSAP (Header bubble animation), IntersectionObserver reveal directive (`src/directives/reveal.ts`)
- **Carousel**: Swiper with A11y module for accessibility
- **Utilities**: @vueuse/core, @vueuse/integrations (focus-trap), @vueuse/motion (configured but not integrated)
- **Content**: Zod schemas for runtime validation, JSON files under `public/content/`
- **Build**: PWA via vite-plugin-pwa, image optimization, Brotli/Gzip compression

## Structure

- `src/components/` - Homepage sections (Header, Hero, Introduction, BookTimeline, Services, PostsCarousel, ContactForm, Footer, Publishers, SvgIcon)
- `src/views/` - Page views (HomePage, BookPage, MoonlightPage, PaintedBooksPage, PostPage, TimelinePage)
- `src/services/content.ts` - Zod schemas + typed fetchers with in-memory caching
- `src/composables/useContent.ts` - useAsyncState-wrapped hooks for loading states
- `src/directives/reveal.ts` - IntersectionObserver scroll reveal
- `src/utils/animations.ts` - @vueuse/motion configs (ready for integration)
- `src/styles/` - CSS variables, base styles, component-scoped styles

## Content Pipeline

All text/assets fetched via typed getters (`getSite`, `getHome`, etc.) from `public/content/*.json`. Never hardcode marketing copy. Content JSON files: site, home, timeline, services, posts, contact, book, moonlight, painted-books, publishers.

## Current Status

- ✅ All core sections built
- ✅ Zod content validation
- ✅ Font/image optimization (70%/73% reduction)
- ✅ Accessibility (WCAG AA, focus traps, ARIA)
- ✅ PWA configured
- ⏳ Lighthouse audit pending (target ≥90)
- ⚠️ Placeholder content: timeline titles ("Lorem Ipsum Vol XX"), painted-books images
