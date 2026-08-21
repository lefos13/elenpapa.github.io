# NPM Commands

## Development

- `npm install` – Install dependencies
- `npm run dev` – Start Vite dev server with HMR
- `npm run preview` – Serve production build locally

## Building

- `npm run build` – Type-check + Vite production build
- `npm run build-only` – Vite build without type-check
- `npm run type-check` – vue-tsc strict TS validation

## Code Quality

- `npm run lint` – ESLint with --fix + cache
- `npm run format` – Prettier write for all supported files
- `npm run prepare` – Reinstall Husky hooks (after fresh clone)

## Analysis

- After `npm run build`, check `dist/stats.html` for bundle visualization

## Lighthouse Audit

1. `npm run build`
2. `npm run preview`
3. Open Chrome DevTools → Lighthouse tab
4. Run audit for Performance, Accessibility, Best Practices, SEO
5. Target: ≥90 all categories
