'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Award,
  Bot,
  BookOpenCheck,
  Calendar,
  ChevronDown,
  Clock,
  GraduationCap,
  TrendingUp,
  Users,
  Trophy,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { StatCard } from '@/components/dashboard/widgets/StatCard'
import { DashboardCard } from '@/components/dashboard/widgets/DashboardCard'
import { EmbeddedDashboardAssistant } from '@/components/dashboard/EmbeddedDashboardAssistant'
import { useCopilotTokenReady } from '@/components/dashboard/AssistantProvider'
import { getCopilotHeaders } from '@/components/dashboard/copilotConfig'
import { getUser } from '@/lib/auth'
import { getMyAiMentors } from '@/lib/dashboardData'
import { fetchLearnerCourses, fetchUserCertificates } from '@/lib/api/lms'
import { cancelSmeSession, getSmeSessions, getMentors } from '@/lib/api/sme'
import { fetchOffers } from '@/lib/api/offers'
import { fetchPublishedEvents } from '@/lib/api/liveEvents'
import type { SmeSession } from '@/lib/api/sme'
import { cn } from '@/lib/utils'

// CopilotKit v2 runtime (multi-route Express handler: /info, /transcribe,
// /agent/:id/run). The agent + thread now bind on <CopilotChat>/useAgent inside
// EmbeddedDashboardAssistant, not on the provider.
const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

export default function DashboardOverview() {
  const user = getUser()
  const router = useRouter()
  // Assistant is for logged-in users only: wait for the minted service token
  // before mounting the CopilotKit provider (its first request needs auth).
  const copilotReady = useCopilotTokenReady()
  const firstName = (user?.fullName ?? 'there').split(' ')[0]
  const myMentors = getMyAiMentors()

  const { data: allCourses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['learner-courses'],
    queryFn: fetchLearnerCourses,
  })

  const { data: certificates = [] } = useQuery({
    queryKey: ['user-certificates'],
    queryFn: fetchUserCertificates,
  })

  const { data: offersData } = useQuery({
    queryKey: ['offers'],
    queryFn: fetchOffers,
  })

  const { data: liveEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['live-events'],
    queryFn: fetchPublishedEvents,
  })

  const { data: apiMentors = [], isLoading: mentorsLoading } = useQuery({
    queryKey: ['mentors'],
    queryFn: getMentors,
  })

  const enrolledCourses = useMemo(
    () => allCourses.filter((c) => c.isEnrolled).slice(0, 3),
    [allCourses],
  )

  const coursesInProgress = allCourses.filter(
    (c) => c.isEnrolled && c.progressPercentage < 100,
  ).length

  const latestCertificate = certificates[0] ?? null
  const certificatesCount = certificates.length
  const offersCount = offersData?.offers.length ?? 0
  const userPoints = offersData?.userPoints ?? 0

  const upcomingEvents = useMemo(
    () =>
      liveEvents
        .filter((e) => new Date(e.date) >= new Date(new Date().toDateString()))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 4),
    [liveEvents],
  )

  const programmeMentors = useMemo(() => apiMentors.slice(0, 3), [apiMentors])

  const [openSession, setOpenSession] = useState<string | null>(null)
  const [smeSessions, setSmeSessions] = useState<SmeSession[]>([])
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => {
    getSmeSessions()
      .then(({ upcoming }) => setSmeSessions(upcoming.slice(0, 3)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (upcomingEvents.length > 0 && openSession === null) {
      setOpenSession(upcomingEvents[0].id)
    }
  }, [upcomingEvents])

  async function handleCancelSession(id: string) {
    setCancellingId(id)
    try {
      await cancelSmeSession(id)
      setSmeSessions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      toast.error('Failed to cancel session. Please try again.')
    } finally {
      setCancellingId(null)
    }
  }

  const progressText =
    coursesInProgress > 0
      ? `You have ${coursesInProgress} course${coursesInProgress !== 1 ? 's' : ''} in progress — keep the momentum going.`
      : 'Start a course today and build skills that move your business forward.'

  return (
    <DashboardLayout>
      {/* Welcome banner */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl mb-5 px-5 py-4 bg-mesh-dark text-white border border-white/10"
      >
        <div className="absolute inset-0 bg-noise opacity-[0.05] mix-blend-overlay pointer-events-none" />
        <motion.div
          aria-hidden
          className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-brand-primary/40 blur-3xl"
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-16 -left-10 w-44 h-44 rounded-full bg-brand-violet/35 blur-3xl"
          animate={{ scale: [1.1, 1, 1.1] }}
          transition={{ duration: 10, repeat: Infinity }}
        />
        <div className="relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 shadow-lg flex-shrink-0">
            <img
              src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.fullName ?? '')}&backgroundColor=9f2063&fontSize=42&radius=50`}
              alt={user?.fullName ?? 'User'}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base sm:text-lg font-black leading-snug">
              Welcome back, {firstName}.{' '}
              <span className="text-gradient-magenta">Let's grow today.</span>
            </p>
            <p className="text-xs text-white/60 mt-0.5 truncate">{progressText}</p>
          </div>
          <Link
            href="/dashboard/courses"
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-xs font-semibold hover:bg-white/15 transition-colors"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Continue learning</span>
            <span className="sm:hidden">Courses</span>
          </Link>
        </div>
      </motion.div>

      {/* AI Business Assistant — full width, bare embed. Mounted only after
          the copilot service token is minted (logged-in users only). */}
      <div className="mb-8">
        {copilotReady ? (
          <CopilotKit
            runtimeUrl={VOICE_RUNTIME_URL}
            /* Resolved object, not the function: the core's /info fetch doesn't
               resolve function-form headers (agent runs do), which 401s the
               runtime-info request. Safe here — this subtree only mounts after
               useCopilotTokenReady(), so the token is already cached. */
            headers={getCopilotHeaders()}
            /* Express handler is multi-route (/info, /transcribe, /agent/:id/run),
               so the client must NOT use single-endpoint mode (default true) — else
               the runtime-info fetch 404s. */
            useSingleEndpoint={false}
            /* Hide CopilotKit's dev chrome: enableInspector kills the floating
               debug diamond + announcement bubbles (@copilotkit/web-inspector);
               showDevConsole kills the dev console. */
            enableInspector={false}
            showDevConsole={false}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-2xl border border-brand-surface-2 bg-white shadow-sm overflow-hidden"
            >
              <EmbeddedDashboardAssistant className="h-[calc(100vh-11rem)] min-h-[520px]" />
            </motion.div>
          </CopilotKit>
        ) : (
          <div className="h-[calc(100vh-11rem)] min-h-[520px] rounded-2xl border border-brand-surface-2 bg-white shadow-sm animate-pulse" />
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <StatCard
          label="Offers available"
          value={offersCount}
          icon={<Award className="w-9 h-9" />}
          trend="Browse & redeem"
          accent="bg-brand-primary"
          delay={0}
        />
        <StatCard
          label="Points balance"
          value={userPoints}
          icon={<TrendingUp className="w-9 h-9" />}
          trend="Your balance"
          accent="bg-brand-violet"
          delay={0.05}
        />
        <StatCard
          label="Courses in progress"
          value={coursesInProgress}
          icon={<GraduationCap className="w-9 h-9" />}
          trend={coursesInProgress > 0 ? `${coursesInProgress} active` : 'None started yet'}
          accent="bg-brand-primary-dark"
          delay={0.1}
        />
        <StatCard
          label="Certificates earned"
          value={certificatesCount}
          icon={<Trophy className="w-9 h-9" />}
          trend={certificatesCount > 0 ? 'View in profile' : 'Complete a course'}
          accent="bg-brand-primary"
          delay={0.15}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-4 lg:gap-6">

        {/* Continue learning */}
        <div className="col-span-12 lg:col-span-8">
          <DashboardCard
            title="Continue learning"
            subtitle="Your active courses"
            icon={<GraduationCap className="w-4 h-4" />}
            ctaLabel="All courses"
            ctaHref="/dashboard/courses"
            delay={0.05}
          >
            <div className="grid sm:grid-cols-3 gap-3">
              {coursesLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-brand-surface-2 h-44 animate-pulse bg-brand-surface" />
                ))
              ) : enrolledCourses.length === 0 ? (
                <div className="col-span-3 flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <BookOpenCheck className="w-8 h-8 text-brand-text-muted/40" />
                  <p className="text-sm text-brand-text-muted">You haven't started any courses yet.</p>
                  <button
                    onClick={() => router.push('/dashboard/courses')}
                    className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-dark transition-colors"
                  >
                    Browse courses
                  </button>
                </div>
              ) : (
                enrolledCourses.map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                    whileHover={{ y: -4 }}
                    className="group relative rounded-xl overflow-hidden border border-brand-surface-2 bg-white hover:border-brand-primary/40 hover:shadow-lg transition-all flex flex-col"
                  >
                    <div className="relative aspect-[4/2] overflow-hidden">
                      {c.cover ? (
                        <img
                          src={c.cover}
                          alt={c.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet flex items-center justify-center">
                          <BookOpenCheck className="w-8 h-8 text-white/60" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      <span
                        className={cn(
                          'absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider',
                          c.difficulty === 'Beginner' && 'bg-emerald-500/90 text-white',
                          c.difficulty === 'Intermediate' && 'bg-amber-500/90 text-white',
                          c.difficulty === 'Advanced' && 'bg-rose-500/90 text-white',
                        )}
                      >
                        {c.difficulty}
                      </span>
                    </div>
                    <div className="px-3 pt-2">
                      <div className="h-1.5 rounded-full bg-brand-surface-2 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${c.progressPercentage}%` }}
                          transition={{ duration: 0.7, ease: 'easeOut' }}
                          className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark"
                        />
                      </div>
                    </div>
                    <div className="p-3 pt-2 flex flex-col gap-2 flex-1">
                      <h4 className="text-sm font-bold text-brand-text-primary line-clamp-2">
                        {c.title}
                      </h4>
                      <p className="text-[11px] text-brand-text-muted inline-flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {c.progressPercentage}% complete
                      </p>
                      <button
                        onClick={() => router.push(`/dashboard/courses/${c.id}`)}
                        className="mt-auto w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white text-[11px] font-bold hover:shadow-md transition-all"
                      >
                        <GraduationCap className="w-3 h-3" />
                        {c.progressPercentage === 100 ? 'Review course' : 'Continue learning'}
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </DashboardCard>
        </div>

        {/* Latest certificate */}
        <div className="col-span-12 lg:col-span-4">
          <DashboardCard
            title="Latest certificate"
            subtitle="Your most recent achievement"
            icon={<Trophy className="w-4 h-4" />}
            ctaLabel="View all"
            ctaHref="/dashboard/profile"
            delay={0.1}
          >
            {latestCertificate ? (
              <motion.div
                whileHover={{ rotate: -1, scale: 1.02 }}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet text-white p-5 shadow-2xl"
              >
                <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full bg-brand-violet/30 blur-xl" />
                <Award className="w-7 h-7 text-white/80 mb-2 relative" />
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/60 font-bold relative">
                  Certificate
                </p>
                <h4 className="mt-1 text-base font-black leading-tight relative">
                  {latestCertificate.courseTitle}
                </h4>
                <p className="mt-3 text-[11px] text-white/70 relative">
                  Issued{' '}
                  {new Date(latestCertificate.issuedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <div className="mt-4 pt-4 border-t border-white/15 flex items-center justify-between text-[10px] uppercase tracking-wider relative">
                  <span className="text-white/60">SMEEP · Potential.org</span>
                  <span className="font-bold text-white">Verified ✓</span>
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-brand-primary/10 flex items-center justify-center">
                  <Award className="w-7 h-7 text-brand-primary/40" />
                </div>
                <p className="text-sm font-semibold text-brand-text-primary">No certificates yet</p>
                <p className="text-xs text-brand-text-muted max-w-[160px]">
                  Complete a course to earn your first certificate.
                </p>
                <button
                  onClick={() => router.push('/dashboard/courses')}
                  className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-dark transition-colors mt-1"
                >
                  Browse courses
                </button>
              </div>
            )}
          </DashboardCard>
        </div>

        {/* My AI Mentors */}
        <div className="col-span-12">
          <DashboardCard
            title="My AI Mentors"
            subtitle="Expert coaches available 24/7 — start a conversation"
            icon={<Bot className="w-4 h-4" />}
            ctaLabel="View all"
            ctaHref="/dashboard/ai-mentors"
            delay={0.15}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
              {myMentors.map((m, i) => (
                <motion.a
                  key={m.name}
                  href={`/dashboard/ai-mentors/${m.slug}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  whileHover={{ y: -6, scale: 1.02 }}
                  className="group relative rounded-2xl border border-brand-surface-2 bg-white overflow-hidden hover:border-brand-primary/40 hover:shadow-xl transition-all duration-300"
                >
                  {/* Gradient header band */}
                  <div className="h-[72px] bg-gradient-to-br from-brand-primary/15 via-brand-violet/10 to-brand-accent/10 relative flex items-end justify-center">
                    <div className="absolute bottom-0 translate-y-1/2">
                      <div className="w-[52px] h-[52px] rounded-full ring-4 ring-white shadow-lg overflow-hidden group-hover:ring-brand-primary/30 transition-all">
                        <img
                          src={m.avatar}
                          alt={m.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="pt-8 px-3 pb-4 text-center">
                    <p className="text-[13px] font-bold text-brand-text-primary leading-snug line-clamp-2">
                      {m.name}
                    </p>
                    <span className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-semibold">
                      {m.specialty}
                    </span>
                    <div className="mt-3 pt-2.5 border-t border-brand-surface-2/70">
                      <span className="text-[11px] font-semibold text-brand-primary">
                        Chat now →
                      </span>
                    </div>
                  </div>
                </motion.a>
              ))}
            </div>
          </DashboardCard>
        </div>

        {/* Live sessions collapsible */}
        <div className="col-span-12 lg:col-span-7">
          <DashboardCard
            title="Live sessions"
            subtitle="Upcoming webinars · UAE time"
            icon={<Calendar className="w-4 h-4" />}
            ctaLabel="All events"
            ctaHref="/dashboard/events"
            delay={0.2}
            bodyClassName="p-0"
          >
            {eventsLoading ? (
              <div className="divide-y divide-brand-surface-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-4">
                    <div className="rounded-xl bg-brand-surface h-14 w-14 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-brand-surface rounded-full w-3/4 animate-pulse" />
                      <div className="h-3 bg-brand-surface rounded-full w-1/2 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-5">
                <Calendar className="w-8 h-8 text-brand-text-muted/40" />
                <p className="text-sm text-brand-text-muted">No upcoming events right now.</p>
                <Link
                  href="/dashboard/events"
                  className="text-xs font-semibold text-brand-primary hover:underline"
                >
                  Browse past recordings →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-brand-surface-2">
                {upcomingEvents.map((s) => {
                  const open = openSession === s.id
                  const date = new Date(s.date)
                  const month = date.toLocaleDateString('en-US', { month: 'short' })
                  const day = date.getDate()
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setOpenSession(open ? null : s.id)}
                        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-brand-surface/60 transition-colors"
                      >
                        <div className="rounded-xl bg-brand-primary/10 text-brand-primary text-center px-3 py-2 min-w-[58px]">
                          <p className="text-[9px] font-bold uppercase tracking-wider">{month}</p>
                          <p className="text-xl font-black leading-none mt-0.5">{day}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-brand-text-primary truncate">
                            {s.title}
                          </p>
                          <p className="text-[11px] text-brand-text-muted mt-0.5 inline-flex items-center gap-1.5">
                            <Clock className="w-2.5 h-2.5" /> {s.time}
                          </p>
                        </div>
                        <ChevronDown
                          className={cn(
                            'w-4 h-4 text-brand-text-muted transition-transform flex-shrink-0',
                            open && 'rotate-180 text-brand-primary',
                          )}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-5 pt-1 text-sm text-brand-text-muted">
                              {s.description && <p>{s.description}</p>}
                              <div className="mt-3 flex gap-2 flex-wrap">
                                {s.meetingLink && (
                                  <a
                                    href={s.meetingLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-dark transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Join session
                                  </a>
                                )}
                                <Link
                                  href="/dashboard/events"
                                  className="px-3 py-1.5 rounded-lg bg-brand-surface text-brand-text-primary text-xs font-semibold hover:bg-brand-surface-2 transition-colors"
                                >
                                  View details
                                </Link>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  )
                })}
              </ul>
            )}
          </DashboardCard>
        </div>

        {/* My Mentor Sessions */}
        <div className="col-span-12 lg:col-span-5">
          <DashboardCard
            title="My Sessions"
            subtitle="Upcoming mentor sessions"
            icon={<Calendar className="w-4 h-4" />}
            ctaLabel="Book a mentor"
            ctaHref="/dashboard/human-mentors"
            delay={0.25}
          >
            {smeSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-brand-primary/50" />
                </div>
                <p className="text-sm text-brand-text-muted">No upcoming sessions.</p>
                <button
                  onClick={() => router.push('/dashboard/human-mentors')}
                  className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-dark transition-colors"
                >
                  Book a mentor
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {smeSessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-brand-surface border border-brand-surface-2"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-primary to-brand-violet flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {s.mentorUser.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-text-primary truncate">
                        {s.mentorUser.fullName}
                      </p>
                      <p className="text-xs text-brand-text-secondary">
                        {new Intl.DateTimeFormat('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(s.slot.startsAt))}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {s.meetingLink && (
                        <a
                          href={s.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-brand-primary hover:underline"
                        >
                          Join →
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={cancellingId === s.id}
                        onClick={() => handleCancelSession(s.id)}
                        className="text-[11px] font-semibold px-2 py-1 rounded-lg text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Cancel session"
                      >
                        {cancellingId === s.id ? '…' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
        </div>

        {/* Programme mentors */}
        <div className="col-span-12">
          <DashboardCard
            title="Programme mentors"
            subtitle="Book a 1:1 session with an expert"
            icon={<Users className="w-4 h-4" />}
            ctaLabel="All mentors →"
            ctaHref="/dashboard/human-mentors"
            delay={0.3}
          >
            {mentorsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <div className="w-11 h-11 rounded-full bg-brand-surface animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-brand-surface rounded-full w-2/3 animate-pulse" />
                      <div className="h-3 bg-brand-surface rounded-full w-1/2 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : programmeMentors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                <Users className="w-8 h-8 text-brand-text-muted/40" />
                <p className="text-sm text-brand-text-muted">No mentors available right now.</p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {programmeMentors.map((m, i) => (
                  <motion.li
                    key={m.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * i }}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-brand-surface transition-colors"
                  >
                    <div className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-brand-surface-2 flex-shrink-0 bg-brand-surface">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.fullName} className="w-full h-full object-cover" />
                      ) : (
                        <img
                          src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(m.fullName)}&backgroundColor=9f2063&fontSize=42&radius=50`}
                          alt={m.fullName}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-brand-text-primary truncate">{m.fullName}</p>
                      <p className="text-[11px] text-brand-text-muted truncate">
                        {m.expertise?.[0] ?? 'Mentor'}
                      </p>
                    </div>
                    <Link
                      href="/dashboard/human-mentors"
                      className="px-3 py-1.5 rounded-lg bg-brand-primary/10 text-brand-primary text-[11px] font-bold hover:bg-brand-primary hover:text-white transition-colors shrink-0"
                    >
                      Book
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </DashboardCard>
        </div>

      </div>
    </DashboardLayout>
  )
}
