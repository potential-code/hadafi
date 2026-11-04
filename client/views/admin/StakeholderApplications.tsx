'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  Building2,
  ExternalLink,
  Globe,
  Landmark,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { IconButton, Pill, SearchInput, Tag, TableCard, adminTableClass, fmtDate } from '@/components/admin/ui'
import { Button, EmptyState, PageHeader, Skeleton } from '@/components/kit'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StakeholderApplication {
  id: string
  type: string
  fullName: string
  title: string
  email: string
  country: string
  website: string
  phone: string
  representing: string
  involvement: string[]
  createdAt: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface TypeMeta {
  label: string
  badge: string
  /** Lower-case noun used in sentences ("No supporter submissions yet"). */
  noun: string
  form: string
  description: string
  icon: LucideIcon
}

// Hadafi's public site has two stakeholder programs: Supporters (stored as
// type "vc") and Government. University, corporate and incubator forms are
// folded into Supporters, so they get no tab here.
const TYPE_META: Record<string, TypeMeta> = {
  vc: {
    label: 'Supporters',
    badge: 'Supporter',
    noun: 'supporter',
    form: 'Join as a Supporter',
    description: 'Companies, investors, universities and incubators supporting women entrepreneurs, newest first',
    icon: Building2,
  },
  government: {
    label: 'Government',
    badge: 'Government',
    noun: 'government',
    form: 'Join as a Government',
    description: 'Multilateral and government entity submissions, newest first',
    icon: Landmark,
  },
}

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailField({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2')}>
      <dt className="mb-1 text-xs font-semibold text-ui-muted">{label}</dt>
      <dd className="break-words text-sm text-ui-text">{children || <span className="text-ui-muted">Not given</span>}</dd>
    </div>
  )
}

function TypeTabs({ type }: { type: string }) {
  const navRef = useRef<HTMLElement>(null)
  // Phones: the tab row scrolls sideways; keep the current type visible.
  useEffect(() => {
    const nav = navRef.current
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (nav && el && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft = el.offsetLeft - nav.offsetLeft - 16
    }
  }, [type])
  return (
    <nav ref={navRef} aria-label="Stakeholder type" className="flex gap-1 overflow-x-auto border-b border-ui-line">
      {Object.entries(TYPE_META).map(([key, m]) => {
        const on = key === type
        const Icon = m.icon
        return (
          <Link
            key={key}
            href={`/admin/stakeholder-applications/${key}`}
            aria-current={on ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ui-brand',
              on ? 'border-ui-brand font-semibold text-ui-text' : 'border-transparent font-medium text-ui-muted hover:text-ui-text',
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {m.label}
          </Link>
        )
      })}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function StakeholderApplicationsView({ type }: { type: string }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<StakeholderApplication | null>(null)
  const detailRef = useRef<HTMLElement>(null)

  const meta: TypeMeta = TYPE_META[type] ?? {
    label: type,
    badge: type,
    noun: type,
    form: 'stakeholder',
    description: 'Stakeholder submissions, newest first',
    icon: Building2,
  }

  const {
    data: applications = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<StakeholderApplication[]>({
    queryKey: ['admin', 'stakeholder-applications', type],
    queryFn: () =>
      apiFetch<{ success: boolean; data: StakeholderApplication[] }>(
        `/api/admin/stakeholder-applications?type=${encodeURIComponent(type)}`,
      ).then((r) => r.data),
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return applications
    return applications.filter(
      (a) =>
        a.fullName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.representing.toLowerCase().includes(q),
    )
  }, [applications, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const first = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, filtered.length)

  function handleSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function select(app: StakeholderApplication) {
    setSelected(app)
  }

  // On narrow screens the detail panel stacks under the table; bring it into view.
  useEffect(() => {
    if (!selected || !detailRef.current) return
    if (window.matchMedia('(max-width: 1279px)').matches) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [selected])

  // Escape closes the detail panel.
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected])

  let body: React.ReactNode
  if (isLoading) {
    body = (
      <TableCard>
        <div className="flex flex-col gap-3 p-5" aria-busy="true" aria-label="Loading submissions">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </TableCard>
    )
  } else if (isError) {
    body = (
      <TableCard>
        <EmptyState
          icon={AlertCircle}
          title="Failed to load submissions"
          body="Check your connection and try again."
          action={
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          }
        />
      </TableCard>
    )
  } else if (paginated.length === 0) {
    body = (
      <TableCard>
        {search.trim() ? (
          <EmptyState
            icon={meta.icon}
            title="No results for that search"
            body="Try a different name, email or organization, or clear the search."
          />
        ) : (
          <EmptyState
            icon={meta.icon}
            title={`No ${meta.noun} submissions yet`}
            body={`When someone completes the ${meta.form} form, their submission shows here with their organization, contact details and how they want to be involved.`}
          />
        )}
      </TableCard>
    )
  } else {
    body = (
      <TableCard
        footer={
          <div className="-my-0.5 flex flex-wrap items-center justify-between gap-3">
            <span>
              Showing {first} to {last} of {filtered.length}
            </span>
            <span className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </span>
          </div>
        }
      >
        <table className={cn(adminTableClass, 'min-w-[680px]')}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Organization</th>
              <th scope="col">Email</th>
              <th scope="col">Country</th>
              <th scope="col">Website</th>
              <th scope="col" aria-sort="descending">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((app) => {
              const on = selected?.id === app.id
              return (
                <tr
                  key={app.id}
                  onClick={() => select(app)}
                  aria-selected={on}
                  className={cn('cursor-pointer', on && '!bg-ui-brand-soft')}
                >
                  <td>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        select(app)
                      }}
                      aria-label={`Show details for ${app.fullName}`}
                      className="flex flex-col text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
                    >
                      <span className="whitespace-nowrap font-semibold text-ui-text">{app.fullName}</span>
                      {app.title && <span className="whitespace-nowrap text-xs text-ui-muted">{app.title}</span>}
                    </button>
                  </td>
                  <td className="max-w-[150px] truncate text-ui-text" title={app.representing}>
                    {app.representing}
                  </td>
                  <td className="max-w-[150px] truncate text-ui-muted" title={app.email}>{app.email}</td>
                  <td className="max-w-[110px] truncate text-ui-muted" title={app.country}>{app.country}</td>
                  <td>
                    {app.website ? (
                      <a
                        href={app.website}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Visit ${app.representing || app.fullName} website (opens in a new tab)`}
                        className="inline-flex items-center gap-1 text-[13px] font-semibold text-ui-brand-text hover:underline"
                      >
                        <Globe className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
                        Visit
                      </a>
                    ) : (
                      <span className="text-ui-muted">None</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-ui-muted">{fmtDate(app.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableCard>
    )
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <PageHeader
          className="mb-0"
          title="Stakeholder Applications"
          subtitle="Submissions from the Join as a Supporter and Join as a Government forms."
        />

        <TypeTabs type={type} />

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <SearchInput
            value={search}
            onChange={handleSearch}
            placeholder="Search name, email, organization"
            label="Search submissions"
            className="w-full sm:w-[320px]"
          />
          <span className="text-[13px] text-ui-muted">{meta.description}</span>
        </div>

        <div
          className={cn(
            'grid grid-cols-[minmax(0,1fr)] items-start gap-5',
            selected && 'xl:grid-cols-[minmax(0,1fr)_360px]',
          )}
        >
          <section aria-label={`${meta.badge} submissions`} className="min-w-0">
            {body}
          </section>

          {selected && (
            <aside
              ref={detailRef}
              aria-labelledby="stakeholder-detail-title"
              className="flex scroll-mt-20 flex-col gap-4 rounded-[14px] border border-ui-line bg-ui-surface px-5 py-[18px]"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id="stakeholder-detail-title" className="break-words text-lg font-semibold text-ui-text">
                    {selected.fullName}
                  </h2>
                  <Pill tone="brand" className="mt-1.5">{meta.badge}</Pill>
                </div>
                <IconButton label="Close details" icon={X} onClick={() => setSelected(null)} className="-mr-1.5" />
              </div>

              <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3.5">
                <DetailField label="Title">{selected.title}</DetailField>
                <DetailField label="Submitted">{fmtDate(selected.createdAt)}</DetailField>
                <DetailField label="Organization" wide>{selected.representing}</DetailField>
                <DetailField label="Email">
                  {selected.email && (
                    <a href={`mailto:${selected.email}`} className="break-all text-ui-brand-text underline underline-offset-2">
                      {selected.email}
                    </a>
                  )}
                </DetailField>
                <DetailField label="Phone">{selected.phone}</DetailField>
                <DetailField label="Country">{selected.country}</DetailField>
                <DetailField label="Website">
                  {selected.website && (
                    <a
                      href={selected.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 break-all text-ui-brand-text underline underline-offset-2"
                    >
                      {selected.website}
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                    </a>
                  )}
                </DetailField>
              </dl>

              <div className="flex flex-col gap-2 border-t border-ui-line pt-3.5">
                <span className="text-xs font-semibold text-ui-muted">Involvement</span>
                {selected.involvement?.length > 0 ? (
                  <span className="flex flex-wrap gap-1.5">
                    {selected.involvement.map((inv) => (
                      <Tag key={inv} className="h-auto min-h-[22px] whitespace-normal py-0.5">{inv}</Tag>
                    ))}
                  </span>
                ) : (
                  <span className="text-sm text-ui-muted">Not given</span>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
