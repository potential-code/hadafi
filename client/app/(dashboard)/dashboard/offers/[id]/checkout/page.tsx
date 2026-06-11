'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  loadStripe,
  type Stripe as StripeInstance,
} from '@stripe/stripe-js'
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Coins,
  Loader2,
  ShoppingBag,
  CreditCard,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import {
  fetchOffer,
  apiCreatePaymentIntent,
  apiCompleteOrder,
  type Offer,
  type BillingPayload,
} from '@/lib/api/offers'
import { getUser } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { PhoneField } from '@/components/ui/PhoneField'
import { getCountryDataList } from 'countries-list'

// ---------------------------------------------------------------------------
// Stripe singleton (created once, outside React tree)
// ---------------------------------------------------------------------------

const stripePromise: Promise<StripeInstance | null> = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
)

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const billingSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  company: z.string().optional(),
  country: z.string().min(1, 'Required'),
  phone: z.string().min(5, 'Required'),
  email: z.string().email('Invalid email'),
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

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CheckoutSkeleton() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="h-4 w-32 rounded bg-brand-surface-2 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 max-w-5xl">
        {/* Left skeleton */}
        <div className="rounded-2xl border border-brand-surface-2 p-6 space-y-5">
          <div className="h-5 w-40 rounded bg-brand-surface-2 animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-24 rounded bg-brand-surface-2 animate-pulse" />
                <div className="h-10 w-full rounded-xl bg-brand-surface-2 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-brand-surface-2 animate-pulse" />
            <div className="h-20 w-full rounded-xl bg-brand-surface-2 animate-pulse" />
          </div>
        </div>
        {/* Right skeleton */}
        <div className="rounded-2xl border border-brand-surface-2 p-6 space-y-4">
          <div className="h-5 w-36 rounded bg-brand-surface-2 animate-pulse" />
          <div className="rounded-xl bg-brand-surface-2 animate-pulse aspect-[4/3] w-full" />
          <div className="h-5 w-3/4 rounded bg-brand-surface-2 animate-pulse" />
          <div className="space-y-2 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-28 rounded bg-brand-surface-2 animate-pulse" />
                <div className="h-4 w-16 rounded bg-brand-surface-2 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="h-11 w-full rounded-xl bg-brand-surface-2 animate-pulse mt-2" />
        </div>
      </div>
    </DashboardLayout>
  )
}

// ---------------------------------------------------------------------------
// Billing field wrapper
// ---------------------------------------------------------------------------

function Field({
  label,
  required,
  error,
  children,
  className,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="text-xs font-semibold text-brand-text-primary">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-brand-surface-2 bg-white px-3 py-2.5 text-sm text-brand-text-primary placeholder:text-brand-text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/30 transition-colors'

const errorInputClass = 'border-red-400 focus:ring-red-300/30'

// ---------------------------------------------------------------------------
// Order summary (right column, shared by both paid/free variants)
// ---------------------------------------------------------------------------

function OrderSummary({
  offer,
  isPaid,
  children,
}: {
  offer: Offer
  isPaid: boolean
  children?: React.ReactNode
}) {
  const amountDisplay =
    offer.price === 0 ? 'Free' : `$${(offer.price / 100).toFixed(2)}`

  return (
    <div className="rounded-2xl border border-brand-surface-2 bg-white p-6 flex flex-col gap-4">
      <p className="text-sm font-bold text-brand-text-primary">Order Summary</p>

      {/* Offer thumbnail */}
      <div className="relative w-full rounded-xl overflow-hidden aspect-[4/3] bg-gradient-to-br from-brand-primary via-brand-primary-dark to-violet-700">
        {offer.imageUrl ? (
          <Image
            src={offer.imageUrl}
            alt={offer.title}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ShoppingBag className="w-10 h-10 text-white/40" />
          </div>
        )}
      </div>

      {/* Offer title */}
      <p className="text-sm font-bold text-brand-text-primary leading-snug">
        {offer.title}
      </p>

      {/* Points reminder */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-50 border border-violet-100">
        <Coins className="w-4 h-4 text-violet-600 flex-shrink-0" />
        <p className="text-xs text-violet-700">
          <strong>{offer.pointsCost.toLocaleString()} points</strong> will be
          deducted
        </p>
      </div>

      {/* Price breakdown */}
      <div className="border-t border-brand-surface-2 pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-brand-text-muted">Points deducted</span>
          <span className="font-semibold text-brand-text-primary">
            {offer.pointsCost.toLocaleString()} pts
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-brand-text-muted">Subtotal</span>
          <span className="font-semibold text-brand-text-primary">
            {offer.priceLabel}
          </span>
        </div>
        <div className="flex justify-between text-sm border-t border-brand-surface-2 pt-2 mt-2">
          <span className="font-bold text-brand-text-primary">Total</span>
          <span className="font-black text-brand-primary text-base">
            {amountDisplay}
          </span>
        </div>
      </div>

      {/* Stripe card element or free badge */}
      {isPaid ? (
        <div className="mt-1">
          <p className="text-xs font-semibold text-brand-text-primary mb-2 flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5" />
            Card details
          </p>
          <div className="rounded-xl border border-brand-surface-2 p-3 bg-white">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: '14px',
                    color: '#1A0A12',
                    '::placeholder': { color: '#9ca3af' },
                    fontFamily: 'system-ui, sans-serif',
                  },
                  invalid: { color: '#ef4444' },
                },
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-2 rounded-xl bg-green-50 border border-green-100">
          <p className="text-xs font-bold text-green-700">This offer is free</p>
        </div>
      )}

      {/* Slot for Place Order button + errors */}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inner checkout form (needs Stripe context via Elements)
// ---------------------------------------------------------------------------

interface CheckoutFormProps {
  offer: Offer
  clientSecret: string | undefined
  offerId: string
  profile: MeUser | null
}

function CheckoutForm({ offer, clientSecret, offerId, profile }: CheckoutFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const user = getUser()

  const [submitting, setSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const isPaid = offer.price > 0

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<BillingFormValues>({
    resolver: zodResolver(billingSchema),
    defaultValues: {
      firstName: profile ? profile.fullName.split(' ')[0] : '',
      lastName: profile ? profile.fullName.split(' ').slice(1).join(' ') : '',
      email: profile?.email ?? user?.email ?? '',
      phone: profile?.phone ?? '',
      company: profile?.company ?? '',
      country: profile?.country ?? '',
    },
  })

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
          setPaymentError('Card element not ready. Please refresh and try again.')
          setSubmitting(false)
          return
        }

        const { error, paymentIntent } = await stripe.confirmCardPayment(
          clientSecret,
          {
            payment_method: {
              card: cardElement,
              billing_details: {
                name: `${data.firstName} ${data.lastName}`,
                email: data.email,
                phone: data.phone,
              },
            },
          },
        )

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

      toast.success(
        `Order placed! ${offer.pointsCost.toLocaleString()} points deducted.`,
      )
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 max-w-5xl">

        {/* Left: billing details */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl border border-brand-surface-2 bg-white p-6 flex flex-col gap-5"
        >
          <h2 className="text-sm font-bold text-brand-text-primary">
            Billing Details
          </h2>

          {/* Name row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="First Name"
              required
              error={errors.firstName?.message}
            >
              <input
                {...register('firstName')}
                placeholder="Jane"
                className={cn(
                  inputClass,
                  errors.firstName && errorInputClass,
                )}
              />
            </Field>
            <Field
              label="Last Name"
              required
              error={errors.lastName?.message}
            >
              <input
                {...register('lastName')}
                placeholder="Smith"
                className={cn(
                  inputClass,
                  errors.lastName && errorInputClass,
                )}
              />
            </Field>
          </div>

          {/* Company */}
          <Field label="Company Name" error={errors.company?.message}>
            <input
              {...register('company')}
              placeholder="Acme Corp (optional)"
              className={cn(inputClass, errors.company && errorInputClass)}
            />
          </Field>

          {/* Country + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Country / Region"
              required
              error={errors.country?.message}
            >
              <select
                {...register('country')}
                className={cn(
                  inputClass,
                  'cursor-pointer appearance-none',
                  errors.country && errorInputClass,
                )}
              >
                <option value="">Select country…</option>
                {CHECKOUT_COUNTRIES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </Field>
            <Field label="Phone" required error={errors.phone?.message}>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <PhoneField
                    value={field.value}
                    onChange={field.onChange}
                    hasError={!!errors.phone}
                  />
                )}
              />
            </Field>
          </div>

          {/* Email */}
          <Field
            label="Email Address"
            required
            error={errors.email?.message}
          >
            <input
              {...register('email')}
              type="email"
              placeholder="jane@example.com"
              className={cn(inputClass, errors.email && errorInputClass)}
            />
          </Field>

          {/* Order notes */}
          <Field label="Order Notes" error={errors.notes?.message}>
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="Any special instructions… (optional)"
              className={cn(
                inputClass,
                'resize-none',
                errors.notes && errorInputClass,
              )}
            />
          </Field>
        </motion.div>

        {/* Right: order summary */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          <OrderSummary offer={offer} isPaid={isPaid}>
            {/* Payment error */}
            {paymentError && (
              <p className="text-xs text-red-500 mt-1">{paymentError}</p>
            )}

            {/* Place Order button */}
            <button
              type="submit"
              disabled={submitting || (isPaid && (!stripe || !elements || !clientSecret))}
              className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-brand-primary text-white px-5 py-3 text-sm font-bold hover:bg-brand-primary-dark active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing…
                </>
              ) : (
                'Place Order'
              )}
            </button>
          </OrderSummary>
        </motion.div>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Outer page — fetches offer + payment intent, then wraps with Elements
// ---------------------------------------------------------------------------

export default function CheckoutPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : (params.id?.[0] ?? '')

  // 1. Fetch offer
  const {
    data: offer,
    isLoading: offerLoading,
    isError: offerError,
  } = useQuery({
    queryKey: ['offer', id],
    queryFn: () => fetchOffer(id),
    enabled: Boolean(id),
  })

  // 2. Fetch payment intent once we have the offer
  const {
    data: intentData,
    isLoading: intentLoading,
    isError: intentError,
    error: intentQueryError,
  } = useQuery({
    queryKey: ['payment-intent', id],
    queryFn: () => apiCreatePaymentIntent(id),
    enabled: Boolean(offer),
    // Don't retry on error — a failed PI creation means something is wrong
    retry: false,
    staleTime: Infinity,
  })

  // 3. Fetch profile data
  const {
    data: profile = null,
    isLoading: profileLoading,
  } = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{ success: boolean; data: { user: MeUser } }>('/api/auth/me').then(
        (r) => r.data.user,
      ),
  })

  const isLoading = offerLoading || (Boolean(offer) && intentLoading) || profileLoading
  const isError = offerError || intentError

  if (isLoading) return <CheckoutSkeleton />

  if (isError || !offer) {
    const isInsufficientPoints =
      (intentQueryError as { error?: { code?: string } } | null)?.error?.code === 'INSUFFICIENT_POINTS'

    return (
      <DashboardLayout>
        <Link
          href={`/dashboard/offers/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-brand-text-muted hover:text-brand-primary transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to offer
        </Link>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          {isInsufficientPoints ? (
            <>
              <p className="text-brand-text-muted text-sm mb-4">
                You don&apos;t have enough points to redeem this offer.
              </p>
              <Link
                href={`/dashboard/offers/${id}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to offer
              </Link>
            </>
          ) : (
            <>
              <p className="text-brand-text-muted text-sm mb-4">
                We couldn&apos;t load this checkout. Please go back and try again.
              </p>
              <Link
                href={`/dashboard/offers/${id}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to offer
              </Link>
            </>
          )}
        </div>
      </DashboardLayout>
    )
  }

  const clientSecret = intentData?.clientSecret

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
          href={`/dashboard/offers/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-brand-text-muted hover:text-brand-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to offer
        </Link>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="text-2xl font-black text-brand-text-primary mb-8"
      >
        Checkout
      </motion.h1>

      {/* Always wrap in Elements so useStripe/useElements hooks have context.
          For free offers, clientSecret is omitted — CardElement doesn't need it
          in the provider; only confirmCardPayment does, which is already guarded. */}
      <Elements
        stripe={stripePromise}
        options={clientSecret ? { clientSecret } : undefined}
      >
        <CheckoutForm
          offer={offer}
          clientSecret={clientSecret}
          offerId={id}
          profile={profile}
        />
      </Elements>
    </DashboardLayout>
  )
}
