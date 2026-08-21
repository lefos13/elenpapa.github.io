/**
 * Why this exists:
 * UI schema templates and file usage references are central metadata for the
 * backoffice and should stay decoupled from rendering/controller logic.
 */
export const TEMPLATE_OVERRIDES = {
  'book.json:events': {
    id: '',
    instagramEmbedHtml: '',
    image: { src: '', alt: '' },
  },
  'moonlight.json:hero.stats': {
    label: '',
    value: '',
  },
  'moonlight.json:mission.pillars': {
    firstName: '',
    lastName: '',
    href: '',
    image: { src: '', alt: '' },
  },
  'moonlight.json:bubbles.items': {
    label: '',
    value: '',
    description: '',
  },
  'moonlight.json:releases.books': {
    id: '',
    title: '',
    tagline: '',
    genre: '',
    cover: '',
  },
  'painted-books.json:gallery.items': {
    id: '',
    title: '',
    author: '',
    media: { src: '', alt: '' },
  },
  'posts.json:items': {
    title: '',
    image: '',
    url: '',
    summary: '',
    contentHtml: '',
    devOnly: false,
  },
  'publishers.json:items': {
    name: '',
    description: '',
    logo: { src: '', alt: '' },
    services: [],
  },
  'services.json:items': {
    title: '',
    description: '',
    focus: '',
    highlights: [],
    icon: '',
    image: { src: '', alt: '' },
  },
  'timeline.json:items': {
    year: new Date().getFullYear(),
    title: '',
    cover: '',
    blurb: '',
    actions: '',
  },
}

export const FILE_USAGE_REFERENCES = {
  'book.json': ['Book page (/book)'],
  'contact.json': ['Home page contact section (/)'],
  'home.json': ['Home page hero/intro (/)'],
  'moonlight.json': ['Moonlight page (/moonlight)'],
  'painted-books.json': ['Painted Books page (/painted-books)'],
  'posts.json': ['Home page posts carousel (/)', 'Post pages (/posts/:id)'],
  'publishers.json': ['Home page publishers section (/)'],
  'services.json': ['Home page services section (/)'],
  'site.json': ['Global layout: header/footer/SEO (all pages)'],
  'timeline.json': ['Timeline page (/timeline)', 'Home page timeline carousel (/)'],
}

export function getFileUsageLabel(filePath) {
  const usage = FILE_USAGE_REFERENCES[filePath]
  if (!usage || usage.length === 0) return 'Usage: not documented'
  return `Usage: ${usage.join(' • ')}`
}
