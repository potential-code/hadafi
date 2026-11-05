'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LayoutGrid, Sparkles } from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader, Tabs, btn } from '@/components/kit'
import { Segmented } from '@/components/admin/ui'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { AnalyticsOverviewTab } from './analytics/AnalyticsOverviewTab'
import { AnalyticsStakeholdersTab } from './analytics/AnalyticsStakeholdersTab'
import type { AnalyticsRange } from '@/lib/api/adminAnalytics'

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '12m', label: '12m' },
]
type Tab = 'overview' | 'stakeholders'

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Main overview' },
  { value: 'stakeholders', label: 'Stakeholder applications' },
]

export default function AdminAnalytics() {
  const [range, setRange] = useState<AnalyticsRange>('12m')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Analytics"
          subtitle="Data on users, learning outcomes and stakeholder applications."
          className="mb-0 max-md:flex-col max-md:items-start"
          actions={
            <>
              <Segmented<AnalyticsRange> label="Date range" options={RANGES} value={range} onChange={setRange} />
              <ExportMenu />
            </>
          }
        />

        <section
          aria-label="AI analytics"
          className="flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-4 sm:flex-row sm:items-center"
        >
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ui-brand-soft text-ui-brand-text sm:inline-flex">
            <Sparkles className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-ui-text">Need a number that isn&rsquo;t here?</h2>
            <p className="text-[13px] text-ui-muted">
              Ask Hana in plain language for charts and board-ready reports, or have her build a dashboard of your own.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/ai-insights" className={btn({ variant: 'primary', size: 'sm' })}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              AI Insights
            </Link>
            <Link href="/admin/ai-dashboard" className={btn({ variant: 'secondary', size: 'sm' })}>
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
              AI Dashboard
            </Link>
          </div>
        </section>

        <Tabs<Tab> label="Analytics sections" tabs={TABS} active={activeTab} onChange={setActiveTab} />

        <div role="tabpanel" aria-label={TABS.find((t) => t.value === activeTab)?.label}>
          {activeTab === 'overview' && <AnalyticsOverviewTab range={range} />}
          {activeTab === 'stakeholders' && <AnalyticsStakeholdersTab range={range} />}
        </div>
      </div>
    </AdminLayout>
  )
}
