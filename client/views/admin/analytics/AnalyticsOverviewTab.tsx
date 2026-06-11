'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Award,
  BookOpenCheck,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import { StatCard } from '@/components/dashboard/widgets/StatCard'
// import { AnalyticsAiTab } from './AnalyticsAiTab'
import {
  fetchOverviewKpis,
  fetchUserGrowthTrend,
  fetchCourseCompletionRates,
  fetchCoursePerformance,
} from '@/lib/api/adminAnalytics'
import type { AnalyticsRange, CoursePerformanceRow } from '@/lib/api/adminAnalytics'
import { cn } from '@/lib/utils'

type SortKey = keyof Pick<CoursePerformanceRow, 'title' | 'enrolled' | 'completionRate' | 'certificates'>
type SortDir = 'asc' | 'desc'

interface Props {
  range: AnalyticsRange
}

export function AnalyticsOverviewTab({ range }: Props) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('enrolled')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { data: kpis } = useQuery({
    queryKey: ['admin', 'analytics', 'kpi-overview', range],
    queryFn: () => fetchOverviewKpis(range),
  })

  const { data: userGrowth = [] } = useQuery({
    queryKey: ['admin', 'analytics', 'user-growth', range],
    queryFn: () => fetchUserGrowthTrend(range),
  })

  const { data: completion = [] } = useQuery({
    queryKey: ['admin', 'analytics', 'course-completion', range],
    queryFn: () => fetchCourseCompletionRates(range),
  })

  const { data: performance = [] } = useQuery({
    queryKey: ['admin', 'analytics', 'course-performance'],
    queryFn: fetchCoursePerformance,
  })

  const sortedPerformance = useMemo(() => {
    const filtered = performance.filter((c) =>
      c.title.toLowerCase().includes(query.toLowerCase()),
    )
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }, [performance, query, sortKey, sortDir])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI cards row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total users"
          value={kpis?.totalUsers ?? 0}
          icon={<Users className="w-9 h-9" />}
          accent="bg-brand-primary"
          delay={0}
        />
        <StatCard
          label="Active users"
          value={kpis?.activeUsers ?? 0}
          icon={<UserCheck className="w-9 h-9" />}
          accent="bg-brand-violet"
          delay={0.05}
        />
        <StatCard
          label="New users"
          value={kpis?.newUsers ?? 0}
          icon={<UserPlus className="w-9 h-9" />}
          accent="bg-brand-primary-dark"
          delay={0.1}
        />
        <StatCard
          label="Active learners"
          value={kpis?.activeLearners ?? 0}
          icon={<GraduationCap className="w-9 h-9" />}
          accent="bg-brand-primary"
          delay={0.15}
        />
      </div>

      {/* KPI cards row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          label="Enrolled learners"
          value={kpis?.enrolledLearners ?? 0}
          icon={<UsersRound className="w-9 h-9" />}
          accent="bg-brand-violet"
          delay={0.2}
        />
        <StatCard
          label="Total courses"
          value={kpis?.totalCourses ?? 0}
          icon={<BookOpenCheck className="w-9 h-9" />}
          accent="bg-brand-primary-dark"
          delay={0.25}
        />
        <StatCard
          label="Certificates issued"
          value={kpis?.certificatesIssued ?? 0}
          icon={<Award className="w-9 h-9" />}
          accent="bg-brand-primary"
          delay={0.3}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        {/* Users growth — full width */}
        <div className="col-span-12">
          <AdminChartCard
            title="Users growth over time"
            subtitle={range}
            icon={<Users className="w-4 h-4" />}
            delay={0.05}
          >
            <div className="h-72">
              <ResponsiveContainer>
                <AreaChart data={userGrowth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grUsersAn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9f2063" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#9f2063" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f7e8f0" vertical={false} />
                  <XAxis dataKey="label" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f7e8f0', fontSize: 12 }} />
                  <Area type="monotone" dataKey="count" name="New users" stroke="#9f2063" strokeWidth={2.5} fill="url(#grUsersAn)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </AdminChartCard>
        </div>

        {/* Course completion chart */}
        <div className="col-span-12 lg:col-span-5">
          <AdminChartCard
            title="Course completion"
            subtitle={`Completions in period · ${range}`}
            icon={<GraduationCap className="w-4 h-4" />}
            delay={0.1}
          >
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={completion} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#f7e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#6B7280"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    stroke="#6B7280"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #f7e8f0', fontSize: 12 }}
                    formatter={(v: number) => `${v}%`}
                  />
                  <Bar dataKey="completionRate" name="Completion" fill="#9f2063" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </AdminChartCard>
        </div>

        {/* Course performance table */}
        <div className="col-span-12 lg:col-span-7">
          <AdminChartCard
            title="Course performance"
            subtitle="All time · sort by any column"
            icon={<BookOpenCheck className="w-4 h-4" />}
            delay={0.15}
            actions={
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search courses…"
                className="rounded-lg border border-brand-surface-2 bg-white px-3 py-1.5 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              />
            }
          >
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-brand-text-muted border-b border-brand-surface-2">
                    <Th label="Course" k="title" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <Th label="Enrolled" k="enrolled" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    <Th label="Completion" k="completionRate" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    <Th label="Certs" k="certificates" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sortedPerformance.map((c, i) => (
                    <motion.tr
                      key={c.courseId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.04 * i }}
                      className="border-b border-brand-surface-2/60 hover:bg-brand-surface/60 transition-colors"
                    >
                      <td className="px-3 py-3 font-bold text-brand-text-primary">{c.title}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-brand-text-primary">
                        {c.enrolled.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 rounded-full bg-brand-surface-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-violet"
                              style={{ width: `${c.completionRate}%` }}
                            />
                          </div>
                          <span className="text-brand-text-primary font-semibold w-8 text-right">
                            {c.completionRate}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-brand-primary">
                        {c.certificates.toLocaleString()}
                      </td>
                    </motion.tr>
                  ))}
                  {sortedPerformance.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-sm text-brand-text-muted py-10">
                        No courses match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </AdminChartCard>
        </div>

        {/* AI section — commented out (mockup only)
        <div className="col-span-12">
          <AnalyticsAiTab />
        </div>
        */}
      </div>
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
    <th className={cn('px-3 py-2.5', align === 'right' && 'text-right')}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-brand-primary transition-colors',
          active && 'text-brand-primary',
        )}
      >
        {label}
        {active && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>
    </th>
  )
}
