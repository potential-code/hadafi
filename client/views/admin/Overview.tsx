'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Link2,
  Shield,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { StatCard } from '@/components/dashboard/widgets/StatCard'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import {
  fetchAdminKpiStats,
  fetchCourseCompletionRates,
  fetchCourseEngagement,
  fetchEnrollmentTrend,
  fetchUserGrowthTrend,
} from '@/lib/api/adminAnalytics'
import { getUser } from '@/lib/auth'
import { cn } from '@/lib/utils'

// Brand palette constants for Recharts (CSS vars are not readable by SVG)
const PRIMARY = '#9f2063'
const VIOLET = '#4c1d6e'
const ACCENT = '#e83e94'
const SURFACE_2 = '#f7e8f0'
const TEXT_MUTED = '#6B7280'

const QUICK_ACTIONS = [
  {
    label: 'New course',
    subtitle: 'Build with modules & blocks',
    href: '/admin/courses',
    icon: BookOpen,
    tone: 'bg-gradient-to-br from-brand-primary to-brand-primary-dark',
  },
  {
    label: 'Analytics',
    subtitle: 'Platform-wide insights',
    href: '/admin/analytics',
    icon: BarChart3,
    tone: 'bg-gradient-to-br from-brand-violet to-brand-primary',
  },
  {
    label: 'Live events',
    subtitle: 'Schedule & manage events',
    href: '/admin/live-events',
    icon: CalendarDays,
    tone: 'bg-gradient-to-br from-brand-accent to-brand-primary-dark',
  },
  {
    label: 'Offers',
    subtitle: 'Manage marketplace offers',
    href: '/admin/offers',
    icon: Tag,
    tone: 'bg-gradient-to-br from-brand-primary-dark to-brand-violet',
  },
  {
    label: 'Invites',
    subtitle: 'Generate invite codes',
    href: '/admin/invites',
    icon: Link2,
    tone: 'bg-gradient-to-br from-brand-primary-light to-brand-violet',
  },
]

export default function AdminOverview() {
  const user = getUser()

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: fetchAdminKpiStats,
  })

  const { data: userGrowth = [] } = useQuery({
    queryKey: ['admin', 'analytics', 'user-growth'],
    queryFn: () => fetchUserGrowthTrend(),
  })

  const { data: enrollmentTrend = [] } = useQuery({
    queryKey: ['admin', 'analytics', 'enrollments'],
    queryFn: fetchEnrollmentTrend,
  })

  const { data: courseEngagement = [] } = useQuery({
    queryKey: ['admin', 'analytics', 'course-engagement'],
    queryFn: fetchCourseEngagement,
  })

  const { data: courseCompletion = [] } = useQuery({
    queryKey: ['admin', 'analytics', 'course-completion'],
    queryFn: () => fetchCourseCompletionRates(),
  })

  return (
    <AdminLayout>
      {/* Welcome banner */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl mb-8 p-5 sm:p-6 bg-mesh-dark text-white border border-white/10"
      >
        <div className="absolute inset-0 bg-noise opacity-[0.05] mix-blend-overlay pointer-events-none" />
        <motion.div
          aria-hidden
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-brand-primary/40 blur-3xl"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-24 -left-16 w-64 h-64 rounded-full bg-brand-violet/40 blur-3xl"
          animate={{ scale: [1.1, 1, 1.1] }}
          transition={{ duration: 10, repeat: Infinity }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-primary-light">
              <Shield className="w-2.5 h-2.5" /> Super admin
            </span>
            <span className="text-[10px] text-white/50">{todayLabel()}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black leading-tight">
            Welcome{' '}
            <span className="text-gradient-magenta">
              {user?.fullName ?? 'Admin'}
            </span>
          </h1>
          <p className="text-[12px] sm:text-sm text-white/65 mt-1">
            Here&rsquo;s an overview of the platform.
          </p>
        </div>
      </motion.div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
        <StatCard
          label="Total members"
          value={stats?.totalUsers ?? 0}
          icon={<Users className="w-9 h-9" />}
          trend="registered users"
          accent="bg-brand-primary"
          delay={0}
        />
        <StatCard
          label="Active courses"
          value={stats?.activeCourses ?? 0}
          icon={<GraduationCap className="w-9 h-9" />}
          trend="published"
          accent="bg-brand-violet"
          delay={0.05}
        />
        <StatCard
          label="Certificates issued"
          value={stats?.certificatesIssued ?? 0}
          icon={<Award className="w-9 h-9" />}
          trend="active certificates"
          accent="bg-brand-primary-dark"
          delay={0.1}
        />
        <StatCard
          label="Active learners"
          value={stats?.activeLearnersThisMonth ?? 0}
          icon={<Sparkles className="w-9 h-9" />}
          trend="this month"
          accent="bg-brand-primary"
          delay={0.15}
        />
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-8 rounded-2xl border border-brand-surface-2 bg-white p-5 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">
              Shortcuts
            </p>
            <h2 className="text-sm font-black text-brand-text-primary leading-tight">
              Quick actions
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {QUICK_ACTIONS.map((q, i) => (
            <Link
              key={q.label}
              href={q.href}
              className="group flex flex-col items-start gap-2.5 rounded-xl border border-brand-surface-2 bg-brand-surface/40 p-4 hover:border-brand-primary/40 hover:bg-white hover:shadow-md transition-all"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform shrink-0',
                  q.tone,
                )}
              >
                <q.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 w-full">
                <p className="text-sm font-bold text-brand-text-primary leading-tight">
                  {q.label}
                </p>
                <p className="text-[11px] text-brand-text-muted mt-0.5 leading-tight">
                  {q.subtitle}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Charts row 1: User Registrations | Enrollments Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-4">
        <AdminChartCard
          title="User registrations"
          subtitle="New members per month — last 12 months"
          icon={<TrendingUp className="w-4 h-4" />}
          delay={0.1}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={userGrowth}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="grUserGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={SURFACE_2} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={TEXT_MUTED}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke={TEXT_MUTED}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${SURFACE_2}`,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="New users"
                  stroke={PRIMARY}
                  strokeWidth={2.5}
                  fill="url(#grUserGrowth)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>

        <AdminChartCard
          title="Enrollments over time"
          subtitle="New course enrollments per month — last 12 months"
          icon={<GraduationCap className="w-4 h-4" />}
          delay={0.15}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={enrollmentTrend}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="grEnrollments" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={VIOLET} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={VIOLET} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={SURFACE_2} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={TEXT_MUTED}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke={TEXT_MUTED}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${SURFACE_2}`,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Enrollments"
                  stroke={VIOLET}
                  strokeWidth={2.5}
                  fill="url(#grEnrollments)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>
      </div>

      {/* Charts row 2: Course Engagement | Course Completion Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <AdminChartCard
          title="Course engagement"
          subtitle="Active learners per course this month"
          icon={<Sparkles className="w-4 h-4" />}
          delay={0.2}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={courseEngagement}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="grEngagement" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={PRIMARY} />
                    <stop offset="100%" stopColor={ACCENT} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={SURFACE_2} horizontal={false} />
                <XAxis
                  type="number"
                  stroke={TEXT_MUTED}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  stroke={TEXT_MUTED}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${SURFACE_2}`,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="activeLearners"
                  name="Active learners"
                  fill="url(#grEngagement)"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>

        <AdminChartCard
          title="Course completion rate"
          subtitle="% of enrollees who completed each course"
          icon={<Award className="w-4 h-4" />}
          delay={0.25}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={courseCompletion}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid stroke={SURFACE_2} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  stroke={TEXT_MUTED}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  stroke={TEXT_MUTED}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${SURFACE_2}`,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`${value}%`, 'Completion rate']}
                />
                <Bar
                  dataKey="completionRate"
                  name="Completion rate"
                  radius={[0, 6, 6, 0]}
                >
                  {courseCompletion.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index % 2 === 0 ? PRIMARY : VIOLET}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>
      </div>
    </AdminLayout>
  )
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
