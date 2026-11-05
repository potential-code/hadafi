'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Play, Sparkles } from 'lucide-react'
import { btn, Card, FilterChips, Skeleton } from '@/components/kit'
import { COURSES } from '@/lib/constants'
import { optimizedSrc } from '@/lib/images'
import { cn } from '@/lib/utils'
import { countText, fetchCoursePicks, usePublicCounts, type CoursePick } from './publicData'

/** Banner art for each track card. */
const TRACK_ART: Record<string, string> = {
  'Transform with AI': '/images/courses/ai-for-growth-the-practical-sme-guide.webp',
  'Hadafi Business Model': '/images/courses/web-presence-checklist.webp',
  'Additional Courses': '/images/courses/managing-your-cash-flow.webp',
}

const RESOURCE_PARTNERS = ['AWS', 'Cisco', 'Potential']

export function LandingCourses() {
  const [active, setActive] = useState<string>(COURSES.categories[0].name)
  const category = COURSES.categories.find((c) => c.name === active) ?? COURSES.categories[0]
  const { counts } = usePublicCounts()
  const total = countText(counts?.courses)
  const [picks, setPicks] = useState<CoursePick[] | null>(null)

  useEffect(() => {
    fetchCoursePicks()
      .then(setPicks)
      .catch(() => setPicks([]))
  }, [])

  return (
    <section id="courses" aria-labelledby="h-courses" className="scroll-mt-[68px] pb-9 pt-2">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[22px] px-4 min-[900px]:px-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 id="h-courses" className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
              The Entrepreneur&apos;s Journey
            </h2>
            <p className="text-base leading-[1.55] text-ui-muted">
              Short courses with a final exam and certificate. Learn at your own pace, in your language.
            </p>
          </div>
          <FilterChips
            label="Course tracks"
            active={active}
            onChange={setActive}
            className="max-w-full"
            options={COURSES.categories.map((c) => ({ value: c.name, label: c.name }))}
          />
        </div>

        <div className="grid grid-cols-1 items-stretch gap-5 min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <TrackCard key={category.name} category={category} />

          <div className="flex min-w-0 flex-col gap-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ui-muted">More courses</span>
              <Link href="/sign-up" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ui-brand-text hover:underline">
                {total ? `Browse all ${total} courses` : 'Browse all courses'}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            {picks === null ? (
              <div className="grid flex-1 grid-cols-2 gap-3 min-[700px]:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[16/13] rounded-[14px]" />
                ))}
              </div>
            ) : picks.length > 0 ? (
              <div className="grid flex-1 grid-cols-2 gap-3 min-[700px]:grid-cols-3">
                {picks.map((c) => (
                  <Link
                    key={c.id}
                    href="/sign-up"
                    className="group flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface text-ui-text transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-ui"
                  >
                    <span className="block aspect-[16/10] overflow-hidden bg-ui-surface-2">
                      <img
                        src={optimizedSrc(c.cover) ?? undefined}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    </span>
                    <span className="flex flex-col gap-0.5 px-3.5 py-2.5">
                      <span className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{c.title}</span>
                      <span className="text-[13px] text-ui-muted">
                        {c.units} {c.units === 1 ? 'unit' : 'units'}, certificate
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
            <div
              id="additional-resources"
              className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-3.5"
            >
              <span className="text-[13px] font-semibold text-ui-muted">Additional resources from</span>
              <ul aria-label="Resource partners" className="flex flex-wrap gap-x-[22px] gap-y-2 text-[15px] font-semibold text-ui-muted">
                {RESOURCE_PARTNERS.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

type Category = (typeof COURSES.categories)[number]

/** The active track. One-course tracks list their units; multi-course tracks expand per course. */
function TrackCard({ category }: { category: Category }) {
  const single = category.modules.length === 1
  const [open, setOpen] = useState<number | null>(0)
  const title = single ? category.modules[0].title : category.name

  return (
    <Card className="flex min-w-0 flex-col overflow-hidden shadow-ui" aria-labelledby="h-track">
      <div className="relative h-[168px] overflow-hidden bg-[#4c1d6e]">
        {TRACK_ART[category.name] && (
          <img src={TRACK_ART[category.name]} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#2a0f22] via-[#2a0f22]/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-[22px] text-[#fbe3ef]">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.16] backdrop-blur-sm">
            <Sparkles className="h-[22px] w-[22px]" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 id="h-track" className="text-lg font-semibold leading-snug text-white">
              {title}
            </h3>
            <span className="text-[13px]">{single ? 'Final exam and certificate' : 'Short courses with certificates'}</span>
          </div>
        </div>
      </div>

      {single ? (
        <ol className="flex flex-1 flex-col px-[22px] py-2">
          {category.modules[0].units.map((u, i) => (
            <li key={u} className={cn('flex items-center gap-3 py-2 text-sm text-ui-text', i > 0 && 'border-t border-ui-line')}>
              <Play className="h-4 w-4 shrink-0 text-ui-muted" aria-hidden />
              {u.replace(' - ', ': ')}
            </li>
          ))}
        </ol>
      ) : (
        <ul className="flex flex-1 flex-col px-[22px] py-2">
          {category.modules.map((m, mi) => {
            const isOpen = open === mi
            const panelId = `track-mod-${mi}`
            return (
              <li key={m.title} className={cn(mi > 0 && 'border-t border-ui-line')}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : mi)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm font-semibold text-ui-text"
                >
                  <span className="min-w-0">{m.title}</span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-ui-muted transition-transform', isOpen && 'rotate-180')} aria-hidden />
                </button>
                {isOpen && (
                  <ol id={panelId} className="mb-2 flex flex-col">
                    {m.units.map((u) => (
                      <li key={u} className="flex items-center gap-3 py-1.5 pl-1 text-sm text-ui-muted">
                        <Play className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {u.replace(' - ', ': ')}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="px-[22px] pb-[22px] pt-2">
        <Link href="/sign-up" className={cn(btn(), 'w-full')}>
          {single ? 'Start this course free' : 'Start this track free'}
        </Link>
      </div>
    </Card>
  )
}
