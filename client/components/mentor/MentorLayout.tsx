'use client'

import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/AppShell'
import { AnnouncementBanner } from '@/components/dashboard/AnnouncementBanner'

export function MentorLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell role="mentor" banner={<AnnouncementBanner />}>
      {children}
    </AppShell>
  )
}
