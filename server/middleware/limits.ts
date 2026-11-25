import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit'
import type { Request, RequestHandler } from 'express'

export const MINUTE = 60 * 1000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

const tooMany = (message: string) => ({
  success: false,
  error: { message, code: 'RATE_LIMITED' },
})

/**
 * Limits one signed-in user (falls back to the visitor's address). Mount after
 * `authenticate`. Counts live in memory: Hadafi runs a single API container,
 * and a restart only resets the counters.
 */
export function perUser(
  name: string,
  windowMs: number,
  max: number,
  message = 'You are doing that too often. Please try again later.',
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req: Request) => `${name}:${req.user?.userId ?? ipKeyGenerator(req.ip ?? '')}`,
    message: tooMany(message),
  })
}

/**
 * Limits one visitor address, for public routes anyone can call (a form that
 * sends an email to the address typed in, say). Behind the proxy, req.ip is
 * the visitor's own address (trust proxy in index.ts); IPv6 addresses count
 * per /56 network, so one machine can't rotate through its own range.
 */
export function perIp(
  name: string,
  windowMs: number,
  max: number,
  message = 'Too many requests, please try again later.',
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req: Request) => `${name}:${ipKeyGenerator(req.ip ?? '')}`,
    message: tooMany(message),
  })
}

// Per-email limits on sign-in codes and passwords are counted in the database
// by Better Auth hooks (server/auth/emailLimits.ts), not here.

// ── Operator keys (Maya, the AI operator) ────────────────────────────────────

/**
 * Applies `limiters` to operator-key callers only; admin sessions pass
 * straight through. Must come after authenticate(). The test suite fires many
 * requests from one process, so NODE_ENV=test lifts these caps unless a test
 * sets HADAFI_RATE_LIMITS=on.
 */
export function forOperatorKeys(limiters: RequestHandler[]): RequestHandler[] {
  return limiters.map((limit): RequestHandler => (req, res, next) => {
    const off = process.env['NODE_ENV'] === 'test' && process.env['HADAFI_RATE_LIMITS'] !== 'on'
    if (off || req.user?.via !== 'operator_key') {
      next()
      return
    }
    void limit(req, res, next)
  })
}

/**
 * POST /api/admin/announcements with an operator key: an announcement reaches
 * a whole audience (banner, bell and email), so a key gets a small budget per
 * service user, whichever key it uses. Every attempt counts, valid or not.
 */
export const OPERATOR_ANNOUNCEMENT_LIMITS = { perHour: 3, perDay: 10 } as const

export const operatorAnnouncementLimit = forOperatorKeys([
  perUser('operator-announcement:w', HOUR, OPERATOR_ANNOUNCEMENT_LIMITS.perHour),
  perUser('operator-announcement:d', DAY, OPERATOR_ANNOUNCEMENT_LIMITS.perDay, "You've reached today's limit for this. Please try again tomorrow."),
])
