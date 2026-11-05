'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Chart card: title, optional subtitle and actions, chart body. `icon`/`delay` kept for compatibility. */
export function AdminChartCard({
  title,
  subtitle,
  actions,
  className,
  children,
  aside,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  delay?: number
  className?: string
  /** Big number shown top-right (e.g. a total). */
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3.5 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]', className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ui-text">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-ui-muted">{subtitle}</p>}
        </div>
        {(actions || aside !== undefined) && (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {aside !== undefined && <span className="text-[22px] font-semibold tabular-nums text-ui-text">{aside}</span>}
          </div>
        )}
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
