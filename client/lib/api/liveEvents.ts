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

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}/api/live-events`

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('smeep_token')
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

