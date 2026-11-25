'use client'

import type { ReactNode } from 'react'
import { RequireAuth } from '@/components/dashboard/RequireAuth'
import { QueryProvider } from '@/components/QueryProvider'

export default function MentorGroupLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth role="mentor">
      <QueryProvider>{children}</QueryProvider>
    </RequireAuth>
  )
}
