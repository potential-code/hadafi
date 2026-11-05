import type { Metadata } from 'next'
import { Suspense } from 'react'
import Unsubscribe from './Unsubscribe'

export const metadata: Metadata = { title: 'Announcement emails', robots: { index: false } }

export default function Page() {
  return (
    <Suspense>
      <Unsubscribe />
    </Suspense>
  )
}
