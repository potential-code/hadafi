import type { Metadata } from 'next'
import ProfilePage from '@/views/dashboard/Profile'

export const metadata: Metadata = { title: 'Profile' }

export default function Page() {
  return <ProfilePage />
}
