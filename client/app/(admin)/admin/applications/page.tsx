import type { Metadata } from 'next'
import ApplicationsPage from '@/views/admin/Applications'

export const metadata: Metadata = { title: 'Mentor applications' }

export default function Page() {
  return <ApplicationsPage />
}
