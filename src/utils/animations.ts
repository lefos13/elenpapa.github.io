// Centralized animation configurations for consistent motion across the app
// Uses @vueuse/motion with automatic prefers-reduced-motion support

export const fadeInUp = {
  initial: {
    opacity: 0,
    y: 20,
  },
  enter: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 600,
      ease: 'easeOut',
    },
  },
}

export const fadeIn = {
  initial: {
    opacity: 0,
  },
  enter: {
    opacity: 1,
    transition: {
      duration: 400,
      ease: 'easeOut',
    },
  },
}

export const slideInLeft = {
  initial: {
    opacity: 0,
    x: -30,
  },
  enter: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 500,
      ease: 'easeOut',
    },
  },
}

export const slideInRight = {
  initial: {
    opacity: 0,
    x: 30,
  },
  enter: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 500,
      ease: 'easeOut',
    },
  },
}

export const scaleIn = {
  initial: {
    opacity: 0,
    scale: 0.95,
  },
  enter: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 500,
      ease: 'easeOut',
    },
  },
}

// Stagger utility for animating lists
export const staggerChildren = (index: number, baseDelay = 0) => ({
  transition: {
    delay: baseDelay + index * 120,
  },
})

// Custom easing functions
export const easings = {
  easeOutQuart: 'cubic-bezier(0.25, 1, 0.5, 1)',
  easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
}
