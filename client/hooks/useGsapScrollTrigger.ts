
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface ScrollTriggerConfig {
  animation?: gsap.TweenVars
  triggerConfig?: ScrollTrigger.Vars
  stagger?: number
  childSelector?: string
}

export function useGsapScrollTrigger<T extends HTMLElement = HTMLDivElement>(
  config?: ScrollTriggerConfig
): RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const ctx = gsap.context(() => {
      const targets = config?.childSelector
        ? el.querySelectorAll(config.childSelector)
        : el

      gsap.fromTo(
        targets,
        {
          opacity: 0,
          y: 40,
          ...config?.animation?.from,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power2.out',
          stagger: config?.stagger ?? 0,
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            toggleActions: 'play none none none',
            ...config?.triggerConfig,
          },
          ...config?.animation?.to,
        }
      )
    }, el)

    return () => ctx.revert()
  }, [])

  return ref
}
