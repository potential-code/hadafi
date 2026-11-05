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
          className="w-44 flex-shrink-0 rounded-[14px] bg-ui-surface border border-ui-line overflow-hidden transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-ui"
        >
          <div className="relative aspect-[4/3] overflow-hidden">
            <img
              src={mentor.avatar}
              alt=""
              loading="lazy"
              className="w-full h-full bg-ui-surface-2 object-cover"
            />
            <span className="absolute top-1.5 start-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-ui-surface/95 text-[11px] font-semibold text-ui-text">
              <span className="w-1.5 h-1.5 rounded-full bg-ui-ok" aria-hidden />
              24/7
            </span>
          </div>
          <div className="p-2.5 flex flex-col gap-1.5">
            <div>
              <h4 className="font-semibold text-[13px] text-ui-text leading-tight line-clamp-1">
                {mentor.name}
              </h4>
              <p className="text-[11px] text-ui-muted">{mentor.specialty}</p>
            </div>
            <button
              onClick={() => router.push(`/dashboard/ai-mentors/${mentor.slug}`)}
              className="w-full inline-flex items-center justify-center gap-1 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-8 px-2 text-[13px] font-semibold transition-colors"
            >
              <MessageCircle className="w-3 h-3" />
              Chat now
            </button>
          </div>
        </motion.div>
      ))}
    </AssistantCardStrip>
  )
}
