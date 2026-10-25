# AGENTS.md

Project context for coding agents working on **elenpapa.github.io** (editopia.gr): a Greek-language Vue 3 portfolio with a static site build and a Git-backed CMS.

## Commands

```bash
npm ci                 # install from package-lock.json
npm run dev            # Vite dev server
npm run backoffice     # local CMS UI on http://127.0.0.1:4310
npm test               # Node test runner (server/__tests__/*.test.ts)
npm run type-check     # vue-tsc --build
npm run lint           # ESLint with --fix (may rewrite files)
npm run build          # API bundle, OG images, sitemap, SSG, type-check, copy backoffice
```

`npm run build` runs: `build:api` → `generate-og` → `generate-sitemap` → `type-check` + `vite-ssg build` → `copy-backoffice`. Individual steps are available as `build:api`, `generate-og`, `generate-sitemap`, `build:ssg`.

## Architecture

```
src/
  components/          public Vue sections (Header, Hero, Timeline, Services, Posts, Contact…)
  views/               route-level pages; each sets SEO via usePageSeo/useHead
  composables/         usePageSeo, useHeaderAnimation, useContent
  services/content.ts  Zod schemas + runtime fetch/cache for public/content/*.json
  styles/              variables, base, components/, views/
  router/index.ts      routes; HomePage eager, all others lazy
public/
  content/             site content JSON + rendered post HTML (posts/N.html)
  images/              source and generated responsive/OG images
  robots.txt, sitemap.xml, llms.txt
server/                Vercel API source (auth, GitHub, images, validation)
api/index.js           committed esbuild bundle of server/ (regenerate with build:api)
backoffice/            standalone local CMS UI + Node server
scripts/               sitemap, OG images, image optimisation
```

## Content pipeline

- Content lives in `public/content/*.json`. Components fetch it at runtime through `src/services/content.ts`, which validates with Zod and caches in memory.
- When changing content shape: update JSON **and** the matching Zod schema in `src/services/content.ts` **and** the editor schema in `server/schemas.ts`.
- Post bodies live in `public/content/posts/N.html`; `posts.json` controls order and `devOnly` visibility.
- `devOnly: true` posts are filtered from the carousel, SSG route generation, sitemap, and llms.txt. Do not add them to public navigation.
- The site owner's bio, project texts, and post copy are content, not code. Do not rewrite them while doing structural/SEO work.

## SSG and SEO

- `vite.config.ts` builds static routes plus concrete post routes read from `posts.json`; only non-`devOnly` posts are rendered.
- `vercel.json` uses `cleanUrls` so `/timeline` serves `timeline.html`. Do not re-add a catch-all rewrite to `index.html`; it makes every route return the homepage HTML.
- `scripts/prune-drafts.js` (postbuild) blanks draft entries in `dist/content/posts.json` and deletes their built HTML without shifting public post indexes.
- `scripts/generate-sitemap.js` writes `public/sitemap.xml`; keep it filtered to canonical, indexable URLs.
- Page metadata is set with `usePageSeo` (`src/composables/usePageSeo.ts`). JSON-LD must use `textContent`, not `children` — unhead renders `children` as an attribute.
- `scripts/generate-og-images.js` writes 1200×630 images to `public/images/og/`.
- `public/llms.txt` is maintained manually; update it when public pages/articles change.
- Raw `/content/`, `/admin`, `/backoffice`, and `/api` are excluded from indexing via `robots.txt` and `X-Robots-Tag` in `vercel.json`.

## API / backoffice security

- `server/` is bundled to `api/index.js` (committed). After changing server code run `npm run build:api`; Vercel serves the bundle.
- All content, image, schema, validation, git status/preview, and finalize endpoints require a valid `backoffice_session` cookie. Only `/api/auth/login`, `/api/auth/logout`, and `/api/auth/session` are public.
- Production auth fails closed: set `AUTH_SECRET` (32+ random characters) and `ADMIN_PASSWORD` or a 64-char SHA-256 `ADMIN_PASSWORD_HASH`. The development defaults (`admin` / built-in secret) are rejected when `VERCEL=1` or `NODE_ENV=production`.
- Never commit `.env` files or real tokens. Required deployment variables are documented in `README.md`.
- Uploads are base64 JSON, capped at 12 MB, and raster images are converted to WebP in memory. SVG uploads pass through unchanged; treat SVG as untrusted.
- Do not call the production backoffice or GitHub API with write credentials while testing. Local `npm run backoffice` writes to `public/content` only when you explicitly save.

## Conventions and gotchas

- `<script setup lang="ts">`, Composition API, `@/` alias.
- Component styles live in `src/styles/components` or `src/styles/views` and are imported with `<style scoped src="...">`; shared tokens in `src/styles/variables.css`.
- SVG icons live in `public/images/common` and render through `SvgIcon.vue`; do not inline new SVG markup.
- Animations respect `prefers-reduced-motion`; the reveal directive is `src/directives/reveal.ts`.
- Responsive image candidates are resolved with `src/utils/responsive-srcset.ts`. Use `import.meta.env.SSR` for SSR checks: vite-ssg mocks `window`, so `typeof window` alone is not reliable.
- `npm run lint` uses `--fix`; run it separately and inspect its diff before committing.
- Tests are Node's built-in runner over `server/__tests__/*.test.ts`. There is no component/E2E suite yet.
- `docs/status.md` and `docs/seo-implementation.md` contain historical notes; verify current behaviour against code before repeating claims.

## Deployment

Vercel runs the SSG build and serves `api/index.js` as one catch-all function. Required env vars: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `ADMIN_PASSWORD`, `AUTH_SECRET`; optional `GITHUB_BRANCH`, `BACKOFFICE_CREATE_PR_ON_FINALIZE`. The CMS stages edits in the browser and commits a review branch + PR on finalize.
