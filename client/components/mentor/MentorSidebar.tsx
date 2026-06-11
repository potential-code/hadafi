'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  CalendarCheck,
  User,
  LogOut,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { clearAuth, getUser, type User as AuthUser } from '@/lib/auth'
import { REDESIGN_ASSETS } from '@/lib/constants'

export type MentorNavItem = {
  label: string
  href: string
  icon: LucideIcon
}

export const MENTOR_NAV: MentorNavItem[] = [
  { label: 'Dashboard', href: '/mentor/dashboard', icon: LayoutDashboard },
  { label: 'My Sessions', href: '/mentor/dashboard/sessions', icon: CalendarDays },
  { label: 'Availability', href: '/mentor/dashboard/availability', icon: CalendarCheck },
  { label: 'Mentees', href: '/mentor/dashboard/mentees', icon: Users },
]

export function MentorSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const location = usePathname() ?? ''
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(() => getUser())

  useEffect(() => {
    const refresh = () => setUser(getUser())
    window.addEventListener('smeep:auth-changed', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('smeep:auth-changed', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  function handleLogout() {
    clearAuth()
    router.push('/login')
  }

  const fullName = user?.fullName ?? 'Mentor'
  const email = user?.email ?? ''
  const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}&backgroundColor=9f2063&fontSize=42&radius=50`

  return (
    <div className="flex h-full flex-col bg-brand-deep text-white">
      <div className="px-6 pt-6 pb-4 flex items-center gap-2">
        <Link href="/" className="flex items-center" onClick={onNavigate}>
          <img
            src={REDESIGN_ASSETS.logo.src}
            alt={REDESIGN_ASSETS.logo.alt}
            className="h-9 brightness-0 invert"
          />
        </Link>
      </div>
      <div className="px-3 pb-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 flex items-center gap-2">
          <GraduationCap className="w-3.5 h-3.5 text-white/70" />
          <span className="text-[11px] font-semibold text-white/70 uppercase tracking-[0.18em]">
            Mentor dashboard
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {MENTOR_NAV.map((item, i) => {
          const Icon = item.icon
          const active =
            item.href === '/mentor/dashboard'
              ? location === '/mentor/dashboard' || location === '/mentor/dashboard/'
              : location === item.href || location.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                active
                  ? 'text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.05]',
              )}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {active && (
                <motion.span
                  layoutId="mentor-nav-active"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark shadow-[0_8px_24px_-10px_rgba(159,32,99,0.7)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className={cn('relative z-10 flex items-center justify-center w-7 h-7 rounded-lg transition-colors', active ? 'bg-white/15' : 'bg-white/[0.04] group-hover:bg-white/10')}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="relative z-10 flex-1">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-3 pb-5 pt-3 border-t border-white/10 mt-2 space-y-2">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-brand-primary/40">
              <img src={avatar} alt={fullName} className="w-full h-full object-cover" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-brand-deep" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{fullName}</p>
            <p className="text-[11px] text-white/60 truncate">{email}</p>
          </div>
        </div>

        <Link
          href="/mentor/dashboard/profile"
          onClick={onNavigate}
          className="group w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/75 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.04] group-hover:bg-white/10">
            <User className="w-4 h-4" />
          </span>
          Profile
        </Link>

        <button
          onClick={handleLogout}
          className="group w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/75 hover:text-white hover:bg-rose-500/15 transition-colors"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.04] group-hover:bg-rose-500/20">
            <LogOut className="w-4 h-4" />
          </span>
          Log out
        </button>
      </div>
    </div>
  )
}
