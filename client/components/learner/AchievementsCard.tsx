'use client'

/**
 * Small card on the learner home: badges earned, the next one, and this
 * month's rank, linking to Achievements. Hidden while loading fails, so the
 * home never shows a broken card.
 */
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { Card, Skeleton, btn } from '@/components/kit'
import { fetchAchievementsSummary } from '@/lib/api/achievements'
import { cn } from '@/lib/utils'

export function AchievementsCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'achievements-summary'],
    queryFn: fetchAchievementsSummary,
    retry: false,
  })
  if (isLoading) return <Skeleton className="h-[148px] rounded-[14px]" />
  if (isError || !data) return null
  return (
    <Card aria-labelledby="h-achievements" role="region" className="flex flex-col gap-3 px-5 py-4">
      <h2 id="h-achievements" className="text-base font-semibold text-ui-text">
        Achievements
      </h2>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ui-brand-soft text-ui-brand-text">
          <Trophy className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold tabular-nums text-ui-text">
            {data.badges} of {data.total} badges
            {data.rank !== null && <span className="font-normal text-ui-muted">, #{data.rank} this month</span>}
          </span>
          <span className="truncate text-[13px] text-ui-muted">
            {data.next ? `Next: ${data.next}` : 'Every badge earned. Well done.'}
          </span>
        </span>
      </div>
      <Link href="/dashboard/achievements" className={cn(btn({ variant: 'secondary', size: 'sm' }), 'h-9')}>
        Badges and leaderboard
      </Link>
    </Card>
  )
}
