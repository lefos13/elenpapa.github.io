export type AnalyticsParams = Record<string, string | number | boolean | undefined>

type GtagCommand = 'config' | 'event' | 'set'

type GtagFn = (command: GtagCommand, target: string, params?: Record<string, unknown>) => void

declare global {
  interface Window {
    gtag?: GtagFn
  }
}

const getGtag = (): GtagFn | undefined => {
  if (typeof window === 'undefined') return undefined
  return window.gtag
}

export const trackEvent = (eventName: string, params: AnalyticsParams = {}): void => {
  const gtag = getGtag()
  if (!gtag) return
  gtag('event', eventName, params)
}

export const trackPageView = (params: AnalyticsParams = {}): void => {
  const gtag = getGtag()
  if (!gtag || typeof window === 'undefined') return
  gtag('event', 'page_view', {
    page_location: window.location.href,
    page_path: window.location.pathname + window.location.search + window.location.hash,
    page_title: document.title,
    ...params,
  })
}
