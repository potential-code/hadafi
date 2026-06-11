'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Lock, ArrowRight, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FloatingField } from '@/components/auth/FloatingField'
import { setAuth, type User } from '@/lib/auth'
import { apiFetch } from '@/lib/api'

interface TokenInfo {
  name: string
  email: string
}

interface SetupResponse {
  token: string
  user: User
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
      const { token: jwt, user } = await apiFetch<SetupResponse>('/api/mentor/setup', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      })
      setAuth(jwt, user)
      router.push('/mentor/dashboard')
    } catch (err: unknown) {
      const body = err as { code?: string }
      if (body?.code === 'TOKEN_EXPIRED') {
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-brand-primary/40 animate-spin" />
      </div>
    )
  }

  if (tokenError || !tokenInfo) {
    return (
      <div className="relative rounded-3xl border border-brand-surface-2 bg-white p-8 shadow-[0_20px_60px_-20px_rgba(159,32,99,0.18)] text-center">
        <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6 text-rose-500" />
        </div>
        <h2 className="text-lg font-bold text-brand-text-primary mb-2">Link expired or invalid</h2>
        <p className="text-sm text-brand-text-secondary">
          This setup link has expired or has already been used. Please contact support to request a new one.
        </p>
      </div>
    )
  }

  return (
    <div className="relative rounded-3xl border border-brand-surface-2 bg-white p-7 shadow-[0_20px_60px_-20px_rgba(159,32,99,0.18)]">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Pre-filled read-only fields */}
        <div className="space-y-3">
          <div className="rounded-xl border border-brand-surface-2 bg-brand-surface px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary mb-0.5">Full Name</p>
            <p className="text-sm font-medium text-brand-text-primary">{tokenInfo.name}</p>
          </div>
          <div className="rounded-xl border border-brand-surface-2 bg-brand-surface px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary mb-0.5">Email Address</p>
            <p className="text-sm font-medium text-brand-text-primary">{tokenInfo.email}</p>
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
              className="p-2 text-brand-text-secondary/70 hover:text-brand-primary transition-colors"
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

export default function MentorSetupPage() {
  return (
    <AuthLayout
      badge="Mentor Onboarding"
      heading={
        <>
          Set up your <span className="text-gradient-magenta">SMEEP</span> account
        </>
      }
      subheading="Your application was approved. Create your password to access your mentor dashboard."
      altPrompt={{ text: 'Already have an account?', ctaLabel: 'Log in', ctaHref: '/login' }}
    >
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-primary/40 animate-spin" />
          </div>
        }
      >
        <SetupForm />
      </Suspense>
    </AuthLayout>
  )
}
