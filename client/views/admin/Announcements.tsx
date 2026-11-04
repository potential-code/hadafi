'use client'

/**
 * Admin → Announcements (ported from SMEEP, on the approved canvas): write a
 * message for learners or mentors, show it as a banner, in the bell, or both,
 * now or at a set time, with a live preview; then follow its reach.
 * Email stays off until the client approves learner emails
 * (ANNOUNCEMENT_EMAILS_ENABLED on the server).
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Info, Loader2, Mail, Megaphone, Pencil, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Pill, Segmented, Switch, TableCard, Tag, adminTableClass, fmtDate } from '@/components/admin/ui'
import { Button, Card, EmptyState, Field, FilterChips, PageHeader, Skeleton, inputClass } from '@/components/kit'
import { AnnouncementCard } from '@/components/dashboard/AnnouncementBanner'
import { apiFetch } from '@/lib/api'
import { errorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'

type DisplayStatus = 'draft' | 'scheduled' | 'live' | 'ended'
type Audience = 'learners' | 'mentors' | 'all'

interface Announcement {
  id: string
  title: string
  body: string
  linkUrl: string | null
  linkLabel: string | null
  audience: string
  audienceRef: string | null
  audienceLabel: string
  showBanner: boolean
  notify: boolean
  email: boolean
  status: 'draft' | 'scheduled' | 'sent'
  displayStatus: DisplayStatus
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  audienceSize: number
  reach: number
}

const TITLE_MAX = 60
const BODY_MAX = 280
// Hadafi runs on Gulf Standard Time (GMT+4, no daylight saving).
const GST = '+04:00'

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'learners', label: 'All learners' },
  { value: 'mentors', label: 'Mentors' },
  { value: 'all', label: 'Everyone' },
]

const STATUS: Record<DisplayStatus, { label: string; tone: 'brand' | 'ok' | 'neutral' | 'line' }> = {
  draft: { label: 'Draft', tone: 'line' },
  scheduled: { label: 'Scheduled', tone: 'brand' },
  live: { label: 'Live', tone: 'ok' },
  ended: { label: 'Ended', tone: 'neutral' },
}

type Filter = DisplayStatus | 'all'

interface Form {
  id: string | null
  title: string
  body: string
  linkUrl: string
  linkLabel: string
  audience: Audience
  showBanner: boolean
  notify: boolean
  email: boolean
  when: 'now' | 'schedule'
  date: string
  time: string
  endDate: string
}

/** YYYY-MM-DD and HH:MM in Gulf time. */
function gstParts(d: Date): { date: string; time: string } {
  const g = new Date(d.getTime() + 4 * 3_600_000).toISOString()
  return { date: g.slice(0, 10), time: g.slice(11, 16) }
}

function emptyForm(): Form {
  const tomorrow = gstParts(new Date(Date.now() + 86_400_000))
  return {
    id: null,
    title: '',
    body: '',
    linkUrl: '',
    linkLabel: '',
    audience: 'learners',
    showBanner: true,
    notify: true,
    email: false,
    when: 'now',
    date: tomorrow.date,
    time: '10:00',
    endDate: '',
  }
}

function formOf(a: Announcement): Form {
  const start = a.startsAt ? gstParts(new Date(a.startsAt)) : null
  const base = emptyForm()
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    linkUrl: a.linkUrl ?? '',
    linkLabel: a.linkLabel ?? '',
    audience: (['learners', 'mentors', 'all'] as const).includes(a.audience as Audience) ? (a.audience as Audience) : 'learners',
    showBanner: a.showBanner,
    notify: a.notify,
    email: a.email,
    when: a.status === 'scheduled' ? 'schedule' : 'now',
    date: start?.date ?? base.date,
    time: start?.time ?? base.time,
    endDate: a.endsAt ? gstParts(new Date(a.endsAt)).date : '',
  }
}

function payload(f: Form, mode: 'now' | 'schedule' | 'draft') {
  return {
    title: f.title.trim(),
    body: f.body.trim(),
    linkUrl: f.linkUrl.trim() || null,
    linkLabel: f.linkUrl.trim() ? f.linkLabel.trim() || null : null,
    audience: f.audience,
    showBanner: f.showBanner,
    notify: f.notify,
    email: f.email,
    mode,
    startsAt: f.when === 'schedule' ? `${f.date}T${f.time}:00${GST}` : null,
    // It comes down at the end of its last day.
    endsAt: f.endDate ? `${f.endDate}T23:59:00${GST}` : null,
  }
}

/** "12 Nov 2026" for a YYYY-MM-DD day (read at noon, so no time zone moves it). */
const fmtDay = (day: string) => fmtDate(`${day}T12:00:00`)

/** "12 Nov 2026, 16:00" in Gulf time. */
const fmtWhen = (iso: string) => {
  const { date, time } = gstParts(new Date(iso))
  return `${fmtDay(date)}, ${time}`
}

export default function AnnouncementsAdminPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<Form>(emptyForm)
  const [filter, setFilter] = useState<Filter>('all')
  const [sentMsg, setSentMsg] = useState('')
  const ids = { title: useId(), body: useId(), link: useId(), linkLabel: useId(), date: useId(), time: useId(), end: useId() }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const list = useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: () => apiFetch<{ data: Announcement[] }>('/api/admin/announcements').then((r) => r.data),
  })
  const audience = useQuery({
    queryKey: ['admin', 'announcements', 'audience', form.audience],
    queryFn: () =>
      apiFetch<{ data: { people: number; emailable: number; emailEnabled: boolean } }>(
        `/api/admin/announcements/audience?audience=${form.audience}`,
      ).then((r) => r.data),
    staleTime: 60_000,
  })
  const emailEnabled = audience.data?.emailEnabled ?? false
  // If emails are switched off on the server, never send with email on.
  useEffect(() => {
    if (!emailEnabled && form.email) set('email', false)
  }, [emailEnabled, form.email])

  const save = useMutation({
    mutationFn: (mode: 'now' | 'schedule' | 'draft') =>
      apiFetch<{ data: Announcement }>(form.id ? `/api/admin/announcements/${form.id}` : '/api/admin/announcements', {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload(form, mode)),
      }).then((r) => ({ mode, row: r.data })),
    onSuccess: ({ mode, row }) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'announcements'] })
      const msg =
        mode === 'draft'
          ? `Saved "${row.title}" as a draft.`
          : mode === 'schedule'
            ? `Scheduled "${row.title}" for ${fmtWhen(row.startsAt!)} (Gulf time).`
            : `Sent. "${row.title}" is live for ${AUDIENCES.find((a) => a.value === form.audience)?.label.toLowerCase()}.`
      setSentMsg(msg)
      toast.success(msg)
      setForm(emptyForm())
      setFilter('all')
    },
    onError: (err) => toast.error(errorMessage(err, 'That didn’t save. Please try again.')),
  })

  const act = useMutation({
    mutationFn: ({ a, action }: { a: Announcement; action: 'end' | 'delete' }) =>
      action === 'end'
        ? apiFetch(`/api/admin/announcements/${a.id}/end`, { method: 'POST' })
        : apiFetch(`/api/admin/announcements/${a.id}`, { method: 'DELETE' }),
    onSuccess: (_d, { a, action }) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'announcements'] })
      toast.success(action === 'end' ? `"${a.title}" has ended.` : a.status === 'scheduled' ? `"${a.title}" is cancelled.` : 'Draft deleted.')
      if (form.id === a.id) setForm(emptyForm())
    },
    onError: (err) => toast.error(errorMessage(err, 'That didn’t work. Please try again.')),
  })

  const rows = list.data ?? []
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, draft: 0, scheduled: 0, live: 0, ended: 0 }
    for (const r of rows) c[r.displayStatus]++
    return c
  }, [rows])
  const shown = rows.filter((r) => filter === 'all' || r.displayStatus === filter)

  const noChannel = !form.showBanner && !form.notify && !form.email
  const ready = form.title.trim().length >= 3 && form.body.trim().length >= 3 && !noChannel
  const scheduleOk = form.when === 'now' || (!!form.date && !!form.time && new Date(`${form.date}T${form.time}:00${GST}`).getTime() > Date.now() + 60_000)
  const busy = save.isPending
  const preview = { id: 'preview', title: form.title.trim() || 'Your title', body: form.body.trim() || 'Your message appears here.', linkUrl: form.linkUrl.trim() || null, linkLabel: form.linkLabel.trim() || null }

  return (
    <AdminLayout>
      <PageHeader
        title="Announcements"
        subtitle="Tell learners and mentors what is new. Show it as a banner, in the notification bell, or both."
        actions={
          <a href="#past" className="inline-flex h-10 items-center rounded-[10px] border border-ui-line bg-ui-surface px-4 text-sm font-semibold text-ui-text hover:bg-ui-surface-2">
            Past announcements
          </a>
        }
      />

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="p-5 sm:p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (ready && scheduleOk) save.mutate(form.when)
            }}
            className="flex flex-col gap-5"
            aria-labelledby="h-new"
          >
            <div>
              <h2 id="h-new" className="text-base font-semibold text-ui-text">
                {form.id ? 'Edit announcement' : 'New announcement'}
              </h2>
              <p className="mt-0.5 text-[13px] text-ui-muted">Title and message are required. The preview shows what people will see.</p>
            </div>

            <Field label="Title" htmlFor={ids.title} hint={`${form.title.length} of ${TITLE_MAX} characters`}>
              <input id={ids.title} className={inputClass} value={form.title} maxLength={TITLE_MAX} onChange={(e) => set('title', e.target.value)} required />
            </Field>
            <Field label="Message" htmlFor={ids.body} hint={`${form.body.length} of ${BODY_MAX} characters`}>
              <textarea
                id={ids.body}
                className={cn(inputClass, 'h-auto min-h-[96px] py-2.5 leading-relaxed')}
                value={form.body}
                maxLength={BODY_MAX}
                rows={4}
                onChange={(e) => set('body', e.target.value)}
                required
              />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
              <Field label="Link (optional)" htmlFor={ids.link} hint="A page like /dashboard/courses, or an https:// link">
                <input id={ids.link} className={inputClass} value={form.linkUrl} maxLength={500} onChange={(e) => set('linkUrl', e.target.value)} placeholder="/dashboard/courses" />
              </Field>
              <Field label="Link text" htmlFor={ids.linkLabel}>
                <input id={ids.linkLabel} className={inputClass} value={form.linkLabel} maxLength={40} disabled={!form.linkUrl.trim()} onChange={(e) => set('linkLabel', e.target.value)} placeholder="Learn more" />
              </Field>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ui-text">Audience</span>
              <div className="flex flex-wrap items-center gap-3">
                <Segmented label="Audience" options={AUDIENCES} value={form.audience} onChange={(v) => set('audience', v)} />
                <span className="text-[13px] text-ui-muted" aria-live="polite">
                  {audience.isLoading ? 'Counting…' : audience.data ? `${audience.data.people.toLocaleString('en-US')} ${audience.data.people === 1 ? 'person' : 'people'}` : ''}
                </span>
              </div>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-ui-text">Channels</legend>
              <ChannelRow icon={Megaphone} title="Banner" hint="A strip at the top of their pages until it ends" checked={form.showBanner} onChange={(v) => set('showBanner', v)} />
              <ChannelRow icon={Bell} title="Notification bell" hint="Shows in the bell menu as unread" checked={form.notify} onChange={(v) => set('notify', v)} />
              <ChannelRow
                icon={Mail}
                title="Email"
                hint={emailEnabled ? `To ${audience.data?.emailable.toLocaleString('en-US') ?? 0} people who get announcement emails` : 'Off until the client approves learner emails'}
                checked={form.email}
                disabled={!emailEnabled}
                onChange={(v) => set('email', v)}
              />
            </fieldset>

            <div className="flex flex-col gap-3">
              <span className="text-sm font-medium text-ui-text">When</span>
              <Segmented
                label="When"
                options={[
                  { value: 'now', label: 'Send now' },
                  { value: 'schedule', label: 'Schedule' },
                ]}
                value={form.when}
                onChange={(v) => set('when', v)}
                className="self-start"
              />
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-3">
                {form.when === 'schedule' && (
                  <>
                    <Field label="Date" htmlFor={ids.date}>
                      <input id={ids.date} type="date" className={inputClass} value={form.date} onChange={(e) => set('date', e.target.value)} required />
                    </Field>
                    <Field label="Time" htmlFor={ids.time}>
                      <input id={ids.time} type="time" className={inputClass} value={form.time} onChange={(e) => set('time', e.target.value)} required />
                    </Field>
                  </>
                )}
                <Field label="End on (optional)" htmlFor={ids.end}>
                  <input id={ids.end} type="date" className={inputClass} value={form.endDate} min={form.when === 'schedule' ? form.date : undefined} onChange={(e) => set('endDate', e.target.value)} />
                </Field>
              </div>
              <p className="text-[13px] text-ui-muted">
                Times are in Gulf Standard Time (GMT+4). On the end date the banner comes down, and the bell item goes for anyone who hasn’t opened it.
              </p>
              {form.when === 'schedule' && !scheduleOk && <p className="text-[13px] text-ui-danger" role="alert">Pick a time later than now.</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-ui-line pt-4">
              <span className="me-auto text-[13px] text-ui-muted">
                {audience.data ? (
                  <>
                    Reaches about <strong className="font-semibold text-ui-text">{audience.data.people.toLocaleString('en-US')}</strong> {audience.data.people === 1 ? 'person' : 'people'}
                  </>
                ) : null}
              </span>
              {form.id && (
                <Button variant="ghost" onClick={() => setForm(emptyForm())} disabled={busy}>
                  Cancel editing
                </Button>
              )}
              <Button variant="secondary" onClick={() => save.mutate('draft')} disabled={busy || form.title.trim().length < 3 || form.body.trim().length < 3}>
                Save draft
              </Button>
              <Button type="submit" disabled={busy || !ready || !scheduleOk}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                {form.when === 'now' ? 'Send now' : 'Schedule'}
              </Button>
            </div>
            {sentMsg && (
              <p className="rounded-[10px] bg-ui-ok-soft px-3 py-2.5 text-[13px] text-ui-ok" role="status">
                {sentMsg}
              </p>
            )}
          </form>
        </Card>

        <aside aria-labelledby="h-preview" className="flex flex-col gap-4 xl:sticky xl:top-6">
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <h2 id="h-preview" className="text-base font-semibold text-ui-text">Preview</h2>
              <p className="mt-0.5 text-[13px] text-ui-muted">What {form.audience === 'mentors' ? 'mentors' : form.audience === 'all' ? 'people' : 'learners'} will see</p>
            </div>
            {form.showBanner && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-ui-muted">Banner</span>
                <AnnouncementCard a={preview} />
              </div>
            )}
            {form.notify && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-ui-muted">Notification bell</span>
                <div className="overflow-hidden rounded-[12px] border border-ui-line bg-ui-surface">
                  <div className="flex items-center gap-2 border-b border-ui-line px-3 py-2.5 text-[13px] font-semibold text-ui-text">
                    <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    Notifications
                  </div>
                  <div className="grid grid-cols-[8px_minmax(0,1fr)] items-start gap-2.5 p-3">
                    <span aria-hidden className="mt-1.5 h-2 w-2 rounded-full bg-ui-brand" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] font-semibold text-ui-text [overflow-wrap:anywhere]">{preview.title}</span>
                      <span className="line-clamp-2 text-xs leading-relaxed text-ui-muted [overflow-wrap:anywhere]">{preview.body}</span>
                      <span className="text-[11px] text-ui-muted">{form.when === 'now' ? 'Just now' : `${fmtDay(form.date)}, ${form.time}`}</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
            {noChannel && <Note>Pick at least one channel to see a preview.</Note>}
            {!emailEnabled && <Note icon={Mail}>Email is off until the client approves learner emails.</Note>}
          </Card>
        </aside>
      </div>

      <section id="past" aria-labelledby="h-past" className="scroll-mt-6">
        <TableCard
          header={
            <div className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 id="h-past" className="text-base font-semibold text-ui-text">Past announcements</h2>
                <p className="mt-0.5 text-[13px] text-ui-muted">Reach counts people who saw the banner or opened the notification.</p>
              </div>
              <FilterChips
                label="Filter by status"
                active={filter}
                onChange={(v) => setFilter(v as Filter)}
                options={(['all', 'draft', 'scheduled', 'live', 'ended'] as const).map((f) => ({ value: f, label: f === 'all' ? 'All' : STATUS[f].label, count: counts[f] }))}
              />
            </div>
          }
        >
          {list.isLoading ? (
            <div className="flex flex-col gap-2 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : list.isError ? (
            <EmptyState icon={Megaphone} title="Announcements didn’t load" body="Refresh the page to try again." />
          ) : shown.length === 0 ? (
            <EmptyState icon={Megaphone} title="Nothing here" body={filter === 'all' ? 'Your announcements will appear here.' : 'No announcements with this status.'} />
          ) : (
            <table className={cn(adminTableClass, 'min-w-[860px]')}>
              <thead>
                <tr>
                  <th>Announcement</th>
                  <th>Audience</th>
                  <th>Channels</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Reach</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => {
                  const st = STATUS[a.displayStatus]
                  const pct = a.audienceSize > 0 ? Math.round((a.reach / a.audienceSize) * 100) : 0
                  return (
                    <tr key={a.id}>
                      <td className="max-w-[320px]">
                        <span className="block truncate font-semibold text-ui-text">{a.title}</span>
                        <span className="block truncate text-xs text-ui-muted">{a.body}</span>
                      </td>
                      <td className="whitespace-nowrap text-[13px]">{a.audienceLabel}</td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {a.showBanner && <Tag>Banner</Tag>}
                          {a.notify && <Tag>Bell</Tag>}
                          {a.email && <Tag>Email</Tag>}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-[13px] tabular-nums text-ui-muted">
                        {a.status === 'draft' ? `Saved ${fmtDate(a.createdAt)}` : a.startsAt ? fmtWhen(a.startsAt) : ''}
                        {a.endsAt && a.status !== 'draft' && <span className="block text-xs">Ends {fmtDay(gstParts(new Date(a.endsAt)).date)}</span>}
                      </td>
                      <td>
                        <Pill tone={st.tone} dot>
                          {st.label}
                        </Pill>
                      </td>
                      <td>
                        {a.status === 'sent' ? (
                          <span className="flex flex-col gap-1.5">
                            <span className="text-[13px] tabular-nums">
                              <strong className="font-semibold text-ui-text">{a.reach.toLocaleString('en-US')}</strong>{' '}
                              <span className="text-ui-muted">of {a.audienceSize.toLocaleString('en-US')}</span>
                            </span>
                            <span className="block h-1.5 w-[110px] overflow-hidden rounded-full bg-ui-surface-2" aria-hidden>
                              <span className="block h-full rounded-full bg-ui-brand" style={{ width: `${pct}%` }} />
                            </span>
                          </span>
                        ) : (
                          <span className="text-[13px] text-ui-muted">Not sent yet</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <RowActions
                          a={a}
                          busy={act.isPending}
                          onEdit={() => {
                            setForm(formOf(a))
                            setSentMsg('')
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          onEnd={() => act.mutate({ a, action: 'end' })}
                          onDelete={() => act.mutate({ a, action: 'delete' })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </TableCard>
      </section>
    </AdminLayout>
  )
}

function ChannelRow({
  icon: Icon,
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  icon: typeof Bell
  title: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-[10px] border border-ui-line px-3 py-2.5', disabled && 'bg-ui-surface-2')}>
      <Icon className="h-[18px] w-[18px] shrink-0 text-ui-muted" strokeWidth={1.75} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-ui-text">
          {title}
          {disabled && <span className="ms-2 text-xs font-semibold text-ui-muted">Off</span>}
        </span>
        <span className="text-xs text-ui-muted">{hint}</span>
      </span>
      <Switch label={title} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  )
}

function Note({ children, icon: Icon = Info }: { children: React.ReactNode; icon?: typeof Info }) {
  return (
    <p className="flex items-start gap-2 rounded-[10px] bg-ui-surface-2 px-3 py-2.5 text-[13px] leading-snug text-ui-muted">
      <Icon className="mt-px h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function RowActions({
  a,
  busy,
  onEdit,
  onEnd,
  onDelete,
}: {
  a: Announcement
  busy: boolean
  onEdit: () => void
  onEnd: () => void
  onDelete: () => void
}) {
  if (a.displayStatus === 'ended') return null
  if (a.displayStatus === 'live') {
    return (
      <Button variant="secondary" size="sm" onClick={onEnd} disabled={busy} aria-label={`End now: ${a.title}`}>
        End now
      </Button>
    )
  }
  return (
    <span className="inline-flex gap-1.5">
      <Button variant="secondary" size="sm" onClick={onEdit} aria-label={`Edit: ${a.title}`}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit
      </Button>
      <Button variant="ghost" size="sm" onClick={onDelete} disabled={busy} aria-label={`${a.displayStatus === 'scheduled' ? 'Cancel' : 'Delete'}: ${a.title}`}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        {a.displayStatus === 'scheduled' ? 'Cancel' : 'Delete'}
      </Button>
    </span>
  )
}
