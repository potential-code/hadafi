'use client'

import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/AppShell'
import { AnnouncementBanner } from './AnnouncementBanner'

/** @deprecated The signed-in user is cached by lib/auth.ts (cacheUser) — no event dispatch needed */
export function notifyProfileChange() {}

export function DashboardLayout({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  return (
    <AppShell role="learner" fullBleed={fullBleed} banner={fullBleed ? undefined : <AnnouncementBanner />}>
      {children}
    </AppShell>
  )
}
