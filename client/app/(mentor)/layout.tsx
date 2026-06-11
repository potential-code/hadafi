'use client'

import type { ReactNode } from 'react'
import { RequireAuth } from '@/components/dashboard/RequireAuth'

export default function MentorGroupLayout({ children }: { children: ReactNode }) {
  return <RequireAuth role="mentor">{children}</RequireAuth>
}
