'use client'

import { useEffect, useState } from 'react'

/** True on screens at least `minWidth` wide. Starts false so server and first client render agree. */
export function useMinWidth(minWidth: number): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`)
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [minWidth])
  return wide
}
