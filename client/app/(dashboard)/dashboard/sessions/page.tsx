import type { Metadata } from 'next'
import SmeSessions from '@/views/dashboard/Sessions'

export const metadata: Metadata = { title: 'My Bookings' }

export default function SessionsPage() {
  return <SmeSessions />
}
