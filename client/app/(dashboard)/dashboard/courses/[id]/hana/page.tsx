import type { Metadata } from 'next'
import CourseTutorPage from '@/views/dashboard/CourseTutor'

export const metadata: Metadata = { title: 'Learn with Hana' }

export default function Page() {
  return <CourseTutorPage />
}
