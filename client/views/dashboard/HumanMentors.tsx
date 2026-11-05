'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, Check, Linkedin, Search, Star, Users } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { BookingPanel } from '@/components/mentor/BookingModal'
import type { BookingPanelMentor } from '@/components/mentor/BookingModal'
import { Avatar, Button, Card, Chip, EmptyState, FilterChips, PageHeader, Skeleton, btn, inputClass } from '@/components/kit'
import { getMentors } from '@/lib/api/sme'
import type { MentorUser } from '@/lib/api/sme'
import { cn } from '@/lib/utils'

const CATEGORIES = ['All', 'Leadership', 'Strategy', 'Marketing', 'Sales', 'Finance', 'Legal', 'Operations'] as const
type Category = (typeof CATEGORIES)[number]

const TAG_TO_CATEGORY: Record<string, Category> = {
  // Leadership
  'leadership': 'Leadership',
  'team building': 'Leadership',
  // Strategy
  'strategy': 'Strategy',
  'business development': 'Strategy',
  'business transformation': 'Strategy',
  'product development': 'Strategy',
  'project management': 'Strategy',
  // Marketing
  'marketing': 'Marketing',
  'social media': 'Marketing',
  'pr': 'Marketing',
  'branding': 'Marketing',
  'communication': 'Marketing',
  'communications': 'Marketing',
  'commmunications': 'Marketing',
  'digital marketing and social media': 'Marketing',
  // Sales
  'sales': 'Sales',
  // Finance
  'finance': 'Finance',
  'financials': 'Finance',
  'accounting': 'Finance',
  'auditing': 'Finance',
  'tax': 'Finance',
  'insurance': 'Finance',
  'finance and accounting': 'Finance',
  // Legal
  'legal': 'Legal',
  'partnerships': 'Legal',
  'company setup': 'Legal',
  // Operations
  'ict': 'Operations',
  'design thinking': 'Operations',
  'hr and l&d': 'Operations',
  'csr and corporate affairs': 'Operations',
}

function getCategories(expertise: string[]): Category[] {
  const cats = new Set<Category>()
  for (const tag of expertise) {
    const cat = TAG_TO_CATEGORY[tag.toLowerCase().trim()]
    if (cat) cats.add(cat)
  }
  return Array.from(cats)
}

interface DisplayMentor extends BookingPanelMentor {
  specialty: string
  categories: Category[]
}

function toDisplayMentor(m: MentorUser): DisplayMentor {
  const tags = m.expertise ?? []
  return {
    userId: m.id,
    name: m.fullName,
    avatarUrl: m.avatarUrl,
    linkedinUrl: m.linkedinUrl,
    featured: tags.some((e) => /^featured$/i.test(e)),
    expertise: tags,
    specialty: m.bio ?? 'Mentor',
    categories: getCategories(tags),
  }
}

export default function HumanMentorsPage() {
  const [cat, setCat] = useState<Category>('All')
  const [q, setQ] = useState('')
  const [mentors, setMentors] = useState<DisplayMentor[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getMentors()
      .then((users) => {
        const list = users.map(toDisplayMentor).sort((a, b) => a.name.localeCompare(b.name))
        setMentors(list)
        // A deep link (?mentor=<id>, e.g. "Book" from an AI mentor chat) opens
        // that mentor; otherwise open a featured mentor so booking is visible.
        const wanted = new URLSearchParams(window.location.search).get('mentor')
        const linked = wanted ? list.find((m) => m.userId === wanted) : undefined
        if (linked) choose(linked.userId)
        else setSelectedId((list.find((m) => m.featured) ?? list[0])?.userId ?? null)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoaded(true))
  }, [])

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: mentors.length }
    for (const m of mentors) for (const k of m.categories) c[k] = (c[k] ?? 0) + 1
    return c
  }, [mentors])

  const query = q.trim().toLowerCase()
  const filtered = mentors.filter((m) => {
    if (cat !== 'All' && !m.categories.includes(cat)) return false
    if (query && !`${m.name} ${m.specialty} ${m.expertise.join(' ')}`.toLowerCase().includes(query)) return false
    return true
  })
  const selected = mentors.find((m) => m.userId === selectedId) ?? null

  function choose(id: string) {
    setSelectedId(id)
    // Below xl the panel sits above the list: bring it into view.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Human Mentors"
        subtitle="Verified business mentors from across the world. One-on-one sessions, free for Hadafi members."
        className="mb-5 [&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <div className="relative w-full sm:w-[300px]">
            <label htmlFor="hm-search" className="sr-only">
              Search mentors
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" aria-hidden />
            <input
              id="hm-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or expertise"
              className={cn(inputClass, 'h-[42px] pl-9')}
            />
          </div>
        }
      />

      <FilterChips<Category>
        label="Filter by expertise"
        options={CATEGORIES.map((c) => ({ value: c, label: c, count: loaded ? counts[c] ?? 0 : undefined }))}
        active={cat}
        onChange={setCat}
        className="mb-[22px] lg:flex-wrap"
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <h2 className="text-base font-semibold text-ui-text">
              {loaded ? `${filtered.length} ${filtered.length === 1 ? 'mentor' : 'mentors'}` : 'Mentors'}
            </h2>
            <span className="text-[13px] text-ui-muted">Featured mentors are marked</span>
          </div>

          {!loaded ? (
            <ul aria-busy="true" aria-label="Loading mentors">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="flex items-center gap-4 border-t border-ui-line px-4 py-4">
                  <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                  </div>
                  <Skeleton className="h-9 w-20" />
                </li>
              ))}
            </ul>
          ) : failed ? (
            <EmptyState
              icon={Users}
              title="Mentors could not load"
              body="Something went wrong while loading the mentor list. Refresh the page to try again."
              className="border-t border-ui-line"
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Search}
              title={mentors.length === 0 ? 'No mentors available yet' : 'No mentors match'}
              body={
                mentors.length === 0
                  ? 'Mentors will appear here as soon as they join the program.'
                  : 'Try another expertise or a different search.'
              }
              action={
                mentors.length > 0 ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQ('')
                      setCat('All')
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
              className="border-t border-ui-line"
            />
          ) : (
            <ul>
              {filtered.map((m) => {
                const on = m.userId === selectedId
                return (
                  <li
                    key={m.userId}
                    aria-current={on ? 'true' : undefined}
                    className={cn(
                      'grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3.5 border-t border-ui-line px-3 py-4 sm:gap-4 sm:px-4',
                      on && 'bg-ui-brand-soft',
                    )}
                  >
                    <Avatar name={m.name} src={m.avatarUrl} size={72} className="object-[50%_20%] ring-1 ring-ui-line" />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[15px] font-semibold text-ui-text">{m.name}</span>
                        {m.featured && (
                          <Chip tone="brand" className="h-[22px]">
                            <Star className="h-3 w-3" strokeWidth={2} aria-hidden />
                            Featured
                          </Chip>
                        )}
                      </span>
                      <span className="text-sm text-ui-muted">{m.specialty}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {m.categories[0] && (
                        <Chip className="hidden font-medium md:inline-flex">{m.categories[0]}</Chip>
                      )}
                      {m.linkedinUrl && (
                        <a
                          href={m.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${m.name} on LinkedIn`}
                          className={cn(btn({ variant: 'secondary', size: 'icon-sm' }), 'hidden h-9 w-9 md:inline-flex')}
                        >
                          <Linkedin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        </a>
                      )}
                      <Button
                        variant="secondary"
                        aria-pressed={on}
                        aria-label={on ? `${m.name} selected` : `Book ${m.name}`}
                        onClick={() => choose(m.userId)}
                        className={cn('h-9 px-3.5', on && 'border-ui-brand text-ui-brand-text')}
                      >
                        {on ? <Check className="h-4 w-4" aria-hidden /> : <Calendar className="h-4 w-4" aria-hidden />}
                        {on ? 'Selected' : 'Book'}
                      </Button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {(selected || !loaded) && (
          <div ref={panelRef} className="order-first scroll-mt-20 xl:sticky xl:top-6 xl:order-none">
            {selected ? (
              <BookingPanel mentor={selected} />
            ) : (
              <Card className="flex flex-col gap-4 p-5" aria-hidden>
                <div className="flex items-center gap-3.5">
                  <Skeleton className="h-14 w-14 rounded-full" />
                  <Skeleton className="h-5 w-40" />
                </div>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-full" />
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
