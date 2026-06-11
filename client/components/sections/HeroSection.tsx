'use client'

import { motion } from 'framer-motion'
import { ChevronDown, Sparkles, ArrowRight } from 'lucide-react'
import { HERO, REDESIGN_ASSETS } from '@/lib/constants'
import { MagneticButton } from '@/components/shared/MagneticButton'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { LandingRegistrationChat } from '../landing/LandingRegistrationChat'

export function HeroSection() {
  const reduced = useReducedMotion()

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center overflow-hidden bg-mesh-dark"
    >
      {/* Full-bleed AI background image */}
      <div className="absolute inset-0">
        <img
          src={REDESIGN_ASSETS.heroBg.src}
          alt=""
          aria-hidden
          className="w-full h-full object-cover"
          loading="eager"
        />
        {/* Readability overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-brand-dark/85 via-brand-dark/55 to-brand-dark/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/40 via-transparent to-brand-dark/80" />
      </div>

      {/* Layered glow accents */}
      <div className="absolute inset-0 bg-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />
      <motion.div
        aria-hidden
        className="absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full bg-brand-primary/25 blur-3xl"
        animate={reduced ? undefined : { scale: [1, 1.15, 1], opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-0 right-0 w-[520px] h-[520px] rounded-full bg-brand-violet/35 blur-3xl"
        animate={reduced ? undefined : { scale: [1.1, 1, 1.1], opacity: [0.35, 0.6, 0.35] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
        {/* Left column — hero content (55%) */}
        <div className="w-full lg:w-[55%] text-center lg:text-left flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur-md text-white/80 text-xs font-medium mb-7 self-center lg:self-start"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-primary-light" />
            <span className="tracking-wide uppercase text-[11px]">SME Empowerment Program</span>
            <span className="hidden sm:inline text-white/40">·</span>
            <span className="hidden sm:inline text-white/60">100% free, global</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-display text-balance text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-bold text-white leading-[1.08] drop-shadow-[0_4px_30px_rgba(0,0,0,0.45)]"
          >
            {HERO.headline}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-5 text-sm sm:text-base text-white/75 max-w-2xl mx-auto lg:mx-0 leading-relaxed"
          >
            {HERO.subtext}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-9 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
          >
            <MagneticButton href={HERO.ctaHref} variant="primary" size="lg" magnetic={false}>
              {HERO.ctaLabel}
              <ArrowRight className="w-4 h-4 ml-2" />
            </MagneticButton>
            <MagneticButton href={HERO.loginHref} variant="ghost" size="lg" magnetic={false}>
              {HERO.loginLabel}
            </MagneticButton>
          </motion.div>

          {/* Trust strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="mt-10 flex flex-wrap justify-center lg:justify-start gap-x-8 gap-y-3 text-xs text-white/55"
          >
            <div><span className="text-white font-semibold text-base mr-1">300k+</span> SMEs reached</div>
            <div><span className="text-white font-semibold text-base mr-1">50+</span> countries</div>
            <div><span className="text-white font-semibold text-base mr-1">Since 2010</span></div>
          </motion.div>

        </div>

        {/* Right column — registration chatbot (45%) */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full lg:w-[45%] flex-shrink-0 h-[50vh] lg:h-[calc(100vh-10rem)] lg:-mt-4"
        >
          <LandingRegistrationChat />
        </motion.div>
      </div>

      {/* Scroll indicator — centered at bottom */}
      <motion.div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center text-white/40"
        animate={reduced ? undefined : { y: [0, 6, 0] }}
        transition={{ repeat: Infinity, duration: 1.8 }}
      >
        <span className="text-[10px] tracking-[0.3em] uppercase mb-1">Scroll</span>
        <ChevronDown className="w-5 h-5" />
      </motion.div>
    </section>
  )
}
