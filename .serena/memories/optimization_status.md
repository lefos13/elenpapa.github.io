# Optimization Status

## Completed ✅

### 1. Route Lazy Loading (src/router/index.ts)

- HomePage: eager load (critical path)
- All other views: dynamic imports `() => import('@/views/...')`
- Benefit: Reduced initial bundle, secondary pages load on demand

### 2. Build Plugins Moved to devDependencies

- `rollup-plugin-visualizer`
- `vite-plugin-compression`
- `vite-plugin-image-optimizer`

### 3. Content Composables Extended (src/composables/useContent.ts)

Added missing composables:

- `useBookContent()`
- `useMoonlightContent()`
- `usePaintedBooksContent()`
- `usePublishersContent()`

### 4. Header Refactoring

- Created `src/composables/useHeaderAnimation.ts`
- Extracted ~200 lines of GSAP animation logic
- Header.vue reduced from ~403 to ~110 lines
- Same functionality, better maintainability

## Pending

### Lighthouse Audit

Preview server: http://127.0.0.1:4173/
Run in Chrome DevTools → Lighthouse tab
Target: ≥90 all categories (Performance, Accessibility, Best Practices, SEO)

### Content Completion (Low Priority)

- Timeline: "Lorem Ipsum Vol XX" → real book titles
- Painted books: placeholder images → actual artwork
