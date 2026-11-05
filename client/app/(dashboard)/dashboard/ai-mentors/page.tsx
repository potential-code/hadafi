import type { Metadata } from 'next'
import AiMentorsPage from '@/views/dashboard/AiMentors'

export const metadata: Metadata = { title: 'AI Coaches' }

export default function Page() {
  return <AiMentorsPage />
}
