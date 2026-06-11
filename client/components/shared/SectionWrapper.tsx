'use client'

import { ReactNode } from 'react'
import { useGsapScrollTrigger } from '@/hooks/useGsapScrollTrigger'
import { cn } from '@/lib/utils'

interface SectionWrapperProps {
  children: ReactNode
  className?: string
  id?: string
  childSelector?: string  // if set, animates children matching this CSS selector instead of the whole wrapper
  stagger?: number
}

export function SectionWrapper({
  children,
  className,
  id,
  childSelector,
  stagger = 0,
}: SectionWrapperProps) {
  const ref = useGsapScrollTrigger<HTMLElement>({ childSelector, stagger })

  return (
    <section ref={ref} id={id} className={cn('w-full', className)}>
      {children}
    </section>
  )
}
