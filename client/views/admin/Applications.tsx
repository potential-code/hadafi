'use client'

import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Users,
  ExternalLink,
  DollarSign,
  Linkedin,
} from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { apiFetch } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppStatus = 'pending' | 'approved' | 'rejected'

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

const TABS: { label: string; value: AppStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AppStatus }) {
  const styles: Record<AppStatus, string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-rose-100 text-rose-600',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${styles[status]}`}>
      {status}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function ExpandedDetail({ app }: { app: MentorApplication }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="px-5 pb-4 pt-2 border-t border-brand-surface-2 bg-brand-surface/40 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {app.expertise && app.expertise.length > 0 && (
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider mb-1.5">Areas of Expertise</p>
            <div className="flex flex-wrap gap-1">
              {app.expertise.map((e) => (
                <span key={e} className="px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-medium">{e}</span>
              ))}
            </div>
          </div>
        )}
        {app.methods && app.methods.length > 0 && (
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider mb-1.5">Mentoring Methods</p>
            <div className="flex flex-wrap gap-1">
              {app.methods.map((m) => (
                <span key={m} className="px-2 py-0.5 rounded-full bg-brand-surface-2 text-brand-text-primary text-xs">{m}</span>
              ))}
            </div>
          </div>
        )}
        {app.passion && (
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wider mb-1.5">Passion / Mission</p>
            <p className="text-sm text-brand-text-primary leading-relaxed">{app.passion}</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function ApplicationsPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<AppStatus | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const queryKey = ['admin', 'mentor-applications', activeTab]

  const { data: applications = [], isLoading, isError } = useQuery<MentorApplication[]>({
    queryKey,
    queryFn: () => {
      const params = activeTab !== 'all' ? `?status=${activeTab}` : ''
      return apiFetch<{ success: boolean; data: MentorApplication[] }>(`/api/admin/mentor-applications${params}`)
        .then((r) => r.data)
    },
  })

  async function handleApprove(id: string) {
    setActionLoading(id + '-approve')
    try {
      await apiFetch(`/api/admin/mentor-applications/${id}/approve`, { method: 'POST' })
      toast.success('Application approved', { description: 'The mentor will receive a setup email shortly.' })
      qc.invalidateQueries({ queryKey: ['admin', 'mentor-applications'] })
    } catch {
      toast.error('Failed to approve application')
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
    } catch {
      toast.error('Failed to reject application')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Mentor Applications"
        subtitle="Review and manage expert mentor applications."
      />

      {/* Tab filter */}
      <div className="flex gap-1.5 mb-5 p-1 bg-brand-surface rounded-xl w-fit border border-brand-surface-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.value
                ? 'bg-white text-brand-primary shadow-sm border border-brand-surface-2'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Applications table */}
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
            <p className="text-sm">Failed to load applications</p>
          </div>
        ) : applications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-brand-text-secondary">
            <Users className="w-8 h-8 opacity-30" />
            <p className="text-sm">
              {activeTab === 'all' ? 'No applications yet.' : `No ${activeTab} applications.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-surface-2 bg-brand-surface/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">LinkedIn</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Rate</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Applied</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <Fragment key={app.id}>
                    <tr
                      onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}
                      className="border-b border-brand-surface-2 hover:bg-brand-surface/30 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3.5 font-medium text-brand-text-primary">
                        <div className="flex items-center gap-1.5">
                          <ChevronDown
                            className={`w-4 h-4 text-brand-text-secondary transition-transform flex-shrink-0 ${expandedId === app.id ? 'rotate-180' : ''}`}
                          />
                          {app.name}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-brand-text-secondary">{app.email}</td>
                      <td className="px-5 py-3.5">
                        {app.linkedinUrl ? (
                          <a
                            href={app.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-brand-primary hover:text-brand-primary-dark text-xs font-medium transition-colors"
                          >
                            <Linkedin className="w-3.5 h-3.5" />
                            View
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        ) : (
                          <span className="text-brand-text-secondary/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {app.hourlyRate !== null ? (
                          <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-text-primary">
                            <DollarSign className="w-3.5 h-3.5 text-brand-text-secondary" />
                            {app.hourlyRate}<span className="text-xs font-normal text-brand-text-secondary">/hr</span>
                          </span>
                        ) : (
                          <span className="text-brand-text-secondary/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-brand-text-secondary">{formatDate(app.createdAt)}</td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={app.status} />
                      </td>
                      <td className="px-5 py-3.5">
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {app.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(app.id)}
                                disabled={!!actionLoading}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors disabled:opacity-50"
                              >
                                {actionLoading === app.id + '-approve' ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(app.id)}
                                disabled={!!actionLoading}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition-colors disabled:opacity-50"
                              >
                                {actionLoading === app.id + '-reject' ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5" />
                                )}
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    <AnimatePresence>
                      {expandedId === app.id && (
                        <tr key={app.id + '-expanded'}>
                          <td colSpan={7} className="p-0">
                            <ExpandedDetail app={app} />
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </AdminLayout>
  )
}
