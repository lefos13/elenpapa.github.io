/**
 * Why this exists:
 * Provides markdown formatting actions (bold, italic, link, quote, code, list)
 * and live character/word counters for guided content editing textareas & inputs.
 */

function applyWrap(textarea, before, after, defaultText = '') {
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? 0
  const value = textarea.value ?? ''
  const selectedText = value.slice(start, end)
  const textToWrap = selectedText || defaultText
  const replacement = `${before}${textToWrap}${after}`

  textarea.focus()
  if (typeof textarea.setRangeText === 'function') {
    textarea.setRangeText(replacement, start, end, 'end')
  } else {
    textarea.value = value.slice(0, start) + replacement + value.slice(end)
  }

  if (selectedText) {
    textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length)
  } else {
    const cursorPos = start + before.length
    textarea.setSelectionRange(cursorPos, cursorPos + defaultText.length)
  }

  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.dispatchEvent(new Event('change', { bubbles: true }))
}

function applyLinePrefix(textarea, prefix) {
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? 0
  const value = textarea.value ?? ''

  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  let lineEnd = value.indexOf('\n', end)
  if (lineEnd === -1) lineEnd = value.length

  const targetText = value.slice(lineStart, lineEnd)
  const lines = targetText.split('\n')
  const allPrefixed = lines.length > 0 && lines.every((line) => line.startsWith(prefix))
  const modifiedLines = lines.map((line) => {
    if (allPrefixed) {
      return line.slice(prefix.length)
    }
    return line.startsWith(prefix) ? line : `${prefix}${line}`
  })
  const replacement = modifiedLines.join('\n')

  textarea.focus()
  if (typeof textarea.setRangeText === 'function') {
    textarea.setRangeText(replacement, lineStart, lineEnd, 'select')
  } else {
    textarea.value = value.slice(0, lineStart) + replacement + value.slice(lineEnd)
    textarea.setSelectionRange(lineStart, lineStart + replacement.length)
  }

  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.dispatchEvent(new Event('change', { bubbles: true }))
}

function applyLink(textarea) {
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? 0
  const value = textarea.value ?? ''
  const selectedText = value.slice(start, end)

  let replacement = ''
  let selectStart = 0
  let selectEnd = 0

  if (!selectedText) {
    replacement = '[text](url)'
    selectStart = start + 7 // highlight "url"
    selectEnd = start + 10
  } else if (/^https?:\/\//i.test(selectedText.trim()) || selectedText.trim().startsWith('/')) {
    replacement = `[link](${selectedText.trim()})`
    selectStart = start + 1 // highlight "link"
    selectEnd = start + 5
  } else {
    replacement = `[${selectedText}](url)`
    selectStart = start + selectedText.length + 3 // highlight "url"
    selectEnd = start + selectedText.length + 6
  }

  textarea.focus()
  if (typeof textarea.setRangeText === 'function') {
    textarea.setRangeText(replacement, start, end, 'end')
  } else {
    textarea.value = value.slice(0, start) + replacement + value.slice(end)
  }

  textarea.setSelectionRange(selectStart, selectEnd)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.dispatchEvent(new Event('change', { bubbles: true }))
}

export function createMarkdownToolbar(textarea) {
  const toolbar = document.createElement('div')
  toolbar.className = 'markdown-toolbar'
  toolbar.setAttribute('role', 'toolbar')
  toolbar.setAttribute('aria-label', 'Markdown formatting tools')

  const actions = [
    {
      label: 'B',
      title: 'Bold (**text**)',
      ariaLabel: 'Bold formatting',
      className: 'markdown-toolbar-btn btn-bold',
      action: () => applyWrap(textarea, '**', '**'),
    },
    {
      label: 'I',
      title: 'Italic (*text*)',
      ariaLabel: 'Italic formatting',
      className: 'markdown-toolbar-btn btn-italic',
      action: () => applyWrap(textarea, '*', '*'),
    },
    {
      label: 'Link',
      title: 'Link ([text](url))',
      ariaLabel: 'Insert link',
      className: 'markdown-toolbar-btn btn-link',
      action: () => applyLink(textarea),
    },
    {
      label: 'Quote',
      title: 'Quote (> text)',
      ariaLabel: 'Quote formatting',
      className: 'markdown-toolbar-btn btn-quote',
      action: () => applyLinePrefix(textarea, '> '),
    },
    {
      label: 'Code',
      title: 'Inline code (`text`)',
      ariaLabel: 'Inline code formatting',
      className: 'markdown-toolbar-btn btn-code',
      action: () => applyWrap(textarea, '`', '`'),
    },
    {
      label: 'List',
      title: 'Bullet list (- item)',
      ariaLabel: 'Bullet list formatting',
      className: 'markdown-toolbar-btn btn-list',
      action: () => applyLinePrefix(textarea, '- '),
    },
  ]

  actions.forEach(({ label, title, ariaLabel, className, action }) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = className
    button.title = title
    button.setAttribute('aria-label', ariaLabel || title)
    button.textContent = label
    button.addEventListener('mousedown', (e) => {
      e.preventDefault()
    })
    button.addEventListener('click', (e) => {
      e.preventDefault()
      action()
    })
    toolbar.append(button)
  })

  return toolbar
}

export function createCharCounter(targetElement, { maxChars } = {}) {
  const counter = document.createElement('div')
  counter.className = 'field-char-counter'

  const charSpan = document.createElement('span')
  charSpan.className = 'char-count'
  const wordSpan = document.createElement('span')
  wordSpan.className = 'word-count'

  counter.append(charSpan, wordSpan)

  function update() {
    const value = targetElement.value || ''
    const chars = value.length
    const trimmed = value.trim()
    const words = trimmed ? trimmed.split(/\s+/).length : 0

    if (maxChars && typeof maxChars === 'number' && maxChars > 0) {
      charSpan.textContent = `${chars} / ${maxChars} chars`
      if (chars > maxChars) {
        counter.classList.add('is-over-limit')
        counter.classList.remove('is-near-limit')
      } else if (chars >= maxChars * 0.9) {
        counter.classList.add('is-near-limit')
        counter.classList.remove('is-over-limit')
      } else {
        counter.classList.remove('is-over-limit', 'is-near-limit')
      }
    } else {
      charSpan.textContent = `${chars} char${chars === 1 ? '' : 's'}`
    }

    wordSpan.textContent = `${words} word${words === 1 ? '' : 's'}`
  }

  targetElement.addEventListener('input', update)
  targetElement.addEventListener('change', update)
  update()

  return counter
}
