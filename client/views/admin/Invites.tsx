'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Link2, Copy, Check, Plus, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { apiFetch } from '@/lib/api'

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: Invite['status'] }) {
  const styles = {
    active: 'bg-emerald-100 text-emerald-700',
    used: 'bg-gray-100 text-gray-500',
    revoked: 'bg-rose-100 text-rose-600',
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${styles[status]}`}
    >
      {status}
    </span>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function InvitesPage() {
  const qc = useQueryClient()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [latestLink, setLatestLink] = useState<string | null>(null)
  const [latestCode, setLatestCode] = useState<string | null>(null)

  const { data: invites = [], isLoading, isError } = useQuery<Invite[]>({
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
    onError: () => {
      toast.error('Failed to generate invite code')
    },
  })

  async function copyLink(link: string, id: string) {
    await navigator.clipboard.writeText(link)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Invite Codes"
        subtitle="Generate and manage invite codes for new SME members."
      />

      {/* Generate new invite */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 rounded-2xl border border-brand-surface-2 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-brand-text-primary mb-1">
              Generate New Invite Code
            </h2>
            <p className="text-xs text-brand-text-secondary">
              Each code is single-use and creates a pre-filled sign-up link.
            </p>
          </div>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="inline-flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-70 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-[0_6px_20px_-8px_rgba(159,32,99,0.7)]"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {generateMutation.isPending ? 'Generating…' : 'Generate Code'}
          </button>
        </div>

        {/* Latest generated link */}
        {latestLink && latestCode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 pt-4 border-t border-brand-surface-2"
          >
            <p className="text-xs font-semibold text-brand-text-secondary mb-2 uppercase tracking-wider">
              New invite link
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-brand-surface-2 bg-brand-surface px-3 py-2">
                <Link2 className="w-4 h-4 text-brand-text-secondary flex-shrink-0" />
                <code className="text-xs text-brand-text-primary truncate flex-1">{latestLink}</code>
              </div>
              <button
                onClick={() => copyLink(latestLink, 'latest')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-surface-2 bg-white hover:bg-brand-surface text-xs font-semibold text-brand-text-primary transition-colors"
              >
                {copiedId === 'latest' ? (
                  <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied!</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> Copy Link</>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Invites table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-2xl border border-brand-surface-2 bg-white shadow-sm overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-brand-surface-2">
          <h2 className="text-sm font-semibold text-brand-text-primary">All Invite Codes</h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-brand-primary/40 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-brand-text-secondary">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <p className="text-sm">Failed to load invite codes</p>
          </div>
        ) : invites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-brand-text-secondary">
            <Link2 className="w-8 h-8 opacity-30" />
            <p className="text-sm">No invite codes yet. Generate your first one above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-surface-2 bg-brand-surface/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Code</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Created</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Used By</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Country</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Registered</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-surface-2">
                {invites.map((invite) => (
                  <tr key={invite.id} className="hover:bg-brand-surface/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <code className="text-xs font-mono font-semibold text-brand-primary bg-brand-primary/8 px-2 py-0.5 rounded">
                        {invite.code}
                      </code>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={invite.status} />
                    </td>
                    <td className="px-5 py-3.5 text-brand-text-secondary">{formatDate(invite.createdAt)}</td>
                    <td className="px-5 py-3.5 font-medium text-brand-text-primary">{invite.usedBy?.fullName ?? '—'}</td>
                    <td className="px-5 py-3.5 text-brand-text-secondary">{invite.usedBy?.email ?? '—'}</td>
                    <td className="px-5 py-3.5 text-brand-text-secondary">{invite.usedBy?.country ?? '—'}</td>
                    <td className="px-5 py-3.5 text-brand-text-secondary">{formatDate(invite.usedBy?.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => copyLink(invite.inviteLink, invite.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-surface-2 bg-white hover:bg-brand-surface text-xs font-medium text-brand-text-secondary transition-colors"
                      >
                        {copiedId === invite.id ? (
                          <><Check className="w-3 h-3 text-emerald-600" /> Copied</>
                        ) : (
                          <><Copy className="w-3 h-3" /> Copy</>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </AdminLayout>
  )
}
