'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Award,
  BookOpen,
  BookOpenCheck,
  CircleCheck,
  LayoutGrid,
  List,
  Pencil,
  PencilLine,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { CourseDialog, type CourseFormData } from '@/components/admin/widgets/CourseDialog'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { Button, Card, CoverTile, EmptyState, PageHeader, Skeleton, btn } from '@/components/kit'
import {
  IconButton,
  SearchInput,
  Segmented,
  Select,
  Switch,
  TableCard,
  Tag,
  adminTableClass,
  fmtDate,
} from '@/components/admin/ui'
import { CourseThumb } from '@/components/admin/lms/CourseThumb'
import { fetchCourses, apiCreateCourse, apiDeleteCourse, apiUpdateCourse, type CourseSummary } from '@/lib/api/lms'
import type { CourseTopic } from '@/lib/api/redesign'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/components/admin/lms/shared'

/** Course rows carry the topic (`category`). */
type CourseRow = CourseSummary & { category?: CourseTopic | null }

const SORT_OPTIONS = [
  { id: 'updated', label: 'Recently updated' },
  { id: 'enrolled', label: 'Most enrolled' },
  { id: 'title', label: 'Title A to Z' },
] as const
type SortId = (typeof SORT_OPTIONS)[number]['id']
type StatusFilter = 'all' | 'published' | 'draft'

const PAGE_SIZE = 15

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [view, setView] = useState<'grid' | 'table'>('table')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortId>('enrolled')
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)

  function load() {
    setLoadingCourses(true)
    setLoadError(false)
    fetchCourses()
      .then((rows) => setCourses(rows as CourseRow[]))
      .catch((e: unknown) => {
        setLoadError(true)
        toast.error(errorMessage(e))
      })
      .finally(() => setLoadingCourses(false))
  }

  useEffect(load, [])

  // Back to the first page whenever the visible set changes shape.
  useEffect(() => setPage(0), [query, sort, statusFilter])

  const totalCount = courses.length
  const publishedCount = courses.filter((c) => c.status === 'published').length
  const draftCount = courses.filter((c) => c.status === 'draft').length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return courses
      .filter((c) => statusFilter === 'all' || c.status === statusFilter)
      .filter((c) => (q ? c.title.toLowerCase().includes(q) || (c.category ?? '').toLowerCase().includes(q) : true))
      .sort((a, b) => {
        if (sort === 'enrolled') return b.enrolled - a.enrolled
        if (sort === 'title') return a.title.localeCompare(b.title)
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
  }, [courses, query, sort, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const deleting = courses.find((c) => c.id === confirmDeleteId)

  async function handleSave(data: CourseFormData) {
    try {
      const created = await apiCreateCourse({
        title: 'Untitled course',
        difficulty: 'Beginner',
        pointsPerUnit: 10,
        enableCertificate: true,
        status: 'draft',
        ...data,
      })
      setCourses((cur) => [created as CourseRow, ...cur])
      toast.success('Course created')
      setCreating(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiDeleteCourse(id)
      setCourses((cur) => cur.filter((c) => c.id !== id))
      toast.success('Course deleted')
    } catch (e) {
      toast.error(errorMessage(e))
    }
    setConfirmDeleteId(null)
  }

  async function handleToggleStatus(courseId: string, checked: boolean) {
    const newStatus = checked ? 'published' : 'draft'
    const oldStatus = checked ? 'draft' : 'published'
    setPendingIds((prev) => new Set(prev).add(courseId))
    setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, status: newStatus } : c)))
    try {
      await apiUpdateCourse(courseId, { status: newStatus })
    } catch (e) {
      setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, status: oldStatus } : c)))
      toast.error(errorMessage(e))
    } finally {
      setPendingIds((prev) => {
        const s = new Set(prev)
        s.delete(courseId)
        return s
      })
    }
  }

  const header = (
    <PageHeader
      title="Course Creation"
      subtitle="Build, edit and publish courses with modules, units and learning blocks."
      actions={
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New course
        </Button>
      }
      className="mb-0 max-md:flex-col max-md:items-start"
    />
  )

  if (loadingCourses) {
    return (
      <AdminLayout>
        <div className="flex flex-col gap-5">
          {header}
          <Skeleton className="h-[106px] rounded-[14px]" />
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-[520px] rounded-[14px]" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        {header}

        {/* Stats */}
        <Card className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-3">
          <Stat icon={BookOpenCheck} label="Total courses" value={totalCount} />
          <Stat
            icon={CircleCheck}
            label="Published"
            value={publishedCount}
            className="border-t border-ui-line sm:border-l sm:border-t-0"
          />
          <Stat
            icon={PencilLine}
            label="Drafts"
            value={draftCount}
            muted={draftCount === 0}
            hint={draftCount === 0 ? 'Nothing waiting to be published' : `${draftCount} waiting to be published`}
            className="border-t border-ui-line sm:border-l sm:border-t-0"
          />
        </Card>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Segmented<StatusFilter>
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: `All ${totalCount}` },
                { value: 'published', label: `Published ${publishedCount}` },
                { value: 'draft', label: `Draft ${draftCount}` },
              ]}
            />
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search courses"
              className="w-full sm:w-[260px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label>
              <span className="sr-only">Sort courses</span>
              <Select value={sort} onChange={(e) => setSort(e.target.value as SortId)} className="w-[150px]">
                {SORT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </label>
            <Segmented<'grid' | 'table'>
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', icon: LayoutGrid, label: <span className="sr-only">Grid view</span> },
                { value: 'table', icon: List, label: <span className="sr-only">Table view</span> },
              ]}
            />
          </div>
        </div>

        {loadError ? (
          <Card>
            <EmptyState
              icon={BookOpen}
              title="Courses could not be loaded"
              body="Check your connection and try again."
              action={
                <Button variant="secondary" size="sm" onClick={load}>
                  Try again
                </Button>
              }
            />
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon={BookOpenCheck}
              title="No courses found"
              body={
                query
                  ? 'Try a different search.'
                  : statusFilter !== 'all'
                    ? `There are no ${statusFilter === 'draft' ? 'draft' : 'published'} courses.`
                    : 'Create your first course to get started.'
              }
              action={
                !query && statusFilter === 'all' ? (
                  <Button size="sm" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" aria-hidden />
                    New course
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : view === 'grid' ? (
          <section aria-label="Courses" className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {pageRows.map((c) => (
                <Card key={c.id} interactive className="flex flex-col overflow-hidden">
                  <Link href={`/admin/courses/${c.id}`} className="block" tabIndex={-1} aria-hidden>
                    <CoverTile src={c.cover} title={c.title} icon={BookOpen} />
                  </Link>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/courses/${c.id}`}
                        className="line-clamp-2 font-semibold text-ui-text hover:text-ui-brand-text"
                      >
                        {c.title}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-ui-muted">{c.category ?? 'No topic'}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ui-muted">
                      <Tag>{c.difficulty}</Tag>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        {c.enrolled.toLocaleString()} enrolled
                      </span>
                      <span>Updated {fmtDate(c.updatedAt)}</span>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-ui-line pt-3">
                      <StatusToggle course={c} pending={pendingIds.has(c.id)} onToggle={handleToggleStatus} />
                      <RowActions course={c} onDelete={() => setConfirmDeleteId(c.id)} />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <Pager
              total={filtered.length}
              page={safePage}
              pageCount={pageCount}
              onPage={setPage}
              className="rounded-[14px] border border-ui-line bg-ui-surface px-5 py-2.5"
            />
          </section>
        ) : (
          <section aria-label="Courses">
            <TableCard
              footer={<Pager total={filtered.length} page={safePage} pageCount={pageCount} onPage={setPage} />}
              className="[&>div:last-child]:py-2.5"
            >
              <table className={cn(adminTableClass, 'min-w-[760px]')}>
                <thead>
                  <tr>
                    <th scope="col">Course</th>
                    <th scope="col">Difficulty</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="max-[1240px]:hidden">
                      Certificate
                    </th>
                    <th scope="col" className="!text-right" aria-sort={sort === 'enrolled' ? 'descending' : undefined}>
                      Enrolled
                    </th>
                    <th scope="col" className="!text-right" aria-sort={sort === 'updated' ? 'descending' : undefined}>
                      Updated
                    </th>
                    <th scope="col" className="!text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/admin/courses/${c.id}`} className="group flex min-w-0 items-center gap-3">
                          <CourseThumb src={c.cover} title={c.title} />
                          <span className="flex min-w-0 flex-col">
                            <span className="whitespace-nowrap font-semibold text-ui-text group-hover:text-ui-brand-text">
                              {c.title}
                            </span>
                            <span className="text-xs text-ui-muted">{c.category ?? 'No topic'}</span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <Tag>{c.difficulty}</Tag>
                      </td>
                      <td>
                        <StatusToggle course={c} pending={pendingIds.has(c.id)} onToggle={handleToggleStatus} />
                      </td>
                      <td className="text-ui-muted max-[1240px]:hidden">
                        <span className="inline-flex items-center gap-1.5">
                          <Award className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          {c.enableCertificate ? 'On' : 'Off'}
                        </span>
                      </td>
                      <td className="text-right tabular-nums text-ui-text">{c.enrolled.toLocaleString()}</td>
                      <td className="whitespace-nowrap text-right tabular-nums text-ui-muted">{fmtDate(c.updatedAt)}</td>
                      <td>
                        <RowActions course={c} onDelete={() => setConfirmDeleteId(c.id)} className="justify-end" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          </section>
        )}
      </div>

      <CourseDialog open={creating} onClose={() => setCreating(false)} onSave={handleSave} />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete course"
        message={`This will permanently delete ${deleting ? `"${deleting.title}"` : 'the course'} and all its content. This cannot be undone.`}
        confirmLabel="Delete course"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </AdminLayout>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  muted,
  className,
}: {
  icon: typeof BookOpen
  label: string
  value: number
  hint?: string
  muted?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5 px-[18px] py-4', className)}>
      <span className="flex items-center gap-2 text-[13px] font-medium text-ui-muted">
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {label}
      </span>
      <span
        className={cn(
          'text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums',
          muted ? 'text-ui-muted' : 'text-ui-text',
        )}
      >
        {value}
      </span>
      {hint && <span className="hidden text-xs text-ui-muted sm:block">{hint}</span>}
    </div>
  )
}

function StatusToggle({
  course,
  pending,
  onToggle,
}: {
  course: CourseRow
  pending: boolean
  onToggle: (id: string, checked: boolean) => void
}) {
  const published = course.status === 'published'
  return (
    <span className="inline-flex items-center gap-2">
      <Switch
        checked={published}
        disabled={pending}
        onChange={(v) => onToggle(course.id, v)}
        label={published ? `Published, switch ${course.title} to draft` : `Draft, publish ${course.title}`}
      />
      <span className={cn('text-[13px] font-medium', published ? 'text-ui-text' : 'text-ui-muted')}>
        {published ? 'Published' : 'Draft'}
      </span>
    </span>
  )
}

function RowActions({ course, onDelete, className }: { course: CourseRow; onDelete: () => void; className?: string }) {
  return (
    <span className={cn('flex items-center gap-0.5', className)}>
      <Link
        href={`/admin/courses/${course.id}`}
        aria-label={`Edit ${course.title}`}
        title={`Edit ${course.title}`}
        className={cn(btn({ variant: 'ghost', size: 'icon-sm' }), 'rounded-lg')}
      >
        <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </Link>
      <IconButton label={`Delete ${course.title}`} icon={Trash2} tone="danger" onClick={onDelete} />
    </span>
  )
}

function Pager({
  total,
  page,
  pageCount,
  onPage,
  className,
}: {
  total: number
  page: number
  pageCount: number
  onPage: (p: number) => void
  className?: string
}) {
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * PAGE_SIZE)
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 text-[13px] text-ui-muted', className)}>
      <span>
        Showing {from} to {to} of {total}
      </span>
      {pageCount > 1 && (
        <span className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <Button variant="secondary" size="sm" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </span>
      )}
    </div>
  )
}
