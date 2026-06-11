'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export function DashboardCard({
  title,
  subtitle,
  icon,
  ctaLabel,
  ctaHref,
  onCtaClick,
  delay = 0,
  className,
  bodyClassName,
  children,
  tone = 'light',
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  ctaLabel?: string
  ctaHref?: string
  onCtaClick?: () => void
  delay?: number
  className?: string
  bodyClassName?: string
  children: ReactNode
  tone?: 'light' | 'dark'
}) {
  const isDark = tone === 'dark'
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative rounded-2xl border overflow-hidden transition-all',
        isDark
          ? 'bg-brand-deep border-white/10 text-white'
          : 'bg-white border-brand-surface-2 hover:border-brand-primary/30 hover:shadow-xl shadow-sm',
        className,
      )}
    >
      <header className={cn('flex items-center justify-between gap-3 px-5 py-4 border-b', isDark ? 'border-white/10' : 'border-brand-surface-2/70')}>
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', isDark ? 'bg-white/[0.06] text-brand-primary-light' : 'bg-brand-primary/10 text-brand-primary')}>
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h3 className={cn('font-bold leading-tight truncate', isDark ? 'text-white' : 'text-brand-text-primary')}>
              {title}
            </h3>
            {subtitle && (
              <p className={cn('text-xs mt-0.5 truncate', isDark ? 'text-white/55' : 'text-brand-text-muted')}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {ctaLabel && (ctaHref || onCtaClick) && (
          ctaHref ? (
            <Link
              href={ctaHref}
              onClick={onCtaClick}
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:gap-1.5 transition-all"
            >
              {ctaLabel}
              <ArrowRight className="w-3 h-3" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onCtaClick}
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:gap-1.5 transition-all"
            >
              {ctaLabel}
              <ArrowRight className="w-3 h-3" />
            </button>
          )
        )}
      </header>
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </motion.section>
  )
}
