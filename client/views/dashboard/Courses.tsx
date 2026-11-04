'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Search, SearchX } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import {
  Button,
  Card,
  Chip,
  CoverTile,
  EmptyState,
  FilterChips,
  PageHeader,
  ProgressBar,
  Skeleton,
  btn,
  inputClass,
} from '@/components/kit'
import { fetchLearnerCourses } from '@/lib/api/lms'
import { COURSE_TOPICS, type CourseTopic } from '@/lib/api/redesign'
import { courseHref, topicIcon, type CourseListItem } from '@/components/learner/courseProgress'
import { cn } from '@/lib/utils'

const PAGE = 12
const HANA_AVATAR = '/images/redesign/hana-avatar.webp'
type Filter = 'all' | 'progress' | 'explore' | 'completed' | 'certificate' | CourseTopic

/** In progress first, then enrolled but not started, then the catalog, then finished. */
function rank(c: CourseListItem) {
  if (!c.isEnrolled) return 2
  if (c.progressPercentage >= 100) return 3
  return c.progressPercentage > 0 ? 0 : 1
}

function CourseCard({ c }: { c: CourseListItem }) {
  const pct = Math.round(c.progressPercentage)
  const units = c.unitCount ? `${c.unitCount} unit${c.unitCount === 1 ? '' : 's'}` : (c.category ?? c.difficulty)
  return (
    <Link href={courseHref(c.id)} className="group rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand">
      <Card interactive className="flex h-full flex-col overflow-hidden">
        <CoverTile src={c.cover} title={c.title} icon={topicIcon(c.category)} />
        <span className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
          <span className="text-[15px] font-semibold leading-snug text-ui-text">{c.title}</span>
          <span className="flex flex-wrap items-center gap-2 text-[13px] text-ui-muted">
            {units}
            {c.enableCertificate && <Chip>Certificate</Chip>}
            {!c.isEnrolled && (c.enrolledCount ?? 0) > 0 && (
              <span>
                {(c.enrolledCount ?? 0).toLocaleString()} learner{c.enrolledCount === 1 ? '' : 's'}
              </span>
            )}
          </span>
          {c.isEnrolled && (
            <span className="mt-auto flex items-center gap-2.5 pt-1">
              <ProgressBar value={pct} className="flex-1" label={`${c.title} progress`} />
              <span className="text-[13px] font-semibold tabular-nums text-ui-text">{pct >= 100 ? 'Done' : `${pct}%`}</span>
            </span>
          )}
        </span>
      </Card>
    </Link>
  )
}

export default function CoursesPage() {
  const [query, setQuery] = useState('')
  // Start with the search a link carried in (?q=).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')
    if (q) setQuery(q)
  }, [])
  const [filter, setFilter] = useState<Filter>('all')
  const [shown, setShown] = useState(PAGE)

  const { data: courses = [], isLoading, isError, refetch } = useQuery({ queryKey: ['learner-courses'], queryFn: fetchLearnerCourses })

  const counts = useMemo(
    () => ({
      progress: courses.filter((c) => c.isEnrolled && c.progressPercentage < 100).length,
      explore: courses.filter((c) => !c.isEnrolled).length,
      completed: courses.filter((c) => c.isEnrolled && c.progressPercentage >= 100).length,
      certificate: courses.filter((c) => c.enableCertificate).length,
    }),
    [courses],
  )
  // Only topics that have a course, so no filter ever opens on an empty list.
  const topics = useMemo(() => COURSE_TOPICS.filter((t) => courses.some((c) => c.category === t)), [courses])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return courses
      .filter((c) => !q || c.title.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q) || (c.category ?? '').toLowerCase().includes(q))
      .filter((c) => {
        if (filter === 'all') return true
        if (filter === 'progress') return c.isEnrolled && c.progressPercentage < 100
        if (filter === 'explore') return !c.isEnrolled
        if (filter === 'completed') return c.isEnrolled && c.progressPercentage >= 100
        if (filter === 'certificate') return c.enableCertificate
        return c.category === filter
      })
      .sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? b.progressPercentage - a.progressPercentage : 0))
  }, [courses, query, filter])

  const options: { value: Filter; label: string; count?: number }[] = [
    { value: 'all', label: 'All' },
    ...(counts.progress > 0 ? [{ value: 'progress' as Filter, label: 'In progress', count: counts.progress }] : []),
    ...(counts.explore > 0 ? [{ value: 'explore' as Filter, label: 'Explore', count: counts.explore }] : []),
    ...(counts.completed > 0 ? [{ value: 'completed' as Filter, label: 'Completed', count: counts.completed }] : []),
    ...(counts.certificate > 0 ? [{ value: 'certificate' as Filter, label: 'With certificate' }] : []),
    ...topics.map((t) => ({ value: t as Filter, label: t })),
  ]

  const visible = filtered.slice(0, shown)
  const more = filtered.length - visible.length

  return (
    <DashboardLayout>
      <PageHeader
        title="Courses"
        subtitle="Short courses for women entrepreneurs who want to start, grow and lead a business. Finish one to earn a certificate."
        actions={
          <div className="relative w-full sm:w-[340px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ui-muted" strokeWidth={1.75} aria-hidden />
            <label htmlFor="course-search" className="sr-only">
              Search courses
            </label>
            <input
              id="course-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShown(PAGE)
              }}
              placeholder="Search by course or skill"
              className={cn(inputClass, 'h-11 pl-10')}
            />
          </div>
        }
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
      />

      <section
        aria-labelledby="courses-hana"
        className="mb-6 flex flex-col gap-4 rounded-[14px] bg-ui-brand-soft p-4 sm:flex-row sm:items-center sm:px-5"
      >
        <div className="flex items-center gap-4">
          <img src={HANA_AVATAR} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover object-top" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="courses-hana" className="text-base font-semibold text-ui-text">
              Not sure where to start?
            </h2>
            <p className="text-sm text-ui-muted">Answer a few questions about your business and Hana suggests the courses to take first.</p>
          </div>
        </div>
        <Link href="/dashboard/assistant" className={cn(btn(), 'sm:ml-auto')}>
          Ask Hana
        </Link>
      </section>

      {options.length > 1 && (
        <FilterChips
          label="Filter courses"
          options={options}
          active={filter}
          onChange={(v) => {
            setFilter(v)
            setShown(PAGE)
          }}
          className="mb-5"
        />
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-[14px]" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title="Courses could not load"
            body="Something went wrong while loading the courses. Please try again."
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : courses.length === 0 ? (
        <Card>
          <EmptyState icon={SearchX} title="Courses are on their way" body="New courses are being prepared. Check back soon." />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title="No courses match"
            body={query ? `Nothing matches "${query.trim()}" with this filter.` : 'No courses in this filter yet.'}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('')
                  setFilter('all')
                }}
              >
                Show all courses
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <p className="sr-only" aria-live="polite">
            {filtered.length} courses shown
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((c) => (
              <CourseCard key={c.id} c={c} />
            ))}
          </div>
          {more > 0 && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" size="lg" onClick={() => setShown(filtered.length)}>
                Show {more} more course{more === 1 ? '' : 's'}
              </Button>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  )
}
