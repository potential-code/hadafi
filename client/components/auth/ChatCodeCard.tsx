'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Lock, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { authClient } from '@/lib/authClient'
import { OtpInput, type OtpInputHandle } from '@/components/auth/OtpInput'

/**
 * The secure card Hana's chat shows for an email code. The code is typed into
 * these boxes and checked here, never in the conversation, so it never reaches
 * the AI model: the chat only hears whether it worked.
 *
 * - "sign-up" proves a new email and hands back a verifiedToken (kept by the
 *   chat in a ref, then sent to /api/auth/hadafi/sign-up).
 * - "sign-in" signs an existing account in with Better Auth's code sign-in.
 */
export function ChatCodeCard({
  email,
  respond,
  status,
  purpose,
}: {
  email: string
  respond: (value: { verified: boolean; verifiedToken?: string }) => void
  status: 'inProgress' | 'executing' | 'complete'
  purpose: 'sign-up' | 'sign-in'
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(60)
  const respondedRef = useRef(false)
  const verifiedRef = useRef(false)
  const inputRef = useRef<OtpInputHandle>(null)

  const done = status === 'complete' || respondedRef.current

  useEffect(() => {
    if (!done) inputRef.current?.focus()
  }, [done])

  useEffect(() => {
    if (cooldown <= 0 || done) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown, done])

  function finish(result: { verified: boolean; verifiedToken?: string }) {
    respondedRef.current = true
    verifiedRef.current = result.verified
    respond(result)
  }

  async function verify(value: string) {
    if (value.length !== 6 || verifying || respondedRef.current) return
    setVerifying(true)
    setError(null)
    if (purpose === 'sign-in') {
      const { error: err } = await authClient.signIn.emailOtp({ email, otp: value })
      setVerifying(false)
      if (err) {
        setError(
          err.status === 429
            ? 'Too many tries. Please wait a minute.'
            : err.code === 'TOO_MANY_ATTEMPTS'
              ? 'Too many wrong tries. Please resend a new code.'
              : 'Incorrect or expired code. Try again.',
        )
        return
      }
      finish({ verified: true })
      return
    }
    try {
      const data = await apiFetch<{ verified?: boolean; verifiedToken?: string }>('/api/auth/hadafi/sign-up/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email, code: value }),
      })
      setVerifying(false)
      if (data.verifiedToken) finish({ verified: true, verifiedToken: data.verifiedToken })
      else setError('Incorrect or expired code. Try again.')
    } catch (err: unknown) {
      setVerifying(false)
      const e = err as { code?: string; status?: number }
      setError(
        e?.code === 'OTP_LOCKED'
          ? 'Too many wrong tries. Please resend a new code.'
          : e?.code === 'OTP_EXPIRED'
            ? 'This code has expired. Please resend a new one.'
            : 'Incorrect or expired code. Try again.',
      )
    }
  }

  async function resend() {
    if (cooldown > 0 || resending) return
    setResending(true)
    setError(null)
    try {
      if (purpose === 'sign-in') {
        const { error: err } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
        if (err) throw err
      } else {
        await apiFetch('/api/auth/hadafi/sign-up/send-code', { method: 'POST', body: JSON.stringify({ email }) })
      }
      setCode('')
      setCooldown(60)
    } catch {
      setError("Couldn't send a new code. Please try again in a minute.")
    } finally {
      setResending(false)
    }
  }

  const doneLabel = verifiedRef.current
    ? purpose === 'sign-in' ? 'Signed in' : 'Email verified'
    : purpose === 'sign-in' ? 'Sign-in cancelled' : 'Verification cancelled'

  return (
    <div
      className="my-2 overflow-hidden rounded-xl border"
      style={{ background: 'rgba(20, 10, 16, 0.90)', borderColor: 'rgba(255,255,255,0.10)', maxWidth: '340px' }}
    >
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'linear-gradient(120deg,#e41674,#b50d5c)' }}>
        <Lock className="h-4 w-4 flex-shrink-0 text-white/80" aria-hidden />
        <span className="text-sm font-semibold tracking-wide text-white">
          {purpose === 'sign-in' ? 'Your sign-in code' : 'Confirm your email'}
        </span>
      </div>

      {done ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/10">
            <Check className="h-3.5 w-3.5 text-[#e41674]" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-sm font-medium text-white/90">{doneLabel}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm leading-normal text-white/80">
            {purpose === 'sign-in' ? (
              <>
                If <strong className="font-semibold text-white">{email}</strong> has a Hadafi account, we sent it a 6-digit
                code. Enter it here, not in the chat, and don&apos;t share it with anyone.
              </>
            ) : (
              <>
                We sent a 6-digit code to <strong className="font-semibold text-white">{email}</strong>. Enter it here, not
                in the chat, and don&apos;t share it with anyone.
              </>
            )}
          </p>
          <OtpInput
            ref={inputRef}
            size="sm"
            value={code}
            onChange={(v) => {
              setCode(v)
              setError(null)
            }}
            onComplete={(v) => void verify(v)}
            disabled={verifying}
            invalid={Boolean(error)}
            aria-label="6-digit code"
          />
          {error && (
            <p role="alert" className="text-xs text-rose-300">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void verify(code)}
            disabled={verifying || code.length !== 6}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #e41674 0%, #b50d5c 100%)' }}
          >
            {verifying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {verifying ? (purpose === 'sign-in' ? 'Signing in' : 'Verifying') : purpose === 'sign-in' ? 'Sign in' : 'Verify'}
          </button>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => void resend()}
              disabled={cooldown > 0 || resending}
              className="inline-flex items-center gap-1.5 font-semibold text-white/80 hover:text-white disabled:font-normal disabled:text-white/40"
            >
              <RefreshCw className={resending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} aria-hidden />
              {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending' : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => finish({ verified: false })}
              className="text-white/50 hover:text-white/80"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
