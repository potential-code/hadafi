'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isAuthenticated, getUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'

type Role = 'sme' | 'mentor' | 'admin'

function getDashboardForRole(role: Role): string {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'mentor') return '/mentor/dashboard'
  return '/dashboard'
}

interface Props {
  children: ReactNode
  /** When provided, also enforces that the current user has this exact role. */
  role?: Role
}

export function RequireAuth({ children, role }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const tzSynced = useRef(false)

  useEffect(() => {
    if (tzSynced.current) return
    tzSynced.current = true
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    apiFetch<{ success: boolean; data: { user: { timezone: string | null } } }>('/api/auth/me')
      .then(({ data }) => {
        if (data.user.timezone !== detected) {
          return apiFetch('/api/auth/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: detected }),
          })
        }
        return undefined
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function check() {
      if (!isAuthenticated()) {
        setAuthed(false)
        router.push('/login')
        return
      }

      if (role) {
        const user = getUser()
        if (!user || user.role !== role) {
          setAuthed(false)
          // Redirect to the dashboard that matches the user's actual role
          const target = user ? getDashboardForRole(user.role as Role) : '/login'
          router.push(target)
          return
        }
      }

      setAuthed(true)
    }

    check()
    window.addEventListener('storage', check)
    window.addEventListener('smeep:auth-changed', check)
    return () => {
      window.removeEventListener('storage', check)
      window.removeEventListener('smeep:auth-changed', check)
    }
  }, [pathname, router, role])

  if (authed !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-surface">
        <div className="w-12 h-12 rounded-full border-2 border-brand-primary/20 border-t-brand-primary animate-spin" />
      </div>
    )
  }
  return <>{children}</>
}
