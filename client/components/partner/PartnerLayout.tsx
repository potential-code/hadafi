'use client'

import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/AppShell'

/** The partner portal's shell: their own menu (SHELL_CONFIG.partner). */
export function PartnerLayout({ children }: { children: ReactNode }) {
  return <AppShell role="partner">{children}</AppShell>
}
