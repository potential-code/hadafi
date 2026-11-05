'use client'

import { Fragment, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, ChevronDown, ChevronRight, ExternalLink, Linkedin, Loader2, Mail, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Pill, SearchInput, Tag, TableCard, adminTableClass, fmtDate } from '@/components/admin/ui'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { Button, EmptyState, FilterChips, PageHeader, Skeleton } from '@/components/kit'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/api/errors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppStatus = 'pending' | 'approved' | 'rejected'
type Filter = AppStatus | 'all'

interface MentorApplication {
  id: string
  name: string
  email: string
  linkedinUrl: string | null
  hourlyRate: number | null
  expertise: string[] | null
  methods: string[] | null
  passion: string | null
  status: AppStatus
  createdAt: string
}

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

type PendingAction = { kind: 'approve' | 'reject'; app: MentorApplication }

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: AppStatus }) {
  if (status === 'approved')
    return (
      <Pill tone="ok">
        <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Approved
      </Pill>
    )
  if (status === 'rejected')
    return (
      <Pill tone="danger">
        <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Rejected
      </Pill>
    )
  return (
    <Pill tone="brand" dot>
      Pending
    </Pill>
  )
}

function ActionButtons({
  app,
  busy,
  onAsk,
  className,
}: {
  app: MentorApplication
  busy: string | null
  onAsk: (a: PendingAction) => void
  className?: string
}) {
  return (
    <span className={cn('flex gap-1.5', className)}>
      <Button size="sm" disabled={!!busy} onClick={() => onAsk({ kind: 'approve', app })}>
        {busy === `${app.id}-approve` ? (
          <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden />
        ) : (
          <Check className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />
        )}
        Approve
      </Button>
      <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => onAsk({ kind: 'reject', app })}>
        {busy === `${app.id}-reject` ? (
          <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden />
        ) : (
          <X className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />
        )}
        Reject
      </Button>
    </span>
  )
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-xs font-semibold text-ui-muted">{label}</span>
      {children}
    </div>
  )
}

function ExpandedDetail({
  app,
  busy,
  onAsk,
}: {
  app: MentorApplication
  busy: string | null
  onAsk: (a: PendingAction) => void
}) {
  const expertise = app.expertise ?? []
  const methods = app.methods ?? []
  return (
    // On phones the table scrolls sideways, so pin the panel to the visible width.
    <div className="max-sm:sticky max-sm:left-5 max-sm:w-[calc(100vw-74px)]">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 whitespace-normal rounded-[10px] border border-ui-line bg-ui-surface px-4 py-3.5 md:grid-cols-[1fr_1fr_1.4fr]">
        <DetailBlock label="Areas of expertise">
          {expertise.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {expertise.map((e) => (
                <Pill key={e} tone="brand">{e}</Pill>
              ))}
            </span>
          ) : (
            <span className="text-sm text-ui-muted">Not given</span>
          )}
        </DetailBlock>
        <DetailBlock label="Mentoring methods">
          {methods.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {methods.map((m) => (
                <Tag key={m}>{m}</Tag>
              ))}
            </span>
          ) : (
            <span className="text-sm text-ui-muted">Not given</span>
          )}
        </DetailBlock>
        <DetailBlock label="Passion and mission">
          {app.passion ? (
            <p className="text-sm leading-normal text-ui-text">{app.passion}</p>
          ) : (
            <span className="text-sm text-ui-muted">Not given</span>
          )}
        </DetailBlock>
      </div>
      {app.status === 'pending' && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-ui-muted">
            <Mail className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Approving sends the mentor a setup email.
          </p>
          {/* Phones: the Actions column is off screen, so repeat the actions here. */}
          <ActionButtons app={app} busy={busy} onAsk={onAsk} className="sm:hidden" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function ApplicationsPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<PendingAction | null>(null)

  // Fetch every application once so the filter pills can show counts; the
  // status filter and search run on the client.
  const {
    data: applications = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<MentorApplication[]>({
    queryKey: ['admin', 'mentor-applications', 'all'],
    queryFn: () =>
      apiFetch<{ success: boolean; data: MentorApplication[] }>('/api/admin/mentor-applications').then((r) => r.data),
  })

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: applications.length, pending: 0, approved: 0, rejected: 0 }
    for (const a of applications) if (a.status in c) c[a.status] += 1
    return c
  }, [applications])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return applications.filter(
      (a) =>
        (activeTab === 'all' || a.status === activeTab) &&
        (!q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)),
    )
  }, [applications, activeTab, search])

  async function handleApprove(id: string) {
    setActionLoading(id + '-approve')
    try {
      await apiFetch(`/api/admin/mentor-applications/${id}/approve`, { method: 'POST' })
      toast.success('Application approved', { description: 'The mentor will receive a setup email shortly.' })
      qc.invalidateQueries({ queryKey: ['admin', 'mentor-applications'] })
    } catch (err) {
      toast.error(errorMessage(err, 'The application could not be approved. Please try again.'))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(id: string) {
    setActionLoading(id + '-reject')
    try {
      await apiFetch(`/api/admin/mentor-applications/${id}/reject`, { method: 'POST' })
      toast.success('Application rejected')
      qc.invalidateQueries({ queryKey: ['admin', 'mentor-applications'] })
    } catch (err) {
      toast.error(errorMessage(err, 'The application could not be rejected. Please try again.'))
    } finally {
      setActionLoading(null)
    }
  }

  function runConfirmed() {
    if (!confirm) return
    const { kind, app } = confirm
    setConfirm(null)
    if (kind === 'approve') void handleApprove(app.id)
    else void handleReject(app.id)
  }

  const emptyTitle =
    search.trim()
      ? 'No applications match your search'
      : activeTab === 'all'
        ? 'No applications yet'
        : `No ${activeTab} applications`
  const emptyBody = search.trim()
    ? 'Try a different name or email, or clear the search.'
    : activeTab === 'all'
      ? 'When an expert applies to mentor through the Join as an Expert form, their application shows here.'
      : undefined

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <PageHeader
          className="mb-0"
          title="Mentor Applications"
          subtitle="Review and manage expert mentor applications."
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips
            label="Filter by status"
            options={FILTERS.map((f) => ({ ...f, count: isLoading ? undefined : counts[f.value] }))}
            active={activeTab}
            onChange={(v) => {
              setActiveTab(v)
              setExpandedId(null)
            }}
            className="max-w-full"
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name or email"
            label="Search applications"
            className="w-full sm:w-[280px]"
          />
        </div>

        <section aria-label="Applications">
          {isLoading ? (
            <TableCard>
              <div className="flex flex-col gap-3 p-5" aria-busy="true" aria-label="Loading applications">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            </TableCard>
          ) : isError ? (
            <TableCard>
              <EmptyState
                icon={AlertCircle}
                title="Failed to load applications"
                body="Check your connection and try again."
                action={
                  <Button variant="secondary" size="sm" onClick={() => refetch()}>
                    Try again
                  </Button>
                }
              />
            </TableCard>
          ) : visible.length === 0 ? (
            <TableCard>
              <EmptyState icon={Users} title={emptyTitle} body={emptyBody} />
            </TableCard>
          ) : (
            <TableCard
              footer={
                visible.length === applications.length
                  ? `${applications.length} ${applications.length === 1 ? 'application' : 'applications'}`
                  : `${visible.length} of ${applications.length} applications`
              }
            >
              <table className={cn(adminTableClass, 'min-w-[900px]')}>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col" className="hidden 2xl:table-cell">Expertise</th>
                    <th scope="col">LinkedIn</th>
                    <th scope="col">Rate</th>
                    <th scope="col">Applied</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="!text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((app) => {
                    const open = expandedId === app.id
                    const expertise = app.expertise ?? []
                    const toggle = () => setExpandedId(open ? null : app.id)
                    return (
                      <Fragment key={app.id}>
                        <tr onClick={toggle} className={cn('cursor-pointer', open && 'bg-ui-bg')}>
                          <td className="whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggle()
                              }}
                              aria-expanded={open}
                              aria-label={`${open ? 'Hide' : 'Show'} details for ${app.name}`}
                              className="-ml-1.5 mr-1.5 inline-flex h-[22px] w-[22px] items-center justify-center rounded-md align-middle text-ui-muted hover:bg-ui-surface-2 hover:text-ui-text focus-visible:outline-2 focus-visible:outline-ui-brand"
                            >
                              {open ? (
                                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                              )}
                            </button>
                            <span className="font-semibold text-ui-text">{app.name}</span>
                          </td>
                          <td className="max-w-[220px] truncate text-ui-muted" title={app.email}>{app.email}</td>
                          <td className="hidden max-w-[260px] 2xl:table-cell">
                            {expertise.length > 0 ? (
                              <span className="flex flex-nowrap gap-1 overflow-hidden">
                                {expertise.slice(0, 2).map((e) => (
                                  <Tag key={e}>{e}</Tag>
                                ))}
                                {expertise.length > 2 && <Tag>+{expertise.length - 2}</Tag>}
                              </span>
                            ) : (
                              <span className="text-ui-muted">Not given</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            {app.linkedinUrl ? (
                              <a
                                href={app.linkedinUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`View ${app.name} on LinkedIn (opens in a new tab)`}
                                className="inline-flex items-center gap-1 text-[13px] font-semibold text-ui-brand-text hover:underline"
                              >
                                <Linkedin className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
                                View
                                <ExternalLink className="h-[13px] w-[13px]" strokeWidth={1.75} aria-hidden />
                              </a>
                            ) : (
                              <span className="text-ui-muted">Not given</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            {app.hourlyRate !== null ? (
                              <span className="font-semibold text-ui-text tabular-nums">
                                ${app.hourlyRate}
                                <span className="font-normal text-ui-muted">/hr</span>
                              </span>
                            ) : (
                              <span className="text-ui-muted">Not set</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap text-ui-muted">{fmtDate(app.createdAt)}</td>
                          <td>
                            <StatusPill status={app.status} />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {app.status === 'pending' && (
                              <ActionButtons app={app} busy={actionLoading} onAsk={setConfirm} className="justify-end" />
                            )}
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-ui-bg">
                            <td colSpan={8} className="!border-t-0 !pb-4 !pt-0">
                              <ExpandedDetail app={app} busy={actionLoading} onAsk={setConfirm} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </TableCard>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!confirm}
        tone={confirm?.kind === 'reject' ? 'danger' : 'primary'}
        title={confirm?.kind === 'reject' ? `Reject ${confirm.app.name}?` : `Approve ${confirm?.app.name ?? ''}?`}
        message={
          confirm?.kind === 'reject'
            ? 'The application moves to Rejected. The applicant is not emailed.'
            : 'They become a mentor and receive an email with a link to set up their account.'
        }
        confirmLabel={confirm?.kind === 'reject' ? 'Reject' : 'Approve and send email'}
        onConfirm={runConfirmed}
        onCancel={() => setConfirm(null)}
      />
    </AdminLayout>
  )
}
