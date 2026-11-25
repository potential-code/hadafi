import type { Metadata } from 'next'
import AdminCourseBuilder from '@/views/admin/CourseBuilder'

export const metadata: Metadata = { title: 'Edit course' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminCourseBuilder id={id} />
}
