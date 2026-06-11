'use client'

import { MentorLayout } from '@/components/mentor/MentorLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'

export default function Page() {
  return (
    <MentorLayout>
      <PageHeader eyebrow="Mentor" title="Calendar" subtitle="View and manage your availability." />
      <div className="rounded-2xl border border-brand-surface-2 bg-white shadow-sm flex items-center justify-center py-24">
        <p className="text-brand-text-secondary text-sm">Calendar coming soon.</p>
      </div>
    </MentorLayout>
  )
}
