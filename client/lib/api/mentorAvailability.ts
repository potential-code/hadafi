import { apiFetch } from '@/lib/api'

export interface Slot {
  id: string
  startsAt: string
  endsAt: string
  isAvailable: boolean
}

export interface AvailabilityData {
  upcoming: Slot[]
  past: Slot[]
}

export const getMyAvailability = () =>
  apiFetch<AvailabilityData>('/api/mentor/availability')

export const addSlots = (slots: { startsAt: string }[]) =>
  apiFetch<{ slots: Slot[] }>('/api/mentor/availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slots }),
  })

export const deleteSlot = (id: string) =>
  apiFetch<{ ok: boolean }>(`/api/mentor/availability/${id}`, { method: 'DELETE' })

export const bulkDeleteSlots = (ids: string[]) =>
  apiFetch<{ deleted: number; skipped: number }>('/api/mentor/availability/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
