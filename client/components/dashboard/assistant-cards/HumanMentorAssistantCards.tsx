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
import { optimizedSrc } from '@/lib/images'

function initialsAvatar(name: string) {
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
        const avatar = mentor.avatarUrl ?? initialsAvatar(mentor.fullName)

        return (
          <motion.div
            key={mentor.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="w-44 flex-shrink-0 rounded-[14px] bg-ui-surface border border-ui-line overflow-hidden transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-ui"
          >
            <div className="relative aspect-square overflow-hidden">
              <img
                src={optimizedSrc(avatar)}
                alt={mentor.fullName}
                className="w-full h-full object-cover"
              />
              {mentor.expertise?.[0] && (
                <span className="absolute top-1.5 end-1.5 px-1.5 py-0.5 rounded-full bg-ui-surface/90 text-ui-brand-text text-[11px] font-semibold">
                  {mentor.expertise[0]}
                </span>
              )}
            </div>
            <div className="p-3 flex flex-col gap-1.5">
              <h4 className="font-semibold text-[14px] text-ui-text leading-tight line-clamp-1">
                {mentor.fullName}
              </h4>
              {mentor.bio && (
                <p className="text-[12px] text-ui-muted line-clamp-2 leading-snug">
                  {mentor.bio}
                </p>
              )}
              <button
                onClick={() => onBookNow(mentor.fullName)}
                disabled={chatIsLoading}
                className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-8 px-3 text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Calendar className="w-3 h-3" />
                Book now
              </button>
            </div>
          </motion.div>
        )
      })}
    </AssistantCardStrip>
  )
}
