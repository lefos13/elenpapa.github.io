import { ViteSSG } from 'vite-ssg'
import { nextTick } from 'vue'
import { routes } from './router'
import App from './App.vue'
import './styles/base.css'
import reveal from './directives/reveal'
import { trackPageView } from './utils/analytics'

const HASH_SCROLL_MAX_ATTEMPTS = 40
const HASH_SCROLL_RETRY_DELAY = 40

const waitForHashElement = (hash: string, attempt = 0): Promise<HTMLElement | null> => {
  if (typeof document === 'undefined') return Promise.resolve(null)

  const element = document.querySelector<HTMLElement>(hash)
  if (element) return Promise.resolve(element)

  if (attempt >= HASH_SCROLL_MAX_ATTEMPTS) return Promise.resolve(null)

  return new Promise((resolve) => {
    globalThis.setTimeout(() => {
      waitForHashElement(hash, attempt + 1).then(resolve)
    }, HASH_SCROLL_RETRY_DELAY)
  })
}

const waitForStableTop = (
  element: HTMLElement,
  previousTop?: number,
  attempt = 0,
): Promise<number> => {
  if (typeof window === 'undefined') return Promise.resolve(0)

  const currentTop = element.getBoundingClientRect().top + window.scrollY
  const hasPreviousTop = typeof previousTop === 'number'

  if (hasPreviousTop && Math.abs(currentTop - (previousTop as number)) <= 1) {
    return Promise.resolve(currentTop)
  }

  if (attempt >= HASH_SCROLL_MAX_ATTEMPTS) {
    return Promise.resolve(currentTop)
  }

  return new Promise((resolve) => {
    globalThis.setTimeout(() => {
      waitForStableTop(element, currentTop, attempt + 1).then(resolve)
    }, HASH_SCROLL_RETRY_DELAY)
  })
}

const getHeaderOffset = (): number => {
  if (typeof document === 'undefined') return 0
  const header = document.querySelector<HTMLElement>('.site-header')
  return header?.offsetHeight ?? 0
}

const getScrollBehavior = (): ScrollBehavior => {
  if (typeof window === 'undefined') return 'auto'
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export const createApp = ViteSSG(
  App,
  {
    routes,
    base: import.meta.env.BASE_URL,
    scrollBehavior(to, _from, savedPosition) {
      if (savedPosition) {
        return savedPosition
      }
      if (to.hash) {
        return waitForHashElement(to.hash).then((element) => {
          const behavior = getScrollBehavior()

          if (!element) {
            return { left: 0, top: 0, behavior }
          }

          return waitForStableTop(element).then((elementTop) => {
            const headerOffset = getHeaderOffset()
            const adjustedTop = elementTop - headerOffset
            return { left: 0, top: Math.max(adjustedTop, 0), behavior }
          })
        })
      }
      return { top: 0 }
    },
  },
  ({ app, router, isClient }) => {
    // Register reveal directive for both SSR and client
    // The directive has getSSRProps for server rendering
    app.directive('reveal', reveal)
    if (isClient) {
      router.isReady().then(() => {
        trackPageView({
          page_name: String(router.currentRoute.value.name ?? ''),
          page_path: router.currentRoute.value.fullPath,
        })
      })
      router.afterEach((to) => {
        nextTick(() => {
          trackPageView({
            page_name: String(to.name ?? ''),
            page_path: to.fullPath,
          })
        })
      })
    }
  },
)
