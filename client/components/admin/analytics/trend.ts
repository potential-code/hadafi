import type { AnalyticsRange } from '@/lib/api/adminAnalytics'

/**
 * Helpers that turn the sparse analytics trend responses (the API only returns
 * buckets that have rows) into a continuous series for the selected range.
 *
 * Server labels: monthly `TO_CHAR(.., 'Mon ''YY')` ("Jun '26"), daily
 * `TO_CHAR(.., 'DD Mon')` ("01 Oct").
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface Bucket {
  /** Matches the server label. */
  key: string
  /** Short axis label ("Jun", "29 Sep"). */
  short: string
  /** Full label for tooltips ("Jun 2026", "29 Sep 2026"). */
  full: string
}

export const RANGE_WORDS: Record<AnalyticsRange, string> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '12m': 'last 12 months',
}

export function isMonthly(range: AnalyticsRange) {
  return range === '12m'
}

/** Every bucket from the range start (as the server computes it) to today. */
export function rangeBuckets(range: AnalyticsRange, now = new Date()): Bucket[] {
  const out: Bucket[] = []
  if (range === '12m') {
    for (let i = 12; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mon = MONTHS[d.getMonth()]
      out.push({ key: `${mon} '${String(d.getFullYear()).slice(2)}`, short: mon, full: `${mon} ${d.getFullYear()}` })
    }
    return out
  }
  const days = range === '7d' ? 7 : 30
  for (let i = days; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const mon = MONTHS[d.getMonth()]
    out.push({
      key: `${String(d.getDate()).padStart(2, '0')} ${mon}`,
      short: `${d.getDate()} ${mon}`,
      full: `${d.getDate()} ${mon} ${d.getFullYear()}`,
    })
  }
  return out
}

/**
 * Spread sparse `{ label, ...values }` rows over the full range. The extra
 * leading bucket (the range starts part way through it) is dropped when empty
 * so the chart shows exactly 12 months / 7 days / 30 days.
 * Falls back to the raw rows if the server used labels we don't recognize.
 */
export function fillSeries<T extends { label: string }, K extends keyof T & string>(
  range: AnalyticsRange,
  rows: T[],
  keys: K[],
): (Bucket & Record<K, number>)[] {
  const buckets = rangeBuckets(range)
  const byKey = new Map(rows.map((r) => [r.label, r]))
  const known = new Set(buckets.map((b) => b.key))
  if (rows.some((r) => !known.has(r.label))) {
    return rows.map((r) => ({
      key: r.label,
      short: r.label,
      full: r.label,
      ...(Object.fromEntries(keys.map((k) => [k, Number(r[k]) || 0])) as Record<K, number>),
    }))
  }
  const filled = buckets.map((b) => {
    const row = byKey.get(b.key)
    return { ...b, ...(Object.fromEntries(keys.map((k) => [k, row ? Number(row[k]) || 0 : 0])) as Record<K, number>) }
  })
  const first = filled[0]
  if (first && keys.every((k) => first[k] === 0)) filled.shift()
  return filled
}

/** Round a maximum up to a tidy axis top (1, 2, 2.5, 5, 10 x 10^n). */
export function niceMax(n: number) {
  if (n <= 0) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(n)))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const m = step * pow
    if (m >= n) return m
  }
  return 10 * pow
}

/** Axis top for whole-number counts: tidy, at least 2, and even so the midpoint tick is a whole number. */
export function countAxisMax(n: number) {
  const m = Math.max(2, niceMax(n))
  return Number.isInteger(m / 2) ? m : Math.ceil(m / 2) * 2
}
