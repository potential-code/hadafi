'use client'

import { useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { AdminSidebar } from './AdminSidebar'

export function AdminLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-brand-surface">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 xl:w-72 z-40">
        <AdminSidebar />
      </aside>

      <div className="lg:pl-64 xl:pl-72 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-brand-surface-2 lg:hidden">
          <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 h-16">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                render={
                  <button
                    aria-label="Open menu"
                    className="p-2 rounded-xl text-brand-text-primary hover:bg-brand-primary/10 transition-colors"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                }
              />
              <SheetContent side="left" className="w-80 p-0 border-r-0">
                <AdminSidebar onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="text-sm font-bold text-brand-text-primary">Admin</span>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
          <div className="max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>

      <Toaster position="bottom-right" richColors closeButton />
    </div>
  )
}
