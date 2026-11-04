'use client'

/**
 * Admin → AI safety review (ported from SMEEP, on the approved canvas):
 * answers learners flagged in Ask Hana and the AI mentors. Pick one to read
 * the conversation, add notes for other admins, and mark it reviewed or
 * action taken. Everything a learner or the AI wrote is shown as plain text.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CircleCheck, Eye, Flag, Loader2, NotebookPen, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { AdminStat, IconButton, Pill, Select } from '@/components/admin/ui'
import { Avatar, Button, Card, EmptyState, FilterChips, PageHeader, Skeleton, inputClass } from '@/components/kit'
import { apiFetch } from '@/lib/api'
import { errorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'

type Status = 'new' | 'reviewed' | 'action_taken'
type Area = 'all' | 'hana' | 'mentor' | 'examiner'

interface Report {
  id: string
  surface: string
  surfaceLabel: string
  area: string
  reason: string
  reasonLabel: string
  note: string | null
  reply: string
  question: string | null
  excerpt: { role: 'learner' | 'ai'; text: string }[]
  page: string | null
  status: Status
  createdAt: string
  reviewedAt: string | null
  reporterName: string | null
  reporterEmail: string | null
  reviewerName: string | null
  notes: { id: string; text: string; by: string | null; createdAt: string }[]
}
interface ListData {
  counts: Record<Status, number>
  last30Days: number
  reports: Report[]
}

const STATUS: Record<Status, { label: string; tone: 'brand' | 'neutral' | 'ok' }> = {
  new: { label: 'New', tone: 'brand' },
  reviewed: { label: 'Reviewed', tone: 'neutral' },
  action_taken: { label: 'Action taken', tone: 'ok' },
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

/** Where it happened, as the list shows it: "Marketing coach" over "AI mentor". */
function where(r: Report): { main: string; sub: string } {
  if (r.surface.startsWith('mentor:')) {
    const name = r.surface.slice(7).replace(/-/g, ' ')
    return { main: name.charAt(0).toUpperCase() + name.slice(1), sub: 'AI mentor' }
  }
  if (r.area === 'hana') return { main: 'Hana', sub: r.surfaceLabel }
  return { main: r.surfaceLabel, sub: '' }
}

export default function AiSafetyAdminPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [area, setArea] = useState<Area>('all')
  const [selId, setSelId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const areaId = useId()
  const noteId = useId()

  const query = useQuery({
    queryKey: ['admin', 'ai-reports', area],
    queryFn: () => apiFetch<{ data: ListData }>(`/api/admin/ai-reports?status=all&area=${area}`).then((r) => r.data),
  })
  const all = useMemo(() => query.data?.reports ?? [], [query.data])
  const rows = all.filter((r) => filter === 'all' || r.status === filter)
  const sel = all.find((r) => r.id === selId) ?? null

  // Open the newest report on first load, on wide screens (on phones the panel sits under the list).
  useEffect(() => {
    if (selId === null && all.length && window.matchMedia('(min-width: 1280px)').matches) setSelId(all[0]!.id)
  }, [all, selId])

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'ai-reports'] })
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      apiFetch(`/api/admin/ai-reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: (_d, { status }) => {
      void refresh()
      toast.success(status === 'new' ? 'Reopened' : `Marked ${STATUS[status].label.toLowerCase()}`)
    },
    onError: (err) => toast.error(errorMessage(err, 'That didn’t save. Please try again.')),
  })
  const addNote = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      apiFetch(`/api/admin/ai-reports/${id}/notes`, { method: 'POST', body: JSON.stringify({ text }) }),
    onSuccess: () => {
      setDraft('')
      void refresh()
    },
    onError: (err) => toast.error(errorMessage(err, 'The note didn’t save. Please try again.')),
  })

  const counts = query.data?.counts ?? { new: 0, reviewed: 0, action_taken: 0 }
  const total = counts.new + counts.reviewed + counts.action_taken

  return (
    <AdminLayout>
      <PageHeader
        title="AI safety review"
        subtitle="Learners can flag any answer from Hana or the AI mentors. Review each one and record what you did."
      />

      <section aria-label="Review figures" className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AdminStat icon={Flag} label="New" value={<span className="text-ui-brand-text">{counts.new}</span>} hint="Waiting for review" />
        <AdminStat icon={Eye} label="Reviewed" value={counts.reviewed} hint="No change needed" />
        <AdminStat icon={Check} label="Action taken" value={counts.action_taken} hint="Fixed or escalated" />
        <AdminStat icon={ShieldCheck} label="Last 30 days" value={query.data?.last30Days ?? 0} hint="Answers flagged" />
      </section>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterChips
          label="Filter by status"
          active={filter}
          onChange={(v) => setFilter(v as Status | 'all')}
          className="min-w-0 flex-1"
          options={[
            { value: 'all', label: 'All', count: total },
            { value: 'new', label: 'New', count: counts.new },
            { value: 'reviewed', label: 'Reviewed', count: counts.reviewed },
            { value: 'action_taken', label: 'Action taken', count: counts.action_taken },
          ]}
        />
        <label htmlFor={areaId} className="sr-only">
          Where
        </label>
        <Select id={areaId} value={area} onChange={(e) => setArea(e.target.value as Area)} className="sm:w-48">
          <option value="all">All AI features</option>
          <option value="hana">Hana</option>
          <option value="mentor">AI mentors</option>
          <option value="examiner">AI Examiner</option>
        </Select>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="overflow-hidden">
          <h2 className="sr-only">Flagged answers</h2>
          {query.isLoading ? (
            <div className="flex flex-col gap-2 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : query.isError ? (
            <EmptyState icon={ShieldCheck} title="Reports didn’t load" body="Refresh the page to try again." />
          ) : rows.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Nothing to show" body="No flagged answers match these filters." />
          ) : (
            <div className="relative overflow-x-auto">
              <div className="min-w-[600px]">
                <div aria-hidden className="grid h-[38px] grid-cols-[72px_minmax(150px,1.1fr)_minmax(0,2fr)_116px] items-center gap-x-3.5 bg-ui-surface-2 px-5 text-xs font-semibold text-ui-muted">
                  <span>Date</span>
                  <span>Where</span>
                  <span>Learner’s reason</span>
                  <span>Status</span>
                </div>
                <ul>
                  {rows.map((r) => {
                    const w = where(r)
                    const on = r.id === selId
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`Open flag from ${r.reporterName ?? 'a learner'}, ${w.main}, ${STATUS[r.status].label}`}
                          onClick={() => {
                            setSelId(r.id)
                            setDraft('')
                          }}
                          className={cn(
                            'grid min-h-[56px] w-full grid-cols-[72px_minmax(150px,1.1fr)_minmax(0,2fr)_116px] items-center gap-x-3.5 border-t border-ui-line px-5 py-2.5 text-left text-sm text-ui-text transition-colors hover:bg-ui-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-brand',
                            on && 'bg-ui-brand-soft shadow-[inset_3px_0_0_var(--ui-brand)] hover:bg-ui-brand-soft',
                          )}
                        >
                          <span className="text-[13px] tabular-nums text-ui-muted">{day(r.createdAt)}</span>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{w.main}</span>
                            {w.sub && <span className="truncate text-xs text-ui-muted">{w.sub}</span>}
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="line-clamp-2 leading-snug">{r.note || r.reasonLabel}</span>
                            <span className="truncate text-xs text-ui-muted">
                              {r.note ? `${r.reasonLabel} · ` : ''}
                              {r.reporterName ?? 'Deleted account'}
                            </span>
                          </span>
                          <span>
                            <Pill tone={STATUS[r.status].tone} dot>
                              {STATUS[r.status].label}
                            </Pill>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )}
        </Card>

        <Card className="flex min-w-0 flex-col xl:sticky xl:top-6" role="region" aria-label="Review panel">
          {sel ? (
            <>
              <div className="flex items-start gap-2.5 border-b border-ui-line py-4 pe-3.5 ps-5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="text-base font-semibold text-ui-text">Flagged answer</h2>
                  <span className="text-[13px] text-ui-muted">
                    {where(sel).main}
                    {where(sel).sub && ` · ${where(sel).sub}`}
                  </span>
                </div>
                <Pill tone={STATUS[sel.status].tone} dot className="mt-0.5">
                  {STATUS[sel.status].label}
                </Pill>
                <IconButton label="Close panel" icon={X} onClick={() => setSelId(null)} />
              </div>

              <div className="flex flex-col gap-4 px-5 py-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
                  <div className="min-w-0">
                    <dt className="text-xs text-ui-muted">Learner</dt>
                    <dd className="mt-0.5 truncate font-medium text-ui-text" title={sel.reporterEmail ?? undefined}>
                      {sel.reporterName ?? 'Deleted account'}
                    </dd>
                    {sel.reporterEmail && <dd className="truncate text-xs text-ui-muted">{sel.reporterEmail}</dd>}
                  </div>
                  <div>
                    <dt className="text-xs text-ui-muted">Flagged on</dt>
                    <dd className="mt-0.5 font-medium text-ui-text">{stamp(sel.createdAt)}</dd>
                  </div>
                </dl>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-ui-muted">Learner’s reason</span>
                  <p className="whitespace-pre-line rounded-[10px] border-s-[3px] border-ui-line bg-ui-surface-2 px-3 py-2.5 text-[13.5px] leading-relaxed text-ui-text [overflow-wrap:anywhere]">
                    <strong className="font-semibold">{sel.reasonLabel}.</strong>
                    {sel.note ? ` ${sel.note}` : ''}
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-semibold text-ui-muted">Conversation excerpt</span>
                  {sel.excerpt.map((t, i) => (
                    <Turn key={i} who={t.role === 'learner' ? `Learner, ${sel.reporterName ?? ''}`.replace(/, $/, '') : where(sel).main} learner={t.role === 'learner'} text={t.text} />
                  ))}
                  <Turn who={where(sel).main} text={sel.reply} flagged />
                </div>

                <div className="flex flex-col gap-2 border-t border-ui-line pt-3.5">
                  <span className="text-xs font-semibold text-ui-muted">Notes</span>
                  {sel.notes.length === 0 ? (
                    <span className="text-[13px] text-ui-muted">No notes yet.</span>
                  ) : (
                    sel.notes.map((n) => (
                      <div key={n.id} className="flex items-start gap-2.5">
                        <Avatar name={n.by ?? 'Admin'} size={24} />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-xs text-ui-muted">
                            <strong className="font-semibold text-ui-text">{n.by ?? 'Admin'}</strong> · {stamp(n.createdAt)}
                          </span>
                          <span className="whitespace-pre-line text-[13px] leading-relaxed text-ui-text [overflow-wrap:anywhere]">{n.text}</span>
                        </span>
                      </div>
                    ))
                  )}
                  {sel.reviewerName && sel.status !== 'new' && (
                    <span className="text-xs text-ui-muted">
                      {STATUS[sel.status].label} by {sel.reviewerName}
                      {sel.reviewedAt ? `, ${stamp(sel.reviewedAt)}` : ''}
                    </span>
                  )}
                  <label htmlFor={noteId} className="sr-only">
                    Add note
                  </label>
                  <textarea
                    id={noteId}
                    rows={2}
                    maxLength={2000}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Add a note for other admins, for example what you changed"
                    className={cn(inputClass, 'h-auto min-h-[64px] py-2 leading-relaxed')}
                  />
                </div>
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-ui-line px-5 py-3.5">
                {sel.status === 'new' ? (
                  <Button onClick={() => setStatus.mutate({ id: sel.id, status: 'reviewed' })} disabled={setStatus.isPending}>
                    <Check className="h-4 w-4" aria-hidden />
                    Mark reviewed
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setStatus.mutate({ id: sel.id, status: 'new' })} disabled={setStatus.isPending}>
                    Reopen
                  </Button>
                )}
                <Button variant="secondary" onClick={() => addNote.mutate({ id: sel.id, text: draft.trim() })} disabled={!draft.trim() || addNote.isPending}>
                  {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <NotebookPen className="h-4 w-4" aria-hidden />}
                  Add note
                </Button>
                {sel.status !== 'action_taken' && (
                  <Button variant="secondary" size="sm" className="ms-auto" onClick={() => setStatus.mutate({ id: sel.id, status: 'action_taken' })} disabled={setStatus.isPending}>
                    <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                    Mark action taken
                  </Button>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              className="py-12"
              title="Select a flagged answer"
              body="Pick a row to read the conversation, mark it reviewed or add a note."
            />
          )}
        </Card>
      </div>
    </AdminLayout>
  )
}

function Turn({ who, text, learner, flagged }: { who: string; text: string; learner?: boolean; flagged?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1', learner ? 'items-end' : 'items-start')}>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-ui-muted">
        {who}
        {flagged && (
          <Pill tone="brand" className="h-5">
            <Flag className="h-3 w-3" aria-hidden />
            Flagged answer
          </Pill>
        )}
      </span>
      <span
        dir="auto"
        className={cn(
          'max-w-[92%] whitespace-pre-line rounded-xl px-3 py-2.5 text-[13.5px] leading-relaxed text-ui-text [overflow-wrap:anywhere]',
          learner ? 'bg-ui-surface-2' : 'border border-ui-line bg-ui-surface',
          flagged && 'border-[1.5px] border-ui-brand bg-ui-brand-soft',
        )}
      >
        {text}
      </span>
    </div>
  )
}
