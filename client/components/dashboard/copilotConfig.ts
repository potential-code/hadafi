// Shared CopilotKit connection settings used by every <CopilotKit> provider
// in the SMEEP dashboard. There are two providers (popup + AI Business
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
// short-lived token from the smeep server (GET /api/auth/copilot-token); the
// shared signing secret never reaches the browser. The token is cached in
// localStorage and re-minted shortly before expiry.
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { getToken } from '@/lib/auth'

const COPILOT_JWT_KEY = 'smeep_copilot_jwt'
const COPILOT_JWT_EXP_KEY = 'smeep_copilot_jwt_exp'
// 'user' (logged-in, per-user claims) or 'guest' (anonymous landing-chat token).
const COPILOT_JWT_KIND_KEY = 'smeep_copilot_jwt_kind'
// Re-mint well before the recorded expiry so in-flight requests never
// straddle the boundary.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000

/** Cached, still-valid copilot service JWT — or '' when absent/expired. */
export function getCopilotJwt(): string {
  if (typeof window === 'undefined') return ''
  try {
    const exp = Number(window.localStorage.getItem(COPILOT_JWT_EXP_KEY) || 0)
    if (Date.now() < exp - EXPIRY_MARGIN_MS) {
      return window.localStorage.getItem(COPILOT_JWT_KEY) || ''
    }
  } catch {
    /* noop */
  }
  return ''
}

let inflightMint: Promise<string | null> | null = null

async function mintFrom(
  endpoint: '/api/auth/copilot-token' | '/api/auth/copilot-token/guest',
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
 * Ensure a valid copilot token exists, minting one via the smeep server when
 * needed. Logged-in users get a per-user token; anonymous visitors (the public
 * landing chat) get a short-lived guest token.
 *
 * Robustness: a `smeep_token` lingering in localStorage doesn't mean the
 * session is still valid (it may be expired). If the user-token mint fails
 * (e.g. 401 on a stale session), we fall back to a guest token so the assistant
 * still works instead of breaking — the landing chat must never hard-fail.
 */
export function ensureCopilotToken(): Promise<string | null> {
  const desiredKind = getToken() ? 'user' : 'guest'
  const cached = getCopilotJwt()
  let cachedKind = ''
  try {
    cachedKind = window.localStorage.getItem(COPILOT_JWT_KIND_KEY) || ''
  } catch {
    /* noop */
  }
  if (cached && cachedKind === desiredKind) return Promise.resolve(cached)
  if (inflightMint) return inflightMint

  inflightMint = (async () => {
    if (desiredKind === 'user') {
      try {
        return await mintFrom('/api/auth/copilot-token', 'user')
      } catch (err) {
        // Stale/expired login token — fall back to an anonymous token so the
        // assistant degrades gracefully instead of 401-ing forever.
        console.warn('[copilot] user token mint failed, falling back to guest', err)
      }
    }
    try {
      return await mintFrom('/api/auth/copilot-token/guest', 'guest')
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
      if (token) {
        setVersion((v) => v + 1)
        timer = setTimeout(() => void mintAndArm(), msUntilCopilotRefresh())
      } else {
        // Transient failure — retry occasionally.
        timer = setTimeout(() => void mintAndArm(), 60_000)
      }
    }
    void mintAndArm()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
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
