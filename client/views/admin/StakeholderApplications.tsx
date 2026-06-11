'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Building2,
  Loader2,
  AlertCircle,
  Search,
  ExternalLink,
  Globe,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { apiFetch } from '@/lib/api'

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

const TYPE_META: Record<string, { label: string; badge: string; subtitle: string }> = {
  vc: { label: 'VCs', badge: 'VC', subtitle: 'Venture capital stakeholder submissions.' },
  government: { label: 'Government', badge: 'Government', subtitle: 'Government stakeholder submissions.' },
  university: { label: 'University', badge: 'University', subtitle: 'University stakeholder submissions.' },
  corporate: { label: 'Corporates', badge: 'Corporate', subtitle: 'Corporate stakeholder submissions.' },
  incubator: { label: 'Incubator', badge: 'Incubator', subtitle: 'Incubator stakeholder submissions.' },
}

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-sm text-brand-text-primary">{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function StakeholderApplicationsView({ type }: { type: string }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<StakeholderApplication | null>(null)

  const meta = TYPE_META[type] ?? { label: type, badge: type, subtitle: '' }

  const { data: applications = [], isLoading, isError } = useQuery<StakeholderApplication[]>({
    queryKey: ['admin', 'stakeholder-applications', type],
    queryFn: () =>
      apiFetch<{ success: boolean; data: StakeholderApplication[] }>(
        `/api/admin/stakeholder-applications?type=${encodeURIComponent(type)}`,
      ).then((r) => r.data),
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
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

  function handleSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Stakeholder Applications"
        title={meta.label}
        subtitle={meta.subtitle}
      />

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-secondary pointer-events-none" />
        <input
          type="text"
          placeholder="Search name, email, organisation…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-brand-surface-2 bg-white text-sm text-brand-text-primary placeholder:text-brand-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        />
      </div>

      {/* Table card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-brand-surface-2 bg-white shadow-sm overflow-hidden"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-brand-primary/40 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-brand-text-secondary">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <p className="text-sm">Failed to load submissions</p>
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-brand-text-secondary">
            <Building2 className="w-8 h-8 opacity-30" />
            <p className="text-sm">
              {search ? 'No results for that search.' : 'No submissions yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-surface-2 bg-brand-surface/50">
                  {['Name', 'Title', 'Organisation', 'Email', 'Country', 'Website', 'Submitted'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((app) => (
                  <tr
                    key={app.id}
                    onClick={() => setSelected(app)}
                    className="border-b border-brand-surface-2 last:border-0 hover:bg-brand-surface/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5 font-medium text-brand-text-primary whitespace-nowrap">
                      {app.fullName}
                    </td>
                    <td className="px-5 py-3.5 text-brand-text-secondary whitespace-nowrap">
                      {app.title}
                    </td>
                    <td className="px-5 py-3.5 text-brand-text-secondary max-w-[180px] truncate">
                      {app.representing}
                    </td>
                    <td className="px-5 py-3.5 text-brand-text-secondary whitespace-nowrap">
                      {app.email}
                    </td>
                    <td className="px-5 py-3.5 text-brand-text-secondary whitespace-nowrap">
                      {app.country}
                    </td>
                    <td className="px-5 py-3.5">
                      <a
                        href={app.website}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-brand-primary hover:text-brand-primary-dark text-xs font-medium transition-colors"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        Visit
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    </td>
                    <td className="px-5 py-3.5 text-brand-text-secondary whitespace-nowrap">
                      {formatDate(app.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-brand-text-secondary">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-brand-surface-2 text-sm disabled:opacity-40 hover:bg-brand-surface transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-brand-surface-2 text-sm disabled:opacity-40 hover:bg-brand-surface transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Slide-over detail sheet */}
      <Sheet
        open={!!selected}
        onOpenChange={(open: boolean) => {
          if (!open) setSelected(null)
        }}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-6">
          {selected && (
            <>
              <SheetHeader className="mb-6 p-0">
                <SheetTitle className="text-xl font-bold text-brand-text-primary pr-8">
                  {selected.fullName}
                </SheetTitle>
                <span className="inline-flex w-fit items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-primary/10 text-brand-primary capitalize mt-1">
                  {meta.badge}
                </span>
              </SheetHeader>

              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Field label="Title" value={selected.title} />
                <Field label="Organisation" value={selected.representing} />
                <Field label="Email" value={selected.email} />
                <Field label="Phone" value={selected.phone} />
                <Field label="Country" value={selected.country} />
                <Field label="Submitted" value={formatDate(selected.createdAt)} />
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider mb-1">
                    Website
                  </p>
                  <a
                    href={selected.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-brand-primary hover:text-brand-primary-dark font-medium break-all"
                  >
                    {selected.website}
                    <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />
                  </a>
                </div>
              </div>

              {selected.involvement.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider mb-2">
                    Involvement
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.involvement.map((inv) => (
                      <span
                        key={inv}
                        className="px-2.5 py-0.5 rounded-full bg-brand-surface-2 text-brand-text-primary text-xs font-medium"
                      >
                        {inv}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  )
}
