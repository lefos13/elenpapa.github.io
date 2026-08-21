# Content Pipeline Patterns

## Zod Schema + Type Inference

```typescript
// In src/services/content.ts
const SiteSchema = z.object({
  title: z.string(),
  // ... fields
})
type Site = z.infer<typeof SiteSchema> // Auto-inferred type

// Typed getter with caching
const siteCache: Site | null = null
export async function getSite(): Promise<Site> {
  if (siteCache) return siteCache
  const response = await fetch('/content/site.json')
  const data = await response.json()
  return SiteSchema.parse(data) // Runtime validation
}
```

## Loading States via Composables

```typescript
// In src/composables/useContent.ts
export function useSite() {
  return useAsyncState(getSite, null)
}

// In component
const { state: site, isLoading, error } = useSite()
```

## Best Practice: Prefer Composables

- Use `useContent` composables for consistent loading/error handling
- Direct `getX()` calls acceptable in `onMounted` but composables preferred
- All content changes flow: JSON → Zod schema → Service → Component

## Content Files

- `public/content/site.json` - Global site metadata
- `public/content/home.json` - Homepage hero/intro content
- `public/content/timeline.json` - Book timeline entries
- `public/content/services.json` - Service cards
- `public/content/posts.json` - Blog posts carousel
- `public/content/contact.json` - Contact form labels
- `public/content/book.json` - Individual book page
- `public/content/moonlight.json` - Moonlight page
- `public/content/painted-books.json` - Painted books gallery
- `public/content/publishers.json` - Publisher logos
