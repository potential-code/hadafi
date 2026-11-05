'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Copy, Link2, Loader2, Plus, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Pill, TableCard, adminTableClass, fmtDate } from '@/components/admin/ui'
import { Avatar, Button, EmptyState, FilterChips, PageHeader, Skeleton } from '@/components/kit'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/api/errors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InviteUsedBy {
  id: string
  fullName: string | null
  email: string | null
  country: string | null
  createdAt: string | null
}

interface Invite {
  id: string
  code: string
  status: 'active' | 'used' | 'revoked'
  createdAt: string
  inviteLink: string
  usedBy: InviteUsedBy | null
}

interface ApiList<T> {
  success: boolean
  data: T[]
}

interface ApiItem<T> {
  success: boolean
  data: T
}

interface CreateInviteResponse {
  id: string
  code: string
  inviteLink: string
}

type Filter = Invite['status'] | 'all'

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Used', value: 'used' },
  { label: 'Revoked', value: 'revoked' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: Invite['status'] }) {
  if (status === 'used')
    return (
      <Pill tone="ok">
        <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Used
      </Pill>
    )
  if (status === 'revoked')
    return (
      <Pill tone="danger">
        <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Revoked
      </Pill>
    )
  return (
    <Pill tone="brand" dot>
      Active
    </Pill>
  )
}

function CodeChip({ code }: { code: string }) {
  return (
    <code className="whitespace-nowrap rounded-md bg-ui-brand-soft px-2 py-[3px] font-mono text-[13px] font-semibold text-ui-brand-text">
      {code}
    </code>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-ui-muted">{children}</span>
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function InvitesPage() {
  const qc = useQueryClient()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [latestLink, setLatestLink] = useState<string | null>(null)
  const [latestCode, setLatestCode] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const {
    data: invites = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Invite[]>({
    queryKey: ['admin', 'invites'],
    queryFn: () => apiFetch<ApiList<Invite>>('/api/admin/invites').then((r) => r.data),
  })

  const generateMutation = useMutation({
    mutationFn: () =>
      apiFetch<ApiItem<CreateInviteResponse>>('/api/admin/invites', { method: 'POST' }).then((r) => r.data),
    onSuccess: (data) => {
      setLatestLink(data.inviteLink)
      setLatestCode(data.code)
      qc.invalidateQueries({ queryKey: ['admin', 'invites'] })
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'The invite code could not be created. Please try again.'))
    },
  })

  async function copyLink(link: string, id: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(id)
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000)
    } catch {
      toast.error('Could not copy the link', { description: link })
    }
  }

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: invites.length, active: 0, used: 0, revoked: 0 }
    for (const i of invites) if (i.status in c) c[i.status] += 1
    return c
  }, [invites])

  const visible = useMemo(
    () => (filter === 'all' ? invites : invites.filter((i) => i.status === filter)),
    [invites, filter],
  )

  const members = useMemo(() => invites.filter((i) => i.usedBy), [invites])

  // Link shown in the generate card: the one just generated, else the newest
  // unused code (the API returns newest first).
  const newestActive = invites.find((i) => i.status === 'active')
  const shownLink = latestLink && latestCode
    ? { label: 'New invite link', link: latestLink, id: 'latest' }
    : newestActive
      ? { label: 'Newest unused invite link', link: newestActive.inviteLink, id: 'latest' }
      : null

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <PageHeader className="mb-0" title="Invites" subtitle="Generate and manage invite codes for new Hadafi members." />

        {/* Generate new invite */}
        <section
          aria-labelledby="h-gen"
          className="flex flex-col gap-4 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span
              aria-hidden
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-ui-brand-soft text-ui-brand-text sm:inline-flex"
            >
              <Link2 className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="h-gen" className="text-base font-semibold text-ui-text">Generate a new invite code</h2>
              <p className="mt-0.5 text-sm text-ui-muted">Each code is single-use and creates a pre-filled sign-up link.</p>
            </div>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="w-full sm:w-auto"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              )}
              {generateMutation.isPending ? 'Generating' : 'Generate code'}
            </Button>
          </div>

          {shownLink && (
            <div className="flex flex-col gap-2 border-t border-ui-line pt-4">
              <span className="text-[13px] font-semibold text-ui-text" id="h-link">{shownLink.label}</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div
                  className="flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-[10px] border border-ui-line bg-ui-surface-2 px-3 sm:flex-1"
                  aria-labelledby="h-link"
                >
                  <Link2 className="h-4 w-4 shrink-0 text-ui-muted" strokeWidth={1.75} aria-hidden />
                  <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ui-text" title={shownLink.link}>
                    {shownLink.link}
                  </code>
                </div>
                <Button variant="secondary" onClick={() => copyLink(shownLink.link, shownLink.id)}>
                  {copiedId === shownLink.id ? (
                    <>
                      <Check className="h-4 w-4 text-ui-ok" strokeWidth={2} aria-hidden /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Copy link
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* All invite codes */}
        <section aria-labelledby="h-all">
          <TableCard
            header={
              <div className="flex flex-col gap-2 px-5 pb-2.5 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-3">
                <h2 id="h-all" className="text-base font-semibold text-ui-text">All invite codes</h2>
                <FilterChips<Filter>
                  label="Filter by status"
                  options={FILTERS.map((f) => ({ ...f, count: isLoading ? undefined : counts[f.value] }))}
                  active={filter}
                  onChange={setFilter}
                  className="max-w-full pb-0"
                />
              </div>
            }
          >
            {isLoading ? (
              <div className="flex flex-col gap-3 border-t border-ui-line p-5" aria-busy="true" aria-label="Loading invite codes">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : isError ? (
              <EmptyState
                className="border-t border-ui-line"
                icon={AlertCircle}
                title="Failed to load invite codes"
                body="Check your connection and try again."
                action={
                  <Button variant="secondary" size="sm" onClick={() => refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                className="border-t border-ui-line"
                icon={Link2}
                title={invites.length === 0 ? 'No invite codes yet' : `No ${filter} invite codes`}
                body={invites.length === 0 ? 'Generate your first one above.' : undefined}
              />
            ) : (
              <table className={cn(adminTableClass, 'min-w-[860px]')}>
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Status</th>
                    <th scope="col" aria-sort="descending">Created</th>
                    <th scope="col">Used by</th>
                    <th scope="col">Email</th>
                    <th scope="col">Country</th>
                    <th scope="col">Registered</th>
                    <th scope="col" className="!text-right">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((invite) => (
                    <tr key={invite.id}>
                      <td>
                        <CodeChip code={invite.code} />
                      </td>
                      <td>
                        <StatusPill status={invite.status} />
                      </td>
                      <td className="whitespace-nowrap text-ui-muted">{fmtDate(invite.createdAt)}</td>
                      {invite.usedBy ? (
                        <>
                          <td className="whitespace-nowrap font-medium text-ui-text">
                            {invite.usedBy.fullName ?? <Muted>No name</Muted>}
                          </td>
                          <td className="whitespace-nowrap text-ui-muted">{invite.usedBy.email ?? 'No email'}</td>
                          <td className="whitespace-nowrap text-ui-muted">{invite.usedBy.country ?? 'Not given'}</td>
                          <td className="whitespace-nowrap text-ui-muted">{fmtDate(invite.usedBy.createdAt) || 'Unknown'}</td>
                        </>
                      ) : (
                        <td colSpan={4} className="text-[13px] text-ui-muted">
                          {invite.status === 'revoked'
                            ? 'Revoked before use'
                            : invite.status === 'used'
                              ? // Used, but that account has since been deleted.
                                'Account since removed'
                              : 'Not used yet'}
                        </td>
                      )}
                      <td className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => copyLink(invite.inviteLink, invite.id)}
                          aria-label={copiedId === invite.id ? `Copied link for ${invite.code}` : `Copy link for ${invite.code}`}
                        >
                          {copiedId === invite.id ? (
                            <>
                              <Check className="h-[15px] w-[15px] text-ui-ok" strokeWidth={2} aria-hidden /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden /> Copy
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>
        </section>

        {/* Members who joined with a code */}
        <section aria-labelledby="h-used">
          <TableCard
            header={
              <div className="border-b border-ui-line px-5 py-3.5">
                <h2 id="h-used" className="text-base font-semibold text-ui-text">Members who joined with a code</h2>
              </div>
            }
            footer={
              !isLoading && !isError && members.length > 0
                ? `${members.length} ${members.length === 1 ? 'member' : 'members'}`
                : undefined
            }
          >
            {isLoading ? (
              <div className="flex flex-col gap-3 p-5" aria-hidden>
                <Skeleton className="h-8 w-full" />
              </div>
            ) : isError ? (
              <EmptyState icon={AlertCircle} title="Failed to load members" />
            ) : members.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="No one has used an invite code yet"
                body="When someone signs up with a code, their name, email, country and registration date show here and the code moves to Used."
              />
            ) : (
              <table className={cn(adminTableClass, 'min-w-[640px]')}>
                <thead>
                  <tr>
                    <th scope="col">Member</th>
                    <th scope="col">Email</th>
                    <th scope="col">Country</th>
                    <th scope="col">Registered</th>
                    <th scope="col">Code</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((invite) => {
                    const u = invite.usedBy!
                    const name = u.fullName ?? u.email ?? 'Member'
                    return (
                      <tr key={invite.id}>
                        <td>
                          <span className="flex items-center gap-3 whitespace-nowrap">
                            <Avatar name={name} size={32} />
                            <span className="font-semibold text-ui-text">{u.fullName ?? <Muted>No name</Muted>}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-ui-muted">{u.email ?? 'No email'}</td>
                        <td className="whitespace-nowrap text-ui-muted">{u.country ?? 'Not given'}</td>
                        <td className="whitespace-nowrap text-ui-muted">{fmtDate(u.createdAt) || 'Unknown'}</td>
                        <td>
                          <CodeChip code={invite.code} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </TableCard>
        </section>
      </div>
    </AdminLayout>
  )
}
