# Spec: Backoffice UI Enhancements

## Assumptions
1. The backoffice is a client-side vanilla JavaScript modular application (`backoffice/public/`) with no external bundler at runtime; all scripts run as native browser ES modules (`type="module"`).
2. The backoffice backend serves both local development (`backoffice/server/` on port 4310) and Vercel serverless functions (`server/` + `api/index.js`).
3. No breaking changes to existing REST endpoints (`/api/files`, `/api/git/*`, `/api/images`, `/api/auth/*`) or JSON schemas (`public/content/*.json`).
4. Modern evergreen browser targets (Chromium, Firefox, Safari) with support for CSS custom properties, CSS Grid/Flexbox, HTML5 Drag and Drop, and Web APIs.
5. All local changes must be kept uncommitted for local review and testing by the human engineer.

## Objective
Elevate the Portfolio Backoffice from a basic utility interface into a professional, intuitive, and accessible Content Management System. Enhance visual hierarchy, editorial workflow efficiency, media management, diff review visibility, and theme flexibility while preserving zero runtime external dependencies and full backward compatibility.

## Tech Stack
- **Frontend Core**: Vanilla ES2022 JavaScript, DOM API, Native Web Components / Template Elements
- **Styling**: Modern CSS3 with CSS Custom Properties, Flexbox, CSS Grid, Media Queries (`prefers-color-scheme`, `prefers-reduced-motion`)
- **Backend API**: Node.js 20+ HTTP built-ins (local) / TypeScript serverless handlers (Vercel)
- **Validation**: Zod 3.25+ runtime schemas for content integrity
- **Image Optimization**: Sharp + custom WebP optimizer pipeline

## Commands
```sh
# Start local backoffice server
npm run backoffice

# Run automated server and session test suite
npm test

# Check TypeScript types
npm run type-check

# Run ESLint validation
npm run lint

# Format codebase
npm run format

# Run full production build
npm run build
```

## Project Structure
```text
backoffice/
├── public/
│   ├── index.html                      # HTML shell with layout, modals, templates
│   ├── styles.css                      # Semantic design tokens, themes, component styling
│   └── js/
│       ├── main.js                     # Bootstrap entrypoint
│       ├── app.js                      # Central orchestration & event bus
│       ├── api.js                      # Typed HTTP client
│       ├── dom.js                      # Cached DOM element selectors
│       ├── state.js                    # Reactive state store
│       ├── constants.js                # Schema templates & file categorization
│       ├── utils.js                    # Shared utilities
│       ├── app/
│       │   ├── shortcuts.js            # Global keyboard shortcut registry & Command Palette
│       │   ├── ui-status.js            # Status strip & session indicators
│       │   ├── draft-recovery.js       # LocalStorage auto-save & recovery
│       │   ├── session-changes.js      # Staged changes tracking
│       │   ├── semantic-summary.js     # Field-level diff generator
│       │   ├── toasts.js               # Toast notification manager
│       │   └── theme.js                # Light/Dark/System theme controller
│       ├── features/
│       │   ├── content/
│       │   │   ├── guided-editor.js    # Form-based editor with drag-and-drop & toolbar
│       │   │   └── markdown-toolbar.js # Textarea formatting & counter utilities
│       │   ├── images/
│       │   │   ├── library.js          # Media library gallery & lightbox
│       │   │   └── media-picker.js     # Modal media asset selector
│       │   └── review/
│       │       └── visual-diff.js      # Side-by-side JSON & visual diff view
│       ├── views/
│       │   ├── content-editor.js       # Tree-view & guided-view container
│       │   └── images-library.js       # Images section view container
│       └── schemas/
│           └── definitions.js          # Field helpers & UI schema templates
docs/
└── backoffice-ui-spec.md               # Living specification document
```

## Code Style & Conventions
- Pure Vanilla ES Modules (`import`/`export`), no build step required for `backoffice/public/`.
- Clear, descriptive JSDoc block comments explaining "Why this exists".
- Immutable state updates where possible; single source of truth in `state.js` & `session-changes.js`.
- Semantic HTML tags (`<dialog>`, `<aside>`, `<main>`, `<header>`, `<section>`, `<button>`).
- BEM / modular CSS class naming (`.guided-section`, `.guided-section__header`, `.is-active`, `.is-collapsed`).
- CSS variables for all colors, dimensions, borders, and shadows.

```js
/**
 * Why this exists:
 * The theme controller manages light/dark/system appearance with localStorage
 * persistence to support comfortable editing across different lighting conditions.
 */
export function createThemeController({ rootElement = document.documentElement } = {}) {
  const THEME_KEY = 'backoffice:theme'
  // ...
}
```

## Testing Strategy
- **Unit & Integration Tests**: `server/__tests__/*.test.ts` executed via `npm test`.
- **Type Checking**: `vue-tsc --build` via `npm run type-check`.
- **Linting**: ESLint 9+ via `npm run lint`.
- **Visual & Behavioral Verification**: Browser-driven verification using Paseo browser / DevTools across viewports (1280px, 1024px, 768px, 375px) and color schemes (light, dark).

## Boundaries
- **Always do**:
  - Maintain full backward compatibility with existing JSON schemas and API contracts.
  - Run linting, type-checking, and test suite to ensure zero regressions.
  - Honor `prefers-reduced-motion` for all transitions and animations.
  - Keep all changes uncommitted in the local working directory for human inspection.
- **Ask first**:
  - Modifying existing backend API route contracts or response signatures.
  - Adding external runtime npm dependencies to `backoffice/public/`.
- **Never do**:
  - Run `git commit`, `git push`, or alter git history.
  - Break existing draft recovery or serverless publish workflows.
  - Use hardcoded inline styles when CSS custom properties are available.

## Success Criteria
1. **Theme System**: Seamless toggle between Light, Dark, and System modes with persistent preference; all panels, inputs, modals, and toasts render with WCAG AA compliant contrast.
2. **Categorized Navigation**: Sidebar presents 3 clear groups (*Pages & Site*, *Portfolio & Works*, *Editorial & Content*) with quick search filter (`/` hotkey), unsaved dirty indicators (`[●]`), and a collapsible sidebar rail.
3. **Enhanced Guided Editor**:
   - Drag-and-drop handles for reordering array items.
   - Markdown formatting toolbar for multi-line text fields with character/word counters.
   - Field-level revert button restoring original saved value for individual modified fields.
4. **Media Asset Management**:
   - Drag-and-drop file upload directly onto image dropzones.
   - "Choose from Media Library" modal picker for reusing existing assets.
   - Full-resolution image zoom lightbox.
5. **Power Tools & Publishing UX**:
   - Global Command Palette (`Cmd+K` / `Ctrl+K`) for fast file switching, actions, and theme toggle.
   - Side-by-side visual diff modal displaying clean green/red field modifications before finalization.
6. **Code Quality**: All tests pass (`npm test`), type check passes (`npm run type-check`), and ESLint passes (`npm run lint`).
