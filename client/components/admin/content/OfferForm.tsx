'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  Cloud,
  GraduationCap,
  Loader2,
  Megaphone,
  Mic,
  ReceiptText,
  ShoppingCart,
  Sparkles,
  Tag,
  type LucideIcon,
} from 'lucide-react'
import { btn, Field, inputClass } from '@/components/kit'
import { Segmented, selectClass } from '@/components/admin/ui'
import MediaPicker from '@/components/admin/MediaPicker'
import { type MediaFile } from '@/lib/api/media'
import { type AdminOffer, type CreateOfferDto } from '@/lib/api/adminOffers'
import { cn } from '@/lib/utils'
import { optimizedSrc } from '@/lib/images'
import { API_BASE } from '@/lib/api'

export const OFFER_CATEGORIES = ['AI', 'Marketing', 'IT', 'Finance', 'PR', 'Ecommerce', 'Training'] as const


const CATEGORY_STYLE: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  AI: { icon: Sparkles, bg: '#4c1d6e', fg: '#f3d7ea' },
  Marketing: { icon: Megaphone, bg: '#7a1a4c', fg: '#f9d6e8' },
  IT: { icon: Cloud, bg: '#1d4e89', fg: '#d6e6fa' },
  Finance: { icon: ReceiptText, bg: '#1f6f5c', fg: '#d6f2e8' },
  PR: { icon: Mic, bg: '#8a4513', fg: '#fbe3cf' },
  Ecommerce: { icon: ShoppingCart, bg: '#2f4858', fg: '#dbe6ee' },
  Training: { icon: GraduationCap, bg: '#3d3a1e', fg: '#efe9c8' },
}
const FALLBACK_STYLE = { icon: Tag, bg: '#2f4858', fg: '#dbe6ee' }

/** Offer thumbnail: the cover image, else a category-coloured tile with its icon. */
export function OfferThumb({
  category,
  imageUrl,
  className,
}: {
  category: string
  imageUrl?: string | null
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [imageUrl])
  const s = CATEGORY_STYLE[category] ?? FALLBACK_STYLE
  const Icon = s.icon
  if (imageUrl && !broken) {
    return <img src={optimizedSrc(imageUrl)} alt="" onError={() => setBroken(true)} className={cn('h-9 w-9 shrink-0 rounded-lg object-cover', className)} />
  }
  return (
    <span
      aria-hidden
      className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', className)}
      style={{ background: s.bg, color: s.fg }}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </span>
  )
}

export interface OfferFormState {
  title: string
  category: string
  priceBefore: string
  priceLabel: string
  priceUsd: string // user-visible USD string, e.g. "25.00"
  pointsCost: string
  imageUrl: string
  status: 'published' | 'draft'
}

export function defaultOfferForm(offer?: AdminOffer): OfferFormState {
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

export function offerFormToDto(form: OfferFormState): CreateOfferDto {
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

/**
 * Create / edit offer form. `variant="inline"` is the wide 4-column editor that
 * opens under a table row (or above the table for a new offer); `variant="modal"`
 * is the single-column body used inside a Modal on narrow screens (pass `formId`
 * and render the buttons in the Modal footer with `OfferFormActions`).
 */
export function OfferForm({
  offer,
  onSave,
  onCancel,
  variant,
  formId,
  onSavingChange,
}: {
  offer?: AdminOffer
  onSave: (form: OfferFormState) => Promise<void>
  onCancel: () => void
  variant: 'inline' | 'modal'
  formId?: string
  onSavingChange?: (saving: boolean) => void
}) {
  const [form, setForm] = useState<OfferFormState>(() => defaultOfferForm(offer))
  const [saving, setSaving] = useState(false)
  const [mediaPicker, setMediaPicker] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const uid = useId()
  const id = (k: string) => `${uid}-${k}`
  const isEdit = !!offer

  // The page mounts a fresh form per offer (keyed by id), so a background
  // refetch never wipes unsaved edits.
  useEffect(() => {
    if (variant === 'inline') titleRef.current?.focus({ preventScroll: true })
  }, [variant, offer?.id])

  function set<K extends keyof OfferFormState>(key: K, value: OfferFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    onSavingChange?.(true)
    try {
      await onSave(form)
    } catch {
      /* the page shows the error toast */
    } finally {
      setSaving(false)
      onSavingChange?.(false)
    }
  }

  function handleMediaSelect(file: MediaFile) {
    set('imageUrl', `${API_BASE}/${file.path}`)
    setMediaPicker(false)
  }

  const inline = variant === 'inline'
  const span2 = inline ? 'md:col-span-2' : ''

  const fields = (
    <div className={cn('grid gap-x-4 gap-y-3.5', inline ? 'grid-cols-1 p-4 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2')}>
      <Field label="Title *" htmlFor={id('title')} className={inline ? span2 : 'sm:col-span-2'}>
        <input
          id={id('title')}
          ref={titleRef}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          className={inputClass}
          placeholder="e.g. AI Starter Toolkit"
          required
        />
      </Field>
      <Field label="Category *" htmlFor={id('cat')}>
        <select
          id={id('cat')}
          value={form.category}
          onChange={(e) => set('category', e.target.value)}
          className={cn(selectClass, 'h-10 w-full text-sm')}
          required
        >
          {OFFER_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ui-text">Status</span>
        <Segmented
          label="Status"
          className="self-start"
          value={form.status}
          onChange={(v) => set('status', v)}
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'published', label: 'Published' },
          ]}
        />
      </div>
      <Field label="Was price (optional)" htmlFor={id('was')} hint="Shown with a strikethrough">
        <input
          id={id('was')}
          value={form.priceBefore}
          onChange={(e) => set('priceBefore', e.target.value)}
          className={inputClass}
          placeholder="e.g. $99/month"
        />
      </Field>
      <Field label="Current price label *" htmlFor={id('label')} hint="e.g. Free, $25/month, $99 one-time">
        <input
          id={id('label')}
          value={form.priceLabel}
          onChange={(e) => set('priceLabel', e.target.value)}
          className={inputClass}
          placeholder="e.g. $25/month"
          required
        />
      </Field>
      <Field label="Charge via Stripe (USD)" htmlFor={id('usd')} hint="0 means free">
        <input
          id={id('usd')}
          type="number"
          min={0}
          step="0.01"
          value={form.priceUsd}
          onChange={(e) => set('priceUsd', e.target.value)}
          className={inputClass}
          placeholder="0"
        />
      </Field>
      <Field label="Points cost *" htmlFor={id('pts')}>
        <input
          id={id('pts')}
          type="number"
          min={0}
          step={1}
          value={form.pointsCost}
          onChange={(e) => set('pointsCost', e.target.value)}
          className={inputClass}
          placeholder="0"
          required
        />
      </Field>
      <div className={cn('flex flex-col gap-1.5', inline ? span2 : 'sm:col-span-2')}>
        <span className="text-sm font-medium text-ui-text">Cover image (optional)</span>
        <div className="flex items-center gap-2.5">
          <OfferThumb category={form.category} imageUrl={form.imageUrl || null} className="h-10 w-14" />
          <span className="min-w-0 flex-1 text-xs text-ui-muted">Pick from the media library or paste a URL directly.</span>
          <button type="button" onClick={() => setMediaPicker(true)} className={btn({ variant: 'secondary', size: 'sm' })}>
            Choose from library
          </button>
        </div>
      </div>
      <Field label="Image URL" htmlFor={id('img')} className={inline ? span2 : 'sm:col-span-2'}>
        <input
          id={id('img')}
          value={form.imageUrl}
          onChange={(e) => set('imageUrl', e.target.value)}
          className={inputClass}
          placeholder="/images/offers/image.png or https://"
        />
      </Field>
    </div>
  )

  return (
    <>
      <form id={formId} onSubmit={handleSubmit} aria-label={isEdit ? 'Edit offer' : 'New offer'}>
        {fields}
        {inline && (
          <div className="flex justify-end gap-2 border-t border-ui-line px-4 py-3">
            <button type="button" onClick={onCancel} className={btn({ variant: 'secondary' })}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={btn()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {isEdit ? 'Save offer' : 'Create offer'}
            </button>
          </div>
        )}
      </form>
      <MediaPicker open={mediaPicker} onClose={() => setMediaPicker(false)} onSelect={handleMediaSelect} accept="image" />
    </>
  )
}
