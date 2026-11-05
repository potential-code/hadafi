import type { Metadata } from 'next'
import { Suspense } from 'react'
import OffersPage from '@/views/dashboard/Offers'

export const metadata: Metadata = { title: 'Marketplace Offers' }

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OffersPage />
    </Suspense>
  )
}
