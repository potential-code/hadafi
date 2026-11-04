/**
 * API requests are same-origin: next.config.ts forwards /api/* and /uploads/*
 * to the API server, so the httpOnly session cookie rides along.
 */
export const API_BASE = ''

/**
 * Thin fetch wrapper that:
 * - Sends the request same-origin (the browser attaches the session cookie)
 * - Throws the parsed JSON error body on non-2xx responses
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
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
