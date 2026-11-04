import type { Metadata } from 'next'
import AiExaminerPage from '@/views/dashboard/AiExaminer'

export const metadata: Metadata = { title: 'AI Examiner' }

export default function Page() {
  return <AiExaminerPage />
}
