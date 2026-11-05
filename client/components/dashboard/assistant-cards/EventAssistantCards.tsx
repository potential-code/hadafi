// client/components/dashboard/assistant-cards/EventAssistantCards.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { Calendar, Clock, PlayCircle, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'
import { fetchMyEvents } from '@/lib/api/liveEvents'
import type { LiveEvent } from '@/lib/api/liveEvents'
import { AssistantCardStrip, AssistantCardSkeleton } from './AssistantCardStrip'
import { isEventPast, filterEventsByIds } from './filterUtils'
import { optimizedSrc } from '@/lib/images'

function parseDate(d: string) {
  const [year = '', monthNum = '', dayRaw = ''] = d.split('-')
  const month = new Date(`${year}-${monthNum}-01`).toLocaleString('en-US', {
    month: 'short',
  })
  return { month, day: dayRaw.replace(/^0/, ''), year }
}

interface Props {
  statusFilter: 'upcoming' | 'completed' | 'all'
  topic?: string
  ids?: string[]
  actionStatus: string
}

export function EventAssistantCards({ statusFilter, topic, ids, actionStatus }: Props) {
  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: ['live-events', 'mine'],
    queryFn: fetchMyEvents,
    enabled: actionStatus !== 'inProgress',
  })

  if (actionStatus === 'inProgress' || isLoading) return <AssistantCardSkeleton />

  let filtered: LiveEvent[] = allEvents

  if (statusFilter === 'upcoming') {
    filtered = allEvents.filter((e) => !isEventPast(e))
  } else if (statusFilter === 'completed') {
    filtered = allEvents.filter((e) => isEventPast(e))
  }

  if (ids && ids.length > 0) {
    filtered = filterEventsByIds(filtered, ids)
  } else if (topic) {
    const kw = topic.toLowerCase()
    filtered = filtered.filter(
      (e) =>
        e.title.toLowerCase().includes(kw) ||
        (e.type?.toLowerCase().includes(kw) ?? false) ||
        (e.description?.toLowerCase().includes(kw) ?? false),
    )
  }

  const visible = filtered
  if (visible.length === 0) return null

  return (
    <AssistantCardStrip>
      {visible.map((event, i) => {
        const past = isEventPast(event)
        const { month, day } = parseDate(event.date)
        const hasRecording = past && !!event.recordingLink
        const canJoin = !past && !!event.meetingLink

        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="w-52 flex-shrink-0 rounded-[14px] bg-ui-surface border border-ui-line overflow-hidden transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-ui"
          >
            <div className="relative h-24 overflow-hidden bg-ui-brand-soft">
              {event.coverImage && (
                <img
                  src={optimizedSrc(event.coverImage)}
                  alt={event.title}
                  className="w-full h-full object-cover"
                />
              )}
              {event.type && (
                <span className="absolute top-1.5 start-1.5 px-2 py-0.5 rounded-full bg-ui-brand text-white text-[11px] font-semibold uppercase">
                  {event.type}
                </span>
              )}
            </div>

            <div className="p-3 flex flex-col gap-1.5">
              <h4 className="font-semibold text-[14px] text-ui-text leading-snug line-clamp-2">
                {event.title}
              </h4>
              <div className="flex items-center gap-2 text-[12px] text-ui-muted flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" />
                  {day} {month}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {event.time}
                </span>
              </div>

              {hasRecording && (
                <a
                  href={event.recordingLink!}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-8 px-3 text-[13px] font-semibold transition-colors"
                >
                  <PlayCircle className="w-3 h-3" />
                  Watch recording
                </a>
              )}
              {canJoin && (
                <a
                  href={event.meetingLink!}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-8 px-3 text-[13px] font-semibold transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Join
                </a>
              )}
            </div>
          </motion.div>
        )
      })}
    </AssistantCardStrip>
  )
}
