/**
 * Why this exists:
 * Guided forms need deterministic templates and helpful field copy per file so
 * content editors can add entries without hand-building JSON structures.
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

export const FIELD_HELP_OVERRIDES = {
  contentHtml: 'Supports HTML snippets used in content sections.',
  instagramEmbedHtml: 'Paste the full Instagram embed HTML snippet.',
  devOnly: 'Enable only for development/testing posts.',
  seo: 'Global SEO settings used across pages.',
  alt: 'Describe the image for accessibility and SEO.',
}
