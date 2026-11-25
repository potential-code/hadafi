'use client'

/**
 * One participant's full record, for their organisation's partner contacts
 * and for admins: overview (streak, badges, certificates, recent activity),
 * courses unit by unit with exam answers and action plans, AI Examiner
 * scorecards and transcripts, events and mentor sessions. Mentors' private
 * notes are never part of it. AI text is shown as plain text, never rendered.
 * Ported from SMEEP 68d8fd4 without journeys and saved AI chats.
 */
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Award, Check, ChevronDown, Circle, Flame, Trophy, UserX, X } from 'lucide-react'
import { Avatar, Card, Chip, EmptyState, PageHeader, ProgressBar, Skeleton, Tabs } from '@/components/kit'
import { Pill, TableCard, adminTableClass, fmtDate } from '@/components/admin/ui'
import { apiFetch } from '@/lib/api'
import type { ParticipantRecordData } from '@/lib/api/organisations'
import { cn } from '@/lib/utils'

type CourseRecord = ParticipantRecordData['courses'][number]
type Tab = 'overview' | 'courses' | 'examiner' | 'sessions'

const DIMENSION: Record<string, string> = {
  courseKnowledge: 'Course knowledge',
  application: 'Application',
  communication: 'Communication',
  problemSolving: 'Problem solving',
  professionalism: 'Professionalism',
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const at = (iso: string) => `${fmtDate(iso)}, ${new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3', className)}>
      <h2 className="text-base font-semibold text-ui-text">{title}</h2>
      {children}
    </section>
  )
}

function Overview({ r }: { r: ParticipantRecordData }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Section title="Recent activity">
        <Card className="px-5 py-2">
          {r.activity.length === 0 ? (
            <EmptyState title="Nothing yet" body="Activity appears here as they learn." />
          ) : (
            <ol className="flex flex-col">
              {r.activity.map((a, i) => (
                <li key={i} className="flex flex-col gap-0.5 border-t border-ui-line py-2.5 first:border-t-0 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="shrink-0 text-xs tabular-nums text-ui-muted sm:w-[150px]">{at(a.at)}</span>
                  <span className="min-w-0 text-sm text-ui-text">{a.text}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </Section>
      <div className="flex min-w-0 flex-col gap-5">
        <Section title="Streak">
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <Flame className="h-6 w-6 shrink-0 text-ui-brand-text" aria-hidden />
              <span className="text-sm text-ui-text">
                <strong className="text-lg">{r.streak.current}</strong>-day streak, longest {r.streak.longest},{' '}
                {plural(r.streak.activeDaysLast60, 'active day')} in the last 60
              </span>
            </div>
            <ol aria-label="This week" className="grid grid-cols-7 gap-1.5 text-center">
              {r.streak.week.map((d) => (
                <li key={d.date} className="flex flex-col items-center gap-1 text-[11px] text-ui-muted">
                  {new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}
                  <span
                    role="img"
                    className={cn('h-6 w-6 rounded-full', d.done ? 'bg-ui-brand' : 'border border-ui-line')}
                    aria-label={d.done ? 'Learned that day' : 'No learning that day'}
                  />
                </li>
              ))}
            </ol>
          </Card>
        </Section>
        <Section title={`Badges (${r.badges.length})`}>
          <Card className="p-5">
            {r.badges.length === 0 ? (
              <p className="text-sm text-ui-muted">No badges yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {r.badges.map((b) => (
                  <li key={b.key} className="flex items-start gap-2.5">
                    <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-ui-brand-text" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ui-text">{b.title}</span>
                      <span className="block text-xs text-ui-muted">
                        {b.description}, {fmtDate(b.earnedAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
        <Section title={`Certificates (${r.certificates.length})`}>
          <Card className="p-5">
            {r.certificates.length === 0 ? (
              <p className="text-sm text-ui-muted">No certificates yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {r.certificates.map((c) => (
                  <li key={c.number} className="flex items-center gap-2.5">
                    <Award className="h-4 w-4 shrink-0 text-ui-brand-text" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ui-text">{c.course}</span>
                      <span className="block text-xs text-ui-muted">
                        {c.number}, {fmtDate(c.issuedAt)}
                      </span>
                    </span>
                    {c.status !== 'active' && <Pill tone="line">Withdrawn</Pill>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      </div>
    </div>
  )
}

function ExamAttempt({ exam }: { exam: CourseRecord['exams'][number] }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-[10px] border border-ui-line">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 text-sm text-ui-text">
          <strong className="font-semibold">{exam.type === 'pre' ? 'Pre-test' : 'Final exam'}</strong>, attempt {exam.attempt}
          {exam.completedAt && <span className="text-ui-muted">, {fmtDate(exam.completedAt)}</span>}
        </span>
        <Pill tone={exam.passed ? 'ok' : exam.type === 'pre' ? 'line' : 'danger'}>{exam.score ?? '–'}%</Pill>
        <ChevronDown className={cn('h-4 w-4 text-ui-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ol className="flex flex-col gap-3 border-t border-ui-line px-3.5 py-3">
          {exam.answers.map((a, i) => (
            <li key={i} className="flex flex-col gap-1">
              <p className="text-sm font-medium text-ui-text">
                {i + 1}. {a.question}
              </p>
              <ul className="flex flex-col gap-0.5 ps-4">
                {a.options.map((o, j) => {
                  const chosen = a.chosen === j
                  const right = a.correct === j
                  return (
                    <li
                      key={j}
                      className={cn(
                        'flex items-center gap-1.5 text-[13px]',
                        right ? 'font-semibold text-ui-ok' : chosen ? 'text-ui-danger' : 'text-ui-muted',
                      )}
                    >
                      {right ? (
                        <Check className="h-3.5 w-3.5 shrink-0" aria-label="Correct answer" />
                      ) : chosen ? (
                        <X className="h-3.5 w-3.5 shrink-0" aria-label="Their answer" />
                      ) : (
                        <Circle className="h-2 w-2 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0">{o}</span>
                      {chosen && <span className="text-xs font-normal">(their answer)</span>}
                    </li>
                  )
                })}
              </ul>
              {a.chosen === null && <p className="ps-4 text-xs text-ui-muted">Not answered</p>}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

function Courses({ r }: { r: ParticipantRecordData }) {
  if (!r.courses.length) return <EmptyState title="No courses yet" body="Courses appear here once they start one." />
  return (
    <div className="flex flex-col gap-4">
      {r.courses.map((c) => {
        const done = c.units.filter((u) => u.status === 'completed').length
        const modulesInOrder = [...new Set(c.units.map((u) => u.module))]
        return (
          <Card key={c.courseId} className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="min-w-0 flex-1 text-[17px] font-semibold text-ui-text">{c.title}</h3>
              {c.completedAt ? (
                <Chip tone="ok">Completed {fmtDate(c.completedAt)}</Chip>
              ) : (
                c.enrolledAt && <Chip>Started {fmtDate(c.enrolledAt)}</Chip>
              )}
            </div>
            <div className="flex items-center gap-3">
              <ProgressBar value={c.progress} className="flex-1" label={`${c.title} progress`} />
              <span className="shrink-0 text-sm tabular-nums text-ui-muted">
                {c.progress}%, {done}/{c.units.length} units
              </span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-1.5 text-xs font-semibold text-ui-muted">Units</p>
                {modulesInOrder.map((m) => (
                  <div key={m} className="mb-2">
                    <p className="text-[13px] font-medium text-ui-text">{m}</p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {c.units
                        .filter((u) => u.module === m)
                        .map((u, i) => (
                          <li key={i} className="flex items-center gap-2 text-[13px]">
                            {u.status === 'completed' ? (
                              <Check className="h-4 w-4 shrink-0 text-ui-ok" aria-label="Done" />
                            ) : u.status === 'in_progress' ? (
                              <Circle className="h-4 w-4 shrink-0 fill-ui-brand/30 text-ui-brand-text" aria-label="In progress" />
                            ) : (
                              <Circle className="h-4 w-4 shrink-0 text-ui-muted" aria-label="Not started" />
                            )}
                            <span className={cn('min-w-0 flex-1', u.status === 'completed' ? 'text-ui-text' : 'text-ui-muted')}>{u.title}</span>
                            {u.completedAt && <span className="shrink-0 text-xs text-ui-muted">{fmtDate(u.completedAt)}</span>}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-ui-muted">Exams</p>
                  {c.exams.length === 0 ? (
                    <p className="text-[13px] text-ui-muted">No exam attempts yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {c.exams.map((x, i) => (
                        <ExamAttempt key={i} exam={x} />
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-ui-muted">Action plans and survey answers</p>
                  {c.responses.length === 0 ? (
                    <p className="text-[13px] text-ui-muted">None yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {c.responses.map((x, i) => (
                        <li key={i} className="rounded-[10px] bg-ui-surface-2 px-3 py-2">
                          <p className="text-xs text-ui-muted">
                            {x.kind === 'action-plan' ? 'Action plan' : 'Survey'}, {x.unit}
                          </p>
                          <p className="text-[13px] font-medium text-ui-text">{x.prompt}</p>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-ui-text">{x.answer || 'No answer'}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function Examiner({ r }: { r: ParticipantRecordData }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!r.examiner.length) return <EmptyState title="No AI Examiner role-plays yet" />
  return (
    <ul className="flex flex-col gap-4">
      {r.examiner.map((x, i) => (
        <li key={i}>
          <Card className="flex min-w-0 flex-col gap-3 p-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-[15px] font-semibold text-ui-text">{x.scenario}</h3>
                <p className="text-xs text-ui-muted">
                  {x.course}, {x.mode}, {at(x.createdAt)}
                </p>
              </div>
              <span className="text-2xl font-semibold tabular-nums text-ui-text">
                {x.overallScore}
                <span className="text-sm font-normal text-ui-muted">/100</span>
              </span>
            </div>
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {Object.entries(x.dimensions).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-[13px]">
                  <span className="w-[130px] shrink-0 text-ui-muted">{DIMENSION[k] ?? k}</span>
                  <ProgressBar value={v} className="flex-1" label={`${DIMENSION[k] ?? k} ${v}`} />
                  <span className="w-8 text-right tabular-nums">{v}</span>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-ui-muted">Strengths</p>
                <ul className="mt-1 list-disc ps-5 text-[13px] text-ui-text">
                  {x.strengths.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-ui-muted">To improve</p>
                <ul className="mt-1 list-disc ps-5 text-[13px] text-ui-text">
                  {x.improvements.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ui-text">{x.feedback}</p>
            <button
              type="button"
              className="self-start text-[13px] font-semibold text-ui-brand-text hover:underline"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
            >
              {open === i ? 'Hide transcript' : `Show transcript (${plural(x.transcript.length, 'turn')})`}
            </button>
            {open === i && (
              <ol className="flex max-h-[420px] flex-col gap-2 overflow-y-auto rounded-[10px] border border-ui-line p-3">
                {x.transcript.map((t, j) => (
                  <li
                    key={j}
                    dir="auto"
                    className={cn(
                      'max-w-[85%] rounded-[12px] px-3 py-2 text-[13px] text-ui-text',
                      t.role === 'learner' ? 'self-end bg-ui-brand-soft' : 'self-start bg-ui-surface-2',
                    )}
                  >
                    <span className="block text-[11px] font-semibold text-ui-muted">{t.role === 'learner' ? 'Participant' : 'Role-play'}</span>
                    <span className="whitespace-pre-wrap break-words">{t.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </li>
      ))}
    </ul>
  )
}

function Events({ r }: { r: ParticipantRecordData }) {
  const [now] = useState(() => Date.now())
  return (
    <Section title={`Events (${r.events.length})`}>
      <TableCard>
        {r.events.length === 0 ? (
          <EmptyState title="No events booked" />
        ) : (
          <table className={cn(adminTableClass, 'min-w-[560px]')}>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">When</th>
                <th scope="col">Booked</th>
                <th scope="col">Attended</th>
              </tr>
            </thead>
            <tbody>
              {r.events.map((e, i) => {
                const past = Date.parse(e.endsAt) < now
                return (
                  <tr key={i}>
                    <td className="font-medium text-ui-text">{e.title}</td>
                    <td className="whitespace-nowrap text-ui-muted">{at(e.startsAt)}</td>
                    <td className="whitespace-nowrap text-ui-muted">{fmtDate(e.bookedAt)}</td>
                    <td>
                      {e.attendedMinutes != null ? (
                        e.attendedMinutes > 0 ? <Pill tone="ok">{e.attendedMinutes} min</Pill> : <Pill tone="line">Didn’t join</Pill>
                      ) : past ? (
                        <span className="text-xs text-ui-muted">{e.format === 'zoom' ? 'Waiting for Zoom' : 'Not tracked'}</span>
                      ) : (
                        <span className="text-xs text-ui-muted">Upcoming</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </TableCard>
    </Section>
  )
}

function Mentors({ r }: { r: ParticipantRecordData }) {
  return (
    <Section title={`Mentor sessions (${r.mentorSessions.length})`}>
      <TableCard>
        {r.mentorSessions.length === 0 ? (
          <EmptyState title="No mentor sessions yet" />
        ) : (
          <table className={cn(adminTableClass, 'min-w-[560px]')}>
            <thead>
              <tr>
                <th scope="col">Mentor</th>
                <th scope="col">When</th>
                <th scope="col">Length</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {r.mentorSessions.map((s, i) => (
                <tr key={i}>
                  <td className="font-medium text-ui-text">{s.mentorName}</td>
                  <td className="whitespace-nowrap text-ui-muted">{at(s.startsAt)}</td>
                  <td className="text-ui-muted">{s.minutes} min</td>
                  <td>
                    <Pill tone={s.status === 'completed' ? 'ok' : s.status === 'cancelled' ? 'line' : 'brand'}>
                      {s.status === 'cancelled'
                        ? `Cancelled${s.cancelledBy ? ` by ${s.cancelledBy === 'sme' ? 'participant' : 'mentor'}` : ''}`
                        : s.status === 'completed'
                          ? 'Completed'
                          : 'Booked'}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
      <p className="text-xs text-ui-muted">Mentors&rsquo; private session notes stay with the mentor.</p>
    </Section>
  )
}

export function ParticipantRecord({ endpoint, backHref, backLabel }: { endpoint: string; backHref: string; backLabel: string }) {
  const { data: r, isLoading, error } = useQuery({
    queryKey: ['participant', endpoint],
    queryFn: () => apiFetch<{ data: ParticipantRecordData }>(endpoint).then((x) => x.data),
    retry: false,
  })
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <>
      <Link href={backHref} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ui-muted hover:text-ui-text">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        {backLabel}
      </Link>
      {isLoading ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the record">
          <Skeleton className="h-16" />
          <Skeleton className="h-[300px]" />
        </div>
      ) : error || !r ? (
        <EmptyState
          icon={UserX}
          title="This participant’s record isn’t available"
          body={(error as { error?: { message?: string } } | null)?.error?.message ?? 'They may have left the organisation.'}
        />
      ) : (
        <>
          <PageHeader
            title={
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={r.profile.fullName} src={r.profile.avatarUrl} size={44} />
                <span className="min-w-0 break-words">{r.profile.fullName}</span>
              </span>
            }
            subtitle={[
              r.profile.email,
              r.profile.company,
              r.profile.country,
              `joined ${fmtDate(r.profile.createdAt)}`,
              r.profile.lastActiveAt ? `last active ${fmtDate(r.profile.lastActiveAt)}` : null,
            ]
              .filter(Boolean)
              .join(', ')}
          />
          <div className="mb-4 flex flex-wrap gap-2">
            <Chip>{plural(r.courses.length, 'course')}</Chip>
            <Chip>{plural(r.certificates.length, 'certificate')}</Chip>
            <Chip>{plural(r.badges.length, 'badge')}</Chip>
            <Chip>{plural(r.examiner.length, 'AI Examiner role-play')}</Chip>
            <Chip>{plural(r.events.length, 'event')}</Chip>
            <Chip>{plural(r.mentorSessions.length, 'mentor session')}</Chip>
            <Chip>{r.streak.current}-day streak</Chip>
            <Chip>{plural(r.profile.points, 'point')}</Chip>
          </div>
          <Tabs<Tab>
            label="Participant record"
            className="mb-5"
            active={tab}
            onChange={setTab}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'courses', label: 'Courses and exams', count: r.courses.length },
              { value: 'examiner', label: 'AI Examiner', count: r.examiner.length },
              { value: 'sessions', label: 'Events and mentors', count: r.events.length + r.mentorSessions.length },
            ]}
          />
          {tab === 'overview' && <Overview r={r} />}
          {tab === 'courses' && <Courses r={r} />}
          {tab === 'examiner' && <Examiner r={r} />}
          {tab === 'sessions' && (
            <div className="flex flex-col gap-5">
              <Events r={r} />
              <Mentors r={r} />
            </div>
          )}
        </>
      )}
    </>
  )
}
