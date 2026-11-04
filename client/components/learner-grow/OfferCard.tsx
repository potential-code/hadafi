'use client'

/** Offer card and shared offer helpers (Offers list + offer detail "More offers"). */
import Link from 'next/link'
import { Coins, Lock, ShoppingBag } from 'lucide-react'
import type { Offer } from '@/lib/api/offers'
import { Card, Chip, btn } from '@/components/kit'
import { cn } from '@/lib/utils'
import { optimizedSrc } from '@/lib/images'

const TILE_TONES: Record<string, [string, string]> = {
  AI: ['#1d4e89', '#d6e6fa'],
  Marketing: ['#7a1a4c', '#f6d4e5'],
  Finance: ['#1f6f5c', '#d3efe6'],
  PR: ['#4c1d6e', '#e6d8f3'],
  Ecommerce: ['#8a4513', '#f6e1cf'],
  IT: ['#2f4858', '#d9e4ea'],
  Training: ['#3d3a1e', '#ece9cf'],
}

export function offerTone(category: string): [string, string] {
  return TILE_TONES[category] ?? ['#2f4858', '#d9e4ea']
}

/** Offer artwork when there is one, otherwise a category-coloured tile. */
export function OfferArt({ offer, className, iconClass = 'h-9 w-9' }: { offer: Offer; className?: string; iconClass?: string }) {
  if (offer.imageUrl) {
    return <img src={optimizedSrc(offer.imageUrl)} alt="" className={cn('w-full bg-white object-cover', className)} />
  }
  const [bg, fg] = offerTone(offer.category)
  return (
    <span aria-hidden className={cn('flex w-full items-center justify-center', className)} style={{ background: bg, color: fg }}>
      <ShoppingBag className={iconClass} strokeWidth={1.5} />
    </span>
  )
}

export function OfferPrice({ offer, className }: { offer: Offer; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-baseline gap-2 text-[13px]', className)}>
      {offer.priceBefore && (
        <s className="text-ui-muted">
          <span className="sr-only">Was </span>
          {offer.priceBefore}
        </s>
      )}
      <span className="font-semibold text-ui-text">{offer.priceLabel}</span>
    </span>
  )
}

export function pointsLabel(n: number) {
  return `${n.toLocaleString()} ${n === 1 ? 'point' : 'points'}`
}

export function OfferCard({ offer, userPoints }: { offer: Offer; userPoints: number | undefined }) {
  const href = `/dashboard/offers/${offer.id}`
  const short = userPoints !== undefined ? offer.pointsCost - userPoints : 0
  const locked = short > 0
  return (
    <Card interactive className="flex flex-col overflow-hidden">
      <Link href={href} tabIndex={-1} aria-hidden className="block border-b border-ui-line">
        <OfferArt offer={offer} className="aspect-[2/1]" />
      </Link>
      <div className="flex flex-1 flex-col gap-2 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip className="h-[22px]">{offer.category}</Chip>
          {offer.timesRedeemed > 0 && (
            <Chip tone="ok" className="h-[22px]">
              Redeemed{offer.timesRedeemed > 1 ? ` ${offer.timesRedeemed} times` : ''}
            </Chip>
          )}
        </div>
        <h3 className="text-[15px] font-semibold leading-[1.35]">
          <Link href={href} className="text-ui-text hover:underline">
            {offer.title}
          </Link>
        </h3>
        <OfferPrice offer={offer} />
      </div>
      <div className="flex items-center justify-between gap-2.5 border-t border-ui-line px-4 py-3">
        {locked ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-ui-muted">
            <Lock className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>
              <span className="font-semibold text-ui-text tabular-nums">{pointsLabel(offer.pointsCost)}</span>, {short.toLocaleString()} more needed
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ui-text tabular-nums">
            <Coins className="h-4 w-4 text-ui-brand-text" strokeWidth={1.75} aria-hidden />
            {pointsLabel(offer.pointsCost)}
          </span>
        )}
        <Link
          href={href}
          aria-label={`${locked ? 'View' : 'Redeem'} ${offer.title}`}
          className={cn(btn({ variant: 'secondary', size: 'sm' }), 'h-[34px] px-3.5')}
        >
          {locked ? 'View' : 'Redeem'}
        </Link>
      </div>
    </Card>
  )
}
