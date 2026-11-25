import type { Metadata } from 'next'
import AdminOverview from '@/views/admin/Overview'

export const metadata: Metadata = { title: 'Admin dashboard' }

export default function Page() {
  return <AdminOverview />
}
