/**
 * Why this exists:
 * Guided mode renders schema-driven sections and field controls so non-technical
 * editors can update content without reasoning about raw JSON structure.
 */
import {
  collectImagePaths,
  getValueType,
  isLikelyImageField,
  isManagedImagePublicPath,
  makeTemplateFromArray,
} from '../../utils.js'
import { FIELD_HELP_OVERRIDES, TEMPLATE_OVERRIDES } from '../../schemas/definitions.js'

function formatSegment(segment) {
  return /^\d+$/.test(String(segment)) ? `[${segment}]` : `.${segment}`
}

function formatPath(pathSegments) {
  return pathSegments.reduce((acc, segment) => {
    const formatted = formatSegment(segment)
    if (!acc) return formatted.startsWith('.') ? formatted.slice(1) : formatted
    return `${acc}${formatted}`
  }, '')
}

function humanizeKey(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase())
}

function fieldMetaForPath(schema, fieldPath, fallbackKey, value) {
  const meta = schema?.fieldMeta?.[fieldPath]
  const key = String(fallbackKey || fieldPath)
    .split('.')
    .at(-1)
  const inferredControl =
    typeof value === 'boolean'
      ? 'boolean'
      : typeof value === 'number'
        ? 'number'
        : /(description|summary|blurb|actions|html)/i.test(key)
          ? 'textarea'
          : /(href|url|mailto)/i.test(key)
            ? 'url'
            : /(email)/i.test(key)
              ? 'email'
              : 'text'

  return {
    label: meta?.label || humanizeKey(key),
    description: meta?.description || FIELD_HELP_OVERRIDES[key] || '',
    control: meta?.control || inferredControl,
    placeholder: meta?.placeholder || '',
  }
}

function indexValidationIssues(issues) {
  const map = new Map()
  ;(Array.isArray(issues) ? issues : []).forEach((issue) => {
    if (!issue || typeof issue.path !== 'string') return
    if (!map.has(issue.path)) map.set(issue.path, [])
    map.get(issue.path).push(issue.message || 'Invalid field value.')
  })
  return map
}

function buildFieldErrorNode(messages) {
  const wrapper = document.createElement('div')
  wrapper.className = 'guided-field-errors'
  messages.forEach((message) => {
    const row = document.createElement('p')
    row.className = 'guided-field-error'
    row.textContent = message
    wrapper.append(row)
  })
  return wrapper
}

export function renderGuidedContentEditor({
  mount,
  value,
  activeFile,
  schema,
  validationIssues,
  onReplaceRoot,
  onStatus,
  onMarkImageForDeletion,
  uploadImage,
}) {
  const validationByPath = indexValidationIssues(validationIssues)
  mount.innerHTML = ''

  const sections = Array.isArray(schema?.sections) ? schema.sections : []

  if (sections.length) {
    const toc = document.createElement('div')
    toc.className = 'guided-toc'
    const tocTitle = document.createElement('p')
    tocTitle.className = 'guided-toc-title'
    tocTitle.textContent = 'Jump to section'
    toc.append(tocTitle)

    const tocList = document.createElement('div')
    tocList.className = 'guided-toc-list'

    sections.forEach((section) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = section.label || humanizeKey(section.path)
      button.addEventListener('click', () => {
        const sectionNode = mount.querySelector(`[data-section-id=\"${section.id}\"]`)
        if (sectionNode) sectionNode.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      tocList.append(button)
    })

    toc.append(tocList)
    mount.append(toc)
  }

  const rootKeys =
    value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : []
  rootKeys.forEach((key) => {
    const sectionConfig = sections.find((section) => section.path === key)
    const sectionNode = document.createElement('section')
    sectionNode.className = 'guided-section'
    sectionNode.dataset.sectionId = sectionConfig?.id || key

    const header = document.createElement('div')
    header.className = 'guided-section-head'
    const title = document.createElement('h3')
    title.textContent = sectionConfig?.label || humanizeKey(key)
    const description = document.createElement('p')
    description.textContent = sectionConfig?.description || ''

    header.append(title)
    if (description.textContent.trim()) header.append(description)
    sectionNode.append(header)

    const body = document.createElement('div')
    body.className = 'guided-section-body'
    body.append(
      renderGuidedNode({
        nodeValue: value[key],
        keyName: key,
        pathSegments: [key],
        schema,
        activeFile,
        validationByPath,
        onReplace: (nextValue, options) => {
          value[key] = nextValue
          onReplaceRoot(value, options)
        },
        onStatus,
        onMarkImageForDeletion,
        uploadImage,
      }),
    )

    sectionNode.append(body)
    mount.append(sectionNode)
  })
}

function renderGuidedNode({
  nodeValue,
  keyName,
  pathSegments,
  schema,
  activeFile,
  validationByPath,
  onReplace,
  onStatus,
  onMarkImageForDeletion,
  uploadImage,
}) {
  const nodeType = getValueType(nodeValue)

  if (nodeType === 'object') {
    const wrapper = document.createElement('div')
    wrapper.className = 'guided-group'

    Object.entries(nodeValue).forEach(([childKey, childValue]) => {
      const fieldPath = formatPath([...pathSegments, childKey])
      const meta = fieldMetaForPath(schema, fieldPath, childKey, childValue)

      const row = document.createElement('div')
      row.className = 'guided-row'
      const label = document.createElement('label')
      label.className = 'guided-label'
      label.textContent = meta.label
      row.append(label)

      if (meta.description) {
        const helper = document.createElement('p')
        helper.className = 'guided-helper'
        helper.textContent = meta.description
        row.append(helper)
      }

      row.append(
        renderGuidedNode({
          nodeValue: childValue,
          keyName: childKey,
          pathSegments: [...pathSegments, childKey],
          schema,
          activeFile,
          validationByPath,
          onReplace: (nextValue, options) => {
            nodeValue[childKey] = nextValue
            onReplace(nodeValue, options)
          },
          onStatus,
          onMarkImageForDeletion,
          uploadImage,
        }),
      )

      const fieldIssues = validationByPath.get(fieldPath)
      if (fieldIssues?.length) {
        row.append(buildFieldErrorNode(fieldIssues))
      }

      wrapper.append(row)
    })

    return wrapper
  }

  if (nodeType === 'array') {
    const wrapper = document.createElement('div')
    wrapper.className = 'guided-array'

    nodeValue.forEach((item, index) => {
      const card = document.createElement('div')
      card.className = 'guided-array-item'

      const controls = document.createElement('div')
      controls.className = 'guided-array-controls'
      const title = document.createElement('span')
      title.textContent = `Item ${index + 1}`

      const up = document.createElement('button')
      up.type = 'button'
      up.textContent = 'Up'
      up.disabled = index === 0
      up.addEventListener('click', () => {
        const temp = nodeValue[index - 1]
        nodeValue[index - 1] = nodeValue[index]
        nodeValue[index] = temp
        onReplace(nodeValue, { rerender: true })
      })

      const down = document.createElement('button')
      down.type = 'button'
      down.textContent = 'Down'
      down.disabled = index === nodeValue.length - 1
      down.addEventListener('click', () => {
        const temp = nodeValue[index + 1]
        nodeValue[index + 1] = nodeValue[index]
        nodeValue[index] = temp
        onReplace(nodeValue, { rerender: true })
      })

      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'delete'
      remove.textContent = 'Delete'
      remove.addEventListener('click', () => {
        const confirmed = globalThis.confirm('Delete this item? This cannot be undone.')
        if (!confirmed) return
        collectImagePaths(nodeValue[index]).forEach((imagePath) =>
          onMarkImageForDeletion(imagePath),
        )
        nodeValue.splice(index, 1)
        onReplace(nodeValue, { rerender: true })
      })

      controls.append(title, up, down, remove)
      card.append(controls)

      card.append(
        renderGuidedNode({
          nodeValue: item,
          keyName: String(index),
          pathSegments: [...pathSegments, String(index)],
          schema,
          activeFile,
          validationByPath,
          onReplace: (nextValue, options) => {
            nodeValue[index] = nextValue
            onReplace(nodeValue, options)
          },
          onStatus,
          onMarkImageForDeletion,
          uploadImage,
        }),
      )

      wrapper.append(card)
    })

    const addButton = document.createElement('button')
    addButton.type = 'button'
    addButton.textContent = 'Add item'
    addButton.addEventListener('click', () => {
      nodeValue.push(
        makeTemplateFromArray({
          arrayValue: nodeValue,
          nodePath: pathSegments,
          activeFile,
          templateOverrides: TEMPLATE_OVERRIDES,
        }),
      )
      onReplace(nodeValue, { rerender: true })
    })

    wrapper.append(addButton)
    return wrapper
  }

  if (nodeType === 'boolean') {
    const select = document.createElement('select')
    select.className = 'guided-input'
    const truthy = document.createElement('option')
    truthy.value = 'true'
    truthy.textContent = 'Yes'
    truthy.selected = nodeValue === true
    const falsy = document.createElement('option')
    falsy.value = 'false'
    falsy.textContent = 'No'
    falsy.selected = nodeValue === false
    select.append(truthy, falsy)
    select.addEventListener('change', () => onReplace(select.value === 'true', { rerender: false }))
    return select
  }

  if (nodeType === 'number') {
    const input = document.createElement('input')
    input.className = 'guided-input'
    input.type = 'number'
    input.value = Number.isFinite(nodeValue) ? String(nodeValue) : '0'
    input.addEventListener('input', () => {
      const parsed = Number(input.value)
      onReplace(Number.isFinite(parsed) ? parsed : 0, { rerender: false })
    })
    return input
  }

  if (nodeType === 'null') {
    const hint = document.createElement('p')
    hint.className = 'guided-helper'
    hint.textContent = 'Null value'
    return hint
  }

  const fieldPath = formatPath(pathSegments)
  const meta = fieldMetaForPath(schema, fieldPath, keyName, nodeValue)

  if (meta.control === 'textarea' || meta.control === 'richtext') {
    const textarea = document.createElement('textarea')
    textarea.className = 'guided-input guided-textarea'
    textarea.value = String(nodeValue ?? '')
    textarea.placeholder = meta.placeholder || ''
    textarea.rows = 5
    textarea.addEventListener('input', () => onReplace(textarea.value, { rerender: false }))
    return textarea
  }

  const input = document.createElement('input')
  input.className = 'guided-input'
  input.value = String(nodeValue ?? '')
  input.placeholder = meta.placeholder || ''

  if (meta.control === 'url') input.type = 'url'
  else if (meta.control === 'email') input.type = 'email'
  else input.type = 'text'

  input.addEventListener('input', () => {
    onReplace(input.value, { rerender: false })
  })

  if (!isLikelyImageField(keyName, input.value)) {
    return input
  }

  const imageWrap = document.createElement('div')
  imageWrap.className = 'guided-image-field'
  imageWrap.append(input)

  const preview = document.createElement('img')
  preview.className = 'guided-image-preview'
  preview.alt = `${meta.label} preview`
  preview.hidden = !isManagedImagePublicPath(input.value)
  if (!preview.hidden) preview.src = input.value
  imageWrap.append(preview)

  const imageControls = document.createElement('div')
  imageControls.className = 'guided-image-controls'

  const uploadButton = document.createElement('button')
  uploadButton.type = 'button'
  uploadButton.textContent = 'Replace image'

  const removeButton = document.createElement('button')
  removeButton.type = 'button'
  removeButton.textContent = 'Remove image'

  const tempBadge = document.createElement('span')
  tempBadge.className = 'guided-temp-badge'
  tempBadge.textContent = 'Pending until save'
  tempBadge.hidden = !String(input.value).includes('-temp')

  const picker = document.createElement('input')
  picker.type = 'file'
  picker.accept = '.png,.jpg,.jpeg,.jfif,.webp,.svg'
  picker.hidden = true

  uploadButton.addEventListener('click', () => picker.click())
  picker.addEventListener('change', async () => {
    const selected = picker.files && picker.files[0]
    if (!selected) return

    uploadButton.disabled = true
    onStatus('Uploading image and processing variants. Please wait...', 'saving')
    try {
      const imagePath = await uploadImage({
        file: selected,
        fieldPath,
        previousImagePath: input.value,
      })
      if (isManagedImagePublicPath(input.value) && input.value !== imagePath) {
        onMarkImageForDeletion(input.value)
      }
      input.value = imagePath
      preview.hidden = !isManagedImagePublicPath(imagePath)
      if (!preview.hidden) preview.src = imagePath
      tempBadge.hidden = !String(imagePath).includes('-temp')
      onReplace(imagePath, { rerender: false })
      onStatus('Image uploaded. Save to finalize this change.', 'unsaved')
    } catch (error) {
      onStatus(
        error instanceof Error
          ? `${error.message} Please try again or choose another image.`
          : 'Image upload failed. Please try again.',
        'error',
      )
    } finally {
      uploadButton.disabled = false
      picker.value = ''
    }
  })

  removeButton.addEventListener('click', () => {
    if (!input.value) return
    const confirmed = globalThis.confirm('Remove this image path from the content field?')
    if (!confirmed) return
    if (isManagedImagePublicPath(input.value)) {
      onMarkImageForDeletion(input.value)
    }
    input.value = ''
    preview.hidden = true
    tempBadge.hidden = true
    onReplace('', { rerender: false })
    onStatus('Image reference removed. Save to persist this change.', 'unsaved')
  })

  imageControls.append(uploadButton, removeButton, tempBadge, picker)
  imageWrap.append(imageControls)
  return imageWrap
}
