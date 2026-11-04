'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Ban,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Timer,
  Users,
  Video,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { MentorLayout } from '@/components/mentor/MentorLayout'
import { Avatar, Button, Card, Chip, EmptyState, FilterChips, PageHeader, Skeleton, btn, inputClass } from '@/components/kit'
import {
  ConfirmModal,
  DateBox,
  IconTile,
  apiErrorMessage,
  browserTz,
  classifySessions,
  durationLabel,
  fetchMe,
  fmtDay,
  fmtDayYear,
  fmtTime,
  minutesBetween,
  startsInLabel,
  tzAbbr,
  type ConfirmState,
} from '@/components/mentor/mentorKit'
import {
  cancelMentorSessionApi,
  completeMentorSessionApi,
  getMentorSessionsList,
  type SessionWithDetails,
  type SessionsData,
} from '@/lib/api/mentorSessions'
import { saveSessionNotes } from '@/lib/api/redesign'
import { cn } from '@/lib/utils'

type PastFilter = 'all' | 'needs' | 'completed' | 'cancelled'

export default function Sessions() {
  const [data, setData] = useState<SessionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [timezone, setTimezone] = useState<string | null>(null)
  const [filter, setFilter] = useState<PastFilter>('all')
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [now, setNow] = useState(() => new Date())

  const load = useCallback(() => {
    return getMentorSessionsList().then((d) => {
      setData(d)
      setLoadError(false)
      setNow(new Date())
    })
  }, [])

  useEffect(() => {
    fetchMe()
      .then((u) => setTimezone(u.timezone))
      .catch(() => {})
    load()
      .catch(() => {
        setLoadError(true)
        toast.error('Failed to load sessions')
      })
      .finally(() => setLoading(false))
  }, [load])

  // Deep link from the dashboard ("Session notes"): /sessions#s-<id>
  useEffect(() => {
    if (loading || typeof window === 'undefined' || !window.location.hash.startsWith('#s-')) return
    const el = document.getElementById(window.location.hash.slice(1))
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    el.querySelector('textarea')?.focus({ preventScroll: true })
  }, [loading])

  const tz = timezone || browserTz()
  const groups = useMemo(() => (data ? classifySessions(data, now) : null), [data, now])
  const upcoming = groups?.upcoming ?? []
  const needs = groups?.needs ?? []
  const completed = groups?.completed ?? []
  const cancelled = groups?.cancelled ?? []

  const pastRows = useMemo(() => {
    const done = groups?.completed ?? []
    const cx = groups?.cancelled ?? []
    const rows = filter === 'completed' ? done : filter === 'cancelled' ? cx : [...done, ...cx]
    return [...rows].sort((a, b) => b.slot.startsAt.localeCompare(a.slot.startsAt))
  }, [filter, groups])

  function patchNotes(id: string, notes: string) {
    setData((d) =>
      d
        ? {
            upcoming: d.upcoming.map((s) => (s.id === id ? { ...s, mentorNotes: notes } : s)),
            past: d.past.map((s) => (s.id === id ? { ...s, mentorNotes: notes } : s)),
          }
        : d,
    )
  }

  function askComplete(s: SessionWithDetails, fromNeeds = false) {
    setConfirm({
      title: 'Mark as completed',
      message: fromNeeds
        ? `Confirm that your session with ${s.smeUser.fullName} took place. It moves to Completed and counts towards your hours. This cannot be undone.`
        : 'Confirm that this session has been completed. This cannot be undone.',
      confirmLabel: 'Mark complete',
      variant: 'default',
      onConfirm: () => {
        setConfirm(null)
        completeMentorSessionApi(s.id)
          .then(() => {
            toast.success('Session marked as completed')
            return load()
          })
          .catch((err) => toast.error(apiErrorMessage(err, 'Failed to complete session')))
      },
    })
  }

  function askCancel(s: SessionWithDetails, fromNeeds = false) {
    setConfirm({
      title: fromNeeds ? 'Mark as cancelled' : 'Cancel session',
      message: fromNeeds
        ? `Record that your session with ${s.smeUser.fullName} did not take place. The mentee is notified by email.`
        : 'Are you sure you want to cancel this session? The mentee will be notified.',
      confirmLabel: fromNeeds ? 'Mark cancelled' : 'Cancel session',
      variant: 'danger',
      onConfirm: () => {
        setConfirm(null)
        cancelMentorSessionApi(s.id)
          .then(() => {
            toast.success('Session cancelled')
            return load()
          })
          .catch((err) => toast.error(apiErrorMessage(err, 'Failed to cancel session')))
      },
    })
  }

  const uniqueMentees = new Set(completed.map((s) => s.smeUser.email)).size
  const hours = (completed.reduce((acc, s) => acc + Math.max(0, minutesBetween(s.slot.startsAt, s.slot.endsAt)), 0) / 60).toFixed(1)
  const pastTotal = needs.length + completed.length + cancelled.length

  return (
    <MentorLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <PageHeader
            className="mb-0 items-center"
            title="My sessions"
            subtitle="Your upcoming and past mentoring sessions."
            actions={
              <Link href="/mentor/dashboard/calendar" className={btn({ variant: 'secondary' })}>
                <Calendar className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                Calendar view
              </Link>
            }
          />
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ui-muted">
            <Globe className="h-3.5 w-3.5" aria-hidden />
            Times shown in your timezone ({tz}, {tzAbbr(tz)})
          </span>
        </div>

        {/* Upcoming */}
        <section aria-labelledby="h-up" className="flex flex-col gap-3">
          <h2 id="h-up" className="text-lg font-semibold text-ui-text">Upcoming</h2>
          {loading ? (
            <Card className="p-5"><Skeleton className="h-20" /></Card>
          ) : loadError ? (
            <Card>
              <EmptyState
                icon={AlertCircle}
                title="Sessions could not be loaded"
                body="Check your connection and try again."
                action={<Button variant="secondary" size="sm" onClick={() => { setLoading(true); load().catch(() => setLoadError(true)).finally(() => setLoading(false)) }}>Try again</Button>}
              />
            </Card>
          ) : upcoming.length === 0 ? (
            <Card>
              <EmptyState
                icon={CalendarDays}
                title="No upcoming sessions"
                body="Sessions booked by mentees will appear here."
                action={<Link href="/mentor/dashboard/availability" className={btn({ variant: 'secondary', size: 'sm' })}>Add availability</Link>}
              />
            </Card>
          ) : (
            upcoming.map((s) => (
              <UpcomingCard key={s.id} session={s} tz={tz} now={now} onComplete={() => askComplete(s)} onCancel={() => askCancel(s)} onNotesSaved={patchNotes} />
            ))
          )}
          {upcoming.length > 0 && (
            <p className="text-[13px] text-ui-muted">
              Complete and Cancel ask you to confirm first. Cancelling notifies the mentee; marking complete cannot be undone.
            </p>
          )}
        </section>

        {/* Past */}
        <section aria-labelledby="h-past" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="h-past" className="text-lg font-semibold text-ui-text">Past</h2>
            <FilterChips<PastFilter>
              label="Filter past sessions"
              active={filter}
              onChange={setFilter}
              className="max-w-full"
              options={[
                { value: 'all', label: 'All', count: pastTotal },
                { value: 'needs', label: 'Needs completion', count: needs.length },
                { value: 'completed', label: 'Completed', count: completed.length },
                { value: 'cancelled', label: 'Cancelled', count: cancelled.length },
              ]}
            />
          </div>

          {loading ? (
            <Card className="p-5"><Skeleton className="h-28" /></Card>
          ) : (
            <>
              {(filter === 'all' || filter === 'needs') && needs.length > 0 && (
                <NeedsCompletion sessions={needs} tz={tz} onComplete={(s) => askComplete(s, true)} onCancel={(s) => askCancel(s, true)} />
              )}
              {filter === 'needs' && needs.length === 0 && (
                <Card>
                  <EmptyState icon={CheckCircle2} title="Nothing needs completion" body="Every session that has ended is marked complete or cancelled." />
                </Card>
              )}

              {(filter === 'all' || filter === 'completed') && (
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <SummaryTile icon={CheckCircle2} value={completed.length} label="Sessions done" />
                  <SummaryTile icon={Timer} value={`${hours}h`} label="Hours mentored" />
                  <SummaryTile icon={Users} value={uniqueMentees} label="Unique mentees" />
                </div>
              )}

              {filter !== 'needs' && (
                <Card className="overflow-hidden">
                  {pastRows.length > 0 && <PastTable rows={pastRows} tz={tz} onNotesSaved={patchNotes} />}
                  {(filter === 'all' || filter === 'completed') && completed.length === 0 && (
                    <EmptyState
                      className={cn('py-7', pastRows.length > 0 && 'border-t border-ui-line')}
                      icon={CheckCircle2}
                      title="No completed sessions yet"
                      body="Sessions you mark as complete show up here with a full history, including length and the meeting link."
                    />
                  )}
                  {filter === 'cancelled' && cancelled.length === 0 && (
                    <EmptyState className="py-7" icon={Ban} title="No cancelled sessions" body="Cancelled sessions from either side will appear here." />
                  )}
                </Card>
              )}
              <p className="text-[13px] text-ui-muted">
                Cancelled sessions from either side appear here. Sessions that end without being marked move to Needs completion.
              </p>
            </>
          )}
        </section>
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          variant={confirm.variant}
          cancelLabel="Go back"
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </MentorLayout>
  )
}

// ---------------------------------------------------------------------------

function SummaryTile({ icon: Icon, value, label }: { icon: typeof Users; value: number | string; label: string }) {
  return (
    <Card className="flex items-center gap-3 p-3 sm:px-4 sm:py-3.5">
      <span aria-hidden className="hidden h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-ui-surface-2 text-ui-muted sm:inline-flex">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-col">
        <strong className="text-lg font-semibold tabular-nums text-ui-text">{value}</strong>
        <span className="text-xs text-ui-muted">{label}</span>
      </span>
    </Card>
  )
}

function UpcomingCard({
  session: s,
  tz,
  now,
  onComplete,
  onCancel,
  onNotesSaved,
}: {
  session: SessionWithDetails
  tz: string
  now: Date
  onComplete: () => void
  onCancel: () => void
  onNotesSaved: (id: string, notes: string) => void
}) {
  const mins = minutesBetween(s.slot.startsAt, s.slot.endsAt)
  return (
    <article id={`s-${s.id}`} aria-labelledby={`h-${s.id}`} className="scroll-mt-24 overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface shadow-ui">
      <div className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-4 p-4 sm:grid-cols-[52px_40px_minmax(0,1fr)] sm:px-5 sm:py-[18px] xl:grid-cols-[52px_40px_minmax(0,1fr)_auto]">
        <DateBox iso={s.slot.startsAt} tz={tz} className="hidden sm:flex" />
        <Avatar name={s.smeUser.fullName} src={s.smeUser.avatarUrl} size={40} />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`h-${s.id}`} className="text-base font-semibold text-ui-text">{s.smeUser.fullName}</h3>
            <Chip tone="brand" className="rounded-full">Confirmed</Chip>
            <Chip className="rounded-full">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {startsInLabel(s.slot.startsAt, s.slot.endsAt, now, tz)}
            </Chip>
          </div>
          <span className="truncate text-[13px] text-ui-muted">{s.smeUser.email}</span>
          <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-ui-muted">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {fmtDay(s.slot.startsAt, tz)}, {fmtTime(s.slot.startsAt, tz)} to {fmtTime(s.slot.endsAt, tz)} {tzAbbr(tz)}
            </span>
            {mins > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" aria-hidden />
                {durationLabel(mins)}
              </span>
            )}
          </span>
        </div>
        <div className="col-span-full flex flex-wrap justify-end gap-2 max-sm:[&>*]:grow xl:col-span-1">
          {s.meetingLink ? (
            <a href={s.meetingLink} target="_blank" rel="noopener noreferrer" className={btn()}>
              <Video className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              Join
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <Button disabled title="This session has no meeting link">
              <Video className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              No link
            </Button>
          )}
          <Button variant="secondary" onClick={onComplete}>
            <Check className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            Complete
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            <X className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            Cancel
          </Button>
        </div>
      </div>
      <div className="border-t border-ui-line bg-ui-bg px-4 py-3.5 sm:px-5">
        <SessionNotes session={s} onSaved={onNotesSaved} />
      </div>
    </article>
  )
}

/** Private session notes (only the mentor sees them). Saving an empty note clears it. */
function SessionNotes({ session, onSaved }: { session: SessionWithDetails; onSaved: (id: string, notes: string) => void }) {
  const saved = session.mentorNotes ?? ''
  const [value, setValue] = useState(saved)
  const [saving, setSaving] = useState(false)
  const id = `n-${session.id}`

  useEffect(() => setValue(saved), [saved])

  const dirty = value.trim() !== saved.trim()

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!dirty) return
    const notes = value.trim()
    setSaving(true)
    saveSessionNotes(session.id, notes)
      .then((r) => {
        const next = r?.mentorNotes ?? notes
        onSaved(session.id, next)
        setValue(next)
        toast.success(notes ? 'Note saved' : 'Note cleared')
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not save the note. Try again.')))
      .finally(() => setSaving(false))
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-semibold text-ui-text">
        <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        Session notes
      </label>
      <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-end">
        <textarea
          id={id}
          rows={2}
          maxLength={20000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Prep notes, goals for the session, follow-ups. Only you can see these."
          className={cn(inputClass, 'h-auto min-h-16 resize-y py-2.5 leading-normal')}
        />
        <Button type="submit" variant="secondary" disabled={!dirty || saving}>
          {saving ? 'Saving' : value.trim() || !saved ? 'Save note' : 'Clear note'}
        </Button>
      </div>
    </form>
  )
}

function NeedsCompletion({
  sessions,
  tz,
  onComplete,
  onCancel,
}: {
  sessions: SessionWithDetails[]
  tz: string
  onComplete: (s: SessionWithDetails) => void
  onCancel: (s: SessionWithDetails) => void
}) {
  return (
    <article aria-labelledby="h-needs" className="overflow-hidden rounded-[14px] border border-ui-brand bg-ui-surface">
      <div className="flex items-start gap-3 bg-ui-brand-soft px-4 py-3.5 sm:px-5">
        <IconTile tone="surface" size={34}><AlertCircle className="h-[18px] w-[18px]" strokeWidth={1.75} /></IconTile>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id="h-needs" className="flex items-center gap-2 text-[15px] font-semibold text-ui-text">
            Needs completion
            <span className="inline-flex h-6 items-center rounded-full bg-ui-surface px-2 text-xs font-semibold text-ui-brand-text">{sessions.length}</span>
          </h3>
          <span className="text-[13px] text-ui-text">
            These sessions ended but were never marked complete. Confirm what happened so your history and hours stay accurate.
          </span>
        </div>
      </div>
      {sessions.map((s) => (
        <div
          key={s.id}
          id={`s-${s.id}`}
          className="grid scroll-mt-24 grid-cols-[40px_minmax(0,1fr)] items-center gap-4 border-t border-ui-line p-4 sm:px-5 xl:grid-cols-[40px_minmax(0,1fr)_auto]"
        >
          <Avatar name={s.smeUser.fullName} src={s.smeUser.avatarUrl} size={40} />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-ui-text">{s.smeUser.fullName}</span>
              <Chip tone="brand" className="rounded-full">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                Ended, not marked
              </Chip>
            </div>
            <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-ui-muted">
              <span className="truncate">{s.smeUser.email}</span>
              <span>Ended {fmtDayYear(s.slot.endsAt, tz)}, {fmtTime(s.slot.endsAt, tz)} {tzAbbr(tz)}</span>
              <span>{durationLabel(minutesBetween(s.slot.startsAt, s.slot.endsAt))}</span>
            </span>
          </div>
          <div className="col-span-full flex flex-wrap justify-end gap-2 max-sm:[&>*]:grow xl:col-span-1">
            <Button variant="secondary" onClick={() => onComplete(s)}>
              <Check className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              Mark complete
            </Button>
            <Button variant="secondary" onClick={() => onCancel(s)}>
              <X className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              Mark cancelled
            </Button>
          </div>
        </div>
      ))}
    </article>
  )
}

const cellLabel =
  'max-md:block max-md:w-full max-md:border-t-0 max-md:px-4 max-md:py-1 max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:text-ui-muted max-md:before:content-[attr(data-l)]'

function PastTable({ rows, tz, onNotesSaved }: { rows: SessionWithDetails[]; tz: string; onNotesSaved: (id: string, notes: string) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <table className="w-full border-collapse text-[13px] max-md:block">
      <caption className="sr-only">Past sessions</caption>
      <thead className="max-md:hidden">
        <tr>
          {['Mentee', 'Date and time', 'Length', 'Meeting', 'Status', 'Notes'].map((h) => (
            <th key={h} scope="col" className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold text-ui-muted">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="max-md:block">
        {rows.map((s) => {
          const mins = minutesBetween(s.slot.startsAt, s.slot.endsAt)
          const notes = s.mentorNotes ?? ''
          const isOpen = open === s.id
          return [
            <tr key={s.id} id={`s-${s.id}`} className="scroll-mt-24 max-md:block max-md:border-t max-md:border-ui-line max-md:py-2.5 max-md:first:border-t-0">
              <td className="border-t border-ui-line px-5 py-3.5 align-middle max-md:block max-md:border-t-0 max-md:px-4 max-md:py-1">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={s.smeUser.fullName} src={s.smeUser.avatarUrl} size={36} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-ui-text">{s.smeUser.fullName}</span>
                    <span className="truncate text-xs text-ui-muted">{s.smeUser.email}</span>
                  </span>
                </span>
              </td>
              <td data-l="Date and time" className={cn('border-t border-ui-line px-5 py-3.5 align-middle', cellLabel)}>
                <span className="flex flex-col">
                  <span className="text-ui-text">{fmtDayYear(s.slot.startsAt, tz)}</span>
                  <span className="text-ui-muted">{fmtTime(s.slot.startsAt, tz)} {tzAbbr(tz)}</span>
                </span>
              </td>
              <td data-l="Length" className={cn('border-t border-ui-line px-5 py-3.5 align-middle text-ui-muted', cellLabel)}>
                {durationLabel(mins) || 'Not set'}
              </td>
              <td data-l="Meeting" className={cn('border-t border-ui-line px-5 py-3.5 align-middle text-ui-muted', cellLabel)}>
                {s.status === 'cancelled' ? (
                  'No meeting held'
                ) : s.meetingLink ? (
                  <a href={s.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-ui-brand-text hover:underline">
                    Meeting link
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  'No meeting link'
                )}
              </td>
              <td data-l="Status" className={cn('border-t border-ui-line px-5 py-3.5 align-middle', cellLabel)}>
                {s.status === 'completed' ? (
                  <Chip tone="ok" className="rounded-full"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Completed</Chip>
                ) : (
                  <Chip className="rounded-full">
                    <Ban className="h-3.5 w-3.5" aria-hidden />
                    {s.cancelledBy === 'sme' ? 'Cancelled by mentee' : s.cancelledBy === 'mentor' ? 'Cancelled by you' : 'Cancelled'}
                  </Chip>
                )}
              </td>
              <td data-l="Notes" className={cn('border-t border-ui-line px-5 py-3.5 align-middle', cellLabel)}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`pn-${s.id}`}
                  onClick={() => setOpen(isOpen ? null : s.id)}
                  className="inline-flex items-center gap-1.5 rounded-md text-[13px] font-semibold text-ui-brand-text hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  {isOpen ? 'Hide note' : notes ? 'View note' : 'Add note'}
                </button>
              </td>
            </tr>,
            isOpen && (
              <tr key={`${s.id}-notes`} id={`pn-${s.id}`} className="max-md:block">
                <td colSpan={6} className="bg-ui-bg px-5 py-3.5 max-md:block max-md:px-4">
                  <SessionNotes session={s} onSaved={onNotesSaved} />
                </td>
              </tr>
            ),
          ]
        })}
      </tbody>
    </table>
  )
}
