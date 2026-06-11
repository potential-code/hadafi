'use client'

import { useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import {
  BookUser,
  Building2,
  GraduationCap,
  Landmark,
  Rocket,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import { fetchStakeholderKpis, fetchStakeholderTrendByType } from '@/lib/api/adminAnalytics'
import type { AnalyticsRange } from '@/lib/api/adminAnalytics'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const TYPE_CONFIG = [
  { key: 'expert'     as const, label: 'Expert',     icon: <BookUser      className="w-9 h-9" />, accent: 'bg-brand-primary',      delay: 0    },
  { key: 'vc'         as const, label: 'VC',          icon: <TrendingUp    className="w-9 h-9" />, accent: 'bg-brand-violet',       delay: 0.05 },
  { key: 'government' as const, label: 'Government',  icon: <Landmark      className="w-9 h-9" />, accent: 'bg-brand-primary-dark', delay: 0.1  },
  { key: 'corporate'  as const, label: 'Corporate',   icon: <Building2     className="w-9 h-9" />, accent: 'bg-brand-primary',      delay: 0.15 },
  { key: 'university' as const, label: 'University',  icon: <GraduationCap className="w-9 h-9" />, accent: 'bg-brand-violet',       delay: 0.2  },
  { key: 'incubator'  as const, label: 'Incubator',   icon: <Rocket        className="w-9 h-9" />, accent: 'bg-brand-primary-dark', delay: 0.25 },
]

function StakeholderTypeCard({
  label,
  icon,
  accent,
  value,
  delay = 0,
}: {
  label: string
  icon: ReactNode
  accent: string
  value: number
  delay?: number
}) {
  const reduced = useReducedMotion()
  const count = useMotionValue(0)
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString())

  useEffect(() => {
    if (reduced) { count.set(value); return }
    const ctrl = animate(count, value, { duration: 1.4, delay, ease: 'easeOut' })
    return () => ctrl.stop()
  }, [value, delay, reduced, count])

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className={`group relative overflow-hidden rounded-2xl ${accent} p-5 shadow-sm hover:shadow-xl hover:shadow-black/20 transition-all cursor-default`}
    >
      {/* ambient glow blob */}
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-2xl group-hover:opacity-70 transition-opacity pointer-events-none" />

      {/* label */}
      <p className="text-[10px] font-bold text-white/65 uppercase tracking-[0.16em] truncate mb-3">
        {label}
      </p>

      {/* count left, icon right */}
      <div className="flex items-end justify-between">
        <motion.p className="text-3xl font-black text-white leading-none tabular-nums">
          {rounded}
        </motion.p>
        <div className="text-white/50 group-hover:text-white/80 group-hover:scale-110 transition-all shrink-0">
          {icon}
        </div>
      </div>
    </motion.div>
  )
}

const PIE_COLORS = ['#9f2063', '#4c1d6e', '#e83e94', '#c42b7a', '#7a1a4c', '#8b5cf6']

const LINE_COLORS: Record<string, string> = {
  expert:     '#9f2063',
  vc:         '#4c1d6e',
  government: '#e83e94',
  corporate:  '#c42b7a',
  university: '#7a1a4c',
  incubator:  '#8b5cf6',
}

const LINE_KEYS = ['expert', 'vc', 'government', 'corporate', 'university', 'incubator'] as const

interface Props {
  range: AnalyticsRange
}

export function AnalyticsStakeholdersTab({ range }: Props) {
  const { data: kpis } = useQuery({
    queryKey: ['admin', 'analytics', 'stakeholder-kpis'],
    queryFn: fetchStakeholderKpis,
  })

  const { data: trend = [] } = useQuery({
    queryKey: ['admin', 'analytics', 'stakeholder-trend-by-type', range],
    queryFn: () => fetchStakeholderTrendByType(range),
  })

  const distributionData = TYPE_CONFIG.map((t) => ({
    name: t.label,
    value: kpis?.[t.key] ?? 0,
  })).filter((d) => d.value > 0)

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {TYPE_CONFIG.map((t) => (
          <StakeholderTypeCard
            key={t.key}
            label={t.label}
            value={kpis?.[t.key] ?? 0}
            icon={t.icon}
            accent={t.accent}
            delay={t.delay}
          />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        {/* Registrations over time */}
        <div className="col-span-12 lg:col-span-8">
          <AdminChartCard
            title="Registrations over time"
            subtitle={`New applications · ${range}`}
            icon={<Users className="w-4 h-4" />}
            delay={0.1}
          >
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#f7e8f0" vertical={false} />
                  <XAxis dataKey="label" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f7e8f0', fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {LINE_KEYS.map((key) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={key.charAt(0).toUpperCase() + key.slice(1)}
                      stroke={LINE_COLORS[key]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </AdminChartCard>
        </div>

        {/* Distribution donut */}
        <div className="col-span-12 lg:col-span-4">
          <AdminChartCard
            title="Distribution by type"
            subtitle="All-time breakdown"
            icon={<Building2 className="w-4 h-4" />}
            delay={0.15}
          >
            <div className="h-72 flex flex-col items-center justify-center">
              {distributionData.length === 0 ? (
                <p className="text-sm text-brand-text-muted">No data yet</p>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="45%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {distributionData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f7e8f0', fontSize: 12 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </AdminChartCard>
        </div>
      </div>
    </div>
  )
}
