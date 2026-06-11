'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function AdminChartCard({
  title,
  subtitle,
  icon,
  actions,
  delay = 0,
  className,
  children,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  delay?: number
  className?: string
  children: ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative rounded-2xl border bg-white border-brand-surface-2 hover:border-brand-primary/30 hover:shadow-xl shadow-sm overflow-hidden transition-all',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-brand-surface-2/70">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-brand-primary/10 text-brand-primary">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-bold leading-tight truncate text-brand-text-primary">{title}</h3>
            {subtitle && <p className="text-xs mt-0.5 truncate text-brand-text-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </motion.section>
  )
}
