import type { Metadata } from 'next'
import AdminProfilePage from '@/views/admin/Profile'

export const metadata: Metadata = { title: 'Profile' }

export default function Page() {
  return <AdminProfilePage variant="partner" />
}
