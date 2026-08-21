/**
 * Why this exists:
 * Centralized Zod schema validation and editor schema metadata builders for all
 * content JSON files. Shared across serverless API endpoints and backoffice editing views.
 */

import path from 'node:path'
import { z } from 'zod'
import { FILE_USAGE_REFERENCES } from './config'

// ============================================================================
// 1. Shared Sub-Schemas
// ============================================================================

export const NavItemSchema = z.object({
  label: z.string(),
  href: z.string(),
})

export const SocialItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  icon: z.string(),
})

// ============================================================================
// 2. Content File Schemas
// ============================================================================

export const SiteContentSchema = z.object({
  seo: z.object({
    siteUrl: z.string(),
    defaultImage: z.string(),
    siteName: z.string(),
    locale: z.string(),
    author: z.string().optional(),
    pages: z
      .object({
        home: z
          .object({
            title: z.string(),
            description: z.string(),
            image: z.string(),
            path: z.string(),
          })
          .optional(),
        timeline: z
          .object({
            title: z.string(),
            description: z.string(),
            image: z.string(),
            path: z.string(),
          })
          .optional(),
        book: z
          .object({
            title: z.string(),
            description: z.string(),
            image: z.string(),
            path: z.string(),
          })
          .optional(),
        moonlight: z
          .object({
            title: z.string(),
            description: z.string(),
            image: z.string(),
            path: z.string(),
          })
          .optional(),
        paintedBooks: z
          .object({
            title: z.string(),
            description: z.string(),
            image: z.string(),
            path: z.string(),
          })
          .optional(),
      })
      .optional(),
  }),
  logo: z.object({
    src: z.string(),
    alt: z.string(),
  }),
  nav: z.array(NavItemSchema),
  socials: z.array(SocialItemSchema),
  footer: z.object({
    copyright: z.string(),
    developer: z.string(),
  }),
})

export const HomeContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    subtitle: z.string(),
    cta: z
      .object({
        label: z.string(),
        href: z.string(),
      })
      .optional(),
    backgroundImage: z.string(),
  }),
  intro: z.object({
    title: z.string(),
    text: z.string(),
    image: z.object({
      src: z.string(),
      alt: z.string(),
    }),
  }),
  education: z
    .array(
      z.object({
        degree: z.string(),
        institution: z.string(),
        year: z.string(),
        icon: z.string().optional(),
      }),
    )
    .optional(),
})

export const TimelineItemSchema = z.object({
  year: z.number(),
  title: z.string(),
  cover: z.string(),
  blurb: z.string(),
  actions: z.string(),
})

export const TimelineContentSchema = z.object({
  items: z.array(TimelineItemSchema),
})

export const ServiceItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  focus: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  icon: z.string().optional(),
  image: z
    .object({
      src: z.string(),
      alt: z.string(),
    })
    .optional(),
})

export const ServicesContentSchema = z.object({
  heading: z.string().optional(),
  description: z.string().optional(),
  items: z.array(ServiceItemSchema),
})

export const PostItemSchema = z.object({
  title: z.string(),
  image: z.string(),
  url: z.string(),
  summary: z.string(),
  contentHtml: z.string(),
  devOnly: z.boolean().optional(),
})

export const PostsContentSchema = z.object({
  heading: z.string().optional(),
  description: z.string().optional(),
  items: z.array(PostItemSchema),
})

export const ContactContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  mailto: z.string(),
  emailLabel: z.string().optional(),
})

export const BookEventSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  date: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  instagramEmbedHtml: z.string().optional(),
  image: z.object({
    src: z.string(),
    alt: z.string(),
  }),
})

export const BookContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    tagline: z.string().optional(),
    cover: z.string(),
    coverAlt: z.string().optional(),
    goodreadsUrl: z.string().url().optional().or(z.literal('')),
    goodreadsLabel: z.string().optional(),
    moonlighttalesUrl: z.string().url().optional().or(z.literal('')),
    moonlighttalesLabel: z.string().optional(),
  }),
  about: z.object({
    heading: z.string(),
    body: z.string(),
    pullQuote: z.string().optional(),
    pullQuoteAriaLabel: z.string().optional(),
  }),
  eventsSection: z
    .object({
      heading: z.string(),
      subtitle: z.string().optional(),
    })
    .optional(),
  events: z.array(BookEventSchema).optional(),
  preview: z.object({
    heading: z.string(),
    lede: z.string().optional(),
    excerpt: z.string(),
    note: z.string().optional(),
    previewUrl: z.string().url().optional().or(z.literal('')),
  }),
})

export const MoonlightHeroSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  description: z.string(),
  stats: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
  media: z.object({
    primary: z.object({ src: z.string(), alt: z.string() }),
    secondary: z.object({ src: z.string(), alt: z.string() }).optional(),
  }),
})

export const MoonlightMissionSchema = z.object({
  eyebrow: z.string(),
  heading: z.string(),
  body: z.string().optional(),
  pillars: z.array(
    z.object({
      firstName: z.string(),
      lastName: z.string(),
      href: z.string(),
      image: z.object({
        src: z.string(),
        alt: z.string(),
      }),
    }),
  ),
})

export const MoonlightBubbleSchema = z.object({
  heading: z.string(),
  items: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      description: z.string().optional(),
    }),
  ),
})

export const MoonlightBookJournalSchema = z.object({
  heading: z.string(),
  description: z.string(),
  image: z.object({
    src: z.string(),
    alt: z.string(),
  }),
  instagramHighlight: z.object({
    label: z.string(),
    href: z.string(),
    thumbnailSrc: z.string(),
  }),
})

export const MoonlightReleasesSchema = z.object({
  heading: z.string(),
  description: z.string(),
  books: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      tagline: z.string(),
      genre: z.string(),
      cover: z.string(),
    }),
  ),
})

export const MoonlightCtaSchema = z.object({
  heading: z.string(),
})

export const MoonlightContentSchema = z.object({
  hero: MoonlightHeroSchema,
  mission: MoonlightMissionSchema,
  bubbles: MoonlightBubbleSchema.optional(),
  bookJournal: MoonlightBookJournalSchema.optional(),
  releases: MoonlightReleasesSchema.optional(),
  socials: z.array(SocialItemSchema).optional(),
  cta: MoonlightCtaSchema,
})

export const PaintedBooksContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    subtitle: z.string(),
    description: z.string(),
    media: z.object({
      src: z.string(),
      alt: z.string(),
    }),
  }),
  gallery: z.object({
    heading: z.string(),
    itemsPerPage: z.number().optional(),
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        author: z.string(),
        media: z.object({
          src: z.string(),
          alt: z.string(),
        }),
      }),
    ),
  }),
  cta: z.object({
    heading: z.string(),
    body: z.string(),
    buttons: z
      .array(
        z.object({
          label: z.string(),
          href: z.string(),
          variant: z.enum(['primary', 'ghost']).optional(),
        }),
      )
      .optional(),
  }),
})

export const PublishersContentSchema = z.object({
  heading: z.string(),
  description: z.string().optional(),
  items: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      logo: z
        .object({
          src: z.string(),
          alt: z.string(),
        })
        .optional(),
      services: z.array(z.string()).optional(),
    }),
  ),
})

// ============================================================================
// 3. Types and Registry Map
// ============================================================================

export type NavItem = z.infer<typeof NavItemSchema>
export type SocialItem = z.infer<typeof SocialItemSchema>
export type SiteContent = z.infer<typeof SiteContentSchema>
export type HomeContent = z.infer<typeof HomeContentSchema>
export type TimelineItem = z.infer<typeof TimelineItemSchema>
export type TimelineContent = z.infer<typeof TimelineContentSchema>
export type ServiceItem = z.infer<typeof ServiceItemSchema>
export type ServicesContent = z.infer<typeof ServicesContentSchema>
export type PostItem = z.infer<typeof PostItemSchema>
export type PostsContent = z.infer<typeof PostsContentSchema>
export type ContactContent = z.infer<typeof ContactContentSchema>
export type BookEvent = z.infer<typeof BookEventSchema>
export type BookContent = z.infer<typeof BookContentSchema>
export type MoonlightContent = z.infer<typeof MoonlightContentSchema>
export type PaintedBooksContent = z.infer<typeof PaintedBooksContentSchema>
export type PublishersContent = z.infer<typeof PublishersContentSchema>

export const CONTENT_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'book.json': BookContentSchema,
  'contact.json': ContactContentSchema,
  'home.json': HomeContentSchema,
  'moonlight.json': MoonlightContentSchema,
  'painted-books.json': PaintedBooksContentSchema,
  'posts.json': PostsContentSchema,
  'publishers.json': PublishersContentSchema,
  'services.json': ServicesContentSchema,
  'site.json': SiteContentSchema,
  'timeline.json': TimelineContentSchema,
}

// ============================================================================
// 4. Editor Metadata Configuration
// ============================================================================

interface FileSchemaOverride {
  title?: string
  description?: string
  sections?: Record<string, { label?: string; description?: string }>
}

export const FILE_SCHEMA_OVERRIDES: Record<string, FileSchemaOverride> = {
  'book.json': {
    title: 'Book Content',
    description: 'Main content for the Book page.',
    sections: {
      hero: { label: 'Hero' },
      about: { label: 'About section' },
      eventsSection: { label: 'Events intro' },
      events: { label: 'Events list' },
      preview: { label: 'Preview section' },
    },
  },
  'contact.json': {
    title: 'Contact Section',
    description: 'Contact details shown on the home page.',
  },
  'home.json': {
    title: 'Home Page Content',
    description: 'Hero, intro and education sections for the home page.',
  },
  'moonlight.json': {
    title: 'Moonlight Page',
    description: 'Full page content for the Moonlight route.',
  },
  'painted-books.json': {
    title: 'Painted Books Page',
    description: 'Hero, gallery and CTA content for painted books.',
  },
  'posts.json': {
    title: 'Posts Content',
    description: 'Posts listing and post detail feed content.',
    sections: {
      heading: { label: 'Page heading' },
      description: { label: 'Page description' },
      items: { label: 'Posts list' },
    },
  },
  'publishers.json': {
    title: 'Publishers Section',
    description: 'Publisher cards and related text content.',
  },
  'services.json': {
    title: 'Services Section',
    description: 'Service cards and highlights for home page.',
  },
  'site.json': {
    title: 'Global Site Content',
    description: 'SEO, navigation, logo and footer content used across pages.',
  },
  'timeline.json': {
    title: 'Timeline Content',
    description: 'Timeline entries shown on timeline and home carousel.',
    sections: {
      items: { label: 'Timeline items' },
    },
  },
}

const FIELD_CONTROL_OVERRIDES: Record<string, string> = {
  contentHtml: 'richtext',
  instagramEmbedHtml: 'richtext',
  description: 'textarea',
  summary: 'textarea',
  blurb: 'textarea',
  actions: 'textarea',
  alt: 'text',
  href: 'url',
  url: 'url',
  mailto: 'url',
  email: 'email',
}

export function humanizeKey(value: string | number): string {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase())
}

export function inferControlByKey(key: string, value: unknown): string {
  const lowerKey = String(key ?? '').toLowerCase()
  if (FIELD_CONTROL_OVERRIDES[key]) return FIELD_CONTROL_OVERRIDES[key]
  if (lowerKey.includes('html')) return 'richtext'
  if (
    lowerKey.includes('description') ||
    lowerKey.includes('summary') ||
    lowerKey.includes('blurb')
  ) {
    return 'textarea'
  }
  if (lowerKey === 'url' || lowerKey.endsWith('url') || lowerKey === 'href') return 'url'
  if (lowerKey.includes('email')) return 'email'
  if (
    lowerKey.includes('image') ||
    lowerKey.includes('cover') ||
    lowerKey.includes('thumbnail') ||
    lowerKey.includes('logo') ||
    lowerKey.includes('src')
  ) {
    return 'image'
  }
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  return 'text'
}

export interface FieldMeta {
  label: string
  control: string
  placeholder?: string
}

export interface SectionMeta {
  id: string
  path: string
  label: string
  description: string
  collapsedByDefault: boolean
}

export interface EditorSchema {
  id: string
  file: string
  title: string
  description: string
  usage: string[]
  sections: SectionMeta[]
  fieldMeta: Record<string, FieldMeta>
}

export function buildFieldMeta(
  value: unknown,
  pathPrefix = '',
  output: Record<string, FieldMeta> = {},
): Record<string, FieldMeta> {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const nextPath = pathPrefix ? `${pathPrefix}.${index}` : String(index)
      buildFieldMeta(item, nextPath, output)
    })
    return output
  }

  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        output[nextPath] = {
          label: humanizeKey(key),
          control: 'group',
        }
      }
      if (Array.isArray(child)) {
        output[nextPath] = {
          label: humanizeKey(key),
          control: 'repeater',
        }
      }
      if (!Array.isArray(child) && (!child || typeof child !== 'object')) {
        output[nextPath] = {
          label: humanizeKey(key),
          control: inferControlByKey(key, child),
          placeholder: typeof child === 'string' ? `Enter ${humanizeKey(key).toLowerCase()}` : '',
        }
      }
      buildFieldMeta(child, nextPath, output)
    })
    return output
  }

  return output
}

function buildSectionsFromContent(filePath: string, content: unknown): SectionMeta[] {
  const fileName = path.basename(filePath)
  const override = FILE_SCHEMA_OVERRIDES[fileName] ?? {}
  const sectionEntries =
    content && typeof content === 'object' && !Array.isArray(content)
      ? Object.entries(content as Record<string, unknown>)
      : []

  return sectionEntries.map(([key]) => {
    const sectionOverride = override.sections?.[key] ?? {}
    return {
      id: key,
      path: key,
      label: sectionOverride.label || humanizeKey(key),
      description: sectionOverride.description || '',
      collapsedByDefault: false,
    }
  })
}

export function getSchemaIdForFilePath(filePath: string): string {
  return path.basename(filePath)
}

export function getUsageForFilePath(filePath: string): string[] {
  return FILE_USAGE_REFERENCES[path.basename(filePath)] ?? []
}

export function buildEditorSchema({
  filePath,
  content,
}: {
  filePath: string
  content: unknown
}): EditorSchema {
  const fileName = path.basename(filePath)
  const override = FILE_SCHEMA_OVERRIDES[fileName] ?? {}
  return {
    id: getSchemaIdForFilePath(filePath),
    file: filePath,
    title: override.title || `${humanizeKey(fileName.replace(/\.json$/i, ''))} Content`,
    description: override.description || 'Guided content editing form.',
    usage: getUsageForFilePath(filePath),
    sections: buildSectionsFromContent(filePath, content),
    fieldMeta: buildFieldMeta(content),
  }
}

export function getSchemaById(schemaId: string, content: unknown): EditorSchema {
  return buildEditorSchema({ filePath: schemaId, content })
}

export interface ContentFileDescriptor {
  file: string
  title: string
  description: string
  usage: string[]
  schemaId: string
  sizeBytes?: number
  updatedAt?: string
}

export function getContentFileDescriptor(
  filePath: string,
  stats?: { size?: number; updatedAt?: string },
): ContentFileDescriptor {
  const fileName = path.basename(filePath)
  const override = FILE_SCHEMA_OVERRIDES[fileName] ?? {}
  return {
    file: filePath,
    title: override.title || `${humanizeKey(fileName.replace(/\.json$/i, ''))} Content`,
    description: override.description || 'Guided content editing form.',
    usage: getUsageForFilePath(filePath),
    schemaId: getSchemaIdForFilePath(filePath),
    ...(stats?.size !== undefined ? { sizeBytes: stats.size } : {}),
    ...(stats?.updatedAt !== undefined ? { updatedAt: stats.updatedAt } : {}),
  }
}

export function listContentFileDescriptors(
  files: string[],
  statsMap?: Record<string, { size?: number; updatedAt?: string }>,
): ContentFileDescriptor[] {
  return files.map((file) => getContentFileDescriptor(file, statsMap?.[file]))
}

// ============================================================================
// 5. Validation Logic
// ============================================================================

export interface ValidationIssue {
  path: string
  code: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

function valueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function joinPath(pathPrefix: string, segment: string | number): string {
  if (!pathPrefix) return String(segment)
  return `${pathPrefix}.${segment}`
}

function validateWithTemplate({
  templateValue,
  nextValue,
  path: currentPath,
  issues,
}: {
  templateValue: unknown
  nextValue: unknown
  path: string
  issues: ValidationIssue[]
}): void {
  const templateType = valueType(templateValue)
  const nextType = valueType(nextValue)

  if (templateType !== nextType) {
    issues.push({
      path: currentPath,
      code: 'TYPE_MISMATCH',
      message: `Expected ${templateType} but got ${nextType}.`,
    })
    return
  }

  if (templateType === 'object' && templateValue && nextValue) {
    const templateObj = templateValue as Record<string, unknown>
    const nextObj = nextValue as Record<string, unknown>
    const templateKeys = Object.keys(templateObj)
    const nextKeys = Object.keys(nextObj)

    const missingKeys = templateKeys.filter((key) => !Object.hasOwn(nextObj, key))
    const extraKeys = nextKeys.filter((key) => !Object.hasOwn(templateObj, key))

    missingKeys.forEach((key) => {
      issues.push({
        path: joinPath(currentPath, key),
        code: 'MISSING_KEY',
        message: `Field "${key}" is required by the content structure.`,
      })
    })

    extraKeys.forEach((key) => {
      issues.push({
        path: joinPath(currentPath, key),
        code: 'EXTRA_KEY',
        message: `Field "${key}" is not allowed in this content structure.`,
      })
    })

    templateKeys.forEach((key) => {
      if (!Object.hasOwn(nextObj, key)) return
      validateWithTemplate({
        templateValue: templateObj[key],
        nextValue: nextObj[key],
        path: joinPath(currentPath, key),
        issues,
      })
    })
    return
  }

  if (templateType === 'array') {
    const templateItems = Array.isArray(templateValue) ? templateValue : []
    const nextItems = Array.isArray(nextValue) ? nextValue : []

    if (!templateItems.length || !nextItems.length) return

    const templateItem = templateItems[0]
    nextItems.forEach((item, index) => {
      validateWithTemplate({
        templateValue: templateItem,
        nextValue: item,
        path: `${currentPath}[${index}]`,
        issues,
      })
    })
  }
}

/**
 * Validates a content payload using both Zod schema validation (if registered for file)
 * and structural template comparison (if currentContent is provided).
 */
export function validateContentPayload({
  currentContent,
  nextContent,
  schemaId,
}: {
  currentContent?: unknown
  nextContent: unknown
  schemaId?: string
}): ValidationResult {
  const issues: ValidationIssue[] = []

  // 1. Zod Schema Validation
  const fileKey = schemaId ? path.basename(schemaId) : undefined
  const schema = fileKey ? CONTENT_SCHEMAS[fileKey] : undefined

  if (schema) {
    const zodResult = schema.safeParse(nextContent)
    if (!zodResult.success) {
      zodResult.error.issues.forEach((issue) => {
        const formattedPath = issue.path
          .map((seg) => (typeof seg === 'number' ? `[${seg}]` : String(seg)))
          .join('.')
          .replace(/\.\[/g, '[')

        issues.push({
          path: formattedPath,
          code: issue.code,
          message: issue.message,
        })
      })
    }
  }

  // 2. Structural Template Comparison (if currentContent provided)
  if (currentContent !== undefined && currentContent !== null) {
    const structuralIssues: ValidationIssue[] = []
    validateWithTemplate({
      templateValue: currentContent,
      nextValue: nextContent,
      path: '',
      issues: structuralIssues,
    })

    // Add any structural issues not already caught
    structuralIssues.forEach((issue) => {
      const exists = issues.some((existing) => existing.path === issue.path)
      if (!exists) {
        issues.push(issue)
      }
    })
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}

// ============================================================================
// 6. Image Usage Collection
// ============================================================================

export interface ImageUsageReference {
  imagePath: string
  jsonPath: string
}

export interface ImageUsageItem {
  file: string
  jsonPath: string
}

/**
 * Traverses an arbitrary JSON content value and collects all string values
 * that reference images (starting with `/images/`).
 */
export function collectImageUsages(
  value: unknown,
  jsonPath: string = '',
  output: ImageUsageReference[] = [],
): ImageUsageReference[] {
  if (typeof value === 'string' && value.startsWith('/images/')) {
    output.push({ imagePath: value, jsonPath })
    return output
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectImageUsages(item, `${jsonPath}[${index}]`, output)
    })
    return output
  }

  if (value && typeof value === 'object' && value !== null) {
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = jsonPath ? `${jsonPath}.${key}` : key
      collectImageUsages(item, nextPath, output)
    })
  }

  return output
}
