# Skills audit — 2026-10-25

- **Repository**: `lefos13/elenpapa.github.io`
- **Branch**: `skills-audit/2026-10-25`
- **Base commit**: `2cd87e5` (`Merge pull request #5 from lefos13/ui-backoffice-2026-09-27-9fr1`)
- **Freshness**: `origin/main` was re-fetched at the end of the work and remains at `2cd87e5`; no rebase was needed.
- **Skills applied**: `seo-audit`, `schema`, `ai-seo`, `make-interfaces-feel-better`, `break-ui`, `cro`, `security-and-hardening`, `claude-md-improver`.
- **Scope**: SSG output, metadata, schema, discovery files, public UI, backoffice UI, server/API security, agent docs. The owner's bio, project copy, and article text were not rewritten.

## Executive summary

The two highest-impact problems were not visible in day-to-day development:

1. **Every page shipped empty JSON-LD.** Unhead rendered `children` as an HTML attribute, so all structured data was inert.
2. **Vercel served the homepage for every clean URL.** A catch-all rewrite sent `/timeline`, `/book`, and `/posts/0` to `index.html`, so production returned the homepage title and canonical for every route.

Those are fixed, together with a production auth bypass (known defaults), unauthenticated admin reads, draft leakage, a critical Swiper advisory, and several UI resilience defects. The public site now emits valid `WebSite`/`Person`/`ProfilePage`, `BlogPosting`, `Book`, `CollectionPage`, `CreativeWork`, `ItemList`, and `BreadcrumbList` data, and local builds render nine public pages instead of fifteen (including six empty draft pages).

## Findings ranked by impact

### P0 — Critical

| #   | Area        | Finding                                                                                                                                                   | Evidence                                                                                                                                                                                             | Status                                                                                                                                             |
| --- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Schema      | JSON-LD scripts were rendered as `<script type="application/ld+json" children="…">` with no script body. Search engines received no structured data.      | Pre-fix `dist/index.html`; `usePageSeo.ts` and `TimelinePage.vue` used `children`.                                                                                                                   | **Fixed** — switched to `textContent`; build now parses on all pages.                                                                              |
| 2   | Routing/SEO | Vercel's `/((?!api                                                                                                                                        | …).\*) → /index.html`rewrite served the homepage HTML for every clean path. Live`/timeline`and`/posts/0`returned`<title>…Επιμέλεια, Διόρθωση, Μετάφραση</title>`and canonical`https://editopia.gr/`. | Read-only `curl` against the live site on 2026-10-25.                                                                                              | **Fixed in config** — `cleanUrls: true`, catch-all removed. Deployment verification pending. |
| 3   | Security    | Production accepted `ADMIN_PASSWORD=admin` and a hard-coded fallback `AUTH_SECRET`, allowing account takeover and JWT forgery when env vars were missing. | `server/config.ts`, `server/auth.ts`.                                                                                                                                                                | **Fixed** — production now fails closed with `503` until a 32+ char secret and non-default password/hash are configured. Verified with `VERCEL=1`. |

### P1 — High

| #   | Area         | Finding                                                                                                                                                                                                                                                   | Evidence                                   | Status                                                                                                                                                             |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4   | Security     | `GET /api/files`, `/api/files/:file`, `/api/schemas/:id`, `/api/validate/:file`, `/api/git/status`, `/api/git/preview`, and `/api/session/summary` were readable without a session. Reads used the server's GitHub token and exposed repository metadata. | Handler review.                            | **Fixed** — all admin data endpoints now require `backoffice_session`; tests cover 401s.                                                                           |
| 5   | SEO/privacy  | Six `devOnly` posts were SSG-rendered as empty pages (`/posts/4`–`/posts/9`, ~7 KB each). Their titles, summaries, and HTML paths also shipped in `public/content/posts.json`.                                                                            | `dist/posts/4.html` pre-fix; `posts.json`. | **Fixed** — SSG routes are derived from non-`devOnly` posts; `prune-drafts` blanks draft entries and deletes draft HTML in `dist` without shifting public indexes. |
| 6   | On-page SEO  | Post pages had no `Article`/`BlogPosting` schema, no breadcrumbs, and post 0 had two `<h1>` elements (page title + article body). The timeline page had no `<h1>`.                                                                                        | Built HTML.                                | **Fixed** — `BlogPosting` + `BreadcrumbList`, visible post breadcrumbs, content `<h1>` demoted to `<h2>`, timeline heading promoted to `<h1>`.                     |
| 7   | Dependencies | `npm audit --omit=dev` reported 1 critical (Swiper prototype pollution), 18 high, 26 total.                                                                                                                                                               | `npm audit --omit=dev` before remediation. | **Partially fixed** — Swiper 12.2, Vue 3.5.44, unhead 2.1.17. Now 0 critical / 13 high / 19 total; remaining are dev tooling, `sharp`, and unfixed zod 3.          |
| 8   | Backoffice   | `npm run backoffice` crashed on a fresh checkout with `ENOENT: .env`; narrow layouts overflowed horizontally (47 px at 375 px).                                                                                                                           | Browser + server start.                    | **Fixed** — missing `.env` is ignored; toolbar wraps; long file names truncate; workspace can shrink.                                                              |

### P2 — Medium

| #   | Area             | Finding                                                                                                                                                                                                                                                              | Evidence                                                                   | Status                                                                                                                                                               |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | Performance      | Responsive variant checks downloaded each candidate with `new Image()`, then the real `<img>` downloaded it again. SSR srcsets were empty because vite-ssg mocks `window`, so the helper took the client path; encoded paths (spaces) also failed filesystem checks. | Home performance entries showed base + variant requests (≈2.2 MB initial). | **Fixed** — `import.meta.env.SSR` check, decoded filesystem paths, HEAD probes, and awaited SSG resolution. Initial home transfer dropped to ≈865 KB in a fresh tab. |
| 10  | UI resilience    | Long titles/names could overflow cards, breadcrumbs, contact link, and backoffice toolbar; missing images produced broken-image icons; an empty carousel still showed controls.                                                                                      | Browser stress test at 375 px with long strings and a missing image.       | **Fixed** — `min-width: 0`, `overflow-wrap`, truncation, placeholders, empty state.                                                                                  |
| 11  | Metadata         | Painted-books meta description was 365 characters; short post titles were just the post title; post descriptions exceeded 160 chars.                                                                                                                                 | Built HTML measurements.                                                   | **Fixed** — 125-char description, conditional brand suffix, 158-char post description cap.                                                                           |
| 12  | Crawl control    | `robots.txt` allowed `/admin`, `/backoffice`, `/api`, and raw `/content`; no `X-Robots-Tag` on those paths. `llms.txt` linked the raw content directory and was stale.                                                                                               | `public/robots.txt`, `llms.txt`, `vercel.json`.                            | **Fixed** — disallow + `noindex` headers; refreshed `llms.txt` with public pages, services, articles, contact.                                                       |
| 13  | CRO              | On mobile, the painted-books hero image came before the H1; the first viewport contained no value proposition.                                                                                                                                                       | 375 px screenshot.                                                         | **Fixed** — copy first and image height capped on ≤1024 px.                                                                                                          |
| 14  | Interface polish | Undefined design tokens (`--radius-xl`, `--color-text-secondary`, `--color-primary-400`), `transition: all`, no macOS font smoothing, no `text-wrap` balance/pretty, no press feedback.                                                                              | CSS review.                                                                | **Fixed** — tokens defined, specific transitions, antialiasing, text wrapping, `scale(0.96)` press state.                                                            |
| 15  | Accessibility    | Timeline had no H1; logo alt was "Site logo"; skip link/nav labels were English on a Greek page; contact link had no visible focus style.                                                                                                                            | Built HTML, source.                                                        | **Fixed** — Greek labels, descriptive logo alt, contact focus ring, section `aria-labelledby`.                                                                       |

## Fixes and commits

| Commit    | Summary                                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cfe6ac4` | `fix(seo): render JSON-LD and complete page schemas` — `textContent`, `ProfilePage`/`BlogPosting`/`BreadcrumbList`, Moonlight `CollectionPage`, single H1, post breadcrumbs, concise metadata. |
| `7eeb41b` | `fix(build): serve SSG routes and keep drafts out of production` — `cleanUrls`, catch-all removal, non-draft SSG routes, draft pruning, robots/llms discovery.                                 |
| `5d5c37f` | `fix(security): fail closed in production and protect admin reads` — auth config guard, login body cap, session requirements on read endpoints, tests, rebuilt `api/index.js`.                 |
| `450012f` | `fix(ui): reset mobile header, harden long content, and cut image probes` — mobile bubble reset, text wrapping/truncation, image fallbacks, SSG srcsets, backoffice responsive fixes.          |
| `8c5792d` | `docs: add canonical AGENTS.md and correct stale setup notes`.                                                                                                                                 |
| `d97da4d` | `chore(build): keep generated OG manifest stable`.                                                                                                                                             |
| `c4a654a` | `fix(security): patch critical Swiper and vulnerable Vue/unhead`.                                                                                                                              |

The user-reported regression where the desktop GSAP bubble survived a resize into the mobile layout is fixed in `450012f` and re-verified: after resizing from 1265×800 (scrolled, bubble active) to 375×812, the header class becomes `site-header`, inline geometry is cleared, and the header is full width.

## Verification

All commands were run on the final tree:

```text
npm run lint        PASS (0 errors)
npm run type-check  PASS
npm test            PASS — 58 tests, 26 suites
npm run build       PASS — 9 SSG pages; 6 devOnly drafts pruned
```

Additional checks:

- Parsed every `application/ld+json` block in the nine built pages. All are valid JSON with the intended `@type` sets; no empty scripts remain.
- Every built page has one `<title>`, one canonical, one `<h1>`, and unique `description`/OG/Twitter tags.
- `public/sitemap.xml` contains 9 canonical URLs (5 pages + 4 public posts); `robots.txt` disallows admin/API/content and references the sitemap.
- Browser checks at 375, 768, 1024, and 1265 px: no horizontal overflow on public pages; mobile menu opens/close with focus trap; carousel initializes with 4 slides after the Swiper update; long injected strings wrap or truncate; missing image falls back to the shared placeholder.
- Backoffice at 375/768 px: no horizontal overflow after the toolbar/workspace fixes; login and file list work locally with the dev password.
- Production auth guard: `VERCEL=1` with defaults returns `503 Authentication is not configured…`; with a 32-char secret and non-default password it returns `null` (configured).
- `npm audit --omit=dev`: 26 → 19 vulnerabilities (1 critical → 0; 18 high → 13 high). Remaining items are triaged below.

Not verified because it requires deployment: Vercel `cleanUrls` routing. The live site still runs the old routing until the branch is deployed; local `vite preview` does not emulate Vercel rewrites.

## Deferred recommendations

### Top 5

1. **Replace the mailto-only contact block with a real conversion path.** A form (or a serverless email/CRM endpoint) with response-time expectations, a short “what happens next”, and trust signals would remove the biggest CRO gap. Keep the email link as a fallback. This needs copy from the owner, so it was not implemented.
2. **Prune the image surface.** `public/images` is 110 MB and `dist` is 51 MB. Several multi-megabyte originals are unreferenced (for example `public/images/posts/Article.png`, `Article (2).png`, `intro.png`) while their `.webp` variants are what the site uses. Add a build-time “only referenced assets” step or move originals out of `public/`; verify with a crawl before deleting.
3. **Add shared-store login rate limiting and stronger password hashing.** The current login has no limiter. An in-memory limiter would be ineffective on serverless; use Upstash/Redis or Vercel KV. `ADMIN_PASSWORD_HASH` is a single SHA-256 digest; prefer scrypt/argon2 with a per-install salt and a migration path.
4. **Sanitize or disallow SVG uploads.** SVG is passed through unchanged by `server/image-processor.ts`. Even though uploads require an admin session, a same-origin SVG can execute script when opened directly. Run SVGO/sanitize on upload or restrict SVG to trusted logo fields.
5. **Add real publish dates and use them in `BlogPosting`.** `posts.json` has no date fields, so the Article schema intentionally omits `datePublished`/`dateModified` and Google cannot show article rich results. Add dates to content (owner input), then expose them in schema and bylines.

### Larger items

- **CSP and privacy:** there is no Content-Security-Policy; GA4 loads unconditionally with inline configuration. Add consent handling for EU visitors and a CSP that permits the existing GA/Instagram embeds (nonce or hash for the inline script).
- **Article content trust:** post HTML and `instagramEmbedHtml` are rendered with `v-html`. They are owner/admin-authored, not public input, but a compromised admin session becomes stored XSS. Sanitize on save or at render.
- **Draft visibility:** `prune-drafts` removes drafts from the deployed JSON/HTML, but the local backoffice and Git history still contain them. If drafts must be private from repository readers, move them to a non-public directory or a private CMS store.
- **Sitemap accuracy:** `lastmod` is the build date for every URL. Use per-file modification dates or omit `lastmod` when it cannot be trusted.
- **Font preload fragility:** `index.html` hard-codes hashed `@fontsource` filenames. A dependency update changes the hashes and silently breaks the preloads; generate the preload links from the build manifest.
- **Dependency follow-up:** remaining high advisories are mostly build/dev-tooling (`vite`, `rollup`, `postcss`, `@vercel/node` chain), `sharp` (requires 0.35, breaking), and `zod` 3 (no fix; zod 4 is a breaking upgrade). Triage by reachability before forcing upgrades.
- **API error detail:** several handlers still return upstream GitHub/filesystem error messages in 500 responses. Genericize them and log the detail server-side.
- **Docs drift:** `docs/status.md` still describes JSON as build-time bundled and claims 64 tests; the current pipeline fetches JSON at runtime and runs 58 tests. `AGENTS.md` is now the accurate source.

## Known content gaps (owner input, not code)

- Four timeline entries have empty `cover` paths and render the shared placeholder (for example “Η Τελευταία Αποστολή Τόμος B'”, “Ίσως τώρα να είναι αλλιώς”, “Μάθε να τολμάς”, “Game on”).
- `book.json` has an empty `about.body`; the section renders only its heading and quote.
- Draft posts 4–9 remain in source under `devOnly` and are intentionally unavailable in production.
