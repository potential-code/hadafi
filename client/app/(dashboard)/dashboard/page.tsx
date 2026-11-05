import type { Metadata } from 'next'
import DashboardOverview from '@/views/dashboard/Overview'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
  return <DashboardOverview />
}
