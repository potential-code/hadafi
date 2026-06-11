// ---------------------------------------------------------------------------
// Token + user storage keys
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'smeep_token'
const USER_KEY = 'smeep_user'

// ---------------------------------------------------------------------------
// Public user shape (matches what the API returns)
// ---------------------------------------------------------------------------

export type User = {
  id: string
  fullName: string
  email: string
  role: 'sme' | 'mentor' | 'admin'
  country: string | null
}

// ---------------------------------------------------------------------------
// Core auth helpers
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function setAuth(token: string, user: User): void {
  window.localStorage.setItem(TOKEN_KEY, token)
  window.localStorage.setItem(USER_KEY, JSON.stringify(user))
  // Mirror cookie so Next.js middleware can read it for role-based routing.
  // Not httpOnly — intentional: we need client-side access via document.cookie.
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=43200; SameSite=Lax`
  window.dispatchEvent(new Event('smeep:auth-changed'))
}

export function clearAuth(): void {
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`
  window.dispatchEvent(new Event('smeep:auth-changed'))
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

// ---------------------------------------------------------------------------
// Legacy shims — used by components that haven't been migrated yet.
// These will be removed as each consuming component is updated.
// ---------------------------------------------------------------------------

/** @deprecated Use getUser() */
export type Profile = {
  fullName: string
  email: string
  bio: string
  country: string
  phone: string
  company: string
  role: string
  joinedAt: number
  avatar: string
}

const FALLBACK_PROFILE: Profile = {
  fullName: 'User',
  email: '',
  bio: '',
  country: '',
  phone: '',
  company: '',
  role: 'sme',
  joinedAt: Date.now(),
  avatar: '',
}

/** @deprecated Use getUser() */
export function getProfile(): Profile {
  if (typeof window === 'undefined') return FALLBACK_PROFILE
  const user = getUser()
  if (!user) return FALLBACK_PROFILE
  return {
    fullName: user.fullName,
    email: user.email,
    bio: '',
    country: user.country ?? '',
    phone: '',
    company: '',
    role: user.role,
    joinedAt: Date.now(),
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.fullName)}&backgroundColor=9f2063&fontSize=42&radius=50`,
  }
}

/** @deprecated Local profile editing will be replaced with API calls */
export function saveProfile(p: Partial<Profile>): Profile {
  // No-op shim — profile updates will go through the API in a future task.
  const current = getProfile()
  return { ...current, ...p }
}

/** @deprecated Use clearAuth() */
export function clearSession(): void {
  clearAuth()
}

/** @deprecated Use setAuth() after a real API login call */
export function signInMock(email?: string, fullName?: string): void {
  // This shim is intentionally a no-op. Real auth goes through setAuth().
  // It exists only so components can be migrated incrementally.
  void email
  void fullName
}

/** @deprecated Use isAuthenticated() + getUser() */
export type Session = { email: string; signedInAt: number }

/** @deprecated Use isAuthenticated() */
export function getSession(): Session | null {
  const user = getUser()
  if (!user) return null
  return { email: user.email, signedInAt: Date.now() }
}

/** @deprecated Use setAuth() */
export function setSession(_session: Session): void {
  // no-op shim
}
