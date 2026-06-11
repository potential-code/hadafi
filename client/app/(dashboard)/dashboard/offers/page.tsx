import { Suspense } from 'react'
import OffersPage from '@/views/dashboard/Offers'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OffersPage />
    </Suspense>
  )
}
