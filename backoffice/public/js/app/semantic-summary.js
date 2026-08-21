/**
 * Why this exists:
 * Review modal should present human-readable field changes before raw git lines
 * so editors understand exactly what content was updated.
 */

function valueType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function summarizeValue(value) {
  const type = valueType(value)
  if (type === 'string') return value.length > 64 ? `${value.slice(0, 61)}...` : value
  if (type === 'number' || type === 'boolean' || type === 'null') return String(value)
  if (type === 'array') return `Array(${value.length})`
  if (type === 'object') return `Object(${Object.keys(value).length})`
  return ''
}

function pathJoin(prefix, segment) {
  if (!prefix) return String(segment)
  return `${prefix}.${segment}`
}

function walkDiff(before, after, path, output) {
  const beforeType = valueType(before)
  const afterType = valueType(after)

  if (beforeType !== afterType) {
    output.push({
      path,
      label: 'Type changed',
      before: summarizeValue(before),
      after: summarizeValue(after),
    })
    return
  }

  if (beforeType === 'object') {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
    keys.forEach((key) => {
      if (!Object.hasOwn(before || {}, key)) {
        output.push({
          path: pathJoin(path, key),
          label: 'Added field',
          before: '',
          after: summarizeValue(after[key]),
        })
        return
      }
      if (!Object.hasOwn(after || {}, key)) {
        output.push({
          path: pathJoin(path, key),
          label: 'Removed field',
          before: summarizeValue(before[key]),
          after: '',
        })
        return
      }
      walkDiff(before[key], after[key], pathJoin(path, key), output)
    })
    return
  }

  if (beforeType === 'array') {
    if (before.length !== after.length) {
      output.push({
        path,
        label: 'List size changed',
        before: String(before.length),
        after: String(after.length),
      })
    }
    const max = Math.max(before.length, after.length)
    for (let index = 0; index < max; index += 1) {
      if (index >= before.length) {
        output.push({
          path: `${path}[${index}]`,
          label: 'Added item',
          before: '',
          after: summarizeValue(after[index]),
        })
        continue
      }
      if (index >= after.length) {
        output.push({
          path: `${path}[${index}]`,
          label: 'Removed item',
          before: summarizeValue(before[index]),
          after: '',
        })
        continue
      }
      walkDiff(before[index], after[index], `${path}[${index}]`, output)
    }
    return
  }

  if (before !== after) {
    output.push({
      path,
      label: 'Updated value',
      before: summarizeValue(before),
      after: summarizeValue(after),
    })
  }
}

export function buildLocalSemanticSummary({ before, after, limit = 100 }) {
  const output = []
  walkDiff(before, after, '', output)
  return output.slice(0, limit)
}
