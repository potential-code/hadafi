import type { Metadata } from 'next'
import MentorSetupPage from '@/views/mentor/Setup'

export const metadata: Metadata = { title: 'Set up your mentor account' }

export default function Page() {
  return <MentorSetupPage />
}
