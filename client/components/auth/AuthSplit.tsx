'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { REDESIGN_ASSETS } from '@/lib/constants'
import { LEGAL_LINKS } from '@/components/landing/legal'
import { countText, usePublicCounts, type PublicCounts } from '@/components/landing/publicData'
import { cn } from '@/lib/utils'

/**
 * Public auth screens (sign in, sign up, mentor setup), as SMEEP's AuthSplit:
 * the form pane on the left and a dark Hadafi panel on the right (hidden
 * below 900px). The form pane uses the theme tokens, so it reads in light and
 * dark alike.
 */
export function AuthSplit({
  topPrompt,
  aside,
  asideLabel,
  asideLabelledBy,
  children,
  width = 400,
}: {
  topPrompt: { text: string; ctaLabel: string; ctaHref: string }
  aside: ReactNode
  asideLabel?: string
  asideLabelledBy?: string
  children: ReactNode
  width?: number
}) {
  const year = new Date().getFullYear()
  return (
    <div className="grid min-h-dvh grid-cols-1 bg-ui-surface text-ui-text min-[900px]:grid-cols-2">
      <div className="flex min-w-0 flex-col bg-ui-surface px-4 pb-8 pt-4 min-[900px]:px-12 min-[900px]:py-6">
        <div className="flex h-11 items-center gap-3">
          <Link href="/" aria-label="Hadafi home" className="inline-flex shrink-0 rounded-md">
            <img src={REDESIGN_ASSETS.logo.src} alt={REDESIGN_ASSETS.logo.alt} className="h-8 w-auto dark:brightness-0 dark:invert" />
          </Link>
          <span className="flex-1" />
          <span className="text-right text-sm text-ui-muted">
            <span className="max-[420px]:hidden">{topPrompt.text} </span>
            <Link href={topPrompt.ctaHref} className="font-semibold text-ui-brand-text hover:underline">
              {topPrompt.ctaLabel}
            </Link>
          </span>
        </div>

        <main className="flex flex-1 items-center justify-center py-8 min-[900px]:py-10">
          <div className="flex w-full min-w-0 flex-col gap-6" style={{ maxWidth: width }}>
            {children}
          </div>
        </main>

        <div className="flex flex-wrap gap-4 text-[13px] text-ui-muted">
          <span>Potential © 2005-{year}</span>
          <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="hover:text-ui-text">
            Privacy Policy
          </a>
          <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="hover:text-ui-text">
            Terms of Use
          </a>
        </div>
      </div>

      <aside
        aria-label={asideLabel}
        aria-labelledby={asideLabelledBy}
        className="relative m-3 hidden flex-col gap-7 overflow-hidden rounded-[14px] bg-brand-deep p-11 text-white min-[900px]:flex"
      >
        {aside}
      </aside>
    </div>
  )
}

/** Page title block above an auth form. */
export function AuthHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
        {title}
      </h1>
      {subtitle && <p className="text-[15px] text-ui-muted">{subtitle}</p>}
    </div>
  )
}

/** Muted copy on the dark panel. */
export const asideMuted = 'text-white/[0.74]'

/** Hadafi's light magenta, for icons on the dark panel. */
export const asideAccent = 'text-[#F39CC5]'

export function AsideChecklist({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn('flex flex-col gap-3 text-[15px]', className)}>
      {items.map((t) => (
        <li key={t} className="flex items-center gap-2.5">
          <Check className={cn('h-[18px] w-[18px] shrink-0', asideAccent)} aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  )
}

/** Hana speech bubble on the dark panel. */
export function AsideHana({ children, size = 48 }: { children: ReactNode; size?: number }) {
  return (
    <div className="flex items-start gap-3">
      <img
        src="/images/redesign/hana-avatar.webp"
        alt="Hana"
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover object-top shadow-[0_0_0_3px_rgba(243,156,197,.35)]"
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Hana</span>
        <p className="rounded-[4px_16px_16px_16px] border border-white/[0.12] bg-white/[0.08] px-3.5 py-3 text-[15px] leading-[1.55]">
          {children}
        </p>
      </div>
    </div>
  )
}

// Only figures read live from the database (GET /api/public/counts), plus
// "Free", which is a fact of the program. No reach or country claims.
const LIVE_STATS: { key: keyof PublicCounts; label: string }[] = [
  { key: 'courses', label: 'Free courses' },
  { key: 'aiMentors', label: 'AI mentors, 24/7' },
]

export function AsideStats() {
  const { counts } = usePublicCounts()
  const stats = [
    ...LIVE_STATS.flatMap((s) => {
      const value = counts ? countText(counts[s.key]) : null
      return value ? [{ value, label: s.label }] : []
    }),
    { value: 'Free', label: 'To join, no card needed' },
  ]
  return (
    <dl className="mt-2 flex gap-7 border-t border-white/[0.14] pt-[18px]">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col-reverse gap-0.5">
          <dt className={cn('text-[13px]', asideMuted)}>{s.label}</dt>
          <dd className="text-xl font-bold">{s.value}</dd>
        </div>
      ))}
    </dl>
  )
}
