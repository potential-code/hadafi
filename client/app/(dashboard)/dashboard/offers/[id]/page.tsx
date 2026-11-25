'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, GraduationCap, Lock, ShoppingBag } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Card, Chip, EmptyState, PageHeader, Skeleton, btn } from '@/components/kit'
import { OfferArt, OfferCard, OfferPrice, pointsLabel } from '@/components/learner-grow/OfferCard'
import { fetchOffer, fetchOffers, type Offer } from '@/lib/api/offers'
import { cn } from '@/lib/utils'

function BackLink() {
  return (
    <Link
      href="/dashboard/offers"
      className="inline-flex items-center gap-1.5 self-start rounded text-sm font-semibold text-ui-muted hover:text-ui-text"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to offers
    </Link>
  )
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-ui-line py-3 text-sm first:border-t-0">
      <span className="text-ui-muted">{label}</span>
      <span className={cn('text-right font-semibold text-ui-text', strong && 'text-lg text-ui-brand-text')}>{value}</span>
    </div>
  )
}

function amountToPay(offer: Offer) {
  return offer.price === 0 ? 'Free' : `$${(offer.price / 100).toFixed(2)}`
}

function DetailSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-7 xl:grid-cols-[minmax(0,1fr)_360px]" aria-busy="true" aria-label="Loading offer">
      <div className="flex flex-col gap-6">
        <Skeleton className="aspect-[2/1] w-full rounded-[14px]" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Card className="flex flex-col gap-3 p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    </div>
  )
}

export default function OfferCartPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : (params.id?.[0] ?? '')

  const { data: offer, isLoading, isError } = useQuery({
    queryKey: ['offer', id],
    queryFn: () => fetchOffer(id),
    enabled: Boolean(id),
  })
  // The learner's points balance comes with the offers list (shared cache key).
  const { data: list } = useQuery({ queryKey: ['offers'], queryFn: fetchOffers })
  const userPoints = list?.userPoints

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-[22px]">
          <BackLink />
          <DetailSkeleton />
        </div>
      </DashboardLayout>
    )
  }

  if (isError || !offer) {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-[22px]">
          <BackLink />
          <Card>
            <EmptyState
              icon={ShoppingBag}
              title="This offer is not available"
              body="It may have been removed, or the link is not valid."
              action={
                <Link href="/dashboard/offers" className={btn({ variant: 'secondary', size: 'sm' })}>
                  See all offers
                </Link>
              }
            />
          </Card>
        </div>
      </DashboardLayout>
    )
  }

  const short = userPoints !== undefined ? offer.pointsCost - userPoints : 0
  const locked = short > 0
  const isPaid = offer.price > 0
  const more = (list?.offers ?? []).filter((o) => o.id !== offer.id && o.category === offer.category).slice(0, 3)

  const gets = [
    offer.priceBefore
      ? `The member price of ${offer.priceLabel} instead of ${offer.priceBefore}`
      : `The member price: ${offer.priceLabel}`,
    isPaid
      ? `Redeemed with ${pointsLabel(offer.pointsCost)} plus ${amountToPay(offer)} paid by card at checkout`
      : `Redeemed with ${pointsLabel(offer.pointsCost)}, no card needed at checkout`,
  ]
  const steps = [
    'Check your billing details at checkout. We fill them from your profile.',
    isPaid
      ? `Pay ${amountToPay(offer)} by card and place the order. ${pointsLabel(offer.pointsCost)} are deducted from your balance.`
      : `Place the order. ${pointsLabel(offer.pointsCost)} are deducted from your balance.`,
    'You see a confirmation and the order appears in your account.',
  ]

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-[22px]">
        <BackLink />

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-[26px]">
            <Card className="overflow-hidden">
              <OfferArt offer={offer} className="aspect-[2/1] max-h-[380px]" iconClass="h-12 w-12" />
            </Card>
            <div className="flex flex-col gap-2.5">
              <Chip className="self-start">{offer.category}</Chip>
              <PageHeader
                title={offer.title}
                subtitle={
                  <span className="flex flex-wrap items-baseline gap-2">
                    <OfferPrice offer={offer} className="text-[15px]" />
                    <span className="text-ui-muted">for Hadafi members</span>
                  </span>
                }
                className="mb-0"
              />
            </div>

            <section aria-labelledby="od-get">
              <h2 id="od-get" className="mb-2.5 text-base font-semibold text-ui-text">What you get</h2>
              <ul className="flex flex-col gap-2.5">
                {gets.map((g) => (
                  <li key={g} className="flex items-start gap-2.5 text-[15px] leading-normal text-ui-text">
                    <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-ui-brand-text" strokeWidth={1.75} aria-hidden />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="od-how">
              <h2 id="od-how" className="mb-2.5 text-base font-semibold text-ui-text">How redeeming works</h2>
              <ol className="flex flex-col gap-3">
                {steps.map((s, i) => (
                  <li key={s} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 text-[15px] leading-normal text-ui-text">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ui-surface-2 text-[13px] font-bold text-ui-muted">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside
            aria-labelledby="od-sum"
            className="flex flex-col gap-4 rounded-[14px] border border-ui-line bg-ui-surface p-5 shadow-ui xl:sticky xl:top-6"
          >
            <h2 id="od-sum" className="text-base font-semibold text-ui-text">Price breakdown</h2>
            <div>
              {offer.priceBefore && <Row label="Original price" value={offer.priceBefore} />}
              <Row label="Member price" value={offer.priceLabel} />
              <Row label="Points required" value={pointsLabel(offer.pointsCost)} />
              <Row label="Amount to pay" value={amountToPay(offer)} strong />
            </div>
            {userPoints !== undefined && (
              <div className="flex flex-col gap-2 rounded-[10px] bg-ui-surface-2 p-3.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-ui-muted">Your balance</span>
                  <span className="font-semibold text-ui-text tabular-nums">{pointsLabel(userPoints)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ui-muted">{locked ? 'Still needed' : 'After this offer'}</span>
                  <span className={cn('font-semibold tabular-nums', locked ? 'text-ui-danger' : 'text-ui-text')}>
                    {locked ? pointsLabel(short) : pointsLabel(userPoints - offer.pointsCost)}
                  </span>
                </div>
              </div>
            )}
            {locked ? (
              <>
                <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ui-muted">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  You need {pointsLabel(short)} more to redeem this offer. You earn 10 points for each course unit you
                  finish.
                </p>
                <Link href="/dashboard/courses" className={cn(btn(), 'w-full')}>
                  <GraduationCap className="h-4 w-4" aria-hidden />
                  Earn points with a course
                </Link>
              </>
            ) : (
              <>
                <Link href={`/dashboard/offers/${offer.id}/checkout`} className={cn(btn(), 'w-full')}>
                  Proceed to checkout
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <p className="-mt-1.5 text-center text-xs text-ui-muted">
                  {pointsLabel(offer.pointsCost)} are deducted when you place the order.
                </p>
              </>
            )}
          </aside>
        </div>

        {more.length > 0 && (
          <section aria-labelledby="od-more" className="flex flex-col gap-3.5 pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="od-more" className="text-lg font-semibold text-ui-text">More {offer.category} offers</h2>
              <Link href="/dashboard/offers" className="text-[13px] font-semibold text-ui-brand-text hover:underline">
                All {list?.offers.length ?? ''} offers
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {more.map((o) => (
                <OfferCard key={o.id} offer={o} userPoints={userPoints} />
              ))}
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  )
}
