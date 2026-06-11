'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface MagneticButtonProps {
  href?: string
  children: ReactNode
  variant?: 'primary' | 'ghost' | 'outline'
  size?: 'md' | 'lg'
  className?: string
  onClick?: () => void
  /** Kept for backward compatibility; magnetic follow is no longer applied. */
  magnetic?: boolean
}

export function MagneticButton({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className,
  onClick,
}: MagneticButtonProps) {
  const base =
    'group/mb relative inline-flex items-center justify-center font-semibold rounded-xl transition-colors whitespace-nowrap overflow-hidden isolate'
  const sizes = size === 'lg' ? 'px-9 py-4 text-base' : 'px-7 py-3 text-sm'
  const variants = {
    primary:
      'bg-brand-primary text-white hover:bg-brand-primary-dark shadow-[0_10px_30px_-10px_rgba(159,32,99,0.7)]',
    ghost:
      'bg-white/10 text-white hover:bg-white/15 border border-white/15 backdrop-blur-md',
    outline:
      'border border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white',
  }

  const inner = (
    <span className={cn(base, sizes, variants[variant], className)}>
      {/* Gloss sheen sweep on hover — the only motion effect */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 overflow-hidden rounded-[inherit]"
      >
        <span
          className={cn(
            'absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 transition-transform duration-700 ease-out',
            'translate-x-[-150%] group-hover/mb:translate-x-[450%]',
            variant === 'outline'
              ? 'bg-gradient-to-r from-transparent via-brand-primary/25 to-transparent'
              : 'bg-gradient-to-r from-transparent via-white/35 to-transparent',
          )}
        />
      </span>
      <span className="relative z-10 inline-flex items-center">{children}</span>
    </span>
  )

  if (href)
    return (
      <a href={href} onClick={onClick} className="inline-block">
        {inner}
      </a>
    )
  return (
    <button type="button" onClick={onClick} className="inline-block">
      {inner}
    </button>
  )
}
