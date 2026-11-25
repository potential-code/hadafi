import type { Metadata } from 'next'
import AchievementsPage from '@/views/dashboard/Achievements'

export const metadata: Metadata = { title: 'Achievements' }

export default function Page() {
  return <AchievementsPage />
}
