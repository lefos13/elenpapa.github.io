import { z } from 'zod'

// Zod schemas for runtime validation
const NavItemSchema = z.object({
  label: z.string(),
  href: z.string(),
})

const SocialItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  icon: z.string(),
})

const SiteContentSchema = z.object({
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

const HomeContentSchema = z.object({
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

const TimelineItemSchema = z.object({
  year: z.number(),
  title: z.string(),
  cover: z.string(),
  blurb: z.string(),
  actions: z.string(),
})

const TimelineContentSchema = z.object({
  items: z.array(TimelineItemSchema),
})

const ServiceItemSchema = z.object({
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

const ServicesContentSchema = z.object({
  heading: z.string().optional(),
  description: z.string().optional(),
  items: z.array(ServiceItemSchema),
})

const PostItemSchema = z.object({
  title: z.string(),
  image: z.string(),
  url: z.string(),
  summary: z.string(),
  contentHtml: z.string(),
  devOnly: z.boolean().optional(),
})

const PostsContentSchema = z.object({
  heading: z.string().optional(),
  description: z.string().optional(),
  items: z.array(PostItemSchema),
})

const ContactContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  mailto: z.string(),
  emailLabel: z.string().optional(),
})

const BookEventSchema = z.object({
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

const BookContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    // subtitle: z.string(),
    tagline: z.string().optional(),
    cover: z.string(),
    coverAlt: z.string().optional(),
    goodreadsUrl: z.string().url().optional(),
    goodreadsLabel: z.string().optional(),
    moonlighttalesUrl: z.string().url().optional(),
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
    previewUrl: z.string().url().optional(),
  }),
})

const MoonlightHeroSchema = z.object({
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

const MoonlightMissionSchema = z.object({
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

const MoonlightBubbleSchema = z.object({
  heading: z.string(),
  items: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      description: z.string().optional(),
    }),
  ),
})

const MoonlightBookJournalSchema = z.object({
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

const MoonlightReleasesSchema = z.object({
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

const MoonlightCtaSchema = z.object({
  heading: z.string(),
  // body: z.string(),
})

const MoonlightContentSchema = z.object({
  hero: MoonlightHeroSchema,
  mission: MoonlightMissionSchema,
  bubbles: MoonlightBubbleSchema.optional(),
  bookJournal: MoonlightBookJournalSchema.optional(),
  releases: MoonlightReleasesSchema.optional(),
  socials: z.array(SocialItemSchema).optional(),
  cta: MoonlightCtaSchema,
})

const PaintedBooksContentSchema = z.object({
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

const PublishersContentSchema = z.object({
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

// Infer TypeScript types from schemas
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
export type BookContent = z.infer<typeof BookContentSchema>
export type MoonlightContent = z.infer<typeof MoonlightContentSchema>
export type PaintedBooksContent = z.infer<typeof PaintedBooksContentSchema>
export type PublishersContent = z.infer<typeof PublishersContentSchema>

// Simple in-memory cache to avoid duplicate fetches
const cache = new Map<string, unknown>()

async function fetchAndParse<T>(url: string, schema: z.ZodSchema<T>): Promise<T> {
  if (cache.has(url)) return schema.parse(cache.get(url))

  // SSR/SSG: use file system during build, fetch during runtime
  let json: unknown

  if (
    typeof window === 'undefined' ||
    typeof globalThis.fetch === 'undefined' ||
    import.meta.env.SSR
  ) {
    // During SSG build, read from file system
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const filePath = path.join(process.cwd(), 'public', url)
    const fileContent = await fs.readFile(filePath, 'utf-8')
    json = JSON.parse(fileContent)
  } else {
    // During client-side runtime, use fetch
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
    if (!res.ok) throw new Error(`Failed to load content: ${url} (${res.status})`)
    json = await res.json()
  }

  const parsed = schema.parse(json)
  cache.set(url, parsed)
  return parsed
}

// Return validated data (throws if validation fails)
export const content = {
  getSite: async (): Promise<SiteContent> => fetchAndParse('/content/site.json', SiteContentSchema),
  getHome: async (): Promise<HomeContent> => fetchAndParse('/content/home.json', HomeContentSchema),
  getTimeline: async (): Promise<TimelineContent> =>
    fetchAndParse('/content/timeline.json', TimelineContentSchema),
  getServices: async (): Promise<ServicesContent> =>
    fetchAndParse('/content/services.json', ServicesContentSchema),
  getPosts: async (): Promise<PostsContent> =>
    fetchAndParse('/content/posts.json', PostsContentSchema),
  getContact: async (): Promise<ContactContent> =>
    fetchAndParse('/content/contact.json', ContactContentSchema),
  getBook: async (): Promise<BookContent> => fetchAndParse('/content/book.json', BookContentSchema),
  getMoonlight: async (): Promise<MoonlightContent> =>
    fetchAndParse('/content/moonlight.json', MoonlightContentSchema),
  getPaintedBooks: async (): Promise<PaintedBooksContent> =>
    fetchAndParse('/content/painted-books.json', PaintedBooksContentSchema),
  getPublishers: async (): Promise<PublishersContent> =>
    fetchAndParse('/content/publishers.json', PublishersContentSchema),
}
