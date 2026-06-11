'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, MessageCircle, Send } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { getAllAiMentors } from '@/lib/dashboardData'

const SAMPLE_QUESTIONS = [
  'How do I price my product?',
  'Build my marketing plan.',
  'Forecast next quarter cash flow.',
  'Draft a sales email for me.',
  'How do I cut costs this month?',
  'Make my pitch sharper.',
] as const

export default function AiMentorsPage() {
  const mentors = getAllAiMentors()
  const [hovered, setHovered] = useState<string | null>(null)
  const router = useRouter()

  return (
    <DashboardLayout>
      <PageHeader
        eyebrow="AI Mentors"
        title="24/7 AI mentors"
        highlight="for every challenge"
        subtitle="Specialist AI coaches that you can chat with anytime. Pick a mentor and start growing your business."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {mentors.map((mentor, i) => {
          const isHover = hovered === mentor.name
          const sample = SAMPLE_QUESTIONS[i % SAMPLE_QUESTIONS.length]
          return (
            <motion.button
              key={mentor.name}
              type="button"
              onClick={() => router.push(`/dashboard/ai-mentors/${mentor.slug}`)}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -6 }}
              onMouseEnter={() => setHovered(mentor.name)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(mentor.name)}
              onBlur={() => setHovered(null)}
              className="group relative text-left block rounded-2xl overflow-hidden bg-brand-deep border border-white/10 hover:border-brand-primary/40 transition-all shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
            >
              {/* Avatar header — shorter than landing version (4/3) */}
              <div className="relative aspect-[4/3] overflow-hidden">
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

                <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[9px] font-semibold text-white uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  24/7
                </div>
                <div className="absolute top-2.5 right-2.5 inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-primary/90 text-white opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>

                {/* Chat preview overlay */}
                <AnimatePresence>
                  {isHover && (
                    <motion.div
                      key="chat"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.25 }}
                      className="absolute inset-x-2.5 bottom-2.5 rounded-xl bg-black/55 backdrop-blur-md border border-white/15 p-2.5 space-y-1.5"
                    >
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white/15 text-white text-[10px] px-2.5 py-1 leading-snug">
                          Hi! I'm {mentor.name.split(' ')[0]}. Ask me anything.
                        </div>
                      </div>
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="flex justify-end"
                      >
                        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-primary text-white text-[10px] px-2.5 py-1 leading-snug">
                          {sample}
                        </div>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="flex justify-start items-center gap-1 pl-1"
                      >
                        <span className="w-1 h-1 rounded-full bg-white/60 animate-bounce" />
                        <span
                          className="w-1 h-1 rounded-full bg-white/60 animate-bounce"
                          style={{ animationDelay: '120ms' }}
                        />
                        <span
                          className="w-1 h-1 rounded-full bg-white/60 animate-bounce"
                          style={{ animationDelay: '240ms' }}
                        />
                        <span className="ml-1.5 text-[9px] text-white/55">typing…</span>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="p-4">
                <p className="text-[10px] font-bold text-brand-primary-light uppercase tracking-[0.18em] mb-1">
                  {mentor.specialty}
                </p>
                <h3 className="font-bold text-white leading-tight text-sm mb-1.5 line-clamp-1">
                  {mentor.name}
                </h3>
                <p className="text-[11px] text-white/60 leading-relaxed line-clamp-2 mb-3">
                  {mentor.description}
                </p>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-primary-light">
                  {isHover ? <Send className="w-3 h-3" /> : <MessageCircle className="w-3 h-3" />}
                  Chat now
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>
    </DashboardLayout>
  )
}
