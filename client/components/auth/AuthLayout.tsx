'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { REDESIGN_ASSETS } from '@/lib/constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface AuthLayoutProps {
  badge?: string
  heading: ReactNode
  subheading: string
  altPrompt: { text: string; ctaLabel: string; ctaHref: string }
  topRightPrompt?: { text: string; ctaLabel: string; ctaHref: string }
  children: ReactNode
}

const STATS = [
  { value: '100K+', label: 'Women entrepreneurs' },
  { value: '50+', label: 'Countries reached' },
  { value: 'Free', label: 'No credit card ever' },
]

export function AuthLayout({
  badge,
  heading,
  subheading,
  altPrompt,
  topRightPrompt,
  children,
}: AuthLayoutProps) {
  const reduced = useReducedMotion()

  return (
    <div className="min-h-screen bg-mesh-dark text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />

      <div className="relative z-10 grid lg:grid-cols-2 min-h-screen">

        {/* ── Left: image panel ── */}
        <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden">
          {/* Background image */}
          <img
            src="/images/redesign/community.png"
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {/* Layered overlay: deep brand colour → transparent → violet at bottom */}
          <div className="absolute inset-0 bg-gradient-to-br from-brand-deep/90 via-brand-deep/65 to-brand-violet/85" />
          {/* Subtle mesh texture on top */}
          <div className="absolute inset-0 opacity-20 mix-blend-overlay bg-mesh-dark" />
          {/* Left-edge vignette so content text pops */}
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-brand-deep/60 to-transparent" />

          {/* Top content */}
          <div className="relative z-10 p-12 xl:p-16">
            <Link href="/" className="inline-block mb-10">
              <img
                src={REDESIGN_ASSETS.logo.src}
                alt={REDESIGN_ASSETS.logo.alt}
                className="h-10 w-auto brightness-0 invert"
              />
            </Link>

            <motion.div
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <h2 className="text-display text-balance text-4xl xl:text-5xl font-bold leading-[1.05] max-w-md">
                Empower your business{' '}
                <span className="text-gradient-magenta">with Hadafi — for free.</span>
              </h2>
              <p className="text-white/60 mt-5 max-w-sm leading-relaxed text-sm">
                Training, mentors, tools, and a global community of 100,000+ women entrepreneurs.
                Everything you need to start and grow your business.
              </p>

              <ul className="mt-8 space-y-2.5 text-sm text-white/75">
                {[
                  '24/7 AI mentors built for women entrepreneurs',
                  'Live events with global industry experts',
                  'Exclusive partner offers & discounts',
                  'No credit card. No catch.',
                ].map((line) => (
                  <li key={line} className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 flex-shrink-0 rounded-full bg-brand-primary-light" />
                    {line}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          {/* Bottom: social proof stats */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 p-12 xl:p-16"
          >
            <div className="border-t border-white/10 pt-8 grid grid-cols-3 gap-4">
              {STATS.map(({ value, label }) => (
                <div key={label}>
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-xs text-white/50 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </aside>

        {/* ── Right: form panel ── */}
        <main className="relative flex items-center justify-center px-4 sm:px-8 py-12 lg:py-16 bg-white text-brand-text-primary">
          {/* Mobile logo */}
          <Link href="/" className="lg:hidden absolute top-6 left-6">
            <img
              src={REDESIGN_ASSETS.logo.src}
              alt={REDESIGN_ASSETS.logo.alt}
              className="h-9 w-auto"
            />
          </Link>

          {/* Top-right switch prompt */}
          {topRightPrompt && (
            <p className="absolute top-6 right-6 text-sm text-brand-text-secondary hidden sm:block">
              {topRightPrompt.text}{' '}
              <Link
                href={topRightPrompt.ctaHref}
                className="text-brand-primary hover:text-brand-primary-dark font-semibold transition-colors"
              >
                {topRightPrompt.ctaLabel}
              </Link>
            </p>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md"
          >
            <div className="text-center lg:text-left mb-7">
              {badge && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-semibold tracking-wide mb-3">
                  {badge}
                </span>
              )}
              <h1 className="text-display text-balance text-3xl sm:text-4xl font-bold leading-tight text-brand-text-primary">
                {heading}
              </h1>
              <p className="text-brand-text-secondary text-sm mt-2.5">{subheading}</p>
            </div>

            {children}

            <p className="text-center lg:text-left text-sm text-brand-text-secondary mt-6">
              {altPrompt.text}{' '}
              <Link
                href={altPrompt.ctaHref}
                className="text-brand-primary hover:text-brand-primary-dark font-semibold transition-colors"
              >
                {altPrompt.ctaLabel}
              </Link>
            </p>
          </motion.div>
        </main>
      </div>
    </div>
  )
}
