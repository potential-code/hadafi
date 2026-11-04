'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Coins, GraduationCap, RefreshCw, ShoppingBag, X } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Button, Card, EmptyState, FilterChips, PageHeader, Skeleton, btn } from '@/components/kit'
import { OfferCard, pointsLabel } from '@/components/learner-grow/OfferCard'
import { fetchOffers } from '@/lib/api/offers'

const PAGE = 12

function SuccessNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-[14px] border border-transparent bg-ui-ok-soft px-4 py-3.5 text-sm">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ui-ok" aria-hidden />
      <p className="flex-1 text-ui-text">
        <span className="font-semibold">Order confirmed.</span> Your offer is redeemed and the points were deducted from your
        balance.
      </p>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss} className="-my-1">
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  )
}

function OfferSkeleton() {
  return (
    <Card className="overflow-hidden" aria-hidden>
      <Skeleton className="aspect-[2/1] w-full rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="flex justify-between border-t border-ui-line px-4 py-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>
    </Card>
  )
}

export default function OffersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [cat, setCat] = useState('All')
  const [visible, setVisible] = useState(PAGE)
  const [showSuccess, setShowSuccess] = useState(() => searchParams.get('success') === '1')

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['offers'], queryFn: fetchOffers })

  // Refetch after a checkout redirect so the balance reflects the deduction.
  useEffect(() => {
    if (showSuccess) refetch()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showSuccess) return
    const t = setTimeout(() => {
      setShowSuccess(false)
      router.replace('/dashboard/offers')
    }, 8000)
    return () => clearTimeout(t)
  }, [showSuccess, router])

  const userPoints = data?.userPoints
  const offers = useMemo(() => data?.offers ?? [], [data])

  // Categories ordered by how many offers they hold.
  const cats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of offers) counts.set(o.category, (counts.get(o.category) ?? 0) + 1)
    return [
      { value: 'All', label: 'All', count: offers.length },
      ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ value: c, label: c, count: n })),
    ]
  }, [offers])

  const filtered = cat === 'All' ? offers : offers.filter((o) => o.category === cat)
  const shown = filtered.slice(0, visible)
  const affordable = userPoints === undefined ? 0 : offers.filter((o) => o.pointsCost <= userPoints).length

  const balanceCopy =
    offers.length === 0
      ? 'You earn 10 points for each course unit you finish.'
      : affordable === offers.length
        ? 'Every offer below is within your balance. You earn 10 points for each course unit you finish. When an offer costs more than you have, it shows how many points you still need.'
        : `${affordable} of ${offers.length} offers are within your balance. You earn 10 points for each course unit you finish. Locked offers show how many points you still need.`

  return (
    <DashboardLayout>
      <PageHeader
        title="Offers"
        subtitle="Member-only discounts from program partners. Redeem them with the points you earn from courses."
        className="mb-[22px]"
      />

      <div className="flex flex-col gap-[22px]">
        {showSuccess && (
          <SuccessNotice
            onDismiss={() => {
              setShowSuccess(false)
              router.replace('/dashboard/offers')
            }}
          />
        )}

        <section
          aria-labelledby="of-bal"
          className="flex flex-col items-start gap-4 rounded-[14px] bg-ui-brand-soft px-5 py-[18px] lg:flex-row lg:items-center lg:gap-5"
        >
          <div className="flex items-center gap-3.5">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-ui-surface text-ui-brand-text">
              <Coins className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="flex flex-col">
              <h2 id="of-bal" className="whitespace-nowrap text-2xl font-bold tracking-[-0.01em] text-ui-text tabular-nums">
                {isLoading ? (
                  <span className="inline-block h-7 w-32 animate-pulse rounded-[10px] bg-ui-surface-2 align-middle" aria-label="Loading balance" />
                ) : (
                  pointsLabel(userPoints ?? 0)
                )}
              </h2>
              <span className="text-[13px] text-ui-muted">Your balance</span>
            </div>
          </div>
          <span aria-hidden className="hidden w-px self-stretch bg-ui-line lg:block" />
          <p className="flex-1 text-sm leading-normal text-ui-text">{isLoading ? '' : balanceCopy}</p>
          <Link href="/dashboard/courses" className={btn({ variant: 'secondary' })}>
            <GraduationCap className="h-4 w-4" aria-hidden />
            Earn points with a course
          </Link>
        </section>

        {isError ? (
          <Card>
            <EmptyState
              icon={ShoppingBag}
              title="Offers could not load"
              body="Something went wrong while loading partner offers."
              action={
                <Button variant="secondary" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Try again
                </Button>
              }
            />
          </Card>
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <OfferSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            {offers.length > 0 && (
              <FilterChips
                label="Filter offers by category"
                options={cats}
                active={cat}
                onChange={(v) => {
                  setCat(v)
                  setVisible(PAGE)
                }}
                className="lg:flex-wrap"
              />
            )}
            {filtered.length === 0 ? (
              <Card>
                <EmptyState
                  icon={ShoppingBag}
                  title={offers.length === 0 ? 'No offers yet' : 'No offers in this category'}
                  body={
                    offers.length === 0
                      ? 'Partner offers appear here as soon as they are published.'
                      : 'Try another category.'
                  }
                />
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-3">
                  {shown.map((o) => (
                    <OfferCard key={o.id} offer={o} userPoints={userPoints} />
                  ))}
                </div>
                {filtered.length > shown.length && (
                  <div className="flex justify-center">
                    <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)}>
                      Show {Math.min(PAGE, filtered.length - shown.length)} more{' '}
                      {filtered.length - shown.length === 1 ? 'offer' : 'offers'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
