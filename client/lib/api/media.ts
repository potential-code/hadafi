const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}/api/media`

function getToken(): string | null {
  return localStorage.getItem('smeep_token')
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

    const token = getToken()
    xhr.open('POST', `${BASE}/upload`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  })
}
