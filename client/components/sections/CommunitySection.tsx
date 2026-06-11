'use client'

import { motion } from 'framer-motion'
import { COMMUNITY } from '@/lib/constants'
import { SectionHeader } from '@/components/shared/SectionHeader'

export function CommunitySection() {
  return (
    <section
      id="community"
      className="relative py-32 sm:py-40 overflow-hidden"
      style={{ backgroundImage: 'url(/images/redesign/community.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black/75 pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <SectionHeader
          badge={COMMUNITY.badge}
          heading="Meet Our"
          highlight="Community"
          tone="dark"
        />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-8 relative rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md px-6 py-6 text-left"
        >
          <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-primary/90 text-white text-[11px] font-semibold uppercase tracking-widest shadow-sm">
            Our Story
          </span>
          <p className="text-white text-base sm:text-lg leading-relaxed">
            Since{' '}
            <span className="font-bold text-brand-primary-light">2013</span>
            , Hadafi has supported over{' '}
            <span className="font-bold text-brand-primary-light">100,000 women entrepreneurs</span>{' '}
            around the globe.
          </p>
          <p className="mt-2 text-white/70 text-sm sm:text-base leading-relaxed">
            We are eager to share your story and empower more women to achieve their business goals.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
