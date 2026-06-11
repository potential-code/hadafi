'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { MentorLayout } from '@/components/mentor/MentorLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { apiFetch } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionFromApi {
  id: string
  status: string
  slot: { startsAt: string; endsAt: string }
  smeUser: { fullName: string; email: string; avatarUrl: string | null }
}

interface SessionsData {
  upcoming: SessionFromApi[]
  past: SessionFromApi[]
}

interface Mentee {
  fullName: string
  email: string
  avatarUrl: string | null
  sessions: string[]
}

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

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({ initials }: { initials: string }) {
  return (
    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-primary to-brand-violet flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
      {initials}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-white border border-brand-surface-2 animate-pulse">
      <div className="w-11 h-11 rounded-full bg-brand-surface-2 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-brand-surface-2 rounded w-40" />
        <div className="h-2.5 bg-brand-surface-2 rounded w-56" />
      </div>
      <div className="h-5 bg-brand-surface-2 rounded-full w-20" />
      <div className="h-3 bg-brand-surface-2 rounded w-24" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function Mentees() {
  const [mentees, setMentees] = useState<Mentee[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<SessionsData>('/api/mentor/sessions')
      .then((data) => {
        const menteeMap = new Map<string, Mentee>()
        for (const s of [...data.upcoming, ...data.past]) {
          const key = s.smeUser.email
          if (!menteeMap.has(key)) {
            menteeMap.set(key, { ...s.smeUser, sessions: [] })
          }
          menteeMap.get(key)!.sessions.push(s.slot.startsAt)
        }
        setMentees(Array.from(menteeMap.values()))
        setLoading(false)
      })
      .catch(() => {
        toast.error('Failed to load mentees')
        setLoading(false)
      })
  }, [])

  return (
    <MentorLayout>
      <PageHeader
        eyebrow="Mentor"
        title="My"
        highlight="Mentees"
        subtitle="Manage your current and past mentees."
      />

      <div className="space-y-3">
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : mentees.length === 0 ? (
          <div className="rounded-2xl border border-brand-surface-2 bg-white flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 text-brand-text-muted mb-3 opacity-40" />
            <p className="text-sm font-semibold text-brand-text-secondary">No mentees yet.</p>
            <p className="text-xs text-brand-text-muted mt-1">
              Sessions with mentees will appear here.
            </p>
          </div>
        ) : (
          mentees.map((m, i) => {
            const sortedSessions = [...m.sessions].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
            const lastSession = sortedSessions[0]
            return (
              <motion.div
                key={m.email}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-white border border-brand-surface-2 hover:border-brand-primary/30 transition-colors"
              >
                <Avatar initials={getInitials(m.fullName)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-text-primary">{m.fullName}</p>
                  <p className="text-xs text-brand-text-secondary truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary text-[11px] font-bold">
                    {m.sessions.length} {m.sessions.length === 1 ? 'session' : 'sessions'}
                  </span>
                  {lastSession && (
                    <p className="text-xs text-brand-text-muted whitespace-nowrap">
                      Last: {formatDate(lastSession)}
                    </p>
                  )}
                </div>
              </motion.div>
            )
          })
        )}
      </div>
    </MentorLayout>
  )
}
