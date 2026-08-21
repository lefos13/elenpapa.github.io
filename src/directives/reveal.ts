import type { ObjectDirective } from 'vue'

type RevealOptions = {
  rootMargin?: string
  threshold?: number
  once?: boolean
}

const observerMap = new WeakMap<HTMLElement, IntersectionObserver>()

const revealDirective: ObjectDirective<HTMLElement, RevealOptions | undefined> = {
  // SSR support - add classes during server-side rendering
  getSSRProps() {
    return {
      class: 'reveal reveal--shown',
    }
  },

  mounted(el, binding) {
    // SSR safety: only run on client
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      el.classList.add('reveal', 'reveal--shown')
      return
    }

    const opts = binding.value ?? {}
    const once = opts.once ?? true
    const threshold = opts.threshold ?? 0.15
    const rootMargin = opts.rootMargin ?? '0px 0px -10% 0px'

    const prefersReduced = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.classList.add('reveal')
    if (prefersReduced) {
      el.classList.add('reveal--shown')
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('reveal--shown')
            if (once) observer.unobserve(el)
          }
        }
      },
      { root: null, threshold, rootMargin },
    )

    observer.observe(el)
    observerMap.set(el, observer)

    // Mobile Safari can occasionally miss the initial intersection on route changes.
    // Force-reveal if the element is already in the viewport after mount.
    globalThis.requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      const viewportHeight = globalThis.innerHeight || document.documentElement.clientHeight
      const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth
      const isVisible =
        rect.bottom >= 0 &&
        rect.right >= 0 &&
        rect.top <= viewportHeight &&
        rect.left <= viewportWidth

      if (isVisible) {
        el.classList.add('reveal--shown')
        if (once) observer.unobserve(el)
      }
    })
  },

  unmounted(el) {
    const obs = observerMap.get(el)
    obs?.unobserve(el)
    observerMap.delete(el)
  },
}

export default revealDirective
