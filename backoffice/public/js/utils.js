/**
 * Why this exists:
 * Shared immutable utilities keep value-shape logic reusable across editor and
 * controller modules as the backoffice UI expands.
 */
export function cloneValue(value) {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

export function getValueType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

export function toEmptyTemplate(value) {
  const valueType = getValueType(value)
  if (valueType === 'string') return ''
  if (valueType === 'number') return 0
  if (valueType === 'boolean') return false
  if (valueType === 'null') return null
  if (valueType === 'array') return []
  if (valueType === 'object') {
    const next = {}
    for (const [key, child] of Object.entries(value)) {
      next[key] = toEmptyTemplate(child)
    }
    return next
  }
  return ''
}

export function makeTemplateFromArray({ arrayValue, nodePath, activeFile, templateOverrides }) {
  const key = `${activeFile}:${nodePath.join('.')}`
  if (templateOverrides[key]) {
    return cloneValue(templateOverrides[key])
  }
  if (arrayValue.length > 0) {
    return toEmptyTemplate(arrayValue[0])
  }
  return {}
}

export function isLikelyImageField(fieldKey, value) {
  if (typeof value !== 'string') return false
  if (isManagedImagePublicPath(value)) return true
  return /(src|cover|image|thumbnail)/i.test(fieldKey || '')
}

function stripQueryAndHash(value) {
  return String(value ?? '')
    .split('#')[0]
    .split('?')[0]
}

/**
 * Why this exists:
 * Backoffice image replacement/deletion should support both `/images/...` and
 * root-level public images such as `/logo.png`.
 */
export function isManagedImagePublicPath(value) {
  if (typeof value !== 'string') return false
  if (!value.startsWith('/')) return false
  if (value.startsWith('/content/')) return false
  const cleanPath = stripQueryAndHash(value)
  return /\.(png|jpe?g|jfif|webp|svg)$/i.test(cleanPath)
}

export function collectImagePaths(value, output = []) {
  const valueType = getValueType(value)
  if (valueType === 'string' && isManagedImagePublicPath(value)) {
    output.push(value)
    return output
  }

  if (valueType === 'array') {
    value.forEach((item) => collectImagePaths(item, output))
    return output
  }

  if (valueType === 'object') {
    Object.values(value).forEach((item) => collectImagePaths(item, output))
    return output
  }

  return output
}

export function toRepoPathFromPublicImagePath(publicPath) {
  if (!isManagedImagePublicPath(publicPath)) return ''
  return `public${stripQueryAndHash(publicPath)}`.replace(/\\/g, '/')
}

export function areValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}
