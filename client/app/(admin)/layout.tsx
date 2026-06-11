'use client'

import type { ReactNode } from 'react'
import { RequireAuth } from '@/components/dashboard/RequireAuth'
import { QueryProvider } from '@/components/QueryProvider'

export default function AdminGroupLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth role="admin">
      <QueryProvider>{children}</QueryProvider>
    </RequireAuth>
  )
}
