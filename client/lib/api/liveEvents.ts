export type EventFormat = 'zoom' | 'link' | 'in_person'

/**
 * A live event as the public and learners see it. `meetingLink` (and the Zoom
 * meeting ID and passcode) are only ever set for a learner who booked, from an
 * hour before the start; for Zoom events the link is her own.
 */
export type LiveEvent = {
  id: string
  title: string
  description: string | null
  type: string
  /** Display copies in the event's time zone, kept for older readers. Prefer startsAt. */
  date: string
  time: string
  startsAt: string
  endsAt: string
  /** IANA zone the event was scheduled in. */
  timezone: string
  format: EventFormat
  location: string | null
  meetingLink: string | null
  recordingLink: string | null
  coverImage: string | null
  status: 'draft' | 'published'
  /** Places available; null means no limit. */
  capacity: number | null
  /** From Zoom: the host started / ended the meeting. */
  startedAt: string | null
  endedAt: string | null
  // Learner fields (GET /mine)
  booked?: boolean
  bookedAt?: string | null
  spotsLeft?: number | null
  full?: boolean
  joinOpensAt?: string | null
  joinPending?: boolean
  meetingId?: string | null
  passcode?: string | null
}

export type ZoomStatus = 'not_required' | 'pending' | 'active' | 'failed'

export type AdminLiveEvent = LiveEvent & {
  createdAt: string
  updatedAt: string
  durationMinutes: number
  /** The start as entered, in `timezone`. */
  startDate: string
  startTime: string
  /** The free-text time from before real times, if any. */
  legacyTime: string | null
  /** The old time couldn't be read: an admin should set it. */
  timeNeedsReview: boolean
  bookings: number
  attended: number
  zoom: {
    status: ZoomStatus
    error: string | null
    meetingId: string | null
    passcode: string | null
    joinUrl: string | null
    syncedAt: string | null
    attendanceSyncedAt: string | null
  }
}

export type EventInput = {
  title: string
  description?: string | null
  type?: string
  startDate: string
  startTime: string
  timezone: string
  durationMinutes: number
  capacity?: number | null
  format: EventFormat
  meetingLink?: string | null
  location?: string | null
  recordingLink?: string | null
  coverImage?: string | null
  status?: 'draft' | 'published'
}

export type EventBooking = {
  userId: string
  fullName: string
  email: string
  company: string | null
  bookedAt: string
  zoomStatus: string
  attendedMinutes: number | null
}

// Same-origin: next.config.ts forwards /api to the API server, and the
// httpOnly session cookie rides along.
const BASE = '/api/live-events'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let body: unknown
    try { body = await res.json() } catch { body = { error: { message: 'Request failed' } } }
    throw body
  }
  return ((await res.json()) as { data: T }).data
}

/** Published events without links (signed out, the homepage). */
export const fetchPublishedEvents = () => apiFetch<LiveEvent[]>('/')
/** Published events with the learner's own booking and, near the start, how to join. */
export const fetchMyEvents = () => apiFetch<LiveEvent[]>('/mine')
export const apiBookEvent = (id: string) => apiFetch<LiveEvent>(`/${id}/rsvp`, { method: 'POST' })
export const apiCancelBooking = (id: string) => apiFetch<LiveEvent>(`/${id}/rsvp`, { method: 'DELETE' })

export const fetchAdminEvents = () => apiFetch<AdminLiveEvent[]>('/admin')
export const fetchZoomInfo = () => apiFetch<{ configured: boolean; mock: boolean }>('/admin/zoom')
export const apiCreateEvent = (data: EventInput) => apiFetch<AdminLiveEvent>('/', { method: 'POST', body: JSON.stringify(data) })
export const apiUpdateEvent = (id: string, data: Partial<EventInput>) =>
  apiFetch<AdminLiveEvent>(`/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const apiDeleteEvent = (id: string) => apiFetch<{ ok: boolean }>(`/${id}`, { method: 'DELETE' })
export const fetchEventBookings = (id: string) =>
  apiFetch<{ bookings: EventBooking[]; guests: { name: string; email: string | null; minutes: number }[] }>(`/${id}/bookings`)
export const apiResyncZoom = (id: string) => apiFetch<AdminLiveEvent>(`/${id}/zoom/resync`, { method: 'POST' })
export const fetchHostStartUrl = (id: string) => apiFetch<{ url: string }>(`/${id}/zoom/start-url`)
