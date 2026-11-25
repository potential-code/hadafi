import type { Metadata } from 'next'
import SignUpPage from '@/views/SignUp'

export const metadata: Metadata = { title: 'Join Hadafi', alternates: { canonical: '/sign-up' } }

export default function Page() {
  return <SignUpPage />
}
