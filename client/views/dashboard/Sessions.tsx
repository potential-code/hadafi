'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays,
  Video,
  Clock,
  ExternalLink,
  XCircle,
  CheckCircle2,
  Timer,
  Users,
  Sparkles,
  Ban,
  BookOpen,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/api'
import { getSmeSessions, cancelSmeSession } from '@/lib/api/sme'
import type { SmeSession } from '@/lib/api/sme'

type Tab = 'upcoming' | 'completed' | 'cancelled'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(fullName: string) {
  return fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatDate(iso: string, timeZone?: string | null) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso))
}

function formatTimeOnly(iso: string, timeZone?: string | null) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso))
}

function formatFull(iso: string, timeZone?: string | null) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso))
}

function getDurationMins(startsAt: string, endsAt: string) {
  return Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000)
}

function formatDuration(mins: number) {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function totalHours(sessions: SmeSession[]) {
  const mins = sessions.reduce(
    (acc, s) => acc + getDurationMins(s.slot.startsAt, s.slot.endsAt),
    0,
  )
  return (mins / 60).toFixed(1)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({ initials, faded }: { initials: string; faded?: boolean }) {
  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
        faded
          ? 'bg-brand-surface-2 text-brand-text-muted'
          : 'bg-gradient-to-br from-brand-primary to-brand-violet'
      }`}
    >
      {initials}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-brand-surface-2 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-brand-surface-2 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-brand-surface-2 rounded w-36" />
        <div className="h-2.5 bg-brand-surface-2 rounded w-52" />
        <div className="h-2.5 bg-brand-surface-2 rounded w-44" />
      </div>
      <div className="h-6 bg-brand-surface-2 rounded-full w-20" />
    </div>
  )
}

/** Upcoming (confirmed) card — can cancel or join */
function UpcomingCard({ session, timezone, onCancel }: { session: SmeSession; timezone: string | null; onCancel: (id: string) => void }) {
  const duration = getDurationMins(session.slot.startsAt, session.slot.endsAt)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-white border border-brand-surface-2 hover:border-brand-primary/30 transition-colors"
    >
      <Avatar initials={getInitials(session.mentorUser.fullName)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-brand-text-primary">{session.mentorUser.fullName}</p>
        <p className="text-xs text-brand-text-secondary truncate">{session.mentorUser.email}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-brand-text-muted">
            <Clock className="w-3 h-3" />
            {formatFull(session.slot.startsAt, timezone)}
          </span>
          {duration > 0 && (
            <span className="flex items-center gap-1 text-xs text-brand-text-muted">
              <Timer className="w-3 h-3" />
              {formatDuration(duration)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700">
          Confirmed
        </span>
        {session.meetingLink && (
          <a
            href={session.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-bold hover:bg-brand-primary hover:text-white transition-colors"
          >
            <Video className="w-3.5 h-3.5" />
            Join
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <button
          type="button"
          onClick={() => onCancel(session.id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </motion.div>
  )
}

/** Completed card — read-only, richer mentor details, book again CTA */
function CompletedCard({ session, index, timezone }: { session: SmeSession; index: number; timezone: string | null }) {
  const duration = getDurationMins(session.slot.startsAt, session.slot.endsAt)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="p-4 rounded-xl bg-white border border-brand-surface-2 hover:border-blue-200 transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* Left: mentor info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <Avatar initials={getInitials(session.mentorUser.fullName)} />
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center ring-2 ring-white">
              <CheckCircle2 className="w-2.5 h-2.5 text-white" />
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-text-primary">{session.mentorUser.fullName}</p>
            <p className="text-xs text-brand-text-secondary truncate">{session.mentorUser.email}</p>
          </div>
        </div>

        {/* Right: date + badge */}
        <div className="flex flex-col sm:items-end gap-1.5 flex-shrink-0">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700">
            Completed
          </span>
          <p className="text-xs font-medium text-brand-text-primary">{formatDate(session.slot.startsAt, timezone)}</p>
          <p className="text-xs text-brand-text-muted">{formatTimeOnly(session.slot.startsAt, timezone)}</p>
        </div>
      </div>

      {/* Meta + actions row */}
      <div className="mt-3 pt-3 border-t border-brand-surface-2 flex items-center gap-4 flex-wrap justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          {duration > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-brand-text-muted">
              <Timer className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-medium text-brand-text-secondary">{formatDuration(duration)}</span>
              <span>session</span>
            </span>
          )}
          {session.meetingLink ? (
            <a
              href={session.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-brand-text-muted hover:text-brand-primary transition-colors"
            >
              <Video className="w-3.5 h-3.5" />
              Meeting link
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-brand-text-muted/60">
              <Video className="w-3.5 h-3.5" />
              No meeting link
            </span>
          )}
        </div>
        <Link
          href="/dashboard/human-mentors"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-primary/8 text-brand-primary text-xs font-bold hover:bg-brand-primary hover:text-white transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Book again
        </Link>
      </div>
    </motion.div>
  )
}

/** Cancelled card — muted, with nudge to rebook */
function CancelledCard({ session, index, timezone }: { session: SmeSession; index: number; timezone: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-brand-surface border border-brand-surface-2 opacity-75"
    >
      <Avatar initials={getInitials(session.mentorUser.fullName)} faded />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-brand-text-secondary">{session.mentorUser.fullName}</p>
        <p className="text-xs text-brand-text-muted truncate">{session.mentorUser.email}</p>
        <span className="flex items-center gap-1 text-xs text-brand-text-muted mt-1">
          <Clock className="w-3 h-3" />
          {formatFull(session.slot.startsAt, timezone)}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-rose-100 text-rose-600">
          <Ban className="w-3 h-3" />
          Cancelled
        </span>
        <Link
          href="/dashboard/human-mentors"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-brand-surface-2 text-brand-text-secondary text-xs font-bold hover:border-brand-primary/30 hover:text-brand-primary transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Rebook
        </Link>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Completed summary bar
// ---------------------------------------------------------------------------

function CompletedSummary({ sessions }: { sessions: SmeSession[] }) {
  const uniqueMentors = new Set(sessions.map((s) => s.mentorUser.email)).size
  const hours = totalHours(sessions)
  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      {[
        { icon: <CheckCircle2 className="w-4 h-4 text-blue-500" />, value: sessions.length, label: 'Sessions attended' },
        { icon: <Timer className="w-4 h-4 text-brand-primary" />, value: `${hours}h`, label: 'Hours of mentoring' },
        { icon: <Sparkles className="w-4 h-4 text-brand-violet" />, value: uniqueMentors, label: 'Mentors worked with' },
      ].map(({ icon, value, label }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-xl bg-white border border-brand-surface-2 px-4 py-3"
        >
          <div className="w-8 h-8 rounded-lg bg-brand-surface flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div>
            <p className="text-base font-black text-brand-text-primary leading-none">{value}</p>
            <p className="text-[11px] text-brand-text-muted mt-0.5">{label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function EmptyState({ tab }: { tab: Tab }) {
  const copy: Record<Tab, { icon: React.ReactNode; title: string; sub: React.ReactNode }> = {
    upcoming: {
      icon: <CalendarDays className="w-10 h-10 text-brand-text-muted opacity-40" />,
      title: 'No upcoming sessions',
      sub: (
        <>
          Book a session with a mentor from the{' '}
          <Link href="/dashboard/human-mentors" className="text-brand-primary font-semibold hover:underline">
            Human Mentors
          </Link>{' '}
          page.
        </>
      ),
    },
    completed: {
      icon: <Sparkles className="w-10 h-10 text-blue-200" />,
      title: 'No completed sessions yet',
      sub: 'Sessions your mentor marks as complete will appear here with your full history.',
    },
    cancelled: {
      icon: <Ban className="w-10 h-10 text-rose-200" />,
      title: 'No cancelled sessions',
      sub: 'Cancelled sessions will be recorded here.',
    },
  }
  const { icon, title, sub } = copy[tab]
  return (
    <div className="rounded-2xl border border-brand-surface-2 bg-white flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="mb-3">{icon}</div>
      <p className="text-sm font-semibold text-brand-text-secondary">{title}</p>
      <p className="text-xs text-brand-text-muted mt-1 max-w-xs">{sub}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function SmeSessions() {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [upcoming, setUpcoming] = useState<SmeSession[]>([])
  const [completed, setCompleted] = useState<SmeSession[]>([])
  const [cancelled, setCancelled] = useState<SmeSession[]>([])
  const [loading, setLoading] = useState(true)
  const [timezone, setTimezone] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel: string
    variant: 'danger' | 'default'
    onConfirm: () => void
  } | null>(null)

  function loadSessions() {
    return getSmeSessions().then(({ upcoming: u, past }) => {
      setUpcoming(u)
      setCompleted(past.filter((s) => s.status === 'completed'))
      setCancelled(past.filter((s) => s.status === 'cancelled'))
    })
  }

  useEffect(() => {
    apiFetch<{ success: boolean; data: { user: { timezone: string | null } } }>('/api/auth/me')
      .then(({ data }) => setTimezone(data.user.timezone))
      .catch(() => {})
    loadSessions()
      .catch(() => toast.error('Failed to load sessions'))
      .finally(() => setLoading(false))
  }, [])

  function handleCancel(id: string) {
    setConfirmDialog({
      title: 'Cancel Session',
      message: 'Are you sure you want to cancel this session? The mentor will be notified.',
      confirmLabel: 'Cancel Session',
      variant: 'danger',
      onConfirm: () => {
        setConfirmDialog(null)
        cancelSmeSession(id)
          .then(() => { toast.success('Session cancelled'); return loadSessions() })
          .catch((err: { error?: { message?: string } }) =>
            toast.error(err?.error?.message ?? 'Failed to cancel session'),
          )
      },
    })
  }

  const counts: Record<Tab, number> = {
    upcoming: upcoming.length,
    completed: completed.length,
    cancelled: cancelled.length,
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <>
      <DashboardLayout>
        <PageHeader
          eyebrow="Dashboard"
          title="My"
          highlight="Sessions"
          subtitle="Your upcoming and past mentoring sessions."
        />

        {timezone && (
          <p className="text-xs text-brand-text-muted mb-4">
            Times shown in your timezone ({timezone} —{' '}
            {new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: timezone })
              .formatToParts(new Date())
              .find((p) => p.type === 'timeZoneName')?.value ?? ''})
          </p>
        )}

        {/* Tabs */}
        <div className="inline-flex rounded-full border border-brand-surface-2 bg-brand-surface p-1 gap-1 mb-6">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${
                tab === key
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              {label}
              {!loading && (
                <span className={`ml-1.5 text-[11px] ${tab === key ? 'text-white/70' : 'text-brand-text-muted'}`}>
                  ({counts[key]})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {loading ? (
              <div className="space-y-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : tab === 'upcoming' ? (
              upcoming.length === 0 ? (
                <EmptyState tab="upcoming" />
              ) : (
                <div className="space-y-3">
                  {upcoming.map((s) => (
                    <UpcomingCard key={s.id} session={s} timezone={timezone} onCancel={handleCancel} />
                  ))}
                </div>
              )
            ) : tab === 'completed' ? (
              completed.length === 0 ? (
                <EmptyState tab="completed" />
              ) : (
                <>
                  <CompletedSummary sessions={completed} />
                  <div className="space-y-3">
                    {completed.map((s, i) => (
                      <CompletedCard key={s.id} session={s} index={i} timezone={timezone} />
                    ))}
                  </div>
                </>
              )
            ) : cancelled.length === 0 ? (
              <EmptyState tab="cancelled" />
            ) : (
              <div className="space-y-3">
                {cancelled.map((s, i) => (
                  <CancelledCard key={s.id} session={s} index={i} timezone={timezone} />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </DashboardLayout>

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          variant={confirmDialog.variant}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </>
  )
}
