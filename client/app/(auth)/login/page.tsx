import { Suspense } from 'react'
import LoginPage from '@/views/Login'

export default function Page() {
  // LoginPage reads ?expired=1, which needs a Suspense boundary to prerender.
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  )
}
