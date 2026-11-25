import type { Metadata } from 'next'
import EventsPage from '@/views/dashboard/Events'

export const metadata: Metadata = { title: 'Events' }

export default function Page() {
  return <EventsPage />
}
