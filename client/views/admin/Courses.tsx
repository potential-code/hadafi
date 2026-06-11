'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Pencil,
  Trash2,
  Users,
  Clock,
  BookOpenCheck,
  CheckCircle2,
  PencilLine,
} from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { StatCard } from '@/components/dashboard/widgets/StatCard'
import { CourseDialog } from '@/components/admin/widgets/CourseDialog'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { fetchCourses, apiCreateCourse, apiDeleteCourse, apiUpdateCourse, type CourseSummary } from '@/lib/api/lms'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'

const SORT_OPTIONS = [
  { id: 'updated', label: 'Recently updated' },
  { id: 'enrolled', label: 'Most enrolled' },
  { id: 'title', label: 'Title A→Z' },
] as const

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['id']>('updated')
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all')

  useEffect(() => {
    fetchCourses()
      .then(setCourses)
      .catch(() => toast.error('Failed to load courses'))
      .finally(() => setLoadingCourses(false))
  }, [])

  if (loadingCourses) return <AdminLayout><div className="flex items-center justify-center h-64 text-brand-text-muted">Loading courses…</div></AdminLayout>

  const totalCount = courses.length
  const publishedCount = courses.filter((c) => c.status === 'published').length
  const draftCount = courses.filter((c) => c.status === 'draft').length

  const filtered = courses
    .filter((c) => statusFilter === 'all' || c.status === statusFilter)
    .filter((c) => (query ? c.title.toLowerCase().includes(query.toLowerCase()) : true))
    .sort((a, b) => {
      if (sort === 'enrolled') return b.enrolled - a.enrolled
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'updated') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      return 0
    })

  async function handleSave(data: Partial<CourseSummary>) {
    try {
      const created = await apiCreateCourse({ title: 'Untitled course', difficulty: 'Beginner', pointsPerUnit: 10, enableCertificate: true, status: 'draft', ...data })
      setCourses(cur => [created, ...cur])
      toast.success('Course created')
      setCreating(false)
    } catch { toast.error('Failed to create course') }
  }

  async function handleDelete(id: string) {
    try {
      await apiDeleteCourse(id)
      setCourses(cur => cur.filter(c => c.id !== id))
      toast.success('Course deleted')
    } catch { toast.error('Failed to delete course') }
    setConfirmDeleteId(null)
  }

  async function handleToggleStatus(courseId: string, checked: boolean) {
    const newStatus = checked ? 'published' : 'draft'
    const oldStatus = checked ? 'draft' : 'published'
    setPendingIds(prev => new Set(prev).add(courseId))
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, status: newStatus } : c))
    try {
      await apiUpdateCourse(courseId, { status: newStatus })
    } catch {
      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, status: oldStatus } : c))
      toast.error('Failed to update course status')
    } finally {
      setPendingIds(prev => { const s = new Set(prev); s.delete(courseId); return s })
    }
  }

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Library"
        title="Courses"
        highlight="creation"
        subtitle="Build, edit, and publish courses with modules, units, and learning blocks."
        actions={
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors shadow-lg"
          >
            <Plus className="w-4 h-4" />
            New course
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Total courses" value={totalCount} icon={<BookOpenCheck className="w-9 h-9" />} accent="bg-brand-primary" delay={0} />
        <StatCard label="Published" value={publishedCount} icon={<CheckCircle2 className="w-9 h-9" />} accent="bg-brand-violet" delay={0.05} />
        <StatCard label="Drafts" value={draftCount} icon={<PencilLine className="w-9 h-9" />} accent="bg-brand-primary-dark" delay={0.1} />
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses…"
              className="rounded-xl border border-brand-surface-2 bg-white pl-9 pr-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="admin-select-sm"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-xl border border-brand-surface-2 bg-white p-1 gap-0.5">
            {(['all', 'published', 'draft'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  'px-3 h-8 rounded-lg text-xs font-semibold capitalize transition-colors',
                  statusFilter === f
                    ? 'bg-brand-primary text-white'
                    : 'text-brand-text-muted hover:text-brand-primary hover:bg-brand-surface',
                )}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-xl border border-brand-surface-2 bg-white p-1">
            <button
              onClick={() => setView('grid')}
              className={cn('w-8 h-8 rounded-lg flex items-center justify-center', view === 'grid' ? 'bg-brand-primary text-white' : 'text-brand-text-muted hover:text-brand-primary')}
              aria-label="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('table')}
              className={cn('w-8 h-8 rounded-lg flex items-center justify-center', view === 'table' ? 'bg-brand-primary text-white' : 'text-brand-text-muted hover:text-brand-primary')}
              aria-label="Table view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-3xl border-2 border-dashed border-brand-surface-2 bg-white p-12 text-center"
          >
            <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-3">
              <BookOpenCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-brand-text-primary">No courses found</h3>
            <p className="mt-1 text-sm text-brand-text-muted">
              {query ? 'Try a different search.' : 'Create your first course to get started.'}
            </p>
            <button
              onClick={() => setCreating(true)}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              New course
            </button>
          </motion.div>
        ) : view === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filtered.map((c, i) => (
              <motion.article
                key={c.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.4 }}
                whileHover={{ y: -6 }}
                className="group relative overflow-hidden rounded-2xl bg-white border border-brand-surface-2 hover:border-brand-primary/40 hover:shadow-xl transition-all"
              >
                <Link href={`/admin/courses/${c.id}`} className="block">
                  <div className="relative aspect-[16/9] overflow-hidden">
                    {c.cover ? (
                      <img src={c.cover} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet flex items-center justify-center">
                        <BookOpenCheck className="w-10 h-10 text-white/70" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  </div>
                </Link>
                <div
                  className="absolute top-3 right-3 flex items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Switch
                    checked={c.status === 'published'}
                    onCheckedChange={(checked) => handleToggleStatus(c.id, checked)}
                    disabled={pendingIds.has(c.id)}
                    className="h-4 w-7 [&_span]:h-3 [&_span]:w-3 data-[state=checked]:bg-emerald-500"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white drop-shadow-sm">
                    {c.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-brand-text-primary leading-snug line-clamp-2">
                    {c.title}
                  </h3>
                  {c.description && (
                    <p className="mt-1 text-[11px] text-brand-text-muted line-clamp-2 leading-relaxed">
                      {c.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-brand-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {c.enrolled.toLocaleString()} enrolled
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-brand-surface-2 flex items-center justify-between">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-violet/10 text-brand-violet text-[10px] font-bold uppercase tracking-wider">
                      {c.difficulty}
                    </span>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/admin/courses/${c.id}`}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={() => setConfirmDeleteId(c.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="table"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-brand-surface-2 bg-white overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-surface text-left text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                  <tr>
                    <th className="px-4 py-3">Course</th>
                    <th className="px-4 py-3">Difficulty</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Enrolled</th>
                    <th className="px-4 py-3 text-right">Updated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.03 * i }}
                      className="border-b border-brand-surface-2/60 hover:bg-brand-surface/60 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link href={`/admin/courses/${c.id}`} className="flex items-center gap-3 group">
                          {c.cover ? (
                            <img src={c.cover} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet flex items-center justify-center flex-shrink-0">
                              <BookOpenCheck className="w-4 h-4 text-white/80" />
                            </div>
                          )}
                          <span className="font-bold text-brand-text-primary group-hover:text-brand-primary transition-colors">
                            {c.title}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-violet/10 text-brand-violet text-[10px] font-bold uppercase tracking-wider">
                          {c.difficulty}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={c.status === 'published'}
                            onCheckedChange={(checked) => handleToggleStatus(c.id, checked)}
                            disabled={pendingIds.has(c.id)}
                            className="h-4 w-7 [&_span]:h-3 [&_span]:w-3 data-[state=checked]:bg-emerald-500"
                          />
                          <span className={cn(
                            'text-xs font-medium',
                            c.status === 'published' ? 'text-emerald-600' : 'text-amber-600',
                          )}>
                            {c.status === 'published' ? 'Published' : 'Draft'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.enrolled.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-brand-text-muted">
                        {new Date(c.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/courses/${c.id}`}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => setConfirmDeleteId(c.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CourseDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSave={handleSave}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete course"
        message="This will permanently delete the course and all its content. This cannot be undone."
        confirmLabel="Delete course"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </AdminLayout>
  )
}

