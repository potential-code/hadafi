'use client'

import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/AppShell'

export function AdminLayout({ children, fullBleed }: { children: ReactNode; fullBleed?: boolean }) {
  return (
    <AppShell role="admin" fullBleed={fullBleed}>
      {children}
    </AppShell>
  )
}
