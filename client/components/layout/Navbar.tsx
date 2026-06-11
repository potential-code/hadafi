'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from 'framer-motion'
import { ChevronDown, Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { NAV_LINKS } from '@/lib/constants/navigation'
import { cn } from '@/lib/utils'

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileGroupOpen, setMobileGroupOpen] = useState<string | null>(null)
  const { scrollY } = useScroll()
  const navRef = useRef<HTMLElement>(null)

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setScrolled(latest > 40)
  })

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!navRef.current) return
      if (!navRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <motion.header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-white/85 backdrop-blur-xl shadow-[0_4px_30px_-10px_rgba(159,32,99,0.15)] border-b border-brand-surface-2'
          : 'bg-transparent',
      )}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={cn('flex items-center justify-between transition-all', scrolled ? 'h-16' : 'h-20')}>
          <a href="/" className="flex items-center group">
            <img
              src="/images/SMEEP-logo.png"
              alt="SMEEP"
              className={cn(
                'transition-all duration-300 group-hover:scale-105',
                scrolled ? 'h-9' : 'h-11',
                !scrolled && 'brightness-0 invert',
              )}
            />
          </a>

          <nav ref={navRef} className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              if ('children' in link) {
                const isOpen = openMenu === link.label
                return (
                  <div
                    key={link.label}
                    className="relative"
                    onMouseEnter={() => setOpenMenu(link.label)}
                    onMouseLeave={() => setOpenMenu(null)}
                  >
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={isOpen}
                      onClick={() => setOpenMenu(isOpen ? null : link.label)}
                      className={cn(
                        'inline-flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-full transition-colors',
                        scrolled
                          ? 'text-brand-text-primary hover:text-brand-primary hover:bg-brand-primary/5'
                          : 'text-white/85 hover:text-white hover:bg-white/10',
                        isOpen && (scrolled ? 'text-brand-primary bg-brand-primary/5' : 'text-white bg-white/10'),
                      )}
                    >
                      {link.label}
                      <ChevronDown
                        className={cn('w-4 h-4 transition-transform duration-200', isOpen && 'rotate-180')}
                      />
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          role="menu"
                          initial={{ opacity: 0, y: 8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.98 }}
                          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                          className="absolute left-1/2 -translate-x-1/2 top-full pt-3 w-72"
                        >
                          <div className="rounded-2xl bg-white border border-brand-surface-2 shadow-[0_20px_50px_-15px_rgba(159,32,99,0.25)] overflow-hidden p-2">
                            {link.children.map((child) => (
                              <a
                                key={child.href}
                                href={child.href}
                                role="menuitem"
                                onClick={() => setOpenMenu(null)}
                                className="group flex flex-col gap-0.5 px-4 py-3 rounded-xl hover:bg-brand-primary/5 transition-colors"
                              >
                                <span className="text-sm font-semibold text-brand-text-primary group-hover:text-brand-primary transition-colors">
                                  {child.label}
                                </span>
                                {child.description && (
                                  <span className="text-xs text-brand-text-secondary">{child.description}</span>
                                )}
                              </a>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              }

              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'relative px-4 py-2 text-sm font-medium rounded-full transition-colors',
                    scrolled
                      ? 'text-brand-text-primary hover:text-brand-primary hover:bg-brand-primary/5'
                      : 'text-white/85 hover:text-white hover:bg-white/10',
                  )}
                >
                  {link.label}
                </a>
              )
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <a
              href="/login"
              className={cn(
                'text-sm font-medium px-4 py-2 rounded-full transition-colors',
                scrolled
                  ? 'text-brand-text-primary hover:text-brand-primary'
                  : 'text-white/85 hover:text-white',
              )}
            >
              Login
            </a>
            <a
              href="/sign-up"
              className="inline-flex items-center bg-brand-primary hover:bg-brand-primary-dark text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-all shadow-[0_8px_24px_-8px_rgba(159,32,99,0.6)] hover:shadow-[0_10px_30px_-8px_rgba(159,32,99,0.8)]"
            >
              Sign Up
            </a>
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              className="md:hidden"
              render={
                <button
                  className={cn(
                    'p-2 rounded-xl transition-colors',
                    scrolled
                      ? 'text-brand-text-primary hover:bg-brand-primary/10'
                      : 'text-white hover:bg-white/10',
                  )}
                  aria-label="Open menu"
                >
                  <Menu className="w-6 h-6" />
                </button>
              }
            />
            <SheetContent side="right" className="w-80 bg-mesh-dark border-l-white/10 text-white">
              <nav className="flex flex-col gap-1 mt-10">
                {NAV_LINKS.map((link) => {
                  if ('children' in link) {
                    const isOpen = mobileGroupOpen === link.label
                    return (
                      <div key={link.label} className="flex flex-col">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setMobileGroupOpen(isOpen ? null : link.label)}
                          className="flex items-center justify-between text-xl font-semibold text-white/90 hover:text-brand-primary-light transition-colors px-4 py-3 rounded-xl hover:bg-white/5"
                        >
                          <span>{link.label}</span>
                          <ChevronDown
                            className={cn('w-5 h-5 transition-transform duration-200', isOpen && 'rotate-180')}
                          />
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="pl-4 flex flex-col gap-0.5 pb-1">
                                {link.children.map((child) => (
                                  <a
                                    key={child.href}
                                    href={child.href}
                                    onClick={() => {
                                      setMobileOpen(false)
                                      setMobileGroupOpen(null)
                                    }}
                                    className="text-base font-medium text-white/75 hover:text-brand-primary-light transition-colors px-4 py-2.5 rounded-xl hover:bg-white/5"
                                  >
                                    {child.label}
                                  </a>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  }
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className="text-xl font-semibold text-white/90 hover:text-brand-primary-light transition-colors px-4 py-3 rounded-xl hover:bg-white/5"
                    >
                      {link.label}
                    </a>
                  )
                })}
                <div className="border-t border-white/10 mt-4 pt-4 flex flex-col gap-2">
                  <a
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="text-base font-medium text-white/80 hover:text-white px-4 py-3 rounded-xl hover:bg-white/5 transition-colors"
                  >
                    Login
                  </a>
                  <a
                    href="/sign-up"
                    onClick={() => setMobileOpen(false)}
                    className="bg-brand-primary hover:bg-brand-primary-dark text-white text-center px-5 py-3 rounded-xl text-base font-semibold transition-colors shadow-lg"
                  >
                    Sign Up — It's Free
                  </a>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.header>
  )
}
