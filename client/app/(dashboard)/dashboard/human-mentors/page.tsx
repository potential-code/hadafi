import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import HumanMentorsPage from '@/views/dashboard/HumanMentors'
import { HUMAN_MENTORS_ENABLED } from '@/lib/features'

export const metadata: Metadata = { title: 'Human mentors' }

export default function Page() {
  // Off until real mentors can sign in and set times: old links go to the AI coaches.
  if (!HUMAN_MENTORS_ENABLED) redirect('/dashboard/ai-mentors')
  return <HumanMentorsPage />
}
