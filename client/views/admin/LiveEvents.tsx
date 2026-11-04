'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Pencil,
  Play,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { btn, Card, EmptyState, FilterChips, PageHeader, Skeleton } from '@/components/kit'
import { adminTableClass, IconButton, Pill, SearchInput, SortButton, TableCard, type SortDir } from '@/components/admin/ui'
import { LiveEventDialog } from '@/components/admin/widgets/LiveEventDialog'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { fetchAdminEvents, apiCreateEvent, apiUpdateEvent, apiDeleteEvent, type LiveEvent } from '@/lib/api/liveEvents'
import { cn } from '@/lib/utils'
import { optimizedSrc } from '@/lib/images'
import { errorMessage } from '@/lib/api/errors'

type Filter = 'all' | 'published' | 'draft' | 'upcoming' | 'past'

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  const d = new Date(`${year}-${month}-${day}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export default function LiveEventsAdmin() {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LiveEvent | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    fetchAdminEvents()
      .then(setEvents)
      .catch((err) => toast.error(errorMessage(err, 'Events could not be loaded. Refresh the page to try again.')))
      .finally(() => setLoading(false))
  }, [])

  const today = new Date().toISOString().split('T')[0]!

  const isUpcoming = (e: LiveEvent) => e.date >= today && e.status === 'published'
  const isPast = (e: LiveEvent) => e.date < today

  const counts = useMemo(
    () => ({
      all: events.length,
      published: events.filter((e) => e.status === 'published').length,
      draft: events.filter((e) => e.status === 'draft').length,
      upcoming: events.filter(isUpcoming).length,
      past: events.filter(isPast).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, today],
  )

  const filtered = events
    .filter((e) => {
      if (filter === 'published') return e.status === 'published'
      if (filter === 'draft') return e.status === 'draft'
      if (filter === 'upcoming') return isUpcoming(e)
      if (filter === 'past') return isPast(e)
      return true
    })
    .filter((e) => !query || e.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (sortDir === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)))

  const pastEvents = events.filter(isPast)
  const pastWithRecording = pastEvents.filter((e) => !!e.recordingLink).length
  const nextEvent = events.filter(isUpcoming).sort((a, b) => a.date.localeCompare(b.date))[0]
  const lastEvent = [...pastEvents].sort((a, b) => b.date.localeCompare(a.date))[0]

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(e: LiveEvent) {
    setEditing(e)
    setDialogOpen(true)
  }

  async function handleToggleStatus(event: LiveEvent) {
    const newStatus = event.status === 'published' ? 'draft' : 'published'
    try {
      await apiUpdateEvent(event.id, { status: newStatus })
      setEvents((cur) => cur.map((e) => (e.id === event.id ? { ...e, status: newStatus } : e)))
      toast.success(`Event ${newStatus === 'published' ? 'published' : 'moved to draft'}`)
    } catch (err) {
      toast.error(errorMessage(err, 'The event status could not be changed. Please try again.'))
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
      if (e?.error?.code === 'VALIDATION_ERROR') throw err // let the panel show inline errors
      toast.error(errorMessage(err, 'The event could not be saved. Please try again.'))
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiDeleteEvent(id)
      setEvents((cur) => cur.filter((e) => e.id !== id))
      if (editing?.id === id) {
        setDialogOpen(false)
        setEditing(null)
      }
      toast.success('Event deleted')
    } catch (err) {
      toast.error(errorMessage(err, 'The event could not be deleted. Please try again.'))
    }
    setConfirmDeleteId(null)
  }

  const filterOptions: { value: Filter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'published', label: 'Published', count: counts.published },
    { value: 'draft', label: 'Draft', count: counts.draft },
    { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
    { value: 'past', label: 'Past', count: counts.past },
  ]

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <PageHeader
          className="mb-0 max-md:flex-col max-md:items-start"
          title="Live Events"
          subtitle="Manage webinars, workshops and live sessions for women entrepreneurs."
          actions={
            <button type="button" onClick={openCreate} className={btn()}>
              <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              New event
            </button>
          }
        />

        {/* Stats */}
        <Card className="grid grid-cols-2 md:grid-cols-4">
          <StatCell icon={CalendarDays} label="Total events" value={loading ? null : counts.all} />
          <StatCell
            icon={CalendarCheck}
            label="Published"
            value={loading ? null : counts.published}
            hint={counts.draft > 0 ? `${plural(counts.draft, 'draft')}` : undefined}
            className="border-l border-ui-line"
          />
          <StatCell
            icon={CalendarClock}
            label="Upcoming"
            value={loading ? null : counts.upcoming}
            muted={counts.upcoming === 0}
            hint={loading ? undefined : nextEvent ? `Next on ${formatDate(nextEvent.date)}` : 'Nothing scheduled'}
            className="md:border-l md:border-ui-line"
          />
          <StatCell
            icon={Play}
            label="Past"
            value={loading ? null : counts.past}
            hint={
              loading || counts.past === 0
                ? undefined
                : pastWithRecording === counts.past
                  ? 'All with recordings'
                  : `${pastWithRecording} with recordings`
            }
            className="border-l border-ui-line"
          />
        </Card>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterChips
            label="Filter events"
            options={filterOptions}
            active={filter}
            onChange={(v) => setFilter(v)}
            className="max-md:w-full max-md:flex-nowrap md:flex-wrap"
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search events"
            className="w-full md:w-[260px]"
          />
        </div>

        <div className={cn('grid grid-cols-[minmax(0,1fr)] items-start gap-5', dialogOpen && 'xl:grid-cols-[minmax(0,1fr)_360px]')}>
          <div className="flex min-w-0 flex-col gap-4">
            {!loading && events.length > 0 && counts.upcoming === 0 && (
              <div className="flex items-center gap-3.5 rounded-[14px] bg-ui-brand-soft px-[18px] py-3.5">
                <CalendarPlus className="h-[18px] w-[18px] shrink-0 text-ui-brand-text" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ui-text">No upcoming events</p>
                  <p className="mt-0.5 text-[13px] text-ui-muted">
                    {lastEvent
                      ? `The last ${lastEvent.type.toLowerCase()} ran on ${formatDate(lastEvent.date)}. Publish a new event to show it to learners.`
                      : 'Publish a new event to show it to learners.'}
                  </p>
                </div>
                <button type="button" onClick={openCreate} className={cn(btn({ variant: 'secondary', size: 'sm' }), 'max-md:hidden')}>
                  Schedule event
                </button>
              </div>
            )}

            {loading ? (
              <Card className="flex flex-col gap-3 p-5" aria-busy="true" aria-label="Loading events">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </Card>
            ) : filtered.length === 0 ? (
              <Card>
                <EmptyState
                  icon={CalendarDays}
                  title={events.length === 0 ? 'No events yet' : 'No events found'}
                  body={query ? 'Try a different search.' : events.length === 0 ? 'Create your first event to get started.' : 'No events match this filter.'}
                  action={
                    <button type="button" onClick={openCreate} className={btn({ size: 'sm' })}>
                      <Plus className="h-4 w-4" aria-hidden />
                      New event
                    </button>
                  }
                />
              </Card>
            ) : (
              <TableCard>
                <table className={cn(adminTableClass, 'min-w-[600px] table-fixed')} aria-label="Events">
                  <colgroup>
                    <col />
                    <col className="w-[124px]" />
                    <col className="w-[120px]" />
                    <col className="w-[76px]" />
                    <col className="w-[112px]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Event</th>
                      <th scope="col" aria-sort={sortDir === 'desc' ? 'descending' : 'ascending'}>
                        <SortButton active dir={sortDir} onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}>
                          Date
                        </SortButton>
                      </th>
                      <th scope="col">Status</th>
                      <th scope="col">Links</th>
                      <th scope="col" className="!text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => {
                      const selected = dialogOpen && editing?.id === e.id
                      return (
                        <tr key={e.id} aria-selected={selected || undefined} className={cn(selected && '!bg-ui-brand-soft')}>
                          <td>
                            <span className="flex min-w-0 items-center gap-2.5">
                              {e.coverImage ? (
                                <img src={optimizedSrc(e.coverImage)} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                              ) : (
                                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ui-surface-2 text-ui-muted">
                                  <CalendarDays className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                                </span>
                              )}
                              <span className="flex min-w-0 flex-col">
                                <button
                                  type="button"
                                  onClick={() => openEdit(e)}
                                  className="truncate text-left font-semibold text-ui-text hover:underline"
                                  title={e.title}
                                >
                                  {e.title}
                                </button>
                                <span className="truncate text-xs text-ui-muted">
                                  {e.type}
                                  {e.time ? `, ${e.time}` : ''}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap tabular-nums text-ui-muted">{formatDate(e.date)}</td>
                          <td>
                            {e.status === 'published' ? (
                              <Pill tone="brand" dot>Published</Pill>
                            ) : (
                              <Pill tone="line">Draft</Pill>
                            )}
                          </td>
                          <td>
                            <span className="flex gap-1">
                              <LinkDot on={!!e.meetingLink} icon={LinkIcon} label={e.meetingLink ? 'Meeting link set' : 'No meeting link'} />
                              <LinkDot on={!!e.recordingLink} icon={Play} label={e.recordingLink ? 'Recording link set' : 'No recording link'} />
                            </span>
                          </td>
                          <td>
                            <span className="flex justify-end gap-0.5">
                              <IconButton label={`Edit ${e.title}`} icon={Pencil} onClick={() => openEdit(e)} />
                              <IconButton
                                label={e.status === 'published' ? `Move ${e.title} to draft` : `Publish ${e.title}`}
                                icon={e.status === 'published' ? EyeOff : Eye}
                                onClick={() => handleToggleStatus(e)}
                              />
                              <IconButton label={`Delete ${e.title}`} icon={Trash2} tone="danger" onClick={() => setConfirmDeleteId(e.id)} />
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableCard>
            )}
          </div>

          <LiveEventDialog
            open={dialogOpen}
            initial={editing}
            onClose={() => {
              setDialogOpen(false)
              setEditing(null)
            }}
            onSave={handleSave}
            className="xl:sticky xl:top-6"
          />
        </div>
      </div>

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

function StatCell({
  icon: Icon,
  label,
  value,
  hint,
  muted,
  className,
}: {
  icon: LucideIcon
  label: string
  value: number | null
  hint?: ReactNode
  muted?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5 px-[18px] py-4', className)}>
      <span className="flex items-center gap-2 text-[13px] font-medium text-ui-muted">
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {label}
      </span>
      {value === null ? (
        <Skeleton className="h-7 w-12" />
      ) : (
        <span className={cn('text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums', muted ? 'text-ui-muted' : 'text-ui-text')}>
          {value}
        </span>
      )}
      {hint && <span className="text-xs text-ui-muted">{hint}</span>}
    </div>
  )
}

function LinkDot({ on, icon: Icon, label }: { on: boolean; icon: LucideIcon; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-[26px] w-[26px] items-center justify-center rounded-[7px]',
        on ? 'bg-ui-brand-soft text-ui-brand-text' : 'bg-ui-surface-2 text-ui-muted opacity-55',
      )}
    >
      <Icon className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
    </span>
  )
}
