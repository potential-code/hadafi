'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  BarChart3,
  BookOpenCheck,
  ImageIcon,
  Link2,
  Tag,
  Users,
  User,
  LogOut,
  Shield,
  Building2,
  ChevronDown,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { clearAuth, getUser } from '@/lib/auth'
import { REDESIGN_ASSETS } from '@/lib/constants'

export type AdminNavItem = {
  label: string
  href: string
  icon: LucideIcon
}

export const ADMIN_NAV: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Invites', href: '/admin/invites', icon: Link2 },
]

const ADMIN_NAV_BOTTOM: AdminNavItem[] = [
  { label: 'Course Creation', href: '/admin/courses', icon: BookOpenCheck },
  { label: 'Live Events', href: '/admin/live-events', icon: CalendarDays },
  { label: 'Offers', href: '/admin/offers', icon: Tag },
  { label: 'Media Library', href: '/admin/media', icon: ImageIcon },
]

export const STAKEHOLDER_NAV: AdminNavItem[] = [
  { label: 'Mentor Applications', href: '/admin/applications', icon: Users },
  { label: 'VCs', href: '/admin/stakeholder-applications/vc', icon: Building2 },
  { label: 'Government', href: '/admin/stakeholder-applications/government', icon: Building2 },
  { label: 'University', href: '/admin/stakeholder-applications/university', icon: Building2 },
  { label: 'Corporates', href: '/admin/stakeholder-applications/corporate', icon: Building2 },
  { label: 'Incubator', href: '/admin/stakeholder-applications/incubator', icon: Building2 },
]

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const location = usePathname() ?? ''
  const router = useRouter()
  const isStakeholderRoute = location.startsWith('/admin/stakeholder-applications') || location.startsWith('/admin/applications')
  const isContentRoute = location.startsWith('/admin/courses') || location.startsWith('/admin/media') || location.startsWith('/admin/live-events') || location.startsWith('/admin/offers')
  const [stakeholderOpen, setStakeholderOpen] = useState(isStakeholderRoute)
  const [contentOpen, setContentOpen] = useState(isContentRoute)

  useEffect(() => {
    if (isStakeholderRoute) setStakeholderOpen(true)
  }, [isStakeholderRoute])

  useEffect(() => {
    if (isContentRoute) setContentOpen(true)
  }, [isContentRoute])

  const user = getUser()
  const fullName = user?.fullName ?? 'Admin'
  const email = user?.email ?? ''
  const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}&backgroundColor=9f2063&fontSize=42&radius=50`

  function handleLogout() {
    clearAuth()
    router.push('/login')
  }

  function renderNavItem(item: AdminNavItem, layoutId: string) {
    const Icon = item.icon
    const active = location === item.href || location.startsWith(item.href + '/')
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
          active ? 'text-white' : 'text-white/70 hover:text-white hover:bg-white/[0.05]',
        )}
      >
        {active && (
          <motion.span
            layoutId={layoutId}
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
  }

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
        <div className="rounded-xl border border-brand-primary/30 bg-gradient-to-r from-brand-primary/15 to-brand-violet/15 px-3 py-2 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-brand-primary-light" />
          <span className="text-[11px] font-semibold text-white/80 uppercase tracking-[0.18em]">
            Admin dashboard
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {ADMIN_NAV.map((item) => renderNavItem(item, 'admin-nav-active'))}

        {/* Divider */}
        <div className="my-2 border-t border-white/[0.07]" />

        {/* Stakeholder Applications collapsible section */}
        <div>
          <button
            onClick={() => setStakeholderOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white/40 uppercase tracking-[0.18em] hover:text-white/70 transition-colors"
          >
            Stakeholder Applications
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 transition-transform duration-200',
                stakeholderOpen ? 'rotate-0' : '-rotate-90',
              )}
            />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {stakeholderOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden space-y-0.5"
            >
              {STAKEHOLDER_NAV.map((item) => renderNavItem(item, 'admin-stakeholder-nav-active'))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Divider */}
        <div className="my-2 border-t border-white/[0.07]" />

        {/* Content Management collapsible section */}
        <div>
          <button
            onClick={() => setContentOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white/40 uppercase tracking-[0.18em] hover:text-white/70 transition-colors"
          >
            Content Management
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 transition-transform duration-200',
                contentOpen ? 'rotate-0' : '-rotate-90',
              )}
            />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {contentOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden space-y-0.5"
            >
              {ADMIN_NAV_BOTTOM.map((item) => renderNavItem(item, 'admin-content-nav-active'))}
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <div className="px-3 pb-5 pt-3 border-t border-white/10 mt-2 space-y-1.5">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-brand-primary/40">
              <img
                src={avatar}
                alt={fullName}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-brand-deep" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{fullName}</p>
            <p className="text-[11px] text-white/60 truncate">{email}</p>
          </div>
        </div>

        <Link
          href="/admin/profile"
          onClick={onNavigate}
          className={cn(
            'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
            location === '/admin/profile' || location.startsWith('/admin/profile/')
              ? 'text-white bg-gradient-to-r from-brand-primary to-brand-primary-dark shadow-[0_8px_24px_-10px_rgba(159,32,99,0.7)]'
              : 'text-white/75 hover:text-white hover:bg-white/[0.05]',
          )}
        >
          <span className={cn('flex items-center justify-center w-7 h-7 rounded-lg', location.startsWith('/admin/profile') ? 'bg-white/15' : 'bg-white/[0.04] group-hover:bg-white/10')}>
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
