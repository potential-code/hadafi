'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check, GraduationCap, Sparkles, UserCheck, Gift } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ABOUT, REDESIGN_ASSETS } from '@/lib/constants'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { MagneticButton } from '@/components/shared/MagneticButton'
import { useReducedMotion } from '@/hooks/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

const FEATURES = [
  { icon: GraduationCap, label: 'Free Training & Events', desc: 'Courses, webinars, and live sessions — always free' },
  { icon: Sparkles,      label: 'AI Mentors 24/7',        desc: 'Instant guidance and answers, any time you need' },
  { icon: UserCheck,     label: '1-on-1 Expert Sessions', desc: 'Book private time with real industry specialists' },
  { icon: Gift,          label: 'Partner Offers',         desc: 'Exclusive discounts and deals for members only' },
] as const

const STATS = [
  { value: 100000, display: '100K+', label: 'Women entrepreneurs' },
  { value: 50, display: '50+', label: 'Countries' },
  { value: 2013, display: 'Since 2013', label: 'Program launched' },
] as const

function formatStat(n: number, original: number) {
  if (original === 2013) return 'Since 2013'
  if (original >= 1000) return `${Math.round(n / 1000)}K+`
  return `${Math.round(n)}+`
}

export function AboutSection() {
  const reduced = useReducedMotion()
  const statsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reduced || !statsRef.current) return
    const nodes = statsRef.current.querySelectorAll<HTMLElement>('[data-stat]')
    const ctxs: gsap.Context[] = []
    nodes.forEach((node) => {
      const target = Number(node.dataset.stat)
      const obj = { v: 0 }
      const ctx = gsap.context(() => {
        gsap.to(obj, {
          v: target,
          duration: 1.6,
          ease: 'power2.out',
          scrollTrigger: { trigger: node, start: 'top 85%', once: true },
          onUpdate: () => {
            node.textContent = formatStat(obj.v, target)
          },
        })
      }, node)
      ctxs.push(ctx)
    })
    return () => ctxs.forEach((c) => c.revert())
  }, [reduced])

  return (
    <section id="about" className="relative py-28 bg-mesh-soft overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-14 items-center">
        {/* Image */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative order-2 lg:order-1"
        >
          <div className="relative rounded-3xl overflow-hidden border border-brand-primary/10 shadow-xl">
            <img
              src={REDESIGN_ASSETS.aboutGlobe.src}
              alt={REDESIGN_ASSETS.aboutGlobe.alt}
              className="w-full h-auto block"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/60 via-transparent to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between text-white">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/60">Reach</p>
                <p className="text-2xl font-bold leading-tight">100,000+ Women</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/60">Countries</p>
                <p className="text-2xl font-bold leading-tight">50+</p>
              </div>
            </div>
          </div>
          <motion.div
            animate={reduced ? undefined : { y: [-6, 6, -6] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-5 -right-5 bg-white rounded-2xl shadow-xl p-4 border border-brand-primary/10 hidden sm:block"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center">
                <Check className="w-5 h-5 text-brand-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-brand-text-primary leading-tight">100% Free</p>
                <p className="text-[11px] text-brand-text-muted">No cost to join</p>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Copy */}
        <div className="order-1 lg:order-2">
          <SectionHeader badge={ABOUT.badge} heading="About The" highlight="Program" align="left" />
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-brand-text-muted leading-relaxed"
          >
            A free global program by Potential.org — built for women entrepreneurs ready to start, grow, and lead.
          </motion.p>

          {/* Feature cards */}
          <div className="mt-7 grid grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, label, desc }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.07 * i + 0.3, duration: 0.4 }}
                className="group relative overflow-hidden flex flex-col gap-1 p-4 pt-5 rounded-2xl border border-brand-primary/10 bg-gradient-to-br from-brand-primary/[0.05] to-transparent hover:border-brand-primary/25 hover:from-brand-primary/[0.09] transition-all duration-200 cursor-default min-h-[96px]"
              >
                {/* Top accent line */}
                <div className="absolute top-0 left-3 right-3 h-px rounded-full bg-gradient-to-r from-transparent via-brand-primary/50 to-transparent" />
                {/* Watermark icon */}
                <Icon
                  className="absolute -bottom-3 -left-3 w-16 h-16 text-brand-primary opacity-[0.18] group-hover:opacity-[0.28] transition-opacity duration-300 pointer-events-none"
                  strokeWidth={1}
                />
                {/* Text */}
                <p className="relative z-10 text-sm font-semibold text-brand-text-primary leading-tight">{label}</p>
                <p className="relative z-10 text-[12px] text-brand-text-muted leading-snug">{desc}</p>
              </motion.div>
            ))}
          </div>

          {/* GSAP Stat counters — social proof strip below features */}
          <div
            ref={statsRef}
            className="mt-5 flex items-stretch divide-x divide-brand-primary/10 rounded-2xl border border-brand-primary/10 bg-gradient-to-r from-brand-primary/[0.04] to-transparent overflow-hidden"
          >
            {STATS.map((s) => (
              <div key={s.label} className="flex-1 px-4 py-4 text-center">
                <div
                  data-stat={s.value}
                  className="text-2xl sm:text-3xl font-extrabold text-gradient-magenta leading-none"
                >
                  {s.display}
                </div>
                <p className="text-[11px] sm:text-xs text-brand-text-muted mt-1.5 font-medium">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="mt-10"
          >
            <MagneticButton href={ABOUT.ctaHref} variant="primary" size="lg">
              {ABOUT.ctaLabel}
              <ArrowRight className="w-4 h-4 ml-2" />
            </MagneticButton>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
