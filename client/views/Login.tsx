'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FloatingField } from '@/components/auth/FloatingField'
import { setAuth, type User } from '@/lib/auth'
import { apiFetch } from '@/lib/api'

const validateEmail = (v: string) =>
  !v ? 'Enter your email' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Enter a valid email address' : null

const validatePassword = (v: string) =>
  !v ? 'Enter your password' : v.length < 6 ? 'Password must be at least 6 characters' : null

interface LoginResponse {
  success: boolean
  data: {
    token: string
    user: User
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (validateEmail(email) || validatePassword(password)) return

    setLoading(true)
    setFieldError(null)

    try {
      const { data: { token, user } } = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      setAuth(token, user)

      // Route to the correct dashboard based on role.
      if (user.role === 'admin') {
        router.push('/admin/dashboard')
      } else if (user.role === 'mentor') {
        router.push('/mentor/dashboard')
      } else {
        router.push('/dashboard')
      }
    } catch (err: unknown) {
      const body = err as { error?: { message?: string; code?: string } }
      if (body?.error?.code === 'INVALID_CREDENTIALS') {
        setFieldError('Invalid email or password')
      } else {
        toast.error('Something went wrong', { description: 'Please try again.' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      badge="Welcome back"
      heading={
        <>
          Log in to <span className="text-gradient-magenta">SMEEP</span>
        </>
      }
      subheading="Continue your AI-powered business journey."
      topRightPrompt={{ text: 'New here?', ctaLabel: 'Create a free account', ctaHref: '/sign-up' }}
      altPrompt={{ text: "Don't have an account?", ctaLabel: 'Register for free', ctaHref: '/sign-up' }}
    >
      <div className="relative rounded-3xl border border-brand-surface-2 bg-white p-7 shadow-[0_20px_60px_-20px_rgba(159,32,99,0.18)]">
        <form onSubmit={handleSubmit} className="space-y-4">
          {fieldError && (
            <p className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-rose-600 text-center">
              {fieldError}
            </p>
          )}
          <FloatingField
            type="email"
            label="Email Address"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldError(null) }}
            icon={<Mail className="w-4 h-4" />}
            validator={validateEmail}
          />
          <FloatingField
            type={showPassword ? 'text' : 'password'}
            label="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => { setPassword(e.target.value); setFieldError(null) }}
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

          <div className="flex items-center justify-between text-xs">
            <label className="inline-flex items-center gap-2 text-brand-text-secondary cursor-pointer">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 rounded border-brand-surface-2 accent-brand-primary"
              />
              Remember me
            </label>
            <a
              href="#"
              className="text-brand-primary hover:text-brand-primary-dark font-medium transition-colors"
            >
              Forgot password?
            </a>
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.98 }}
            className="relative w-full inline-flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-80 disabled:cursor-wait text-white py-3.5 rounded-xl text-sm font-semibold transition-colors mt-2 shadow-[0_10px_30px_-10px_rgba(159,32,99,0.7)] overflow-hidden"
          >
            {loading && (
              <span
                aria-hidden
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent"
                style={{ animation: 'shimmer 1.4s linear infinite', backgroundSize: '200% 100%' }}
              />
            )}
            <span className="relative inline-flex items-center gap-2">
              {loading ? 'Logging in…' : 'Log In'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </span>
          </motion.button>
        </form>
      </div>
    </AuthLayout>
  )
}
