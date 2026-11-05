import type { Metadata } from 'next'
import { PartnerLayout } from '@/components/partner/PartnerLayout'
import { ParticipantRecord } from '@/components/organisations/ParticipantRecord'

export const metadata: Metadata = { title: 'Participant' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <PartnerLayout>
      <ParticipantRecord endpoint={`/api/partner/learners/${encodeURIComponent(id)}`} backHref="/partner" backLabel="All participants" />
    </PartnerLayout>
  )
}
