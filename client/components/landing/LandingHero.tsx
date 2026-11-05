'use client'

import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { btn, Skeleton } from '@/components/kit'
import { REDESIGN_ASSETS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { LandingRegistrationChat } from './LandingRegistrationChat'
import { countText, usePublicCounts, type PublicCounts } from './publicData'

const INCLUDED = [
  'Free courses and live events',
  'AI mentors and tools, 24/7',
  'Private 1:1 expert sessions',
  'Exclusive member offers',
]

/** Live figures only: each one comes from GET /api/public/counts. */
const STATS: { key: keyof PublicCounts; label: string }[] = [
  { key: 'courses', label: 'free courses' },
  { key: 'mentors', label: 'expert mentors' },
  { key: 'aiMentors', label: 'AI mentors, 24/7' },
  { key: 'offers', label: 'member offers' },
]

/** Hero with the About copy folded in, and Hana's sign-up chat. */
export function LandingHero() {
  return (
    <section id="about" aria-labelledby="h-hero" className="scroll-mt-[68px] pb-[52px] pt-8">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-y-8 px-4 min-[900px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] min-[900px]:gap-12 min-[900px]:px-10">
        <div className="flex min-w-0 flex-col gap-5">
          <h1
            id="h-hero"
            className="text-balance text-[34px] font-semibold leading-[1.06] tracking-[-0.035em] text-ui-text min-[900px]:text-[48px]"
          >
            Start and grow your business with Hadafi
          </h1>
          <p className="max-w-[640px] text-[17px] leading-[1.55] text-ui-muted">
            Hadafi is a free program for women entrepreneurs by Potential.org. Learn with free courses and AI tools,
            get guidance from AI and expert mentors, join live events and unlock member offers.
          </p>
          <ul
            aria-label="What the program includes"
            className="grid grid-cols-1 gap-x-7 gap-y-2.5 min-[521px]:grid-cols-[repeat(2,minmax(0,max-content))]"
          >
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm font-medium text-ui-text">
                <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ui-brand-soft text-ui-brand-text">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-1 flex flex-wrap gap-3">
            <Link href="/sign-up" className={cn(btn({ size: 'lg' }), 'h-[46px] max-[520px]:flex-1')}>
              Sign up free
              <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
            </Link>
            <Link href="/login" className={cn(btn({ variant: 'secondary', size: 'lg' }), 'h-[46px] max-[520px]:flex-1')}>
              Log in
            </Link>
          </div>
          <HeroStats />
        </div>

        <div className="relative min-w-0">
          <img
            src={REDESIGN_ASSETS.hero.src}
            alt="Women entrepreneurs talking together in a Hadafi office"
            width={1200}
            height={655}
            fetchPriority="high"
            className="block h-[220px] w-full rounded-[14px] object-cover min-[900px]:h-[280px]"
          />
          {/* Hana's sign-up chat, as it is; it fills a sized, positioned box. The chat is styled as
              dark glass (white text), so the box gives it a solid dark surface in both themes. */}
          <div className="relative mx-3 -mt-14 h-[480px] overflow-hidden rounded-2xl bg-[linear-gradient(160deg,#2b0c1f_0%,#170811_100%)] shadow-[0_2px_4px_rgba(23,23,28,.06),0_18px_48px_rgba(23,23,28,.16)] min-[900px]:mx-6 min-[900px]:-mt-20 min-[900px]:h-[460px]">
            <LandingRegistrationChat />
          </div>
        </div>
      </div>
    </section>
  )
}

/** Dividers only where the stats sit in one row (the grid stacks them two by two). */
const ROW_DIVIDER =
  'min-[1100px]:ml-5 min-[1100px]:border-l min-[1100px]:border-ui-line min-[1100px]:pl-5 min-[640px]:max-[899px]:ml-6 min-[640px]:max-[899px]:border-l min-[640px]:max-[899px]:border-ui-line min-[640px]:max-[899px]:pl-6'

function HeroStats() {
  const { counts, failed } = usePublicCounts()
  if (failed) return null
  const shown = counts ? STATS.filter((s) => countText(counts[s.key]) !== null) : STATS
  if (counts && shown.length === 0) return null
  return (
    <dl className="mt-2 grid grid-cols-2 gap-y-4 border-t border-ui-line pt-5 min-[1100px]:flex min-[640px]:max-[899px]:flex">
      {shown.map((s, i) => (
        <div
          key={s.key}
          className={cn(
            'flex flex-col-reverse gap-0.5',
            i > 0 && ROW_DIVIDER,
          )}
        >
          <dt className="text-[13px] text-ui-muted">{s.label}</dt>
          <dd className="text-2xl font-bold tracking-[-0.02em] text-ui-text tabular-nums">
            {counts ? countText(counts[s.key]) : <Skeleton className="h-8 w-12" />}
          </dd>
        </div>
      ))}
    </dl>
  )
}
