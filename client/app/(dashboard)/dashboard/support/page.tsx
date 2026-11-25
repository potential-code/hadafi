import type { Metadata } from 'next'
import SupportPage from '@/views/dashboard/Support'

export const metadata: Metadata = { title: 'Support' }

export default function Page() {
  return <SupportPage />
}
