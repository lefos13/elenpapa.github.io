# Task Completion Checklist

Before marking a task complete:

## Content

- [ ] New/updated copy lives in `public/content/*.json`
- [ ] Zod schema updated in `src/services/content.ts` if structure changed
- [ ] Component wired via service or `useContent` composable (no stray literals)

## Code Quality

- [ ] `npm run lint` passes
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] `npm run format` if files changed outside lint-staged patterns

## Accessibility

- [ ] Animations respect `prefers-reduced-motion`
- [ ] Interactive elements have proper ARIA labels
- [ ] Focus management preserved (especially Header mobile menu)

## Documentation

- [ ] Update `docs/status.md` when scope/plan items shift
- [ ] Note any new placeholder content that needs replacement

## Pre-commit

- [ ] Husky + lint-staged hook succeeds
- [ ] No console errors in dev mode
