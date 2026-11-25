// Shared CopilotKit connection settings used by every <CopilotKit> provider
// in the Hadafi dashboard. There are two providers (popup + AI Business
// Assistant page); they share runtime URL, agent and auth headers but use
// different threadIds so their conversations stay isolated.

// The user-facing env var is named NEXT_PUBLIC_AI_BACKEND_URL (kept that way
// to match the backend team's convention even though we're on Vite, not
// Next.js — vite.config.ts widens envPrefix to ["VITE_", "NEXT_PUBLIC_"] so
// import.meta.env exposes it).
const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined) ||
  'http://localhost:8000'

export const COPILOT_RUNTIME_URL = `${AI_BACKEND_URL.replace(/\/$/, '')}/copilotkit`
export const COPILOT_AGENT = 'chatbot'

// LangGraph requires thread_id to be a valid UUID. We generate one per
// conversation surface on first use and persist it in localStorage so the
// thread (and its history) survives reloads. Two surfaces = two UUIDs:
//   - globalThreadId  → dashboard popup
//   - toolsThreadId   → AI Business Assistant page

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Thread IDs are intentionally not persisted. AssistantProvider mounts once
// per dashboard session (Next.js keeps the layout alive across route changes),
// so the React useState value survives navigation. On a full page refresh we
// deliberately want a fresh thread — this prevents "Message not found" errors
// when the LangGraph server restarts and loses its checkpoint state.
export const getDashboardPopupThreadId = () => generateUuid()
// Separate thread for the compact chat card on the Overview/dashboard home page.
// Must be isolated from the popup thread so the two don't mirror each other.
export const getDashboardOverviewThreadId = () => generateUuid()

// Thread ID for the landing page chatbot. Generated once per module load and
// reused for the lifetime of the session (same design choice as dashboard
// threads — not persisted to avoid "Message not found" errors on server restart).
let _landingPageThreadId: string | null = null
export function getLandingPageThreadId(): string {
  if (!_landingPageThreadId) _landingPageThreadId = generateUuid()
  return _landingPageThreadId
}
export function clearLandingPageThreadId(): void {
  _landingPageThreadId = null
}

// Dev JWT priority: NEXT_PUBLIC_COPILOT_JWT env var → localStorage → hardcoded fallback.
// --- Copilot service token --------------------------------------------------
// The AI backend (potential-ai) requires a service JWT on every request — chat
// runs, transcription, TTS, and the voice WebSocket. Logged-in users obtain a
// short-lived token from the Hadafi server (GET /api/account/copilot-token); the
// shared signing secret never reaches the browser. The token is cached in
// localStorage and re-minted shortly before expiry.
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { checkSession, getUser } from '@/lib/auth'

const COPILOT_JWT_KEY = 'hadafi_copilot_jwt'
const COPILOT_JWT_EXP_KEY = 'hadafi_copilot_jwt_exp'
// 'user' (logged-in, per-user claims) or 'guest' (anonymous landing-chat token).
const COPILOT_JWT_KIND_KEY = 'hadafi_copilot_jwt_kind'
// Re-mint well before the recorded expiry so in-flight requests never
// straddle the boundary.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000

/**
 * The account a token was minted for: its `userId` claim (the Hadafi server
 * writes it), or null when absent or unreadable. Read only, never trusted for
 * anything but this local check: potential-ai verifies the signature.
 */
export function tokenUserId(token: string): string | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')))
    return typeof claims?.userId === 'string' ? claims.userId : null
  } catch {
    return null
  }
}

/**
 * Cached, still-valid copilot service JWT — or '' when absent, expired, or
 * minted for someone else. A user token only ever serves the account it names:
 * on a shared browser, signing in as a different person (without signing the
 * first one out) must never run their Hana chats under the first account.
 * A guest token names nobody, so it is safe for anyone.
 */
export function getCopilotJwt(): string {
  if (typeof window === 'undefined') return ''
  try {
    const exp = Number(window.localStorage.getItem(COPILOT_JWT_EXP_KEY) || 0)
    const token = window.localStorage.getItem(COPILOT_JWT_KEY) || ''
    if (!token || Date.now() >= exp - EXPIRY_MARGIN_MS) return ''
    const kind = window.localStorage.getItem(COPILOT_JWT_KIND_KEY)
    if (kind === 'guest') return token
    const owner = tokenUserId(token)
    return owner !== null && owner === getUser()?.id ? token : ''
  } catch {
    return ''
  }
}

let inflightMint: Promise<string | null> | null = null

async function mintFrom(
  endpoint: '/api/account/copilot-token' | '/api/account/copilot-token/guest',
  kind: 'user' | 'guest',
): Promise<string> {
  const res = await apiFetch<{ success: boolean; data: { token: string; expiresAt: number } }>(
    endpoint,
  )
  const { token, expiresAt } = res.data
  try {
    window.localStorage.setItem(COPILOT_JWT_KEY, token)
    window.localStorage.setItem(COPILOT_JWT_EXP_KEY, String(expiresAt))
    window.localStorage.setItem(COPILOT_JWT_KIND_KEY, kind)
  } catch {
    /* noop */
  }
  return token
}

/**
 * Ensure a valid copilot token exists, minting one via the Hadafi server when
 * needed. Logged-in users get a per-user token; anonymous visitors (the public
 * landing chat) get a short-lived guest token.
 *
 * Robustness: a cached signed-in user doesn't prove the session is still
 * valid (it may have ended). If the user-token mint fails (e.g. 401), we fall
 * back to a guest token so the assistant still works instead of breaking —
 * the landing chat must never hard-fail.
 */
// Once per page load, ask the server who is signed in before any cached token
// is used. The cached user can be stale for a moment after another account
// signs in on the same browser; confirming first (checkSession updates the
// cache, which drops a token minted for someone else) closes that window.
let sessionConfirmed: Promise<unknown> | null = null
const confirmSession = () => (sessionConfirmed ??= checkSession().catch(() => null))

export async function ensureCopilotToken(): Promise<string | null> {
  await confirmSession()
  const desiredKind = getUser() ? 'user' : 'guest'
  const cached = getCopilotJwt()
  let cachedKind = ''
  try {
    cachedKind = window.localStorage.getItem(COPILOT_JWT_KIND_KEY) || ''
  } catch {
    /* noop */
  }
  if (cached && cachedKind === desiredKind) return cached
  if (inflightMint) return inflightMint

  inflightMint = (async () => {
    if (desiredKind === 'user') {
      try {
        return await mintFrom('/api/account/copilot-token', 'user')
      } catch (err) {
        // Stale/expired login token — fall back to an anonymous token so the
        // assistant degrades gracefully instead of 401-ing forever.
        console.warn('[copilot] user token mint failed, falling back to guest', err)
      }
    }
    try {
      return await mintFrom('/api/account/copilot-token/guest', 'guest')
    } catch (err) {
      console.warn('[copilot] guest token mint failed', err)
      return null
    }
  })().finally(() => {
    inflightMint = null
  })
  return inflightMint
}

/**
 * True once a valid copilot service token is cached (user or guest, minted on
 * demand). CopilotKit providers gate on this so their very first runtime
 * request already carries the Authorization header. Re-mints shortly before
 * expiry and bumps state so consumers re-render with fresh headers.
 */
export function useCopilotTokenReady(): boolean {
  // Always start un-ready — even when a token is cached — so the first client
  // render matches the server-rendered output (reading localStorage in the
  // initializer caused hydration mismatches on SSR'd pages). The effect flips
  // it immediately when a cached token exists.
  const [version, setVersion] = useState<number>(0)
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const mintAndArm = async () => {
      const token = await ensureCopilotToken()
      if (cancelled) return
      // Two runs can overlap (an auth change during a mint): keep one timer.
      if (timer) clearTimeout(timer)
      if (token) {
        setVersion((v) => v + 1)
        timer = setTimeout(() => void mintAndArm(), msUntilCopilotRefresh())
      } else {
        // Transient failure — retry occasionally.
        timer = setTimeout(() => void mintAndArm(), 60_000)
      }
    }
    // A different account signing in (or out) drops the cached token: mint the
    // new person's own one straight away instead of waiting for the refresh.
    const onAuthChanged = () => {
      if (timer) clearTimeout(timer)
      void mintAndArm()
    }
    void mintAndArm()
    window.addEventListener('hadafi:auth-changed', onAuthChanged)
    // A token potential-ai refused was replaced (see renewCopilotToken):
    // re-render so the providers send the new Authorization header.
    const onRenewed = () => {
      if (!cancelled) setVersion((v) => v + 1)
    }
    window.addEventListener(COPILOT_TOKEN_RENEWED_EVENT, onRenewed)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('hadafi:auth-changed', onAuthChanged)
      window.removeEventListener(COPILOT_TOKEN_RENEWED_EVENT, onRenewed)
    }
  }, [])
  return version > 0
}

export function getCopilotHeaders(): Record<string, string> {
  const token = getCopilotJwt()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Milliseconds until the cached token should be proactively re-minted (i.e.
 * when it enters the expiry margin). Bounded below so a clock-skewed or
 * already-stale value can't produce a hot refresh loop.
 */
export function msUntilCopilotRefresh(): number {
  try {
    const exp = Number(window.localStorage.getItem(COPILOT_JWT_EXP_KEY) || 0)
    return Math.max(30_000, exp - Date.now() - EXPIRY_MARGIN_MS + 5_000)
  } catch {
    return 30_000
  }
}

// --- Refused tokens: re-mint and retry once ----------------------------------
// A cached token can stop being accepted before it expires: the signing secret
// was rotated, or potential-ai started requiring claims an older token lacks.
// Without this, every AI request 401s until the cached token's hour runs out.
// So every request to the AI backend that comes back 401 with one of
// potential-ai's token codes drops the cached token, mints a fresh one (once,
// however many requests failed together), retries that request once with it,
// and tells the CopilotKit providers to re-render with the new header.

/** Fired on window after a refused token was replaced with a fresh one. */
export const COPILOT_TOKEN_RENEWED_EVENT = 'copilot-token-renewed'

/** potential-ai's codes for a token it won't accept (src/lib/serviceToken.ts). */
const REFUSED_TOKEN_CODES = new Set(['auth_invalid', 'auth_expired', 'auth_invalid_claims'])

function aiBackendOrigin(): string | null {
  try {
    return new URL(AI_BACKEND_URL).origin
  } catch {
    return null
  }
}

/** Forget the cached token, so the next ensureCopilotToken() mints a new one. */
export function clearCopilotToken(): void {
  try {
    window.localStorage.removeItem(COPILOT_JWT_KEY)
    window.localStorage.removeItem(COPILOT_JWT_EXP_KEY)
    window.localStorage.removeItem(COPILOT_JWT_KIND_KEY)
  } catch {
    /* noop */
  }
}

let inflightRenew: Promise<string | null> | null = null

/**
 * Replace a token potential-ai refused. `refused` is the token that was sent:
 * if the cache already holds a different one (another request renewed it
 * first), that one is used and nothing is minted.
 */
export function renewCopilotToken(refused: string): Promise<string | null> {
  const current = getCopilotJwt()
  if (current && current !== refused) return Promise.resolve(current)
  if (inflightRenew) return inflightRenew
  inflightRenew = (async () => {
    clearCopilotToken()
    const fresh = await ensureCopilotToken()
    if (fresh && fresh !== refused) {
      try {
        window.dispatchEvent(new Event(COPILOT_TOKEN_RENEWED_EVENT))
      } catch {
        /* noop */
      }
      return fresh
    }
    return null
  })().finally(() => {
    inflightRenew = null
  })
  return inflightRenew
}

function bearerOf(input: RequestInfo | URL, init?: RequestInit): string | null {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const auth = headers.get('Authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : null
}

async function refusedTokenCode(res: Response): Promise<string | null> {
  if (res.status !== 401) return null
  try {
    const body = (await res.clone().json()) as { error?: { code?: unknown } } | null
    const code = body?.error?.code
    return typeof code === 'string' && REFUSED_TOKEN_CODES.has(code) ? code : null
  } catch {
    return null
  }
}

/**
 * Wrap fetch so AI-backend requests recover from a refused token. Only
 * requests to the AI backend's origin that carried a Bearer token are touched;
 * everything else passes straight through. A request is retried at most once,
 * and only when its body can be sent again (a string, form or blob — not a
 * stream); otherwise the fresh token still serves the next request.
 */
export function installCopilotAuthRetry(target: { fetch: typeof fetch } = globalThis): void {
  const origin = aiBackendOrigin()
  const marked = target as { fetch: typeof fetch; __copilotAuthRetry?: boolean }
  if (!origin || marked.__copilotAuthRetry || typeof target.fetch !== 'function') return
  const send = target.fetch.bind(target)
  marked.__copilotAuthRetry = true
  const retrying = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: URL | null = null
    try {
      url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
    } catch {
      /* not a URL we can read: pass through */
    }
    const sent = url?.origin === origin ? bearerOf(input, init) : null
    if (!sent) return send(input, init)

    // A Request's body can be read only once: keep a copy for the retry.
    const spare = input instanceof Request && !input.bodyUsed ? input.clone() : null
    const res = await send(input, init)
    if (!(await refusedTokenCode(res))) return res

    const fresh = await renewCopilotToken(sent)
    if (!fresh) return res
    if (init?.body instanceof ReadableStream) return res
    if (input instanceof Request && !spare) return res

    const headers = new Headers(init?.headers ?? (spare ? spare.headers : undefined))
    headers.set('Authorization', `Bearer ${fresh}`)
    return spare ? send(new Request(spare, { ...init, headers })) : send(input, { ...init, headers })
  }
  // Keep anything the runtime hangs on fetch itself (e.g. fetch.preconnect).
  target.fetch = Object.assign(retrying, target.fetch) as typeof fetch
}

if (typeof window !== 'undefined') installCopilotAuthRetry()
