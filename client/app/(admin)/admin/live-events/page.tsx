import type { Metadata } from 'next'
import LiveEventsAdmin from '@/views/admin/LiveEvents'

export const metadata: Metadata = { title: 'Live events' }

export default function Page() {
  return <LiveEventsAdmin />
}
