'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'
import {
  Award,
  BookOpenCheck,
  Check,
  ChevronRight,
  FileText,
  Flame,
  Lightbulb,
  Megaphone,
  Mic,
  Play,
  Zap,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Avatar, Card, Chip, CoverTile, EmptyState, ProgressBar, SectionHeader, Skeleton, btn } from '@/components/kit'
import { getUser } from '@/lib/auth'
import { aiMentorViews } from '@/components/dashboard/aiMentorMeta'
import { ASK_HANA_PENDING_KEY } from '@/components/dashboard/AskHanaParts'
import { HANA_AVATAR_SRC } from '@/components/dashboard/HanaMessages'
import { useDictation } from '@/components/dashboard/useHanaVoice'
import { useNarrow } from '@/components/dashboard/useNarrow'
import { fetchLearnerCourses, fetchUserCertificates } from '@/lib/api/lms'
import { cancelSmeSession, getSmeSessions, getMentors, type MentorUser, type SmeSession } from '@/lib/api/sme'
import { fetchOffers } from '@/lib/api/offers'
import { fetchMyEvents, type LiveEvent } from '@/lib/api/liveEvents'
import { timeLabel } from '@/lib/events/eventTime'
import { fetchStreak, type Streak } from '@/lib/api/redesign'
import {
  courseHref,
  sortByRecent,
  topicIcon,
  useCourseSummaries,
  type CourseListItem,
  type CourseSummary,
} from '@/components/learner/courseProgress'
import { cn } from '@/lib/utils'
import { AchievementsCard } from '@/components/learner/AchievementsCard'

function timeGreeting(d = new Date()) {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Today as YYYY-MM-DD in the learner's own timezone. */
function isoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The server's own words for a failed request, or a plain fallback. */
function errorMessage(err: unknown, fallback: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any
  const msg = e?.error?.message ?? (typeof e?.error === 'string' ? e.error : undefined) ?? e?.message
  return typeof msg === 'string' && msg.trim() ? msg : fallback
}

/** Opens Ask Hana; a non-empty question is sent there as the first message. */
function useOpenAskHana() {
  const router = useRouter()
  return (question?: string) => {
    const q = question?.trim()
    try {
      if (q) sessionStorage.setItem(ASK_HANA_PENDING_KEY, q)
    } catch {
      /* storage blocked: Hana still opens */
    }
    router.push('/dashboard/assistant')
  }
}

export default function DashboardOverview() {
  const user = getUser()
  const firstName = (user?.fullName ?? 'there').split(' ')[0]
  const aiMentors = useMemo(() => aiMentorViews().slice(0, 4), [])

  const { data: allCourses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['learner-courses'],
    queryFn: fetchLearnerCourses,
  })
  const courses = allCourses as CourseListItem[]
  const { data: certificates = [] } = useQuery({ queryKey: ['user-certificates'], queryFn: fetchUserCertificates })
  const { data: offersData } = useQuery({ queryKey: ['offers'], queryFn: fetchOffers })
  const { data: liveEvents = [] } = useQuery({ queryKey: ['live-events', 'mine'], queryFn: fetchMyEvents, refetchInterval: 60_000 })
  const { data: apiMentors = [], isLoading: mentorsLoading } = useQuery({ queryKey: ['mentors'], queryFn: getMentors })
  const streakQuery = useQuery({ queryKey: ['me-streak'], queryFn: fetchStreak, retry: false })

  const inProgress = useMemo(() => courses.filter((c) => c.isEnrolled && c.progressPercentage < 100), [courses])
  const { byId: summaries, isLoading: summariesLoading } = useCourseSummaries(inProgress.map((c) => c.id))
  const inProgressSorted = useMemo(
    () => [...inProgress].sort((a, b) => sortByRecent(summaries.get(a.id), summaries.get(b.id))),
    [inProgress, summaries],
  )
  // The course list: everything in progress, then finished courses to review,
  // topped up to three rows.
  const completed = useMemo(() => courses.filter((c) => c.isEnrolled && c.progressPercentage >= 100), [courses])
  const myCourses = useMemo(
    () => [...inProgressSorted, ...completed.slice(0, Math.max(0, 3 - inProgressSorted.length))],
    [inProgressSorted, completed],
  )
  const current = inProgressSorted[0] ?? null
  const currentSummary = current ? summaries.get(current.id) : undefined
  const recommended = useMemo(() => courses.filter((c) => !c.isEnrolled).slice(0, 4), [courses])

  // "Welcome back" only for someone who has been here before; a brand-new
  // account must not be greeted as returning. A previous home visit on this
  // device, or any enrollment, counts as returning.
  const [visitedBefore, setVisitedBefore] = useState(false)
  // Decide once per mount: StrictMode re-runs effects in development, and the
  // second run would read back the flag the first run just wrote.
  const greetingDecided = useRef(false)
  useEffect(() => {
    if (!user?.id || greetingDecided.current) return
    greetingDecided.current = true
    const key = `hadafi.dashboardVisited.${user.id}`
    try {
      if (localStorage.getItem(key)) setVisitedBefore(true)
      else localStorage.setItem(key, '1')
    } catch {
      /* private mode: treat as a first visit */
    }
  }, [user?.id])
  const returning = visitedBefore || courses.some((c) => c.isEnrolled)
  // The time of day is the browser's, so it is only shown after mount.
  const [greetingWord, setGreetingWord] = useState('Welcome')
  useEffect(() => {
    if (returning) setGreetingWord(timeGreeting())
  }, [returning])

  const [smeSessions, setSmeSessions] = useState<SmeSession[]>([])
  const [sessionsFailed, setSessionsFailed] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  useEffect(() => {
    getSmeSessions()
      .then(({ upcoming }) => setSmeSessions(upcoming.slice(0, 2)))
      .catch(() => setSessionsFailed(true))
  }, [])
  async function handleCancelSession(id: string) {
    setCancellingId(id)
    try {
      await cancelSmeSession(id)
      setSmeSessions((prev) => prev.filter((s) => s.id !== id))
      toast.success('Session cancelled')
    } catch (err) {
      toast.error(errorMessage(err, 'The session could not be cancelled. Please try again.'))
    } finally {
      setCancellingId(null)
    }
  }

  // Events still running or ahead; what she booked first, then soonest first.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => setNow(Date.now()), [])
  const upcomingEvents = useMemo(
    () =>
      now === null
        ? []
        : liveEvents
            .filter((e) => Date.parse(e.endsAt) > now && !e.endedAt)
            .sort((a, b) => Number(!!b.booked) - Number(!!a.booked) || a.startsAt.localeCompare(b.startsAt))
            .slice(0, 4),
    [liveEvents, now],
  )

  const subtitle = currentSummary
    ? currentSummary.allUnitsDone
      ? `Every unit of ${currentSummary.title} is done. The final exam is next.`
      : `You're on Unit ${currentSummary.currentUnitNumber} of ${currentSummary.title}. One unit step a day keeps your streak going.`
    : inProgress.length > 0
      ? `You have ${inProgress.length} course${inProgress.length === 1 ? '' : 's'} in progress.`
      : 'Start a course today and build skills that move your business forward.'

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ui-text sm:text-[28px] sm:leading-tight">
            {greetingWord}, {firstName}
          </h1>
          <p className="max-w-[70ch] text-[15px] text-ui-muted">{subtitle}</p>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <ContinueCard
            loading={coursesLoading || (!!current && summariesLoading && !currentSummary)}
            course={current}
            summary={currentSummary}
            hasCourses={courses.some((c) => c.isEnrolled)}
          />
          <StreakCard
            streak={streakQuery.data}
            loading={streakQuery.isLoading}
            failed={streakQuery.isError}
            points={offersData?.userPoints ?? 0}
            offersCount={offersData?.offers.length ?? 0}
          />
        </div>

        <AskHanaBar />

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-5">
            <InProgressCard loading={coursesLoading} courses={myCourses} summaries={summaries} />
            <ComingUpCard
              sessions={smeSessions}
              sessionsFailed={sessionsFailed}
              events={upcomingEvents}
              cancellingId={cancellingId}
              onCancel={handleCancelSession}
            />
            <BusinessToolsCard />
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <MentorsCard loading={mentorsLoading} mentors={apiMentors.slice(0, 3)} />
            <CertificateCard certificates={certificates} />
            <AchievementsCard />
            <Card aria-labelledby="h-ai-mentors" role="region">
              <div className="flex items-center justify-between gap-3 px-5 pt-4">
                <h2 id="h-ai-mentors" className="text-base font-semibold text-ui-text">
                  AI mentors
                </h2>
                <Link href="/dashboard/ai-mentors" className="text-[13px] font-semibold text-ui-brand-text hover:underline">
                  All AI mentors
                </Link>
              </div>
              <p className="px-5 pt-0.5 text-[13px] text-ui-muted">Specialist coaches you can chat with any time.</p>
              <ul className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-2 lg:grid-cols-1">
                {aiMentors.map((m) => (
                  <li key={m.slug}>
                    <Link
                      href={`/dashboard/ai-mentors/${m.slug}`}
                      className="flex items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-ui-surface-2"
                    >
                      <span
                        aria-hidden
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
                        style={{ background: m.tile.bg, color: m.tile.fg }}
                      >
                        <m.icon className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold text-ui-text">{m.name}</span>
                        <span className="truncate text-[13px] text-ui-muted">{m.specialty}</span>
                      </span>
                      <ChevronRight className="ms-auto h-4 w-4 shrink-0 text-ui-muted rtl:rotate-180" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        <section aria-labelledby="h-rec">
          <SectionHeader
            id="h-rec"
            title="Recommended for you"
            action={
              <Link href="/dashboard/courses" className="text-ui-brand-text hover:underline">
                Browse all courses
              </Link>
            }
          />
          {coursesLoading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-56 rounded-[14px]" />
              ))}
            </div>
          ) : recommended.length === 0 ? (
            <Card>
              <EmptyState
                icon={BookOpenCheck}
                title={courses.length > 0 ? "You're enrolled in every course" : 'New courses are on the way'}
                body={courses.length > 0 ? 'Pick up where you left off from Your courses.' : 'Check back soon for practical courses for your business.'}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {recommended.map((c) => (
                <Link key={c.id} href={courseHref(c.id)} className="group rounded-[14px]">
                  <Card interactive className="flex h-full flex-col overflow-hidden">
                    <CoverTile src={c.cover} title={c.title} icon={topicIcon(c.category)} />
                    <span className="flex flex-col gap-1.5 p-3.5">
                      <span className="text-[15px] font-semibold leading-snug text-ui-text">{c.title}</span>
                      <span className="text-[13px] text-ui-muted">{courseFacts(c)}</span>
                    </span>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

function courseFacts(c: CourseListItem) {
  const parts: string[] = []
  if (typeof c.unitCount === 'number' && c.unitCount > 0) parts.push(`${c.unitCount} unit${c.unitCount === 1 ? '' : 's'}`)
  else parts.push(c.category ?? c.difficulty)
  if (c.enableCertificate) parts.push('certificate')
  return parts.join(', ')
}

// ── Continue learning ────────────────────────────────────────────────────────

function ContinueCard({
  loading,
  course,
  summary,
  hasCourses,
}: {
  loading: boolean
  course: CourseListItem | null
  summary: CourseSummary | undefined
  hasCourses: boolean
}) {
  if (loading) return <Skeleton className="h-[260px] rounded-[14px]" />
  if (!course) {
    return (
      <Card className="flex items-center justify-center shadow-ui">
        <EmptyState
          icon={BookOpenCheck}
          title={hasCourses ? 'All your courses are complete' : 'Start your first course'}
          body={
            hasCourses
              ? 'Well done. Pick a new course or see your certificates.'
              : 'Short, practical courses for running and growing your business.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/dashboard/courses" className={btn()}>
                Browse courses
              </Link>
              <Link href={hasCourses ? '/dashboard/certificates' : '/dashboard/assistant'} className={btn({ variant: 'secondary' })}>
                {hasCourses ? 'My certificates' : 'Ask Hana for a course'}
              </Link>
            </div>
          }
        />
      </Card>
    )
  }
  const pct = summary?.progress ?? course.progressPercentage
  const unitLine = summary
    ? summary.allUnitsDone
      ? `All ${summary.totalUnits} units done, final exam next`
      : `Unit ${summary.currentUnitNumber} of ${summary.totalUnits}${summary.currentUnit?.title ? `: ${summary.currentUnit.title}` : ''}`
    : null
  return (
    <section
      aria-labelledby="h-continue"
      className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface shadow-ui md:grid-cols-[260px_minmax(0,1fr)]"
    >
      <div className="relative">
        <CoverTile
          src={course.cover}
          title={course.title}
          icon={topicIcon(course.category)}
          className="h-full max-h-[200px] min-h-[180px] md:aspect-auto md:max-h-none md:min-h-[240px]"
        />
        <Link
          href={courseHref(course.id)}
          aria-label={`Resume ${course.title}`}
          className="absolute left-1/2 top-1/2 inline-flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#c8106a] shadow-[0_6px_20px_rgba(0,0,0,0.2)] transition-transform hover:scale-105"
        >
          <Play className="ml-0.5 h-[22px] w-[22px] fill-current" aria-hidden />
        </Link>
      </div>
      <div className="flex flex-col gap-3.5 p-5 sm:px-6 sm:py-[22px]">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-ui-muted">Continue learning</span>
          <h2 id="h-continue" className="text-xl font-semibold tracking-[-0.01em] text-ui-text">
            {course.title}
          </h2>
          {unitLine && <p className="text-[15px] text-ui-muted">{unitLine}</p>}
        </div>
        {summary && summary.steps.length > 0 && !summary.allUnitsDone && (
          <ol aria-label="Unit steps" className="flex flex-wrap gap-1.5">
            {summary.steps.map((s) => (
              <li
                key={s.id}
                aria-current={s.state === 'current' ? 'step' : undefined}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
                  s.state === 'done' && 'bg-ui-ok-soft text-ui-ok',
                  s.state === 'current' && 'bg-ui-brand text-white',
                  s.state === 'todo' && 'border border-ui-line text-ui-muted',
                )}
              >
                {s.state === 'done' && <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
                {s.label}
                {s.state === 'done' && <span className="sr-only">, done</span>}
              </li>
            ))}
          </ol>
        )}
        <div className="flex items-center gap-3">
          <ProgressBar value={pct} className="flex-1" label={`${course.title} progress`} />
          <span className="text-[13px] font-semibold tabular-nums text-ui-text">{pct}%</span>
        </div>
        <div className="mt-auto flex flex-wrap gap-2.5">
          <Link href={courseHref(course.id)} className={btn()}>
            Resume
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── Streak and points ────────────────────────────────────────────────────────

function StreakCard({
  streak,
  loading,
  failed,
  points,
  offersCount,
}: {
  streak: Streak | undefined
  loading: boolean
  failed: boolean
  points: number
  offersCount: number
}) {
  // Today in the browser's timezone, read after mount.
  const [today, setToday] = useState('')
  useEffect(() => setToday(isoToday()), [])
  const pointsRow = (
    <div className={cn('flex items-center justify-between gap-3', streak && 'border-t border-ui-line pt-3.5')}>
      <div className="flex flex-col">
        <span className="text-[22px] font-bold tabular-nums tracking-[-0.01em] text-ui-text">{points.toLocaleString()}</span>
        <span className="text-xs text-ui-muted">
          points to spend on offers{offersCount > 0 ? `, ${offersCount} available` : ''}
        </span>
      </div>
      <Link href="/dashboard/offers" className={btn({ variant: 'secondary', size: 'sm' })}>
        View offers
      </Link>
    </div>
  )
  if (loading) return <Skeleton className="h-[260px] rounded-[14px]" />
  if (failed || !streak) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-base font-semibold text-ui-text">Your points</h2>
        <p className="text-[13px] leading-relaxed text-ui-muted">Earn points for every unit you finish, then spend them on partner offers.</p>
        <div className="mt-auto">{pointsRow}</div>
      </Card>
    )
  }
  const goalMet = streak.todaySteps >= streak.dailyGoal
  return (
    <Card aria-labelledby="h-streak" className="flex flex-col gap-4 p-5" role="region">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ui-brand-soft text-ui-brand-text">
          <Flame className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex flex-col">
          <h2 id="h-streak" className="text-lg font-semibold text-ui-text">
            {streak.currentStreak > 0 ? `${streak.currentStreak}-day streak` : 'Start a streak today'}
          </h2>
          <span className="text-[13px] text-ui-muted">
            {goalMet
              ? "Today's goal done. See you tomorrow."
              : `Daily goal: finish ${streak.dailyGoal} unit step${streak.dailyGoal === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>
      <ol aria-label="This week" className="grid grid-cols-7 gap-1.5 text-center">
        {streak.week.map((d) => {
          const isToday = d.date === today
          const future = today !== '' && d.date > today
          const label = new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
          return (
            <li key={d.date} className="flex flex-col items-center gap-1.5">
              <span className={cn('text-xs', isToday ? 'font-semibold text-ui-text' : 'text-ui-muted')}>{label}</span>
              {d.done ? (
                <span
                  className={cn(
                    'inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-ui-brand text-white',
                    isToday && 'ring-[3px] ring-ui-brand-soft',
                  )}
                >
                  <Check className="h-[15px] w-[15px]" strokeWidth={2.6} aria-label={isToday ? 'Done today' : 'Done'} />
                </span>
              ) : (
                <span
                  role={future ? undefined : 'img'}
                  aria-label={future ? undefined : isToday ? 'Not done yet today' : 'Missed'}
                  aria-hidden={future ? true : undefined}
                  className={cn('h-[30px] w-[30px] rounded-full border border-ui-line', future && 'border-dashed')}
                />
              )}
            </li>
          )
        })}
      </ol>
      {pointsRow}
    </Card>
  )
}

// ── Ask Hana ─────────────────────────────────────────────────────────────────

function AskHanaBar() {
  const narrow = useNarrow()
  const openAskHana = useOpenAskHana()
  const [text, setText] = useState('')
  const dictation = useDictation((t) => setText(t))

  function submit(e: FormEvent) {
    e.preventDefault()
    dictation.stop()
    openAskHana(text)
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-[14px] border border-ui-line bg-ui-surface py-2.5 ps-3.5 pe-2.5 sm:gap-3">
      <img src={HANA_AVATAR_SRC} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover object-top" />
      <label htmlFor="home-ask" className="sr-only">
        Ask Hana
      </label>
      <input
        id="home-ask"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={narrow ? 'Ask Hana anything' : 'Ask Hana anything: a course for my business, a mentor, how to price a service...'}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-ui-text outline-none placeholder:text-ui-muted"
      />
      {dictation.supported && (
        <button
          type="button"
          onClick={dictation.listening ? dictation.stop : dictation.start}
          aria-label={dictation.listening ? 'Stop dictation' : 'Speak to Hana'}
          aria-pressed={dictation.listening}
          className={cn(btn({ variant: 'secondary', size: 'icon' }), dictation.listening && 'border-ui-brand text-ui-brand-text')}
        >
          <Mic className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </button>
      )}
      <button type="submit" className={btn()}>
        Ask
      </button>
    </form>
  )
}

// ── In progress ──────────────────────────────────────────────────────────────

function InProgressCard({
  loading,
  courses,
  summaries,
}: {
  loading: boolean
  courses: CourseListItem[]
  summaries: Map<string, CourseSummary>
}) {
  return (
    <Card aria-labelledby="h-progress" role="region">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 id="h-progress" className="text-base font-semibold text-ui-text">
          Your courses
        </h2>
        <Link href="/dashboard/courses" className="text-[13px] font-semibold text-ui-brand-text hover:underline">
          All my courses
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3 border-t border-ui-line p-5">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : courses.length === 0 ? (
        <div className="border-t border-ui-line">
          <EmptyState
            icon={BookOpenCheck}
            title="No courses yet"
            body="Courses you start show up here with your progress."
            action={
              <Link href="/dashboard/courses" className={btn({ variant: 'secondary', size: 'sm' })}>
                Browse courses
              </Link>
            }
          />
        </div>
      ) : (
        <ul>
          {courses.map((c) => {
            const s = summaries.get(c.id)
            const done = c.progressPercentage >= 100
            const pct = done ? 100 : (s?.progress ?? c.progressPercentage)
            const line = done
              ? 'Completed'
              : s
                ? s.allUnitsDone
                  ? 'Next: final exam'
                  : pct === 0
                    ? `${s.totalUnits} units, not started`
                    : `Next: ${s.currentUnit?.title ?? `Unit ${s.currentUnitNumber}`}`
                : `${pct}% complete`
            return (
              <li key={c.id} className="border-t border-ui-line">
                <Link
                  href={courseHref(c.id)}
                  aria-label={done ? `Review ${c.title}` : undefined}
                  className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-ui-bg sm:grid-cols-[64px_minmax(0,1fr)_140px_24px] sm:gap-4 sm:px-5"
                >
                  <CoverTile
                    src={c.cover}
                    title={c.title}
                    icon={topicIcon(c.category)}
                    className="aspect-auto h-10 rounded-lg sm:h-11 [&_svg]:h-5 [&_svg]:w-5"
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[15px] font-semibold text-ui-text">{c.title}</span>
                    <span className={cn('line-clamp-2 text-[13px] leading-5', done ? 'font-medium text-ui-ok' : 'text-ui-muted')}>
                      {c.difficulty && <Chip className="me-2 h-5 px-1.5 align-[1px] text-[11px] font-semibold">{c.difficulty}</Chip>}
                      {done && <Check className="me-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2.5} aria-hidden />}
                      {line}
                    </span>
                  </span>
                  {done ? (
                    <span className={cn(btn({ variant: 'secondary', size: 'sm' }), 'justify-self-end sm:w-full')}>Review</span>
                  ) : (
                    <span className="flex items-center gap-2.5">
                      <ProgressBar value={pct} className="hidden flex-1 sm:block" label={`${c.title} progress`} />
                      <span className="w-[44px] text-end text-[13px] font-semibold tabular-nums text-ui-text sm:w-[34px]">{pct}%</span>
                    </span>
                  )}
                  <ChevronRight className="hidden h-[18px] w-[18px] text-ui-muted sm:block rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ── Coming up ────────────────────────────────────────────────────────────────

function ComingUpCard({
  sessions,
  sessionsFailed,
  events,
  cancellingId,
  onCancel,
}: {
  sessions: SmeSession[]
  sessionsFailed: boolean
  events: LiveEvent[]
  cancellingId: string | null
  onCancel: (id: string) => void
}) {
  return (
    <Card aria-labelledby="h-coming" role="region" className="flex flex-col gap-3.5 px-5 py-4">
      <h2 id="h-coming" className="text-base font-semibold text-ui-text">
        Coming up
      </h2>
      {sessions.length > 0 && (
        <ul aria-label="Mentor sessions" className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3.5 sm:grid-cols-2">
          {sessions.map((s) => (
            <li key={s.id} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3">
              <Avatar name={s.mentorUser.fullName} src={s.mentorUser.avatarUrl} size={44} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-semibold text-ui-text">Session with {s.mentorUser.fullName}</span>
                <span className="text-[13px] text-ui-muted">
                  {new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
                    new Date(s.slot.startsAt),
                  )}
                </span>
                <span className="mt-1 flex gap-3 text-[13px] font-semibold">
                  {s.meetingLink && (
                    <a href={s.meetingLink} target="_blank" rel="noreferrer" className="text-ui-brand-text hover:underline">
                      Join
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={cancellingId === s.id}
                    onClick={() => onCancel(s.id)}
                    aria-label={`Cancel session with ${s.mentorUser.fullName}`}
                    className="text-ui-danger hover:underline disabled:opacity-50"
                  >
                    {cancellingId === s.id ? 'Cancelling' : 'Cancel'}
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {events.length > 0 && (
        <ul aria-label="Live events" className={cn('grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 sm:grid-cols-2', sessions.length > 0 && 'border-t border-ui-line pt-3.5')}>
          {events.map((e) => {
            const d = new Date(e.startsAt)
            return (
              <li key={e.id} className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-3">
                <span className="flex h-12 w-11 flex-col items-center justify-center rounded-[10px] border border-ui-line text-[11px] text-ui-muted">
                  {d.toLocaleDateString('en-US', { month: 'short' })}
                  <strong className="text-base leading-tight text-ui-text">{d.getDate()}</strong>
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold leading-snug text-ui-text">{e.title}</span>
                  <span className="text-[13px] text-ui-muted">
                    {timeLabel(e.startsAt)}, {e.format === 'in_person' ? (e.location ?? 'in person') : 'online'}
                    {e.booked ? ', booked' : ''}
                  </span>
                  {e.description && <span className="line-clamp-2 text-[13px] leading-snug text-ui-muted">{e.description}</span>}
                  <span className="mt-1 flex gap-3 text-[13px] font-semibold">
                    {e.meetingLink && (
                      <a href={e.meetingLink} target="_blank" rel="noreferrer" className="text-ui-brand-text hover:underline">
                        Join session
                      </a>
                    )}
                    <Link href="/dashboard/events" className="text-ui-brand-text hover:underline">
                      View details
                    </Link>
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {sessionsFailed && (
        <p className="text-[13px] text-ui-muted" role="status">
          Your mentor sessions could not load. Refresh the page to try again.
        </p>
      )}
      {events.length === 0 && (
        <p className="text-[13px] text-ui-muted">
          {sessions.length === 0 && !sessionsFailed ? 'No mentor sessions booked and no live events scheduled.' : 'No live events scheduled.'}{' '}
          <Link href="/dashboard/events" className="font-semibold text-ui-brand-text hover:underline">
            Browse past recordings
          </Link>
        </p>
      )}
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Link href="/dashboard/human-mentors" className={cn(btn({ variant: 'secondary', size: 'sm' }), 'h-9 max-sm:flex-1')}>
          Find a mentor
        </Link>
        <Link href="/dashboard/sessions" className={cn(btn({ variant: 'ghost', size: 'sm' }), 'h-9')}>
          My bookings
        </Link>
        <Link href="/dashboard/events" className={cn(btn({ variant: 'ghost', size: 'sm' }), 'h-9')}>
          All events
        </Link>
      </div>
    </Card>
  )
}

// ── Business tools (Hana's guided writers) ───────────────────────────────────

// Same trigger messages as the AI tool cards in Ask Hana, so the guided flows
// start the same way from either place.
const BUSINESS_TOOLS: { label: string; body: string; icon: LucideIcon; message: string }[] = [
  { label: 'Business plan', body: 'An investor-ready plan for your business', icon: FileText, message: 'Help me create a business plan' },
  { label: 'Business ideas', body: 'Ideas that fit your passion and experience', icon: Lightbulb, message: 'Help me brainstorm a business idea' },
  { label: 'Product proposal', body: 'A persuasive proposal for your next pitch', icon: Zap, message: 'Help me write a product proposal' },
  { label: 'Marketing plan', body: 'Ads, social media and email in one plan', icon: Megaphone, message: 'Help me create a marketing plan' },
]

function BusinessToolsCard() {
  const openAskHana = useOpenAskHana()
  return (
    <Card aria-labelledby="h-tools" role="region" className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="h-tools" className="text-base font-semibold text-ui-text">
          Write with Hana
        </h2>
        <p className="text-[13px] text-ui-muted">Hana guides you step by step and emails you the PDF.</p>
      </div>
      {/* minmax(0,1fr): a bare grid column grows to its untruncated text and runs off a phone. */}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        {BUSINESS_TOOLS.map((t) => (
          <li key={t.label}>
            <button
              type="button"
              onClick={() => openAskHana(t.message)}
              className="group flex w-full items-center gap-3 rounded-[12px] border border-ui-line bg-ui-surface px-3 py-2.5 text-start transition-colors hover:bg-ui-surface-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-brand"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-ui-brand-soft text-ui-brand-text">
                <t.icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold text-ui-text">{t.label}</span>
                <span className="truncate text-[13px] text-ui-muted">{t.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ── Program mentors ──────────────────────────────────────────────────────────

function MentorsCard({ loading, mentors }: { loading: boolean; mentors: MentorUser[] }) {
  return (
    <Card aria-labelledby="h-mentors" role="region" className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="h-mentors" className="text-base font-semibold text-ui-text">
          Mentors
        </h2>
        <Link href="/dashboard/human-mentors" className="text-[13px] font-semibold text-ui-brand-text hover:underline">
          All mentors
        </Link>
      </div>
      <p className="-mt-2 text-[13px] text-ui-muted">Book a 1:1 session with an expert.</p>
      {loading ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : mentors.length === 0 ? (
        <p className="text-[13px] text-ui-muted">New mentors are joining soon.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {mentors.map((m) => (
            <li key={m.id} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3">
              <Avatar name={m.fullName} src={m.avatarUrl} size={40} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-ui-text">{m.fullName}</span>
                <span className="truncate text-[13px] text-ui-muted">{m.expertise?.slice(0, 2).join(', ') || 'Mentor'}</span>
              </span>
              <Link
                href={`/dashboard/human-mentors?mentor=${encodeURIComponent(m.id)}`}
                aria-label={`Book ${m.fullName}`}
                className={btn({ variant: 'soft', size: 'sm' })}
              >
                Book
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ── Certificates ─────────────────────────────────────────────────────────────

function CertificateCard({ certificates }: { certificates: { id: string; courseTitle: string; issuedAt: string }[] }) {
  const latest = certificates[0] ?? null
  return (
    <Card aria-labelledby="h-cert" role="region" className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="h-cert" className="text-base font-semibold text-ui-text">
          Certificates
        </h2>
        <span className="rounded-full bg-ui-surface-2 px-2 text-xs font-semibold tabular-nums text-ui-muted">{certificates.length}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ui-brand-soft text-ui-brand-text">
          <Award className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        {latest ? (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-ui-text">{latest.courseTitle}</span>
            <span className="text-[13px] text-ui-muted">
              Latest, issued{' '}
              {new Date(latest.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </span>
        ) : (
          <span className="text-[13px] leading-snug text-ui-muted">Finish a course to earn your first certificate.</span>
        )}
      </div>
      <Link href="/dashboard/certificates" className={cn(btn({ variant: 'secondary', size: 'sm' }), 'h-9')}>
        {latest ? 'View certificates' : 'How certificates work'}
      </Link>
    </Card>
  )
}
