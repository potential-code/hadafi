'use client'

import { type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/** @deprecated Profile is now stored in localStorage via setAuth — no event dispatch needed */
export function notifyProfileChange() {}

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-surface">
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 xl:w-72 z-40">
        <Sidebar />
      </aside>

      <div className="lg:pl-64 xl:pl-72 flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
          <div className="max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>

      <Toaster position="bottom-right" richColors closeButton />
    </div>
  )
}
