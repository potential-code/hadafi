'use client'

import { useRef, MouseEvent } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import {
  ArrowUpRight,
  UserCheck,
  TrendingUp,
  Landmark,
  Building2,
  GraduationCap,
  Rocket,
  Star,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  'user-check': UserCheck,
  'trending-up': TrendingUp,
  landmark: Landmark,
  'building-2': Building2,
  'graduation-cap': GraduationCap,
  rocket: Rocket,
}

interface StakeholderCardProps {
  title: string
  description: string
  ctaLabel: string
  ctaHref: string
  icon: string
  index?: number
}

export function StakeholderCard({
  title,
  description,
  ctaLabel,
  ctaHref,
  icon,
  index = 0,
}: StakeholderCardProps) {
  const ref = useRef<HTMLAnchorElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const xs = useSpring(x, { stiffness: 250, damping: 22 })
  const ys = useSpring(y, { stiffness: 250, damping: 22 })
  const rotateX = useTransform(ys, [-0.5, 0.5], ['7deg', '-7deg'])
  const rotateY = useTransform(xs, [-0.5, 0.5], ['-7deg', '7deg'])

  function move(e: MouseEvent<HTMLAnchorElement>) {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    x.set((e.clientX - r.left) / r.width - 0.5)
    y.set((e.clientY - r.top) / r.height - 0.5)
  }
  function leave() {
    x.set(0)
    y.set(0)
  }

  const IconComponent = ICON_MAP[icon] ?? Star

  return (
    <motion.a
      ref={ref}
      href={ctaHref}
      onMouseMove={move}
      onMouseLeave={leave}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d', transformPerspective: 800 }}
      className="group relative block h-full rounded-2xl bg-white border border-brand-surface-2 p-7 shadow-sm hover:shadow-2xl hover:border-brand-primary/30 transition-all overflow-hidden"
    >
      <span className="absolute top-3 right-4 text-[80px] font-black text-brand-primary/[0.05] leading-none select-none pointer-events-none">
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-violet flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform">
          <IconComponent className="w-7 h-7 text-white" />
        </div>
        <h3 className="font-bold text-lg text-brand-text-primary mb-2 group-hover:text-brand-primary transition-colors">
          {title}
        </h3>
        <p className="text-sm text-brand-text-muted leading-relaxed mb-5">{description}</p>
        <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary">
          {ctaLabel}
          <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>
    </motion.a>
  )
}
