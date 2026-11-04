'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Building2, CalendarPlus, ChevronRight, Mail, MapPin, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { MentorLayout } from '@/components/mentor/MentorLayout'
import { Avatar, Button, Chip, EmptyState, FilterChips, PageHeader, Skeleton, btn, inputClass } from '@/components/kit'
import {
  apiErrorMessage,
  browserTz,
  classifySessions,
  countryName,
  dayKey,
  fetchMe,
  fmtDate,
  fmtDay,
  fmtTime,
  sessionPhase,
  tzAbbr,
} from '@/components/mentor/mentorKit'
import { getMentorSessionsList, type SessionWithDetails } from '@/lib/api/mentorSessions'
import { getMyAvailability, type Slot } from '@/lib/api/mentorAvailability'
import { fetchMenteeNotes, saveMenteeNotes } from '@/lib/api/redesign'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'upcoming' | 'past'

interface Mentee {
  key: string
  id?: string
  fullName: string
  email: string
  avatarUrl: string | null
  company?: string | null
  country?: string | null
  sessions: SessionWithDetails[] // newest first
  hasUpcoming: boolean
  latest: SessionWithDetails
  since: string
}

function phaseText(s: SessionWithDetails, now: Date, tz: string) {
  const p = sessionPhase(s, now)
  if (p === 'upcoming') return dayKey(s.slot.startsAt, tz) === dayKey(now, tz) ? 'Upcoming today' : 'Upcoming'
  if (p === 'live') return 'Happening now'
  if (p === 'needs') return 'Needs completion'
  if (p === 'completed') return 'Completed'
  return s.cancelledBy === 'sme' ? 'Cancelled by mentee' : s.cancelledBy === 'mentor' ? 'Cancelled by you' : 'Cancelled'
}

function phaseChip(s: SessionWithDetails, now: Date) {
  const p = sessionPhase(s, now)
  if (p === 'upcoming' || p === 'live') return <Chip tone="brand" className="rounded-full">Confirmed</Chip>
  if (p === 'needs') return <Chip tone="brand" className="rounded-full">Needs completion</Chip>
  if (p === 'completed') return <Chip tone="ok" className="rounded-full">Completed</Chip>
  return <Chip className="rounded-full">Cancelled</Chip>
}

export default function Mentees() {
  const [sessions, setSessions] = useState<SessionWithDetails[] | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [tz, setTz] = useState<string>(() => browserTz())
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [notesFailed, setNotesFailed] = useState<Record<string, boolean>>({})
  const detailRef = useRef<HTMLElement>(null)
  const [now] = useState(() => new Date())

  useEffect(() => {
    fetchMe()
      .then((u) => u.timezone && setTz(u.timezone))
      .catch(() => {})
    getMyAvailability()
      .then((d) => setSlots(d.upcoming))
      .catch(() => {})
    getMentorSessionsList()
      .then((d) => setSessions(classifySessions(d).all))
      .catch(() => {
        toast.error('Failed to load mentees')
        setSessions([])
      })
      .finally(() => setLoading(false))
  }, [])

  const mentees = useMemo<Mentee[]>(() => {
    const map = new Map<string, SessionWithDetails[]>()
    for (const s of sessions ?? []) {
      const key = s.smeUser.id ?? s.smeUser.email
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()]
      .map(([key, list]) => {
        const sorted = [...list].sort((a, b) => b.slot.startsAt.localeCompare(a.slot.startsAt))
        const u = sorted[0].smeUser
        const firstBooked = [...list]
          .map((s) => s.bookedAt ?? s.slot.startsAt)
          .sort()[0]
        return {
          key,
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          avatarUrl: u.avatarUrl,
          company: u.company,
          country: u.country ? countryName(u.country) : u.country,
          sessions: sorted,
          hasUpcoming: list.some((s) => ['upcoming', 'live'].includes(sessionPhase(s, now))),
          latest: sorted[0],
          since: firstBooked,
        }
      })
      .sort((a, b) => b.latest.slot.startsAt.localeCompare(a.latest.slot.startsAt))
  }, [sessions, now])

  const showBusiness = mentees.some((m) => m.company !== undefined || m.country !== undefined)

  // Load each mentee's private notes once we know their ids.
  useEffect(() => {
    const ids = mentees.map((m) => m.id).filter((id): id is string => !!id && !(id in notes))
    if (ids.length === 0) return
    Promise.allSettled(ids.map((id) => fetchMenteeNotes(id))).then((results) => {
      const ok: Record<string, string> = {}
      const failed: Record<string, boolean> = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') ok[ids[i]] = r.value?.notes ?? ''
        else failed[ids[i]] = true
      })
      setNotes((n) => ({ ...n, ...ok }))
      setNotesFailed((f) => ({ ...f, ...failed }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentees])

  // Preselect from ?m=<email> (dashboard "Recent mentees" links) or the first mentee.
  useEffect(() => {
    if (mentees.length === 0 || selectedKey) return
    const wanted = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('m') : null
    const hit = wanted ? mentees.find((m) => m.email === wanted || m.id === wanted) : null
    setSelectedKey((hit ?? mentees[0]).key)
    if (hit && window.innerWidth < 1200) setTimeout(() => detailRef.current?.scrollIntoView({ block: 'start' }), 50)
  }, [mentees, selectedKey])

  const q = query.trim().toLowerCase()
  const counts = {
    all: mentees.length,
    upcoming: mentees.filter((m) => m.hasUpcoming).length,
    past: mentees.filter((m) => !m.hasUpcoming).length,
  }
  const visible = mentees.filter(
    (m) =>
      (filter === 'all' || (filter === 'upcoming' ? m.hasUpcoming : !m.hasUpcoming)) &&
      (!q || m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)),
  )
  const selected = mentees.find((m) => m.key === selectedKey) ?? null

  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const openAfterToday = slots.filter((s) => s.isAvailable && new Date(s.startsAt) >= endOfToday).length

  function select(m: Mentee) {
    setSelectedKey(m.key)
    if (window.innerWidth < 1200) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  return (
    <MentorLayout>
      <div className="flex flex-col gap-6">
        <PageHeader className="mb-0" title="Mentees" subtitle="Everyone who has booked a session with you." />

        <div className="-mt-1 flex flex-col items-stretch gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:w-[340px]">
            <label htmlFor="m-s" className="sr-only">Search mentees</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ui-muted" strokeWidth={1.75} aria-hidden />
            <input
              id="m-s"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              className={cn(inputClass, 'pl-[38px]')}
            />
          </div>
          <FilterChips<Filter>
            label="Filter mentees"
            active={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'upcoming', label: 'Has upcoming session', count: counts.upcoming },
              { value: 'past', label: 'Past only', count: counts.past },
            ]}
          />
        </div>

        <div className={cn('grid grid-cols-1 items-start gap-5', mentees.length > 0 && 'min-[1200px]:grid-cols-[minmax(0,1fr)_340px]')}>
          <section aria-labelledby="h-list" className="overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
            <h2 id="h-list" className="sr-only">Mentee list</h2>
            {loading ? (
              <div className="flex flex-col gap-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            ) : mentees.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No mentees yet"
                body="Mentees appear here after their first booking, with their sessions and your private notes."
              />
            ) : visible.length === 0 ? (
              <EmptyState icon={Search} title="No mentees match" body="Try a different name or filter." />
            ) : (
              <table className="w-full border-collapse text-[13px] max-md:block">
                <thead className="max-md:hidden">
                  <tr>
                    {['Mentee', ...(showBusiness ? ['Business'] : []), 'Sessions', 'Last session', 'Notes'].map((h) => (
                      <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-ui-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="max-md:block">
                  {visible.map((m) => {
                    const on = m.key === selectedKey
                    const note = m.id ? notes[m.id] : undefined
                    return (
                      <tr
                        key={m.key}
                        onClick={() => select(m)}
                        className={cn(
                          'cursor-pointer transition-colors max-md:block max-md:border-t max-md:border-ui-line max-md:py-2.5 max-md:first:border-t-0',
                          on ? 'bg-ui-brand-soft/60' : 'hover:bg-ui-bg',
                        )}
                      >
                        <td className="border-t border-ui-line px-4 py-3.5 align-middle max-md:block max-md:border-t-0 max-md:py-1">
                          <button
                            type="button"
                            aria-current={on ? 'true' : undefined}
                            onClick={(e) => {
                              e.stopPropagation()
                              select(m)
                            }}
                            className="flex min-w-0 items-center gap-3 rounded-lg text-left text-ui-text"
                          >
                            <Avatar name={m.fullName} src={m.avatarUrl} size={38} />
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-sm font-semibold">{m.fullName}</span>
                              <span className="truncate text-xs text-ui-muted">{m.email}</span>
                            </span>
                          </button>
                        </td>
                        {showBusiness && (
                          <td data-l="Business" className={cellCls}>
                            <span className="flex flex-col">
                              <span className={m.company ? 'text-ui-text' : 'text-ui-muted'}>{m.company || 'Not added'}</span>
                              {m.country && <span className="text-xs text-ui-muted">{m.country}</span>}
                            </span>
                          </td>
                        )}
                        <td data-l="Sessions" className={cellCls}>
                          <Chip tone={m.hasUpcoming ? 'brand' : 'neutral'} className="rounded-full">
                            {m.sessions.length} session{m.sessions.length === 1 ? '' : 's'}
                          </Chip>
                        </td>
                        <td data-l="Last session" className={cellCls}>
                          <span className="flex flex-col">
                            <span className="text-ui-text">{fmtDate(m.latest.slot.startsAt, tz)}</span>
                            <span className="text-xs text-ui-muted">{phaseText(m.latest, now, tz)}</span>
                          </span>
                        </td>
                        <td data-l="Notes" className={cn(cellCls, 'max-w-[220px]')}>
                          <span className={cn('line-clamp-2', note ? 'text-ui-text' : 'text-ui-muted')}>{note || 'No notes yet'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {!loading && (
              <div className="flex items-center gap-3 border-t border-ui-line bg-ui-bg p-4">
                <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ui-surface-2 text-ui-muted">
                  <CalendarPlus className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <strong className="text-[13px] font-semibold text-ui-text">New mentees appear after they book</strong>
                  <span className="text-xs text-ui-muted">
                    {openAfterToday === 0
                      ? 'You have no open slots after today, so nobody new can book you yet.'
                      : `You have ${openAfterToday} open slot${openAfterToday === 1 ? '' : 's'} after today for new bookings.`}
                  </span>
                </span>
                <Link href="/mentor/dashboard/availability" className={cn(btn({ variant: 'secondary', size: 'sm' }), 'hidden sm:inline-flex')}>
                  Add availability
                </Link>
              </div>
            )}
          </section>

          {selected && (
            <aside ref={detailRef} aria-labelledby="h-det" className="flex scroll-mt-20 flex-col rounded-[14px] border border-ui-line bg-ui-surface">
              <div className="flex items-center gap-3 p-[18px]">
                <Avatar name={selected.fullName} src={selected.avatarUrl} size={48} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <h2 id="h-det" className="truncate text-[17px] font-semibold text-ui-text">{selected.fullName}</h2>
                  <span className="text-[13px] text-ui-muted">Mentee since {fmtDate(selected.since, tz)}</span>
                </span>
              </div>
              <dl className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-2.5 px-[18px] pb-4 text-[13px]">
                <dt className="flex text-ui-muted"><Mail className="h-4 w-4" strokeWidth={1.75} aria-hidden /><span className="sr-only">Email</span></dt>
                <dd className="truncate text-ui-text"><a href={`mailto:${selected.email}`} className="hover:underline">{selected.email}</a></dd>
                {showBusiness && (
                  <>
                    <dt className="flex text-ui-muted"><MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden /><span className="sr-only">Country</span></dt>
                    <dd className={selected.country ? 'text-ui-text' : 'text-ui-muted'}>{selected.country || 'No country added'}</dd>
                    <dt className="flex text-ui-muted"><Building2 className="h-4 w-4" strokeWidth={1.75} aria-hidden /><span className="sr-only">Business</span></dt>
                    <dd className={selected.company ? 'text-ui-text' : 'text-ui-muted'}>{selected.company || 'No business added'}</dd>
                  </>
                )}
              </dl>
              <div className="flex flex-col gap-2.5 border-t border-ui-line px-[18px] py-3.5">
                <h3 className="text-sm font-semibold text-ui-text">Sessions</h3>
                <ul className="flex flex-col gap-2">
                  {selected.sessions.slice(0, 6).map((s) => (
                    <li key={s.id} className="flex items-center gap-2.5 text-[13px] text-ui-text">
                      <span className="flex-1">{fmtDay(s.slot.startsAt, tz)}, {fmtTime(s.slot.startsAt, tz)} {tzAbbr(tz)}</span>
                      {phaseChip(s, now)}
                    </li>
                  ))}
                </ul>
                {selected.sessions.length > 6 && <span className="text-xs text-ui-muted">and {selected.sessions.length - 6} earlier</span>}
                <Link href={`/mentor/dashboard/sessions#s-${selected.sessions[0].id}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ui-brand-text hover:underline">
                  Open in My Sessions
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
              <MenteeNotesForm
                key={selected.key}
                mentee={selected}
                saved={selected.id ? notes[selected.id] : undefined}
                loadFailed={selected.id ? !!notesFailed[selected.id] : false}
                onSaved={(id, v) => setNotes((n) => ({ ...n, [id]: v }))}
              />
            </aside>
          )}
        </div>
      </div>
    </MentorLayout>
  )
}

const cellCls =
  'border-t border-ui-line px-4 py-3.5 align-middle max-md:block max-md:border-t-0 max-md:py-1 max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:text-ui-muted max-md:before:content-[attr(data-l)]'

function MenteeNotesForm({
  mentee,
  saved,
  loadFailed,
  onSaved,
}: {
  mentee: Mentee
  saved: string | undefined
  loadFailed: boolean
  onSaved: (id: string, notes: string) => void
}) {
  const [value, setValue] = useState(saved ?? '')
  const [saving, setSaving] = useState(false)
  useEffect(() => setValue(saved ?? ''), [saved])

  const first = mentee.fullName.split(' ')[0]
  const canSave = !!mentee.id
  const dirty = value.trim() !== (saved ?? '').trim()

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!mentee.id || !dirty) return
    const v = value.trim()
    setSaving(true)
    saveMenteeNotes(mentee.id, v)
      .then((r) => {
        onSaved(mentee.id!, r?.notes ?? v)
        toast.success(v ? 'Notes saved' : 'Notes cleared')
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not save notes. Try again.')))
      .finally(() => setSaving(false))
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t border-ui-line px-[18px] pb-[18px] pt-3.5">
      <label htmlFor="m-n" className="text-[13px] font-semibold text-ui-text">Private notes</label>
      <textarea
        id="m-n"
        rows={4}
        maxLength={20000}
        value={value}
        disabled={!canSave || (saved === undefined && !loadFailed)}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`What does ${first} want help with? Goals, follow-ups, resources to share.`}
        className={cn(inputClass, 'h-auto resize-y py-2.5 leading-normal')}
      />
      <span className="text-xs text-ui-muted">
        {!canSave
          ? 'Notes are not available for this mentee yet.'
          : loadFailed
            ? 'Saved notes could not be loaded. Anything you save here replaces them.'
            : 'Only you can see these notes.'}
      </span>
      <Button type="submit" variant="secondary" className="self-start" disabled={!canSave || !dirty || saving}>
        {saving ? 'Saving' : 'Save notes'}
      </Button>
    </form>
  )
}

