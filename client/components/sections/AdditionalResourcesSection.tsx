'use client'

import { motion } from 'framer-motion'
import { REDESIGN_ASSETS } from '@/lib/constants'

export function AdditionalResourcesSection() {
  return (
    <section
      id="additional-resources"
      className="relative pt-4 pb-16 bg-white overflow-hidden"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <div className="rounded-3xl border border-brand-surface-2 bg-gradient-to-br from-white to-brand-surface/40 shadow-sm p-6 sm:p-10">
            <img
              src={REDESIGN_ASSETS.additionalResources.src}
              alt={REDESIGN_ASSETS.additionalResources.alt}
              className="w-full h-auto block mx-auto max-w-3xl"
              loading="lazy"
            />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
