'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Lock, ArrowRight, AlertCircle, CalendarDays, Check, CheckCircle2, Clock, Loader2, Mail, Users } from 'lucide-react'
import { toast } from 'sonner'
import { AuthSplit, AuthHeading, AsideHana, asideAccent, asideMuted } from '@/components/auth/AuthSplit'
import { FloatingField } from '@/components/auth/FloatingField'
import { refreshUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { CONTACT_EMAIL } from '@/components/landing/legal'
import { cn } from '@/lib/utils'

interface TokenInfo {
  name: string
  email: string
}

function SetupForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [tokenError, setTokenError] = useState(false)
  const [loadingToken, setLoadingToken] = useState(true)

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // Validate the token and pre-fill name + email
  useEffect(() => {
    if (!token) {
      setTokenError(true)
      setLoadingToken(false)
      return
    }

    apiFetch<TokenInfo>(`/api/mentor/setup-token?token=${encodeURIComponent(token)}`)
      .then((info) => setTokenInfo(info))
      .catch(() => setTokenError(true))
      .finally(() => setLoadingToken(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) return

    setLoading(true)
    try {
      // Creates the mentor account and signs in (session cookie). The link
      // was emailed to the applicant, so it proves the address.
      await apiFetch('/api/auth/hadafi/mentor-setup', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      })
      await refreshUser()
      router.push('/mentor/dashboard')
    } catch (err: unknown) {
      // Better Auth errors put `code` at the top level.
      const body = err as { code?: string }
      if (body?.code === 'TOKEN_EXPIRED' || body?.code === 'TOKEN_NOT_FOUND' || body?.code === 'EMAIL_EXISTS') {
        setTokenError(true)
      } else {
        toast.error('Something went wrong', { description: 'Please try again.' })
      }
    } finally {
      setLoading(false)
    }
  }

  if (loadingToken) {
    return (
      <div role="status" className="flex min-h-[200px] flex-col items-center justify-center gap-3.5 rounded-[14px] border border-ui-line bg-ui-surface p-5 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-ui-brand" aria-hidden />
        <span className="font-semibold text-ui-text">Checking your setup link</span>
        <span className="text-[13px] text-ui-muted">This takes a second.</span>
      </div>
    )
  }

  if (tokenError || !tokenInfo) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2.5 rounded-[14px] border border-ui-line bg-ui-surface p-6 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ui-danger-soft text-ui-danger">
          <AlertCircle className="h-[22px] w-[22px]" aria-hidden />
        </span>
        <h2 className="text-[17px] font-semibold text-ui-text">Link expired or invalid</h2>
        <p className="text-sm leading-[1.55] text-ui-muted">
          This setup link has expired or has already been used. Email{' '}
          <strong className="font-semibold text-ui-text">{CONTACT_EMAIL}</strong> and we&rsquo;ll send you a new one.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-1 inline-flex h-10 items-center gap-2 rounded-xl border border-ui-line px-4 text-sm font-semibold text-ui-brand-text hover:bg-ui-surface-2"
        >
          <Mail className="h-4 w-4" aria-hidden />
          Email {CONTACT_EMAIL}
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex items-center gap-2.5 rounded-[10px] bg-ui-ok-soft px-3.5 py-3 text-sm font-medium">
        <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-ui-ok" aria-hidden />
        <span className="text-ui-text">Your application was approved. Create a password to access your mentor dashboard.</span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Pre-filled read-only fields */}
        <div className="space-y-3">
          <div className="rounded-xl border border-ui-line bg-ui-bg px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ui-muted mb-0.5">Full Name</p>
            <p className="text-sm font-medium text-ui-text">{tokenInfo.name}</p>
          </div>
          <div className="rounded-xl border border-ui-line bg-ui-bg px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ui-muted mb-0.5">Email Address</p>
            <p className="min-w-0 truncate text-sm font-medium text-ui-text">{tokenInfo.email}</p>
          </div>
        </div>

        <FloatingField
          type={showPassword ? 'text' : 'password'}
          label="Create Password (min 8 characters)"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="w-4 h-4" />}
          validator={(v) => (!v ? 'Enter a password' : v.length < 8 ? 'Use at least 8 characters' : null)}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="p-2 text-ui-muted hover:text-ui-brand-text transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />

        <motion.button
          type="submit"
          disabled={loading || password.length < 8}
          whileTap={{ scale: 0.98 }}
          className="relative w-full inline-flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-70 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-sm font-semibold transition-colors mt-2 shadow-[0_10px_30px_-10px_rgba(159,32,99,0.7)] overflow-hidden"
        >
          {loading && (
            <span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              style={{ animation: 'shimmer 1.4s linear infinite', backgroundSize: '200% 100%' }}
            />
          )}
          <span className="relative inline-flex items-center gap-2">
            {loading ? 'Setting up your account…' : 'Set Password & Continue'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </span>
        </motion.button>
      </form>
    </div>
  )
}

const STEPS = ['Applied', 'Approved', 'Set password', 'Dashboard']

function Steps() {
  return (
    <ol aria-label="Mentor onboarding progress" className="flex items-start">
      {STEPS.map((label, i) => {
        const done = i < 2
        const current = i === 2
        return (
          <li
            key={label}
            aria-current={current ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center gap-1.5 text-center"
          >
            {i > 0 && (
              <span aria-hidden className={cn('absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2', i <= 2 ? 'bg-ui-brand' : 'bg-ui-line')} style={{ marginRight: 14 }} />
            )}
            <span
              className={cn(
                'relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-ui-brand bg-ui-brand text-white',
                current && 'border-2 border-ui-brand bg-ui-surface text-ui-brand-text shadow-[0_0_0_4px_var(--ui-brand-soft)]',
                !done && !current && 'border-ui-line bg-ui-surface text-ui-muted',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-xs', current ? 'font-semibold text-ui-text' : 'font-medium text-ui-muted')}>
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

const NEXT = [
  { icon: Clock, title: 'Set your availability', body: 'Add the time slots learners can book.' },
  { icon: CalendarDays, title: 'Receive session bookings', body: 'See upcoming sessions on your dashboard and calendar.' },
  { icon: Users, title: 'Get to know your mentees', body: 'Keep track of the women entrepreneurs you work with.' },
]

function MentorAside() {
  return (
    <>
      <div className="flex max-w-[460px] flex-col gap-3">
        <h2 id="h-next" className="text-[32px] font-semibold leading-[1.12] tracking-[-0.03em]">
          Welcome to the Hadafi mentor network.
        </h2>
        <p className={cn('text-base leading-[1.6]', asideMuted)}>
          Share your expertise with women entrepreneurs. Here is what you can do once you&apos;re in.
        </p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {NEXT.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3.5 rounded-[14px] border border-white/10 bg-white/[0.05] px-4 py-3.5">
            <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F39CC5]/[0.14]', asideAccent)}>
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{title}</span>
              <span className={cn('text-sm', asideMuted)}>{body}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto max-w-[460px]">
        <AsideHana size={44}>
          Learners book one of your open time slots. Sessions appear on your dashboard straight away.
        </AsideHana>
      </div>
    </>
  )
}

export default function MentorSetupPage() {
  return (
    <AuthSplit
      topPrompt={{ text: 'Already have an account?', ctaLabel: 'Log in', ctaHref: '/login' }}
      asideLabelledBy="h-next"
      aside={<MentorAside />}
      width={420}
    >
      <div className="flex flex-col gap-[26px]">
        <Steps />
        <AuthHeading
          title="Set up your Hadafi account"
          subtitle="Finish setting up your mentor account to start receiving session bookings."
        />
        <Suspense
          fallback={
            <div role="status" className="flex min-h-[200px] items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-ui-brand" aria-label="Loading" />
            </div>
          }
        >
          <SetupForm />
        </Suspense>
        <p className="text-[13px] text-ui-muted">
          Need help? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-ui-brand-text hover:underline">
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </AuthSplit>
  )
}
