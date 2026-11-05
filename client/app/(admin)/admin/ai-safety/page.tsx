import type { Metadata } from 'next'
import AiSafetyAdminPage from '@/views/admin/AiSafety'

export const metadata: Metadata = { title: 'AI safety review' }

export default function Page() {
  return <AiSafetyAdminPage />
}
