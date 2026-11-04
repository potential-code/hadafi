export type LiveEvent = {
  id: string
  title: string
  description: string | null
  type: string
  track: string | null
  date: string                   // ISO 'YYYY-MM-DD'
  time: string
  meetingLink: string | null
  recordingLink: string | null
  coverImage: string | null
  status: 'draft' | 'published'
  createdBy: string | null
  createdAt: string
  updatedAt: string
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

export const fetchPublishedEvents = () => apiFetch<LiveEvent[]>('/')
export const fetchAdminEvents = () => apiFetch<LiveEvent[]>('/admin')
export const apiCreateEvent = (data: Partial<LiveEvent>) =>
  apiFetch<LiveEvent>('/', { method: 'POST', body: JSON.stringify(data) })
export const apiUpdateEvent = (id: string, data: Partial<LiveEvent>) =>
  apiFetch<LiveEvent>(`/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const apiDeleteEvent = (id: string) =>
  apiFetch<{ ok: boolean }>(`/${id}`, { method: 'DELETE' })

