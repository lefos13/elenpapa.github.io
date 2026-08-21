# Component Patterns & Conventions

## Header Component (src/components/Header.vue)

Complex component with multiple responsibilities:

- Desktop: GSAP "bubble" animation on scroll (shrinks nav on scroll down)
- Mobile: Hamburger menu with focus trap (@vueuse/integrations)
- Body scroll lock when mobile menu open
- ~400 lines — candidate for refactoring into composable

## Reveal Directive (src/directives/reveal.ts)

```vue
<div v-reveal>Content fades in on scroll</div>
<div v-reveal="{ delay: 200 }">Delayed reveal</div>
```

- Uses IntersectionObserver with WeakMap cleanup
- Respects `prefers-reduced-motion`

## PostsCarousel (src/components/PostsCarousel.vue)

- Uses Swiper with A11y module for keyboard navigation
- Smart loading: first 3 slides eager, rest lazy
- Loading skeleton UI
- Hardware acceleration with `will-change`

## SvgIcon Component

```vue
<SvgIcon name="arrow-right" />
<!-- Loads from /images/common/arrow-right.svg -->
```

## Form Validation (ContactForm.vue)

- VeeValidate + @vee-validate/zod
- ARIA `aria-invalid` and `aria-describedby` for errors
- Screen reader announcements via `role="alert"`

## Animation Utilities Ready (src/utils/animations.ts)

Centralized @vueuse/motion configs exist but aren't integrated:

- `fadeIn`, `fadeInUp`, `fadeInDown`
- `slideInLeft`, `slideInRight`
- `scaleIn`, `staggerContainer`

Integration opportunity: Could enhance reveal directive or create motion components.
