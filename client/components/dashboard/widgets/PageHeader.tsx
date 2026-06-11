'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  highlight,
  subtitle,
  actions,
}: {
  eyebrow?: string
  title: string
  highlight?: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div>
        {eyebrow && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 text-[11px] font-bold text-brand-primary uppercase tracking-[0.2em] mb-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
            {eyebrow}
          </motion.p>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-display text-balance text-2xl sm:text-3xl md:text-4xl font-black text-brand-text-primary leading-tight"
        >
          {title}
          {highlight && (
            <>
              {' '}
              <span className="text-gradient-magenta">{highlight}</span>
            </>
          )}
        </motion.h1>
        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-2 text-sm text-brand-text-muted max-w-2xl"
          >
            {subtitle}
          </motion.p>
        )}
      </div>
      {actions && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-2 flex-shrink-0"
        >
          {actions}
        </motion.div>
      )}
    </div>
  )
}
