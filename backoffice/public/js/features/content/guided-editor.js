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
  areValuesEqual,
  cloneValue,
} from '../../utils.js'
import { FIELD_HELP_OVERRIDES, TEMPLATE_OVERRIDES } from '../../schemas/definitions.js'
import { createMarkdownToolbar, createCharCounter } from './markdown-toolbar.js'
import { openMediaPickerModal } from '../images/media-picker.js'

function getValueAtPath(obj, pathSegments) {
  if (!obj || typeof obj !== 'object') return undefined
  let current = obj
  for (const segment of pathSegments) {
    if (current == null) return undefined
    current = current[segment]
  }
  return current
}

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
  baselineValue,
  activeFile,
  schema,
  validationIssues,
  onReplaceRoot,
  onStatus,
  onMarkImageForDeletion,
  uploadImage,
  fetchImages,
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
        baselineValue,
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
        fetchImages,
      }),
    )

    sectionNode.append(body)
    mount.append(sectionNode)
  })
}

function renderGuidedNode({
  nodeValue,
  baselineValue,
  keyName,
  pathSegments,
  schema,
  activeFile,
  validationByPath,
  onReplace,
  onStatus,
  onMarkImageForDeletion,
  uploadImage,
  fetchImages,
}) {
  const nodeType = getValueType(nodeValue)

  if (nodeType === 'object') {
    const wrapper = document.createElement('div')
    wrapper.className = 'guided-group'

    Object.entries(nodeValue).forEach(([childKey, childValue]) => {
      const childPathSegments = [...pathSegments, childKey]
      const fieldPath = formatPath(childPathSegments)
      const meta = fieldMetaForPath(schema, fieldPath, childKey, childValue)

      const row = document.createElement('div')
      row.className = 'guided-row'

      const childType = getValueType(childValue)
      const isPrimitive = childType !== 'object' && childType !== 'array'

      if (childType === 'array' || childType === 'object') {
        row.classList.add('guided-row-full', `guided-row-${childType}`)
      } else if (childType === 'string') {
        const strVal = String(childValue ?? '')
        const isMultiline =
          meta.control === 'textarea' ||
          meta.control === 'richtext' ||
          strVal.includes('\n') ||
          strVal.length > 70
        const isImage = isLikelyImageField(childKey, strVal)

        if (isMultiline) {
          row.classList.add('guided-row-full', 'guided-row-textarea')
        } else if (isImage) {
          row.classList.add('guided-row-full', 'guided-row-image')
        } else {
          row.classList.add('guided-row-short')
        }
      } else {
        row.classList.add('guided-row-short')
      }

      const label = document.createElement('label')
      label.className = 'guided-label'

      const labelText = document.createElement('span')
      labelText.className = 'guided-label-text'
      labelText.textContent = meta.label
      label.append(labelText)

      const baselineChildValue = getValueAtPath(baselineValue, childPathSegments)

      if (
        isPrimitive &&
        baselineValue !== undefined &&
        baselineValue !== null &&
        baselineChildValue !== undefined &&
        !areValuesEqual(childValue, baselineChildValue)
      ) {
        const revertBtn = document.createElement('button')
        revertBtn.type = 'button'
        revertBtn.className = 'field-revert-btn'
        revertBtn.title = 'Revert field to saved value'
        revertBtn.setAttribute('aria-label', 'Revert field')
        revertBtn.textContent = '↺'
        revertBtn.addEventListener('click', (e) => {
          e.preventDefault()
          nodeValue[childKey] = cloneValue(baselineChildValue)
          onReplace(nodeValue, { rerender: true })
        })
        label.append(revertBtn)
      }

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
          baselineValue,
          keyName: childKey,
          pathSegments: childPathSegments,
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

    const arrayHeader = document.createElement('div')
    arrayHeader.className = 'guided-array-header'

    const countLabel = document.createElement('span')
    countLabel.className = 'guided-array-count'
    countLabel.textContent = `${nodeValue.length} item${nodeValue.length === 1 ? '' : 's'}`

    const bulkActions = document.createElement('div')
    bulkActions.className = 'guided-array-bulk-actions'

    const collapseAllBtn = document.createElement('button')
    collapseAllBtn.type = 'button'
    collapseAllBtn.className = 'btn-array-bulk'
    collapseAllBtn.textContent = 'Collapse All'
    collapseAllBtn.title = 'Collapse all array items for easy drag & drop'
    collapseAllBtn.addEventListener('click', () => {
      wrapper.querySelectorAll('.guided-array-item').forEach((itemEl) => {
        itemEl.classList.add('is-collapsed')
        const chevron = itemEl.querySelector('.item-collapse-btn')
        if (chevron) chevron.textContent = '▶'
      })
    })

    const expandAllBtn = document.createElement('button')
    expandAllBtn.type = 'button'
    expandAllBtn.className = 'btn-array-bulk'
    expandAllBtn.textContent = 'Expand All'
    expandAllBtn.title = 'Expand all array items to edit fields'
    expandAllBtn.addEventListener('click', () => {
      wrapper.querySelectorAll('.guided-array-item').forEach((itemEl) => {
        itemEl.classList.remove('is-collapsed')
        const chevron = itemEl.querySelector('.item-collapse-btn')
        if (chevron) chevron.textContent = '▼'
      })
    })

    bulkActions.append(collapseAllBtn, expandAllBtn)
    arrayHeader.append(countLabel, bulkActions)
    wrapper.append(arrayHeader)

    nodeValue.forEach((item, index) => {
      const card = document.createElement('div')
      card.className = 'guided-array-item'
      card.dataset.index = String(index)

      const controls = document.createElement('div')
      controls.className = 'guided-array-controls'

      const collapseToggle = document.createElement('button')
      collapseToggle.type = 'button'
      collapseToggle.className = 'item-collapse-btn'
      collapseToggle.title = 'Toggle collapse/expand item'
      collapseToggle.setAttribute('aria-label', 'Toggle collapse')
      collapseToggle.textContent = '▼'
      collapseToggle.addEventListener('click', () => {
        const isCollapsed = card.classList.toggle('is-collapsed')
        collapseToggle.textContent = isCollapsed ? '▶' : '▼'
      })
      const dragHandle = document.createElement('button')
      dragHandle.type = 'button'
      dragHandle.className = 'drag-handle'
      dragHandle.title = 'Drag to reorder'
      dragHandle.setAttribute('aria-label', 'Drag to reorder')
      dragHandle.textContent = '⠿'

      dragHandle.addEventListener('mousedown', () => {
        card.draggable = true
      })
      dragHandle.addEventListener('mouseup', () => {
        card.draggable = false
      })
      dragHandle.addEventListener('mouseleave', () => {
        card.draggable = false
      })

      const title = document.createElement('span')
      title.className = 'guided-array-item-title'
      
      let summaryText = ''
      if (item && typeof item === 'object') {
        const candidate = item.title || item.degree || item.name || item.year || item.role || item.label || item.heading || item.institution || item.id || item.src || ''
        if (candidate && typeof candidate === 'string') {
          const clean = candidate.trim()
          if (clean) {
            summaryText = clean.length > 32 ? `${clean.slice(0, 32)}…` : clean
          }
        }
      } else if (item !== null && item !== undefined && typeof item !== 'object') {
        summaryText = String(item)
      }
      title.textContent = `Item ${index + 1}`
      if (summaryText) {
        const chip = document.createElement('span')
        chip.className = 'item-summary-chip'
        chip.textContent = ` · ${summaryText}`
        title.append(chip)
      }
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

      controls.append(dragHandle, collapseToggle, title, up, down, remove)
      card.append(controls)

      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData(
          'application/json',
          JSON.stringify({ path: pathSegments.join('.'), index }),
        )
        e.dataTransfer.setData('text/plain', String(index))
        card.classList.add('is-dragging')
      })

      card.addEventListener('dragend', () => {
        card.draggable = false
        card.classList.remove('is-dragging')
        wrapper.querySelectorAll('.is-drag-over').forEach((el) => el.classList.remove('is-drag-over'))
      })

      card.addEventListener('dragover', (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!card.classList.contains('is-dragging')) {
          card.classList.add('is-drag-over')
        }
      })

      card.addEventListener('dragleave', (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.classList.remove('is-drag-over')
        }
      })

      card.addEventListener('drop', (e) => {
        e.preventDefault()
        card.classList.remove('is-drag-over')

        let fromIndex = -1
        try {
          const raw = e.dataTransfer.getData('application/json')
          if (raw) {
            const data = JSON.parse(raw)
            if (data && data.path === pathSegments.join('.')) {
              fromIndex = Number(data.index)
            }
          }
        } catch {
          // fallback
        }

        if (fromIndex === -1) {
          const plain = parseInt(e.dataTransfer.getData('text/plain'), 10)
          if (!Number.isNaN(plain)) fromIndex = plain
        }

        if (fromIndex >= 0 && fromIndex < nodeValue.length && fromIndex !== index) {
          const [movedItem] = nodeValue.splice(fromIndex, 1)
          nodeValue.splice(index, 0, movedItem)
          onReplace(nodeValue, { rerender: true })
        }
      })

      const body = document.createElement('div')
      body.className = 'guided-array-item-body'
      body.append(
        renderGuidedNode({
          nodeValue: item,
          baselineValue,
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
          fetchImages,
        }),
      )
      card.append(body)
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
    const wrap = document.createElement('div')
    wrap.className = 'guided-textarea-wrap'

    const textarea = document.createElement('textarea')
    textarea.className = 'guided-input guided-textarea'
    textarea.value = String(nodeValue ?? '')
    textarea.placeholder = meta.placeholder || ''
    textarea.rows = 5
    textarea.addEventListener('input', () => onReplace(textarea.value, { rerender: false }))

    const toolbar = createMarkdownToolbar(textarea)
    const counter = createCharCounter(textarea, {
      maxChars: meta?.maxChars || meta?.maxLength,
    })

    wrap.append(toolbar, textarea, counter)
    return wrap
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
    const wrap = document.createElement('div')
    wrap.className = 'guided-input-wrap'
    const counter = createCharCounter(input, {
      maxChars: meta?.maxChars || meta?.maxLength,
    })
    wrap.append(input, counter)
    return wrap
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

  const chooseButton = document.createElement('button')
  chooseButton.type = 'button'
  chooseButton.className = 'btn-choose-media'
  chooseButton.textContent = 'Choose from Library'

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

  async function handleImageFile(file) {
    if (!file) return
    const validExtensions = ['.png', '.jpg', '.jpeg', '.jfif', '.webp', '.svg']
    const hasValidExt = validExtensions.some((ext) => file.name?.toLowerCase().endsWith(ext))
    const isImageMime = file.type?.startsWith('image/')
    if (!hasValidExt && !isImageMime) {
      onStatus('Please select or drop a valid image file (.png, .jpg, .webp, .svg).', 'error')
      return
    }

    uploadButton.disabled = true
    chooseButton.disabled = true
    onStatus('Uploading image and processing variants. Please wait...', 'saving')
    try {
      const uploadResult = await uploadImage({
        file,
        fieldPath,
        previousImagePath: input.value,
      })
      const imagePath =
        typeof uploadResult === 'string' ? uploadResult : uploadResult?.imagePath
      const previewUrl =
        typeof uploadResult === 'object' && uploadResult?.previewUrl
          ? uploadResult.previewUrl
          : imagePath
      if (!imagePath) throw new Error('Image upload returned no usable path.')
      if (isManagedImagePublicPath(input.value) && input.value !== imagePath) {
        onMarkImageForDeletion(input.value)
      }
      input.value = imagePath
      preview.hidden = !isManagedImagePublicPath(imagePath)
      if (!preview.hidden) preview.src = previewUrl
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
      chooseButton.disabled = false
      picker.value = ''
    }
  }

  uploadButton.addEventListener('click', () => picker.click())
  picker.addEventListener('change', async () => {
    const selected = picker.files && picker.files[0]
    if (selected) {
      await handleImageFile(selected)
    }
  })

  chooseButton.addEventListener('click', () => {
    openMediaPickerModal({
      currentPath: input.value,
      fetchImages,
      onSelect: (selectedPath) => {
        if (!selectedPath) return
        input.value = selectedPath
        preview.hidden = !isManagedImagePublicPath(selectedPath)
        if (!preview.hidden) preview.src = selectedPath
        tempBadge.hidden = !String(selectedPath).includes('-temp')
        onReplace(selectedPath, { rerender: false })
        onStatus(`Selected image "${selectedPath}". Save to persist this change.`, 'unsaved')
      },
    })
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

  // Drag-and-drop dropzone on image field
  imageWrap.addEventListener('dragenter', (e) => {
    e.preventDefault()
    e.stopPropagation()
    imageWrap.classList.add('image-dropzone-active')
  })

  imageWrap.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    imageWrap.classList.add('image-dropzone-active')
  })

  imageWrap.addEventListener('dragleave', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!imageWrap.contains(e.relatedTarget)) {
      imageWrap.classList.remove('image-dropzone-active')
    }
  })

  imageWrap.addEventListener('drop', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    imageWrap.classList.remove('image-dropzone-active')
    const droppedFile = e.dataTransfer?.files?.[0]
    if (droppedFile) {
      await handleImageFile(droppedFile)
    }
  })

  imageControls.append(uploadButton, chooseButton, removeButton, tempBadge, picker)
  imageWrap.append(imageControls)
  return imageWrap
}
