import type { Metadata } from 'next'
import CoursesPage from '@/views/dashboard/Courses'

export const metadata: Metadata = { title: 'Courses' }

export default function Page() {
  return <CoursesPage />
}
