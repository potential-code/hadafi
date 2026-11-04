'use client'

import { useSyncExternalStore } from 'react'

/** True while the media query matches (false during SSR). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined') return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Side panels sit beside the list from this width (sidebar + table + panel fit). */
export const WIDE_QUERY = '(min-width: 1280px)'

/** Bring a stacked panel into view on narrower screens. */
export function revealIfStacked(el: HTMLElement | null) {
  if (!el || typeof window === 'undefined') return
  if (window.matchMedia(WIDE_QUERY).matches) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
