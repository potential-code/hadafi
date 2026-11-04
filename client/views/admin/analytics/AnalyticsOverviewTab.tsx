'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpenCheck, Info } from 'lucide-react'
import { Button, Card, EmptyState, ProgressBar, Skeleton } from '@/components/kit'
import { BarList, PanelHeader, SearchInput, SortButton, TableCard, adminTableClass, type SortDir } from '@/components/admin/ui'
import { KpiStrip, TrendColumns } from '@/components/admin/analytics/charts'
import { HighlightKpis, InsightsCharts } from '@/components/admin/analytics/InsightsPanels'
import { LearningGainCard } from '@/components/admin/LearningGainCard'
import { fetchAnalyticsInsights } from '@/lib/api/adminReports'
import { RANGE_WORDS, fillSeries, isMonthly } from '@/components/admin/analytics/trend'
import {
  fetchOverviewKpis,
  fetchUserGrowthTrend,
  fetchCourseCompletionRates,
  fetchCoursePerformance,
} from '@/lib/api/adminAnalytics'
import type { AnalyticsRange, CoursePerformanceRow } from '@/lib/api/adminAnalytics'
import { cn } from '@/lib/utils'

type SortKey = keyof Pick<CoursePerformanceRow, 'title' | 'enrolled' | 'completionRate' | 'certificates'>

const PAGE = 10

interface Props {
  range: AnalyticsRange
}

export function AnalyticsOverviewTab({ range }: Props) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('enrolled')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [showAll, setShowAll] = useState(false)

  const insights = useQuery({
    queryKey: ['admin', 'analytics', 'insights', range],
    queryFn: () => fetchAnalyticsInsights(range),
  })

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'kpi-overview', range],
    queryFn: () => fetchOverviewKpis(range),
  })

  const { data: userGrowth = [], isLoading: growthLoading, isError: growthError } = useQuery({
    queryKey: ['admin', 'analytics', 'user-growth', range],
    queryFn: () => fetchUserGrowthTrend(range),
  })

  const { data: completion = [], isLoading: completionLoading, isError: completionError } = useQuery({
    queryKey: ['admin', 'analytics', 'course-completion', range],
    queryFn: () => fetchCourseCompletionRates(range),
  })

  const { data: performance = [], isLoading: perfLoading, isError: perfError } = useQuery({
    queryKey: ['admin', 'analytics', 'course-performance'],
    queryFn: fetchCoursePerformance,
  })

  const growthSeries = useMemo(
    () => fillSeries(range, userGrowth, ['count']).map((b) => ({ short: b.short, full: b.full, value: b.count })),
    [range, userGrowth],
  )
  const newInRange = growthSeries.reduce((s, p) => s + p.value, 0)

  const sortedPerformance = useMemo(() => {
    const filtered = performance.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
    })
  }, [performance, query, sortKey, sortDir])

  const visiblePerformance = showAll ? sortedPerformance : sortedPerformance.slice(0, PAGE)

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'title' ? 'asc' : 'desc')
    }
  }

  const kpiItems = [
    { label: 'Total users', value: kpis?.totalUsers ?? 0, hint: 'All time' },
    { label: 'Active users', value: kpis?.activeUsers ?? 0, hint: `Active in ${range}` },
    { label: 'New users', value: kpis?.newUsers ?? 0, hint: `Joined in ${range}` },
    { label: 'Active learners', value: kpis?.activeLearners ?? 0, hint: `Course progress in ${range}` },
    { label: 'Enrolled learners', value: kpis?.enrolledLearners ?? 0, hint: 'Active enrollment' },
    { label: 'Total courses', value: kpis?.totalCourses ?? 0, hint: 'Published' },
    { label: 'Certificates issued', value: kpis?.certificatesIssued ?? 0, hint: 'Active, all time' },
  ].map((k) => ({ ...k, value: k.value.toLocaleString() }))

  const noCompletions = completion.length > 0 && completion.every((c) => c.completed === 0)

  return (
    <div className="flex flex-col gap-5">
      <HighlightKpis data={insights.data} loading={insights.isLoading} range={range} />
      {insights.isError && (
        <p role="alert" className="-mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ui-muted">
          The highlights couldn&rsquo;t load.
          <Button variant="secondary" size="sm" onClick={() => insights.refetch()}>
            Try again
          </Button>
        </p>
      )}

      <KpiStrip items={kpiItems} loading={kpisLoading} />

      {/* Users growth */}
      <Card className="flex flex-col gap-2.5 px-5 py-[18px]">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ui-text">Users growth over time</h2>
            <p className="mt-0.5 text-[13px] text-ui-muted">
              New users per {isMonthly(range) ? 'month' : 'day'}, {RANGE_WORDS[range]}
            </p>
          </div>
          <span className="shrink-0 text-[13px] text-ui-muted">
            <strong className="text-[22px] font-semibold text-ui-text tabular-nums">{newInRange.toLocaleString()}</strong> new
          </span>
        </div>
        {growthLoading ? (
          <Skeleton className="mt-[18px] h-[226px]" />
        ) : growthError ? (
          <p className="py-16 text-center text-sm text-ui-muted">Could not load user growth.</p>
        ) : (
          <TrendColumns
            data={growthSeries}
            label={`New users per ${isMonthly(range) ? 'month' : 'day'}, ${growthSeries[0]?.full ?? ''} to ${growthSeries[growthSeries.length - 1]?.full ?? ''}`}
          />
        )}
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Course completion */}
        <Card className="flex flex-col gap-4 px-5 py-[18px]">
          <div>
            <h2 className="text-base font-semibold text-ui-text">Course completion</h2>
            <p className="mt-0.5 text-[13px] text-ui-muted">Completions in period, {range}. Top 8 courses by enrollment</p>
          </div>
          {completionLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-4" />)}
            </div>
          ) : completionError ? (
            <p className="py-8 text-center text-sm text-ui-muted">Could not load course completion.</p>
          ) : completion.length === 0 ? (
            <EmptyState icon={BookOpenCheck} title="No enrollments yet" body={`No learner enrolled in a course in the ${RANGE_WORDS[range]}.`} className="py-6" />
          ) : (
            <>
              <BarList
                data={completion.map((c) => ({ label: c.label, value: c.completionRate }))}
                format={(v) => `${v}%`}
                max={100}
              />
              {noCompletions && (
                <p className="flex items-center gap-2 rounded-[10px] bg-ui-surface-2 px-3 py-2.5 text-[13px] text-ui-muted">
                  <Info className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  No learner has completed a course in the {RANGE_WORDS[range]}.
                </p>
              )}
            </>
          )}
        </Card>

        {/* Course performance */}
        <TableCard
          header={
            <PanelHeader
              title="Course performance"
              subtitle="All time, sort by any column"
              className="flex-wrap max-sm:[&>div:last-child]:w-full"
              action={
                <SearchInput
                  value={query}
                  onChange={(v) => {
                    setQuery(v)
                    setShowAll(false)
                  }}
                  placeholder="Search courses"
                  className="w-[200px] font-normal max-sm:w-full"
                />
              }
            />
          }
          footer={
            sortedPerformance.length > 0 ? (
              <div className="-my-1 flex items-center justify-between gap-3">
                <span>
                  {sortedPerformance.length > PAGE && !showAll
                    ? `Showing ${PAGE} of ${sortedPerformance.length} courses`
                    : `${sortedPerformance.length} ${sortedPerformance.length === 1 ? 'course' : 'courses'}`}
                </span>
                {sortedPerformance.length > PAGE && (
                  <Button variant="secondary" size="sm" onClick={() => setShowAll((s) => !s)}>
                    {showAll ? 'Show fewer' : 'Show all'}
                  </Button>
                )}
              </div>
            ) : undefined
          }
        >
          <table className={cn(adminTableClass, 'min-w-[460px]')}>
            <thead>
              <tr>
                <Th label="Course" k="title" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Enrolled" k="enrolled" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <Th label="Completion" k="completionRate" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <Th label="Certs" k="certificates" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {perfLoading &&
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={4}>
                      <Skeleton className="h-5" />
                    </td>
                  </tr>
                ))}
              {!perfLoading &&
                visiblePerformance.map((c) => (
                  <tr key={c.courseId}>
                    <td className="font-medium text-ui-text">
                      <span className="line-clamp-2 min-w-[140px]">{c.title}</span>
                    </td>
                    <td className="text-right tabular-nums text-ui-text">{c.enrolled.toLocaleString()}</td>
                    <td className="text-right tabular-nums">
                      <span className="inline-flex items-center justify-end gap-2">
                        <ProgressBar value={c.completionRate} className="w-16" label={`${c.title} completion`} />
                        <span className={cn('w-9 text-right', c.completionRate > 0 ? 'font-semibold text-ui-text' : 'text-ui-muted')}>
                          {c.completionRate}%
                        </span>
                      </span>
                    </td>
                    <td className={cn('text-right tabular-nums', c.certificates > 0 ? 'font-semibold text-ui-text' : 'text-ui-muted')}>
                      {c.certificates.toLocaleString()}
                    </td>
                  </tr>
                ))}
              {!perfLoading && sortedPerformance.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-sm text-ui-muted">
                    {perfError ? 'Could not load course performance.' : query ? 'No courses match your search.' : 'No published courses yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableCard>
      </div>

      <InsightsCharts data={insights.data} loading={insights.isLoading} range={range} />
      <LearningGainCard maxCourses={8} />
    </div>
  )
}

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  align = 'left',
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onClick: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = k === sortKey
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn(align === 'right' && '!text-right')}
    >
      <SortButton active={active} dir={sortDir} onClick={() => onClick(k)}>
        {label}
      </SortButton>
    </th>
  )
}

