'use client'

/** Compact segmented toggle (pressed button sits on a white chip). */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: ReactNode; count?: number }[]
  value: T
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex gap-0.5 rounded-[10px] bg-ui-surface-2 p-[3px]', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
              on ? 'bg-ui-surface text-ui-text shadow-[0_1px_2px_rgba(23,23,28,0.08)]' : 'text-ui-muted hover:text-ui-text',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="font-medium text-ui-muted tabular-nums">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
