// client/components/dashboard/assistant-cards/AiMentorAssistantCards.tsx
'use client'

import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { getAllAiMentors } from '@/lib/dashboardData'
import { filterAiMentorsBySlugs } from './filterUtils'
import { AssistantCardStrip } from './AssistantCardStrip'

interface Props {
  topic?: string
  slugs?: string[]
  actionStatus: string
}

export function AiMentorAssistantCards({ topic, slugs, actionStatus }: Props) {
  const router = useRouter()
  const allMentors = getAllAiMentors()

  if (actionStatus === 'inProgress') return null

  const filtered = slugs && slugs.length > 0
    ? filterAiMentorsBySlugs(allMentors, slugs)
    : topic
      ? allMentors.filter((m) => {
          const kw = topic.toLowerCase()
          return (
            m.name.toLowerCase().includes(kw) ||
            m.specialty.toLowerCase().includes(kw) ||
            m.description.toLowerCase().includes(kw)
          )
        })
      : allMentors

  const visible = filtered
  if (visible.length === 0) return null

  return (
    <AssistantCardStrip>
      {visible.map((mentor, i) => (
        <motion.div
          key={mentor.slug}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i }}
          className="w-40 flex-shrink-0 rounded-xl bg-brand-deep border border-white/10 overflow-hidden hover:border-brand-primary/40 hover:shadow-md transition-all"
        >
          <div className="relative aspect-[4/3] overflow-hidden">
            <img
              src={mentor.avatar}
              alt={mentor.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/80 to-transparent" />
            <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 text-[8px] font-semibold text-white uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              24/7
            </span>
          </div>
          <div className="p-2.5 flex flex-col gap-1.5">
            <div>
              <h4 className="font-bold text-[11px] text-white leading-tight line-clamp-1">
                {mentor.name}
              </h4>
              <p className="text-[9px] text-white/50">{mentor.specialty}</p>
            </div>
            <button
              onClick={() => router.push(`/dashboard/ai-mentors/${mentor.slug}`)}
              className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-brand-primary text-white px-2 py-1.5 text-[10px] font-bold hover:opacity-90 transition-all"
            >
              <MessageCircle className="w-3 h-3" />
              Chat Now
            </button>
          </div>
        </motion.div>
      ))}
    </AssistantCardStrip>
  )
}
