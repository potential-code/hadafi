import type { Metadata } from 'next'
import MentorSetupPage from '@/views/mentor/Setup'
import { NOINDEX } from '@/lib/seo'

export const metadata: Metadata = { title: 'Set up your mentor account', robots: NOINDEX }

export default function Page() {
  return <MentorSetupPage />
}
