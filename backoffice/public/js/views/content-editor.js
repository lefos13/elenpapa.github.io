/**
 * Why this exists:
 * The recursive JSON editor is isolated so content editing behavior can evolve
 * independently from mode switching, images view rendering, and API orchestration.
 */
import { TEMPLATE_OVERRIDES } from '../constants.js'
import {
  collectImagePaths,
  getValueType,
  isManagedImagePublicPath,
  isLikelyImageField,
  makeTemplateFromArray,
} from '../utils.js'

export function renderContentEditor({
  mount,
  value,
  activeFile,
  onReplaceRoot,
  onStatus,
  onMarkImageForDeletion,
  uploadImage,
}) {
  mount.innerHTML = ''
  mount.append(
    renderNode(value, onReplaceRoot, {
      activeFile,
      depth: 0,
      fieldKey: '',
      isRoot: true,
      pathSegments: [],
      onStatus,
      onMarkImageForDeletion,
      uploadImage,
    }),
  )
}

function renderNode(value, onReplace, context) {
  const {
    activeFile,
    depth,
    fieldKey,
    isRoot,
    pathSegments,
    onStatus,
    onMarkImageForDeletion,
    uploadImage,
  } = context

  const wrapper = document.createElement('div')
  wrapper.className = 'node'
  wrapper.style.setProperty('--depth', String(depth))

  const currentType = getValueType(value)
  const head = document.createElement('div')
  head.className = 'node-head'

  const kind = document.createElement('span')
  kind.className = 'node-kind'
  kind.textContent = currentType
  head.append(kind)
  wrapper.append(head)

  if (currentType === 'object') {
    const entries = Object.entries(value)
    entries.forEach(([key, childValue]) => {
      const entry = document.createElement('div')
      entry.className = 'entry'

      const entryHead = document.createElement('div')
      entryHead.className = 'entry-head'
      const keyLabel = document.createElement('span')
      keyLabel.className = 'key-label'
      keyLabel.textContent = key
      entryHead.append(keyLabel)
      entry.append(entryHead)

      entry.append(
        renderNode(
          childValue,
          (nextValue, options) => {
            value[key] = nextValue
            onReplace(value, options)
          },
          {
            ...context,
            depth: depth + 1,
            fieldKey: key,
            isRoot: false,
            pathSegments: [...pathSegments, key],
          },
        ),
      )

      wrapper.append(entry)
    })
  }

  if (currentType === 'array') {
    value.forEach((item, index) => {
      const entry = document.createElement('div')
      entry.className = 'entry'

      const entryHead = document.createElement('div')
      entryHead.className = 'entry-head'

      const indexLabel = document.createElement('span')
      indexLabel.className = 'index'
      indexLabel.textContent = `#${index}`

      const moveUp = document.createElement('button')
      moveUp.type = 'button'
      moveUp.textContent = 'Up'
      moveUp.disabled = index === 0
      moveUp.addEventListener('click', () => {
        const temp = value[index - 1]
        value[index - 1] = value[index]
        value[index] = temp
        onReplace(value, { rerender: true })
      })

      const moveDown = document.createElement('button')
      moveDown.type = 'button'
      moveDown.textContent = 'Down'
      moveDown.disabled = index === value.length - 1
      moveDown.addEventListener('click', () => {
        const temp = value[index + 1]
        value[index + 1] = value[index]
        value[index] = temp
        onReplace(value, { rerender: true })
      })

      const deleteButton = document.createElement('button')
      deleteButton.type = 'button'
      deleteButton.className = 'delete'
      deleteButton.textContent = 'Delete'
      deleteButton.addEventListener('click', () => {
        collectImagePaths(value[index]).forEach((imagePath) => onMarkImageForDeletion(imagePath))
        value.splice(index, 1)
        onReplace(value, { rerender: true })
      })

      entryHead.append(indexLabel, moveUp, moveDown, deleteButton)
      entry.append(entryHead)
      entry.append(
        renderNode(
          item,
          (nextValue, options) => {
            value[index] = nextValue
            onReplace(value, options)
          },
          {
            ...context,
            depth: depth + 1,
            fieldKey: String(index),
            isRoot: false,
            pathSegments: [...pathSegments, String(index)],
          },
        ),
      )
      wrapper.append(entry)
    })

    const addControls = document.createElement('div')
    addControls.className = 'add-controls'

    const addButton = document.createElement('button')
    addButton.type = 'button'
    addButton.textContent = 'Add entry'
    addButton.addEventListener('click', () => {
      value.push(
        makeTemplateFromArray({
          arrayValue: value,
          nodePath: pathSegments,
          activeFile,
          templateOverrides: TEMPLATE_OVERRIDES,
        }),
      )
      onReplace(value, { rerender: true })
    })

    addControls.append(addButton)
    wrapper.append(addControls)
  }

  if (!isRoot && ['string', 'number', 'boolean', 'null'].includes(currentType)) {
    const primitiveControls = document.createElement('div')
    primitiveControls.className = 'add-controls'

    if (currentType === 'string') {
      const input = document.createElement('input')
      input.className = 'primitive-value'
      input.value = String(value)
      input.addEventListener('input', () => {
        onReplace(input.value, { rerender: false })
      })
      primitiveControls.append(input)

      if (isLikelyImageField(fieldKey, value)) {
        /**
         * Why this exists:
         * Upload + optimization can take a few seconds, so each image field gets
         * a dedicated inline loader to make progress obvious to non-technical users.
         */
        const uploadButton = document.createElement('button')
        uploadButton.type = 'button'
        uploadButton.textContent = 'Upload image'
        uploadButton.setAttribute('aria-busy', 'false')

        const uploadProgress = document.createElement('span')
        uploadProgress.className = 'upload-progress'
        uploadProgress.hidden = true
        const uploadSpinner = document.createElement('span')
        uploadSpinner.className = 'upload-spinner'
        uploadSpinner.setAttribute('aria-hidden', 'true')
        const uploadText = document.createElement('span')
        uploadText.textContent = 'Uploading...'
        uploadProgress.append(uploadSpinner, uploadText)

        const picker = document.createElement('input')
        picker.type = 'file'
        picker.accept = '.png,.jpg,.jpeg,.jfif,.webp,.svg'
        picker.hidden = true

        uploadButton.addEventListener('click', () => picker.click())
        picker.addEventListener('change', async () => {
          const selected = picker.files && picker.files[0]
          if (!selected) return

          uploadButton.disabled = true
          uploadButton.setAttribute('aria-busy', 'true')
          uploadProgress.hidden = false
          onStatus('Uploading image and running optimizer...', 'dirty')

          try {
            const imagePath = await uploadImage({
              file: selected,
              fieldPath: pathSegments.join('.'),
              previousImagePath: input.value,
            })
            if (isManagedImagePublicPath(input.value) && input.value !== imagePath) {
              onMarkImageForDeletion(input.value)
            }
            input.value = imagePath
            onReplace(imagePath, { rerender: false })
            onStatus('Image uploaded. Save to finalize replacement cleanup.', 'dirty')
          } catch (error) {
            onStatus(error instanceof Error ? error.message : 'Image upload failed.', 'error')
          } finally {
            uploadButton.disabled = false
            uploadButton.setAttribute('aria-busy', 'false')
            uploadProgress.hidden = true
            picker.value = ''
          }
        })

        primitiveControls.append(uploadButton, uploadProgress, picker)
      }
    }

    if (currentType === 'number') {
      const input = document.createElement('input')
      input.className = 'primitive-value'
      input.type = 'number'
      input.value = Number.isFinite(value) ? String(value) : '0'
      input.addEventListener('input', () => {
        const parsed = Number(input.value)
        onReplace(Number.isFinite(parsed) ? parsed : 0, { rerender: false })
      })
      primitiveControls.append(input)
    }

    if (currentType === 'boolean') {
      const input = document.createElement('select')
      input.className = 'primitive-value'
      const trueOption = document.createElement('option')
      trueOption.value = 'true'
      trueOption.textContent = 'true'
      trueOption.selected = value === true
      const falseOption = document.createElement('option')
      falseOption.value = 'false'
      falseOption.textContent = 'false'
      falseOption.selected = value === false
      input.append(trueOption, falseOption)
      input.addEventListener('change', () => onReplace(input.value === 'true', { rerender: false }))
      primitiveControls.append(input)
    }

    if (currentType === 'null') {
      const info = document.createElement('span')
      info.textContent = 'null value'
      primitiveControls.append(info)
    }

    wrapper.append(primitiveControls)
  }

  return wrapper
}
