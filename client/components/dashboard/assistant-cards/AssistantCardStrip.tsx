'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface AssistantCardStripProps {
  children: React.ReactNode
  label?: string
}

export function AssistantCardStrip({ children, label }: AssistantCardStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
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

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -220 : 220, behavior: 'smooth' })
  }

  const arrowBase =
    'absolute top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white border border-brand-surface-2 shadow-md flex items-center justify-center text-brand-text-muted hover:text-brand-primary hover:border-brand-primary/40 hover:shadow-lg transition-all'

  return (
    <div className="mt-2 w-full">
      {label && (
        <p className="text-[10px] text-brand-text-muted uppercase tracking-wider font-semibold mb-2">
          {label}
        </p>
      )}
      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            aria-label="Scroll left"
            className={`${arrowBase} -left-3`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto pb-2 smeep-card-scroll"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          {children}
        </div>

        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            aria-label="Scroll right"
            className={`${arrowBase} -right-3`}
          >
            <ChevronRight className="w-4 h-4" />
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
          className="w-52 flex-shrink-0 rounded-xl bg-brand-surface-2 animate-pulse h-36"
        />
      ))}
    </AssistantCardStrip>
  )
}
