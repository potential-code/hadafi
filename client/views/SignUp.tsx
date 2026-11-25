'use client'

import { useId, useRef, useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Building2, CheckCircle2, Eye, EyeOff, User, Mail, Lock, Globe, Tag, ChevronDown, ArrowRight, Loader2 } from 'lucide-react'
import { getCountryDataList } from 'countries-list'
import { AuthSplit, AuthHeading, AsideChecklist, AsideHana, AsideStats, asideAccent, asideMuted } from '@/components/auth/AuthSplit'
import { FloatingField } from '@/components/auth/FloatingField'
import { afterSignIn, refreshUser } from '@/lib/auth'
import { nextInLocation, withNext } from '@/lib/returnPath'
import { apiFetch } from '@/lib/api'
import { AuthAlert } from '@/components/auth/AuthField'
import { CodeForm, codeErrorMessage } from '@/components/auth/CodeForm'
import { LEGAL_LINKS } from '@/components/landing/legal'
import { MARKETING_CONSENT_TEXT, consentBody } from '@/lib/signUpConsent'
import { fetchJoinInfo } from '@/lib/api/organisations'
import { cn } from '@/lib/utils'

const COUNTRIES = getCountryDataList()
  .map((c) => c.name)
  .sort((a, b) => a.localeCompare(b))

const validateName = (v: string) => (!v || v.trim().length < 2 ? 'Tell us your full name' : null)
const validateEmail = (v: string) =>
  !v
    ? 'Enter your email'
    : !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v)
    ? 'Enter a valid email address'
    : null
// The password is optional: without one, the account signs in with an email code.
const validatePassword = (v: string): string | null => (v.length > 0 && v.length < 8 ? 'Use at least 8 characters, or leave it empty' : null)

/** Errors from Better Auth endpoints put `code` at the top level. */
type ApiErr = { code?: string; status?: number; message?: string; error?: { code?: string; errors?: Record<string, string[]> } }

// Sign-up proves the email before the account exists: the details, then a
// 6-digit code to the address, then the account is created and signed in
// (server/auth/hadafiPlugin.ts).

/** The organisation a /sign-up?org=CODE link joins. */
type JoiningOrg = { name: string; code: string }

// Inner component that reads search params (must be inside Suspense)
function SignUpForm({ org, onOrgGone }: { org: JoiningOrg | null; onOrgGone: () => void }) {
  const countryId = useId()
  const searchParams = useSearchParams()
  const router = useRouter()

  const prefillCode = searchParams.get('code') ?? ''
  const hasInviteCode = prefillCode.length > 0

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    country: '',
    couponCode: prefillCode,
    agreed: false,
    marketingOptIn: false,
  })
  const [touched, setTouched] = useState({ country: false })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailChecking, setEmailChecking] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null)
  // The availability check couldn't run (network). Don't block sign-up on it:
  // the server checks the email again when the code is sent.
  const [emailCheckFailed, setEmailCheckFailed] = useState(false)
  // The address being typed now, so a slow answer for an older one is ignored.
  const latestEmail = useRef(form.email)
  latestEmail.current = form.email
  const [couponError, setCouponError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [step, setStep] = useState<'details' | 'code'>('details')

  // Keep couponCode in sync if URL param changes (e.g. browser back/forward)
  useEffect(() => {
    if (prefillCode) {
      setForm((prev) => ({ ...prev, couponCode: prefillCode }))
    }
  }, [prefillCode])

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  const countryError = touched.country && !form.country ? 'Pick your country' : null

  const canSubmit =
    form.agreed &&
    form.fullName.trim().length >= 2 &&
    !validateEmail(form.email) &&
    (emailAvailable === true || emailCheckFailed) &&
    !emailChecking &&
    !validatePassword(form.password) &&
    !!form.country

  async function handleEmailBlur() {
    const email = form.email
    if (validateEmail(email)) return
    setEmailChecking(true)
    try {
      const res = await apiFetch<{ success: boolean; data: { available: boolean } }>('/api/account/check-email', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      if (latestEmail.current !== email) return
      const available = res.data.available
      setEmailAvailable(available)
      setEmailError(available ? null : 'An account with this email already exists')
    } catch (err: unknown) {
      if (latestEmail.current !== email) return
      const body = err as { error?: { code?: string } }
      if (body?.error?.code === 'VALIDATION_ERROR') {
        setEmailError('Enter a valid email address')
      } else {
        // Network failure: don't block sign-up; the server checks again on submit.
        setEmailCheckFailed(true)
      }
    } finally {
      setEmailChecking(false)
    }
  }

  // The availability check used to run only on the email field's blur: a user
  // whose browser autofilled the form (no blur ever fired) faced a submit
  // button that was silently disabled forever. Debounce the same check off the
  // value itself so a valid email always gets verified.
  useEffect(() => {
    if (validateEmail(form.email)) return
    if (emailAvailable !== null || emailCheckFailed) return // already checked this value
    const id = window.setTimeout(() => void handleEmailBlur(), 600)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.email, emailAvailable, emailCheckFailed])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ country: true })
    setEmailError(null)
    setCouponError(null)

    if (
      !form.agreed ||
      validateName(form.fullName) ||
      validateEmail(form.email) ||
      validatePassword(form.password) ||
      !form.country
    ) return

    setFormError(null)
    setLoading(true)
    try {
      await apiFetch('/api/auth/hadafi/sign-up/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: form.email }),
      })
      setStep('code')
    } catch (err: unknown) {
      const e = err as ApiErr
      setFormError(e?.status === 429 || e?.code === 'RATE_LIMITED' || e?.code === 'EMAIL_RATE_LIMITED'
        ? 'Too many tries. Please wait a minute.'
        : "Couldn't send the code. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  /** Swaps the code for a verified token, then creates the account and signs in. */
  async function finishSignUp(code: string): Promise<string | null> {
    let verifiedToken: string
    try {
      const res = await apiFetch<{ verifiedToken: string }>('/api/auth/hadafi/sign-up/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email: form.email, code }),
      })
      verifiedToken = res.verifiedToken
    } catch (err: unknown) {
      return codeErrorMessage(err as ApiErr)
    }
    try {
      await apiFetch('/api/auth/hadafi/sign-up', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          country: form.country,
          ...(form.password ? { password: form.password } : {}),
          ...(form.couponCode.trim() ? { couponCode: form.couponCode.trim() } : {}),
          ...(org ? { orgCode: org.code } : {}),
          ...consentBody({ termsAccepted: form.agreed, marketingOptIn: form.marketingOptIn }),
          verifiedToken,
        }),
      })
    } catch (err: unknown) {
      const e = err as ApiErr
      setStep('details')
      if (e?.code === 'EMAIL_EXISTS') setEmailError('An account with this email already exists')
      else if (e?.code === 'INVALID_COUPON') setCouponError('Invalid or already used invite code')
      else if (e?.code === 'TERMS_REQUIRED') setFormError('Please tick the box to accept the Terms of Use and Privacy Policy.')
      else if (e?.code === 'INVALID_ORG_CODE') {
        onOrgGone()
        setFormError('That organisation link has stopped working. You can sign up on your own, or ask the organisation for a new link.')
      }
      else setFormError('Something went wrong. Please try again.')
      return null
    }
    const user = await refreshUser()
    // ?next= (an emailed course link, carried from /login): there, if this role can use it.
    router.push(afterSignIn(user, nextInLocation()))
    return null
  }

  if (step === 'code') {
    return (
      <div>
        <CodeForm
          email={form.email}
          intro={
            <>
              To finish, enter the 6-digit code we sent to <strong className="font-semibold">{form.email}</strong>.
            </>
          }
          submitLabel="Create my account"
          submittingLabel="Creating your account"
          onSubmit={finishSignUp}
          onResend={async () => {
            try {
              await apiFetch('/api/auth/hadafi/sign-up/send-code', { method: 'POST', body: JSON.stringify({ email: form.email }) })
              return null
            } catch {
              return "Couldn't send the code. Please try again."
            }
          }}
          onBack={() => setStep('details')}
          backLabel="Change my details"
        />
      </div>
    )
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <FloatingField
          label="Full Name"
          autoComplete="name"
          required
          value={form.fullName}
          onChange={(e) => update('fullName', e.target.value)}
          icon={<User className="w-4 h-4" />}
          validator={validateName}
        />
        <FloatingField
          type="email"
          label="Email Address"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => {
            update('email', e.target.value)
            setEmailError(null)
            setEmailAvailable(null)
            setEmailCheckFailed(false)
          }}
          onBlur={handleEmailBlur}
          icon={<Mail className="w-4 h-4" />}
          validator={validateEmail}
          externalError={emailError}
          trailing={
            emailChecking
              ? <Loader2 className="w-4 h-4 text-ui-muted animate-spin" />
              : undefined
          }
        />
        <FloatingField
          type={showPassword ? 'text' : 'password'}
          label="Password (optional, min 8)"
          autoComplete="new-password"
          hint="Optional. Without one, you sign in with a code we email you."
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          icon={<Lock className="w-4 h-4" />}
          validator={validatePassword}
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

        {/* Country — custom floating select */}
        <div>
          <div
            className={`relative rounded-xl bg-ui-surface border transition-all ${
              countryError
                ? 'border-rose-400 ring-2 ring-rose-400/20'
                : form.country
                  ? 'border-emerald-500/60'
                  : 'border-ui-line hover:border-ui-muted focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/20'
            }`}
          >
            <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ui-muted pointer-events-none z-10" />
            <label
              htmlFor={countryId}
              className={`pointer-events-none absolute left-10 transition-all duration-200 ${
                form.country
                  ? 'top-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ui-muted'
                  : 'top-1/2 -translate-y-1/2 text-sm text-ui-muted'
              }`}
            >
              Country
            </label>
            <select
              id={countryId}
              required
              value={form.country}
              onChange={(e) => {
                update('country', e.target.value)
                setTouched((t) => ({ ...t, country: true }))
              }}
              onBlur={() => setTouched((t) => ({ ...t, country: true }))}
              className="w-full appearance-none bg-transparent pl-10 pr-10 pt-5 pb-2 text-sm text-ui-text focus:outline-none cursor-pointer dark:[color-scheme:dark]"
            >
              <option value="" disabled hidden></option>
              {COUNTRIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ui-muted pointer-events-none" />
          </div>
          {countryError && (
            <p className="px-1 mt-1.5 text-[11px] text-ui-danger">{countryError}</p>
          )}
        </div>

        {/* Invite / coupon code */}
        <div>
          {hasInviteCode ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/60 bg-ui-ok-soft px-3.5 py-3">
              <Tag className="w-4 h-4 text-ui-ok flex-shrink-0" />
              <span className="flex-1 text-sm font-mono tracking-widest text-ui-text">
                {form.couponCode}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-ui-ok">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Invite code applied
              </span>
            </div>
          ) : (
            <FloatingField
              label="Invite Code (optional)"
              value={form.couponCode}
              onChange={(e) => { update('couponCode', e.target.value.toUpperCase()); setCouponError(null) }}
              icon={<Tag className="w-4 h-4" />}
              className="tracking-widest"
            />
          )}
          {couponError && (
            <p className="px-1 mt-1.5 text-[11px] text-ui-danger">{couponError}</p>
          )}
        </div>

        <label className="flex items-start gap-3 pt-1 cursor-pointer">
          <input
            type="checkbox"
            required
            checked={form.agreed}
            onChange={(e) => update('agreed', e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-ui-line accent-ui-brand cursor-pointer flex-shrink-0"
          />
          <span className="text-xs text-ui-muted leading-snug select-none">
            I agree to the{' '}
            <a
              href={LEGAL_LINKS.terms}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ui-brand-text hover:underline font-medium"
            >
              Terms of Use
            </a>{' '}
            and{' '}
            <a
              href={LEGAL_LINKS.privacy}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ui-brand-text hover:underline font-medium"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.marketingOptIn}
            onChange={(e) => update('marketingOptIn', e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-ui-line accent-ui-brand cursor-pointer flex-shrink-0"
          />
          <span className="text-xs text-ui-muted leading-snug select-none">
            {MARKETING_CONSENT_TEXT} <span>(optional)</span>
          </span>
        </label>

        {formError && <AuthAlert id="su-err">{formError}</AuthAlert>}

        <motion.button
          type="submit"
          disabled={loading || !canSubmit}
          whileTap={{ scale: 0.98 }}
          className="relative w-full inline-flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-sm font-semibold transition-colors mt-2 shadow-[0_10px_30px_-10px_rgba(159,32,99,0.7)] overflow-hidden"
        >
          {loading && (
            <span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              style={{ animation: 'shimmer 1.4s linear infinite', backgroundSize: '200% 100%' }}
            />
          )}
          <span className="relative inline-flex items-center gap-2">
            {loading ? 'Sending your code…' : 'Register for Free'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </span>
        </motion.button>
      </form>
    </div>
  )
}

/**
 * /login, carrying this page's ?next= (if safe) so switching to sign-in keeps
 * the return path. Read after mount, so the server render matches.
 */
function useLoginHref(): string {
  const [href, setHref] = useState('/login')
  useEffect(() => setHref(withNext('/login', nextInLocation())), [])
  return href
}

export default function SignUpPage() {
  const loginHref = useLoginHref()
  // /sign-up?org=CODE: an organisation's sign-up link. The learner joins that
  // organisation (it can only ever add her to it, never change her role).
  const [org, setOrg] = useState<JoiningOrg | null>(null)
  const [orgGone, setOrgGone] = useState(false)
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('org')?.trim()
    if (!code) return
    let live = true
    fetchJoinInfo(code)
      .then((o) => live && setOrg(o))
      .catch(() => live && setOrgGone(true))
    return () => {
      live = false
    }
  }, [])

  return (
    <AuthSplit
      topPrompt={{ text: 'Already a member?', ctaLabel: 'Log in', ctaHref: loginHref }}
      asideLabelledBy={org ? 'h-org-join' : 'h-join'}
      aside={org ? <OrgAside name={org.name} /> : <JoinAside />}
      width={420}
    >
      <AuthHeading
        title="Join Hadafi today"
        subtitle="Empower your business with AI. Free, no credit card, and it only takes a minute."
      />

      {org && (
        <div role="status" className="flex items-start gap-3 rounded-[12px] border border-[color-mix(in_srgb,var(--ui-brand)_25%,var(--ui-line))] bg-ui-brand-soft px-4 py-3">
          <Building2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-ui-brand-text" aria-hidden />
          <p className="text-sm leading-relaxed text-ui-text">
            You&rsquo;re joining with <strong className="font-semibold">{org.name}</strong>. {org.name} will see your name, email and
            learning record (courses, exams, certificates and mentor sessions). You can leave any time from your profile.
          </p>
        </div>
      )}
      {orgGone && !org && (
        <p role="status" className="rounded-[12px] bg-ui-surface-2 px-4 py-3 text-sm text-ui-muted">
          That organisation link isn&rsquo;t active any more. You can still sign up on your own.
        </p>
      )}

      <Suspense
        fallback={
          <div role="status" className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-ui-brand" aria-label="Loading" />
          </div>
        }
      >
        <SignUpForm
          org={org}
          onOrgGone={() => {
            setOrg(null)
            setOrgGone(true)
          }}
        />
      </Suspense>

      <p className="text-sm text-ui-muted">
        Already have an account?{' '}
        <Link href={loginHref} className="font-semibold text-ui-brand-text hover:underline">
          Log in
        </Link>
      </p>
    </AuthSplit>
  )
}

/** The side panel on the sign-up page. */
function JoinAside() {
  return (
    <>
      <div className="flex max-w-[460px] flex-col gap-4">
        <h2 id="h-join" className="text-[36px] font-semibold leading-[1.1] tracking-[-0.03em]">
          Empower your business with Hadafi, for free.
        </h2>
        <p className={cn('text-base leading-[1.6]', asideMuted)}>
          Training, mentors, tools and a global community of women entrepreneurs. Everything you need to start and
          grow your business.
        </p>
      </div>
      <AsideChecklist
        items={[
          '24/7 AI mentors built for women entrepreneurs',
          'Live events with global industry experts',
          'Exclusive partner offers and discounts',
          'Free to join, no credit card needed',
        ]}
      />
      <div className="mt-auto flex max-w-[460px] flex-col gap-3.5">
        <AsideHana>
          Hi, I&apos;m Hana. Once you&apos;ve joined, I&apos;m here to help with your courses and your business,
          any time.
        </AsideHana>
        <AsideStats />
      </div>
    </>
  )
}

/** The side panel when signing up with an organisation's link: what joining means. */
function OrgAside({ name }: { name: string }) {
  const points = [
    'Free courses, AI mentors and live events, like every Hadafi learner.',
    `${name} sees your name, email and learning record: courses, exams, certificates and mentor sessions.`,
    'You can leave the organisation any time from your profile.',
  ]
  return (
    <>
      <div className="flex max-w-[460px] flex-col gap-3">
        <h2 id="h-org-join" className="text-[32px] font-semibold leading-[1.12] tracking-[-0.03em]">
          Join Hadafi with {name}.
        </h2>
      </div>
      <ul className="flex flex-col gap-2.5">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-3 rounded-[14px] border border-white/10 bg-white/[0.05] px-4 py-3.5">
            <CheckCircle2 className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', asideAccent)} aria-hidden />
            <span className={cn('text-[15px] leading-normal', asideMuted)}>{p}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
