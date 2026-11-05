'use client'

/**
 * Admin → Organisations: partners whose participants Hadafi follows together.
 * Each has a sign-up link participants join with, and partner logins who see a
 * read-only portal of those participants (SMEEP db40881).
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Building2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Button, EmptyState, Field, PageHeader, Skeleton, inputClass } from '@/components/kit'
import { Modal, Pill, Select, TableCard, adminTableClass, fmtDate } from '@/components/admin/ui'
import {
  ORGANISATION_TYPES,
  ORGANISATION_TYPE_LABELS,
  createOrganisation,
  fetchOrganisations,
  organisationTypeLabel,
  type OrganisationType,
} from '@/lib/api/organisations'
import { errorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'

function NewOrganisationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const router = useRouter()
  const [name, setName] = useState('')
  const [type, setType] = useState<OrganisationType>('government')
  const create = useMutation({
    mutationFn: () => createOrganisation({ name: name.trim(), type }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'organisations'] })
      toast.success('Organisation created')
      onClose()
      setName('')
      router.push(`/admin/organisations/${r.id}`)
    },
    onError: (e) => toast.error(errorMessage(e, 'That didn’t save. Please try again.')),
  })
  const ok = name.trim().length >= 2
  return (
    <Modal
      open={open}
      title="New organisation"
      description="A partner whose participants you want to follow together. You get a sign-up link to share."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-org" disabled={!ok || create.isPending}>
            Create organisation
          </Button>
        </>
      }
    >
      <form
        id="new-org"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok) create.mutate()
        }}
      >
        <Field label="Name" htmlFor="org-name">
          <input
            id="org-name"
            className={inputClass}
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            placeholder="For example, Ministry of Economy"
          />
        </Field>
        <Field label="Type" htmlFor="org-type">
          <Select id="org-type" className="h-10 w-full" value={type} onChange={(e) => setType(e.target.value as OrganisationType)}>
            {ORGANISATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {ORGANISATION_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  )
}

export default function OrganisationsPage() {
  const [creating, setCreating] = useState(false)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'organisations'], queryFn: fetchOrganisations })
  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      New organisation
    </Button>
  )

  return (
    <AdminLayout>
      <PageHeader
        title="Organisations"
        subtitle="Partners whose participants you follow together. Participants join with the organisation’s sign-up link; partner logins get a read-only portal."
        actions={newButton}
      />
      <TableCard>
        {isLoading ? (
          <div className="flex flex-col gap-2 p-5" aria-busy="true" aria-label="Loading organisations">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={AlertCircle}
            title="Organisations didn’t load"
            body="Check your connection and try again."
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : !data?.length ? (
          <EmptyState
            icon={Building2}
            title="No organisations yet"
            body="Create one for each partner, such as a ministry, university or corporate, then share its sign-up link."
            action={newButton}
          />
        ) : (
          <table className={cn(adminTableClass, 'min-w-[820px]')}>
            <thead>
              <tr>
                <th scope="col">Organisation</th>
                <th scope="col">Type</th>
                <th scope="col" className="!text-right">Participants</th>
                <th scope="col" className="!text-right">Active, 30 days</th>
                <th scope="col" className="!text-right">Partner logins</th>
                <th scope="col">Sign-up link</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/organisations/${o.id}`} className="font-semibold text-ui-text hover:text-ui-brand-text hover:underline">
                      {o.name}
                    </Link>
                  </td>
                  <td className="text-ui-muted">{organisationTypeLabel(o.type)}</td>
                  <td className="text-right tabular-nums">{o.learners}</td>
                  <td className="text-right tabular-nums">{o.activeLearners}</td>
                  <td className="text-right tabular-nums">{o.partners}</td>
                  <td>{o.joinEnabled ? <Pill tone="ok">On, {o.joinCode}</Pill> : <Pill tone="line">Off</Pill>}</td>
                  <td className="whitespace-nowrap text-ui-muted">{fmtDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
      <NewOrganisationDialog open={creating} onClose={() => setCreating(false)} />
    </AdminLayout>
  )
}
