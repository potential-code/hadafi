import type { Metadata } from 'next'
import AdminAnalytics from '@/views/admin/Analytics'

export const metadata: Metadata = { title: 'Analytics' }

export default function Page() {
  return <AdminAnalytics />
}
