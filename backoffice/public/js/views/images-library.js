/**
 * Why this exists:
 * The read-only images inventory has its own rendering concerns (grouping,
 * collapsing, usage navigation), so it is isolated from editor/controller logic.
 */
export function renderImagesLibrary({
  mount,
  images,
  isSectionCollapsed,
  setSectionCollapsed,
  onOpenUsage,
}) {
  mount.innerHTML = ''

  if (!images.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'No images found.'
    mount.append(empty)
    return
  }

  const bySection = new Map()
  images.forEach((image) => {
    if (!bySection.has(image.section)) {
      bySection.set(image.section, [])
    }
    bySection.get(image.section).push(image)
  })

  Array.from(bySection.keys())
    .sort((left, right) => left.localeCompare(right))
    .forEach((sectionName) => {
      const section = document.createElement('section')
      section.className = 'image-section'

      const header = document.createElement('button')
      header.type = 'button'
      header.className = 'image-section-toggle'
      const imageCount = bySection.get(sectionName).length
      const collapsed = isSectionCollapsed(sectionName)
      header.innerHTML = `<span>${sectionName}</span><span>${imageCount} image(s) · ${collapsed ? 'collapsed' : 'expanded'}</span>`
      section.append(header)

      const grid = document.createElement('div')
      grid.className = 'image-grid'
      grid.hidden = collapsed
      header.addEventListener('click', () => {
        const nextCollapsed = !grid.hidden
        grid.hidden = nextCollapsed
        setSectionCollapsed(sectionName, nextCollapsed)
        header.innerHTML = `<span>${sectionName}</span><span>${imageCount} image(s) · ${nextCollapsed ? 'collapsed' : 'expanded'}</span>`
      })

      bySection.get(sectionName).forEach((image) => {
        const card = document.createElement('article')
        card.className = 'image-card'

        const preview = document.createElement('img')
        preview.className = 'image-preview'
        preview.src = image.publicPath
        preview.alt = image.name
        preview.loading = 'lazy'
        card.append(preview)

        const body = document.createElement('div')
        body.className = 'image-meta'
        body.innerHTML = `
          <strong>${image.name}</strong>
          <span>${image.sizeLabel}</span>
          <code>${image.relativePath}</code>
        `

        const usageTitle = document.createElement('p')
        usageTitle.className = 'usage-title'
        usageTitle.textContent = image.usages.length
          ? 'Used in:'
          : 'Not referenced in content JSON.'
        body.append(usageTitle)

        if (image.usages.length) {
          const usageList = document.createElement('ul')
          usageList.className = 'usage-list'
          image.usages.forEach((usage) => {
            const usageItem = document.createElement('li')
            const usageLabel = document.createElement('span')
            usageLabel.textContent = `${usage.file} -> ${usage.jsonPath}`

            const editButton = document.createElement('button')
            editButton.type = 'button'
            editButton.textContent = 'Open'
            editButton.addEventListener('click', () => onOpenUsage(usage))

            usageItem.append(usageLabel, editButton)
            usageList.append(usageItem)
          })
          body.append(usageList)
        }

        card.append(body)
        grid.append(card)
      })

      section.append(grid)
      mount.append(section)
    })
}
