'use client'

import { useEffect, useState } from 'react'

/**
 * True on screens narrower than `maxWidth` (default: phones). Starts false so
 * the server render and the first client render agree, then follows the
 * screen. Used to swap long placeholders for short ones, which a phone would
 * otherwise cut off mid-word.
 */
export function useNarrow(maxWidth = 480): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth - 1}px)`)
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [maxWidth])
  return narrow
}
