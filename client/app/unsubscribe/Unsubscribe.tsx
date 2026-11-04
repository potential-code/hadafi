'use client'

/**
 * The one-click link at the foot of an announcement email: turns announcement
 * emails off for that account (POST /api/announcements/unsubscribe), with no
 * sign-in. The click is a button, so mail scanners that open links don't
 * unsubscribe anyone.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CircleCheck, Loader2, MailX } from 'lucide-react'
import { btn } from '@/components/kit'
import { REDESIGN_ASSETS } from '@/lib/constants'
import { apiFetch } from '@/lib/api'
import { errorMessage } from '@/lib/api/errors'

export default function Unsubscribe() {
  const token = useSearchParams()?.get('token') ?? ''
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function confirm() {
    setState('sending')
    try {
      await apiFetch('/api/announcements/unsubscribe', { method: 'POST', body: JSON.stringify({ token }) })
      setState('done')
    } catch (err) {
      setMessage(errorMessage(err, 'That didn’t work. Please try again.'))
      setState('error')
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ui-bg px-4 py-10 text-ui-text">
      <div className="w-full max-w-md rounded-[14px] border border-ui-line bg-ui-surface p-6 sm:p-8">
        <img src={REDESIGN_ASSETS.logo.src} alt={REDESIGN_ASSETS.logo.alt} className="mb-6 h-7 w-auto dark:brightness-0 dark:invert" />
        {state === 'done' ? (
          <>
            <CircleCheck className="mb-3 h-8 w-8 text-ui-ok" strokeWidth={1.75} aria-hidden />
            <h1 className="text-xl font-semibold">You won’t get announcement emails</h1>
            <p className="mt-2 text-sm leading-relaxed text-ui-muted">
              You’ll still see announcements when you sign in to Hadafi, and emails about your own sessions and certificates still arrive.
            </p>
            <Link href="/login" className={btn({ variant: 'secondary', className: 'mt-6' })}>
              Go to Hadafi
            </Link>
          </>
        ) : (
          <>
            <MailX className="mb-3 h-8 w-8 text-ui-muted" strokeWidth={1.75} aria-hidden />
            <h1 className="text-xl font-semibold">Stop announcement emails?</h1>
            <p className="mt-2 text-sm leading-relaxed text-ui-muted">News from the Hadafi team will stop coming to your inbox.</p>
            {!token ? (
              <p className="mt-4 text-sm text-ui-danger" role="alert">
                This link is missing its code. Open it again from the email.
              </p>
            ) : (
              <>
                {state === 'error' && (
                  <p className="mt-4 text-sm text-ui-danger" role="alert">
                    {message}
                  </p>
                )}
                <button type="button" onClick={confirm} disabled={state === 'sending'} className={btn({ className: 'mt-6 w-full' })}>
                  {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  Stop announcement emails
                </button>
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}
