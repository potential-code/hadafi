// client/components/dashboard/assistant-cards/SessionAssistantCards.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { Clock, Video, Ban, CheckCircle2, Timer } from 'lucide-react'
import { motion } from 'framer-motion'
import { getSmeSessions } from '@/lib/api/sme'
import type { SmeSession } from '@/lib/api/sme'
import { AssistantCardStrip, AssistantCardSkeleton } from './AssistantCardStrip'
import { cn } from '@/lib/utils'

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatFull(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

function getDurationMins(startsAt: string, endsAt: string) {
  return Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000,
  )
}

function formatDuration(mins: number) {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

interface Props {
  statusFilter: 'upcoming' | 'completed' | 'cancelled'
  actionStatus: string
}

export function SessionAssistantCards({ statusFilter, actionStatus }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['sme-sessions'],
    queryFn: getSmeSessions,
    enabled: actionStatus !== 'inProgress',
  })

  if (actionStatus === 'inProgress' || isLoading) return <AssistantCardSkeleton />

  let sessions: SmeSession[] = []

  if (statusFilter === 'upcoming') {
    sessions = data?.upcoming ?? []
  } else if (statusFilter === 'completed') {
    sessions = (data?.past ?? []).filter((s) => s.status === 'completed')
  } else if (statusFilter === 'cancelled') {
    sessions = (data?.past ?? []).filter((s) => s.status === 'cancelled')
  }

  const visible = sessions
  if (visible.length === 0) return null

  return (
    <AssistantCardStrip>
      {visible.map((session, i) => {
        const duration = getDurationMins(session.slot.startsAt, session.slot.endsAt)
        const isUpcoming = session.status === 'confirmed'
        const isCancelled = session.status === 'cancelled'
        const isCompleted = session.status === 'completed'

        return (
          <motion.div
            key={session.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="w-56 flex-shrink-0 rounded-xl bg-white border border-brand-surface-2 p-3 hover:border-brand-primary/30 transition-colors"
          >
            <div className="flex items-start gap-2.5 mb-2">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0',
                  isCancelled
                    ? 'bg-brand-surface-2 text-brand-text-muted'
                    : 'bg-gradient-to-br from-brand-primary to-brand-violet',
                )}
              >
                {getInitials(session.mentorUser.fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-brand-text-primary leading-tight line-clamp-1">
                  {session.mentorUser.fullName}
                </p>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider',
                    isUpcoming && 'text-emerald-600',
                    isCompleted && 'text-brand-text-muted',
                    isCancelled && 'text-rose-500',
                  )}
                >
                  {isUpcoming && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Upcoming
                    </>
                  )}
                  {isCompleted && (
                    <>
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Completed
                    </>
                  )}
                  {isCancelled && (
                    <>
                      <Ban className="w-2.5 h-2.5" />
                      Cancelled
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-1 mb-2">
              <div className="flex items-center gap-1 text-[10px] text-brand-text-muted">
                <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">{formatFull(session.slot.startsAt)}</span>
              </div>
              {duration > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-brand-text-muted">
                  <Timer className="w-2.5 h-2.5 flex-shrink-0" />
                  <span>{formatDuration(duration)}</span>
                </div>
              )}
            </div>

            {isUpcoming && session.meetingLink && (
              <a
                href={session.meetingLink}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white px-3 py-1.5 text-[11px] font-bold hover:-translate-y-0.5 transition-all"
              >
                <Video className="w-3 h-3" />
                Join Session
              </a>
            )}
          </motion.div>
        )
      })}
    </AssistantCardStrip>
  )
}
