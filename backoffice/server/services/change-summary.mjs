/**
 * Why this exists:
 * Review flows are easier for non-technical editors when changes are described
 * by content fields instead of raw git-only path/status entries.
 */

function valueType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function toPreview(value) {
  const type = valueType(value)
  if (type === 'string') return value.length > 70 ? `${value.slice(0, 67)}...` : value
  if (type === 'number' || type === 'boolean' || type === 'null') return String(value)
  if (type === 'array') return `Array(${value.length})`
  if (type === 'object') return `Object(${Object.keys(value).length})`
  return ''
}

function joinPath(pathPrefix, segment) {
  if (!pathPrefix) return String(segment)
  return `${pathPrefix}.${segment}`
}

function diffValues(before, after, pathPrefix = '', output = []) {
  const beforeType = valueType(before)
  const afterType = valueType(after)

  if (beforeType !== afterType) {
    output.push({
      path: pathPrefix,
      kind: 'type-change',
      before: toPreview(before),
      after: toPreview(after),
    })
    return output
  }

  if (beforeType === 'object') {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
    keys.forEach((key) => {
      if (!Object.hasOwn(before || {}, key)) {
        output.push({
          path: joinPath(pathPrefix, key),
          kind: 'added',
          before: '',
          after: toPreview(after[key]),
        })
        return
      }
      if (!Object.hasOwn(after || {}, key)) {
        output.push({
          path: joinPath(pathPrefix, key),
          kind: 'removed',
          before: toPreview(before[key]),
          after: '',
        })
        return
      }
      diffValues(before[key], after[key], joinPath(pathPrefix, key), output)
    })
    return output
  }

  if (beforeType === 'array') {
    if (before.length !== after.length) {
      output.push({
        path: pathPrefix,
        kind: 'array-length',
        before: String(before.length),
        after: String(after.length),
      })
    }

    const maxLength = Math.max(before.length, after.length)
    for (let index = 0; index < maxLength; index += 1) {
      if (index >= before.length) {
        output.push({
          path: `${pathPrefix}[${index}]`,
          kind: 'added',
          before: '',
          after: toPreview(after[index]),
        })
        continue
      }
      if (index >= after.length) {
        output.push({
          path: `${pathPrefix}[${index}]`,
          kind: 'removed',
          before: toPreview(before[index]),
          after: '',
        })
        continue
      }
      diffValues(before[index], after[index], `${pathPrefix}[${index}]`, output)
    }
    return output
  }

  if (before !== after) {
    output.push({
      path: pathPrefix,
      kind: 'updated',
      before: toPreview(before),
      after: toPreview(after),
    })
  }

  return output
}

export function buildSemanticDiff({ before, after, limit = 250 }) {
  const entries = diffValues(before, after)
  return entries.slice(0, limit)
}
