'use client'

/**
 * Learning gain: how much learners improve on a course, comparing their first
 * pre-test with their best final exam (GET /api/admin/analytics/learning-gain).
 * The headline sponsors ask for: "learners score N points higher after the course".
 * Ported from SMEEP 205bf7a.
 */
import { useQuery } from '@tanstack/react-query'
import { TrendingUp } from 'lucide-react'
import { Skeleton } from '@/components/kit'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import { fetchLearningGain } from '@/lib/api/adminReports'
import { cn } from '@/lib/utils'

const signed = (n: number) => `${n > 0 ? '+' : ''}${Number.isInteger(n) ? n : n.toFixed(1)}`

export function LearningGainCard({ className, maxCourses = 5 }: { className?: string; maxCourses?: number }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'learning-gain'],
    queryFn: fetchLearningGain,
    staleTime: 60_000,
  })

  return (
    <AdminChartCard
      title="Learning gain"
      subtitle="First pre-test vs best final exam, for learners who took both"
      className={className}
      aside={
        data?.avgGain != null ? (
          <span className="flex flex-col items-end">
            <span className={cn('text-[28px] font-semibold leading-none tabular-nums', data.avgGain >= 0 ? 'text-ui-ok' : 'text-ui-danger')}>
              {signed(data.avgGain)}
            </span>
            <span className="text-xs font-normal text-ui-muted">points on average</span>
          </span>
        ) : undefined
      }
    >
      {isLoading ? (
        <Skeleton className="h-[140px] rounded-[10px]" />
      ) : isError || !data ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-ui-muted">Learning gain couldn&rsquo;t load.</p>
          <button type="button" onClick={() => void refetch()} className="text-sm font-semibold text-ui-brand-text hover:underline">
            Try again
          </button>
        </div>
      ) : data.pairs === 0 ? (
        <div className="flex items-start gap-3 rounded-[10px] bg-ui-surface-2 px-4 py-3.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-ui-brand-soft text-ui-brand-text">
            <TrendingUp className="h-4 w-4" aria-hidden />
          </span>
          <p className="text-sm text-ui-muted">
            Shows once learners finish both the pre-test and the final exam of a course: their score before, their score after, and the
            difference.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Pre-test average', `${data.avgPre}%`],
              ['Final exam average', `${data.avgPost}%`],
              ['Improved', `${data.improvedPct}%`],
              ['Learners × courses', String(data.pairs)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-[10px] bg-ui-surface-2 px-3 py-2.5">
                <dt className="text-xs text-ui-muted">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums text-ui-text">{value}</dd>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col gap-2.5" aria-label="Learning gain by course">
            {data.courses.slice(0, maxCourses).map((c) => (
              <li key={c.courseId} className="flex flex-col gap-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                  <span className="min-w-0 truncate font-medium text-ui-text">{c.course}</span>
                  <span className="shrink-0 text-xs tabular-nums text-ui-muted">
                    {c.avgPre}% to {c.avgPost}%{' '}
                    <span className={cn('font-semibold', c.avgGain >= 0 ? 'text-ui-ok' : 'text-ui-danger')}>{signed(c.avgGain)}</span>
                    {', '}
                    {c.learners} learner{c.learners === 1 ? '' : 's'}
                  </span>
                </span>
                <span aria-hidden className="relative h-1.5 overflow-hidden rounded-full bg-ui-surface-2">
                  <span className="absolute inset-y-0 start-0 rounded-full bg-ui-brand/35" style={{ width: `${c.avgPost}%` }} />
                  <span className="absolute inset-y-0 start-0 rounded-full bg-ui-brand" style={{ width: `${Math.min(c.avgPre, c.avgPost)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AdminChartCard>
  )
}
