import type { Metadata } from 'next'
import OffersAdminPage from '@/views/admin/Offers'

export const metadata: Metadata = { title: 'Offers' }

export default function Page() {
  return <OffersAdminPage />
}
