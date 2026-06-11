'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface AnimatedCounterProps {
  value: number
  display: string   // pre-formatted display string — shown statically if animate=false
  animate: boolean
  className?: string
  duration?: number
}

export function AnimatedCounter({
  value,
  display,
  animate,
  className,
  duration = 2,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!animate || !ref.current) return

    const el = ref.current
    // Extract suffix from display string (e.g. "300,000+" → "+")
    const suffix = display.replace(/[\d,]+/g, '').trim()
    const obj = { val: 0 }

    const ctx = gsap.context(() => {
      gsap.to(obj, {
        val: value,
        duration,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none none',
          once: true,
        },
        onUpdate() {
          el.textContent = Math.round(obj.val).toLocaleString() + suffix
        },
      })
    }, el)

    return () => ctx.revert()
  }, [value, display, animate, duration])

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  )
}
