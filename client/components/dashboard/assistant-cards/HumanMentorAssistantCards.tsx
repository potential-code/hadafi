// client/components/dashboard/assistant-cards/HumanMentorAssistantCards.tsx
'use client'

import { useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar } from 'lucide-react'
import { motion } from 'framer-motion'
import { getMentors } from '@/lib/api/sme'
import { filterMentorsByIds } from './filterUtils'
import { AssistantCardStrip, AssistantCardSkeleton } from './AssistantCardStrip'
import { ChatLoadingContext } from '@/components/dashboard/chat-loading-context'

function diceBearUrl(name: string) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=9f2063&fontSize=42&radius=50`
}

interface Props {
  topic?: string
  ids?: string[]
  intent?: 'all' | 'topic'
  actionStatus: string
  onBookNow: (mentorName: string) => void
}

export function HumanMentorAssistantCards({ topic, ids, intent, actionStatus, onBookNow }: Props) {
  const chatIsLoading = useContext(ChatLoadingContext)
  const { data: mentors = [], isLoading } = useQuery({
    queryKey: ['mentors'],
    queryFn: getMentors,
    enabled: actionStatus !== 'inProgress',
  })

  if (actionStatus === 'inProgress' || isLoading) return <AssistantCardSkeleton />

  let filtered = mentors
  if (ids && ids.length > 0) {
    filtered = filterMentorsByIds(mentors, ids)
  } else if (topic) {
    const kw = topic.toLowerCase()
    filtered = mentors.filter(
      (m) =>
        m.fullName.toLowerCase().includes(kw) ||
        (m.bio?.toLowerCase().includes(kw) ?? false) ||
        (m.expertise?.some((e) => e.toLowerCase().includes(kw)) ?? false),
    )
  }

  const visible = filtered
  if (visible.length === 0) return null

  return (
    <AssistantCardStrip>
      {visible.map((mentor, i) => {
        const avatar = mentor.avatarUrl ?? diceBearUrl(mentor.fullName)

        return (
          <motion.div
            key={mentor.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="w-44 flex-shrink-0 rounded-xl bg-white border border-brand-surface-2 overflow-hidden hover:border-brand-primary/40 hover:shadow-md transition-all"
          >
            <div className="relative aspect-square overflow-hidden">
              <img
                src={avatar}
                alt={mentor.fullName}
                className="w-full h-full object-cover"
              />
              {mentor.expertise?.[0] && (
                <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-white/90 text-brand-primary text-[9px] font-bold">
                  {mentor.expertise[0]}
                </span>
              )}
            </div>
            <div className="p-3 flex flex-col gap-1.5">
              <h4 className="font-bold text-[12px] text-brand-text-primary leading-tight line-clamp-1">
                {mentor.fullName}
              </h4>
              {mentor.bio && (
                <p className="text-[10px] text-brand-text-muted line-clamp-2 leading-snug">
                  {mentor.bio}
                </p>
              )}
              <button
                onClick={() => onBookNow(mentor.fullName)}
                disabled={chatIsLoading}
                className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-3 py-1.5 text-[11px] font-bold shadow-sm hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                <Calendar className="w-3 h-3" />
                Book Now
              </button>
            </div>
          </motion.div>
        )
      })}
    </AssistantCardStrip>
  )
}
