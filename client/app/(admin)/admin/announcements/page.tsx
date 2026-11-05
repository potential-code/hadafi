import type { Metadata } from 'next'
import AnnouncementsAdminPage from '@/views/admin/Announcements'

export const metadata: Metadata = { title: 'Announcements' }

export default function Page() {
  return <AnnouncementsAdminPage />
}
