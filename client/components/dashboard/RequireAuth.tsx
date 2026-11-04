'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { checkSession, clearAuth, getUser, homeFor, type User } from '@/lib/auth'
import { apiFetch } from '@/lib/api'

type Role = User['role']

interface Props {
  children: ReactNode
  /** When provided, also enforces that the current user has this exact role. */
  role?: Role
}

/**
 * Renders its children only for a signed-in user (with `role`, if given).
 *
 * The cached user lets the page render at once; the server's session is
 * checked on mount and every 10 minutes. Better Auth extends a session while
 * it is in use, so there is nothing to refresh here: an ended session (signed
 * out elsewhere, revoked, or a week idle) sends the user to /login. Only a
 * confirmed "no session" signs the user out: a 5xx or a network error keeps
 * them signed in, so a redeploy never kicks everyone out.
 */
export function RequireAuth({ children, role }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  // Starts empty on both server and client (no localStorage on the server,
  // so reading it here would make the first render mismatch); the cached
  // user is picked up right after mount.
  const [user, setUser] = useState<User | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const tzSynced = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function confirm() {
      let result: { ok: boolean; user: User | null }
      try {
        result = await checkSession()
      } catch {
        return // network trouble: keep the cached user, retry on the next tick
      }
      if (cancelled) return
      // The server erred (restart, 502): keep the cached user and retry on the
      // next tick rather than signing everyone out during an outage.
      if (!result.ok) {
        if (result.user) {
          setUser(result.user)
          setConfirmed(true)
        }
        return
      }
      const current = result.user
      if (!current) {
        clearAuth()
        router.replace('/login?expired=1')
        return
      }
      setUser(current)
      setConfirmed(true)
    }
    void confirm()
    const id = window.setInterval(confirm, 10 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [router])

  // Show the cached user at once, and follow other tabs signing in or out.
  useEffect(() => {
    const sync = () => setUser(getUser())
    sync()
    window.addEventListener('hadafi:auth-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('hadafi:auth-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const roleMismatch = !!user && !!role && user.role !== role
  useEffect(() => {
    if (roleMismatch && user) router.replace(homeFor(user.role))
    else if (!user && confirmed) router.replace('/login')
  }, [roleMismatch, user, confirmed, router, pathname])

  useEffect(() => {
    if (!confirmed || tzSynced.current) return
    tzSynced.current = true
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    apiFetch<{ success: boolean; data: { user: { timezone: string | null } } }>('/api/account/me')
      .then(({ data }) => {
        if (data.user.timezone !== detected) {
          return apiFetch('/api/account/me', { method: 'PUT', body: JSON.stringify({ timezone: detected }) })
        }
        return undefined
      })
      .catch(() => {})
  }, [confirmed])

  if (!user || roleMismatch) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-surface">
        <div className="w-12 h-12 rounded-full border-2 border-brand-primary/20 border-t-brand-primary animate-spin" />
      </div>
    )
  }
  return <>{children}</>
}
