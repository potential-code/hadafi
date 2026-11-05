import type { Metadata } from 'next'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { ParticipantRecord } from '@/components/organisations/ParticipantRecord'

export const metadata: Metadata = { title: 'Participant' }

export default async function Page({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params
  return (
    <AdminLayout>
      <ParticipantRecord
        endpoint={`/api/admin/organisations/${encodeURIComponent(id)}/learners/${encodeURIComponent(userId)}`}
        backHref={`/admin/organisations/${encodeURIComponent(id)}`}
        backLabel="Back to the organisation"
      />
    </AdminLayout>
  )
}
