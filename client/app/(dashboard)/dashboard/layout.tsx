'use client'

import type { ReactNode } from 'react'
import { RequireAuth } from '@/components/dashboard/RequireAuth'
import { AssistantProvider } from '@/components/dashboard/AssistantProvider'
import { QueryProvider } from '@/components/QueryProvider'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth role="sme">
      <QueryProvider>
        <AssistantProvider>{children}</AssistantProvider>
      </QueryProvider>
    </RequireAuth>
  )
}
