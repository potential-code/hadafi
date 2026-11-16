/**
 * The visitor's cookie choice, kept in this browser only (localStorage).
 * It is asked again after 12 months, or when CONSENT_VERSION goes up (bump it
 * when the banner's wording or what we measure changes).
 */
export type CookieChoice = 'accepted' | 'rejected'

export const CONSENT_KEY = 'hadafi.cookieConsent'
export const CONSENT_VERSION = 1
const MAX_AGE_MONTHS = 12

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface Stored {
  choice: CookieChoice
  version: number
  date: string
}

/** The stored choice, or null when there is none or it has to be asked again. */
export function readChoice(storage: KeyValueStorage | null | undefined, now: Date = new Date()): CookieChoice | null {
  let raw: string | null
  try {
    raw = storage?.getItem(CONSENT_KEY) ?? null
  } catch {
    return null // storage blocked: ask (and keep consent denied)
  }
  if (!raw) return null
  let s: Partial<Stored>
  try {
    s = JSON.parse(raw)
  } catch {
    return null
  }
  if (!s || (s.choice !== 'accepted' && s.choice !== 'rejected')) return null
  if (s.version !== CONSENT_VERSION) return null
  const date = new Date(typeof s.date === 'string' ? s.date : NaN)
  if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime()) return null
  const expires = new Date(date)
  expires.setUTCMonth(expires.getUTCMonth() + MAX_AGE_MONTHS)
  return now.getTime() < expires.getTime() ? s.choice : null
}

export function saveChoice(storage: KeyValueStorage | null | undefined, choice: CookieChoice, now: Date = new Date()): void {
  const value: Stored = { choice, version: CONSENT_VERSION, date: now.toISOString() }
  try {
    storage?.setItem(CONSENT_KEY, JSON.stringify(value))
  } catch {
    /* private mode: applies to this page only, asked again next visit */
  }
}
