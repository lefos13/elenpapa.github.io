# PORTFOLIO PLAN

1. Home
   - Header with logo on left and navigation links on right (They will lead to each section on the same page - not links to other pages)
   - Hero section (full screen background image with title and subtitle centered - call to action button)
   - Introduction (A small text section along with an image next to it. - transparent background behind image)
   - Book timeline (section with book covers and years below them - vertical line connecting them - a few words about each book next to each cover)
   - Services (A section with cards for each service offered - hover effect on cards - modern animations)
   - Contact form at the bottom of page (name, email, message - simple and clean design)
   - 9 featured articles/blog posts with images and titles in carousel format.
   - Footer with social media links and copyright information
2. Design elements
   - Color scheme: modern and clean (light gray, lilac)
   - Custom Logo: Developer will provide it.
   - Typography: Developer will provide it. (Create custom font family so future changes to font can be done easily site wide)
   - Animations: smooth transitions and hover effects on buttons and cards. Animations should apply on scroll for sections appearing into view.
3. Responsiveness
   - The website must be fully responsive and look good on all devices (desktops, tablets, mobile phones).
   - Navigation menu should collapse into a hamburger menu on smaller screens.
4. DEV configs
   - Create content config from json files for easy future updates to content. I want no hardcoded text in the components.
   - Set up eslint with recommended rules for Vue.js
   - Set up prettier for code formatting
   - Set up Husky for pre-commit hooks to run linting and formatting checks
   - Configure vs code extensions to follow eslint and prettier rules

---

## Implementation Status

### Completed ✅

- All core sections built (Hero, Intro, Timeline, Services, Posts Carousel, Contact, Footer)
- Content pipeline: JSON → Zod schemas → typed services → components
- Responsive design (375/768/1024/1280 breakpoints)
- Hamburger menu with focus trap
- Scroll animations (IntersectionObserver reveal directive)
- Font optimization (70% reduction via @fontsource)
- Image optimization (73% reduction via WebP/AVIF)
- Bundle compression (Brotli/Gzip)
- Accessibility (WCAG AA contrast, ARIA labels, focus management)
- PWA support (vite-plugin-pwa)

### Pending ⏳

- Lighthouse audit (target ≥90 all categories)
- Replace placeholder content (timeline titles, painted-books images)

---

## Phase 5: Post-Lighthouse Polish (Optional)

After Lighthouse audit is complete:

### Performance Enhancements

1. **Route lazy-loading**: Convert static imports in `src/router/index.ts` to dynamic imports for non-home views
2. **Remove unused packages**: Uninstall `swiper` (PostsCarousel uses Embla)
3. **Move build plugins to devDependencies**: `rollup-plugin-visualizer`, `vite-plugin-compression`, `vite-plugin-image-optimizer`

### Code Quality

4. **Standardize content loading**: Use `useContent` composables consistently instead of mixed direct `getX()` calls
5. **Header refactoring**: Extract GSAP animation logic into `useHeaderAnimation` composable (reduce 403 lines)

### Animation System

6. **@vueuse/motion integration**: Replace reveal directive with declarative motion patterns using existing `src/utils/animations.ts` configs

### Content Completion

7. **Timeline content**: Replace "Lorem Ipsum Vol XX" with actual book titles (see `docs/timeline-mapping.md`)
8. **Painted books gallery**: Add actual artwork photos (see `public/images/painted-books/README.md`)

### Testing (Future)

9. **Vitest + Testing Library**: Add unit tests for content service and key components
10. **Playwright**: Add E2E tests for critical user flows
