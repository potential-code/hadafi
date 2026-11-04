'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { btn } from '@/components/kit'
import { REDESIGN_ASSETS } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * In-page anchors. `wide` items hide between 1024px and 1100px so the row
 * always fits; below 1024px everything moves into the menu button.
 */
export const LANDING_NAV = [
  { label: 'About', href: '#about' },
  { label: 'Courses', href: '#courses' },
  { label: 'Mentors', href: '#ai-mentors' },
  { label: 'Hana', href: '#ai-assistant' },
  { label: 'Events', href: '#events', wide: true },
  { label: 'Offers', href: '#offers', wide: true },
  { label: 'Stakeholders', href: '#stakeholder' },
  { label: 'Community', href: '#community', wide: true },
] as const

const MOBILE_NAV = [
  { label: 'About', href: '#about' },
  { label: 'Courses', href: '#courses' },
  { label: 'AI mentors', href: '#ai-mentors' },
  { label: 'Hana, your AI assistant', href: '#ai-assistant' },
  { label: 'Expert mentors', href: '#mentors' },
  { label: 'Events', href: '#events' },
  { label: 'Offers', href: '#offers' },
  { label: 'Stakeholders', href: '#stakeholder' },
  { label: 'Community', href: '#community' },
]

/** The public site header (homepage). */
export function Navbar() {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    function onResize() {
      if (window.innerWidth >= 1024) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <header className="sticky top-0 z-40 border-b border-ui-line bg-ui-surface">
      <div className="mx-auto flex h-[68px] w-full max-w-[1200px] items-center gap-3 px-4 min-[900px]:px-10">
        <Link href="/" aria-label="Hadafi home" className="inline-flex shrink-0 items-center rounded-md">
          <img
            src={REDESIGN_ASSETS.logo.src}
            alt="Hadafi"
            width={1293}
            height={282}
            className="h-8 w-auto dark:brightness-0 dark:invert max-[380px]:h-7"
          />
        </Link>

        <nav aria-label="Main" className="ml-4 hidden flex-1 items-center gap-0.5 min-[1024px]:flex">
          {LANDING_NAV.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={cn(
                'whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium text-ui-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-text',
                'wide' in l && l.wide && 'max-[1100px]:hidden',
              )}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <span className="flex-1 min-[1024px]:hidden" />

        <Link href="/login" className={cn(btn({ variant: 'secondary' }), 'h-[38px] max-[1023px]:hidden')}>
          Log in
        </Link>
        <Link href="/sign-up" className={cn(btn({ variant: 'primary' }), 'h-[38px] max-[360px]:px-3')}>
          Sign up
        </Link>
        <button
          ref={toggleRef}
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          onClick={() => setOpen((v) => !v)}
          className={cn(btn({ variant: 'secondary', size: 'icon' }), 'h-[38px] w-[38px] min-[1024px]:hidden')}
        >
          {open ? <X className="h-[18px] w-[18px]" aria-hidden /> : <Menu className="h-[18px] w-[18px]" aria-hidden />}
        </button>
      </div>

      {open && (
        <div
          id="landing-mobile-menu"
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-68px)] overflow-y-auto border-b border-ui-line bg-ui-surface shadow-ui min-[1024px]:hidden"
        >
          <nav aria-label="Main mobile" className="mx-auto flex max-w-[1200px] flex-col px-4 py-3 min-[900px]:px-10">
            {MOBILE_NAV.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-[10px] px-3 py-3 text-[15px] font-medium text-ui-text hover:bg-ui-surface-2"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-ui-line pt-3">
              <Link href="/login" className={btn({ variant: 'secondary', size: 'lg' })}>
                Log in
              </Link>
              <Link href="/sign-up" className={btn({ variant: 'primary', size: 'lg' })}>
                Sign up
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
