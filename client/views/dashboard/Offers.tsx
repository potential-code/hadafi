'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import {
  Filter,
  Tag,
  Lock,
  Coins,
  RefreshCw,
  ShoppingBag,
  ArrowRight,
  Scissors,
  Sparkles,
  CheckCircle2,
  X,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { PageHeader } from '@/components/dashboard/widgets/PageHeader'
import { fetchOffers, type Offer } from '@/lib/api/offers'
import { gsap, useGSAP } from '@/lib/gsap'
import { cn } from '@/lib/utils'

function resolveImageUrl(url: string | null): string | null {
  return url || null
}

// ---------------------------------------------------------------------------
// Confirmation dialog (non-destructive, positive CTA)
// ---------------------------------------------------------------------------

interface RedeemDialogProps {
  offer: Offer | null
  onConfirm: () => void
  onCancel: () => void
}

function RedeemDialog({ offer, onConfirm, onCancel }: RedeemDialogProps) {
  useEffect(() => {
    if (!offer) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [offer, onCancel])

  if (!offer) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="redeem-dialog-title"
        className="relative z-10 bg-white rounded-2xl border border-brand-surface-2 shadow-2xl p-6 max-w-sm w-full mx-4"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
            <ShoppingBag className="w-4 h-4 text-brand-primary" />
          </div>
          <h2 id="redeem-dialog-title" className="text-base font-bold text-brand-text-primary">
            Confirm Redemption
          </h2>
        </div>
        <p className="text-sm text-brand-text-muted mb-5 leading-relaxed">
          Redeeming &ldquo;{offer.title}&rdquo; will deduct{' '}
          <strong className="text-brand-text-primary">{offer.pointsCost} points</strong> from your
          balance.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-brand-surface text-brand-text-primary text-sm font-semibold hover:bg-brand-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton loading card — coupon shape
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="animate-pulse">
      {/* Top section */}
      <div className="relative rounded-t-2xl overflow-hidden bg-brand-surface-2">
        <div className="h-40 bg-brand-surface-2" />
        <div className="px-4 pt-3 pb-4 space-y-2 bg-white">
          <div className="h-3 w-16 rounded-full bg-brand-surface-2" />
          <div className="h-4 w-3/4 rounded bg-brand-surface-2" />
          <div className="h-3 w-1/2 rounded bg-brand-surface-2" />
        </div>
        <span className="absolute -left-3 bottom-0 w-6 h-6 rounded-full bg-brand-surface border-r border-brand-surface-2" />
        <span className="absolute -right-3 bottom-0 w-6 h-6 rounded-full bg-brand-surface border-l border-brand-surface-2" />
      </div>
      {/* Divider */}
      <div className="h-px bg-transparent border-t border-dashed border-brand-surface-2" />
      {/* Stub */}
      <div className="relative rounded-b-2xl overflow-hidden bg-white px-4 py-3 flex items-center justify-between">
        <span className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-brand-surface border-r border-brand-surface-2" />
        <span className="absolute -right-3 top-0 w-6 h-6 rounded-full bg-brand-surface border-l border-brand-surface-2" />
        <div className="h-6 w-20 rounded-full bg-brand-surface-2" />
        <div className="h-8 w-24 rounded-xl bg-brand-surface-2" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single offer card — coupon shape
// ---------------------------------------------------------------------------

interface OfferCardProps {
  offer: Offer
  userPoints: number
  index: number
  onRedeem: (offer: Offer) => void
}

function OfferCard({ offer, userPoints, index, onRedeem }: OfferCardProps) {
  const canAfford = userPoints >= offer.pointsCost
  const deficit = offer.pointsCost - userPoints
  const cardRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const card = cardRef.current
      if (!card) return

      function onEnter() {
        gsap.to('[data-scissors]', { x: 10, duration: 0.35, ease: 'back.out(2)' })
        if (canAfford) {
          gsap.fromTo(
            '[data-pts-badge]',
            { scale: 1 },
            { scale: 1.12, yoyo: true, repeat: 1, duration: 0.2 },
          )
        }
      }

      function onLeave() {
        gsap.to('[data-scissors]', { x: 0, duration: 0.28 })
      }

      card.addEventListener('mouseenter', onEnter)
      card.addEventListener('mouseleave', onLeave)

      return () => {
        card.removeEventListener('mouseenter', onEnter)
        card.removeEventListener('mouseleave', onLeave)
      }
    },
    { scope: cardRef, dependencies: [canAfford] },
  )

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ delay: 0.05 * index, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -6, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98, transition: { duration: 0.12 } }}
      className="group relative"
    >
      {/* ── Top section ──────────────────────────────────────────────────── */}
      <div className="relative rounded-t-2xl overflow-hidden bg-white border border-b-0 border-brand-surface-2 group-hover:border-brand-primary/30 group-hover:shadow-[0_16px_48px_-12px_rgba(159,32,99,0.22)] transition-all duration-300">
        {/* Cover image / gradient placeholder */}
        <div className="relative h-40 flex-shrink-0 overflow-hidden bg-gradient-to-br from-brand-primary via-brand-primary-dark to-brand-violet/80">
          {offer.imageUrl ? (
            <Image
              src={resolveImageUrl(offer.imageUrl)!}
              alt={offer.title}
              fill
              unoptimized
              className="object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <ShoppingBag className="w-12 h-12 text-white/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

          {/* TimesRedeemed badge — top-left */}
          {offer.timesRedeemed > 0 && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + 0.04 * index }}
              className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-600/90 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wider shadow"
            >
              <Sparkles className="w-2.5 h-2.5" />
              {offer.timesRedeemed}&times; redeemed
            </motion.span>
          )}

          {/* Locked overlay — top-right */}
          {!canAfford && (
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-[9px] font-bold">
              <Lock className="w-2.5 h-2.5" />
              {deficit} pts needed
            </span>
          )}
        </div>

        {/* Text content in top section */}
        <div className="px-4 pt-3 pb-4 relative">
          {/* Category badge */}
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-bold uppercase tracking-wider w-fit mb-2">
            <Tag className="w-2.5 h-2.5" />
            {offer.category}
          </span>

          <h3 className="font-bold text-brand-text-primary leading-snug line-clamp-2 mb-1 group-hover:text-brand-primary transition-colors duration-200">
            {offer.title}
          </h3>

          <div className="flex items-center gap-2 flex-wrap">
            {offer.priceBefore && (
              <span className="text-xs text-rose-400 line-through">{offer.priceBefore}</span>
            )}
            <span className="text-xs font-semibold text-brand-text-primary">{offer.priceLabel}</span>
          </div>
        </div>

        {/* Coupon notches — anchored to bottom edge of top section */}
        <span aria-hidden className="absolute -left-3 bottom-0 w-6 h-6 rounded-full bg-brand-surface border-r border-brand-surface-2" />
        <span aria-hidden className="absolute -right-3 bottom-0 w-6 h-6 rounded-full bg-brand-surface border-l border-brand-surface-2" />
      </div>

      {/* ── Perforated divider ───────────────────────────────────────────── */}
      <div
        aria-hidden
        className="h-px bg-transparent border-t border-dashed border-brand-surface-2 group-hover:border-brand-primary/30 transition-colors relative z-10"
      >
        <span
          data-scissors
          className="absolute -top-2.5 left-4 inline-block pointer-events-none"
        >
          <Scissors className="w-4 h-4 text-brand-text-muted/35 -rotate-90" />
        </span>
      </div>

      {/* ── Stub section ─────────────────────────────────────────────────── */}
      <div className="relative rounded-b-2xl overflow-hidden bg-white border border-t-0 border-brand-surface-2 group-hover:border-brand-primary/30 transition-all duration-300 px-4 py-3 flex items-center justify-between gap-3">
        {/* Coupon notches — anchored to top edge of stub */}
        <span aria-hidden className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-brand-surface border-r border-brand-surface-2" />
        <span
          aria-hidden
          className="absolute -right-3 top-0 w-6 h-6 rounded-full bg-brand-surface border-l border-brand-surface-2"
        />

        {/* Points badge */}
        <span
          data-pts-badge
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold',
            canAfford ? 'bg-violet-100 text-violet-700' : 'bg-rose-100 text-rose-600',
          )}
        >
          <Coins className="w-3.5 h-3.5" />
          {offer.pointsCost} pts
        </span>

        {/* CTA */}
        {canAfford ? (
          <motion.button
            type="button"
            onClick={() => onRedeem(offer)}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.93 }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary text-white px-4 py-2 text-xs font-bold hover:bg-brand-primary-dark transition-colors shadow-md shadow-brand-primary/20"
          >
            Redeem <ArrowRight className="w-3 h-3" />
          </motion.button>
        ) : (
          <motion.button
            type="button"
            disabled
            whileTap={{ x: [0, -4, 4, -3, 3, 0], transition: { duration: 0.35 } }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-surface-2 text-brand-text-muted px-3 py-2 text-[11px] font-bold cursor-not-allowed"
          >
            <Lock className="w-3 h-3" />
            {deficit} pts short
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Success banner (shown after checkout redirect ?success=1)
// ---------------------------------------------------------------------------

interface SuccessBannerProps {
  onDismiss: () => void
}

function SuccessBanner({ onDismiss }: SuccessBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -56 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -56 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      role="alert"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[90] flex items-center gap-3 px-6 py-4 shadow-xl"
      style={{ background: '#16a34a' }}
    >
      <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="font-bold text-white text-sm">Order confirmed! </span>
        <span className="text-white/90 text-sm">
          Your offer has been redeemed and points have been deducted from your balance.
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss success banner"
        className="flex-shrink-0 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OffersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [cat, setCat] = useState('All')
  const [pendingOffer, setPendingOffer] = useState<Offer | null>(null)
  const [showSuccessBanner, setShowSuccessBanner] = useState(
    () => searchParams.get('success') === '1',
  )

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['offers'],
    queryFn: fetchOffers,
  })

  // Refetch on success redirect so points balance reflects the deduction immediately
  useEffect(() => {
    if (showSuccessBanner) refetch()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss banner after 6 seconds and strip the query param
  useEffect(() => {
    if (!showSuccessBanner) return
    const timer = setTimeout(() => {
      setShowSuccessBanner(false)
      router.replace('/dashboard/offers')
    }, 6000)
    return () => clearTimeout(timer)
  }, [showSuccessBanner, router])

  function handleDismissBanner() {
    setShowSuccessBanner(false)
    router.replace('/dashboard/offers')
  }

  const userPoints = data?.userPoints ?? 0
  const offers = data?.offers ?? []

  // Derive unique categories
  const cats = ['All', ...Array.from(new Set(offers.map((o) => o.category)))]
  const filtered = cat === 'All' ? offers : offers.filter((o) => o.category === cat)

  function handleRedeemConfirm() {
    if (!pendingOffer) return
    const id = pendingOffer.id
    setPendingOffer(null)
    router.push(`/dashboard/offers/${id}`)
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <DashboardLayout>
        <PageHeader
          eyebrow="Special offers"
          title="Member-only"
          highlight="discounts"
          subtitle="Stack up exclusive offers from program partners. Most can be combined to save thousands."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </DashboardLayout>
    )
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (isError) {
    return (
      <DashboardLayout>
        <PageHeader
          eyebrow="Special offers"
          title="Member-only"
          highlight="discounts"
          subtitle="Stack up exclusive offers from program partners. Most can be combined to save thousands."
        />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-brand-text-muted text-sm mb-4">
            Failed to load offers. Please try again.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </DashboardLayout>
    )
  }

  // ---------------------------------------------------------------------------
  // Loaded
  // ---------------------------------------------------------------------------
  return (
    <DashboardLayout>
      <PageHeader
        eyebrow="Special offers"
        title="Member-only"
        highlight="discounts"
        subtitle="Stack up exclusive offers from program partners. Most can be combined to save thousands."
        actions={
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-100 text-violet-700 text-sm font-bold">
            <Coins className="w-4 h-4" />
            Your balance:{' '}
            <strong>{userPoints.toLocaleString()} pts</strong>
          </span>
        }
      />

      {/* Success banner */}
      <AnimatePresence>
        {showSuccessBanner && <SuccessBanner onDismiss={handleDismissBanner} />}
      </AnimatePresence>

      {/* Category filter */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-brand-text-muted flex-shrink-0" />
        {cats.map((c) => {
          const active = c === cat
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                'relative px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors',
                active ? 'text-white' : 'text-brand-text-muted hover:text-brand-primary',
              )}
            >
              {active && (
                <motion.span
                  layoutId="offers-cat-active"
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative">{c}</span>
            </button>
          )
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ShoppingBag className="w-10 h-10 text-brand-surface-2 mb-3" />
          <p className="text-brand-text-muted text-sm">
            No offers in this category yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filtered.map((offer, i) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                userPoints={userPoints}
                index={i}
                onRedeem={setPendingOffer}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Confirmation dialog */}
      <RedeemDialog
        offer={pendingOffer}
        onConfirm={handleRedeemConfirm}
        onCancel={() => setPendingOffer(null)}
      />
    </DashboardLayout>
  )
}
