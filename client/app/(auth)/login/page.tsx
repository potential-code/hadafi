import type { Metadata } from 'next'
import { Suspense } from 'react'
import LoginPage from '@/views/Login'

export const metadata: Metadata = { title: 'Sign in' }

export default function Page() {
  // LoginPage reads ?expired=1, which needs a Suspense boundary to prerender.
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  )
}
