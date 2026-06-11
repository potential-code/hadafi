'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  badge?: string
  heading: ReactNode
  highlight?: string
  subtext?: string
  align?: 'center' | 'left'
  tone?: 'light' | 'dark'
  className?: string
}

export function SectionHeader({
  badge,
  heading,
  highlight,
  subtext,
  align = 'center',
  tone = 'light',
  className,
}: SectionHeaderProps) {
  const isDark = tone === 'dark'
  return (
    <div
      className={cn(
        align === 'center' ? 'text-center mx-auto' : 'text-left',
        'max-w-3xl',
        className,
      )}
    >
      {badge && (
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5 }}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] mb-5',
            isDark
              ? 'bg-white/5 border border-white/10 text-brand-primary-light'
              : 'bg-brand-primary/10 text-brand-primary',
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
          {badge}
        </motion.span>
      )}
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, delay: 0.05 }}
        className={cn(
          'text-display text-balance text-3xl sm:text-4xl md:text-5xl font-bold leading-[1.05]',
          isDark ? 'text-white' : 'text-brand-text-primary',
        )}
      >
        {heading}
        {highlight && (
          <>
            {' '}
            <span className="text-gradient-magenta">{highlight}</span>
          </>
        )}
      </motion.h2>
      {subtext && (
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className={cn(
            'mt-5 text-base sm:text-lg leading-relaxed text-balance',
            isDark ? 'text-white/70' : 'text-brand-text-muted',
            align === 'center' && 'mx-auto',
          )}
        >
          {subtext}
        </motion.p>
      )}
    </div>
  )
}
