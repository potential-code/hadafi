/**
 * The server's own error message, in plain words, from whatever an API helper
 * threw: the `{ error: { message } }` body, an older `{ message }` body, or an
 * Error. Falls back to `fallback` (never a status code or "Request failed").
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as { error?: unknown; message?: unknown }
    if (e.error && typeof e.error === 'object') {
      const m = (e.error as { message?: unknown }).message
      if (typeof m === 'string' && m.trim()) return m
    }
    if (typeof e.error === 'string' && e.error.trim() && !/^(bad request|internal server error|request failed)$/i.test(e.error)) return e.error
    if (typeof e.message === 'string' && e.message.trim() && !/^(HTTP \d+|request failed)/i.test(e.message)) return e.message
  }
  return fallback
}
