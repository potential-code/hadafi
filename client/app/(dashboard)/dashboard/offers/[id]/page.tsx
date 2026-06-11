'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Coins, ShoppingBag, Tag } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { fetchOffer } from '@/lib/api/offers'
import { cn } from '@/lib/utils'

function resolveImageUrl(url: string | null): string | null {
  return url || null
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CartSkeleton() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="h-4 w-32 rounded bg-brand-surface-2 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl">
        {/* Image skeleton */}
        <div className="rounded-2xl overflow-hidden bg-brand-surface-2 animate-pulse aspect-[4/3]" />
        {/* Details skeleton */}
        <div className="space-y-4">
          <div className="h-5 w-20 rounded-full bg-brand-surface-2 animate-pulse" />
          <div className="h-8 w-3/4 rounded bg-brand-surface-2 animate-pulse" />
          <div className="mt-6 rounded-2xl border border-brand-surface-2 p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-28 rounded bg-brand-surface-2 animate-pulse" />
                <div className="h-4 w-16 rounded bg-brand-surface-2 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="h-11 w-full rounded-xl bg-brand-surface-2 animate-pulse mt-4" />
        </div>
      </div>
    </DashboardLayout>
  )
}

// ---------------------------------------------------------------------------
// Price breakdown row
// ---------------------------------------------------------------------------

interface BreakdownRowProps {
  label: string
  value: string
  highlighted?: boolean
  border?: boolean
}

function BreakdownRow({ label, value, highlighted = false, border = true }: BreakdownRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-3',
        border && 'border-b border-brand-surface-2',
      )}
    >
      <span className="text-sm text-brand-text-muted">{label}</span>
      <span
        className={cn(
          'text-sm font-bold',
          highlighted ? 'text-brand-primary text-base' : 'text-brand-text-primary',
        )}
      >
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main cart page
// ---------------------------------------------------------------------------

export default function OfferCartPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : (params.id?.[0] ?? '')

  const { data: offer, isLoading, isError } = useQuery({
    queryKey: ['offer', id],
    queryFn: () => fetchOffer(id),
    enabled: Boolean(id),
  })

  // Loading state
  if (isLoading) return <CartSkeleton />

  // Error state
  if (isError || !offer) {
    return (
      <DashboardLayout>
        <Link
          href="/dashboard/offers"
          className="inline-flex items-center gap-1.5 text-sm text-brand-text-muted hover:text-brand-primary transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Offers
        </Link>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-brand-text-muted text-sm mb-4">
            We couldn&apos;t load this offer. It may have been removed or the link is invalid.
          </p>
          <Link
            href="/dashboard/offers"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Offers
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const amountDisplay =
    offer.price === 0 ? 'Free' : `$${(offer.price / 100).toFixed(2)}`

  return (
    <DashboardLayout>
      {/* Back link */}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <Link
          href="/dashboard/offers"
          className="inline-flex items-center gap-1.5 text-sm text-brand-text-muted hover:text-brand-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Offers
        </Link>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl">

        {/* Left: offer image */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative w-full rounded-2xl overflow-hidden aspect-[4/3] bg-gradient-to-br from-brand-primary via-brand-primary-dark to-violet-700"
        >
          {offer.imageUrl ? (
            <Image
              src={resolveImageUrl(offer.imageUrl)!}
              alt={offer.title}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <ShoppingBag className="w-16 h-16 text-white/40" />
            </div>
          )}
        </motion.div>

        {/* Right: details + price breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="flex flex-col"
        >
          {/* Category badge */}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-bold uppercase tracking-wider w-fit mb-3">
            <Tag className="w-2.5 h-2.5" />
            {offer.category}
          </span>

          {/* Title */}
          <h1 className="text-2xl font-black text-brand-text-primary leading-snug mb-6">
            {offer.title}
          </h1>

          {/* Price breakdown card */}
          <div className="rounded-2xl border border-brand-surface-2 bg-white p-5 mb-5">
            <p className="text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-1">
              Price Breakdown
            </p>

            {offer.priceBefore && (
              <BreakdownRow
                label="Original price"
                value={offer.priceBefore}
              />
            )}
            <BreakdownRow
              label="Member price"
              value={offer.priceLabel}
            />
            <BreakdownRow
              label="Points required"
              value={`${offer.pointsCost.toLocaleString()} pts`}
            />
            <BreakdownRow
              label="Amount to pay"
              value={amountDisplay}
              highlighted
              border={false}
            />
          </div>

          {/* Points cost reminder */}
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-50 border border-violet-100 mb-5">
            <Coins className="w-4 h-4 text-violet-600 flex-shrink-0" />
            <p className="text-xs text-violet-700">
              <strong>{offer.pointsCost.toLocaleString()} points</strong> will be deducted from your balance at checkout.
            </p>
          </div>

          {/* CTA */}
          <Link
            href={`/dashboard/offers/${offer.id}/checkout`}
            className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-brand-primary text-white px-5 py-3 text-sm font-bold hover:bg-brand-primary-dark active:scale-[0.98] transition-all"
          >
            Proceed to Checkout
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </Link>
        </motion.div>
      </div>
    </DashboardLayout>
  )
}
