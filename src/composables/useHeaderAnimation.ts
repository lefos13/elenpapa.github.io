// Composable for Header GSAP bubble animation (desktop only)
import { ref, watch, type Ref } from 'vue'
import gsap from 'gsap'

interface UseHeaderAnimationOptions {
  headerEl: Ref<HTMLElement | null>
  logoEl: Ref<HTMLImageElement | null>
  linksEl: Ref<HTMLElement | null>
}

export function useHeaderAnimation({ headerEl, logoEl, linksEl }: UseHeaderAnimationOptions) {
  // Bubble state (desktop only): morph to floating bubble on scroll, expand on hover/focus
  const isBubble = ref(false)
  const isExpanded = ref(false)
  // Track if we're currently animating (to prevent scroll jitter during animation)
  const isAnimating = ref(false)

  // Desktop check
  const isDesktop = () => globalThis.innerWidth >= 1024

  // Check if we should use GSAP transitions (desktop only, respects reduced motion)
  const shouldAnimate = () => {
    if (typeof window === 'undefined') return false
    return isDesktop() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  // Animate header collapsing into bubble
  function animateToBubble() {
    if (!headerEl.value) return
    isAnimating.value = true

    const header = headerEl.value
    const brandImg = logoEl.value

    // Kill any existing animations
    gsap.killTweensOf([header, linksEl.value, brandImg])

    // Timeline: shrink header to bubble
    const tl = gsap.timeline({
      onComplete: () => {
        isAnimating.value = false
        // Clear inline styles on links so CSS hover states work
        if (linksEl.value) {
          gsap.set(linksEl.value, { clearProps: 'all' })
        }
      },
    })

    // Shrink header to bubble
    tl.to(
      header,
      {
        duration: 0.5,
        top: 'clamp(0.75rem, 2.5vh, 1.5rem)',
        left: 60,
        right: 'auto',
        width: 120,
        height: 120,
        borderRadius: 999,
        ease: 'power3.out',
      },
      0,
    )

    // Shrink logo
    if (brandImg) {
      tl.to(
        brandImg,
        {
          duration: 0.4,
          height: 90,
          padding: 0,
          ease: 'power2.out',
        },
        0,
      )
    }
  }

  // Animate header expanding from bubble to full nav bar
  function animateToFull() {
    if (!headerEl.value) return
    isAnimating.value = true

    const header = headerEl.value
    const links = linksEl.value
    const brandImg = logoEl.value

    // IMMEDIATELY hide links before expansion starts
    if (links) {
      gsap.set(links, {
        opacity: 0,
        visibility: 'hidden',
        pointerEvents: 'none',
      })
    }

    // Kill any existing animations
    gsap.killTweensOf([header, links, brandImg])

    // Timeline: expand header from left to right, then fade in links
    const tl = gsap.timeline({
      onComplete: () => {
        isAnimating.value = false
        // Clear inline styles so CSS takes over
        gsap.set(header, { clearProps: 'all' })
        if (links) gsap.set(links, { clearProps: 'all' })
        if (brandImg) gsap.set(brandImg, { clearProps: 'all' })
      },
    })

    // Expand header from left to right
    // First animate left to 0, then width expands, creating left-to-right effect
    tl.to(header, {
      duration: 0.2,
      top: 0,
      ease: 'power2.out',
    })

    tl.to(
      header,
      {
        duration: 0.5,
        left: 0,
        width: '100%',
        ease: 'power2.inOut',
      },
      '-=0.1',
    )

    tl.to(
      header,
      {
        duration: 0.4,
        height: '113px',
        borderRadius: 0,
        right: 0,
        ease: 'power2.out',
      },
      '-=0.3',
    )

    // Grow logo back
    if (brandImg) {
      tl.to(
        brandImg,
        {
          duration: 0.4,
          height: 'clamp(48px, 12vw, 96px)',
          padding: 6,
          ease: 'power2.out',
        },
        '-=0.4',
      )
    }

    // Fade in links after header fully expanded
    if (links) {
      tl.to(links, {
        duration: 0.3,
        opacity: 1,
        visibility: 'visible',
        pointerEvents: 'auto',
        ease: 'power2.out',
      })
    }
  }

  // Watch isBubble state changes and trigger GSAP animations
  watch(
    isBubble,
    (newVal, oldVal) => {
      if (!headerEl.value || !shouldAnimate()) return
      if (newVal === oldVal) return

      if (newVal) {
        // Transitioning TO bubble (scroll down)
        // IMMEDIATELY hide links before any animation or class change takes effect
        if (linksEl.value) {
          gsap.set(linksEl.value, {
            opacity: 0,
            visibility: 'hidden',
            pointerEvents: 'none',
          })
        }
        animateToBubble()
      } else {
        // Transitioning FROM bubble to full nav (scroll up)
        animateToFull()
      }
    },
    { flush: 'sync' },
  ) // flush: 'sync' ensures this runs synchronously before DOM updates

  // Update bubble state based on scroll position and header height
  const updateBubble = () => {
    if (!headerEl.value) return
    // Skip state updates while animating to prevent jitter
    if (isAnimating.value) return
    if (!isDesktop()) {
      isBubble.value = false
      isExpanded.value = false
      return
    }
    const threshold = headerEl.value.offsetHeight || 0
    const shouldBubble = globalThis.scrollY > threshold

    // Always collapse when transitioning states
    if (isBubble.value !== shouldBubble) {
      isExpanded.value = false
    }

    isBubble.value = shouldBubble
  }

  let ticking = false
  const onScroll = () => {
    if (!ticking) {
      ticking = true
      globalThis.requestAnimationFrame(() => {
        updateBubble()
        ticking = false
      })
    }
  }

  // Hover/focus expansion handlers
  function onEnter() {
    if (!isDesktop()) return
    if (isBubble.value) isExpanded.value = true
  }

  function onLeave() {
    if (!isDesktop()) return
    if (isBubble.value) isExpanded.value = false
  }

  function onFocusIn() {
    if (!isDesktop()) return
    if (isBubble.value) isExpanded.value = true
  }

  function onFocusOut(e: FocusEvent) {
    if (!isDesktop()) return
    // Collapse when focus leaves the header entirely
    const related = e.relatedTarget as Node | null
    if (isBubble.value && headerEl.value && related && !headerEl.value.contains(related)) {
      isExpanded.value = false
    }
  }

  // Handle escape key to collapse expansion
  function onEscapeKey() {
    if (isDesktop()) {
      isExpanded.value = false
    }
  }

  return {
    isBubble,
    isExpanded,
    isAnimating,
    onScroll,
    onEnter,
    onLeave,
    onFocusIn,
    onFocusOut,
    onEscapeKey,
    isDesktop,
  }
}
