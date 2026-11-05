import type { Metadata } from 'next'
import PartnerDashboardPage from '@/views/partner/Dashboard'

export const metadata: Metadata = { title: 'Participants' }

export default function Page() {
  return <PartnerDashboardPage />
}
