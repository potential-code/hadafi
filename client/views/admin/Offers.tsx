'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Tag, Plus, Pencil, Trash2, Loader2, AlertCircle, X, PackageOpen, Eye, EyeOff, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import { Field, DialogStyles } from '@/components/admin/widgets/CourseDialog'
import MediaPicker from '@/components/admin/MediaPicker'
import { type MediaFile } from '@/lib/api/media'
import {
  fetchAdminOffers,
  apiCreateOffer,
  apiUpdateOffer,
  apiDeleteOffer,
  type AdminOffer,
  type CreateOfferDto,
} from '@/lib/api/adminOffers'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = ['AI', 'Marketing', 'IT', 'Finance', 'PR', 'Ecommerce', 'Training'] as const

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: 'published' | 'draft' }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
        status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {status}
    </span>
  )
}

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Offer form state
// ---------------------------------------------------------------------------

interface OfferFormState {
  title: string
  category: string
  priceBefore: string
  priceLabel: string
  priceUsd: string   // user-visible USD string, e.g. "25.00"
  pointsCost: string
  imageUrl: string
  status: 'published' | 'draft'
}

function defaultForm(offer?: AdminOffer): OfferFormState {
  return {
    title: offer?.title ?? '',
    category: offer?.category ?? 'AI',
    priceBefore: offer?.priceBefore ?? '',
    priceLabel: offer?.priceLabel ?? '',
    priceUsd: offer ? String(offer.price / 100) : '0',
    pointsCost: offer ? String(offer.pointsCost) : '0',
    imageUrl: offer?.imageUrl ?? '',
    status: offer?.status ?? 'draft',
  }
}

function formToDto(form: OfferFormState): CreateOfferDto {
  return {
    title: form.title.trim(),
    category: form.category,
    priceBefore: form.priceBefore.trim() || undefined,
    priceLabel: form.priceLabel.trim(),
    price: Math.round(parseFloat(form.priceUsd || '0') * 100),
    pointsCost: parseInt(form.pointsCost || '0', 10),
    imageUrl: form.imageUrl.trim() || undefined,
    status: form.status,
  }
}

// ---------------------------------------------------------------------------
// Offer Dialog (create / edit)
// ---------------------------------------------------------------------------

interface OfferDialogProps {
  open: boolean
  offer?: AdminOffer
  onClose: () => void
  onSave: (form: OfferFormState) => Promise<void>
}

function OfferDialog({ open, offer, onClose, onSave }: OfferDialogProps) {
  const [form, setForm] = useState<OfferFormState>(defaultForm(offer))
  const [saving, setSaving] = useState(false)
  const [mediaPicker, setMediaPicker] = useState(false)

  useEffect(() => {
    if (open) setForm(defaultForm(offer))
  }, [open, offer])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function set<K extends keyof OfferFormState>(key: K, value: OfferFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  function handleMediaSelect(file: MediaFile) {
    set('imageUrl', `${API_BASE}/${file.path}`)
    setMediaPicker(false)
  }

  const isEdit = !!offer

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-brand-surface-2 overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-brand-surface-2 flex-shrink-0">
              <h3 className="text-lg font-black text-brand-text-primary">
                {isEdit ? 'Edit offer' : 'New offer'}
              </h3>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-surface transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* Form body */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

                <Field label="Title *">
                  <input
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    className="admin-input"
                    placeholder="e.g. AI Starter Toolkit"
                    required
                  />
                </Field>

                <Field label="Category *">
                  <select
                    value={form.category}
                    onChange={(e) => set('category', e.target.value)}
                    className="admin-input"
                    required
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>

                {/* ── Pricing section ── */}
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-primary">
                    Pricing
                  </p>

                  <Field label="Original / Was price (optional)">
                    <input
                      value={form.priceBefore}
                      onChange={(e) => set('priceBefore', e.target.value)}
                      className="admin-input"
                      placeholder='e.g. $99/month — shown with strikethrough'
                    />
                  </Field>

                  <Field label="Current price label *">
                    <input
                      value={form.priceLabel}
                      onChange={(e) => set('priceLabel', e.target.value)}
                      className="admin-input"
                      placeholder='e.g. Free, $25/month, $99 one-time'
                      required
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Charge via Stripe (USD, 0 = free)">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.priceUsd}
                        onChange={(e) => set('priceUsd', e.target.value)}
                        className="admin-input"
                        placeholder="0"
                      />
                    </Field>

                    <Field label="Points cost *">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={form.pointsCost}
                        onChange={(e) => set('pointsCost', e.target.value)}
                        className="admin-input"
                        placeholder="0"
                        required
                      />
                    </Field>
                  </div>
                </div>

                {/* ── Cover image ── */}
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-primary">
                    Cover image (optional)
                  </p>

                  <Field label="Image URL">
                    <div className="flex items-center gap-2">
                      <input
                        value={form.imageUrl}
                        onChange={(e) => set('imageUrl', e.target.value)}
                        className="admin-input flex-1"
                        placeholder="/images/offers/image.png or https://…"
                      />
                      {form.imageUrl && (
                        <div className="flex-shrink-0 w-14 h-10 rounded-lg overflow-hidden border border-brand-surface-2 bg-brand-surface">
                          <img
                            src={form.imageUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setMediaPicker(true)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-surface-2 bg-white text-brand-text-muted text-xs font-semibold hover:border-brand-primary/40 hover:text-brand-primary transition-colors"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      Choose from library
                    </button>
                  </Field>
                  <p className="text-[11px] text-brand-text-muted -mt-2">
                    Pick from the media library or paste a URL directly.
                  </p>
                </div>

              </div>

              {/* Footer: status toggle left, actions right */}
              <div className="flex-shrink-0 border-t border-brand-surface-2 px-6 py-4 flex items-center justify-between gap-4">
                {/* Status toggle */}
                <div className="inline-flex rounded-xl border border-brand-surface-2 bg-brand-surface p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => set('status', 'draft')}
                    className={
                      form.status === 'draft'
                        ? 'px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white transition-colors'
                        : 'px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-text-muted hover:text-brand-text-primary transition-colors'
                    }
                  >
                    Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => set('status', 'published')}
                    className={
                      form.status === 'published'
                        ? 'px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-primary text-white transition-colors'
                        : 'px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-text-muted hover:text-brand-text-primary transition-colors'
                    }
                  >
                    Published
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-brand-surface text-brand-text-primary text-sm font-semibold hover:bg-brand-surface-2 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            </form>

            <DialogStyles />
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <MediaPicker
        open={mediaPicker}
        onClose={() => setMediaPicker(false)}
        onSelect={handleMediaSelect}
        accept="image"
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

type DialogState = { mode: 'create'; offer?: undefined } | { mode: 'edit'; offer: AdminOffer }

export default function OffersAdminPage() {
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<null | DialogState>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: offers = [], isLoading, isError } = useQuery<AdminOffer[]>({
    queryKey: ['admin', 'offers'],
    queryFn: fetchAdminOffers,
  })

  const createMutation = useMutation({
    mutationFn: (dto: CreateOfferDto) => apiCreateOffer(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
      toast.success('Offer created')
      setDialog(null)
    },
    onError: () => toast.error('Failed to create offer'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreateOfferDto }) => apiUpdateOffer(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
      toast.success('Offer updated')
      setDialog(null)
    },
    onError: () => toast.error('Failed to update offer'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'published' | 'draft' }) =>
      apiUpdateOffer(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
      toast.success('Status updated')
    },
    onError: () => toast.error('Failed to update status'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDeleteOffer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
      toast.success('Offer deleted')
      setDeleteId(null)
    },
    onError: () => toast.error('Failed to delete offer'),
  })

  async function handleSave(form: OfferFormState) {
    const dto = formToDto(form)
    if (dialog?.mode === 'edit' && dialog.offer) {
      await updateMutation.mutateAsync({ id: dialog.offer.id, dto })
    } else {
      await createMutation.mutateAsync(dto)
    }
  }

  function handleToggleStatus(offer: AdminOffer) {
    const newStatus = offer.status === 'published' ? 'draft' : 'published'
    statusMutation.mutate({ id: offer.id, status: newStatus })
  }

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Offers"
        subtitle="Create and manage marketplace offers redeemable with points."
        actions={
          <button
            onClick={() => setDialog({ mode: 'create' })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors shadow-[0_6px_20px_-8px_rgba(159,32,99,0.7)]"
          >
            <Plus className="w-4 h-4" />
            New Offer
          </button>
        }
      />

      {/* Table card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-brand-surface-2 bg-white shadow-sm overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-brand-surface-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-brand-text-primary">All Offers</h2>
          {!isLoading && !isError && (
            <span className="text-xs text-brand-text-muted">{offers.length} total</span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-brand-primary/40 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-brand-text-secondary">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <p className="text-sm">Failed to load offers</p>
          </div>
        ) : offers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-brand-text-secondary">
            <PackageOpen className="w-8 h-8 opacity-30" />
            <p className="text-sm">No offers yet. Create your first one above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-surface-2 bg-brand-surface/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Thumbnail</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Title</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Category</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Price Label</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Price (USD)</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Points</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Redemptions</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-brand-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-surface-2">
                {offers.map((offer) => (
                  <tr key={offer.id} className="hover:bg-brand-surface/30 transition-colors">
                    {/* Thumbnail */}
                    <td className="px-5 py-3.5">
                      {offer.imageUrl ? (
                        <img
                          src={offer.imageUrl}
                          alt={offer.title}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-brand-surface-2 flex items-center justify-center">
                          <Tag className="w-4 h-4 text-brand-text-muted opacity-40" />
                        </div>
                      )}
                    </td>

                    {/* Title */}
                    <td className="px-5 py-3.5 font-medium text-brand-text-primary max-w-[200px]">
                      <span className="line-clamp-2">{offer.title}</span>
                    </td>

                    {/* Category */}
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-violet/10 text-brand-violet text-[10px] font-bold uppercase tracking-wider">
                        {offer.category}
                      </span>
                    </td>

                    {/* Price Label */}
                    <td className="px-5 py-3.5 text-brand-text-secondary">
                      <div className="flex flex-col gap-0.5">
                        {offer.priceBefore && (
                          <span className="text-[11px] text-rose-400 line-through">{offer.priceBefore}</span>
                        )}
                        <span>{offer.priceLabel}</span>
                      </div>
                    </td>

                    {/* Price USD */}
                    <td className="px-5 py-3.5 tabular-nums text-brand-text-primary font-semibold">
                      {formatPrice(offer.price)}
                    </td>

                    {/* Points */}
                    <td className="px-5 py-3.5 tabular-nums text-brand-text-secondary">
                      {offer.pointsCost.toLocaleString()}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <StatusBadge status={offer.status} />
                    </td>

                    {/* Redemptions */}
                    <td className="px-5 py-3.5 tabular-nums text-brand-text-secondary">
                      {offer.redemptionCount}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handleToggleStatus(offer)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
                          aria-label={offer.status === 'published' ? 'Set to draft' : 'Publish offer'}
                          title={offer.status === 'published' ? 'Set to draft' : 'Publish'}
                        >
                          {offer.status === 'published' ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => setDialog({ mode: 'edit', offer })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-brand-primary hover:text-white transition-colors"
                          aria-label="Edit offer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(offer.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-muted hover:bg-rose-500 hover:text-white transition-colors"
                          aria-label="Delete offer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Create / Edit dialog */}
      {dialog !== null && (
        <OfferDialog
          open
          offer={dialog?.mode === 'edit' ? dialog.offer : undefined}
          onClose={() => setDialog(null)}
          onSave={handleSave}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete offer"
        message="This will permanently delete the offer and cannot be undone."
        confirmLabel="Delete offer"
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </AdminLayout>
  )
}
