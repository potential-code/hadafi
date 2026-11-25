'use client'

import { useEffect } from 'react'

/**
 * Names the browser tab after what the page shows once it has loaded, e.g.
 * "AI Fundamentals | Hadafi". The page's static metadata title ("Course")
 * stays as the fallback while loading and for search engines.
 */
export function useDocumentTitle(name: string | null | undefined) {
  useEffect(() => {
    if (!name) return
    const previous = document.title
    document.title = `${name} | Hadafi`
    return () => {
      document.title = previous
    }
  }, [name])
}
