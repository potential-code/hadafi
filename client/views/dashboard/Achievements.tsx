'use client'

/**
 * Achievements (ported from SMEEP): points earned, badges (earned, and how
 * close the rest are) and the leaderboard of Hadafi learners by points
 * earned, which shows only a first name and initial and lets each learner
 * leave it. Badges are awarded on the server; this page only reads them.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Award,
  CalendarCheck,
  Coins,
  Flame,
  Footprints,
  GraduationCap,
  Handshake,
  Target,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Avatar, Card, Chip, EmptyState, PageHeader, Skeleton, StatCard, Tabs } from '@/components/kit'
import { Switch } from '@/components/ui/switch'
import {
  fetchAchievements,
  fetchLeaderboard,
  setLeaderboardVisibility,
  type Achievements,
  type Badge,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from '@/lib/api/achievements'
import { cn } from '@/lib/utils'

/** Badge art: one line icon per badge, as SMEEP draws them, in Hadafi's colours. */
export const BADGE_ICONS: Record<string, LucideIcon> = {
  first_step: Footprints,
  streak_7: Flame,
  course_1: Award,
  top_marks: Target,
  big_leap: TrendingUp,
  mentored: Handshake,
  course_3: GraduationCap,
  streak_30: CalendarCheck,
}

const PERIODS: { value: LeaderboardPeriod; label: string; empty: string }[] = [
  { value: 'week', label: 'Last 7 days', empty: 'in the last 7 days' },
  { value: 'month', label: 'Last 30 days', empty: 'in the last 30 days' },
  { value: 'all', label: 'All time', empty: 'yet' },
]

const nf = new Intl.NumberFormat('en-US')
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** How far along a badge not yet earned is, in words that fit it. */
function progressText(b: Badge): string {
  const { current, target } = b.progress
  if (b.key === 'top_marks') return current ? `Best so far: ${current}%` : 'No scores yet'
  if (b.key === 'big_leap') return current > 0 ? `Best so far: +${current}` : 'Take a pre-test and final exam'
  if (b.key.startsWith('streak_')) return `Longest streak: ${current} of ${target} days`
  return `${current} of ${target}`
}

function BadgeTile({ b }: { b: Badge }) {
  const Icon = BADGE_ICONS[b.key] ?? Trophy
  const earned = !!b.earnedAt
  const pct = Math.round((b.progress.current / Math.max(1, b.progress.target)) * 100)
  return (
    <li
      className={cn(
        'flex gap-3.5 rounded-[12px] border px-4 py-3.5',
        earned ? 'border-[color-mix(in_srgb,var(--ui-brand)_25%,var(--ui-line))] bg-ui-brand-soft' : 'border-ui-line bg-ui-surface',
      )}
    >
      <span
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
          earned ? 'bg-ui-brand text-white' : 'bg-ui-surface-2 text-ui-muted',
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-snug text-ui-text">
          {b.title}
          <span className="sr-only">{earned ? ', earned' : ', not earned yet'}</span>
        </p>
        <p className="text-[13px] leading-snug text-ui-muted">{b.description}</p>
        {earned ? (
          <p className="mt-1.5 text-xs font-semibold text-ui-brand-text">Earned {fmtDate(b.earnedAt!)}</p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            <span className="h-1.5 overflow-hidden rounded-full bg-ui-surface-2" aria-hidden>
              <span className="block h-full rounded-full bg-ui-brand/60" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-xs text-ui-muted">{progressText(b)}</span>
          </div>
        )}
      </div>
    </li>
  )
}

function RankMark({ rank }: { rank: number }) {
  // Gold, silver and bronze for the top three, with dark text that reads on each.
  const medal = rank === 1 ? 'bg-[#F5C542] text-[#5c4300]' : rank === 2 ? 'bg-[#D9DDE3] text-[#3c4450]' : rank === 3 ? 'bg-[#E3A877] text-[#5a2f0c]' : ''
  return (
    <span
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums',
        medal || 'text-ui-muted',
      )}
    >
      <span className="sr-only">Rank </span>
      {rank}
    </span>
  )
}

function Row({ e, hidden }: { e: LeaderboardEntry; hidden: boolean }) {
  return (
    <li className={cn('flex items-center gap-3 px-4 py-2.5', e.isYou && 'bg-ui-brand-soft')}>
      <RankMark rank={e.rank} />
      <Avatar name={e.name} src={e.avatarUrl} size={34} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ui-text">
          <span className="truncate">{e.name}</span>
          {e.isYou && <Chip tone="brand">You</Chip>}
        </p>
        <p className="text-xs text-ui-muted">
          {e.isYou && hidden ? 'Hidden from others' : `${e.badges} badge${e.badges === 1 ? '' : 's'}`}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-ui-text">
        {nf.format(e.points)} <span className="font-normal text-ui-muted">pts</span>
      </span>
    </li>
  )
}

function LeaderboardCard({ show }: { show: boolean | undefined }) {
  const qc = useQueryClient()
  const [period, setPeriod] = useState<LeaderboardPeriod>('month')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'leaderboard', period],
    queryFn: () => fetchLeaderboard(period),
  })
  const visibility = useMutation({
    mutationFn: setLeaderboardVisibility,
    onMutate: (on: boolean) => qc.setQueryData<Achievements>(['me', 'achievements'], (a) => (a ? { ...a, showOnLeaderboard: on } : a)),
    onSuccess: (_d, on) => {
      toast.success(on ? 'You’re on the leaderboard' : 'You’re hidden from the leaderboard')
      void qc.invalidateQueries({ queryKey: ['me', 'leaderboard'] })
      void qc.invalidateQueries({ queryKey: ['me', 'achievements-summary'] })
    },
    onError: () => {
      toast.error('That didn’t save. Try again.')
      void qc.invalidateQueries({ queryKey: ['me', 'achievements'] })
    },
  })
  const emptyWhen = PERIODS.find((p) => p.value === period)!.empty
  const youOutside = data?.you && !data.entries.some((e) => e.isYou)

  return (
    <Card aria-labelledby="ach-board" role="region" className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4">
        <Trophy className="h-[18px] w-[18px] text-ui-muted" strokeWidth={1.75} aria-hidden />
        <h2 id="ach-board" className="text-base font-semibold text-ui-text">
          Leaderboard
        </h2>
      </div>
      <Tabs<LeaderboardPeriod> label="Leaderboard period" tabs={PERIODS} active={period} onChange={setPeriod} className="mt-2 px-5" />
      {isLoading ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : isError || !data ? (
        <EmptyState icon={Trophy} title="The leaderboard is taking a moment" body="Refresh the page to see where you stand." />
      ) : data.entries.length === 0 ? (
        <EmptyState icon={Trophy} title={`No points ${emptyWhen}`} body="Finish a course unit to earn points and get on the board." />
      ) : (
        <ol aria-label="Top learners" className="flex flex-col py-1.5">
          {data.entries.map((e) => (
            <Row key={`${e.rank}-${e.name}-${e.points}`} e={e} hidden={data.hidden} />
          ))}
          {youOutside && data.you && (
            <>
              <li aria-hidden className="px-4 text-center leading-none text-ui-muted">
                ⋯
              </li>
              <li className="flex items-center gap-3 bg-ui-brand-soft px-4 py-2.5">
                <RankMark rank={data.you.rank} />
                <p className="min-w-0 flex-1 text-sm font-semibold text-ui-text">
                  Your place {data.hidden && <span className="font-normal text-ui-muted">(hidden from others)</span>}
                </p>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-ui-text">
                  {nf.format(data.you.points)} <span className="font-normal text-ui-muted">pts</span>
                </span>
              </li>
            </>
          )}
        </ol>
      )}
      <div className="mt-auto flex items-center justify-between gap-4 border-t border-ui-line px-5 py-3.5">
        <label htmlFor="lb-show" className="min-w-0">
          <span className="block text-sm font-medium text-ui-text">Show me on the leaderboard</span>
          <span className="block text-[13px] text-ui-muted">Others see your first name and initial, never your email.</span>
        </label>
        <Switch
          id="lb-show"
          aria-label="Show me on the leaderboard"
          checked={show ?? true}
          disabled={show === undefined || visibility.isPending}
          onCheckedChange={(v) => visibility.mutate(v)}
          // The off track must stand out from the card (3:1) with its white thumb.
          className="data-[state=checked]:bg-ui-brand data-[state=unchecked]:bg-ui-muted dark:data-[state=unchecked]:bg-ui-muted"
        />
      </div>
    </Card>
  )
}

export default function AchievementsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['me', 'achievements'], queryFn: fetchAchievements })
  const { data: month } = useQuery({ queryKey: ['me', 'leaderboard', 'month'], queryFn: () => fetchLeaderboard('month') })
  const earned = data?.badges.filter((b) => b.earnedAt) ?? []
  const next = data?.badges.filter((b) => !b.earnedAt) ?? []

  return (
    <DashboardLayout>
      <PageHeader title="Achievements" subtitle="Your points, your badges, and where you stand among Hadafi learners." />

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-3">
        <StatCard
          label="Points earned"
          icon={Coins}
          value={data ? nf.format(data.earned) : '–'}
          hint={
            data ? (
              <>
                {nf.format(data.balance)} to spend on{' '}
                <Link href="/dashboard/offers" className="font-semibold text-ui-brand-text hover:underline">
                  offers
                </Link>
              </>
            ) : undefined
          }
        />
        <StatCard
          label="Badges"
          icon={Award}
          value={data ? `${earned.length} of ${data.badges.length}` : '–'}
          hint={next[0] ? `Next: ${next[0].title}` : data ? 'Every badge earned' : undefined}
        />
        <StatCard
          label="Your rank"
          icon={Trophy}
          value={month?.you ? `#${month.you.rank}` : '–'}
          hint={month ? (month.you ? `of ${nf.format(month.total)} learners, last 30 days` : 'Earn points to get ranked') : undefined}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-labelledby="ach-badges" className="flex min-w-0 flex-col gap-3">
          <h2 id="ach-badges" className="text-base font-semibold text-ui-text sm:text-lg">
            Badges
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-[92px]" />
              ))}
            </div>
          ) : isError || !data ? (
            <Card>
              <EmptyState icon={Award} title="Your badges are taking a moment" body="Refresh the page to see them." />
            </Card>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              {[...earned, ...next].map((b) => (
                <BadgeTile key={b.key} b={b} />
              ))}
            </ul>
          )}
        </section>
        <LeaderboardCard show={data?.showOnLeaderboard} />
      </div>
    </DashboardLayout>
  )
}
