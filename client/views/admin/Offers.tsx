'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Eye, EyeOff, Loader2, PackageOpen, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { btn, Card, EmptyState, FilterChips, PageHeader, Skeleton } from '@/components/kit'
import { adminTableClass, IconButton, Modal, Pill, SearchInput, Select, TableCard } from '@/components/admin/ui'
import { ConfirmDialog } from '@/components/admin/widgets/ConfirmDialog'
import {
  OFFER_CATEGORIES,
  OfferForm,
  OfferThumb,
  offerFormToDto,
  type OfferFormState,
} from '@/components/admin/content/OfferForm'
import { useMediaQuery, WIDE_QUERY } from '@/components/admin/content/useMediaQuery'
import {
  fetchAdminOffers,
  apiCreateOffer,
  apiUpdateOffer,
  apiDeleteOffer,
  type AdminOffer,
  type CreateOfferDto,
} from '@/lib/api/adminOffers'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/api/errors'

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(2)}`
}

type DialogState = { mode: 'create'; offer?: undefined } | { mode: 'edit'; offer: AdminOffer }
type CategoryFilter = 'All' | (typeof OFFER_CATEGORIES)[number] | string
type StatusFilter = 'all' | 'published' | 'draft'

const FORM_ID = 'offer-modal-form'

export default function OffersAdminPage() {
  const qc = useQueryClient()
  const wide = useMediaQuery(WIDE_QUERY)
  const [dialog, setDialog] = useState<null | DialogState>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [category, setCategory] = useState<CategoryFilter>('All')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [modalSaving, setModalSaving] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

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
    onError: (err) => toast.error(errorMessage(err, 'The offer could not be created. Please try again.')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreateOfferDto }) => apiUpdateOffer(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
      toast.success('Offer updated')
      setDialog(null)
    },
    onError: (err) => toast.error(errorMessage(err, 'The offer could not be saved. Please try again.')),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'published' | 'draft' }) => apiUpdateOffer(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
      toast.success('Status updated')
    },
    onError: (err) => toast.error(errorMessage(err, 'The offer status could not be changed. Please try again.')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDeleteOffer(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] })
      toast.success('Offer deleted')
      setDeleteId(null)
      if (dialog?.mode === 'edit' && dialog.offer.id === id) setDialog(null)
    },
    onError: (err) => toast.error(errorMessage(err, 'The offer could not be deleted. Please try again.')),
  })

  async function handleSave(form: OfferFormState) {
    const dto = offerFormToDto(form)
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

  // Bring the inline editor into view when it opens on a wide screen.
  const editingId = dialog?.mode === 'edit' ? dialog.offer.id : dialog ? 'new' : null
  useEffect(() => {
    if (!wide || !editingId) return
    const el = editorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [wide, editingId])

  const statusCounts = {
    published: offers.filter((o) => o.status === 'published').length,
    draft: offers.filter((o) => o.status === 'draft').length,
  }
  const knownCategories = [...OFFER_CATEGORIES, ...Array.from(new Set(offers.map((o) => o.category))).filter((c) => !(OFFER_CATEGORIES as readonly string[]).includes(c))]
  const categoryOptions = [
    { value: 'All', label: 'All', count: offers.length },
    ...knownCategories.map((c) => ({ value: c, label: c, count: offers.filter((o) => o.category === c).length })),
  ]

  const q = query.trim().toLowerCase()
  const filtered = offers.filter(
    (o) =>
      (category === 'All' || o.category === category) &&
      (status === 'all' || o.status === status) &&
      (!q || o.title.toLowerCase().includes(q) || o.priceLabel.toLowerCase().includes(q) || o.category.toLowerCase().includes(q)),
  )
  const redemptions = filtered.reduce((sum, o) => sum + (o.redemptionCount ?? 0), 0)
  const isFiltered = filtered.length !== offers.length

  const closeEditor = () => setDialog(null)

  const inlineEditor = (offer?: AdminOffer) => (
    <div ref={editorRef} className="scroll-mt-20 overflow-hidden rounded-xl border border-ui-line bg-ui-surface">
      <div className="flex items-center gap-2.5 border-b border-ui-line px-4 py-3">
        <h2 className="flex-1 text-[15px] font-semibold text-ui-text">{offer ? 'Edit offer' : 'New offer'}</h2>
        <IconButton label="Close editor" icon={X} onClick={closeEditor} className="-mr-1.5" />
      </div>
      <OfferForm key={offer?.id ?? 'new'} variant="inline" offer={offer} onSave={handleSave} onCancel={closeEditor} />
    </div>
  )

  return (
    <AdminLayout>
      <div className="flex flex-col gap-5">
        <PageHeader
          className="mb-0 max-md:flex-col max-md:items-start"
          title="Offers"
          subtitle="Create and manage marketplace offers redeemable with points."
          actions={
            <button type="button" onClick={() => setDialog({ mode: 'create' })} className={btn()}>
              <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              New offer
            </button>
          }
        />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterChips
            label="Filter by category"
            options={categoryOptions}
            active={category}
            onChange={setCategory}
            className="max-md:w-full md:flex-wrap"
          />
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
            <label>
              <span className="sr-only">Status</span>
              <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <option value="all">All statuses</option>
                <option value="published">Published ({statusCounts.published})</option>
                <option value="draft">Draft ({statusCounts.draft})</option>
              </Select>
            </label>
            <SearchInput value={query} onChange={setQuery} placeholder="Search offers" className="w-full md:w-[220px]" />
          </div>
        </div>

        {wide && dialog?.mode === 'create' && inlineEditor()}

        {isLoading ? (
          <Card className="flex flex-col gap-3 p-5" aria-busy="true" aria-label="Loading offers">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </Card>
        ) : isError ? (
          <Card>
            <EmptyState icon={AlertCircle} title="Failed to load offers" body="Refresh the page to try again." />
          </Card>
        ) : offers.length === 0 ? (
          <Card>
            <EmptyState
              icon={PackageOpen}
              title="No offers yet"
              body="Create your first one to show it in the marketplace."
              action={
                <button type="button" onClick={() => setDialog({ mode: 'create' })} className={btn({ size: 'sm' })}>
                  <Plus className="h-4 w-4" aria-hidden />
                  New offer
                </button>
              }
            />
          </Card>
        ) : (
          <TableCard
            footer={
              <>
                {isFiltered ? `${filtered.length} of ${offers.length} offers` : `${offers.length} ${offers.length === 1 ? 'offer' : 'offers'}`},{' '}
                {redemptions} {redemptions === 1 ? 'redemption' : 'redemptions'}
              </>
            }
          >
            {filtered.length === 0 ? (
              <EmptyState icon={PackageOpen} title="No offers match your filters" body="Try another category, status or search." />
            ) : (
              <table className={cn(adminTableClass, 'min-w-[900px] table-fixed')} aria-label="All offers">
                <colgroup>
                  <col className="w-[36%]" />
                  <col className="w-[20%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                  <col className="w-[120px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Offer</th>
                    <th scope="col">Price label</th>
                    <th scope="col" className="!text-right">Charge</th>
                    <th scope="col" className="!text-right">Points</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="!text-right">Redemptions</th>
                    <th scope="col" className="!text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((offer) => {
                    const editing = dialog?.mode === 'edit' && dialog.offer.id === offer.id
                    return (
                      <Fragment key={offer.id}>
                        <tr aria-selected={editing || undefined} className={cn(editing && '!bg-ui-brand-soft')}>
                          <td>
                            <span className="flex min-w-0 items-center gap-2.5">
                              <OfferThumb category={offer.category} imageUrl={offer.imageUrl} />
                              <span className="flex min-w-0 flex-col">
                                <button
                                  type="button"
                                  onClick={() => setDialog({ mode: 'edit', offer })}
                                  className="truncate text-left font-semibold text-ui-text hover:underline"
                                  title={offer.title}
                                >
                                  {offer.title}
                                </button>
                                <span className="truncate text-xs text-ui-muted">{offer.category}</span>
                              </span>
                            </span>
                          </td>
                          <td>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-ui-text" title={offer.priceLabel}>{offer.priceLabel}</span>
                              {offer.priceBefore && <s className="truncate text-xs text-ui-muted">{offer.priceBefore}</s>}
                            </span>
                          </td>
                          <td className={cn('text-right tabular-nums', offer.price === 0 ? 'text-ui-muted' : 'text-ui-text')}>
                            {formatPrice(offer.price)}
                          </td>
                          <td className="text-right tabular-nums text-ui-text">{offer.pointsCost.toLocaleString()}</td>
                          <td>
                            {offer.status === 'published' ? <Pill tone="brand" dot>Published</Pill> : <Pill tone="line">Draft</Pill>}
                          </td>
                          <td className={cn('text-right tabular-nums', offer.redemptionCount ? 'text-ui-text' : 'text-ui-muted')}>
                            {offer.redemptionCount}
                          </td>
                          <td>
                            <span className="flex justify-end gap-0.5">
                              <IconButton
                                label={offer.status === 'published' ? 'Set to draft' : 'Publish offer'}
                                icon={offer.status === 'published' ? EyeOff : Eye}
                                onClick={() => handleToggleStatus(offer)}
                                disabled={statusMutation.isPending && statusMutation.variables?.id === offer.id}
                              />
                              <IconButton label="Edit offer" icon={Pencil} onClick={() => setDialog({ mode: 'edit', offer })} />
                              <IconButton label="Delete offer" icon={Trash2} tone="danger" onClick={() => setDeleteId(offer.id)} />
                            </span>
                          </td>
                        </tr>
                        {editing && wide && (
                          <tr className="!bg-ui-brand-soft">
                            <td colSpan={7} className="!border-t-0 !px-5 !pb-4 !pt-0 whitespace-normal">
                              {inlineEditor(offer)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </TableCard>
        )}
      </div>

      {/* Narrow screens: the editor opens as a sheet */}
      <Modal
        open={!wide && dialog !== null}
        title={dialog?.mode === 'edit' ? 'Edit offer' : 'New offer'}
        onClose={closeEditor}
        size="lg"
        footer={
          <>
            <button type="button" onClick={closeEditor} className={btn({ variant: 'secondary', size: 'sm' })}>
              Cancel
            </button>
            <button type="submit" form={FORM_ID} disabled={modalSaving} className={btn({ size: 'sm' })}>
              {modalSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {dialog?.mode === 'edit' ? 'Save offer' : 'Create offer'}
            </button>
          </>
        }
      >
        {dialog && (
          <OfferForm
            key={dialog.offer?.id ?? 'new'}
            variant="modal"
            formId={FORM_ID}
            offer={dialog.offer}
            onSave={handleSave}
            onCancel={closeEditor}
            onSavingChange={setModalSaving}
          />
        )}
      </Modal>

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
