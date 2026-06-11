'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { AnalyticsOverviewTab } from './analytics/AnalyticsOverviewTab'
import { AnalyticsStakeholdersTab } from './analytics/AnalyticsStakeholdersTab'
// import { AnalyticsAiTab } from './analytics/AnalyticsAiTab'
import type { AnalyticsRange } from '@/lib/api/adminAnalytics'
import { cn } from '@/lib/utils'

const RANGES = ['7d', '30d', '12m'] as const
type Tab = 'overview' | 'stakeholders' | 'ai'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Main Overview' },
  { id: 'stakeholders', label: 'Stakeholder Applications' },
  // { id: 'ai', label: 'AI Insights' },
]

export default function AdminAnalytics() {
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Analytics"
        title="Platform"
        highlight="insights"
        subtitle="Real-time data on users, learning outcomes, stakeholder applications, and AI assistant activity."
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-wrap items-center justify-between gap-3"
      >
        {/* Tab switcher */}
        <div className="flex items-center gap-0 border-b border-brand-surface-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'text-brand-primary'
                  : 'text-brand-text-muted hover:text-brand-primary',
              )}
            >
              {activeTab === tab.id && (
                <motion.span
                  layoutId="analytics-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Range filter — hidden on AI Insights tab */}
        {activeTab !== 'ai' && (
          <div className="inline-flex rounded-xl border border-brand-surface-2 bg-white p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'px-3 py-1 text-xs font-bold rounded-lg transition-colors',
                  range === r
                    ? 'bg-brand-primary text-white'
                    : 'text-brand-text-muted hover:text-brand-primary',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'overview' && <AnalyticsOverviewTab range={range} />}
        {activeTab === 'stakeholders' && <AnalyticsStakeholdersTab range={range} />}
        {/* {activeTab === 'ai' && <AnalyticsAiTab />} */}
      </motion.div>
    </AdminLayout>
  )
}
