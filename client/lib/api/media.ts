// Same-origin: next.config.ts forwards /api to the API server, and the
// httpOnly session cookie rides along.
const BASE = '/api/media'

/** The server's error message, or a plain fallback for this status. */
function messageFrom(status: number, body: unknown): string {
  const m = (body as { error?: { message?: unknown } } | null)?.error?.message
  if (typeof m === 'string' && m.trim()) return m
  if (status === 413) return 'That file is too large. Each file must be 50 MB or smaller.'
  if (status === 401 || status === 403) return 'Your session has ended. Sign in again and retry.'
  return 'Something went wrong on our side. Please try again.'
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(messageFrom(res.status, body))
  }
  const data = await res.json()
  return data.data
}

export type MediaFile = {
  id: string
  originalName: string
  storedName: string
  mimeType: string
  size: number
  path: string
  uploadedBy: string
  createdAt: string
}

export const fetchMediaFiles = () => apiFetch<MediaFile[]>('/')

export const deleteMediaFile = (id: string) =>
  apiFetch<void>(`/${id}`, { method: 'DELETE' })

export const bulkDeleteMediaFiles = (ids: string[]) =>
  apiFetch<void>('/', { method: 'DELETE', body: JSON.stringify({ ids }) })

export function uploadMediaFile(
  file: File,
  onProgress: (pct: number) => void,
): Promise<MediaFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('files', file)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const body = JSON.parse(xhr.responseText)
        resolve(body.data[0] as MediaFile)
      } else {
        let body: unknown = null
        try {
          body = JSON.parse(xhr.responseText)
        } catch {
          /* not JSON (e.g. a proxy's error page) */
        }
        reject(new Error(messageFrom(xhr.status, body)))
      }
    }

    xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'))

    xhr.open('POST', `${BASE}/upload`)
    xhr.send(formData)
  })
}
