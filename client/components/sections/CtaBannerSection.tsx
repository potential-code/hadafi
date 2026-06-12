'use client'

import { motion, type Variants } from 'framer-motion'
import { ArrowRight, Sparkles, Users, BookOpen, Brain } from 'lucide-react'
import { CTA_BANNER } from '@/lib/constants'
import { MagneticButton } from '@/components/shared/MagneticButton'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const STATS = [
  { icon: Users, value: '100,000+', label: 'Women Empowered' },
  { icon: BookOpen, value: 'Free', label: 'Always Free' },
  { icon: Brain, value: '24/7', label: 'AI Mentors' },
]

const lineVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut', delay: i * 0.15 } }),
}

export function CtaBannerSection() {
  const reduced = useReducedMotion()
  const lines = CTA_BANNER.heading.split('\n')

  return (
    <section className="relative py-28 sm:py-36 overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/women-collab.png')" }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/72" />
      <div className="absolute inset-0 bg-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />

      {/* Glowing orbs */}
      <motion.div
        aria-hidden
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[450px] rounded-full bg-brand-primary/20 blur-3xl"
        animate={reduced ? undefined : { opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-brand-violet/25 blur-3xl"
        animate={reduced ? undefined : { opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, delay: 1 }}
      />

      {/* Decorative rings */}
      <div aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border border-white/[0.04] pointer-events-none" />
      <div aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-white/[0.06] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">

        {/* Badge */}
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-primary/30 bg-brand-primary/10 backdrop-blur-md text-brand-primary-light text-xs font-semibold mb-7 tracking-wide uppercase"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Women&apos;s Empowerment Program · Free to Join
        </motion.span>

        {/* Heading */}
        <h2 className="text-display text-balance text-3xl sm:text-5xl md:text-6xl font-bold leading-[1.05]">
          {lines.map((line, li) => (
            <motion.span
              key={li}
              custom={li}
              variants={reduced ? undefined : lineVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className={`block ${li === 1 ? 'text-gradient-magenta' : 'text-white'}`}
            >
              {line}
            </motion.span>
          ))}
        </h2>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.25 }}
          className="mt-6 text-white/65 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed"
        >
          {CTA_BANNER.subtext}
        </motion.p>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.35 }}
          className="mt-8 flex flex-wrap justify-center gap-6 sm:gap-10"
        >
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-primary/15 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-brand-primary-light" />
              </div>
              <div className="text-left">
                <p className="text-white font-bold text-sm leading-none">{value}</p>
                <p className="text-white/50 text-xs mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.45 }}
          className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center"
        >
          <MagneticButton href={CTA_BANNER.ctaHref} variant="primary" size="lg" className="px-10 py-4 text-base w-full sm:w-auto">
            {CTA_BANNER.ctaLabel}
            <ArrowRight className="w-5 h-5 ml-2" />
          </MagneticButton>
          <MagneticButton href={CTA_BANNER.loginHref} variant="ghost" size="lg" className="px-8 py-4 text-base text-white/70 hover:text-white w-full sm:w-auto">
            {CTA_BANNER.loginLabel}
          </MagneticButton>
        </motion.div>
      </div>
    </section>
  )
}
