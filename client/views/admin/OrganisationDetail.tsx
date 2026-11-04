'use client'

/**
 * One organisation, for admins: its sign-up link, partner logins and adding
 * existing participants, then the same dashboard its partner logins see, with
 * a way to remove a participant, and archiving at the bottom (SMEEP db40881).
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Archive, Building2, RefreshCw, UserMinus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { Button, Card, EmptyState, Field, PageHeader, Skeleton, btn, inputClass } from '@/components/kit'
import { IconButton, Pill, Switch, fmtDate } from '@/components/admin/ui'
import { JoinLinkCard, OrganisationDashboard, lastSeen } from '@/components/organisations/OrganisationDashboard'
import {
  ORGANISATION_DATASETS,
  addOrganisationLearners,
  archiveOrganisation,
  downloadFrom,
  fetchOrganisationDashboard,
  fetchOrganisationPartners,
  invitePartner,
  organisationTypeLabel,
  regenerateJoinCode,
  removeOrganisationLearner,
  removePartner,
  updateOrganisation,
  type AddLearnersResult,
  type OrganisationLearner,
  type PartnerContact,
} from '@/lib/api/organisations'
import { errorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function PartnersCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient()
  const key = ['admin', 'organisations', orgId, 'partners']
  const { data: partners, isLoading } = useQuery({ queryKey: key, queryFn: () => fetchOrganisationPartners(orgId) })
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [removing, setRemoving] = useState<PartnerContact | null>(null)
  const invite = useMutation({
    mutationFn: () => invitePartner(orgId, { fullName: name.trim(), email: email.trim() }),
    onSuccess: (p) => {
      toast.success('Partner login created', { description: `${p.email} is emailed where to sign in. They sign in with a code sent to that address.` })
      setName('')
      setEmail('')
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['admin', 'organisations'], exact: true })
    },
    onError: (e) => toast.error(errorMessage(e, 'The partner login wasn’t created. Please try again.')),
  })
  const remove = useMutation({
    mutationFn: (p: PartnerContact) => removePartner(orgId, p.id),
    onSuccess: (_d, p) => {
      toast.success(`${p.fullName}’s login removed`, { description: 'They were signed out everywhere.' })
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['admin', 'organisations'], exact: true })
    },
    onError: (e) => toast.error(errorMessage(e, 'That didn’t work. Please try again.')),
    onSettled: () => setRemoving(null),
  })
  const ok = name.trim().length >= 2 && EMAIL.test(email.trim())

  return (
    <Card className="flex min-w-0 flex-col p-5">
      <h2 className="text-base font-semibold text-ui-text">Partner logins</h2>
      <p className="mt-0.5 text-[13px] text-ui-muted">People at the organisation who can see its participants (read only). They sign in with an emailed code.</p>
      <ul className="mt-3 flex flex-col divide-y divide-ui-line">
        {isLoading && (
          <li className="py-2">
            <Skeleton className="h-8" />
          </li>
        )}
        {partners?.length === 0 && <li className="py-2 text-[13px] text-ui-muted">No partner logins yet.</li>}
        {partners?.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ui-text">
                <span className="truncate">{p.fullName}</span>
                {p.status === 'invited' && <Pill tone="line">Not signed in yet</Pill>}
              </p>
              <p className="truncate text-xs text-ui-muted">
                {p.email}
                {p.status === 'active' ? `, last active ${lastSeen(p.at).toLowerCase()}` : p.at ? `, added ${fmtDate(p.at)}` : ''}
              </p>
            </div>
            <IconButton label={`Remove ${p.fullName}’s login`} icon={UserMinus} tone="danger" onClick={() => setRemoving(p)} />
          </li>
        ))}
      </ul>
      <form
        className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 border-t border-ui-line pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok) invite.mutate()
        }}
      >
        <input className={inputClass} aria-label="Partner’s full name" placeholder="Full name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <input
          className={inputClass}
          aria-label="Partner’s email"
          type="email"
          placeholder="Email"
          value={email}
          maxLength={254}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" disabled={!ok || invite.isPending}>
          <UserPlus className="h-4 w-4" aria-hidden />
          Add partner login
        </Button>
      </form>
      <ConfirmDialog
        open={!!removing}
        title="Remove partner login"
        message={`${removing?.fullName ?? 'They'} will be signed out at once and can’t see this organisation any more. Participants aren’t affected.`}
        confirmLabel="Remove login"
        onConfirm={() => removing && remove.mutate(removing)}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  )
}

function AddLearnersCard({ orgId, onAdded }: { orgId: string; onAdded: () => void }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<AddLearnersResult | null>(null)
  const emails = [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => EMAIL.test(s)))]
  const add = useMutation({
    mutationFn: () => addOrganisationLearners(orgId, emails),
    onSuccess: (r) => {
      setResult(r)
      const n = r.added.length + r.moved.length
      if (n) {
        toast.success(`${n} participant${n === 1 ? '' : 's'} added`)
        setText('')
        onAdded()
      }
    },
    onError: (e) => toast.error(errorMessage(e, 'That didn’t work. Please try again.')),
  })
  const lines = result
    ? [
        result.added.length && `${result.added.length} added`,
        result.moved.length && `${result.moved.length} moved from another organisation`,
        result.already.length && `${result.already.length} already here`,
        result.notFound.length && `No Hadafi account: ${result.notFound.join(', ')}`,
        result.notLearners.length && `Not learner accounts: ${result.notLearners.join(', ')}`,
      ].filter((l): l is string => Boolean(l))
    : []
  return (
    <Card className="flex min-w-0 flex-col p-5">
      <h2 className="text-base font-semibold text-ui-text">Add existing participants</h2>
      <p className="mt-0.5 text-[13px] text-ui-muted">
        Paste their emails. Each is told in their notifications what the organisation can see, and can leave from their profile.
      </p>
      <Field label="Emails" htmlFor="org-add" className="mt-3">
        <textarea
          id="org-add"
          className={cn(inputClass, 'h-auto min-h-[84px] py-2')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="one@company.com, two@company.com"
        />
      </Field>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-ui-muted">{emails.length ? `${emails.length} email${emails.length === 1 ? '' : 's'}` : ''}</span>
        <Button variant="secondary" onClick={() => add.mutate()} disabled={!emails.length || emails.length > 500 || add.isPending}>
          Add participants
        </Button>
      </div>
      {lines.length > 0 && (
        <ul role="status" className="mt-3 flex flex-col gap-0.5 break-words rounded-[10px] bg-ui-surface-2 px-3 py-2 text-[13px] text-ui-text">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default function OrganisationDetailPage({ id }: { id: string }) {
  const qc = useQueryClient()
  const router = useRouter()
  const dashKey = ['admin', 'organisations', id, 'dashboard']
  const { data, isLoading, error } = useQuery({ queryKey: dashKey, queryFn: () => fetchOrganisationDashboard(id), retry: false })
  const [confirm, setConfirm] = useState<'regenerate' | 'archive' | null>(null)
  const [removing, setRemoving] = useState<OrganisationLearner | null>(null)
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: dashKey })
    void qc.invalidateQueries({ queryKey: ['admin', 'organisations'], exact: true })
  }

  const patch = useMutation({
    mutationFn: (body: { joinEnabled: boolean }) => updateOrganisation(id, body),
    onSuccess: (_d, b) => {
      toast.success(b.joinEnabled ? 'Sign-up link turned on' : 'Sign-up link turned off')
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e, 'That didn’t save. Please try again.')),
  })
  const regenerate = useMutation({
    mutationFn: () => regenerateJoinCode(id),
    onSuccess: () => {
      toast.success('New sign-up link ready', { description: 'The old link no longer works.' })
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e, 'That didn’t work. Please try again.')),
    onSettled: () => setConfirm(null),
  })
  const archive = useMutation({
    mutationFn: () => archiveOrganisation(id),
    onSuccess: () => {
      toast.success('Organisation archived')
      // Only the list: this organisation's own queries would 404 now.
      void qc.invalidateQueries({ queryKey: ['admin', 'organisations'], exact: true })
      router.push('/admin/organisations')
    },
    onError: (e) => toast.error(errorMessage(e, 'That didn’t work. Please try again.')),
    onSettled: () => setConfirm(null),
  })
  const removeLearner = useMutation({
    mutationFn: (l: OrganisationLearner) => removeOrganisationLearner(id, l.id),
    onSuccess: (_d, l) => {
      toast.success(`${l.fullName} removed from the organisation`)
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e, 'That didn’t work. Please try again.')),
    onSettled: () => setRemoving(null),
  })

  const org = data?.organisation
  return (
    <AdminLayout>
      <Link href="/admin/organisations" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ui-muted hover:text-ui-text">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        Organisations
      </Link>
      <PageHeader
        title={org?.name ?? 'Organisation'}
        subtitle={
          org ? `${organisationTypeLabel(org.type)}. The cards at the top are for Hadafi admins; partner logins see everything below them.` : undefined
        }
        actions={
          org ? (
            <ExportMenu datasets={ORGANISATION_DATASETS} download={(d, f) => downloadFrom(`/api/admin/organisations/${id}/exports`, d, f)} />
          ) : undefined
        }
      />
      {isLoading ? (
        <Skeleton className="h-[320px]" />
      ) : error || !data || !org ? (
        <EmptyState
          icon={Building2}
          title="This organisation couldn’t be loaded"
          body={errorMessage(error, 'It may have been archived.')}
          action={
            <Link href="/admin/organisations" className={btn({ variant: 'secondary' })}>
              All organisations
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-3">
            <JoinLinkCard link={org.joinLink} enabled={org.joinEnabled}>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-ui-line pt-3">
                <div className="flex items-center gap-2.5 text-sm text-ui-text">
                  <Switch checked={org.joinEnabled} onChange={(v) => patch.mutate({ joinEnabled: v })} disabled={patch.isPending} label="Sign-up link on" />
                  <span aria-hidden>{org.joinEnabled ? 'Link on' : 'Link off'}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setConfirm('regenerate')}>
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  New link
                </Button>
              </div>
            </JoinLinkCard>
            <PartnersCard orgId={id} />
            <AddLearnersCard orgId={id} onAdded={refresh} />
          </div>

          <OrganisationDashboard
            data={data}
            learnerHref={(l) => `/admin/organisations/${id}/learners/${l.id}`}
            learnerAction={(l) => (
              <IconButton label={`Remove ${l.fullName} from ${org.name}`} icon={UserMinus} tone="danger" onClick={() => setRemoving(l)} />
            )}
          />

          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ui-text">Archive organisation</h2>
              <p className="mt-0.5 text-[13px] text-ui-muted">
                The sign-up link stops, partner logins are removed, and participants leave it. Their accounts and progress stay.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setConfirm('archive')} className="text-ui-danger">
              <Archive className="h-4 w-4" aria-hidden />
              Archive
            </Button>
          </Card>
        </div>
      )}
      <ConfirmDialog
        open={confirm === 'regenerate'}
        title="Make a new sign-up link?"
        message="The current link stops working straight away. Anyone you shared it with needs the new one."
        confirmLabel="Make new link"
        tone="primary"
        onConfirm={() => regenerate.mutate()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'archive'}
        title={`Archive ${org?.name ?? 'organisation'}?`}
        message="Partner logins are removed and signed out, and participants leave the organisation. Their accounts and progress are kept. This can’t be undone."
        confirmLabel="Archive"
        onConfirm={() => archive.mutate()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={!!removing}
        title="Remove from organisation"
        message={`${removing?.fullName ?? 'This participant'} leaves ${org?.name ?? 'the organisation'}. Their account and progress stay.`}
        confirmLabel="Remove"
        onConfirm={() => removing && removeLearner.mutate(removing)}
        onCancel={() => setRemoving(null)}
      />
    </AdminLayout>
  )
}
