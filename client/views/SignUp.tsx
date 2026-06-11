'use client'

import { useId, useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { CheckCircle2, Eye, EyeOff, User, Mail, Lock, Globe, Tag, ChevronDown, ArrowRight, Loader2 } from 'lucide-react'
import { getCountryDataList } from 'countries-list'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FloatingField } from '@/components/auth/FloatingField'
import { setAuth, type User as AuthUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'

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
const validatePassword = (v: string) =>
  !v ? 'Choose a password' : v.length < 8 ? 'Use at least 8 characters' : null

interface RegisterResponse {
  success: boolean
  data: {
    token: string
    user: AuthUser
  }
}

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
    form.password.length >= 8 &&
    !!form.country

  async function handleEmailBlur() {
    if (validateEmail(form.email)) return
    setEmailChecking(true)
    try {
      const res = await apiFetch<{ success: boolean; data: { available: boolean } }>(
        `/api/auth/check-email?email=${encodeURIComponent(form.email)}`
      )
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

    setLoading(true)

    try {
      const body: Record<string, string> = {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        country: form.country,
      }
      if (form.couponCode.trim()) {
        body.couponCode = form.couponCode.trim()
      }

      const { data: { token, user } } = await apiFetch<RegisterResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      setAuth(token, user)

      if (user.role === 'admin') {
        router.push('/admin/dashboard')
      } else if (user.role === 'mentor') {
        router.push('/mentor/dashboard')
      } else {
        router.push('/dashboard')
      }
    } catch (err: unknown) {
      const body = err as { error?: { message?: string; code?: string; errors?: Record<string, string[]> } }
      const code = body?.error?.code
      if (code === 'EMAIL_EXISTS') {
        setEmailError('An account with this email already exists')
      } else if (code === 'INVALID_COUPON') {
        setCouponError('Invalid or already used invite code')
      } else if (code === 'VALIDATION_ERROR') {
        const fieldErrors = body?.error?.errors ?? {}
        if (fieldErrors.couponCode?.length) {
          setCouponError('Invalid invite code')
        } else if (fieldErrors.email?.length) {
          setEmailError(fieldErrors.email[0])
        } else {
          toast.error('Please check your details and try again.')
        }
      } else {
        toast.error('Something went wrong', { description: 'Please try again.' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative rounded-3xl border border-brand-surface-2 bg-white p-7 shadow-[0_20px_60px_-20px_rgba(159,32,99,0.18)]">
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
          label="Password (min 8)"
          autoComplete="new-password"
          required
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
              href="#"
              className="text-brand-primary hover:text-brand-primary-dark font-medium transition-colors"
            >
              Terms and Conditions
            </a>
            .
          </span>
        </label>

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
            {loading ? 'Creating your account…' : 'Register for Free'}
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
          Join <span className="text-gradient-magenta">SMEEP</span> today
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
