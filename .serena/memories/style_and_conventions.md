# Style & Coding Conventions

## TypeScript & Vue

- Use `<script setup lang="ts">` with Composition API
- Import via `@` alias for src paths
- All content via `public/content/*.json` + `src/services/content.ts` typed getters
- Prefer `useContent` composables for loading states over direct `getX()` calls

## Styling

- CSS variables in `src/styles/variables.css` (light gray + lilac palette)
- Component styles: `src/styles/components/*.css` imported with `<style scoped src="...">`
- View styles: `src/styles/views/*.css`
- Shared styles → `src/styles/base.css`
- WCAG AA compliant contrast ratios

## Animations

- IntersectionObserver reveal directive (`src/directives/reveal.ts`)
- GSAP for Header bubble animation (desktop only)
- All animations respect `prefers-reduced-motion`
- @vueuse/motion configs in `src/utils/animations.ts` (ready but not integrated)

## Formatting

- Prettier: no semicolons, single quotes, printWidth 100
- ESLint: flat config with vue/essential rules
- Run `npm run lint`, `npm run type-check`, `npm run build` before PRs
- Husky + lint-staged pre-commit hooks

## SVG Icons

- Never inline SVG in components
- Extract to `public/images/common/`
- Reference via `<img>` or `SvgIcon.vue`

## Content Changes

1. Update JSON in `public/content/`
2. Update Zod schema in `src/services/content.ts`
3. Wire via service or useContent composable
