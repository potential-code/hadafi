'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { MessageCircle, ArrowUpRight, Send } from 'lucide-react'
import { AI_MENTORS } from '@/lib/constants'
import { SectionHeader } from '@/components/shared/SectionHeader'

const SAMPLE_QUESTIONS = [
  'How do I price my product?',
  'Build my marketing plan.',
  'Forecast next quarter cash flow.',
] as const

export function AiMentorsSection() {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <section id="ai-mentors" className="relative py-28 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <SectionHeader
            badge={AI_MENTORS.badge}
            heading="AI"
            highlight="Mentors"
            subtext={AI_MENTORS.subtext}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {AI_MENTORS.mentors.map((mentor, i) => {
            const isHover = hovered === mentor.name
            const sample = SAMPLE_QUESTIONS[i % SAMPLE_QUESTIONS.length]
            return (
              <motion.a
                key={mentor.name}
                href={AI_MENTORS.ctaHref}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ delay: 0.05 * i, duration: 0.5 }}
                whileHover={{ y: -6 }}
                onMouseEnter={() => setHovered(mentor.name)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(mentor.name)}
                onBlur={() => setHovered(null)}
                className="group relative block rounded-2xl overflow-hidden bg-brand-deep border border-white/10 hover:border-brand-primary/40 transition-all shadow-lg"
              >
                {/* Avatar header — morphs on hover into a chat preview */}
                <div className="relative aspect-square overflow-hidden">
                  <motion.img
                    src={mentor.avatar}
                    alt={mentor.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                    animate={{
                      scale: isHover ? 1.08 : 1,
                      filter: isHover ? 'blur(6px) brightness(0.55)' : 'blur(0px) brightness(1)',
                    }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-deep via-brand-deep/40 to-transparent pointer-events-none" />

                  <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-white uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    24/7
                  </div>
                  <div className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-brand-primary/90 text-white opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>

                  {/* Chat preview overlay */}
                  <AnimatePresence>
                    {isHover && (
                      <motion.div
                        key="chat"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-x-3 bottom-3 rounded-xl bg-black/55 backdrop-blur-md border border-white/15 p-3 space-y-2"
                      >
                        <div className="flex justify-start">
                          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white/15 text-white text-[11px] px-3 py-1.5 leading-snug">
                            Hi! I'm {mentor.name.split(' ')[0]}. Ask me anything.
                          </div>
                        </div>
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.18 }}
                          className="flex justify-end"
                        >
                          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-primary text-white text-[11px] px-3 py-1.5 leading-snug">
                            {sample}
                          </div>
                        </motion.div>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.45 }}
                          className="flex justify-start items-center gap-1 pl-1"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" />
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce"
                            style={{ animationDelay: '120ms' }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce"
                            style={{ animationDelay: '240ms' }}
                          />
                          <span className="ml-2 text-[10px] text-white/55">typing…</span>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="p-5">
                  <p className="text-[11px] font-bold text-brand-primary-light uppercase tracking-[0.18em] mb-1">
                    {mentor.specialty}
                  </p>
                  <h3 className="font-bold text-white leading-tight mb-2">{mentor.name}</h3>
                  <p className="text-xs text-white/60 leading-relaxed mb-4">{mentor.description}</p>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary-light">
                    {isHover ? <Send className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}
                    {AI_MENTORS.ctaLabel}
                  </div>
                </div>
              </motion.a>
            )
          })}
        </div>
      </div>
    </section>
  )
}
