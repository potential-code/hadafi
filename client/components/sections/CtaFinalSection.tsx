'use client'

import { useEffect, useRef, useMemo } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { CTA_FINAL } from '@/lib/constants'
import { MagneticButton } from '@/components/shared/MagneticButton'
import { useReducedMotion } from '@/hooks/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

const round4 = (n: number) => Math.round(n * 10000) / 10000

// Constellation node positions inside a normalized viewBox.
const STARS = Array.from({ length: 28 }).map((_, i) => ({
  id: i,
  x: round4((Math.sin(i * 1.7) * 0.5 + 0.5) * 100),
  y: round4((Math.cos(i * 2.3) * 0.5 + 0.5) * 100),
  r: round4(0.3 + (i % 5) * 0.18),
}))

// Lines connecting nearby stars to suggest constellations.
const LINES: Array<[number, number]> = [
  [0, 3], [3, 5], [5, 8], [8, 12], [12, 15],
  [2, 7], [7, 10], [10, 14], [14, 18], [18, 22],
  [1, 6], [6, 11], [11, 17], [17, 23], [23, 26],
  [4, 9], [9, 13], [13, 19], [19, 24], [24, 27],
  [16, 20], [20, 25],
]

export function CtaFinalSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const constellationRef = useRef<SVGSVGElement>(null)
  const reduced = useReducedMotion()

  const linesData = useMemo(
    () =>
      LINES.map(([a, b]) => {
        const A = STARS[a]
        const B = STARS[b]
        return { a: A, b: B, key: `${a}-${b}` }
      }),
    [],
  )

  useEffect(() => {
    const el = contentRef.current
    const section = sectionRef.current
    if (!el || !section || reduced) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el.children,
        { opacity: 0, y: 36 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: section, start: 'top 80%', toggleActions: 'play none none none' },
        },
      )

      // Constellation: stars twinkle, lines draw on scroll-in.
      const svg = constellationRef.current
      if (svg) {
        const lines = svg.querySelectorAll<SVGPathElement>('[data-line]')
        const stars = svg.querySelectorAll<SVGCircleElement>('[data-star]')
        gsap.set(lines, { strokeDasharray: 100, strokeDashoffset: 100, opacity: 0 })
        gsap.set(stars, { opacity: 0, scale: 0.4, transformOrigin: 'center' })

        gsap.to(stars, {
          opacity: 1,
          scale: 1,
          duration: 0.6,
          ease: 'back.out(2)',
          stagger: { amount: 0.8, from: 'random' },
          scrollTrigger: { trigger: section, start: 'top 75%', once: true },
        })
        gsap.to(lines, {
          opacity: 0.55,
          strokeDashoffset: 0,
          duration: 1.4,
          ease: 'power2.out',
          stagger: { amount: 0.7, from: 'random' },
          scrollTrigger: { trigger: section, start: 'top 75%', once: true },
        })

        // Subtle twinkle loop
        stars.forEach((s, i) => {
          gsap.to(s, {
            opacity: 0.4,
            duration: 1.4 + (i % 4) * 0.4,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
            delay: 1 + (i % 7) * 0.18,
          })
        })
      }
    }, section)
    return () => ctx.revert()
  }, [reduced])

  return (
    <section ref={sectionRef} className="relative py-32 bg-mesh-dark overflow-hidden">
      <div className="absolute inset-0 bg-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />

      {/* Constellation backdrop */}
      <svg
        ref={constellationRef}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden
      >
        <defs>
          <radialGradient id="star-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#e83e94" stopOpacity="0" />
          </radialGradient>
        </defs>
        {linesData.map(({ a, b, key }) => (
          <line
            key={key}
            data-line
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="rgba(232,62,148,0.45)"
            strokeWidth="0.12"
            opacity={reduced ? 0.4 : undefined}
          />
        ))}
        {STARS.map((s) => (
          <circle
            key={s.id}
            data-star
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="url(#star-glow)"
            opacity={reduced ? 0.7 : undefined}
          />
        ))}
      </svg>

      <motion.div
        aria-hidden
        className="absolute -bottom-40 -right-40 w-[640px] h-[640px] rounded-full bg-brand-primary/30 blur-3xl"
        animate={reduced ? undefined : { scale: [1, 1.15, 1] }}
        transition={{ duration: 8, repeat: Infinity }}
      />
      <motion.div
        aria-hidden
        className="absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full bg-brand-violet/40 blur-3xl"
        animate={reduced ? undefined : { scale: [1.1, 1, 1.1] }}
        transition={{ duration: 10, repeat: Infinity }}
      />
      <div ref={contentRef} className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur-md text-white/80 text-xs font-medium mb-7">
          <Sparkles className="w-3.5 h-3.5 text-brand-primary-light" />
          Free to join · No credit card
        </span>
        <h2 className="font-bold text-white leading-[1.1] tracking-tight [hyphens:none] text-balance text-[clamp(1.5rem,5.5vw,3.25rem)]">
          Boost Your Revenue, Cut Costs – Join the Program for Free!
        </h2>
        <p className="text-white/70 text-lg max-w-2xl mx-auto mt-6 leading-relaxed">
          {CTA_FINAL.subtext}
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <MagneticButton href={CTA_FINAL.ctaHref} variant="primary" size="lg" className="px-10 py-4 text-base">
            {CTA_FINAL.ctaLabel}
            <ArrowRight className="w-5 h-5 ml-2" />
          </MagneticButton>
          <MagneticButton href={CTA_FINAL.loginHref} variant="ghost" size="lg" className="px-10 py-4 text-base">
            {CTA_FINAL.loginLabel}
          </MagneticButton>
        </div>
      </div>
    </section>
  )
}
