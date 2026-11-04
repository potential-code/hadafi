import type { Metadata } from 'next'
import MentorOverview from '@/views/mentor/Overview'

export const metadata: Metadata = { title: 'Mentor dashboard' }

export default function Page() {
  return <MentorOverview />
}
