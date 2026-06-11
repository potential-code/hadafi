'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { CTA_BANNER } from '@/lib/constants'
import { MagneticButton } from '@/components/shared/MagneticButton'
import { useReducedMotion } from '@/hooks/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

export function CtaBannerSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const reduced = useReducedMotion()

  // Split-and-reassemble: animate each character into place from a randomized offset.
  useEffect(() => {
    const el = headingRef.current
    const section = sectionRef.current
    if (!el || !section || reduced) return

    const chars = el.querySelectorAll<HTMLElement>('[data-char]')
    if (!chars.length) return

    const ctx = gsap.context(() => {
      gsap.set(chars, {
        opacity: 0,
        x: () => gsap.utils.random(-80, 80),
        y: () => gsap.utils.random(-60, 60),
        rotate: () => gsap.utils.random(-25, 25),
        scale: 0.6,
        filter: 'blur(8px)',
      })
      gsap.to(chars, {
        opacity: 1,
        x: 0,
        y: 0,
        rotate: 0,
        scale: 1,
        filter: 'blur(0px)',
        duration: 0.9,
        ease: 'power3.out',
        stagger: { amount: 0.55, from: 'random' },
        scrollTrigger: {
          trigger: section,
          start: 'top 80%',
          toggleActions: 'play none none reverse',
        },
      })
    }, section)
    return () => ctx.revert()
  }, [reduced])

  // Render heading with each char wrapped, but keep whole words together
  // so the browser cannot break mid-word (e.g. "Cost|s").
  const heading = CTA_BANNER.heading
  const lines = heading.split('\n')

  return (
    <section ref={sectionRef} className="relative py-24 sm:py-28 bg-mesh-dark overflow-hidden">
      <div className="absolute inset-0 bg-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />
      <motion.div
        aria-hidden
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-brand-primary/30 blur-3xl"
        animate={reduced ? undefined : { opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur-md text-white/80 text-xs font-medium mb-7"
        >
          <Sparkles className="w-3.5 h-3.5 text-brand-primary-light" />
          Limited program · Free to join
        </motion.span>
        <h2
          ref={headingRef}
          aria-label={heading}
          className="text-display text-balance text-3xl sm:text-5xl md:text-6xl font-bold text-white leading-[1.05]"
        >
          {reduced
            ? lines.map((line, li) => (
                <span key={`l-${li}`} className="block">
                  {line}
                </span>
              ))
            : lines.map((line, li) => {
                const words = line.split(/(\s+)/)
                return (
                  <span key={`l-${li}`} className="block">
                    {words.map((word, wi) => {
                      if (/^\s+$/.test(word)) {
                        return (
                          <span key={`s-${li}-${wi}`} aria-hidden style={{ whiteSpace: 'pre' }}>
                            {word}
                          </span>
                        )
                      }
                      return (
                        <span
                          key={`w-${li}-${wi}`}
                          aria-hidden
                          className="inline-block whitespace-nowrap"
                        >
                          {Array.from(word).map((ch, ci) => (
                            <span key={ci} data-char className="inline-block">
                              {ch}
                            </span>
                          ))}
                        </span>
                      )
                    })}
                  </span>
                )
              })}
        </h2>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-10"
        >
          <MagneticButton href={CTA_BANNER.ctaHref} variant="primary" size="lg" className="px-12 py-5 text-lg">
            {CTA_BANNER.ctaLabel}
            <ArrowRight className="w-5 h-5 ml-2" />
          </MagneticButton>
        </motion.div>
      </div>
    </section>
  )
}
