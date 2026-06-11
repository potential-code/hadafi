'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { STAKEHOLDER } from '@/lib/constants'
import type { StakeholderKind } from '@/lib/constants/content'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { MagneticButton } from '@/components/shared/MagneticButton'
import { StakeholderRegisterDialog } from '@/components/sections/StakeholderRegisterDialog'

export function StakeholderSection() {
  const [activeKind, setActiveKind] = useState<StakeholderKind | null>(null)

  return (
    <section id="stakeholder" className="relative py-28 bg-mesh-soft overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <SectionHeader
            badge={STAKEHOLDER.badge}
            heading="Become a Program"
            highlight="Stakeholder"
            subtext={STAKEHOLDER.intro}
          />
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-8"
          >
            <MagneticButton href={STAKEHOLDER.smeCtaHref} variant="primary" size="lg">
              {STAKEHOLDER.smeCtaLabel}
              <ArrowRight className="w-4 h-4 ml-2" />
            </MagneticButton>
          </motion.div>
        </div>

        {/* Card grid with AI-generated images */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {STAKEHOLDER.cards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ delay: 0.06 * i, duration: 0.5 }}
              whileHover={{ y: -6 }}
              className="group relative rounded-2xl bg-white border border-brand-surface-2 hover:border-brand-primary/30 shadow-sm hover:shadow-2xl transition-all overflow-hidden flex flex-col"
            >
              <div className="relative aspect-[5/3] overflow-hidden bg-brand-surface">
                <img
                  src={card.image}
                  alt=""
                  aria-hidden
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  loading="lazy"
                />
                <span className="absolute top-3 right-3 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/90 backdrop-blur text-brand-primary text-[11px] font-extrabold shadow">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <div className="relative flex-1 flex flex-col p-6">
                <h3 className="text-lg font-bold text-brand-text-primary leading-tight group-hover:text-brand-primary transition-colors">
                  {card.title}
                </h3>
                <p className="text-sm text-brand-text-muted leading-relaxed mt-2 flex-1">
                  {card.description}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveKind(card.kind as StakeholderKind)}
                  className="mt-5 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-brand-primary/10 text-brand-primary text-sm font-semibold hover:bg-brand-primary hover:text-white transition-all group-hover:gap-2"
                >
                  {card.ctaLabel}
                  <ArrowUpRight className="w-4 h-4 transition-transform" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <StakeholderRegisterDialog
        kind={activeKind}
        open={activeKind !== null}
        onClose={() => setActiveKind(null)}
      />
    </section>
  )
}
