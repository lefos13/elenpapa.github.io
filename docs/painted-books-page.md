# Painted Books Page Documentation

## Overview

Added a new dedicated page showcasing custom painted book edges artwork. The page follows the same design principles and patterns as existing pages (BookPage and MoonlightPage).

## Files Created

### Content

- `public/content/painted-books.json` - Content data for the page including:
  - Hero section with title, subtitle, description, and main image
  - About section with stats (50+ books painted, 100% handmade, 3-5 hours per book)
  - Process section with 4 steps (preparation, sketching, painting, details)
  - Gallery section with 6 example books featuring different themes
  - Commission info section with features and pricing note
  - CTA section with buttons

### Components

- `src/views/PaintedBooksPage.vue` - Main page component
  - Uses composition API with `<script setup>`
  - Fetches content from the typed content service
  - Responsive sections with reveal animations
  - Semantic HTML with proper ARIA labels

### Styles

- `src/styles/views/painted-books-page.css` - Page-specific styles
  - Consistent with existing design language (light gray + lilac palette)
  - Semi-transparent backgrounds with glow effects
  - Responsive grid layouts (3 columns → 2 → 1)
  - Hover effects with reduced motion support
  - Mobile-first approach with breakpoints at 768px and 1024px

### Configuration Updates

- `src/services/content.ts` - Added:
  - `PaintedBooksContentSchema` Zod schema for validation
  - `PaintedBooksContent` TypeScript type
  - `getPaintedBooks()` content getter method

- `src/router/index.ts` - Added:
  - Route: `/painted-books`
  - Component: `PaintedBooksPage`

- `public/content/site.json` - Added navigation item:
  - Label: "Ζωγραφισμένα βιβλία"
  - Placed between Moonlight Tales and Timeline

- `vite.config.ts` - Fixed:
  - Removed reference to unused `embla-carousel-vue` package

## Design Features

### Color Palette

- Hero: Linear gradient from `#fdfbff` to `#f3eaff`
- About: Base background color (`--color-bg`)
- Gallery: Light lilac background `#f8f5fc`
- CTA: Gradient from `#faf8ff` to `#e8deff`

### Visual Elements

- **Glow Effects**: Semi-transparent lilac backplates behind images
- **Process Steps**: Numbered circles with gradient backgrounds
- **Gallery Cards**: Hover transforms with shadow transitions
- **Stats Cards**: White cards with lilac borders

### Responsive Behavior

- **Desktop (>1024px)**: 2-column hero/about/cta layouts, 3-column gallery, 2-column process
- **Tablet (768-1024px)**: Single column layouts, 2-column gallery
- **Mobile (<768px)**: Single column everything

## Content Structure

### Gallery Books

1. The Name of the Rose - Medieval monastery theme
2. Pride and Prejudice - Romantic landscape with Victorian elements
3. The Lord of the Rings - Fantasy landscape with Mount Doom
4. The Secret History - Dark academia with classical motifs
5. One Hundred Years of Solitude - Magical realism with tropical elements
6. The Likeness - Mystery with noir aesthetic

### Process Steps

1. **Preparation**: Securing the book in clips
2. **Sketching**: Light pencil design
3. **Painting**: Acrylic application in layers
4. **Details**: Final touches with pens and small brushes

## Images Required

A placeholder directory was created at `public/images/painted-books/` with a README explaining the needed images:

- `hero-painted-book.png` (1200x800px recommended)
- `book-1.png` through `book-6.png` (800x600px recommended)

## Accessibility

- Semantic HTML5 elements (`<main>`, `<section>`, `<article>`)
- Proper heading hierarchy (h1 → h2 → h3)
- Alt text for all images (avoiding redundant "image" word per ESLint rules)
- Reveal animations with `v-reveal` directive
- `prefers-reduced-motion` support (disables transforms and blur filters)

## Performance

- Images use `loading="lazy"` (except hero which uses `loading="eager"`)
- CSS scoped to component with external stylesheet
- Follows same optimization patterns as other pages
- Content validated with Zod at runtime

## Integration Notes

- Added to navigation in site.json
- Follows same routing pattern as other pages
- Uses same diagonal section dividers as BookPage and MoonlightPage
- Reuses button styles (`.primary-button`, `.ghost-button`)

## Testing Checklist

- ✅ TypeScript compilation passes
- ✅ ESLint passes with no errors
- ✅ Production build succeeds
- ⚠️ Placeholder images need to be replaced with actual photos
- ⚠️ Test responsive layouts at all breakpoints
- ⚠️ Test with screen readers for accessibility
- ⚠️ Run Lighthouse audit for performance/accessibility scores
