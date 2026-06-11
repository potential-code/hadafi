'use client'

import {
  Sparkles,
  MessagesSquare,
  ListChecks,
  Smile,
  UsersRound,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import {
  AI_CONVERSATIONS_OVER_TIME,
  AI_TOP_INTENTS,
  AI_SATISFACTION_TREND,
  AI_ACTIVE_USERS_PER_DAY,
} from '@/lib/adminData'

export function AnalyticsAiTab() {
  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-6">
      {/* Section header */}
      <div className="col-span-12 -mb-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">AI chatbot</p>
            <h2 className="text-lg font-black text-brand-text-primary leading-tight">Assistant insights</h2>
          </div>
        </div>
      </div>

      {/* AI conversations over time */}
      <div className="col-span-12 lg:col-span-6">
        <AdminChartCard
          title="AI conversations over time"
          subtitle="Weekly chatbot conversations"
          icon={<MessagesSquare className="w-4 h-4" />}
          delay={0.1}
        >
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={AI_CONVERSATIONS_OVER_TIME} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#f7e8f0" vertical={false} />
                <XAxis dataKey="label" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f7e8f0', fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke="#9f2063" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>
      </div>

      {/* Top user intents */}
      <div className="col-span-12 lg:col-span-6">
        <AdminChartCard
          title="Top user intents"
          subtitle="What members ask the AI"
          icon={<ListChecks className="w-4 h-4" />}
          delay={0.15}
        >
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={AI_TOP_INTENTS} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="#f7e8f0" horizontal={false} />
                <XAxis type="number" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} width={110} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f7e8f0', fontSize: 12 }} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="value" fill="#4c1d6e" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>
      </div>

      {/* AI satisfaction trend */}
      <div className="col-span-12 lg:col-span-6">
        <AdminChartCard
          title="AI satisfaction"
          subtitle="Weekly CSAT score"
          icon={<Smile className="w-4 h-4" />}
          delay={0.2}
        >
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={AI_SATISFACTION_TREND} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="grSat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e83e94" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#e83e94" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f7e8f0" vertical={false} />
                <XAxis dataKey="label" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} domain={[60, 100]} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f7e8f0', fontSize: 12 }} formatter={(v: number) => `${v}%`} />
                <Area type="monotone" dataKey="value" stroke="#e83e94" strokeWidth={2.5} fill="url(#grSat)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>
      </div>

      {/* Active chatbot users per day */}
      <div className="col-span-12 lg:col-span-6">
        <AdminChartCard
          title="Active chatbot users per day"
          subtitle="Unique members who chatted with the AI"
          icon={<UsersRound className="w-4 h-4" />}
          delay={0.25}
        >
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={AI_ACTIVE_USERS_PER_DAY} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="grActive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e83e94" />
                    <stop offset="100%" stopColor="#9f2063" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f7e8f0" vertical={false} />
                <XAxis dataKey="label" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f7e8f0', fontSize: 12 }} />
                <Bar dataKey="value" fill="url(#grActive)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminChartCard>
      </div>
    </div>
  )
}
