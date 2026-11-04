import type { Metadata } from 'next'
import DashboardOverview from '@/views/dashboard/Overview'

export const metadata: Metadata = { title: 'Home' }

export default function DashboardPage() {
  return <DashboardOverview />
}
