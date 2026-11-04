import { authClient } from './authClient'

// The session lives in an httpOnly cookie (Better Auth). This module keeps a
// small, non-secret copy of the signed-in user in localStorage so the shell
// can render the name and role instantly; the server stays the authority.

const USER_KEY = 'hadafi_user'

export type User = {
  id: string
  fullName: string
  email: string
  role: 'sme' | 'mentor' | 'admin' | 'partner'
  country: string | null
}

/** Better Auth's user (name, role, country…) as the app's User. */
export function toUser(u: { id: string; name: string; email: string; role?: string | null; country?: string | null }): User {
  const role = u.role === 'admin' || u.role === 'mentor' || u.role === 'partner' ? u.role : 'sme'
  return { id: u.id, fullName: u.name, email: u.email, role, country: u.country ?? null }
}

/** The cached signed-in user, or null. Use refreshUser() to confirm with the server. */
export function getUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

/** Stores (or clears) the cached user and tells the app it changed. */
export function cacheUser(user: User | null): void {
  try {
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user))
    else window.localStorage.removeItem(USER_KEY)
    // The pre-Better-Auth login token (localStorage + a readable cookie) is
    // never used now; don't leave it lying around in this browser.
    if (window.localStorage.getItem('hadafi_token')) {
      window.localStorage.removeItem('hadafi_token')
      document.cookie = 'hadafi_token=; path=/; max-age=0'
    }
  } catch {
    // storage unavailable: the shell falls back to the session fetch
  }
  window.dispatchEvent(new Event('hadafi:auth-changed'))
}

/** Asks the server for the current session and refreshes the cache. */
export async function refreshUser(): Promise<User | null> {
  const { data } = await authClient.getSession({ query: {} })
  const user = data?.user ? toUser(data.user as Parameters<typeof toUser>[0]) : null
  cacheUser(user)
  return user
}

/**
 * Like refreshUser, but tells "no session" apart from "couldn't ask": `ok` is
 * false when the server errored (restart, 502), so callers keep the user
 * signed in and try again instead of treating an outage as a sign-out.
 */
export async function checkSession(): Promise<{ ok: boolean; user: User | null }> {
  const { data, error } = await authClient.getSession({ query: {} })
  if (error) return { ok: false, user: getUser() }
  const user = data?.user ? toUser(data.user as Parameters<typeof toUser>[0]) : null
  cacheUser(user)
  return { ok: true, user }
}

/** Forgets everything this browser holds for the signed-in user. */
export function clearAuth(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      // The AI chat token, and the pre-Better-Auth login token if one is left.
      if (key.startsWith('hadafi_copilot_jwt') || key === 'hadafi_token') {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    // storage unavailable
  }
  // The pre-Better-Auth proxy cookie, if this browser still has one.
  document.cookie = 'hadafi_token=; path=/; max-age=0'
  cacheUser(null)
}

/** Ends the session on the server, then clears this browser. */
export async function signOut(): Promise<void> {
  try {
    await authClient.signOut({})
  } finally {
    clearAuth()
  }
}

/** Where each role lands after signing in. */
export function homeFor(role: User['role']): string {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'mentor') return '/mentor/dashboard'
  if (role === 'partner') return '/partner'
  return '/dashboard'
}

/**
 * Changes the signed-in user's password and signs out their other devices.
 * Rejects with the API error shape the profile pages already read:
 * `{ error: { code, message } }` (INVALID_PASSWORD for a wrong current one).
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
  if (error) {
    throw {
      error: {
        code: error.code === 'CREDENTIAL_ACCOUNT_NOT_FOUND' ? 'PASSWORD_NOT_SET' : (error.code ?? 'UNKNOWN'),
        message: error.code === 'CREDENTIAL_ACCOUNT_NOT_FOUND' ? 'Set a password first.' : (error.message ?? 'Could not update your password'),
      },
    }
  }
}

/**
 * Adds a first password to an account that so far signs in only by email code.
 * Passwords are optional; this just gives people a second way to sign in.
 */
export async function setFirstPassword(password: string): Promise<void> {
  const res = await fetch('/api/account/set-password', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, confirm: password }),
  })
  if (res.ok) return
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
  const code = body?.error?.code ?? 'UNKNOWN'
  throw {
    error: {
      code,
      message:
        code === 'SESSION_NOT_FRESH'
          ? 'For your security, sign out and sign in again, then set your password.'
          : (body?.error?.message ?? 'Could not set your password'),
    },
  }
}

/** Updates just the cached user's name after a profile edit. */
export function renameCachedUser(fullName: string): void {
  const current = getUser()
  if (current) cacheUser({ ...current, fullName })
}
