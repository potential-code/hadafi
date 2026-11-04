'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Toaster } from 'sonner'
import { CornerDownLeft, LogOut, Menu, Moon, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getUser, signOut, type User as AuthUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { REDESIGN_ASSETS } from '@/lib/constants'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { SHELL_CONFIG, allItems, isActive, type ShellConfig, type ShellNavItem, type ShellRole } from './nav'
import { optimizedSrc } from '@/lib/images'

const COLLAPSE_KEY = 'hadafi.sidebarCollapsed'

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false)
  // Transitions stay off until the remembered state has painted, so a page
  // navigation renders the sidebar where it was instead of animating into place.
  const [settled, setSettled] = useState(false)
  useLayoutEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    } catch {
      /* private mode: starts expanded */
    }
  }, [])
  useLayoutEffect(() => {
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setSettled(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [])
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        if (c) localStorage.removeItem(COLLAPSE_KEY)
        else localStorage.setItem(COLLAPSE_KEY, '1')
      } catch {
        /* not remembered */
      }
      return !c
    })
  }, [])
  return { collapsed, settled, toggle }
}

const THEME_KEY = 'hadafi.theme'

/**
 * Light/dark for the signed-in app only. app/layout.tsx applies a stored dark
 * choice before paint on app routes; leaving the app (public pages) drops it.
 */
function useAppTheme() {
  const [dark, setDark] = useState(false)
  useLayoutEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(THEME_KEY)
    } catch {
      /* private mode: light */
    }
    const isDark = stored === 'dark'
    document.documentElement.classList.toggle('dark', isDark)
    setDark(isDark)
    return () => document.documentElement.classList.remove('dark')
  }, [])
  const toggle = useCallback(() => {
    setDark((d) => {
      const next = !d
      document.documentElement.classList.toggle('dark', next)
      try {
        localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
      } catch {
        /* not remembered */
      }
      return next
    })
  }, [])
  return { dark, toggle }
}

function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null)
  useEffect(() => {
    const refresh = () => setUser(getUser())
    refresh()
    window.addEventListener('hadafi:auth-changed', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('hadafi:auth-changed', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return user
}

/** Profile photo for the sidebar card; refreshed when the photo changes. */
function useAvatarUrl(user: AuthUser | null) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const load = () =>
      apiFetch<{ data: { user: { avatarUrl?: string | null } } }>('/api/account/me')
        .then((r) => {
          if (!cancelled) setAvatarUrl(r.data.user.avatarUrl ?? null)
        })
        .catch(() => {})
    load()
    window.addEventListener('hadafi:avatar-changed', load)
    return () => {
      cancelled = true
      window.removeEventListener('hadafi:avatar-changed', load)
    }
  }, [user?.id])
  return avatarUrl
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || 'S'
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: ShellNavItem
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-lg text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        active
          ? 'bg-ui-brand-soft font-semibold text-ui-brand-text'
          : 'text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text',
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
      <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
    </Link>
  )
}

function ShellSidebar({
  config,
  collapsed,
  onToggle,
  onSearch,
  onNavigate,
  user,
  avatarUrl,
  onLogout,
  dark,
  onToggleTheme,
}: {
  config: ShellConfig
  collapsed: boolean
  onToggle?: () => void
  onSearch: () => void
  onNavigate?: () => void
  user: AuthUser | null
  avatarUrl: string | null
  onLogout: () => void
  dark: boolean
  onToggleTheme: () => void
}) {
  const pathname = usePathname() ?? ''
  const name = user?.fullName ?? config.roleLabel
  const profileActive = isActive(pathname, { label: 'Profile', href: config.profileHref, icon: Menu })

  return (
    <div className={cn('flex h-full w-full flex-col gap-3 bg-ui-surface py-3', collapsed ? 'px-2.5' : 'px-3')}>
      <div className={cn('flex h-10 items-center gap-2', collapsed ? 'justify-center' : 'px-1.5')}>
        {!collapsed && (
          <Link href={config.homeHref} onClick={onNavigate} className="flex items-center">
            <img src={REDESIGN_ASSETS.logo.src} alt={REDESIGN_ASSETS.logo.alt} className="h-8 w-auto dark:brightness-0 dark:invert" />
          </Link>
        )}
        {/* The desktop sidebar has the bell (the phone header has its own). */}
        {onToggle && !collapsed && (
          <span className="ml-auto">
          </span>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar ( [ )' : 'Collapse sidebar ( [ )'}
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-ui-muted transition-colors hover:border-ui-line hover:bg-ui-surface-2 hover:text-ui-text',
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onSearch}
        aria-label="Search pages"
        title={collapsed ? 'Search (⌘K)' : undefined}
        className={cn(
          'flex h-9 items-center gap-2.5 rounded-[9px] border border-ui-line bg-ui-bg text-sm text-ui-muted transition-colors hover:text-ui-text',
          collapsed ? 'justify-center' : 'px-2.5',
        )}
      >
        <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search</span>
            <kbd className="hidden rounded-[5px] border border-ui-line bg-ui-surface px-1.5 text-[11px] font-semibold text-ui-muted lg:inline">⌘K</kbd>
          </>
        )}
      </button>

      {onToggle && collapsed && (
        <div className="flex justify-center">
        </div>
      )}

      {/* On short screens the list scrolls: the fade at the bottom shows there is
          more below instead of an item cut in half under the footer. */}
      <nav
        aria-label="Main"
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-5 [mask-image:linear-gradient(to_bottom,#000_calc(100%-28px),transparent)]"
      >
        {config.groups.map((group, gi) => (
          <div key={group.title ?? gi} className={cn('flex flex-col gap-0.5', collapsed && gi > 0 && 'border-t border-ui-line pt-2.5')}>
            {group.title && !collapsed && (
              <span className="px-2.5 pb-1 text-xs font-semibold text-ui-muted">{group.title}</span>
            )}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item)} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      {config.footer.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(pathname, item)} collapsed={collapsed} onNavigate={onNavigate} />
      ))}

      <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'rounded-[10px] border border-ui-line p-2', profileActive && !collapsed && 'border-ui-brand bg-ui-brand-soft')}>
        <Link
          href={config.profileHref}
          onClick={onNavigate}
          aria-current={profileActive ? 'page' : undefined}
          title={collapsed ? `${name}, profile` : undefined}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-ui-text"
        >
          {avatarUrl ? (
            <img src={optimizedSrc(avatarUrl)} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-violet text-xs font-bold text-white">
              {initials(name)}
            </span>
          )}
          {!collapsed && (
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-semibold">{name}</span>
              <span className="truncate text-xs text-ui-muted">{config.roleLabel}</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={dark ? 'Light mode' : 'Dark mode'}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ui-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-text"
        >
          {dark ? <Sun className="h-4 w-4" strokeWidth={1.75} /> : <Moon className="h-4 w-4" strokeWidth={1.75} />}
        </button>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ui-muted transition-colors hover:bg-ui-danger-soft hover:text-ui-danger"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}

// ── Page search (⌘K) ──────────────────────────────────────────────────────────

function CommandMenu({ config, open, onClose }: { config: ShellConfig; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const items = useMemo(() => {
    const all = [...allItems(config), { label: 'Profile', href: config.profileHref, icon: Menu }]
    const q = query.trim().toLowerCase()
    return q ? all.filter((i) => i.label.toLowerCase().includes(q)) : all
  }, [config, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  if (!open) return null

  const go = (item: ShellNavItem | undefined) => {
    if (!item) return
    onClose()
    router.push(item.href)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search pages"
        className="w-full max-w-lg overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface shadow-ui"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-ui-line px-4">
          <Search className="h-[18px] w-[18px] text-ui-muted" strokeWidth={1.75} aria-hidden />
          <label htmlFor="shell-search" className="sr-only">Search pages</label>
          <input
            id="shell-search"
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(i + 1, items.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') go(items[index])
            }}
            placeholder="Jump to a page"
            className="h-12 flex-1 bg-transparent text-[15px] text-ui-text outline-none placeholder:text-ui-muted"
            role="combobox"
            aria-expanded="true"
            aria-controls="shell-search-list"
            aria-activedescendant={items[index] ? `shell-search-${index}` : undefined}
          />
        </div>
        <ul id="shell-search-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-ui-muted">No page matches “{query}”.</li>}
          {items.map((item, i) => {
            const Icon = item.icon
            return (
              <li
                key={item.href}
                id={`shell-search-${i}`}
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(item)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                  i === index ? 'bg-ui-brand-soft text-ui-brand-text' : 'text-ui-text',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {i === index && <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function AppShell({
  role,
  children,
  fullBleed = false,
  banner,
}: {
  role: ShellRole
  children: ReactNode
  /** The page owns every pixel right of the sidebar (chat canvases). */
  fullBleed?: boolean
  /** Rendered at the top of the content area, above the page. */
  banner?: ReactNode
}) {
  const config = SHELL_CONFIG[role]
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const user = useAuthUser()
  const avatarUrl = useAvatarUrl(user)
  const theme = useAppTheme()
  const { collapsed, settled, toggle } = useSidebarCollapsed()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Ends the session on the server (revoking it), not just in this browser.
  const logout = useCallback(async () => {
    await signOut().catch(() => {})
    router.push('/login')
  }, [router])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      } else if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const sidebarProps = { config, user, avatarUrl, dark: theme.dark, onToggleTheme: theme.toggle, onLogout: logout, onSearch: () => setSearchOpen(true) }

  return (
    <div className={cn('flex bg-ui-bg text-ui-text', fullBleed ? 'h-dvh overflow-hidden' : 'min-h-dvh')}>
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 overflow-hidden border-r border-ui-line lg:flex',
          collapsed ? 'w-[72px]' : 'w-[248px]',
          settled && 'transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        )}
      >
        <ShellSidebar {...sidebarProps} collapsed={collapsed} onToggle={toggle} />
      </aside>

      <div className={cn('flex min-w-0 flex-1 flex-col', fullBleed ? 'h-dvh' : 'min-h-dvh')}>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-ui-line bg-ui-surface px-4 lg:hidden">
          <Link href={config.homeHref} className="mr-auto flex items-center">
            <img src={REDESIGN_ASSETS.logo.src} alt={REDESIGN_ASSETS.logo.alt} className="h-7 w-auto dark:brightness-0 dark:invert" />
          </Link>
          {config.quickAction && (
            <Link
              href={config.quickAction.href}
              aria-label={config.quickAction.label}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-ui-line bg-ui-surface text-ui-text"
            >
              <config.quickAction.icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-ui-line bg-ui-surface text-ui-text"
          >
            <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </button>
        </header>

        <main className={cn('flex-1', fullBleed ? 'flex min-h-0 flex-col' : 'px-4 py-6 sm:px-6 lg:px-10 lg:py-8')}>
          {fullBleed ? (
            <>
              {banner}
              {children}
            </>
          ) : (
            <div className="mx-auto w-full max-w-[1400px]">
              {banner}
              {children}
            </div>
          )}
        </main>

        {config.tabs.length > 0 && (
          <nav
            aria-label="Main, mobile"
            className="sticky bottom-0 z-30 grid shrink-0 grid-cols-5 border-t border-ui-line bg-ui-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
          >
            {config.tabs.map((tab) => {
              const active = isActive(pathname, tab)
              const Icon = tab.icon
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
                    active ? 'text-ui-brand-text' : 'text-ui-muted',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  {tab.label}
                </Link>
              )
            })}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-ui-muted"
            >
              <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              More
            </button>
          </nav>
        )}
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] gap-0 border-r-0 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <ShellSidebar {...sidebarProps} collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <CommandMenu config={config} open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  )
}
