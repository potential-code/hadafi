import type { Metadata } from 'next'
import AdminCoursesPage from '@/views/admin/Courses'

export const metadata: Metadata = { title: 'Course creation' }

export default function Page() {
  return <AdminCoursesPage />
}
