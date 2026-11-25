import type { Metadata } from 'next'
import CourseDetailPage from '@/views/dashboard/CourseDetail'

export const metadata: Metadata = { title: 'Course' }

export default function Page() {
  return <CourseDetailPage />
}
