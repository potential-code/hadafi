import type { Metadata } from 'next'
import AdminAiInsights from '@/views/admin/AiInsights'

export const metadata: Metadata = { title: 'AI Insights' }

export default function Page() {
  return <AdminAiInsights />
}
