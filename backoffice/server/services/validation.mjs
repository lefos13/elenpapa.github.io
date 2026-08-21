/**
 * Why this exists:
 * The editor must lock JSON structure and provide clear field-level feedback,
 * so saves can fail safely with actionable validation details.
 */

function valueType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function joinPath(pathPrefix, segment) {
  if (!pathPrefix) return String(segment)
  return `${pathPrefix}.${segment}`
}

function validateWithTemplate({ templateValue, nextValue, path, issues }) {
  const templateType = valueType(templateValue)
  const nextType = valueType(nextValue)

  if (templateType !== nextType) {
    issues.push({
      path,
      code: 'TYPE_MISMATCH',
      message: `Expected ${templateType} but got ${nextType}.`,
    })
    return
  }

  if (templateType === 'object') {
    const templateKeys = Object.keys(templateValue)
    const nextKeys = Object.keys(nextValue)

    const missingKeys = templateKeys.filter((key) => !Object.hasOwn(nextValue, key))
    const extraKeys = nextKeys.filter((key) => !Object.hasOwn(templateValue, key))

    missingKeys.forEach((key) => {
      issues.push({
        path: joinPath(path, key),
        code: 'MISSING_KEY',
        message: `Field "${key}" is required by the content structure.`,
      })
    })

    extraKeys.forEach((key) => {
      issues.push({
        path: joinPath(path, key),
        code: 'EXTRA_KEY',
        message: `Field "${key}" is not allowed in this content structure.`,
      })
    })

    templateKeys.forEach((key) => {
      if (!Object.hasOwn(nextValue, key)) return
      validateWithTemplate({
        templateValue: templateValue[key],
        nextValue: nextValue[key],
        path: joinPath(path, key),
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
        path: `${path}[${index}]`,
        issues,
      })
    })
  }
}

export function validateContentPayload({ currentContent, nextContent }) {
  const issues = []
  validateWithTemplate({
    templateValue: currentContent,
    nextValue: nextContent,
    path: '',
    issues,
  })

  return {
    ok: issues.length === 0,
    issues,
  }
}
