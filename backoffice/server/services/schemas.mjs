/**
 * Why this exists:
 * Guided forms and editor hints need centralized schema metadata so both API
 * validation and frontend rendering can rely on the same source of truth.
 */
import path from 'node:path'

const FILE_USAGE_REFERENCES = {
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

/**
 * Why this exists:
 * Per-file guided labels/descriptions improve non-technical editing clarity
 * while still allowing generic fallback rendering for unknown fields.
 */
const FILE_SCHEMA_OVERRIDES = {
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

const FIELD_CONTROL_OVERRIDES = {
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

function humanizeKey(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase())
}

function inferControlByKey(key, value) {
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
  if (lowerKey.includes('image') || lowerKey.includes('cover') || lowerKey.includes('thumbnail')) {
    return 'image'
  }
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  return 'text'
}

function buildFieldMeta(value, pathPrefix = '', output = {}) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const nextPath = pathPrefix ? `${pathPrefix}.${index}` : String(index)
      buildFieldMeta(item, nextPath, output)
    })
    return output
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
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

function buildSectionsFromContent(filePath, content) {
  const fileName = path.basename(filePath)
  const override = FILE_SCHEMA_OVERRIDES[fileName] ?? {}
  const sectionEntries =
    content && typeof content === 'object' && !Array.isArray(content) ? Object.entries(content) : []

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

export function getSchemaIdForFilePath(filePath) {
  return path.basename(filePath)
}

export function getUsageForFilePath(filePath) {
  return FILE_USAGE_REFERENCES[path.basename(filePath)] ?? []
}

export function buildEditorSchema({ filePath, content }) {
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

export function getSchemaById(schemaId, content) {
  return buildEditorSchema({ filePath: schemaId, content })
}
