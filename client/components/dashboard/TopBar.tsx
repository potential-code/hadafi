'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Sidebar } from './Sidebar'

export function TopBar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
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
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
