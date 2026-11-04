'use client'

/**
 * Announcements from the Hadafi team at the top of the learner and mentor
 * pages (GET /api/me/announcements). Each person can dismiss one; that's
 * remembered in this browser. Plain fetch, not React Query: the mentor
 * portal has no query provider.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Megaphone, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

export type AnnouncementView = { id: string; title: string; body: string; linkUrl: string | null; linkLabel: string | null }

const KEY = 'hadafi.announcements.dismissed'
// Fetched once per page load at most every few minutes, shared by every page in the session.
const TTL = 5 * 60_000
let cache: { at: number; data: AnnouncementView[] } | null = null

function readDismissed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** One banner; also the live preview on the admin page. */
export function AnnouncementCard({ a, onDismiss, className }: { a: AnnouncementView; onDismiss?: () => void; className?: string }) {
  const external = !!a.linkUrl && /^https?:\/\//i.test(a.linkUrl)
  const label = a.linkLabel || 'Learn more'
  const linkClass = 'mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ui-brand-text hover:underline'
  return (
    <section
      aria-label="Announcement"
      className={cn(
        'relative flex items-start gap-3.5 rounded-[14px] border border-[color-mix(in_srgb,var(--ui-brand)_25%,var(--ui-line))] bg-ui-brand-soft px-4 py-3.5 sm:px-5',
        className,
      )}
    >
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ui-brand text-white">
        <Megaphone className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
      </span>
      <div className={cn('min-w-0 flex-1', onDismiss && 'pe-8')}>
        <h2 className="text-[15px] font-semibold leading-snug text-ui-text [overflow-wrap:anywhere]">{a.title}</h2>
        <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-ui-text [overflow-wrap:anywhere]">{a.body}</p>
        {a.linkUrl &&
          (external ? (
            <a href={a.linkUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {label}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            </a>
          ) : (
            <Link href={a.linkUrl} className={linkClass}>
              {label}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            </Link>
          ))}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss announcement: ${a.title}`}
          className="absolute end-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ui-muted transition-colors hover:bg-ui-surface hover:text-ui-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </section>
  )
}

export function AnnouncementBanner({ className }: { className?: string }) {
  const [dismissed, setDismissed] = useState<string[] | null>(null)
  const [data, setData] = useState<AnnouncementView[] | null>(cache?.data ?? null)

  useEffect(() => {
    setDismissed(readDismissed())
    if (cache && Date.now() - cache.at < TTL) {
      setData(cache.data)
      return
    }
    let live = true
    apiFetch<{ data: AnnouncementView[] }>('/api/me/announcements')
      .then((r) => {
        cache = { at: Date.now(), data: r.data }
        if (live) setData(r.data)
      })
      .catch(() => {
        /* no banner is fine */
      })
    return () => {
      live = false
    }
  }, [])

  if (!dismissed || !data) return null
  const shown = data.filter((a) => !dismissed.includes(a.id))
  if (!shown.length) return null

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50)
    setDismissed(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* storage blocked: it comes back next visit */
    }
  }
  return (
    <div className={cn('mb-6 flex flex-col gap-2.5', className)}>
      {shown.map((a) => (
        <AnnouncementCard key={a.id} a={a} onDismiss={() => dismiss(a.id)} />
      ))}
    </div>
  )
}
