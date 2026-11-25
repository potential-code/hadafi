'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { btn } from '@/components/kit'
import { getUser } from '@/lib/auth'
import { CONTACT_EMAIL } from '@/components/landing/legal'

/**
 * Route-level error boundary. Without it, any rendering error shows Next.js's
 * unbranded "Application error: a client-side exception has occurred" page.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [home, setHome] = useState<{ href: string; label: string }>({ href: '/dashboard', label: 'Go to dashboard' })

  useEffect(() => {
    console.error('[hadafi] page error', error)
  }, [error])

  // Send each role to its own dashboard; visitors who aren't signed in go home.
  useEffect(() => {
    const role = getUser()?.role
    if (!role) setHome({ href: '/', label: 'Go to the homepage' })
    else if (role === 'admin') setHome({ href: '/admin/dashboard', label: 'Go to dashboard' })
    else if (role === 'mentor') setHome({ href: '/mentor/dashboard', label: 'Go to dashboard' })
    else if (role === 'partner') setHome({ href: '/partner', label: 'Go to dashboard' })
  }, [])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ui-bg px-4 py-10 text-ui-text">
      <div
        role="alert"
        className="flex w-full max-w-[560px] flex-col items-center gap-3.5 rounded-[14px] border border-ui-line bg-ui-surface px-6 py-10 text-center sm:px-8"
      >
        <img
          src="/images/redesign/hana-avatar.webp"
          alt=""
          className="h-16 w-16 rounded-full object-cover object-top shadow-[0_0_0_4px_var(--ui-brand-soft)]"
        />
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Something went wrong</h1>
        <p className="max-w-[420px] text-[15px] leading-[1.6] text-ui-muted">
          This page couldn&rsquo;t load. Your progress on Hadafi is saved. Try again, or go back to{' '}
          {home.href === '/' ? 'the homepage' : 'your dashboard'}. If it keeps happening, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-ui-brand-text hover:underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2.5">
          <button type="button" onClick={reset} className={btn()}>
            <RefreshCw className="h-[18px] w-[18px]" aria-hidden />
            Try again
          </button>
          <Link href={home.href} className={btn({ variant: 'secondary' })}>
            {home.label}
          </Link>
        </div>
      </div>
    </div>
  )
}
