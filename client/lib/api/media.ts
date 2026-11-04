// Same-origin: next.config.ts forwards /api to the API server, and the
// httpOnly session cookie rides along.
const BASE = '/api/media'

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
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `HTTP ${res.status}`)
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
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('Network error during upload'))

    xhr.open('POST', `${BASE}/upload`)
    xhr.send(formData)
  })
}
