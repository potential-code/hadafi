import type { Metadata } from 'next'
import CertificatesPage from '@/views/dashboard/Certificates'

export const metadata: Metadata = { title: 'Certificates' }

export default function Page() {
  return <CertificatesPage />
}
