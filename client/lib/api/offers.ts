import { apiFetch } from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'

export interface Offer {
  id: string
  title: string
  slug: string
  category: string
  priceBefore: string | null
  priceLabel: string
  price: number          // USD cents (0 = free)
  pointsCost: number
  imageUrl: string | null
  status: 'published' | 'draft'
  createdAt: string
  updatedAt: string
  timesRedeemed: number  // how many times THIS user has redeemed this offer
}

export interface OffersResponse {
  userPoints: number
  offers: Offer[]
}

const BASE = '/api/offers'

/** Fetches published offers for the landing page — no auth token required. */
export async function fetchPublicOffers(): Promise<Offer[]> {
  const res = await fetch(`${API_BASE}/api/offers/public`)
  if (!res.ok) throw new Error('Failed to fetch offers')
  const json = await res.json() as { success: boolean; data: Offer[] }
  return json.data
}

export async function fetchOffers(): Promise<OffersResponse> {
  const res = await apiFetch<{ success: boolean; data: OffersResponse }>(BASE)
  return res.data
}

export async function fetchOffer(id: string): Promise<Offer> {
  const res = await apiFetch<{ success: boolean; data: Offer }>(`${BASE}/${id}`)
  return res.data
}

export async function apiCreatePaymentIntent(
  id: string,
): Promise<{ clientSecret?: string; free?: boolean }> {
  const res = await apiFetch<{
    success: boolean
    data: { clientSecret?: string; free?: boolean }
  }>(`${BASE}/${id}/payment-intent`, { method: 'POST' })
  return res.data
}

export interface BillingPayload {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  company?: string
  country?: string
  notes?: string
}

export async function apiCompleteOrder(
  id: string,
  paymentIntentId?: string,
  billing?: BillingPayload,
): Promise<{ success: boolean; pointsDeducted: number }> {
  const res = await apiFetch<{
    success: boolean
    data: { success: boolean; pointsDeducted: number }
  }>(`${BASE}/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      paymentIntentId,
      billingFirstName: billing?.firstName,
      billingLastName: billing?.lastName,
      billingEmail: billing?.email,
      billingPhone: billing?.phone,
      billingCompany: billing?.company,
      billingCountry: billing?.country,
      billingNotes: billing?.notes,
    }),
  })
  return res.data
}
