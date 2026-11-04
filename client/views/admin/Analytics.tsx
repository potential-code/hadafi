'use client'

import { useState } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader, Tabs } from '@/components/kit'
import { Segmented } from '@/components/admin/ui'
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
          actions={<Segmented<AnalyticsRange> label="Date range" options={RANGES} value={range} onChange={setRange} />}
        />

        <Tabs<Tab> label="Analytics sections" tabs={TABS} active={activeTab} onChange={setActiveTab} />

        <div role="tabpanel" aria-label={TABS.find((t) => t.value === activeTab)?.label}>
          {activeTab === 'overview' && <AnalyticsOverviewTab range={range} />}
          {activeTab === 'stakeholders' && <AnalyticsStakeholdersTab range={range} />}
        </div>
      </div>
    </AdminLayout>
  )
}
