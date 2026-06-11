'use client'

import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  label,
}: {
  value: number // 0..100
  size?: number
  stroke?: number
  label?: string
}) {
  const reduced = useReducedMotion()
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const target = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${size}-${value}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9f2063" />
            <stop offset="100%" stopColor="#4c1d6e" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(159,32,99,0.12)"
          strokeWidth={stroke}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#ring-${size}-${value})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          whileInView={{ strokeDashoffset: reduced ? target : target }}
          viewport={{ once: true }}
          transition={{ duration: reduced ? 0 : 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[13px] font-black text-brand-text-primary leading-none">{Math.round(value)}%</span>
        {label && <span className="text-[8px] uppercase tracking-wider text-brand-text-muted mt-0.5">{label}</span>}
      </div>
    </div>
  )
}
