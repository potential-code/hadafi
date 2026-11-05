'use client'

import { useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { btn, inputClass } from '@/components/kit'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CONTACT_EMAIL } from './legal'

/**
 * Homepage newsletter sign-up (POST /api/newsletter/subscribe), ported from SMEEP.
 * It only adds the address to a list admins can export; nothing is emailed from here.
 */
export function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (sending) return
    if (!email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    setSending(true)
    setError(null)
    try {
      await apiFetch('/api/newsletter/subscribe', { method: 'POST', body: JSON.stringify({ email }) })
      setSubscribed(true)
      setEmail('')
    } catch (err: unknown) {
      const code = (err as { error?: { code?: string } })?.error?.code
      setError(
        code === 'VALIDATION_ERROR'
          ? 'Please enter a valid email address.'
          : code === 'RATE_LIMITED'
            ? 'Too many sign-ups from this network. Please try again later.'
            : 'We could not sign you up just now. Please try again.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label="Newsletter" noValidate className="flex flex-col gap-2">
      <div className="flex max-w-[460px] gap-2">
        <label htmlFor="nl-email" className="sr-only">
          Email address
        </label>
        <input
          id="nl-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
          placeholder="you@example.com"
          aria-invalid={!!error}
          aria-describedby="nl-help"
          className={cn(inputClass, 'min-w-0 flex-1', error && 'border-ui-danger')}
        />
        <button type="submit" disabled={sending || subscribed} className={cn(btn(), 'shrink-0')}>
          {subscribed ? (
            <>
              <Check className="h-4 w-4" aria-hidden />
              Subscribed
            </>
          ) : sending ? (
            'Subscribing'
          ) : (
            'Subscribe'
          )}
        </button>
      </div>
      <span
        id="nl-help"
        role={error || subscribed ? 'status' : undefined}
        className={cn('text-xs [overflow-wrap:anywhere]', error ? 'text-ui-danger' : 'text-ui-muted')}
      >
        {error ?? `${subscribed ? 'You are on the list. ' : ''}No spam. To unsubscribe, email ${CONTACT_EMAIL}.`}
      </span>
    </form>
  )
}
