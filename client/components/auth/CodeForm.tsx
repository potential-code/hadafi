'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { btn } from '@/components/kit'
import { AuthAlert } from '@/components/auth/AuthField'
import { OtpInput, type OtpInputHandle } from '@/components/auth/OtpInput'
import { cn } from '@/lib/utils'

/**
 * The 6-digit email code step, shared by sign-in, email verification,
 * password reset and sign-up. `onSubmit` resolves to an error message to show,
 * or null when the code worked. `children` renders extra fields (for example
 * the new password on the reset step) above the submit button.
 */
export function CodeForm({
  email,
  intro,
  submitLabel,
  submittingLabel,
  onSubmit,
  onResend,
  onBack,
  backLabel,
  children,
  canSubmit = true,
}: {
  email: string
  intro?: ReactNode
  submitLabel: string
  submittingLabel: string
  onSubmit: (code: string) => Promise<string | null>
  onResend: () => Promise<string | null>
  onBack?: () => void
  backLabel?: string
  children?: ReactNode
  canSubmit?: boolean
}) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(60)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<OtpInputHandle>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  async function submitCode(value: string) {
    if (value.length !== 6) {
      setError('Enter the full 6-digit code.')
      return
    }
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const problem = await onSubmit(value)
    setSubmitting(false)
    if (problem) {
      setError(problem)
      inputRef.current?.focus()
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void submitCode(code)
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return
    setResending(true)
    setError(null)
    const problem = await onResend()
    setResending(false)
    if (problem) {
      setError(problem)
      return
    }
    setCode('')
    setCooldown(60)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-ui-text">
        {intro ?? (
          <>
            We sent a 6-digit code to <strong className="font-semibold">{email}</strong>. Enter it below.
          </>
        )}
      </p>

      <div className="flex flex-col gap-1.5">
        <label id="email-code-label" htmlFor="email-code" className="text-[13px] font-semibold text-ui-text">
          6-digit code
        </label>
        <OtpInput
          ref={inputRef}
          id="email-code"
          value={code}
          onChange={(value) => {
            setCode(value)
            setError(null)
          }}
          // The last digit submits, unless the step still needs other fields (the new password).
          onComplete={children ? undefined : (value) => canSubmit && void submitCode(value)}
          disabled={submitting}
          invalid={Boolean(error)}
          aria-labelledby="email-code-label"
          aria-describedby={error ? 'code-err' : undefined}
        />
      </div>

      {children}

      {error && <AuthAlert id="code-err">{error}</AuthAlert>}

      <button
        type="submit"
        disabled={submitting || code.length !== 6 || !canSubmit}
        aria-busy={submitting || undefined}
        className={cn(btn({ size: 'lg' }), 'h-11 w-full text-[15px]')}
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {submitting ? submittingLabel : submitLabel}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <button
          type="button"
          disabled={cooldown > 0 || resending}
          onClick={handleResend}
          className="inline-flex items-center gap-1.5 font-semibold text-ui-brand-text hover:underline disabled:cursor-not-allowed disabled:font-normal disabled:text-ui-muted disabled:no-underline"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', resending && 'animate-spin')} aria-hidden />
          {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending' : "Didn't get it? Resend"}
        </button>
        {onBack && (
          <button type="button" onClick={onBack} className="font-semibold text-ui-brand-text hover:underline">
            {backLabel ?? 'Back'}
          </button>
        )}
      </div>
    </form>
  )
}

/** Turns a Better Auth or Hadafi API error into a sentence for the code step. */
export function codeErrorMessage(error: { code?: string; status?: number; message?: string } | null | undefined): string {
  const code = error?.code ?? ''
  if (error?.status === 429 || code === 'RATE_LIMITED') return 'Too many tries. Please wait a minute and try again.'
  if (code === 'OTP_EXPIRED') return 'This code has expired. Ask for a new one.'
  if (code === 'TOO_MANY_ATTEMPTS' || code === 'OTP_LOCKED') return 'Too many wrong tries. Ask for a new code.'
  if (code === 'INVALID_OTP') return "That code isn't right. Check the email and try again."
  return 'Something went wrong. Please try again.'
}
