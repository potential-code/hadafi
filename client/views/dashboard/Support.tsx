'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, HelpCircle, Mail, MessageSquare, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { FAQS } from '@/lib/dashboardData'
import { cn } from '@/lib/utils'

export default function SupportPage() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <DashboardLayout>
      <PageHeader
        eyebrow="Support"
        title="How can we"
        highlight="help?"
        subtitle="Search the knowledge base, message us, or chat with the SMEEP AI assistant."
      />

      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        <div className="col-span-12 lg:col-span-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-white border border-brand-surface-2 overflow-hidden"
          >
            <header className="px-6 py-5 border-b border-brand-surface-2 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                <HelpCircle className="w-4 h-4" />
              </span>
              <div>
                <h3 className="font-bold text-brand-text-primary">Frequently asked</h3>
                <p className="text-xs text-brand-text-muted">Top questions from SMEEP members.</p>
              </div>
            </header>
            <ul className="divide-y divide-brand-surface-2">
              {FAQS.map((f, i) => {
                const isOpen = i === open
                return (
                  <li key={f.q}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-brand-surface/50 transition-colors"
                    >
                      <span className="flex-1 text-sm font-bold text-brand-text-primary">{f.q}</span>
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 text-brand-text-muted transition-transform',
                          isOpen && 'rotate-180 text-brand-primary',
                        )}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <p className="px-6 pb-5 text-sm text-brand-text-muted leading-relaxed">
                            {f.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        </div>

        <aside className="col-span-12 lg:col-span-4 space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="relative overflow-hidden rounded-2xl bg-brand-deep text-white p-5 border border-white/10"
          >
            <div className="absolute inset-0 bg-noise opacity-[0.05] mix-blend-overlay pointer-events-none" />
            <Sparkles className="w-6 h-6 text-brand-primary-light mb-2" />
            <h3 className="text-lg font-black">Try the AI assistant</h3>
            <p className="mt-1 text-sm text-white/65">
              Get instant answers about SMEEP, your account, or your business.
            </p>
            <Link
              href="/dashboard"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white text-brand-primary px-4 py-2 text-sm font-bold hover:bg-brand-primary-light hover:text-white transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Open AI assistant
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl bg-white border border-brand-surface-2 p-5"
          >
            <Mail className="w-6 h-6 text-brand-primary mb-2" />
            <h3 className="font-bold text-brand-text-primary">Email support</h3>
            <p className="text-sm text-brand-text-muted mt-1">
              We typically reply within one working day.
            </p>
            <a
              href="mailto:smeep@potential.com"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-brand-primary hover:gap-2 transition-all"
            >
              smeep@potential.com →
            </a>
          </motion.div>
        </aside>
      </div>
    </DashboardLayout>
  )
}
