import type { Metadata } from 'next'
import OrganisationsPage from '@/views/admin/Organisations'

export const metadata: Metadata = { title: 'Organisations' }

export default function Page() {
  return <OrganisationsPage />
}
