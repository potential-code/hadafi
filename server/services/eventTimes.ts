/**
 * Event times: real instants in, display copies out.
 *
 * Admins enter a day and a wall-clock time in a chosen time zone (UAE time by
 * default). The server turns that into an instant (`startsAt`), and writes
 * the old display columns (`date`, `time`) from it, so older readers keep
 * working. `legacyStart` reads the free-text times Hadafi used before (the
 * same rules as the event_times migration's backfill).
 */

export const DEFAULT_TIMEZONE = 'Asia/Dubai'

/** Zones admins can pick; anything else valid in Intl is accepted too. */
export const COMMON_TIMEZONES = [
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Qatar',
  'Asia/Bahrain',
  'Asia/Kuwait',
  'Asia/Muscat',
  'Africa/Cairo',
  'Asia/Amman',
  'Asia/Beirut',
  'Africa/Casablanca',
  'Europe/London',
  'UTC',
] as const

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The zone's offset from UTC at `at`, in minutes (Dubai: +240). */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
}

/**
 * '2026-11-10' + '17:30' in 'Asia/Dubai' → the instant. Null when the day or
 * time isn't real. Daylight-saving gaps resolve to the later side.
 */
export function zonedToInstant(day: string, hhmm: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!d || !t || !isValidTimezone(timeZone)) return null
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])]
  if (h > 23 || mi > 59) return null
  const guess = Date.UTC(y, mo - 1, da, h, mi)
  const check = new Date(guess)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da) return null
  // Two passes settle the offset across a DST change.
  let at = guess - offsetMinutes(new Date(guess), timeZone) * 60_000
  at = guess - offsetMinutes(new Date(at), timeZone) * 60_000
  return new Date(at)
}

/** The day and time an instant shows in a zone: { day: '2026-11-10', time: '17:30' }. */
export function instantToZoned(at: Date, timeZone: string): { day: string; time: string } {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
  return { day, time }
}

/** A short zone name: 'GST', 'GMT+3', 'GMT'. */
function zoneName(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? timeZone
}

/** Display copies for the old columns: '2026-11-10' and '5:30 PM GST (UAE time)'. */
export function displayCopies(startsAt: Date, timeZone = DEFAULT_TIMEZONE): { date: string; time: string } {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(startsAt)
  const clock = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(startsAt)
  const zone = timeZone === 'Asia/Dubai' ? 'GST (UAE time)' : zoneName(startsAt, timeZone)
  return { date, time: `${clock} ${zone}` }
}

const OTHER_ZONE = /\b(EST|EDT|PST|PDT|CST|CDT|MST|MDT|GMT|UTC|BST|CET|CEST|EET|KSA|AST|IST|WAT|EAT|PKT|Riyadh|Cairo|London)\b/i

/**
 * Reads an old date and free-text time ('5:00 PM / GST - UAE time', '5 pm',
 * '17:00') as UAE time. Unreadable times (or other named zones) give noon
 * with `needsReview`, so nothing is lost and an admin can fix it.
 */
export function legacyStart(date: string, time: string | null | undefined): { startsAt: Date; needsReview: boolean } | null {
  const text = time ?? ''
  let hh = 12
  let mi = 0
  let ok = true
  const ap = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m/i.exec(text)
  const hm = /(\d{1,2}):(\d{2})/.exec(text)
  if (ap && Number(ap[1]) >= 1 && Number(ap[1]) <= 12 && Number(ap[2] ?? '0') < 60) {
    hh = (Number(ap[1]) % 12) + (ap[3]!.toLowerCase() === 'p' ? 12 : 0)
    mi = Number(ap[2] ?? '0')
  } else if (hm && Number(hm[1]) < 24 && Number(hm[2]) < 60) {
    hh = Number(hm[1])
    mi = Number(hm[2])
  } else {
    ok = false
  }
  if (OTHER_ZONE.test(text)) ok = false
  const startsAt = zonedToInstant(date, `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, DEFAULT_TIMEZONE)
  return startsAt ? { startsAt, needsReview: !ok } : null
}
