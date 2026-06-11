'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { JOURNEY, REDESIGN_ASSETS } from '@/lib/constants'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { MagneticButton } from '@/components/shared/MagneticButton'

export function JourneySection() {
  return (
    <section
      id="journey"
      className="relative py-28 bg-white overflow-hidden"
    >
      <div className="absolute -top-40 right-0 w-[600px] h-[600px] rounded-full bg-brand-primary/[0.04] blur-3xl pointer-events-none" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <SectionHeader
            badge={JOURNEY.badge}
            heading="Your AI-powered"
            highlight="Journey"
            subtext={JOURNEY.subtext}
          />
        </div>

        {/* Journey flow image */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative max-w-5xl mx-auto mb-20"
        >
          <img
            src={REDESIGN_ASSETS.journeyFlow.src}
            alt={REDESIGN_ASSETS.journeyFlow.alt}
            className="w-full h-auto block"
            loading="lazy"
          />
        </motion.div>

        {/* 6 step cards with AI-generated images */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {JOURNEY.items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: 0.06 * i, duration: 0.5 }}
              whileHover={{ y: -6 }}
              className="group relative rounded-2xl bg-white border border-brand-surface-2 p-6 shadow-sm hover:shadow-lg hover:border-brand-primary/30 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 rounded-2xl bg-brand-primary/15 blur-md group-hover:bg-brand-primary/30 transition-colors" />
                  <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-brand-primary/15 bg-gradient-to-br from-brand-surface to-white shadow-md group-hover:scale-105 transition-transform">
                    <img
                      src={item.image}
                      alt=""
                      aria-hidden
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-brand-primary tracking-widest">
                    STEP {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-bold text-brand-text-primary mt-1 leading-tight">
                    {item.title}
                  </h3>
                  <p className="text-sm text-brand-text-muted mt-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <MagneticButton href={JOURNEY.ctaHref} variant="primary" size="lg">
            {JOURNEY.ctaLabel}
            <ArrowRight className="w-4 h-4 ml-2" />
          </MagneticButton>
        </div>
      </div>
    </section>
  )
}
