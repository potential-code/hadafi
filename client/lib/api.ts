import { getToken } from './auth'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'

/**
 * Thin fetch wrapper that:
 * - Prepends the API base URL
 * - Attaches Authorization: Bearer <token> when a token exists
 * - Throws the parsed JSON error body on non-2xx responses
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    // Throw the parsed error body so callers can inspect error.code etc.
    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = { error: res.statusText }
    }
    throw body
  }

  return res.json() as Promise<T>
}
