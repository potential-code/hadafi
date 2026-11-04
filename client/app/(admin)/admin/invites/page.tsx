import type { Metadata } from 'next'
import InvitesPage from '@/views/admin/Invites'

export const metadata: Metadata = { title: 'Invites' }

export default function Page() {
  return <InvitesPage />
}
