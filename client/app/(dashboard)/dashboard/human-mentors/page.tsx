import type { Metadata } from 'next'
import HumanMentorsPage from '@/views/dashboard/HumanMentors'

export const metadata: Metadata = { title: 'Human mentors' }

export default function Page() {
  return <HumanMentorsPage />
}
