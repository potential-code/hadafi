'use client'

/**
 * Pieces of the Ask Hana page (the full-page concierge, ported from SMEEP):
 * what Hana can do (tabs on a new chat, shortcut menus during one), the
 * pre-conversation greeting and the page strings. Every entry sends Hana a
 * plain message, the same path as typing it, so nothing here bypasses the
 * agent.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpRight,
  ListChecks,
  PenLine,
  Search,
  Target,
  CalendarCheck,
  CalendarDays,
  FileText,
  GraduationCap,
  History,
  Lightbulb,
  Megaphone,
  Rocket,
  Star,
  Tag,
  TrendingUp,
  UserRound,
  Users,
  Zap,
} from 'lucide-react'
import { HANA_AVATAR_SRC } from './HanaMessages'
import { cn } from '@/lib/utils'


interface Capability {
  label: string
  message: string
  icon: LucideIcon
}

export const GOALS: Capability[] = [
  { label: 'Increase my sales', icon: TrendingUp, message: 'I want to increase my sales' },
  { label: 'Grow my brand', icon: Star, message: 'I want to grow my brand' },
  { label: 'Launch a new product', icon: Rocket, message: 'I want to launch a new product' },
  { label: 'Find new customers', icon: Users, message: 'I want to find new customers' },
]

const FIND: Capability[] = [
  { label: 'A course for my business', icon: GraduationCap, message: 'Find a course that fits my business' },
  { label: 'A mentor who knows sales', icon: Users, message: 'Find me a human mentor who knows sales' },
  { label: 'Offers I can redeem with my points', icon: Tag, message: 'Which offers can I redeem with my points?' },
  { label: 'Upcoming events and recordings', icon: CalendarDays, message: 'Show me upcoming events and recordings' },
]

const DO: Capability[] = [
  { label: 'Book a mentor session', icon: CalendarCheck, message: 'I want to book a mentor session' },
  { label: 'Show my progress and sessions', icon: History, message: 'Show my course progress and my upcoming sessions' },
  { label: 'Update my profile', icon: UserRound, message: 'I want to update my profile' },
]

// Same trigger messages as the AI tool cards, so the guided flows start the
// same way from either place.
const WRITE: Capability[] = [
  { label: 'Business ideas', icon: Lightbulb, message: 'Help me brainstorm a business idea' },
  { label: 'Business plan', icon: FileText, message: 'Help me create a business plan' },
  { label: 'Marketing plan', icon: Megaphone, message: 'Help me create a marketing plan' },
  { label: 'AI proposal', icon: Zap, message: 'Help me write a product proposal' },
]


type Category = { key: string; tab: string; title: string; note?: string; icon: LucideIcon; items: Capability[] }

/** What Hana can do, in four groups: tabs on a new chat, menus during one. */
const CATEGORIES: Category[] = [
  { key: 'goals', tab: 'Goals', title: 'Start from a goal', icon: Target, items: GOALS },
  { key: 'find', tab: 'Find', title: 'Find for me', icon: Search, items: FIND },
  { key: 'do', tab: 'Do for me', title: 'Do it for me', icon: ListChecks, items: DO },
  {
    key: 'write',
    tab: 'Write',
    title: 'Write with me',
    note: 'Hana guides you step by step and emails the PDF.',
    icon: PenLine,
    items: WRITE,
  },
]

/**
 * A new chat: the four groups as tabs under Hana's greeting, the open group's
 * shortcuts as cards. Replaces the old side rail, so the chat keeps its width.
 */
export function AskHanaStarters({ onAsk, disabled }: { onAsk: (message: string) => void; disabled?: boolean }) {
  const [active, setActive] = useState(CATEGORIES[0].key)
  const tabsRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const cat = CATEGORIES.find((c) => c.key === active) ?? CATEGORIES[0]

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const i = CATEGORIES.findIndex((c) => c.key === active)
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const forward = (e.key === 'ArrowRight') !== rtl
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? CATEGORIES.length - 1 : (i + (forward ? 1 : -1) + CATEGORIES.length) % CATEGORIES.length
    setActive(CATEGORIES[next].key)
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div className="ask-starters mx-auto mt-5 w-full" style={{ maxWidth: 'var(--hana-thread-max, 776px)' }}>
      <div className="sm:ps-[42px]">
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="What Hana can do"
          onKeyDown={onTabKey}
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        >
          {CATEGORIES.map((c) => {
            const on = c.key === active
            return (
              <button
                key={c.key}
                type="button"
                role="tab"
                id={`${id}-${c.key}`}
                aria-selected={on}
                aria-controls={`${id}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(c.key)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-brand',
                  on
                    ? 'border-transparent bg-ui-brand-soft text-ui-brand-text'
                    : 'border-ui-line bg-ui-surface text-ui-muted hover:text-ui-text',
                )}
              >
                <c.icon className="hidden h-4 w-4 sm:block" strokeWidth={1.75} aria-hidden />
                <span className="sm:hidden">{c.tab}</span>
                <span className="hidden sm:inline">{c.title}</span>
              </button>
            )
          })}
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${cat.key}`} className="mt-3">
          {cat.note && <p className="mb-2 text-[13px] text-ui-muted">{cat.note}</p>}
          <div key={cat.key} className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
            {cat.items.map((item, i) => (
              <button
                key={item.label}
                type="button"
                disabled={disabled}
                onClick={() => onAsk(item.message)}
                className="ask-starter group flex min-h-[52px] items-center gap-3 rounded-[12px] border border-ui-line bg-ui-surface px-3 py-2.5 text-start text-sm font-medium text-ui-text transition-colors hover:border-[color-mix(in_srgb,var(--ui-brand)_35%,var(--ui-line))] hover:bg-ui-surface-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-brand disabled:opacity-50"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-ui-brand-soft text-ui-brand-text">
                  <item.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">{item.label}</span>
                <ArrowUpRight
                  className="h-4 w-4 flex-none text-ui-muted opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * During a chat: one row of group buttons above the composer; each opens its
 * shortcuts upwards. The panel sits outside the (scrollable) row so it isn't
 * clipped on phones.
 */
export function AskHanaShortcuts({ onAsk, disabled }: { onAsk: (message: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const cat = CATEGORIES.find((c) => c.key === open)

  const close = useCallback((refocusKey?: string) => {
    setOpen(null)
    if (refocusKey) rootRef.current?.querySelector<HTMLButtonElement>(`[data-cat="${refocusKey}"]`)?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(open)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    panelRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const opts = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const i = opts.indexOf(document.activeElement as HTMLButtonElement)
    opts[(i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length]?.focus()
  }

  return (
    <div ref={rootRef} className="relative mb-2.5">
      {cat && (
        <div
          ref={panelRef}
          id={`${id}-menu`}
          role="menu"
          aria-label={cat.title}
          onKeyDown={onMenuKey}
          className="ask-shortcut-menu absolute bottom-[calc(100%+6px)] start-0 z-40 w-[min(320px,100%)] rounded-[14px] border border-ui-line bg-ui-surface p-1.5 shadow-ui"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-ui-muted">{cat.title}</p>
          {cat.items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                setOpen(null)
                onAsk(item.message)
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-ui-text transition-colors hover:bg-ui-surface-2 focus:bg-ui-surface-2 focus:outline-none disabled:opacity-50"
            >
              <item.icon className="h-4 w-4 flex-none text-ui-brand-text" strokeWidth={1.75} aria-hidden />
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Shortcuts">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            data-cat={c.key}
            aria-haspopup="menu"
            aria-expanded={open === c.key}
            aria-controls={open === c.key ? `${id}-menu` : undefined}
            onClick={() => setOpen((o) => (o === c.key ? null : c.key))}
            className={cn('hana-chip shrink-0 whitespace-nowrap', open === c.key && 'is-open')}
          >
            <c.icon className="hidden h-4 w-4 text-ui-brand-text sm:block" strokeWidth={1.75} aria-hidden />
            {c.tab}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A question typed into Home's "Ask Hana" bar; Ask Hana sends it as the first message. */
export const ASK_HANA_PENDING_KEY = 'hadafi.askHana.pending'

export const ASK_STRINGS = {
  placeholder: 'Ask Hana anything, or describe a business goal',
  placeholderShort: 'Ask Hana anything',
  greeting: (first: string) =>
    `Hi ${first}, I'm Hana. Tell me a business goal, or ask me to find a course, a mentor, an offer or an event for you.`,
  today: 'Today',
}

/** The pre-conversation thread: a "Today" line and Hana's greeting. */
export function AskHanaGreeting({ text, today }: { text: string; today: string }) {
  return (
    <div className="mx-auto flex w-full flex-col gap-4" style={{ maxWidth: 'var(--hana-thread-max, 776px)' }}>
      <p className="text-center text-xs font-semibold text-ui-muted">{today}</p>
      <div className="flex items-start gap-2.5">
        <img
          src={HANA_AVATAR_SRC}
          alt="Hana"
          width={32}
          height={32}
          className="h-8 w-8 flex-shrink-0 rounded-full object-cover object-top"
        />
        <div className="hana-bubble w-fit">{text}</div>
      </div>
    </div>
  )
}
