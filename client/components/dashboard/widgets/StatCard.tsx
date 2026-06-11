'use client'

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, type ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export function StatCard({
  label,
  value,
  suffix = '',
  prefix = '',
  icon,
  trend,
  accent = 'from-brand-primary to-brand-violet',
  delay = 0,
  variant = 'filled',
}: {
  label: string
  value: number
  suffix?: string
  prefix?: string
  icon: ReactNode
  trend?: string
  accent?: string
  delay?: number
  variant?: 'default' | 'filled'
}) {
  const reduced = useReducedMotion()
  const count = useMotionValue(0)
  const rounded = useTransform(count, (v) => `${prefix}${Math.round(v).toLocaleString()}${suffix}`)

  useEffect(() => {
    if (reduced) {
      count.set(value)
      return
    }
    const controls = animate(count, value, { duration: 1.4, delay, ease: 'easeOut' })
    return () => controls.stop()
  }, [value, delay, reduced, count])

  const filled = variant === 'filled'

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className={`group relative overflow-hidden rounded-2xl p-5 shadow-sm transition-all ${
        filled
          ? `${accent.startsWith('bg-') ? accent : `bg-gradient-to-br ${accent}`} hover:shadow-xl hover:shadow-black/20`
          : 'bg-white border border-brand-surface-2 hover:shadow-xl hover:border-brand-primary/30'
      }`}
    >
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-2xl group-hover:opacity-70 transition-opacity pointer-events-none" />

      <div className="relative">
        {/* label */}
        <p className={`text-[11px] font-bold uppercase tracking-[0.18em] mb-3 ${filled ? 'text-white/65' : 'text-brand-text-muted'}`}>
          {label}
        </p>

        {/* count left, icon right */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <motion.p className={`text-2xl sm:text-3xl font-black leading-none tabular-nums ${filled ? 'text-white' : 'text-brand-text-primary'}`}>
              {rounded}
            </motion.p>
            {trend && (
              <p className={`mt-2 text-[11px] font-semibold ${filled ? 'text-white/70' : 'text-brand-text-muted'}`}>
                {trend}
              </p>
            )}
          </div>
          <div className={`shrink-0 group-hover:scale-110 transition-transform ${filled ? 'text-white/50 group-hover:text-white/80' : 'text-brand-primary/25 group-hover:text-brand-primary/40'}`}>
            {icon}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
