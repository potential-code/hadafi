import type { ReactNode } from 'react'
import { RequireAuth } from '@/components/dashboard/RequireAuth'
import { AssistantProvider } from '@/components/dashboard/AssistantProvider'
import { QueryProvider } from '@/components/QueryProvider'
import type { Metadata } from 'next'
import { NOINDEX } from '@/lib/seo'

// Signed in only: never in search results.
export const metadata: Metadata = { robots: NOINDEX }

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth role="sme">
      <QueryProvider>
        <AssistantProvider>{children}</AssistantProvider>
      </QueryProvider>
    </RequireAuth>
  )
}
