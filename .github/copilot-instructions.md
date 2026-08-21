# GitHub Copilot Instructions

## Project Vision (docs/plan.md)

- Single-page Vue 3 portfolio with anchor navigation for hero, intro, book timeline, services, posts carousel, contact form, and footer.
- Visual language: light gray + lilac palette, developer-provided logo/typography, transparent media backplates, and smooth scroll-triggered animations.
- Responsive everywhere: nav collapses to a hamburger on small viewports; all sections must look good at 375/768/1024/1280 widths.

## Current State (docs/status.md)

- All core sections/components exist and consume JSON content via `src/services/content.ts` with **Zod runtime validation**.
- ESLint + Prettier, Husky + lint-staged, and VS Code settings are configured.
- Scroll animations, responsive passes, and content JSON schema are done.
- **Completed optimizations**: Font optimization (70% reduction), image optimization (73% reduction via WebP/AVIF), bundle compression (Brotli/Gzip), PostsCarousel image loading optimization, PWA support.
- **Accessibility work complete**: WCAG AA color contrast, focus traps, ARIA labels, screen reader announcements.
- **Remaining gap**: Run Lighthouse audit and document scores (target ≥90).

## Architecture Overview

### Content Pipeline

- **JSON Sources**: `public/content/*.json` (site, home, timeline, services, posts, contact, book, moonlight, painted-books, publishers)
- **Type Safety**: Zod schemas in `src/services/content.ts` with auto-inferred TypeScript types
- **Fetching**: Runtime fetch via typed getters (`getSite`, `getHome`, etc.) with in-memory caching
- **Composables**: `src/composables/useContent.ts` provides `useAsyncState`-wrapped hooks for loading states

### Key Dependencies

- **Core**: Vue 3.5+, Vue Router 4, TypeScript, Vite 7+
- **Forms**: VeeValidate + @vee-validate/zod for validation with ARIA error messages
- **Animations**: GSAP (Header bubble animation), IntersectionObserver reveal directive
- **Carousel**: Swiper with A11y module for accessibility
- **Utilities**: @vueuse/core, @vueuse/integrations (focus-trap), @vueuse/motion (configured but not yet integrated)

### Animation System

- **Reveal directive**: `src/directives/reveal.ts` - IntersectionObserver-based scroll reveal
- **Motion utilities**: `src/utils/animations.ts` - Centralized @vueuse/motion configs (ready for integration)
- **GSAP**: Header.vue uses GSAP for desktop "bubble" nav animation on scroll
- **Accessibility**: All animations respect `prefers-reduced-motion`

## Development Guardrails

- **Content pipeline**: Never hardcode marketing copy; fetch via the typed getters (`getSite`, `getHome`, etc.) that read `public/content/*.json`. Update JSON + Zod schemas when content changes.
- **Styling**: Extend `src/styles/variables.css` for colors/spacing; keep semi-transparent image backgrounds and lilac accents consistent with the plan.
- **Scoped styles**: Keep every component and view styled via dedicated files under `src/styles/components` or `src/styles/views`, imported with `<style scoped src="...">`; promote anything shared into `src/styles/base.css` instead of inline blocks.
- **Animations**: Use the existing IntersectionObserver reveal utility and honor `prefers-reduced-motion`.
- **Responsive nav**: Preserve the hamburger/menu logic already living in `Header.vue` when touching navigation. Header uses GSAP for desktop bubble animation + @vueuse focus trap for mobile.
- **Assets**: Point to `/images/...` under `public/images` (or update JSON) to avoid broken references.
- **SVG icons**: Never hardcode inline SVG markup in components. Extract all SVG icons to separate files in `public/images/common/` and reference them via `<img>` tags or `SvgIcon.vue`.

## Coding Standards

- Stack: Vue 3 + TypeScript + Vite. Use `<script setup lang="ts">`, composition API, and the `@` alias for imports.
- Formatting: Prettier (no semicolons, single quotes, width 100) enforced via VS Code + Husky.
- Lint/type gates: run `npm run lint`, `npm run type-check`, and `npm run build` before opening PRs.
- Tests are manual for now; rely on type-check + Lighthouse runs until automated coverage is added.

## When Adding Features

1. Define/adjust content in `public/content/*.json`, update Zod schemas + types in `src/services/content.ts`, and wire components via the service or `useContent` composables.
2. Favor small, accessible Vue components under `src/components`; reuse shared styles/utilities.
3. Update `docs/status.md` when milestones complete (e.g., Lighthouse scores, new sections, content refreshes).
4. Keep PRs focused on one section/concern; mention if they impact the pending Lighthouse work.

## Outstanding Priorities for Copilot

- Run and document Lighthouse audit results (Performance, Accessibility, Best Practices, SEO ≥90 targets).
- Suggest route lazy-loading for non-home views in `src/router/index.ts` to reduce initial bundle.
- Flag opportunities to standardize content loading (prefer `useContent` composables over direct `getX()` calls).
- Surface any @vueuse/motion integration opportunities using existing `src/utils/animations.ts` configs.
- Note placeholder content that needs replacement (timeline "Lorem Ipsum" titles, painted-books images).

## Lighthouse Audit Checklist

Before finalizing, verify:

- [ ] Run `npm run build && npm run preview`, then Lighthouse audit in Chrome DevTools
- [ ] Performance ≥90 (check LCP, CLS, FID)
- [ ] Accessibility ≥90 (verify ARIA labels, focus order, contrast)
- [ ] Best Practices ≥95 (HTTPS, no console errors, proper image formats)
- [ ] SEO ≥90 (meta tags, Open Graph, semantic HTML)
- [ ] Document scores in `docs/status.md`

## Package.json Notes

- **Build plugins in dependencies**: `rollup-plugin-visualizer`, `vite-plugin-compression`, `vite-plugin-image-optimizer` should ideally be in devDependencies (low priority cleanup)
