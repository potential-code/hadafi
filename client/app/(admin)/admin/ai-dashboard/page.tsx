import type { Metadata } from 'next'
import AdminAiDashboard from '@/views/admin/AiDashboard'

export const metadata: Metadata = { title: 'AI Dashboard' }

export default function Page() {
  return <AdminAiDashboard />
}
