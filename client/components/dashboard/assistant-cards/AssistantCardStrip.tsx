'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface AssistantCardStripProps {
  children: React.ReactNode
  label?: string
}

export function AssistantCardStrip({ children, label }: AssistantCardStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // "Back" and "forward" follow the reading direction. In a right-to-left
  // chat (Arabic, Urdu) the strip starts at the right and scrollLeft runs
  // from 0 down to negative values, so the offset is read as a magnitude.
  const [canScrollBack, setCanScrollBack] = useState(false)
  const [canScrollForward, setCanScrollForward] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const offset = Math.abs(el.scrollLeft)
    setCanScrollBack(offset > 4)
    setCanScrollForward(offset + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll, { passive: true })
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      ro.disconnect()
    }
  }, [checkScroll])

  const scroll = (to: 'back' | 'forward') => {
    const el = scrollRef.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    const step = to === 'forward' ? 220 : -220
    el.scrollBy({ left: rtl ? -step : step, behavior: 'smooth' })
  }

  const arrowBase =
    'absolute top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-ui-surface border border-ui-line shadow-ui flex items-center justify-center text-ui-text hover:bg-ui-surface-2 transition-colors'

  return (
    <div className="mt-2 w-full">
      {label && (
        <p className="text-[12px] text-ui-muted font-semibold mb-2">
          {label}
        </p>
      )}
      <div className="relative">
        {canScrollBack && (
          <button
            onClick={() => scroll('back')}
            aria-label="Scroll back"
            className={`${arrowBase} -start-3`}
          >
            <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto pb-2 hadafi-card-scroll"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          {children}
        </div>

        {canScrollForward && (
          <button
            onClick={() => scroll('forward')}
            aria-label="Scroll forward"
            className={`${arrowBase} -end-3`}
          >
            <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
          </button>
        )}
      </div>
    </div>
  )
}

export function AssistantCardSkeleton() {
  return (
    <AssistantCardStrip>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="w-52 flex-shrink-0 rounded-[14px] bg-ui-surface-2 animate-pulse h-40"
        />
      ))}
    </AssistantCardStrip>
  )
}
