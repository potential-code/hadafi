'use client'

import type { ReactNode } from 'react'
import { RequireAuth } from '@/components/dashboard/RequireAuth'
import { QueryProvider } from '@/components/QueryProvider'

/** The partner portal: partner logins only; everyone else goes to their own home. */
export default function PartnerGroupLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth role="partner">
      <QueryProvider>{children}</QueryProvider>
    </RequireAuth>
  )
}
