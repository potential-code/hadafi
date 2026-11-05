import type { Metadata } from 'next'
import AiAssistantPage from '@/views/dashboard/AiAssistant'

export const metadata: Metadata = { title: 'Ask Hana' }

export default function Page() {
  return <AiAssistantPage />
}
