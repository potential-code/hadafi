import { apiFetch } from '@/lib/api'

export interface AdminOffer {
  id: string
  title: string
  slug: string
  category: string
  priceBefore: string | null
  priceLabel: string
  price: number        // USD cents
  pointsCost: number
  imageUrl: string | null
  status: 'published' | 'draft'
  createdAt: string
  updatedAt: string
  redemptionCount: number  // total redemptions across all users
}

export interface CreateOfferDto {
  title: string
  category: string
  priceBefore?: string
  priceLabel: string
  price: number        // USD cents (e.g., 2500 = $25.00)
  pointsCost: number
  imageUrl?: string
  status: 'published' | 'draft'
}

export type UpdateOfferDto = Partial<CreateOfferDto>

const BASE = '/api/admin/offers'

export const fetchAdminOffers = () =>
  apiFetch<{ success: boolean; data: AdminOffer[] }>(BASE).then(r => r.data)

export const apiCreateOffer = (dto: CreateOfferDto) =>
  apiFetch<{ success: boolean; data: AdminOffer }>(BASE, {
    method: 'POST',
    body: JSON.stringify(dto),
  }).then(r => r.data)

export const apiUpdateOffer = (id: string, dto: UpdateOfferDto) =>
  apiFetch<{ success: boolean; data: AdminOffer }>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  }).then(r => r.data)

export const apiDeleteOffer = (id: string) =>
  apiFetch<{ success: boolean; data: { success: boolean } }>(`${BASE}/${id}`, {
    method: 'DELETE',
  }).then(r => r.data)
