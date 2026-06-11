'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays,
  Search,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Link,
  PlayCircle,
  Plus,
  CalendarCheck,
  CalendarClock,
} from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { StatCard } from '@/components/dashboard/widgets/StatCard'
import { LiveEventDialog } from '@/components/admin/widgets/LiveEventDialog'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import {
  fetchAdminEvents,
  apiCreateEvent,
  apiUpdateEvent,
  apiDeleteEvent,
  type LiveEvent,
} from '@/lib/api/liveEvents'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'published' | 'draft' | 'upcoming' | 'past'

const FILTER_TABS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Draft' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
]

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  const d = new Date(`${year}-${month}-${day}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

export default function LiveEventsAdmin() {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LiveEvent | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    fetchAdminEvents()
      .then(setEvents)
      .catch(() => toast.error('Failed to load events'))
      .finally(() => setLoading(false))
  }, [])

  const today = new Date().toISOString().split('T')[0]!

  const filtered = events
    .filter((e) => {
      if (filter === 'published') return e.status === 'published'
      if (filter === 'draft') return e.status === 'draft'
      if (filter === 'upcoming') return e.date >= today && e.status === 'published'
      if (filter === 'past') return e.date < today
      return true
    })
    .filter((e) => !query || e.title.toLowerCase().includes(query.toLowerCase()))

  // Stats
  const totalCount = events.length
  const publishedCount = events.filter((e) => e.status === 'published').length
  const upcomingCount = events.filter((e) => e.date >= today && e.status === 'published').length
  const pastCount = events.filter((e) => e.date < today).length

  async function handleToggleStatus(event: LiveEvent) {
    const newStatus = event.status === 'published' ? 'draft' : 'published'
    try {
      await apiUpdateEvent(event.id, { status: newStatus })
      setEvents((cur) => cur.map((e) => (e.id === event.id ? { ...e, status: newStatus } : e)))
      toast.success(`Event ${newStatus === 'published' ? 'published' : 'moved to draft'}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  async function handleSave(data: Partial<LiveEvent>) {
    try {
      if (editing) {
        const updated = await apiUpdateEvent(editing.id, data)
        setEvents((cur) => cur.map((e) => (e.id === editing.id ? updated : e)))
        toast.success('Event updated')
      } else {
        const created = await apiCreateEvent(data)
        setEvents((cur) => [created, ...cur])
        toast.success('Event created')
      }
      setDialogOpen(false)
      setEditing(null)
    } catch (err: unknown) {
      const e = err as { error?: { code?: string } }
      if (e?.error?.code === 'VALIDATION_ERROR') throw err  // let dialog show inline errors
      toast.error('Failed to save event')
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiDeleteEvent(id)
      setEvents((cur) => cur.filter((e) => e.id !== id))
      toast.success('Event deleted')
    } catch {
      toast.error('Failed to delete event')
    }
    setConfirmDeleteId(null)
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64 text-brand-text-muted">
          Loading events…
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Live Events"
        title="Events &"
        highlight="sessions"
        subtitle="Manage webinars, workshops and live sessions for SMEs."
        actions={
          <button
            onClick={() => { setEditing(null); setDialogOpen(true) }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors shadow-lg"
          >
            <Plus className="w-4 h-4" />
            New Event
          </button>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total events" value={totalCount} icon={<CalendarDays className="w-9 h-9" />} accent="bg-brand-primary" delay={0} />
        <StatCard label="Published" value={publishedCount} icon={<CalendarCheck className="w-9 h-9" />} accent="bg-brand-violet" delay={0.05} />
        <StatCard label="Upcoming" value={upcomingCount} icon={<CalendarClock className="w-9 h-9" />} accent="bg-brand-primary-dark" delay={0.1} />
        <StatCard label="Past" value={pastCount} icon={<PlayCircle className="w-9 h-9" />} accent="bg-brand-primary" delay={0.15} />
      </div>

      {/* Search bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events…"
            className="rounded-xl border border-brand-surface-2 bg-white pl-9 pr-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors',
              filter === tab.id
                ? 'bg-brand-primary text-white shadow-sm'
                : 'bg-white border border-brand-surface-2 text-brand-text-muted hover:text-brand-text-primary hover:border-brand-primary/30',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table / Empty state */}
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
              <CalendarDays className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-brand-text-primary">No events found</h3>
            <p className="mt-1 text-sm text-brand-text-muted">
              {query ? 'Try a different search.' : 'Create your first event to get started.'}
            </p>
            <button
              onClick={() => { setEditing(null); setDialogOpen(true) }}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Event
            </button>
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
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Links</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => (
                    <motion.tr
                      key={e.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.03 * i }}
                      className="border-b border-brand-surface-2/60 hover:bg-brand-surface/60 transition-colors"
                    >
                      {/* Event title + cover thumbnail */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {e.coverImage ? (
                            <img
                              src={e.coverImage}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet flex items-center justify-center flex-shrink-0">
                              <CalendarDays className="w-3.5 h-3.5 text-white/80" />
                            </div>
                          )}
                          <span className="font-bold text-brand-text-primary line-clamp-1">
                            {e.title}
                          </span>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 tabular-nums text-brand-text-muted whitespace-nowrap">
                        {formatDate(e.date)}
                      </td>

                      {/* Type badge */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-violet/10 text-brand-violet text-[10px] font-bold uppercase tracking-wider">
                          {e.type}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            e.status === 'published'
                              ? 'bg-emerald-500/15 text-emerald-700'
                              : 'bg-amber-500/15 text-amber-700',
                          )}
                        >
                          {e.status}
                        </span>
                      </td>

                      {/* Links indicators */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            title={e.meetingLink ? 'Meeting link set' : 'No meeting link'}
                            className={cn(
                              'w-6 h-6 rounded-md flex items-center justify-center',
                              e.meetingLink
                                ? 'text-sky-600 bg-sky-50'
                                : 'text-brand-text-muted/30 bg-brand-surface',
                            )}
                          >
                            <Link className="w-3.5 h-3.5" />
                          </span>
                          <span
                            title={e.recordingLink ? 'Recording link set' : 'No recording link'}
                            className={cn(
                              'w-6 h-6 rounded-md flex items-center justify-center',
                              e.recordingLink
                                ? 'text-emerald-600 bg-emerald-50'
                                : 'text-brand-text-muted/30 bg-brand-surface',
                            )}
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit */}
                          <button
                            onClick={() => { setEditing(e); setDialogOpen(true) }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
                            aria-label="Edit event"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {/* Toggle status */}
                          <button
                            onClick={() => handleToggleStatus(e)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-sky-500 hover:text-white transition-colors"
                            aria-label={e.status === 'published' ? 'Move to draft' : 'Publish'}
                          >
                            {e.status === 'published' ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {/* Delete */}
                          <button
                            onClick={() => setConfirmDeleteId(e.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors"
                            aria-label="Delete event"
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

      <LiveEventDialog
        open={dialogOpen}
        initial={editing}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete event"
        message="This will permanently delete the event. This cannot be undone."
        confirmLabel="Delete event"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </AdminLayout>
  )
}

