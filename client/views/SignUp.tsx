'use client'

import { useId, useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Building2, CheckCircle2, Eye, EyeOff, User, Mail, Lock, Globe, Tag, ChevronDown, ArrowRight, Loader2 } from 'lucide-react'
import { getCountryDataList } from 'countries-list'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FloatingField } from '@/components/auth/FloatingField'
import { homeFor, refreshUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { AuthAlert } from '@/components/auth/AuthField'
import { CodeForm, codeErrorMessage } from '@/components/auth/CodeForm'
import { LEGAL_LINKS } from '@/components/landing/legal'
import { fetchJoinInfo } from '@/lib/api/organisations'

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

// Inner component that reads search params (must be inside Suspense)
function SignUpForm() {
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
  })
  const [touched, setTouched] = useState({ country: false })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailChecking, setEmailChecking] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [step, setStep] = useState<'details' | 'code'>('details')

  // /sign-up?org=CODE: an organisation's sign-up link. The learner joins that
  // organisation (it can only ever add her to it, never change her role).
  const orgParam = searchParams.get('org')?.trim() ?? ''
  const [org, setOrg] = useState<{ name: string; code: string } | null>(null)
  const [orgGone, setOrgGone] = useState(false)
  useEffect(() => {
    if (!orgParam) return
    let live = true
    fetchJoinInfo(orgParam)
      .then((o) => live && setOrg(o))
      .catch(() => live && setOrgGone(true))
    return () => {
      live = false
    }
  }, [orgParam])

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
    emailAvailable === true &&
    !emailChecking &&
    !validatePassword(form.password) &&
    !!form.country

  async function handleEmailBlur() {
    if (validateEmail(form.email)) return
    setEmailChecking(true)
    try {
      const res = await apiFetch<{ success: boolean; data: { available: boolean } }>('/api/account/check-email', {
        method: 'POST',
        body: JSON.stringify({ email: form.email }),
      })
      const available = res.data.available
      setEmailAvailable(available)
      setEmailError(available ? null : 'An account with this email already exists')
    } catch (err: unknown) {
      const body = err as { error?: { code?: string } }
      if (body?.error?.code === 'VALIDATION_ERROR') {
        setEmailError('Enter a valid email address')
      }
      // true network failures — let server validate on submit
    } finally {
      setEmailChecking(false)
    }
  }

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
          verifiedToken,
        }),
      })
    } catch (err: unknown) {
      const e = err as ApiErr
      setStep('details')
      if (e?.code === 'EMAIL_EXISTS') setEmailError('An account with this email already exists')
      else if (e?.code === 'INVALID_COUPON') setCouponError('Invalid or already used invite code')
      else if (e?.code === 'INVALID_ORG_CODE') {
        setOrg(null)
        setOrgGone(true)
        setFormError('That organisation link has stopped working. You can sign up on your own, or ask the organisation for a new link.')
      }
      else setFormError('Something went wrong. Please try again.')
      return null
    }
    const user = await refreshUser()
    router.push(user ? homeFor(user.role) : '/dashboard')
    return null
  }

  if (step === 'code') {
    return (
      <div className="relative rounded-3xl border border-brand-surface-2 bg-white p-7 shadow-[0_20px_60px_-20px_rgba(159,32,99,0.18)]">
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
    <div className="relative rounded-3xl border border-brand-surface-2 bg-white p-7 shadow-[0_20px_60px_-20px_rgba(159,32,99,0.18)]">
      {org && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-brand-primary/25 bg-brand-primary/5 px-4 py-3">
          <Building2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand-primary" aria-hidden />
          <p className="text-sm leading-relaxed text-brand-text-primary">
            You&rsquo;re joining with <strong className="font-semibold">{org.name}</strong>. {org.name} will see your name, email and
            learning record (courses, exams, certificates and mentor sessions). You can leave any time from your profile.
          </p>
        </div>
      )}
      {orgGone && !org && (
        <p role="status" className="mb-4 rounded-xl bg-brand-surface px-4 py-3 text-sm text-brand-text-secondary">
          That organisation link isn&rsquo;t active any more. You can still sign up on your own.
        </p>
      )}
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
          }}
          onBlur={handleEmailBlur}
          icon={<Mail className="w-4 h-4" />}
          validator={validateEmail}
          externalError={emailError}
          trailing={
            emailChecking
              ? <Loader2 className="w-4 h-4 text-brand-text-secondary/50 animate-spin" />
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
              className="p-2 text-brand-text-secondary/70 hover:text-brand-primary transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />

        {/* Country — custom floating select */}
        <div>
          <div
            className={`relative rounded-xl bg-white border transition-all ${
              countryError
                ? 'border-rose-400 ring-2 ring-rose-400/20'
                : form.country
                  ? 'border-emerald-500/60'
                  : 'border-brand-surface-2 hover:border-brand-text-secondary/40 focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/20'
            }`}
          >
            <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-secondary/70 pointer-events-none z-10" />
            <label
              htmlFor={countryId}
              className={`pointer-events-none absolute left-10 transition-all duration-200 ${
                form.country
                  ? 'top-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-text-secondary'
                  : 'top-1/2 -translate-y-1/2 text-sm text-brand-text-secondary/70'
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
              className="w-full appearance-none bg-transparent pl-10 pr-10 pt-5 pb-2 text-sm text-brand-text-primary focus:outline-none cursor-pointer"
            >
              <option value="" disabled hidden></option>
              {COUNTRIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-secondary/70 pointer-events-none" />
          </div>
          {countryError && (
            <p className="px-1 mt-1.5 text-[11px] text-rose-600">{countryError}</p>
          )}
        </div>

        {/* Invite / coupon code */}
        <div>
          {hasInviteCode ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/60 bg-emerald-50/60 px-3.5 py-3">
              <Tag className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="flex-1 text-sm font-mono tracking-widest text-brand-text-primary">
                {form.couponCode}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
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
            <p className="px-1 mt-1.5 text-[11px] text-rose-600">{couponError}</p>
          )}
        </div>

        <label className="flex items-start gap-3 pt-1 cursor-pointer">
          <input
            type="checkbox"
            required
            checked={form.agreed}
            onChange={(e) => update('agreed', e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-brand-surface-2 accent-brand-primary cursor-pointer flex-shrink-0"
          />
          <span className="text-xs text-brand-text-secondary leading-snug select-none">
            By registering, I agree to the{' '}
            <a
              href={LEGAL_LINKS.terms}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-primary hover:text-brand-primary-dark font-medium transition-colors"
            >
              Terms and Conditions
            </a>
            .
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

export default function SignUpPage() {
  return (
    <AuthLayout
      badge="Free · No credit card"
      heading={
        <>
          Join <span className="text-gradient-magenta">Hadafi</span> today
        </>
      }
      subheading="Empower your business with AI — it only takes a minute."
      topRightPrompt={{ text: 'Already a member?', ctaLabel: 'Log in', ctaHref: '/login' }}
      altPrompt={{ text: 'Already have an account?', ctaLabel: 'Log in', ctaHref: '/login' }}
    >
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 rounded-full border-2 border-brand-primary/20 border-t-brand-primary animate-spin" />
          </div>
        }
      >
        <SignUpForm />
      </Suspense>
    </AuthLayout>
  )
}
