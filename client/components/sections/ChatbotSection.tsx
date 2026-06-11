'use client'

import { motion } from 'framer-motion'
import { Sparkles, Send } from 'lucide-react'
import { CHATBOT } from '@/lib/constants'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export function ChatbotSection() {
  const reduced = useReducedMotion()
  return (
    <section id="ai-assistant" className="relative py-28 bg-mesh-dark overflow-hidden">
      <div className="absolute inset-0 bg-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <SectionHeader
            badge={CHATBOT.badge}
            heading={
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center justify-center">
                <span className="text-white mr-2">Sana –</span>
                <span className="text-brand-primary">Your AI Business Assistant</span>
              </span>
            }
            subtext={CHATBOT.subtext}
            tone="dark"
          />
    

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap justify-center gap-2 mt-7"
          >
            {CHATBOT.capabilities.map((cap) => (
              <span
                key={cap}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/80 text-xs font-medium backdrop-blur-md"
              >
                <Sparkles className="w-3 h-3 text-brand-primary-light" />
                {cap}
              </span>
            ))}
          </motion.div>
        </div>

        {/* Chat preview */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7 }}
          className="relative max-w-4xl mx-auto"
        >
          {/* Orb */}
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-10">
            <motion.div
              animate={reduced ? undefined : { y: [-6, 6, -6] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="relative w-16 h-16 rounded-full overflow-hidden border-4 border-brand-deep shadow-2xl"
            >
              <img src="/images/redesign/smeep-avatar-96.png" alt="Sana avatar" className="w-full h-full object-cover" />
              <motion.div
                aria-hidden
                className="absolute inset-0 rounded-full"
                animate={reduced ? undefined : { boxShadow: ['0 0 0 0 rgba(232,62,148,0.5)', '0 0 0 24px rgba(232,62,148,0)'] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              />
            </motion.div>
          </div>

          <div className="relative pt-20 rounded-3xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 backdrop-blur-xl p-6 sm:p-10 shadow-2xl">
            {/* Conversation */}
            <div className="space-y-4 mb-8">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="flex justify-end"
              >
                <div className="max-w-md bg-brand-primary text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm shadow-lg">
                  Create a marketing plan for my new D2C coffee brand in Lagos.
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.7 }}
                className="flex items-end gap-2.5"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-white/20">
                  <img src="/images/redesign/smeep-avatar-96.png" alt="Sana" className="w-full h-full object-cover" />
                </div>
                <div className="max-w-md bg-white/10 border border-white/10 text-white/90 rounded-2xl rounded-bl-sm px-4 py-3 text-sm backdrop-blur-md">
                  Drafting your plan now — I'll cover positioning, channels, KPIs, and a 90-day rollout.
                  <motion.span
                    animate={reduced ? undefined : { opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="inline-flex gap-1 ml-2 align-middle"
                  >
                    <span className="w-1 h-1 rounded-full bg-white" />
                    <span className="w-1 h-1 rounded-full bg-white" />
                    <span className="w-1 h-1 rounded-full bg-white" />
                  </motion.span>
                </div>
              </motion.div>
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 rounded-2xl bg-black/30 border border-white/10 p-2 pl-4">
              <Sparkles className="w-4 h-4 text-brand-primary-light flex-shrink-0" />
              <p className="text-sm text-white/40 flex-1 truncate">{CHATBOT.placeholder}</p>
              <button
                aria-label="Send"
                className="w-10 h-10 rounded-xl bg-brand-primary hover:bg-brand-primary-dark text-white flex items-center justify-center transition-colors shadow-lg flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-white/40 mt-3 text-center">
              Preview only — connect an AI provider to enable live chat.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
