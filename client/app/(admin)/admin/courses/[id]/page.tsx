import AdminCourseBuilder from '@/views/admin/CourseBuilder'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminCourseBuilder id={id} />
}
