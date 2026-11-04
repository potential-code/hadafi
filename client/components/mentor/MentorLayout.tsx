'use client'

import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/AppShell'

export function MentorLayout({ children }: { children: ReactNode }) {
  return <AppShell role="mentor">{children}</AppShell>
}
