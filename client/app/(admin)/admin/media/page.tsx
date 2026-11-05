import type { Metadata } from 'next'
import AdminMediaPage from '@/views/admin/Media'

export const metadata: Metadata = { title: 'Media library' }

export default function Page() {
  return <AdminMediaPage />
}
