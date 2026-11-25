'use client'

import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/AppShell'
import { AnnouncementBanner } from './AnnouncementBanner'
import { AiUnavailableBanner } from '@/components/shared/AiUnavailableBanner'

/** @deprecated The signed-in user is cached by lib/auth.ts (cacheUser) — no event dispatch needed */
export function notifyProfileChange() {}

export function DashboardLayout({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  return (
    <AppShell
      role="learner"
      fullBleed={fullBleed}
      banner={
        fullBleed ? (
          // Full-bleed pages (Ask Hana, the AI coach chat) are Hana surfaces: keep
          // the outage notice, padded to sit inside the page; no announcements.
          <div className="px-4 pt-3 sm:px-6 [&:empty]:hidden">
            <AiUnavailableBanner />
          </div>
        ) : (
          <>
            <AiUnavailableBanner />
            <AnnouncementBanner />
          </>
        )
      }
    >
      {children}
    </AppShell>
  )
}
