'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Users, CheckCircle2, Video, AlertTriangle, CalendarPlus, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { MentorLayout } from '@/components/mentor/MentorLayout'
import { StatCard } from '@/components/dashboard/widgets/StatCard'
import { DashboardCard } from '@/components/dashboard/widgets/DashboardCard'
import { apiFetch } from '@/lib/api'
import { getUser } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UpcomingSession {
  id: string
  slot: { startsAt: string; endsAt: string }
  smeUser: { fullName: string; email: string; avatarUrl: string | null }
  meetingLink: string | null
  status: string
}

interface RecentMentee {
  id: string
  smeUser: { fullName: string; email: string; avatarUrl: string | null }
  lastSession: string
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({ initials, size = 'md' }: { initials: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm'
    ? 'w-8 h-8 text-xs'
    : 'w-10 h-10 text-sm'
  return (
    <div className={`${cls} rounded-full bg-gradient-to-br from-brand-primary to-brand-violet flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials}
    </div>
  )
}

function getInitials(fullName: string) {
  return fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatSessionTime(isoString: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(isoString))
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function MentorOverview() {
  const [firstName, setFirstName] = useState('Mentor')
  const [analytics, setAnalytics] = useState({ upcomingSessions: 0, totalMentees: 0, completedSessions: 0 })
  const [sessions, setSessions] = useState<UpcomingSession[]>([])
  const [mentees, setMentees] = useState<RecentMentee[]>([])
  const [loading, setLoading] = useState(true)
  const [noMeetingLink, setNoMeetingLink] = useState(false)
  const [hasAvailability, setHasAvailability] = useState(true)

  useEffect(() => {
    const currentUser = getUser() // Read inside effect to avoid stale closure
    if (!currentUser) return

    setFirstName((currentUser.fullName ?? 'Mentor').split(' ')[0])

    Promise.all([
      apiFetch<{ upcomingSessions: number; totalMentees: number; completedSessions: number }>('/api/mentor/analytics'),
      apiFetch<{ upcoming: UpcomingSession[]; past: UpcomingSession[] }>('/api/mentor/sessions'),
      apiFetch<{ success: boolean; data: { user: { meetingLink: string | null } } }>('/api/auth/me'),
      apiFetch<{ upcoming: { id: string }[]; past: { id: string }[] }>('/api/mentor/availability'),
    ])
      .then(([analyticsData, sessionsData, meData, availabilityData]) => {
        setAnalytics(analyticsData)
        setSessions(sessionsData.upcoming.slice(0, 3))

        // Build recent mentees from all sessions, deduplicated by email, tracking most recent session
        const allSessions = [...sessionsData.upcoming, ...sessionsData.past]
        const menteeByEmail = new Map<string, RecentMentee>()
        for (const s of allSessions) {
          const email = s.smeUser.email
          const existing = menteeByEmail.get(email)
          if (!existing) {
            menteeByEmail.set(email, { id: s.smeUser.email, smeUser: s.smeUser, lastSession: s.slot.startsAt })
          } else {
            // Keep the most recent session date
            if (new Date(s.slot.startsAt) > new Date(existing.lastSession)) {
              existing.lastSession = s.slot.startsAt
            }
          }
        }
        const uniqueMentees = Array.from(menteeByEmail.values()).slice(0, 4)
        setMentees(uniqueMentees)
        setNoMeetingLink(!meData.data?.user?.meetingLink)
        setHasAvailability((availabilityData.upcoming?.length ?? 0) > 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <MentorLayout>
      {/* Welcome banner */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl mb-8 p-5 sm:p-6 bg-mesh-dark text-white border border-white/10"
      >
        <div className="absolute inset-0 bg-noise opacity-[0.05] mix-blend-overlay pointer-events-none" />
        <motion.div
          aria-hidden
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-brand-primary/40 blur-3xl"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60 mb-1">
            Mentor Dashboard
          </p>
          <h1 className="text-2xl sm:text-3xl font-black">Welcome back, {firstName} 👋</h1>
          <p className="text-sm text-white/70 mt-1">Here's your mentoring overview for this week.</p>
        </div>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Upcoming Sessions"
          value={loading ? 0 : analytics.upcomingSessions}
          icon={<CalendarDays className="w-9 h-9" />}
          trend="confirmed"
          accent="bg-brand-primary"
        />
        <StatCard
          label="Total Mentees"
          value={loading ? 0 : analytics.totalMentees}
          icon={<Users className="w-9 h-9" />}
          trend="all time"
          accent="bg-brand-violet"
        />
        <StatCard
          label="Completed Sessions"
          value={loading ? 0 : analytics.completedSessions}
          icon={<CheckCircle2 className="w-9 h-9" />}
          trend="completed"
          accent="bg-brand-primary-dark"
        />
      </div>

      {/* Meeting link warning */}
      {!loading && noMeetingLink && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
          <span>You haven't added a meeting link yet. SMEs won't be able to join your sessions.</span>
          <Link
            href="/mentor/dashboard/profile"
            className="ml-auto text-xs font-bold text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
          >
            Go to Profile →
          </Link>
        </div>
      )}

      {/* Availability nudge */}
      {!loading && !hasAvailability && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6 rounded-2xl border border-brand-primary/20 bg-gradient-to-br from-brand-primary/5 to-brand-violet/5 p-5 sm:p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
                <CalendarPlus className="w-5 h-5 text-brand-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-brand-text-primary text-sm">
                  Add your availability to start receiving bookings
                </p>
                <p className="text-xs text-brand-text-muted mt-0.5 leading-relaxed">
                  SMEs browse mentor profiles and book open slots directly on your calendar. Set your available times so they can schedule a session with you.
                </p>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  {[
                    { step: '1', label: 'Add open slots' },
                    { step: '2', label: 'SME books a time' },
                    { step: '3', label: 'Session confirmed' },
                  ].map(({ step, label }, i) => (
                    <div key={step} className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-brand-primary/20 text-brand-primary text-[10px] font-black flex items-center justify-center">
                        {step}
                      </span>
                      <span className="text-[11px] text-brand-text-muted font-medium">{label}</span>
                      {i < 2 && <ArrowRight className="w-3 h-3 text-brand-text-muted/50" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <Link
              href="/mentor/dashboard/availability"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors whitespace-nowrap shrink-0 shadow-sm"
            >
              <CalendarPlus className="w-4 h-4" />
              Add availability
            </Link>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming sessions */}
        <div className="lg:col-span-2">
          <DashboardCard title="Upcoming Sessions" ctaLabel="View all" ctaHref="/mentor/dashboard/sessions">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-brand-surface border border-brand-surface-2 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-brand-surface-2 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-brand-surface-2 rounded w-32" />
                      <div className="h-2.5 bg-brand-surface-2 rounded w-48" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-brand-text-muted py-6 text-center">
                No upcoming sessions. Your availability is open.
              </p>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-brand-surface border border-brand-surface-2 hover:border-brand-primary/30 transition-colors"
                  >
                    <Avatar initials={getInitials(s.smeUser.fullName)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-text-primary truncate">{s.smeUser.fullName}</p>
                      <p className="text-xs text-brand-text-secondary truncate">{s.smeUser.email}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium text-brand-text-primary">{formatSessionTime(s.slot.startsAt)}</p>
                    </div>
                    {s.meetingLink ? (
                      <a
                        href={s.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0 hover:bg-brand-primary/20 transition-colors"
                        title="Join meeting"
                      >
                        <Video className="w-4 h-4 text-brand-primary" />
                      </a>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-brand-surface-2 flex items-center justify-center flex-shrink-0">
                        <Video className="w-4 h-4 text-brand-text-muted" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
        </div>

        {/* Recent mentees */}
        <div>
          <DashboardCard title="Recent Mentees" ctaLabel="View all" ctaHref="/mentor/dashboard/mentees">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-brand-surface-2 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-brand-surface-2 rounded w-24" />
                      <div className="h-2.5 bg-brand-surface-2 rounded w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : mentees.length === 0 ? (
              <p className="text-sm text-brand-text-muted py-6 text-center">No mentees yet.</p>
            ) : (
              <div className="space-y-3">
                {mentees.map((m) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <Avatar initials={getInitials(m.smeUser.fullName)} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-text-primary truncate">{m.smeUser.fullName}</p>
                      <p className="text-xs text-brand-text-secondary truncate">{m.smeUser.email}</p>
                    </div>
                    <p className="text-[11px] text-brand-text-secondary flex-shrink-0">
                      {new Date(m.lastSession).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
        </div>
      </div>
    </MentorLayout>
  )
}
