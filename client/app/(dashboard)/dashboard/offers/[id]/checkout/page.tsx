'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { loadStripe, type Stripe as StripeInstance } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertCircle, ArrowLeft, ChevronDown, CreditCard, Gift, Loader2, ShoppingBag } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Button, Card, Chip, EmptyState, Field, PageHeader, Skeleton, btn, inputClass } from '@/components/kit'
import { OfferArt, pointsLabel } from '@/components/learner-grow/OfferCard'
import { PhoneInput, dialCodeForCountry, errorRing } from '@/components/learner-grow/PhoneInput'
import { fetchOffer, fetchOffers, apiCreatePaymentIntent, apiCompleteOrder, type Offer, type BillingPayload } from '@/lib/api/offers'
import { getUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { getCountryDataList } from 'countries-list'

// ── Stripe singleton (created once, outside React tree) ──────────────────────

const stripePromise: Promise<StripeInstance | null> = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '')

// ── Validation ────────────────────────────────────────────────────────────────

const billingSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name'),
  lastName: z.string().trim().min(1, 'Enter your last name'),
  company: z.string().optional(),
  country: z.string().min(1, 'Choose your country or region'),
  phone: z.string().min(5, 'Enter your phone number'),
  email: z.string().email('Enter a valid email address'),
  notes: z.string().optional(),
})

type BillingFormValues = z.infer<typeof billingSchema>

interface MeUser {
  id: string
  fullName: string
  email: string
  role: string
  country: string | null
  bio: string | null
  company: string | null
  phone: string | null
  timezone: string | null
  avatarUrl: string | null
  certificatesCount: number
  coursesCount: number
  createdAt: string
}

const CHECKOUT_COUNTRIES = getCountryDataList()
  .map((c) => c.name)
  .sort((a, b) => a.localeCompare(b))

function amountDisplay(offer: Offer) {
  return offer.price === 0 ? 'Free' : `$${(offer.price / 100).toFixed(2)}`
}

function Req() {
  return (
    <span className="text-ui-brand-text" aria-hidden>
      {' '}*
    </span>
  )
}

function BackLink({ id }: { id: string }) {
  return (
    <Link
      href={`/dashboard/offers/${id}`}
      className="inline-flex items-center gap-1.5 self-start rounded text-sm font-semibold text-ui-muted hover:text-ui-text"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to offer
    </Link>
  )
}

function CheckoutSkeleton({ id }: { id: string }) {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        <BackLink id={id} />
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-[minmax(0,1fr)] max-w-[1100px] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true" aria-label="Loading checkout">
          <Card className="flex flex-col gap-4 p-6">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </Card>
          <Card className="flex flex-col gap-4 p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-11 w-full" />
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}

// ── Order summary (right column) ──────────────────────────────────────────────

function OrderSummary({
  offer,
  isPaid,
  userPoints,
  children,
}: {
  offer: Offer
  isPaid: boolean
  userPoints: number | undefined
  children?: React.ReactNode
}) {
  // Stripe's card field lives in an iframe: give it the current theme's colours.
  const [cardColors, setCardColors] = useState({ text: '#17171C', muted: '#5B5B67', danger: '#b42318' })
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement)
    const read = (v: string, d: string) => cs.getPropertyValue(v).trim() || d
    setCardColors({ text: read('--ui-text', '#17171C'), muted: read('--ui-muted', '#5B5B67'), danger: read('--ui-danger', '#b42318') })
  }, [])

  return (
    <aside
      aria-labelledby="co-sum"
      className="flex flex-col gap-4 rounded-[14px] border border-ui-line bg-ui-surface p-5 shadow-ui lg:sticky lg:top-6"
    >
      <h2 id="co-sum" className="text-base font-semibold text-ui-text">Order summary</h2>
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3">
        <span className="block h-16 w-16 overflow-hidden rounded-[10px] border border-ui-line">
          <OfferArt offer={offer} className="h-full" iconClass="h-6 w-6" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[15px] font-semibold leading-[1.35] text-ui-text">{offer.title}</span>
          <Chip className="h-[22px] self-start">{offer.category}</Chip>
        </span>
      </div>
      <div className="flex flex-col gap-2.5 border-t border-ui-line pt-3.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-ui-muted">Points deducted</span>
          <span className="font-semibold text-ui-text tabular-nums">{pointsLabel(offer.pointsCost)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-ui-muted">Subtotal</span>
          <span className="text-right font-semibold text-ui-text">{offer.priceLabel}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-ui-line pt-2.5">
          <span className="font-semibold text-ui-text">Total</span>
          <span className="text-lg font-semibold text-ui-brand-text">{amountDisplay(offer)}</span>
        </div>
      </div>

      {isPaid ? (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-sm font-medium text-ui-text">
            <CreditCard className="h-4 w-4" aria-hidden />
            Card details
          </span>
          <div className="rounded-[10px] border border-ui-line bg-ui-surface px-3 py-3">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: '14px',
                    color: cardColors.text,
                    '::placeholder': { color: cardColors.muted },
                    fontFamily: 'Geist, system-ui, sans-serif',
                  },
                  invalid: { color: cardColors.danger },
                },
              }}
            />
          </div>
          <span className="text-xs text-ui-muted">Payments are processed securely by Stripe.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-[10px] bg-ui-brand-soft px-3.5 py-3 text-[13px] font-semibold text-ui-brand-text">
          <Gift className="h-4 w-4 shrink-0" aria-hidden />
          This offer is free. No card details needed.
        </div>
      )}

      {children}

      {userPoints !== undefined && (
        <div className="flex justify-between text-[13px] text-ui-muted">
          <span>Balance after this order</span>
          <span className="font-semibold text-ui-text tabular-nums">{pointsLabel(Math.max(0, userPoints - offer.pointsCost))}</span>
        </div>
      )}
    </aside>
  )
}

// ── Checkout form (needs Stripe context via Elements) ────────────────────────

function CheckoutForm({
  offer,
  clientSecret,
  offerId,
  profile,
  userPoints,
}: {
  offer: Offer
  clientSecret: string | undefined
  offerId: string
  profile: MeUser | null
  userPoints: number | undefined
}) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const user = getUser()

  const [submitting, setSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const isPaid = offer.price > 0

  // Billing entries survive any remount of this form (Stripe Elements re-keying,
  // dev double-mounts, accidental reloads). A failed payment must never cost the
  // user everything they typed.
  const draftKey = `hadafi.checkoutDraft.${offerId}`
  const [draft] = useState<Partial<BillingFormValues> | null>(() => {
    try {
      return JSON.parse(window.sessionStorage.getItem(draftKey) ?? 'null')
    } catch {
      return null
    }
  })

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<BillingFormValues>({
    resolver: zodResolver(billingSchema),
    defaultValues: {
      firstName: draft?.firstName || (profile ? profile.fullName.split(' ')[0] : ''),
      lastName: draft?.lastName || (profile ? profile.fullName.split(' ').slice(1).join(' ') : ''),
      email: draft?.email || (profile?.email ?? user?.email ?? ''),
      phone: draft?.phone || profile?.phone || dialCodeForCountry(profile?.country),
      company: draft?.company || (profile?.company ?? ''),
      country: draft?.country || (profile?.country ?? ''),
      notes: draft?.notes || '',
    },
  })

  useEffect(() => {
    const sub = watch((values) => {
      try {
        window.sessionStorage.setItem(draftKey, JSON.stringify(values))
      } catch {
        // storage unavailable: draft persistence is best-effort only
      }
    })
    return () => sub.unsubscribe()
  }, [watch, draftKey])

  async function onSubmit(data: BillingFormValues) {
    if (isPaid && !clientSecret) {
      setPaymentError('Payment setup failed. Please refresh the page.')
      return
    }

    setPaymentError(null)
    setSubmitting(true)

    const billing: BillingPayload = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      company: data.company || undefined,
      country: data.country,
      notes: data.notes || undefined,
    }

    try {
      if (isPaid && clientSecret && stripe && elements) {
        const cardElement = elements.getElement(CardElement)
        if (!cardElement) {
          setPaymentError('The card field is not ready. Please refresh and try again.')
          setSubmitting(false)
          return
        }

        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: `${data.firstName} ${data.lastName}`,
              email: data.email,
              phone: data.phone,
            },
          },
        })

        if (error) {
          setPaymentError(error.message ?? 'Payment failed. Please try again.')
          setSubmitting(false)
          return
        }

        await apiCompleteOrder(offerId, paymentIntent?.id, billing)
      } else {
        // Free offer
        await apiCompleteOrder(offerId, undefined, billing)
      }

      try {
        window.sessionStorage.removeItem(draftKey)
      } catch {
        // ignore
      }
      toast.success(`Order placed. ${pointsLabel(offer.pointsCost)} deducted.`)
      router.push('/dashboard/offers?success=1')
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? (err as { error: { message?: string } }).error?.message
          : 'Something went wrong. Please try again.'
      setPaymentError(message ?? 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="grid grid-cols-[minmax(0,1fr)] max-w-[1100px] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
    >
      <section aria-labelledby="co-bill" className="flex flex-col gap-[18px] rounded-[14px] border border-ui-line bg-ui-surface p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="co-bill" className="text-base font-semibold text-ui-text">Billing details</h2>
          <span className="text-xs text-ui-muted">
            {profile ? 'Filled from your profile. ' : ''}Fields marked * are required.
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={<>First name<Req /></>} htmlFor="co-first" error={errors.firstName?.message}>
            <input
              id="co-first"
              {...register('firstName')}
              autoComplete="given-name"
              aria-invalid={!!errors.firstName || undefined}
              className={cn(inputClass, errors.firstName && errorRing)}
            />
          </Field>
          <Field label={<>Last name<Req /></>} htmlFor="co-last" error={errors.lastName?.message}>
            <input
              id="co-last"
              {...register('lastName')}
              autoComplete="family-name"
              aria-invalid={!!errors.lastName || undefined}
              className={cn(inputClass, errors.lastName && errorRing)}
            />
          </Field>
        </div>

        <Field label="Company name" htmlFor="co-company" error={errors.company?.message}>
          <input id="co-company" {...register('company')} placeholder="Optional" autoComplete="organization" className={inputClass} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={<>Country or region<Req /></>} htmlFor="co-country" error={errors.country?.message}>
            <div className="relative">
              <select
                id="co-country"
                {...register('country')}
                autoComplete="country-name"
                aria-invalid={!!errors.country || undefined}
                className={cn(inputClass, 'cursor-pointer appearance-none pr-9', errors.country && errorRing)}
              >
                <option value="">Select a country</option>
                {CHECKOUT_COUNTRIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" />
            </div>
          </Field>
          <Field label={<>Phone<Req /></>} htmlFor="co-phone" error={errors.phone?.message}>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <PhoneInput id="co-phone" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.phone} />
              )}
            />
          </Field>
        </div>

        <Field
          label={<>Email address<Req /></>}
          htmlFor="co-email"
          error={errors.email?.message}
          hint="Your order confirmation is sent here."
        >
          <input
            id="co-email"
            {...register('email')}
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email || undefined}
            className={cn(inputClass, errors.email && errorRing)}
          />
        </Field>

        <Field label="Order notes" htmlFor="co-notes" error={errors.notes?.message}>
          <textarea
            id="co-notes"
            {...register('notes')}
            rows={3}
            placeholder="Any special instructions (optional)"
            className={cn(inputClass, 'h-auto resize-y py-2.5 leading-normal')}
          />
        </Field>
      </section>

      <OrderSummary offer={offer} isPaid={isPaid} userPoints={userPoints}>
        {/* A persistent banner, not a passing toast: say clearly what failed
            and that nothing was charged. */}
        {paymentError && (
          <div role="alert" className="flex items-start gap-2.5 rounded-[10px] bg-ui-danger-soft px-3.5 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-ui-danger" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <p className="text-[13px] font-semibold text-ui-danger">{paymentError}</p>
              <p className="text-xs text-ui-text">
                You have not been charged. Your details are saved, so you can fix them and try again.
              </p>
            </div>
          </div>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={submitting || (isPaid && (!stripe || !elements || !clientSecret))}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Placing order
            </>
          ) : (
            'Place order'
          )}
        </Button>
      </OrderSummary>
    </form>
  )
}

// ── Page: fetches offer, payment intent and profile, then wraps in Elements ──

export default function CheckoutPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : (params.id?.[0] ?? '')

  const { data: offer, isLoading: offerLoading, isError: offerError } = useQuery({
    queryKey: ['offer', id],
    queryFn: () => fetchOffer(id),
    enabled: Boolean(id),
  })

  // Balance for "Balance after this order" (shared cache with the offers list),
  // and to know before asking for a payment whether the learner can afford it.
  const { data: list, isLoading: listLoading } = useQuery({ queryKey: ['offers'], queryFn: fetchOffers })
  const shortOfPoints = Boolean(offer && list && list.userPoints < offer.pointsCost)

  const {
    data: intentData,
    isLoading: intentLoading,
    isError: intentError,
    error: intentQueryError,
  } = useQuery({
    queryKey: ['payment-intent', id],
    queryFn: () => apiCreatePaymentIntent(id),
    // Only once we know the balance covers it: no request doomed to fail.
    enabled: Boolean(offer && list) && !shortOfPoints,
    // Don't retry: a failed PI creation means something is wrong
    retry: false,
    staleTime: Infinity,
  })

  const { data: profile = null, isLoading: profileLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<{ success: boolean; data: { user: MeUser } }>('/api/auth/me').then((r) => r.data.user),
  })


  const isLoading = offerLoading || listLoading || (Boolean(offer) && !shortOfPoints && intentLoading) || profileLoading
  const isError = offerError || intentError || shortOfPoints

  if (isLoading) return <CheckoutSkeleton id={id} />

  if (isError || !offer) {
    const isInsufficientPoints =
      shortOfPoints || (intentQueryError as { error?: { code?: string } } | null)?.error?.code === 'INSUFFICIENT_POINTS'

    return (
      <DashboardLayout>
        <div className="flex flex-col gap-5">
          <BackLink id={id} />
          <Card>
            <EmptyState
              icon={ShoppingBag}
              title={isInsufficientPoints ? 'Not enough points for this offer' : 'Checkout could not load'}
              body={
                isInsufficientPoints
                  ? 'You earn 10 points for each course unit you finish. Come back when your balance covers this offer.'
                  : 'Something went wrong while preparing your order. Go back to the offer and try again.'
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href={`/dashboard/offers/${id}`} className={btn({ variant: 'secondary', size: 'sm' })}>
                    Back to offer
                  </Link>
                  {isInsufficientPoints && (
                    <Link href="/dashboard/courses" className={btn({ size: 'sm' })}>
                      Earn points with a course
                    </Link>
                  )}
                </div>
              }
            />
          </Card>
        </div>
      </DashboardLayout>
    )
  }

  const clientSecret = intentData?.clientSecret

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        <BackLink id={id} />
        <PageHeader title="Checkout" subtitle={`Confirm your billing details to redeem ${offer.title}.`} className="mb-0" />
        {/* Always wrap in Elements so useStripe/useElements have context. For
            free offers clientSecret is omitted: only confirmCardPayment needs it. */}
        <Elements stripe={stripePromise} options={clientSecret ? { clientSecret } : undefined}>
          <CheckoutForm offer={offer} clientSecret={clientSecret} offerId={id} profile={profile} userPoints={list?.userPoints} />
        </Elements>
      </div>
    </DashboardLayout>
  )
}
